/**
 * C-4 Boords-kobling: ren, plattformnøytral logikk (ingen nettverk, ingen nettleser).
 *
 * Fakta fra Boords' dokumentasjon (beta, krever betalt plan): nøkkelen sendes i X-API-KEY, 120 kall per
 * minutt, endringer hentes med updated_since, webhooks signeres med HMAC. ETag/If-Match og et felt for
 * ekstern referanse er IKKE dokumentert, så koblingen bygger ikke på dem: identitet er vår manifest-ID og
 * connector_links (frame-ID ↔ panel-ID), og konflikter finnes med egne hasher av feltene på begge sider.
 */
import { Sha256, toHex, utf8 } from "./sha256";
import type { ConflictChoice } from "./conflict";
import { constantTimeEqual } from "./auth";

export const BOORDS_CLIENT_ID = "boords";
export const BOORDS_RATE_PER_MINUTE = 120;
export const BOORDS_WEBHOOK_TOLERANCE_SECONDS = 300;
export const BOORDS_MAX_RETRIES = 5;
export const BOORDS_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** Felt som sendes og hentes. Andre panelfelt (kamera, notater …) blir værende hos oss. */
export const BOORDS_FIELDS = ["action", "sound", "dialogue"] as const;
export type BoordsField = (typeof BOORDS_FIELDS)[number];

/** Endepunktene samlet ett sted, så de kan rettes mot Boords' endelige beta-API uten andre endringer. */
export const BOORDS_ENDPOINTS = {
  me: "/me",
  storyboards: "/storyboards",
  storyboard: (id: string) => `/storyboards/${encodeURIComponent(id)}`,
  frames: (storyboardId: string) => `/storyboards/${encodeURIComponent(storyboardId)}/frames`,
  frame: (storyboardId: string, frameId: string) => `/storyboards/${encodeURIComponent(storyboardId)}/frames/${encodeURIComponent(frameId)}`,
  comments: (storyboardId: string) => `/storyboards/${encodeURIComponent(storyboardId)}/comments`,
} as const;

// ---------- HMAC og konstant-tids sammenligning ----------

export function hmacSha256(key: Uint8Array | string, message: Uint8Array | string): Uint8Array {
  let k = typeof key === "string" ? utf8(key) : key;
  if (k.length > 64) k = new Sha256().update(k).digest();
  const block = new Uint8Array(64); block.set(k);
  const ipad = block.map(b => b ^ 0x36), opad = block.map(b => b ^ 0x5c);
  const inner = new Sha256().update(ipad).update(typeof message === "string" ? utf8(message) : message).digest();
  return new Sha256().update(opad).update(inner).digest();
}
export const hmacSha256Hex = (key: Uint8Array | string, message: Uint8Array | string): string => toHex(hmacSha256(key, message));

export type WebhookCheck = { ok: true; eventId: string; timestampSec: number } | { ok: false; reason: "format" | "signature" | "stale" };

/**
 * Signert innhold: `${timestamp}.${rawBody}` med HMAC-SHA-256 (hex, valgfritt «sha256=»-prefiks).
 * Tidsvinduet stopper gjenspilling av gamle meldinger; dubletter stoppes av hendelses-ID i databasen.
 */
export function verifyBoordsWebhook(i: { rawBody: string; signature: string | null; timestamp: string | null; eventId: string | null; secret: string; nowMs: number; toleranceSec?: number }): WebhookCheck {
  const sig = (i.signature ?? "").trim().replace(/^sha256=/i, "").toLowerCase();
  const ts = Number(i.timestamp);
  const id = (i.eventId ?? "").trim();
  if (!/^[0-9a-f]{64}$/.test(sig) || !i.timestamp || !/^\d{9,11}$/.test(i.timestamp) || !/^[A-Za-z0-9_.:-]{1,128}$/.test(id) || !i.secret) return { ok: false, reason: "format" };
  const expected = hmacSha256Hex(i.secret, `${i.timestamp}.${i.rawBody}`);
  if (!constantTimeEqual(sig, expected)) return { ok: false, reason: "signature" };
  if (Math.abs(i.nowMs / 1000 - ts) > (i.toleranceSec ?? BOORDS_WEBHOOK_TOLERANCE_SECONDS)) return { ok: false, reason: "stale" };
  return { ok: true, eventId: id, timestampSec: ts };
}

// ---------- Fartsgrense: kø og tilbakeoff ----------

/** Retry-After i sekunder eller HTTP-dato → millisekunder (null når ugyldig). */
export function retryAfterMs(header: string | null, nowMs: number): number | null {
  if (!header) return null;
  const s = header.trim();
  if (/^\d+$/.test(s)) return Math.min(Number(s) * 1000, 15 * 60_000);
  const d = Date.parse(s);
  return Number.isFinite(d) ? Math.max(0, Math.min(d - nowMs, 15 * 60_000)) : null;
}
/** Eksponentiell tilbakeoff med tak, uten tilfeldighet (forutsigbart i tester). */
export const backoffMs = (attempt: number): number => Math.min(1000 * 2 ** attempt, 60_000);

/** Glidende vindu: hvor lenge neste kall må vente for å holde seg innen grensen. */
export class RateWindow {
  private stamps: number[] = [];
  constructor(private readonly perMinute = BOORDS_RATE_PER_MINUTE) {}
  waitMs(nowMs: number): number {
    this.stamps = this.stamps.filter(t => nowMs - t < 60_000);
    return this.stamps.length < this.perMinute ? 0 : 60_000 - (nowMs - this.stamps[0]!);
  }
  record(nowMs: number): void { this.stamps.push(nowMs); }
  get size(): number { return this.stamps.length; }
}

// ---------- Feltmapping ----------

export interface BoordsFrame {
  readonly id: string;
  readonly number: string;
  readonly action: string;
  readonly sound: string;
  readonly dialogue: string;
  readonly imageUrl: string | null;
  readonly updatedAt: string;
}
export type BoordsFields = Readonly<Record<BoordsField, string>>;

export interface PanelLike {
  readonly id: string;
  readonly number: string;
  readonly fields: Readonly<Record<string, string>>;
  /** Teksten i koblede replikker (manusrekkefølge), brukes når dialogfeltet er tomt. */
  readonly dialogueLines: readonly string[];
}
export function panelToBoordsFields(p: PanelLike): BoordsFields {
  const dialogue = (p.fields["dialogue"] ?? "").trim() || p.dialogueLines.join("\n");
  return { action: p.fields["action"] ?? "", sound: p.fields["sound"] ?? "", dialogue };
}
export function frameToBoordsFields(f: Pick<BoordsFrame, BoordsField>): BoordsFields {
  return { action: f.action ?? "", sound: f.sound ?? "", dialogue: f.dialogue ?? "" };
}
/** Stabil hash av feltene (rekkefølge og NFC), brukt som revisjonsgrunnlag i stedet for ETag. */
export const fieldsHash = (f: BoordsFields): string => toHex(new Sha256().update(utf8(JSON.stringify(BOORDS_FIELDS.map(k => (f[k] ?? "").normalize("NFC"))))).digest());

/** Nyttelast til Boords. Referansen er vår: manifest-ID og panel-ID (lagres også i connector_links). */
export function boordsFramePayload(p: PanelLike, manifestId: string): Record<string, string> {
  const f = panelToBoordsFields(p);
  return { number: p.number, action: f.action, sound: f.sound, dialogue: f.dialogue, reference: `ptg:${manifestId}:${p.id}` };
}

/** Feltene som skiller seg fra panelet; tomt = ingen kandidat. */
export function incomingFieldChanges(current: BoordsFields, incoming: BoordsFields): Partial<Record<BoordsField, { current: string; incoming: string }>> {
  const out: Partial<Record<BoordsField, { current: string; incoming: string }>> = {};
  for (const k of BOORDS_FIELDS) if ((current[k] ?? "").normalize("NFC") !== (incoming[k] ?? "").normalize("NFC")) out[k] = { current: current[k] ?? "", incoming: incoming[k] ?? "" };
  return out;
}

// ---------- Synkroniseringsplan (updated_since) ----------

export interface FrameState { readonly linkId: string; readonly panelId: string; readonly frameId: string; readonly ourHash: string | null; readonly theirHash: string | null }
export interface IntakeCandidate {
  readonly linkId: string;
  readonly panelId: string;
  readonly frameId: string;
  readonly kind: "text" | "image";
  readonly incoming: Partial<Record<BoordsField, string>>;
  readonly imageUrl: string | null;
  /** Begge sider endret siden forrige synk → konflikt med C-0-valgene. */
  readonly conflict: boolean;
  readonly theirHash: string;
}
/**
 * Ren plan for frames hentet med updated_since. Ingenting tas i bruk: hver endring blir en kandidat.
 * Frames uten kobling ignoreres (vi oppretter aldri paneler automatisk). Uendret innhold gir ingen kandidat.
 */
export function planBoordsIntake(i: {
  frames: readonly BoordsFrame[];
  states: readonly FrameState[];
  panels: ReadonlyMap<string, PanelLike>;
  imageChanged: (frame: BoordsFrame) => boolean;
}): IntakeCandidate[] {
  const byFrame = new Map(i.states.map(s => [s.frameId, s]));
  const out: IntakeCandidate[] = [];
  for (const f of i.frames) {
    const st = byFrame.get(f.id); if (!st) continue;
    const panel = i.panels.get(st.panelId); if (!panel) continue;
    const theirs = frameToBoordsFields(f), theirHash = fieldsHash(theirs);
    const ours = panelToBoordsFields(panel);
    const oursChanged = st.ourHash !== null && fieldsHash(ours) !== st.ourHash;
    if (theirHash !== st.theirHash) {
      const changes = incomingFieldChanges(ours, theirs);
      const incoming = Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v!.incoming]));
      if (Object.keys(incoming).length) out.push({ linkId: st.linkId, panelId: st.panelId, frameId: f.id, kind: "text", incoming, imageUrl: null, conflict: oursChanged, theirHash });
    }
    if (f.imageUrl && i.imageChanged(f)) out.push({ linkId: st.linkId, panelId: st.panelId, frameId: f.id, kind: "image", incoming: {}, imageUrl: f.imageUrl, conflict: false, theirHash });
  }
  return out;
}
/** Ny markør for updated_since: seneste updatedAt vi har sett, aldri bakover. */
export function nextCursor(prev: string | null, frames: readonly { updatedAt: string }[]): string | null {
  let best = prev ? Date.parse(prev) : -Infinity;
  for (const f of frames) { const t = Date.parse(f.updatedAt); if (Number.isFinite(t) && t > best) best = t; }
  return Number.isFinite(best) ? new Date(best).toISOString() : prev;
}

/** Tekstkandidat → feltene som skrives med SetStoryboardDetails når brukeren velger «Bruk innkommende». */
export function applyTextCandidate(fields: Readonly<Record<string, string>>, incoming: Partial<Record<BoordsField, string>>, choice: ConflictChoice): Readonly<Record<string, string>> | null {
  if (choice !== "choose_incoming") return null;
  const next = { ...fields };
  for (const k of BOORDS_FIELDS) if (typeof incoming[k] === "string") next[k] = incoming[k]!;
  return next;
}

// ---------- Kommentarer ----------

export interface BoordsComment { readonly id: string; readonly frameId: string | null; readonly author: string; readonly text: string; readonly createdAt: string }
/** Bare ren tekst begge veier (HTML fjernes), maks 4000 tegn som SB-10. */
export const cleanCommentText = (s: string): string => s.replace(/<[^>]*>/g, "").replace(/[<>]/g, "").normalize("NFC").slice(0, 4000);
/** Kommentarer som ikke er sett før (dedup på Boords-ID), og ikke våre egne utgående. */
export function newIncomingComments(list: readonly BoordsComment[], known: ReadonlySet<string>): BoordsComment[] {
  return list.filter(c => /^[A-Za-z0-9_-]{1,128}$/.test(c.id) && !known.has(c.id));
}
