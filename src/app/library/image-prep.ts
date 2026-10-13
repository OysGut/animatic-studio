/**
 * Forberedelse av bilder før opplasting (Mars 2026-10-13):
 *
 * - TIFF: nettlesere (unntatt Safari) kan ikke vise TIFF, så filen gjøres om til PNG i full størrelse
 *   (tapsfritt for vanlige 8-bits RGB-bilder; 16-bits og CMYK blir 8-bits RGB).
 * - Svært store bilder: en arbeidskopi skaleres ned til det filmen trenger (`workingImageMaxSide`), så
 *   avspilling i nettleseren og sending til AI-tjenester går raskt. Originalen lastes opp i tillegg som egen
 *   versjon, og kan tas i bruk ved å godkjenne den (og angres).
 *
 * Alt skjer i nettleseren; ingenting sendes før brukeren laster opp.
 */
import { ORIGINAL_NOTE_MARK, scaledToFit } from "@/core";

export const TIFF_TYPES = ["image/tiff", "image/tif", "image/x-tiff"];

export function isTiff(file: File): boolean {
  return TIFF_TYPES.includes(file.type) || /\.tiff?$/i.test(file.name);
}

/** Filnavn med ny endelse. */
export function withExtension(name: string, ext: string): string {
  const base = name.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  return `${base || "bilde"}.${ext}`;
}

async function canvasToFile(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  name: string,
): Promise<File> {
  const quality = type === "image/jpeg" || type === "image/webp" ? 0.92 : undefined;
  const blob =
    "convertToBlob" in canvas
      ? await canvas.convertToBlob({ type, ...(quality ? { quality } : {}) })
      : await new Promise<Blob>((ok, fail) =>
          (canvas as HTMLCanvasElement).toBlob(
            (b) => (b ? ok(b) : fail(new Error("Bildet kunne ikke lagres."))),
            type,
            quality,
          ),
        );
  return new File([blob], name, { type: blob.type || type });
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** TIFF → PNG i full størrelse (første side). Kaster med norsk feilmelding. */
export async function tiffToPng(file: File): Promise<File> {
  const UTIF = (await import("utif")).default;
  const buf = await file.arrayBuffer();
  let ifds;
  try {
    ifds = UTIF.decode(buf);
  } catch {
    throw new Error("TIFF-filen kunne ikke leses.");
  }
  const first = ifds[0];
  if (!first) throw new Error("TIFF-filen inneholder ikke noe bilde.");
  UTIF.decodeImage(buf, first);
  const w = first.width;
  const h = first.height;
  if (!w || !h) throw new Error("TIFF-filen har ingen størrelse.");
  if (w * h > 400_000_000)
    throw new Error("TIFF-bildet er for stort til å gjøres om i nettleseren.");
  const rgba = UTIF.toRGBA8(first);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d") as
    OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Nettleseren kan ikke tegne bildet.");
  ctx.putImageData(
    new ImageData(
      new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, w * h * 4),
      w,
      h,
    ),
    0,
    0,
  );
  return canvasToFile(canvas, "image/png", withExtension(file.name, "png"));
}

/** Bredde og høyde, eller null om bildet ikke kan leses. */
export async function imageDims(file: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bmp = await createImageBitmap(file);
    const out = { width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  } catch {
    return null;
  }
}

/** Skaler ned til `maxSide` (samme format; GIF blir PNG, siden en skalert GIF mister animasjonen uansett). */
export async function downscale(
  file: File,
  size: { width: number; height: number },
): Promise<File> {
  const bmp = await createImageBitmap(file, {
    resizeWidth: size.width,
    resizeHeight: size.height,
    resizeQuality: "high",
  });
  try {
    const canvas = makeCanvas(size.width, size.height);
    const ctx = canvas.getContext("2d") as
      OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!ctx) throw new Error("Nettleseren kan ikke tegne bildet.");
    ctx.drawImage(bmp, 0, 0);
    const type = file.type === "image/jpeg" || file.type === "image/webp" ? file.type : "image/png";
    const ext = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
    return await canvasToFile(canvas, type, withExtension(file.name, ext));
  } finally {
    bmp.close();
  }
}

export interface PreparedImage {
  /** Filen som tas i bruk (arbeidskopi, eller selve bildet når det er lite nok). */
  readonly working: File;
  readonly workingNote: string;
  /** Originalen i full størrelse når arbeidskopien er skalert ned, ellers null. */
  readonly original: { readonly file: File; readonly note: string } | null;
}

/**
 * Gjør bildet klart for opplasting. `maxSide` null: ingen nedskalering (brukeren ba om full størrelse).
 */
export async function prepareImage(file: File, maxSide: number | null): Promise<PreparedImage> {
  const tiff = isTiff(file);
  const source = tiff ? await tiffToPng(file) : file;
  const fromTiff = tiff ? `Gjort om fra TIFF («${file.name}»). ` : "";
  const dims = await imageDims(source);
  const target = dims && maxSide ? scaledToFit(dims.width, dims.height, maxSide) : null;
  // Animerte GIF-er skaleres ikke (animasjonen ville gått tapt)
  if (!dims || !target || source.type === "image/gif")
    return { working: source, workingNote: fromTiff.trim(), original: null };
  const working = await downscale(source, target);
  return {
    working,
    workingNote: `${fromTiff}Arbeidskopi skalert ned fra ${dims.width} × ${dims.height} til ${target.width} × ${target.height} px for jevn avspilling. Originalen er versjonen før – godkjenn den for å bruke full størrelse.`,
    original: {
      file: source,
      note: `${fromTiff}${ORIGINAL_NOTE_MARK} (${dims.width} × ${dims.height} px). Brukes ikke før den godkjennes.`,
    },
  };
}
