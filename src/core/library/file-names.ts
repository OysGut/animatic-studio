/**
 * Filnavn for bilder og lyd som lastes ned fra biblioteket (DEC-0064): «Ressurs - Variant - vN.png».
 * Egen modul uten tunge importer (brukes også av zip-nedlastingen).
 */
import type { AssetVersion, ProjectState } from "../model";

const EXT_FOR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/webm": "webm",
};

/** Tegn som ikke er lov i filnavn (Windows og macOS) byttes ut; mellomrom samles. */
function safe(part: string): string {
  return (
    part
      .normalize("NFC")
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
      .replace(/\s+/g, " ")
      .trim() || "uten navn"
  );
}

/** Filnavnet uten filtype: «Ressurs - Variant - vN». null hvis versjonen mangler ressurs eller variant. */
export function versionFileBase(s: ProjectState, v: AssetVersion): string | null {
  const va = s.assetVariants[v.variantId];
  const a = va ? s.assets[va.assetId] : undefined;
  if (!va || !a) return null;
  return `${safe(a.name)} - ${safe(va.name)} - v${v.number}`;
}

/** Hele filnavnet for nedlasting. */
export function versionFileName(s: ProjectState, v: AssetVersion): string {
  const base = versionFileBase(s, v) ?? "bilde";
  const fromPath = /\.([a-z0-9]{2,5})$/i.exec(v.mediaPath)?.[1]?.toLowerCase();
  return `${base}.${EXT_FOR_MIME[v.mimeType] ?? fromPath ?? "png"}`;
}
