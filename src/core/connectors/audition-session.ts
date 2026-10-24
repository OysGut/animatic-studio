/**
 * C-6 Adobe Audition (CEP): den delen av lydflyten som både appen og CEP-panelet bruker, uten prosjektstatus.
 * - `AuditionPlan`: hva serveren sender ut for én scene eller ett panel (klipp, roller, markører, ID-er).
 * - `auditionWavMeta`: BWF-metadata (bext + iXML + cue) med prosjekt-, scene-, panel-, ressurs-, variant-,
 *   versjons-, klipp- og manifest-ID, så koblingen tilbake aldri går på filnavn.
 * - `auditionSesx`: multitrack-økt (.sesx) med ett spor per rolle og markører for panel og replikk.
 *   Formatet er Adobes eget XML og er ikke offentlig spesifisert; filen er laget etter økter Audition
 *   selv skriver og er IKKE verifisert i Audition (se C6_REPORT.md). Filene fungerer også uten økten.
 * - `readAuditionReturn`: leser ID-ene fra en redigert WAV og lager målet for C-0-mottaket.
 * Takhøyder er per plan (én scene eller ett panel), aldri globale.
 */
import { readBwf, retagWav, type BwfMeta, type WavMarker } from "../handoff/wav";
import type { Rational } from "./manifest";

export const AUDITION_CLIENT_ID = "ptg.audition";
export const AUDITION_ADAPTER = { id: "adobe-audition-cep", version: "1" } as const;
export const AUDITION_SAMPLE_RATE = 48000;
/** Takhøyder per plan. */
export const AUDITION_MAX_CLIPS = 400;
export const AUDITION_MAX_MARKERS = 2000;
export const AUDITION_MAX_FILE_BYTES = 512 * 1024 * 1024;

export type AuditionRole = "dialogue" | "music" | "effects" | "ambience" | "temp";
export const AUDITION_ROLES: readonly AuditionRole[] = ["dialogue", "music", "effects", "ambience", "temp"];

export interface AuditionClip {
  /** Lydklippet i scenen, eller null for midlertidig panellyd (SB-4). */
  readonly clipId: string | null;
  readonly role: AuditionRole;
  readonly name: string;
  readonly assetId: string;
  readonly variantId: string;
  readonly versionId: string;
  readonly mimeType: string;
  readonly panelId: string | null;
  readonly blockId: string | null;
  readonly offsetMs: number;
  readonly sourceInMs: number;
  readonly lengthMs: number;
  readonly gainDb: number;
  readonly muted: boolean;
}
export interface AuditionMarker { readonly kind: "panel" | "line"; readonly id: string; readonly label: string; readonly ms: number }
export interface AuditionPlan {
  readonly manifestId: string;
  readonly projectId: string;
  readonly occurrenceId: string;
  readonly sceneId: string;
  readonly sceneLabel: string;
  readonly panelId: string | null;
  readonly fps: Rational;
  readonly sampleRate: number;
  /** Scenens (eller panelets) start i filmen, ms. Brukes til tidskode og bext TimeReference. */
  readonly startMs: number;
  readonly durationMs: number;
  readonly clips: readonly AuditionClip[];
  readonly markers: readonly AuditionMarker[];
  /** Sant når takhøydene kuttet listen; panelet sier fra. */
  readonly truncated: boolean;
}

const pad = (n: number, w = 2) => String(Math.max(0, Math.floor(n))).padStart(w, "0");
export function msToTimecode(ms: number, fps: Rational): string {
  const rate = fps.num / fps.den, nominal = Math.round(rate);
  const frames = Math.round((ms / 1000) * rate);
  const f = frames % nominal, secs = Math.floor(frames / nominal);
  return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}:${pad(f)}`;
}
const samples = (ms: number, sr: number) => Math.max(0, Math.round((ms / 1000) * sr));
const safe = (s: string) => s.normalize("NFC").replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "lyd";

/** Filnavnet er bare for mennesker; koblingen går på ID-ene i metadata. */
export function auditionFileName(c: AuditionClip, index: number): string {
  return `${pad(index + 1, 3)}_${c.role}_${safe(c.name)}_${c.versionId.slice(0, 8)}.wav`;
}

/** Metadata for én fil. Markørene er de som faller innenfor klippet, relativt til klippets start. */
export function auditionWavMeta(plan: AuditionPlan, c: AuditionClip): BwfMeta {
  const sr = plan.sampleRate;
  const markers: WavMarker[] = plan.markers
    .filter(m => m.ms >= c.offsetMs && m.ms < c.offsetMs + c.lengthMs)
    .map(m => ({ sample: samples(m.ms - c.offsetMs + c.sourceInMs, sr), label: `ptg:${m.kind}:${m.id} ${m.label}`.trim() }));
  const startMs = plan.startMs + c.offsetMs;
  return {
    description: `From Pen to Glass ${plan.sceneLabel} ${c.role} ptg:manifest:${plan.manifestId}`.slice(0, 256),
    originator: "From Pen to Glass", originatorReference: plan.manifestId.slice(0, 32),
    timeReference: samples(startMs, sr), scene: plan.sceneLabel, assetId: c.assetId, clipId: c.clipId ?? "",
    timecode: msToTimecode(startMs, plan.fps), frameRate: plan.fps,
    user: {
      PTG_PROJECT: plan.projectId, PTG_OCCURRENCE: plan.occurrenceId, PTG_SCENE_ID: plan.sceneId, PTG_PANEL: c.panelId ?? "",
      PTG_BLOCK: c.blockId ?? "", PTG_VARIANT: c.variantId, PTG_VERSION: c.versionId, PTG_ROLE: c.role, PTG_MANIFEST: plan.manifestId,
    },
    markers,
  };
}

/** Legger ID-ene inn i en nedlastet WAV uten å endre lyden. Andre formater må konverteres i appen først. */
export function tagAuditionWav(bytes: Uint8Array, plan: AuditionPlan, c: AuditionClip): Uint8Array {
  return retagWav(bytes, auditionWavMeta(plan, c));
}

const xmlEsc = (s: string) => s.replace(/[<>&"']/g, ch => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[ch]!);

/** Multitrack-økt med ett spor per rolle som har klipp, og markører for panel og replikk. Ikke verifisert i Audition. */
export function auditionSesx(plan: AuditionPlan, files: readonly string[]): string {
  const sr = plan.sampleRate;
  const roles = AUDITION_ROLES.filter(r => plan.clips.some(c => c.role === r));
  const tracks = roles.map((role, ti) => {
    const clips = plan.clips.map((c, i) => ({ c, i })).filter(x => x.c.role === role).map(({ c, i }) =>
      `<audioClip id="${i}" fileID="${i}" name="${xmlEsc(c.name)}" startPoint="${samples(c.offsetMs, sr)}" endPoint="${samples(c.offsetMs + c.lengthMs, sr)}" sourceInPoint="${samples(c.sourceInMs, sr)}" sourceOutPoint="${samples(c.sourceInMs + c.lengthMs, sr)}" zOrder="${i}" lockedInTime="false" looped="false" offline="false"><clipParameters><volume value="${Math.pow(10, c.gainDb / 20).toFixed(4)}"/><mute value="${c.muted ? 1 : 0}"/></clipParameters></audioClip>`).join("");
    return `<audioTrack id="${10001 + ti}" index="${ti + 1}" select="false" visible="true"><trackParameters trackHeight="134"><name>${xmlEsc(role)}</name></trackParameters>${clips}</audioTrack>`;
  }).join("");
  const markers = plan.markers.slice(0, AUDITION_MAX_MARKERS).map((m, i) =>
    `<marker id="${i}" name="${xmlEsc(m.label || m.kind)}" comment="ptg:${m.kind}:${xmlEsc(m.id)}" startPoint="${samples(m.ms, sr)}" duration="0" type="${m.kind === "panel" ? "Cue" : "Subclip"}"/>`).join("");
  const fileList = files.map((f, i) => `<file id="${i}" relativePath="${xmlEsc(f)}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE sesx>\n<sesx version="1.9"><session audioChannelType="stereo" bitDepth="32" sampleRate="${sr}" duration="${samples(plan.durationMs, sr)}"><name>${xmlEsc(plan.sceneLabel)}</name><tracks>${tracks}</tracks><Markers>${markers}</Markers><xmpMetadata><ptg manifest="${xmlEsc(plan.manifestId)}" project="${xmlEsc(plan.projectId)}" occurrence="${xmlEsc(plan.occurrenceId)}"/></xmpMetadata></session><files>${fileList}</files></sesx>\n`;
}

export interface AuditionReturnRef {
  readonly projectId: string; readonly manifestId: string; readonly assetId: string; readonly variantId: string;
  readonly versionId: string; readonly clipId: string | null; readonly panelId: string | null; readonly role: string;
}
export type AuditionReturnResult = { readonly ok: true; readonly ref: AuditionReturnRef; readonly markers: readonly WavMarker[] } | { readonly ok: false; readonly reason: "not_wav" | "too_large" | "no_ptg_id" | "wrong_project" };

/** Leser ID-ene fra en redigert fil. Filnavnet brukes aldri. */
export function readAuditionReturn(bytes: Uint8Array, projectId: string): AuditionReturnResult {
  if (bytes.length > AUDITION_MAX_FILE_BYTES) return { ok: false, reason: "too_large" };
  let info;
  try { info = readBwf(bytes); } catch { return { ok: false, reason: "not_wav" }; }
  const x = info.ixml;
  const id = (k: string) => (x[k] && /^[0-9a-zA-Z_-]{1,80}$/.test(x[k]!) ? x[k]! : null);
  const assetId = id("PTG_ASSET"), variantId = id("PTG_VARIANT"), versionId = id("PTG_VERSION"), pid = id("PTG_PROJECT"), manifestId = id("PTG_MANIFEST");
  if (!assetId || !variantId || !versionId || !pid || !manifestId) return { ok: false, reason: "no_ptg_id" };
  if (pid !== projectId) return { ok: false, reason: "wrong_project" };
  return { ok: true, ref: { projectId: pid, manifestId, assetId, variantId, versionId, clipId: id("PTG_CLIP"), panelId: id("PTG_PANEL"), role: x["PTG_ROLE"] ?? "" }, markers: info.markers };
}

/** Målet for C-0-mottaket: ny kandidatversjon i samme variant, med den utsendte versjonen som grunnlag. */
export const auditionUploadTarget = (r: AuditionReturnRef) => ({ assetId: r.assetId, variantId: r.variantId, baseVersionId: r.versionId });
