/**
 * Mobilbroen (fase 2, bolk A, DEC-0090): opplastingsøkter bak QR-koder og delte lenker, og filene som kommer
 * fra mobilen. Ren TypeScript: konteksten (hvor filene skal), grenser, filtyper, lagringssti og sjekk av
 * filinnholdet. Server og nettleser bruker de samme reglene.
 */
import { isPartSlot } from "../animation/parts";

import { isUuid } from "../ids";
import { t as tk } from "@/core/i18n/keyed";

/** Hvor filene fra en økt skal (Mars: «for ulike scener genereres selvsagt ulike qr koder så alt havner rett»). */
export type UploadContext =
  | { readonly type: "rig"; readonly purpose: "mouth_shape" | "rig_part"; readonly target: { readonly assetId: string; readonly variantId: string; readonly sourceVersionId: string; readonly slot: string } }

  | { readonly type: "project" }
  | { readonly type: "asset"; readonly assetId: string; readonly variantId?: string | undefined }
  /** En ressurs under opprettelse (ikke lagret ennå). Knyttes til ressursen når den lagres. */
  | {
      readonly type: "draft";
      readonly draftKey: string;
      readonly assetKind?: string | undefined;
      readonly assetId?: string | undefined;
    }
  | { readonly type: "occurrence"; readonly occurrenceId: string }
  /** Opptak (takes) til en lydressurs (fase 2, bolk B, REQ-0684). */
  | { readonly type: "sound"; readonly assetId: string; readonly variantId?: string | undefined }
  /** Opptak av en replikk i en scene (bolk B, REQ-0685): mobilen viser hele replikken. */
  | { readonly type: "line"; readonly occurrenceId: string; readonly blockId: string; readonly clipId?: string }
  /** Bildeplassen til et lag i sceneeditoren: nytt bilde av lagets ressurs. */
  | {
      readonly type: "layer";
      readonly layerId: string;
      readonly assetId: string;
      readonly variantId?: string | undefined;
    };

export type MobileMediaKind = "image" | "video" | "audio";

/** Egen QR-kode: ingen innlogging på telefonen, 2 timer (DEC-0090). */
export const PERSONAL_SESSION_MS = 2 * 60 * 60 * 1000;
/** Delt lenke: 7 dager, kan tilbakekalles (DEC-0090). */
export const SHARED_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const PERSONAL_MAX_FILES = 1000;
export const PERSONAL_MAX_BYTES = 20 * 1024 ** 3;
export const SHARED_MAX_FILES = 200;
export const SHARED_MAX_BYTES = 5 * 1024 ** 3;
/**
 * Største videofil i nettversjonen (DEC-0090, REQ-0679). Grensen gjelder bare nettversjonen (lagringen i
 * skyen); i desktopversjonen er det ingen grense (R6, se `videoMaxBytes`).
 */
export const MOBILE_VIDEO_MAX_BYTES = 500 * 1024 * 1024;

/** R6 (REQ-0679): hvilken utgave av appen koden kjører i. Nettversjonen i dag; en desktopversjon setter «desktop». */
export type AppTarget = "web" | "desktop";
export const APP_TARGET: AppTarget = "web";

/** R6 (REQ-0679): største videofil – 500 MB i nettversjonen, ingen grense (null) i desktopversjonen. */
export function videoMaxBytes(target: AppTarget = APP_TARGET): number | null {
  return target === "desktop" ? null : MOBILE_VIDEO_MAX_BYTES;
}
export const MOBILE_IMAGE_MAX_BYTES = 100 * 1024 * 1024;
export const MOBILE_AUDIO_MAX_BYTES = 400 * 1024 * 1024;

export const MOBILE_IMAGE_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
export const MOBILE_VIDEO_TYPES: readonly string[] = ["video/mp4", "video/quicktime", "video/webm"];
export const MOBILE_AUDIO_TYPES: readonly string[] = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/flac",
];

/** Filtypen ut fra MIME, eller null når den ikke tas imot. */
export function mediaKindOf(mime: string): MobileMediaKind | null {
  const m = mime.toLowerCase().split(";")[0]!.trim();
  if (MOBILE_IMAGE_TYPES.includes(m)) return "image";
  if (MOBILE_VIDEO_TYPES.includes(m)) return "video";
  if (MOBILE_AUDIO_TYPES.includes(m)) return "audio";
  return null;
}

export function maxBytesFor(kind: MobileMediaKind, target: AppTarget = APP_TARGET): number {
  return kind === "video"
    ? (videoMaxBytes(target) ?? Number.POSITIVE_INFINITY)
    : kind === "audio"
      ? MOBILE_AUDIO_MAX_BYTES
      : MOBILE_IMAGE_MAX_BYTES;
}

/** Feilmelding for en fil som ikke kan lastes opp her, eller null. */
export function checkMobileFile(
  mime: string,
  bytes: number,
  allowed: readonly MobileMediaKind[],
  target: AppTarget = APP_TARGET,
): string | null {
  const kind = mediaKindOf(mime);
  if (!kind)
    return tk("core-mobile-index.check-mobile-file.message.70c465bdd29d");
  if (!allowed.includes(kind))
    return kind === "video"
      ? tk("core-mobile-index.check-mobile-file.message.e770eba5c6e8")
      : kind === "audio"
        ? tk("core-mobile-index.check-mobile-file.message.47b1ed91e3c0")
        : tk("core-mobile-index.check-mobile-file.message.46b51e56c6dc");
  if (!Number.isFinite(bytes) || bytes <= 0) return tk("core-mobile-index.check-mobile-file.message.4129d3a6024f");
  const max = maxBytesFor(kind, target);
  if (bytes > max)
    return kind === "video"
      ? tk("core-mobile-index.check-mobile-file.message.e8bac3f52697", { value1: String(Math.round(max / 1024 ** 2)) })
      : tk("core-mobile-index.check-mobile-file.message.0158cfbac0b7", { value1: String(Math.round(max / 1024 ** 2)) });
  return null;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/flac": "flac",
};

/** Lagringsstien for en fil fra mobilen: `<prosjekt>/source/mobile/<økt>/<fil-ID>.<ext>` (REQ-0415). */
export function mobileFilePath(
  projectId: string,
  sessionId: string,
  clientFileId: string,
  mime: string,
): string {
  const ext = EXT[mime.toLowerCase().split(";")[0]!.trim()] ?? "bin";
  return `${projectId}/source/mobile/${sessionId}/${clientFileId}.${ext}`; // i18n-ignore
}

/**
 * Stemmer filens første bytes med typen den sier den er? Hindrer at noe annet lastes opp med feil merkelapp.
 * `head` er minst de 16 første bytene.
 */
export function sniffMatches(mime: string, head: Uint8Array): boolean {
  const m = mime.toLowerCase().split(";")[0]!.trim();
  const at = (i: number, ...bs: number[]) => bs.every((b, k) => head[i + k] === b);
  const ascii = (i: number, s: string) => [...s].every((c, k) => head[i + k] === c.charCodeAt(0));
  switch (m) {
    case "image/jpeg":
      return at(0, 0xff, 0xd8, 0xff);
    case "image/png":
      return at(0, 0x89, 0x50, 0x4e, 0x47);
    case "image/gif":
      return ascii(0, "GIF8");
    case "image/webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "video/mp4":
    case "video/quicktime":
    case "audio/mp4":
    case "audio/x-m4a":
      return ascii(4, "ftyp") || ascii(4, "moov") || ascii(4, "mdat") || ascii(4, "wide");
    case "video/webm":
    case "audio/webm":
      return at(0, 0x1a, 0x45, 0xdf, 0xa3);
    case "audio/wav":
    case "audio/x-wav":
    case "audio/wave":
      return ascii(0, "RIFF") && ascii(8, "WAVE");
    case "audio/ogg":
      return ascii(0, "OggS");
    case "audio/flac":
      return ascii(0, "fLaC");
    case "audio/mpeg":
      return ascii(0, "ID3") || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0);
    case "audio/aac":
      return head[0] === 0xff && ((head[1] ?? 0) & 0xf0) === 0xf0;
    default:
      return false;
  }
}

/** Kontrollerer en kontekst fra nettleseren (bare kjente felt, gyldige ID-er). Gir null når den er ugyldig. */
export function parseUploadContext(v: unknown): UploadContext | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const id = (k: string) =>
    typeof o[k] === "string" && isUuid(o[k] as string) ? (o[k] as string) : null;
  const optId = (k: string) => (o[k] === undefined || o[k] === null ? undefined : (id(k) ?? false));
  switch (o["type"]) {
    case "rig": {
      const t = o["target"] as Record<string, unknown> | undefined;
      if (!t || typeof t !== "object" || !["mouth_shape", "rig_part"].includes(String(o["purpose"])) || ![t["assetId"], t["variantId"], t["sourceVersionId"]].every(v => typeof v === "string" && isUuid(v)) || !isPartSlot(t["slot"]) || (o["purpose"] === "mouth_shape") !== String(t["slot"]).startsWith("mouth:")) return null;
      return { type: "rig", purpose: o["purpose"] as "mouth_shape" | "rig_part", target: { assetId: String(t["assetId"]), variantId: String(t["variantId"]), sourceVersionId: String(t["sourceVersionId"]), slot: String(t["slot"]) } };
    }
    case "project":
      return { type: "project" };
    case "asset": {
      const assetId = id("assetId");
      const variantId = optId("variantId");
      if (!assetId || variantId === false) return null;
      return { type: "asset", assetId, ...(variantId ? { variantId } : {}) };
    }
    case "draft": {
      const draftKey = id("draftKey");
      const kind = typeof o["assetKind"] === "string" ? (o["assetKind"] as string) : undefined;
      if (!draftKey || (kind !== undefined && !/^[a-z]{2,20}$/.test(kind))) return null;
      return { type: "draft", draftKey, ...(kind ? { assetKind: kind } : {}) };
    }
    case "occurrence": {
      const occurrenceId = id("occurrenceId");
      return occurrenceId ? { type: "occurrence", occurrenceId } : null;
    }
    case "sound": {
      const assetId = id("assetId");
      const variantId = optId("variantId");
      if (!assetId || variantId === false) return null;
      return { type: "sound", assetId, ...(variantId ? { variantId } : {}) };
    }
    case "line": {
      const occurrenceId = id("occurrenceId");
      const blockId = id("blockId");
      const clipId = optId("clipId");
      return occurrenceId && blockId && clipId !== false ? { type: "line", occurrenceId, blockId, ...(clipId ? { clipId } : {}) } : null;
    }
    case "layer": {
      const layerId = id("layerId");
      const assetId = id("assetId");
      const variantId = optId("variantId");
      if (!layerId || !assetId || variantId === false) return null;
      return { type: "layer", layerId, assetId, ...(variantId ? { variantId } : {}) };
    }
    default:
      return null;
  }
}

/** Filtypene en kontekst tar imot (bilder og video for ressurser; bare lyd for opptak, bolk B). */
export function mediaKindsFor(c: UploadContext): MobileMediaKind[] {
  switch (c.type) {
    case "rig":
      return ["image"];
    case "sound":
    case "line":
      return ["audio"];
    case "asset":
    case "draft":
    case "layer":
      return ["image", "video"];
    case "occurrence":
    case "project":
      return ["image", "video", "audio"];
  }
}

/** Ressursen en fil skal bli en ny versjon av (null: bare registrert i mobilimporten / scenen). */
export function targetAssetOf(
  c: UploadContext,
  resolvedAssetId?: string | null,
): { assetId: string; variantId?: string | undefined } | null {
  if (c.type === "asset" || c.type === "layer" || c.type === "sound")
    return { assetId: c.assetId, ...(c.variantId ? { variantId: c.variantId } : {}) };
  if (c.type === "draft") {
    const a = resolvedAssetId ?? c.assetId ?? null;
    return a ? { assetId: a } : null;
  }
  return null;
}

/** Et frivillig navn fra bidragsyteren (trimmet, uten styretegn). */
export function cleanContributorName(v: unknown): string {
  if (typeof v !== "string") return "";
  return [...v]
    .filter((c) => {
      const n = c.charCodeAt(0);
      return n >= 32 && n !== 127;
    })
    .join("")
    .trim()
    .slice(0, 100);
}

// ---------------------------------------------------------------- lydopptak (bolk B)

/** Filnavnet på et opptak fra mobilen: «take-03.webm» eller «romlyd-01.m4a» (romlyd, REQ-0690). */
export function takeFileName(n: number, ext: string, roomTone = false): string {
  const nr = String(Math.max(1, Math.floor(n))).padStart(2, "0");
  return `${roomTone ? ROOM_TONE_PREFIX : "take"}-${nr}.${ext}`; // i18n-ignore: filnavn
}

/** Romlyd kjennes igjen på filnavnet (mobilimporten har ingen egen kolonne for det). */
export const ROOM_TONE_PREFIX = "romlyd"; // i18n-ignore: filnavn
export function isRoomToneFile(fileName: string): boolean {
  return fileName.toLowerCase().startsWith(`${ROOM_TONE_PREFIX}-`);
}

/** «Take 01», «Take 02» … (nummer fra 1). */
export function audioTakeLabel(n: number): string {
  return `Take ${String(Math.max(1, Math.floor(n))).padStart(2, "0")}`; // i18n-ignore: fagord
}

/** «0:12», «1:05» – lengden på et opptak. */
export function formatTakeLength(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "–";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Replikken mobilen viser under opptak (REQ-0685). */
export interface MobileScript {
  readonly speaker: string;
  readonly parenthetical: string;
  readonly text: string;
}

/**
 * Finner replikken og hvem som sier den, fra blokkene i scenevarianten i manusrekkefølge (serveren har ikke
 * hele prosjekttilstanden). Null når blokken ikke er en replikk.
 */
export function scriptForLine(
  blocks: readonly { readonly id: string; readonly kind: string; readonly text: string }[],
  blockId: string,
): MobileScript | null {
  const i = blocks.findIndex((b) => b.id === blockId);
  const block = blocks[i];
  if (!block || block.kind !== "dialogue") return null;
  let speaker = "";
  let parenthetical = "";
  for (let j = i - 1; j >= 0; j--) {
    const b = blocks[j]!;
    if (b.kind === "parenthetical" && !parenthetical) parenthetical = b.text.trim();
    else if (b.kind === "character") {
      speaker = b.text.trim();
      break;
    } else if (b.kind !== "parenthetical" && b.kind !== "dialogue") break;
  }
  return {
    speaker: speaker.slice(0, 200),
    parenthetical: parenthetical.slice(0, 500),
    text: block.text.replace(/\s+/g, " ").trim().slice(0, 5000),
  };
}
