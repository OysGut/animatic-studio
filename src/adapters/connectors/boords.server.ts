/**
 * C-4 Boords: HTTP-klient med kø og tilbakeoff, og synkroniseringsmotoren. BARE PÅ SERVEREN.
 *
 * - Nøkkelen sendes bare i X-API-KEY mot Boords. Den logges aldri, legges aldri i feilmeldinger og
 *   returneres aldri (feil vaskes med scrub()).
 * - Kø: høyst 120 kall per glidende minutt; 429 venter Retry-After (eller eksponentiell tilbakeoff) og
 *   prøver igjen høyst BOORDS_MAX_RETRIES ganger.
 * - Motoren er skrevet mot BoordsStore, så testene kjører mot et minnelager og en falsk Boords-server.
 */
import {
  BOORDS_CLIENT_ID, BOORDS_ENDPOINTS, BOORDS_MAX_IMAGE_BYTES, BOORDS_MAX_RETRIES, RateWindow, backoffMs, boordsFramePayload,
  cleanCommentText, fieldsHash, frameToBoordsFields, newIncomingComments, nextCursor, panelToBoordsFields, planBoordsIntake, retryAfterMs,
  sha256Hex, type BoordsComment, type BoordsFrame, type FrameState, type PanelLike,
} from "@/core/connectors";

export const BOORDS_API_BASE = "https://app.boords.com/api/v1";

export class BoordsError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
/** Fjerner nøkkelen fra enhver tekst før den kan havne i logg eller svar. */
export function scrub(text: string, secret: string): string {
  return secret && secret.length >= 4 ? text.split(secret).join("[redacted]") : text;
}

export interface Clock { now(): number; sleep(ms: number): Promise<void> }
export const realClock: Clock = { now: () => Date.now(), sleep: ms => new Promise(r => setTimeout(r, ms)) };

/** Én fartsgrense per nøkkel i denne serverinstansen (nøkkelen selv brukes ikke som kart-nøkkel). */
const windows = new Map<string, RateWindow>();

export class BoordsClient {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly window: RateWindow;
  constructor(private readonly apiKey: string, private readonly opts: { fetch?: typeof fetch; base?: string; clock?: Clock; windowKey?: string } = {}) {
    const k = opts.windowKey ?? sha256Hex(apiKey);
    this.window = windows.get(k) ?? new RateWindow();
    windows.set(k, this.window);
  }
  /** Kall går i kø etter hverandre, så grensen holder også ved mange samtidige synker. */
  request<T>(method: string, path: string, body?: unknown | FormData): Promise<T> {
    const run = this.chain.then(() => this.send<T>(method, path, body));
    this.chain = run.catch(() => undefined);
    return run;
  }
  private async send<T>(method: string, path: string, body?: unknown | FormData): Promise<T> {
    const clock = this.opts.clock ?? realClock, f = this.opts.fetch ?? fetch;
    for (let attempt = 0; ; attempt++) {
      const wait = this.window.waitMs(clock.now());
      if (wait > 0) await clock.sleep(wait);
      this.window.record(clock.now());
      const headers: Record<string, string> = { "X-API-KEY": this.apiKey, Accept: "application/json" };
      const isForm = typeof FormData !== "undefined" && body instanceof FormData;
      if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
      let res: Response;
      try {
        res = await f(`${this.opts.base ?? BOORDS_API_BASE}${path}`, { method, headers, body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body) });
      } catch (e) {
        if (attempt >= BOORDS_MAX_RETRIES) throw new BoordsError(0, scrub(e instanceof Error ? e.message : "network", this.apiKey));
        await clock.sleep(backoffMs(attempt)); continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= BOORDS_MAX_RETRIES) throw new BoordsError(res.status, `boords ${res.status}`);
        await clock.sleep(retryAfterMs(res.headers.get("Retry-After"), clock.now()) ?? backoffMs(attempt));
        continue;
      }
      if (!res.ok) throw new BoordsError(res.status, `boords ${res.status}`);
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }
  }
  async image(url: string): Promise<Uint8Array> {
    if (!/^https:\/\//.test(url)) throw new BoordsError(0, "image url");
    const res = await (this.opts.fetch ?? fetch)(url);
    if (!res.ok) throw new BoordsError(res.status, "image");
    const len = Number(res.headers.get("Content-Length") ?? 0);
    if (len > BOORDS_MAX_IMAGE_BYTES) throw new BoordsError(413, "image size");
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > BOORDS_MAX_IMAGE_BYTES) throw new BoordsError(413, "image size");
    return bytes;
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : Array.isArray((v as { data?: unknown })?.data) ? (v as { data: unknown[] }).data : []);
export function parseFrame(raw: unknown): BoordsFrame | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = str(r["id"]); if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  return { id, number: str(r["number"]), action: str(r["action"]), sound: str(r["sound"]), dialogue: str(r["dialogue"]), imageUrl: str(r["image_url"]) || null, updatedAt: str(r["updated_at"]) };
}
export function parseComment(raw: unknown): BoordsComment | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = str(r["id"]); if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  return { id, frameId: str(r["frame_id"]) || null, author: str(r["author"]).slice(0, 200), text: cleanCommentText(str(r["text"])), createdAt: str(r["created_at"]) };
}

// ---------- Lager og motor ----------

export interface BoordsLink { readonly id: string; readonly projectId: string; readonly panelId: string; readonly frameId: string }
export interface BoordsStore {
  /** Panelene i prosjektet med feltene som sendes (bare lesing). */
  panels(projectId: string): Promise<Map<string, PanelLike>>;
  projectLink(projectId: string, connectionId: string): Promise<{ storyboardId: string; manifestId: string } | null>;
  saveProjectLink(l: { projectId: string; connectionId: string; storyboardId: string; manifestId: string; userId: string }): Promise<void>;
  links(projectId: string): Promise<BoordsLink[]>;
  saveLink(l: { projectId: string; panelId: string; frameId: string; userId: string }): Promise<string>;
  frameStates(projectId: string): Promise<FrameState[]>;
  saveFrameState(s: { linkId: string; projectId: string; ourHash: string | null; theirHash: string | null; theirImage?: string | null }): Promise<void>;
  imageSeen(linkId: string): Promise<string | null>;
  /** Idempotent på (link, kind, incoming_hash): samme endring gir aldri to kandidater. */
  insertCandidate(c: { projectId: string; linkId: string; panelId: string; frameId: string; kind: "text" | "image"; incoming: Record<string, string>; incomingHash: string; conflict: boolean; mediaPath: string | null; mediaSha256: string | null }): Promise<boolean>;
  storeImage(projectId: string, bytes: Uint8Array): Promise<{ path: string; sha256: string }>;
  knownComments(projectId: string): Promise<Set<string>>;
  insertComment(c: { projectId: string; panelId: string | null; boordsId: string; direction: "in" | "out"; feedbackId: string | null; author: string; text: string }): Promise<void>;
  unsentFeedback(projectId: string): Promise<{ id: string; panelId: string | null; author: string; text: string }[]>;
  setCursor(connectionId: string, cursor: string | null): Promise<void>;
}

export interface PushResult { readonly storyboardId: string; readonly created: number; readonly updated: number }

/** Send til Boords: opprett storyboard ved første sending, deretter oppdater/legg til frames. */
export async function pushStoryboard(i: {
  client: BoordsClient; store: BoordsStore; projectId: string; connectionId: string; userId: string; title: string;
  panelOrder: readonly string[]; images: ReadonlyMap<string, Uint8Array>; newManifestId: () => string;
}): Promise<PushResult> {
  const panels = await i.store.panels(i.projectId);
  let pl = await i.store.projectLink(i.projectId, i.connectionId);
  if (!pl) {
    const manifestId = i.newManifestId();
    const sb = await i.client.request<Record<string, unknown>>("POST", BOORDS_ENDPOINTS.storyboards, { name: i.title.slice(0, 200), reference: `ptg:${manifestId}` });
    const storyboardId = str((sb as { data?: Record<string, unknown> })?.data?.["id"] ?? sb?.["id"]);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(storyboardId)) throw new BoordsError(502, "storyboard id");
    pl = { storyboardId, manifestId };
    await i.store.saveProjectLink({ projectId: i.projectId, connectionId: i.connectionId, storyboardId, manifestId, userId: i.userId });
  }
  const links = new Map((await i.store.links(i.projectId)).map(l => [l.panelId, l]));
  let created = 0, updated = 0;
  for (const panelId of i.panelOrder) {
    const p = panels.get(panelId); if (!p) continue;
    const payload = boordsFramePayload(p, pl.manifestId);
    const img = i.images.get(panelId);
    const body: unknown = img && typeof FormData !== "undefined" ? (() => { const fd = new FormData(); for (const [k, v] of Object.entries(payload)) fd.set(k, v); fd.set("image", new Blob([img as BlobPart], { type: "image/png" }), `${p.number || "panel"}.png`); return fd; })() : payload;
    const link = links.get(panelId);
    let frameId: string, linkId: string;
    if (link) {
      const r = await i.client.request<Record<string, unknown>>("PATCH", BOORDS_ENDPOINTS.frame(pl.storyboardId, link.frameId), body);
      frameId = link.frameId; linkId = link.id; updated++;
      void r;
    } else {
      const r = await i.client.request<Record<string, unknown>>("POST", BOORDS_ENDPOINTS.frames(pl.storyboardId), body);
      frameId = str((r as { data?: Record<string, unknown> })?.data?.["id"] ?? r?.["id"]);
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(frameId)) throw new BoordsError(502, "frame id");
      linkId = await i.store.saveLink({ projectId: i.projectId, panelId, frameId, userId: i.userId }); created++;
    }
    const h = fieldsHash(panelToBoordsFields(p));
    // Etter sending er begge sider like: vår hash er grunnlaget for neste konfliktsjekk.
    await i.store.saveFrameState({ linkId, projectId: i.projectId, ourHash: h, theirHash: h });
  }
  return { storyboardId: pl.storyboardId, created, updated };
}

export interface PullResult { readonly candidates: number; readonly conflicts: number; readonly comments: number; readonly cursor: string | null }

/** Hent fra Boords med updated_since. Endringer blir kandidater; ingenting skrives i prosjektdata. */
export async function pullStoryboard(i: { client: BoordsClient; store: BoordsStore; projectId: string; connectionId: string; since: string | null }): Promise<PullResult> {
  const pl = await i.store.projectLink(i.projectId, i.connectionId);
  if (!pl) return { candidates: 0, conflicts: 0, comments: 0, cursor: i.since };
  const q = i.since ? `?updated_since=${encodeURIComponent(i.since)}` : "";
  const frames = list(await i.client.request("GET", BOORDS_ENDPOINTS.frames(pl.storyboardId) + q)).map(parseFrame).filter((f): f is BoordsFrame => !!f);
  const states = await i.store.frameStates(i.projectId);
  const panels = await i.store.panels(i.projectId);
  const seenImage = new Map<string, string | null>();
  for (const s of states) seenImage.set(s.linkId, await i.store.imageSeen(s.linkId));
  const stateByFrame = new Map(states.map(s => [s.frameId, s]));
  const plan = planBoordsIntake({ frames, states, panels, imageChanged: f => { const s = stateByFrame.get(f.id); return !!s && seenImage.get(s.linkId) !== f.imageUrl; } });
  let candidates = 0, conflicts = 0;
  for (const c of plan) {
    let mediaPath: string | null = null, mediaSha256: string | null = null;
    if (c.kind === "image" && c.imageUrl) {
      const bytes = await i.client.image(c.imageUrl);
      const stored = await i.store.storeImage(i.projectId, bytes); mediaPath = stored.path; mediaSha256 = stored.sha256;
    }
    const incoming = c.kind === "image" ? { imageSha256: mediaSha256 ?? "" } : (c.incoming as Record<string, string>);
    const incomingHash = sha256Hex(JSON.stringify([c.kind, incoming]));
    if (await i.store.insertCandidate({ projectId: i.projectId, linkId: c.linkId, panelId: c.panelId, frameId: c.frameId, kind: c.kind, incoming, incomingHash, conflict: c.conflict, mediaPath, mediaSha256 })) { candidates++; if (c.conflict) conflicts++; }
    const st = stateByFrame.get(c.frameId)!;
    await i.store.saveFrameState({ linkId: c.linkId, projectId: i.projectId, ourHash: st.ourHash, theirHash: c.kind === "text" ? c.theirHash : st.theirHash, ...(c.kind === "image" ? { theirImage: c.imageUrl } : {}) });
  }
  // Kommentarer inn (dedup på Boords-ID) og SB-10-kommentarer ut (én gang per tilbakemelding).
  const comments = await syncComments({ client: i.client, store: i.store, projectId: i.projectId, storyboardId: pl.storyboardId });
  const cursor = nextCursor(i.since, frames);
  await i.store.setCursor(i.connectionId, cursor);
  return { candidates, conflicts, comments, cursor };
}

export async function syncComments(i: { client: BoordsClient; store: BoordsStore; projectId: string; storyboardId: string }): Promise<number> {
  const links = await i.store.links(i.projectId);
  const panelOfFrame = new Map(links.map(l => [l.frameId, l.panelId])), frameOfPanel = new Map(links.map(l => [l.panelId, l.frameId]));
  const known = await i.store.knownComments(i.projectId);
  const incoming = newIncomingComments(list(await i.client.request("GET", BOORDS_ENDPOINTS.comments(i.storyboardId))).map(parseComment).filter((c): c is BoordsComment => !!c), known);
  for (const c of incoming) await i.store.insertComment({ projectId: i.projectId, panelId: c.frameId ? panelOfFrame.get(c.frameId) ?? null : null, boordsId: c.id, direction: "in", feedbackId: null, author: c.author, text: c.text });
  let sent = 0;
  for (const f of await i.store.unsentFeedback(i.projectId)) {
    const frameId = f.panelId ? frameOfPanel.get(f.panelId) : undefined;
    if (!frameId) continue;
    const text = cleanCommentText(`${f.author}: ${f.text}`);
    const r = await i.client.request<Record<string, unknown>>("POST", BOORDS_ENDPOINTS.comments(i.storyboardId), { frame_id: frameId, text });
    const id = str((r as { data?: Record<string, unknown> })?.data?.["id"] ?? r?.["id"]);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) continue;
    await i.store.insertComment({ projectId: i.projectId, panelId: f.panelId, boordsId: id, direction: "out", feedbackId: f.id, author: f.author, text: cleanCommentText(f.text) });
    sent++;
  }
  return incoming.length + sent;
}

export { BOORDS_CLIENT_ID, frameToBoordsFields };
