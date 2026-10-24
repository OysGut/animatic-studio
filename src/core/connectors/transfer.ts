/**
 * C-0 overføringer: idempotens, gjenopptakbar opplasting i biter, filtype- og innholdssjekk mot den
 * eksisterende hvitelisten (AE_SAFE_EXTENSIONS fra AE-rettingen) og kandidatversjon uten automatisk bruk.
 */
import { AE_SAFE_EXTENSIONS, extensionOf } from "../interchange/media-formats";

export const CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_TRANSFER_BYTES = 512 * 1024 * 1024;
export const MAX_CHUNKS = Math.ceil(MAX_TRANSFER_BYTES / CHUNK_BYTES);
/** Inntil 64 MiB går bitene gjennom API-et; over det lastes de rett til lagringen med signerte URL-er. */
export const DIRECT_MAX_BYTES = 64 * 1024 * 1024;
export const SIGNED_CHUNK_BYTES = 16 * 1024 * 1024;
export const usesDirectUpload = (byteSize: number) => byteSize > DIRECT_MAX_BYTES;
export const signedChunkCount = (byteSize: number) => Math.max(1, Math.ceil(byteSize / SIGNED_CHUNK_BYTES));
export function expectedSignedChunkSize(byteSize: number, index: number): number {
  const n = signedChunkCount(byteSize);
  if (index < 0 || index >= n) return -1;
  return index < n - 1 ? SIGNED_CHUNK_BYTES : byteSize - SIGNED_CHUNK_BYTES * (n - 1);
}
export const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{16,128}$/;

export type TransferStatus = "reserved" | "uploading" | "received" | "candidate" | "rejected" | "failed";

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", tif: "image/tiff", tiff: "image/tiff",
  psd: "image/vnd.adobe.photoshop", mov: "video/quicktime", mp4: "video/mp4", wav: "audio/wav",
  aif: "audio/aiff", aiff: "audio/aiff", mp3: "audio/mpeg",
};
/** Hvitelisten er nøyaktig AE-listen; ingen egen liste her. */
export const INTAKE_EXTENSIONS: readonly string[] = AE_SAFE_EXTENSIONS;
export const mimeForExtension = (ext: string): string | null => (INTAKE_EXTENSIONS.includes(ext) ? MIME[ext] ?? null : null);

const at = (b: Uint8Array, o: number, s: string) => [...s].every((c, i) => b[o + i] === c.charCodeAt(0));
/** Innholdssjekk på de første bytene. Filendelse alene stoler vi aldri på. */
export function sniffExtension(head: Uint8Array): string | null {
  if (head[0] === 0x89 && at(head, 1, "PNG")) return "png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpg";
  if ((at(head, 0, "II") && head[2] === 42 && head[3] === 0) || (at(head, 0, "MM") && head[2] === 0 && head[3] === 42)) return "tif";
  if (at(head, 0, "8BPS")) return "psd";
  if (at(head, 0, "RIFF") && at(head, 8, "WAVE")) return "wav";
  if (at(head, 0, "FORM") && (at(head, 8, "AIFF") || at(head, 8, "AIFC"))) return "aif";
  if (at(head, 0, "ID3") || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) return "mp3";
  if (at(head, 4, "ftyp")) return at(head, 8, "qt  ") ? "mov" : "mp4";
  if (at(head, 4, "moov") || at(head, 4, "mdat") || at(head, 4, "wide")) return "mov";
  return null;
}
const SAME: Record<string, string> = { jpeg: "jpg", tiff: "tif", aiff: "aif" };
const family = (e: string) => SAME[e] ?? e;

export type IntakeCheck =
  | { ok: true; mimeType: string; extension: string }
  | { ok: false; reason: "extension" | "content" | "mismatch" | "size" | "empty" | "checksum" };

/** Full kontroll før en kandidat lages: størrelse, endelse i hvitelisten, innhold og kontrollsum. */
export function checkIntake(i: { fileName: string; byteSize: number; head: Uint8Array; declaredSha256: string; actualSha256: string }): IntakeCheck {
  if (i.byteSize <= 0) return { ok: false, reason: "empty" };
  if (i.byteSize > MAX_TRANSFER_BYTES) return { ok: false, reason: "size" };
  const ext = extensionOf(i.fileName);
  const mime = mimeForExtension(ext);
  if (!mime) return { ok: false, reason: "extension" };
  const sniffed = sniffExtension(i.head);
  if (!sniffed) return { ok: false, reason: "content" };
  const fe = family(ext);
  // mp4/mov deler ISO-BMFF; begge er i hvitelisten.
  if (fe !== sniffed && !((fe === "mov" || fe === "mp4") && (sniffed === "mov" || sniffed === "mp4"))) return { ok: false, reason: "mismatch" };
  if (i.declaredSha256 !== i.actualSha256) return { ok: false, reason: "checksum" };
  return { ok: true, mimeType: mime, extension: ext };
}

export function chunkCount(byteSize: number): number { return Math.max(1, Math.ceil(byteSize / CHUNK_BYTES)); }
export function expectedChunkSize(byteSize: number, index: number): number {
  const n = chunkCount(byteSize);
  if (index < 0 || index >= n) return -1;
  return index < n - 1 ? CHUNK_BYTES : byteSize - CHUNK_BYTES * (n - 1);
}
/** Gjenopptak: hvilke biter mangler ennå. */
export function missingChunks(byteSize: number, received: readonly number[]): number[] {
  const have = new Set(received);
  return Array.from({ length: chunkCount(byteSize) }, (_, i) => i).filter(i => !have.has(i));
}

/** Målet er enten en ressursvariant (ny kandidatversjon) eller et storyboardpanel (skjult kandidat). */
export type ReserveTarget =
  | { readonly assetId: string; readonly variantId: string }
  | { readonly panelId: string; readonly panelRevision?: number | null };
export const reserveTargetPanel = (t: ReserveTarget): t is { readonly panelId: string; readonly panelRevision?: number | null } => "panelId" in t;

export interface ReserveRequest {
  readonly idempotencyKey: string;
  readonly fileName: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly target: ReserveTarget;
  readonly base: { readonly versionId: string | null };
}
export type ReserveCheck = { ok: true } | { ok: false; reason: "idempotency" | "file" | "size" | "checksum" | "target" };
export function checkReserve(r: ReserveRequest): ReserveCheck {
  if (!IDEMPOTENCY_RE.test(r.idempotencyKey)) return { ok: false, reason: "idempotency" };
  if (typeof r.fileName !== "string" || r.fileName.length < 1 || r.fileName.length > 255 || /[\\/]/.test(r.fileName) || !mimeForExtension(extensionOf(r.fileName))) return { ok: false, reason: "file" };
  if (!Number.isInteger(r.byteSize) || r.byteSize <= 0 || r.byteSize > MAX_TRANSFER_BYTES) return { ok: false, reason: "size" };
  if (!/^[0-9a-f]{64}$/.test(r.sha256)) return { ok: false, reason: "checksum" };
  const t = r.target;
  if (!t || typeof t !== "object") return { ok: false, reason: "target" };
  if (reserveTargetPanel(t)) {
    if (typeof t.panelId !== "string" || !t.panelId) return { ok: false, reason: "target" };
    if (t.panelRevision !== undefined && t.panelRevision !== null && (!Number.isInteger(t.panelRevision) || t.panelRevision < 0)) return { ok: false, reason: "target" };
    return { ok: true };
  }
  if (typeof (t as { assetId?: unknown }).assetId !== "string" || typeof (t as { variantId?: unknown }).variantId !== "string") return { ok: false, reason: "target" };
  return { ok: true };
}

/**
 * Samme idempotensnøkkel gir samme overføring. Ulik forespørsel med samme nøkkel er en feil (409),
 * aldri en ny eller overskrevet overføring.
 */
export function idempotentReplay(existing: { fingerprint: string } | null, fingerprint: string): "new" | "replay" | "conflict" {
  if (!existing) return "new";
  return existing.fingerprint === fingerprint ? "replay" : "conflict";
}
export const reserveFingerprint = (r: ReserveRequest): string =>
  reserveTargetPanel(r.target)
    ? [r.fileName, r.byteSize, r.sha256, "panel", r.target.panelId, r.target.panelRevision ?? "", r.base.versionId ?? ""].join("|")
    : [r.fileName, r.byteSize, r.sha256, r.target.assetId, r.target.variantId, r.base.versionId ?? ""].join("|");
