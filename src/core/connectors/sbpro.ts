/**
 * C-5 Toon Boom Storyboard Pro: ren modell for importpakken (manifest v1 med panelbilder, timing, tekstfelt,
 * kamera og midlertidig panellyd) og for returen fra skriptpakken (plugins/toonboom-sbpro).
 *
 * Regler: retur blir kandidater (aldri automatisk bruk); konflikt når panelets revisjon har endret seg siden
 * eksporten; «conformation» (ny rekkefølge og timing) er bare ett angrebart forslag når den er tapsfri
 * (samme paneler i samme scener, ingen nye eller manglende, ingen konflikter). Ellers vises den som forslag.
 * Ingenting slettes: et panel som mangler i returen blir bare et forslag.
 */
import type { Command, ProjectState } from "../index";
import type { Composition } from "../index";
import { keysEvenly } from "../order-key";
import { panelDetails } from "../storyboard/editing";
import { storyboardPanelsOf } from "../storyboard";
import { framesToTimecode, validateManifest, canonicalJson, type ConnectorManifest, type ManifestItem } from "./manifest";
import { DEFAULT_SAMPLE_RATE } from "./build";
import { Sha256, toHex } from "./sha256";

export const SBPRO_CLIENT_ID = "ptg.toonboom-sbpro";
export const SBPRO_ADAPTER = { id: "toonboom-sbpro", version: "1" } as const;
/** Tekstfeltene vi utveksler, og navnet på bildeteksten (caption) i Storyboard Pro. */
export const SBPRO_CAPTIONS = { dialogue: "Dialogue", action: "Action Notes", notes: "Notes" } as const;
export type SbproField = keyof typeof SBPRO_CAPTIONS;
export const SBPRO_FIELDS = Object.keys(SBPRO_CAPTIONS) as SbproField[];
/** Skjult referanse-caption: «ptg:<panelId>@<revision>». Skal ikke redigeres i Storyboard Pro. */
export const SBPRO_REF_CAPTION = "PtG Ref";
/** Takhøyder per retur (ikke globale): paneler, tekstlengde og bildestørrelse. */
export const SBPRO_MAX_PANELS = 5000;
export const SBPRO_MAX_TEXT = 10_000;
export const SBPRO_MAX_IMAGE_BYTES = 25 * 1024 * 1024;

const utf8 = (s: string) => new TextEncoder().encode(s);
const nfc = (s: unknown) => (typeof s === "string" ? s.normalize("NFC") : "");

export interface SbproPackageFile { readonly path: string; readonly sha256: string; readonly byteSize: number; readonly mimeType: string }
export interface SbproPackageInput {
  readonly productionId: string;
  readonly nowIso: string;
  /** Panelets rasterisering (panels/<id>.png), laget i nettleseren. */
  readonly images: ReadonlyMap<string, SbproPackageFile>;
  /** Midlertidig panellyd (sound/<versionId>.<ext>), når den finnes. */
  readonly sounds: ReadonlyMap<string, SbproPackageFile>;
}

/** Panelene i en produksjon i filmrekkefølge (aktive forekomster, ikke fjernede eller deaktiverte paneler). */
export function productionPanels(s: ProjectState, productionId: string): { panel: Composition; occurrenceId: string }[] {
  return Object.values(s.occurrences)
    .filter(o => o.productionId === productionId && o.active)
    .sort((a, b) => a.orderKey.localeCompare(b.orderKey))
    .flatMap(o => storyboardPanelsOf(s, o.id).filter(p => p.active !== false).map(panel => ({ panel, occurrenceId: String(o.id) })));
}

/** Importpakke for Storyboard Pro: manifest v1, ett panel-element per panel med sbpro-felt (ukjente felt tåles). */
export function buildSbproPackage(s: ProjectState, i: SbproPackageInput): ConnectorManifest {
  const fps = s.project.fps;
  const items: ManifestItem[] = [{ kind: "project", id: s.project.id, name: s.project.name, revision: s.project.revision }];
  const seen = new Set<string>();
  let order = 0;
  for (const { panel, occurrenceId } of productionPanels(s, i.productionId)) {
    if (!seen.has(occurrenceId)) {
      seen.add(occurrenceId);
      const o = s.occurrences[occurrenceId as never]!;
      items.push({ kind: "occurrence", id: occurrenceId, parentId: i.productionId, revision: o.revision, sceneId: o.sceneId, active: true });
    }
    const d = panelDetails(panel);
    const files: SbproPackageFile[] = [];
    const img = i.images.get(panel.id); if (img) files.push(img);
    const snd = d.tempAudio ? i.sounds.get(d.tempAudio.versionId) : undefined; if (snd) files.push(snd);
    const captions = Object.fromEntries(SBPRO_FIELDS.map(f => [f, d.fields[f] ?? ""]));
    items.push({
      kind: "panel", id: panel.id, parentId: occurrenceId, name: panel.name, revision: panel.revision,
      base: { entity: "panel", id: panel.id, revision: panel.revision },
      durationFrames: panel.durationFrames, timecode: framesToTimecode(panel.durationFrames, fps),
      files,
      sbpro: {
        order: order++, number: d.number, sceneNumber: d.sceneNumber, captions,
        camera: { shot: d.shot, angle: d.angle, focalMm: d.focalMm, movement: d.movement },
        sound: d.tempAudio && snd ? { path: snd.path, name: d.tempAudio.name, durationMs: d.tempAudio.durationMs } : null,
        image: img ? img.path : null,
      },
    });
  }
  return {
    manifestVersion: 1, createdAt: i.nowIso, projectId: s.project.id,
    frameRate: { num: fps.num, den: fps.den }, sampleRate: DEFAULT_SAMPLE_RATE,
    sourceApp: { name: "From Pen to Glass", version: "1" }, adapter: { ...SBPRO_ADAPTER }, items,
    sbpro: { productionId: i.productionId, captions: SBPRO_CAPTIONS, refCaption: SBPRO_REF_CAPTION },
  };
}

// ---------- Retur fra Storyboard Pro ----------

export interface SbproReturnPanel {
  /** Vår panel-ID, eller null for et nytt panel laget i Storyboard Pro. */
  readonly panelId: string | null;
  /** Storyboard Pros egen panel-ID (bare som nøkkel i returen). */
  readonly sbproId: string;
  readonly occurrenceId: string | null;
  readonly baseRevision: number | null;
  readonly order: number;
  readonly durationFrames: number;
  readonly captions: Readonly<Record<SbproField, string>>;
  readonly image: SbproPackageFile | null;
}
export interface SbproReturn { readonly projectId: string; readonly fps: { num: number; den: number }; readonly panels: readonly SbproReturnPanel[]; readonly hash: string }
export type SbproReturnResult = { ok: true; value: SbproReturn } | { ok: false; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const SBPRO_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

/** Leser og kontrollerer returmanifestet (manifest v1 + sbpro-felt). Avviser for mye, feil adapter og hemmeligheter. */
export function readSbproReturn(input: unknown, byteLength?: number): SbproReturnResult {
  const v = validateManifest(input, byteLength);
  if (!v.ok) return { ok: false, reason: `manifest:${v.issues[0]?.path ?? "$"}:${v.issues[0]?.code ?? "type"}` };
  const m = v.manifest;
  if (m.adapter.id !== SBPRO_ADAPTER.id) return { ok: false, reason: "adapter" };
  const panels: SbproReturnPanel[] = [];
  const keys = new Set<string>();
  for (const it of m.items) {
    if (it.kind !== "panel") continue;
    const x = it["sbpro"];
    if (!isObj(x)) return { ok: false, reason: "sbpro" };
    const sbproId = nfc(x["sbproId"]);
    if (!SBPRO_ID.test(sbproId) || keys.has(sbproId)) return { ok: false, reason: "sbproId" };
    keys.add(sbproId);
    const order = x["order"];
    if (!Number.isInteger(order) || (order as number) < 0 || (order as number) > 1e6) return { ok: false, reason: "order" };
    const dur = it.durationFrames ?? 0;
    if (!Number.isInteger(dur) || dur < 1 || dur > 1e7) return { ok: false, reason: "duration" };
    const cap = isObj(x["captions"]) ? x["captions"] : {};
    const captions = Object.fromEntries(SBPRO_FIELDS.map(f => [f, nfc(cap[f])])) as Record<SbproField, string>;
    if (Object.values(captions).some(t => t.length > SBPRO_MAX_TEXT)) return { ok: false, reason: "text" };
    const known = typeof x["new"] === "boolean" ? !x["new"] : true;
    const panelId = known ? it.id : null;
    const png = (it.files ?? []).find(f => f.mimeType === "image/png") ?? null;
    if (png && png.byteSize > SBPRO_MAX_IMAGE_BYTES) return { ok: false, reason: "image-size" };
    panels.push({
      panelId, sbproId, occurrenceId: typeof it.parentId === "string" ? it.parentId : null,
      baseRevision: it.base && it.base.entity === "panel" ? it.base.revision : null,
      order: order as number, durationFrames: dur, captions,
      image: png ? { path: png.path, sha256: png.sha256, byteSize: png.byteSize, mimeType: png.mimeType } : null,
    });
  }
  if (panels.length === 0) return { ok: false, reason: "empty" };
  if (panels.length > SBPRO_MAX_PANELS) return { ok: false, reason: "too-many" };
  const hash = toHex(new Sha256().update(utf8(canonicalJson(input))).digest());
  return { ok: true, value: { projectId: m.projectId, fps: { num: m.frameRate.num, den: m.frameRate.den }, panels: [...panels].sort((a, b) => a.order - b.order), hash } };
}

export type SbproCandidateKind = "text" | "timing" | "image" | "new_panel" | "conform";
export interface SbproCandidate {
  readonly kind: SbproCandidateKind;
  /** Nøkkel innen returen (panel-ID, sbpro-ID eller «conform»). */
  readonly key: string;
  readonly panelId: string | null;
  readonly incoming: Readonly<Record<string, unknown>>;
  readonly conflict: boolean;
  readonly image: SbproPackageFile | null;
}
export interface ConformPlan {
  readonly lossless: boolean;
  /** Hvorfor den ikke er tapsfri (vises som forslag). */
  readonly reasons: readonly ("new" | "missing" | "moved-scene" | "conflict" | "unknown-scene" | "fps")[];
  /** Ny rekkefølge per scene (forekomst) og ny timing per panel. */
  readonly order: Readonly<Record<string, readonly string[]>>;
  readonly durations: Readonly<Record<string, number>>;
  /** Revisjonene planen bygger på; sjekkes på nytt før bruk. */
  readonly revisions: Readonly<Record<string, number>>;
}

const sameFps = (a: { num: number; den: number }, b: { num: number; den: number }) => a.num * b.den === b.num * a.den;

/** Rekkefølge og timing fra Storyboard Pro mot prosjektet. Ren plan; endrer ingenting. */
export function planConformation(s: ProjectState, productionId: string, r: SbproReturn): ConformPlan {
  const current = productionPanels(s, productionId);
  const byId = new Map(current.map(c => [c.panel.id as string, c]));
  const reasons = new Set<ConformPlan["reasons"][number]>();
  if (!sameFps(s.project.fps, r.fps)) reasons.add("fps");
  const order: Record<string, string[]> = {};
  const durations: Record<string, number> = {};
  const revisions: Record<string, number> = {};
  for (const p of r.panels) {
    if (!p.panelId) { reasons.add("new"); continue; }
    const c = byId.get(p.panelId);
    if (!c) { reasons.add("unknown-scene"); continue; }
    if (p.occurrenceId !== c.occurrenceId) reasons.add("moved-scene");
    if (p.baseRevision !== null && p.baseRevision !== c.panel.revision) reasons.add("conflict");
    (order[c.occurrenceId] ??= []).push(p.panelId);
    if (p.durationFrames !== c.panel.durationFrames) durations[p.panelId] = p.durationFrames;
    revisions[p.panelId] = c.panel.revision;
  }
  const returned = new Set(r.panels.map(p => p.panelId).filter(Boolean) as string[]);
  if (current.some(c => !returned.has(c.panel.id))) reasons.add("missing");
  return { lossless: reasons.size === 0, reasons: [...reasons], order, durations, revisions };
}

/** Endrer planen faktisk noe (rekkefølge eller timing)? */
export function conformChanges(s: ProjectState, plan: ConformPlan): boolean {
  if (Object.keys(plan.durations).length) return true;
  return Object.entries(plan.order).some(([occ, ids]) => storyboardPanelsOf(s, occ as never).filter(p => ids.includes(p.id)).map(p => p.id).join() !== ids.join());
}

/**
 * Kommandoene for en tapsfri sammenstilling (én angregruppe i appen). null hvis planen ikke er tapsfri lenger
 * (noen har endret et panel siden returen) – da må brukeren hente en ny retur.
 */
export function conformCommands(s: ProjectState, plan: ConformPlan): Command[] | null {
  if (!plan.lossless) return null;
  for (const [id, rev] of Object.entries(plan.revisions)) {
    const p = s.compositions[id as never];
    if (!p || p.removed || p.revision !== rev) return null;
  }
  const out: Command[] = [];
  for (const [occ, ids] of Object.entries(plan.order)) {
    const now = storyboardPanelsOf(s, occ as never).map(p => p.id as string);
    if (now.join() === ids.join()) continue;
    const keys = keysEvenly(ids.length);
    ids.forEach((id, n) => out.push({ type: "MoveStoryboardPanel", panelId: id, orderKey: keys[n]! } as Command));
  }
  for (const [id, frames] of Object.entries(plan.durations)) out.push({ type: "UpdateStoryboardPanel", panelId: id, durationFrames: frames } as Command);
  return out;
}

/** Kandidater fra en retur: tekst, timing, bilde, nye paneler og (høyst) én sammenstilling. Ingenting brukes. */
export function planSbproReturn(s: ProjectState, productionId: string, r: SbproReturn): { candidates: SbproCandidate[]; conform: ConformPlan } {
  const out: SbproCandidate[] = [];
  for (const p of r.panels) {
    if (!p.panelId) {
      out.push({ kind: "new_panel", key: `sbpro:${p.sbproId}`, panelId: null, incoming: { sbproId: p.sbproId, occurrenceId: p.occurrenceId, order: p.order, durationFrames: p.durationFrames, captions: p.captions }, conflict: false, image: p.image });
      continue;
    }
    const panel = s.compositions[p.panelId as never];
    if (!panel || panel.removed || panel.kind !== "storyboard") continue; // aldri gjenopprett eller lag noe automatisk
    const conflict = p.baseRevision !== null && p.baseRevision !== panel.revision;
    const d = panelDetails(panel);
    const changed = Object.fromEntries(SBPRO_FIELDS.filter(f => (d.fields[f] ?? "").normalize("NFC") !== p.captions[f]).map(f => [f, p.captions[f]]));
    if (Object.keys(changed).length) out.push({ kind: "text", key: p.panelId, panelId: p.panelId, incoming: changed, conflict, image: null });
    if (p.durationFrames !== panel.durationFrames) out.push({ kind: "timing", key: p.panelId, panelId: p.panelId, incoming: { durationFrames: p.durationFrames, current: panel.durationFrames }, conflict, image: null });
    if (p.image) out.push({ kind: "image", key: p.panelId, panelId: p.panelId, incoming: { imageSha256: p.image.sha256, byteSize: p.image.byteSize }, conflict, image: p.image });
  }
  const conform = planConformation(s, productionId, r);
  if (conformChanges(s, conform) || !conform.lossless) out.push({ kind: "conform", key: "conform", panelId: null, incoming: { ...conform }, conflict: conform.reasons.includes("conflict"), image: null });
  return { candidates: out, conform };
}

/** Tekstkandidat → panelfelt ved «Bruk innkommende». */
export function applySbproText(fields: Readonly<Record<string, string>>, incoming: Readonly<Record<string, unknown>>): Readonly<Record<string, string>> {
  const next = { ...fields };
  for (const f of SBPRO_FIELDS) if (typeof incoming[f] === "string") next[f] = incoming[f] as string;
  return next;
}
