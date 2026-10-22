/**
 * PTG3b (B-115): tittelkort med QR foran hvert skudd i After Effects-pakken, og importen tilbake.
 * - Tittelkortet varer TITLE_CARD_SECONDS og ligger i en egen komposisjon FORAN skuddkomposisjonen,
 *   så skuddets bilde 0 og tidskode er de samme som i skuddlisten og FBX-filen.
 * - QR-innholdet er bare en ikke-hemmelig referanse (prosjekt-ID, sceneforekomst-ID, skuddnavn, lengde);
 *   lenken krever innlogging og prosjekttilgang.
 * - Importen klipper bort første sekund når filmen er ett sekund lengre enn skuddet (eller QR-en er funnet).
 * Ren TypeScript uten nettleser-API.
 */
import { secondsToFrames, type Rational } from "../time";

export const TITLE_CARD_SECONDS = 1;
export const PTG_IMPORT_PATH = "/ptg/i";

const UUID = /^[0-9a-f-]{36}$/;
const NAME = /^[A-Z0-9-]{1,32}_SC\d{3}[A-Z]?_SH\d{3}_v\d{3}$/;

export interface PtgImportRef {
  readonly projectId: string;
  readonly occurrenceId: string;
  /** Skuddnavnet fra PTG1, med utvekslingsversjon (PROSJEKT_SC012_SH010_v003). */
  readonly name: string;
  /** Skuddets lengde i bilder på tidslinjen (uten tittelkort). */
  readonly lengthFrames: number;
}

/** URL-en i QR-koden: `<origin>/ptg/i?p=…&o=…&n=…&f=…`. Ingen token. */
export function ptgImportUrl(origin: string, r: PtgImportRef): string {
  const q = `p=${encodeURIComponent(r.projectId)}&o=${encodeURIComponent(r.occurrenceId)}&n=${encodeURIComponent(r.name)}&f=${r.lengthFrames}`;
  return `${origin.replace(/\/+$/, "")}${PTG_IMPORT_PATH}?${q}`;
}

/** Leser og validerer søkeparametrene. Null ved noe ukjent (gir nøytral melding). */
export function parsePtgImport(s: Record<string, unknown>): PtgImportRef | null {
  const p = String(s["p"] ?? ""); const o = String(s["o"] ?? ""); const n = String(s["n"] ?? "");
  const f = Number(s["f"]);
  if (!UUID.test(p) || !UUID.test(o) || !NAME.test(n) || !Number.isInteger(f) || f < 0 || f > 10_000_000) return null;
  return { projectId: p, occurrenceId: o, name: n, lengthFrames: f };
}

/** Tolker en avkodet QR-tekst som PTG-referanse (uavhengig av domenet). */
export function parsePtgImportUrl(text: string): PtgImportRef | null {
  const i = text.indexOf(`${PTG_IMPORT_PATH}?`);
  if (i < 0) return null;
  const params: Record<string, string> = {};
  for (const part of text.slice(i + PTG_IMPORT_PATH.length + 1).split("&")) {
    const [k, v = ""] = part.split("=");
    if (k) params[k] = decodeURIComponent(v);
  }
  return parsePtgImport(params);
}

export interface TitleCardDecision {
  /** Sekunder som klippes bort fra starten (0 eller TITLE_CARD_SECONDS). */
  readonly trimSeconds: number;
  /** Lengden i bilder etter klipping. */
  readonly frames: number;
  /** Sant når lengden etter klipping ikke stemmer med skuddet (mer enn ett bilde avvik). */
  readonly lengthMismatch: boolean;
}

/**
 * Kjenner igjen tittelkortet: QR funnet i første bilde, eller filmen er ett sekund (± ett bilde) lengre enn
 * skuddet. Da klippes første sekund bort. Advarsel hvis lengden etterpå avviker mer enn ett bilde.
 */
export function decideTitleCardTrim(o: {
  readonly durationSeconds: number; readonly expectedFrames: number; readonly fps: Rational; readonly qrFound?: boolean;
}): TitleCardDecision {
  const total = secondsToFrames(o.durationSeconds, o.fps);
  const card = secondsToFrames(TITLE_CARD_SECONDS, o.fps);
  const looksLikeCard = Math.abs(total - (o.expectedFrames + card)) <= 1;
  const trim = (o.qrFound || looksLikeCard) && total > card;
  const frames = trim ? total - card : total;
  return { trimSeconds: trim ? TITLE_CARD_SECONDS : 0, frames, lengthMismatch: Math.abs(frames - o.expectedFrames) > 1 };
}

/** Tekstene på tittelkortet (på brukerens grensesnittspråk, oversatt av den som kaller). */
export interface TitleCardTexts {
  readonly filmTitle: string;
  readonly sceneLine: string;
  readonly explain: string;
  readonly footer: string;
}

// ---- PNG (gråtone, ukomprimert deflate) for QR-bildet: ren TypeScript, ingen canvas ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function u32(v: number): number[] { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; }
function chunk(type: string, data: Uint8Array): number[] {
  const td = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) td[i] = type.charCodeAt(i);
  td.set(data, 4);
  return [...u32(data.length), ...td, ...u32(crc32(td))];
}

/**
 * Tegner en QR-matrise (true = mørk modul) som PNG: `scale` piksler per modul og `margin` moduler stille sone.
 * Mørk = 0, lys = 255 (høy kontrast for skanning; kortet rundt følger appens farger).
 */
export function qrMatrixToPng(matrix: readonly (readonly boolean[])[], scale = 10, margin = 4): Uint8Array {
  const n = matrix.length;
  const size = (n + margin * 2) * scale;
  const raw = new Uint8Array((size + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0;
    const my = Math.floor(y / scale) - margin;
    for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / scale) - margin;
      const dark = my >= 0 && my < n && mx >= 0 && mx < n && matrix[my]![mx]!;
      raw[y * (size + 1) + 1 + x] = dark ? 0 : 255;
    }
  }
  // zlib med lagrede (ukomprimerte) blokker
  const blocks: number[] = [0x78, 0x01];
  for (let i = 0; i < raw.length; i += 65535) {
    const len = Math.min(65535, raw.length - i);
    blocks.push(i + len >= raw.length ? 1 : 0, len & 255, len >>> 8, ~len & 255, (~len >>> 8) & 255);
    for (let k = 0; k < len; k++) blocks.push(raw[i + k]!);
  }
  let a = 1, b = 0;
  for (let i = 0; i < raw.length; i++) { a = (a + raw[i]!) % 65521; b = (b + a) % 65521; }
  blocks.push(...u32(((b << 16) | a) >>> 0));
  const ihdr = new Uint8Array([...u32(size), ...u32(size), 8, 0, 0, 0, 0]);
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk("IHDR", ihdr), ...chunk("IDAT", new Uint8Array(blocks)), ...chunk("IEND", new Uint8Array())]);
}
