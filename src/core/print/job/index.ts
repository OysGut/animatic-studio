/**
 * B-087 runde 5: utskriftsjobber med batch, kopier, QR-identitet og tosidig utskrift (§2–§3, §13–§14, A1–A3, A14, A15).
 * Plattformnøytral: ingen React, Supabase eller DOM. Kodene (pepret hash) lages i databasen; her ligger bare
 * normalisering, plan og plassering.
 *
 * Ingen deduplisering (A1–A3): 20 identiske frames gir 20 elementer, og 20 kopier av ett element gir 20 kopier.
 * Ingen funksjon her sammenligner eller slår sammen elementer.
 */
import type { InfoField, PrintInput, PrintItem, Rect } from "../pdf/layout";

export type QrPlacement = "outside" | "figure" | "back";
export type QrCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
export type DuplexFlip = "long" | "short";

/** Felles innstillinger for hele jobben (§13, A14). */
export interface PrintJobSettings {
  readonly mode: PrintItem["mode"];
  readonly strokeWidthMm: number;
  readonly unit: "mm" | "in";
  readonly scale: number;
  readonly qr: QrPlacement;
  readonly qrCorner: QrCorner;
  readonly duplex: boolean;
  readonly flip: DuplexFlip;
  readonly paper: NonNullable<PrintInput["paper"]>;
  readonly orientation: "portrait" | "landscape";
  readonly margins: { top: number; right: number; bottom: number; left: number };
  readonly tiling: boolean;
  readonly idText: boolean;
  readonly copyNumber: boolean;
  /** Informasjonsfeltene fra runde 4 (B-091) gjelder hele batchen. */
  readonly fields: readonly InfoField[];
}

export const DEFAULT_JOB_SETTINGS: PrintJobSettings = {
  mode: "figure-cut",
  strokeWidthMm: 0.1,
  unit: "mm",
  scale: 1,
  qr: "outside",
  qrCorner: "bottom-right",
  duplex: false,
  flip: "long",
  paper: "A4",
  orientation: "portrait",
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  tiling: true,
  idText: true,
  copyNumber: false,
  fields: [],
};

/** Ett element: én figur fra ett lag i én frame, med antall kopier. */
export interface PrintJobElement {
  readonly id: string;
  readonly layerId: string;
  readonly versionId: string;
  readonly sceneId: string;
  readonly frame: number;
  readonly maskId: string | null;
  readonly copies: number;
  /** Egne merknader og opp-pil per element (kopiene arver dem). */
  readonly note: string;
  readonly upArrow: boolean;
}

/** Én fysisk kopi. Kopiene av samme element peker til samme scene og frame (§14). */
export interface PrintCopy {
  readonly id: string;
  readonly elementId: string;
  readonly copyNumber: number;
}

export const MAX_JOB_ELEMENTS = 500;
export const MAX_COPIES_PER_ELEMENT = 200;
export const MAX_JOB_COPIES = 2000;

/** Kjernefeil (nøkkel, ikke tekst). Null = gyldig. */
export function printJobError(settings: PrintJobSettings, elements: readonly PrintJobElement[]): string | null {
  if (elements.length === 0) return "print-job.empty";
  if (elements.length > MAX_JOB_ELEMENTS) return "print-job.too-many";
  let total = 0;
  for (const e of elements) {
    if (!Number.isInteger(e.copies) || e.copies < 1 || e.copies > MAX_COPIES_PER_ELEMENT) return "print-job.copies";
    if (!Number.isInteger(e.frame) || e.frame < 0) return "print-job.frame";
    if (e.note.length > 500) return "print-job.note";
    total += e.copies;
  }
  if (total > MAX_JOB_COPIES) return "print-job.too-many";
  if (!(settings.strokeWidthMm >= 0.05 && settings.strokeWidthMm <= 0.3)) return "print-job.stroke";
  if (!(settings.scale > 0 && settings.scale <= 10)) return "print-job.scale";
  return null;
}

type Base = Omit<PrintJobElement, "id" | "frame" | "copies">;

/** «denne framen × N» */
export function thisFrameTimes(base: Base, frame: number, n: number, newId: () => string): PrintJobElement[] {
  return [{ ...base, id: newId(), frame, copies: n }];
}
/** «frame X–Y»: ett element per frame, også når frames er identiske (A3). */
export function frameRange(base: Base, from: number, to: number, newId: () => string): PrintJobElement[] {
  return frameRangeTimes(base, from, to, 1, newId);
}
/** «frame X–Y × N kopier hver» */
export function frameRangeTimes(base: Base, from: number, to: number, n: number, newId: () => string): PrintJobElement[] {
  const [a, b] = from <= to ? [from, to] : [to, from];
  const out: PrintJobElement[] = [];
  for (let f = a; f <= b; f++) out.push({ ...base, id: newId(), frame: f, copies: n });
  return out;
}

/**
 * Kopiene for jobben. Eksisterende kopier gjenbrukes (ny utskrift med samme koder); nye lages bare for
 * manglende kopinumre. Ingen sammenslåing av like elementer.
 */
export function planCopies(
  elements: readonly PrintJobElement[],
  existing: readonly PrintCopy[],
  newId: () => string,
): PrintCopy[] {
  const out: PrintCopy[] = [];
  for (const e of elements) {
    for (let n = 1; n <= e.copies; n++) {
      const old = existing.find((c) => c.elementId === e.id && c.copyNumber === n);
      out.push(old ?? { id: newId(), elementId: e.id, copyNumber: n });
    }
  }
  return out;
}

export interface JobTotals {
  readonly elements: number;
  readonly copies: number;
  readonly sheets: number;
}
export function jobTotals(elements: readonly PrintJobElement[], sheets: number): JobTotals {
  return { elements: elements.length, copies: elements.reduce((s, e) => s + e.copies, 0), sheets };
}

/** Frame og tid per kopi (h:mm:ss:ff), som i scenetidslinjen. */
export function frameTimeLabel(frame: number, fps: number): string {
  const f = Math.max(0, Math.round(frame));
  const r = Math.max(1, Math.round(fps));
  const s = Math.floor(f / r);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}:${two(f % r)}`;
}

export interface CopyResolved {
  readonly copy: PrintCopy;
  readonly element: PrintJobElement;
  /** Figur, kontur, bilde og størrelse fra runde 4 (samme for alle kopier av elementet). */
  readonly item: Omit<PrintItem, "id" | "fields" | "upArrow" | "reserveQr" | "mode" | "strokeWidthMm">;
  readonly frameLabel: string;
  readonly idLabel: string;
}

/**
 * Én PrintItem per fysisk kopi (A1, A14): felles innstillinger fra jobben, egen frame/tid, egne merknader,
 * opp-pil og plass til QR.
 */
/** Felt som alltid beregnes per kopi. */
export const PER_COPY_FIELDS: ReadonlySet<string> = new Set(["time", "frame", "id", "copy", "note"]);

export function jobPrintItems(settings: PrintJobSettings, copies: readonly CopyResolved[]): PrintItem[] {
  return copies.map(({ copy, element, item, frameLabel, idLabel }) => {
    const own: InfoField[] = [
      { key: "frame", value: frameLabel, enabled: true },
      ...(settings.idText ? [{ key: "id", value: idLabel, enabled: true }] : []),
      ...(settings.copyNumber ? [{ key: "copy", value: `#${copy.copyNumber}/${element.copies}`, enabled: true }] : []),
      ...(element.note ? [{ key: "note", value: element.note, enabled: true }] : []),
    ];
    return {
      ...item,
      id: copy.id,
      mode: settings.mode,
      strokeWidthMm: settings.strokeWidthMm,
      // Frame/tid er per kopi: felles felt med samme nøkkel (fra runde 4, gjeldende frame) tas ikke med.
      fields: [...settings.fields.filter((f) => !PER_COPY_FIELDS.has(f.key)), ...own],
      upArrow: element.upArrow,
      reserveQr: settings.qr === "outside",
    };
  });
}

/* ---------------------------------------------------------------- koder */

/** Crockford base32 (uten I, L, O, U). */
export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const SHORT_CODE_LENGTH = 8;

/** Normaliserer en kode skrevet inn for hånd: store bokstaver, O→0, I/L→1, uten mellomrom og bindestrek. */
export function normalizeShortCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (s.length !== SHORT_CODE_LENGTH) return null;
  for (const ch of s) if (!CROCKFORD.includes(ch)) return null;
  return s;
}
/** Visning: XXXX-XXXX. */
export function formatShortCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
/** Kort kode fra 40 bit (5 byte) – samme regel som databasen bruker. */
export function shortCodeFromBytes(bytes: Uint8Array): string {
  let bits = 0n;
  for (let i = 0; i < 5; i++) bits = (bits << 8n) | BigInt(bytes[i] ?? 0);
  let out = "";
  for (let i = SHORT_CODE_LENGTH - 1; i >= 0; i--) out += CROCKFORD[Number((bits >> BigInt(i * 5)) & 31n)];
  return out;
}
/** Den avledede nøkkelen i QR-koden: 43 tegn base64url (32 byte). Ingenting annet står i URL-en. */
export const COPY_KEY_RE = /^[A-Za-z0-9_-]{43}$/;
export function copyLookupPath(key: string): string {
  return `/k/${key}`;
}

/* ---------------------------------------------------------------- QR-plassering og bakside */

export const QR_SIZE_MM = 12;

/** QR-feltet for en figur. «outside»: under figuren i infofeltet. «figure»: valgt hjørne eller midten. */
export function qrRect(figure: Rect, settings: PrintJobSettings, infoTop: number): Rect | null {
  const s = QR_SIZE_MM;
  if (settings.qr === "outside") return { x: figure.x, y: infoTop, width: s, height: s };
  if (settings.qr === "figure") {
    const pad = 2;
    const x = settings.qrCorner.endsWith("left") ? figure.x + pad : settings.qrCorner === "center" ? figure.x + (figure.width - s) / 2 : figure.x + figure.width - s - pad;
    const y = settings.qrCorner.startsWith("top") ? figure.y + pad : settings.qrCorner === "center" ? figure.y + (figure.height - s) / 2 : figure.y + figure.height - s - pad;
    return { x, y, width: s, height: s };
  }
  return null;
}

export interface DuplexOffset {
  readonly x: number;
  readonly y: number;
}

/**
 * Baksiden: rektangelet speiles slik at det havner bak figuren når arket vendes (lang eller kort kant),
 * og forskyvningen fra testarket legges til.
 */
export function backsideRect(r: Rect, paper: { width: number; height: number }, flip: DuplexFlip, offset: DuplexOffset): Rect {
  if (flip === "long") return { x: paper.width - r.x - r.width + offset.x, y: r.y + offset.y, width: r.width, height: r.height };
  return { x: r.x + offset.x, y: paper.height - r.y - r.height + offset.y, width: r.width, height: r.height };
}

/** QR på baksiden sentreres bak figuren. */
export function backQrRect(figure: Rect, paper: { width: number; height: number }, flip: DuplexFlip, offset: DuplexOffset): Rect {
  const s = QR_SIZE_MM;
  const centered = { x: figure.x + (figure.width - s) / 2, y: figure.y + (figure.height - s) / 2, width: s, height: s };
  return backsideRect(centered, paper, flip, offset);
}

/** Testark for tosidig utskrift: kryssmerker i mm (forside). Baksiden får de samme speilet. */
export function duplexTestMarks(paper: { width: number; height: number }): { x: number; y: number }[] {
  const m = 20;
  return [
    { x: m, y: m },
    { x: paper.width - m, y: m },
    { x: m, y: paper.height - m },
    { x: paper.width - m, y: paper.height - m },
    { x: paper.width / 2, y: paper.height / 2 },
  ];
}
export function validDuplexOffset(o: DuplexOffset): boolean {
  return Number.isFinite(o.x) && Number.isFinite(o.y) && Math.abs(o.x) <= 20 && Math.abs(o.y) <= 20;
}
