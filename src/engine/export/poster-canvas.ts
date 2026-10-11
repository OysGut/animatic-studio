/**
 * Plakaten tegnet på et lerret (PNG-eksport) og bildene klargjort for trykk-PDF-en (DEC-0061).
 * Samme tegneliste som forhåndsvisningen og PDF-en; teksten plasseres tegn for tegn med standardskriftenes
 * mål når den er sperret, så linjene blir like lange overalt.
 */
import { CSS_FONT, PT_TO_MM, textWidthPt, type RenderOp } from "@/core";
import { imagePixelNeeds, type PdfImage } from "./poster-pdf";

type Img = CanvasImageSource & { readonly width: number; readonly height: number };

function cssFont(op: Extract<RenderOp, { op: "text" }>, pxPerMm: number): string {
  const bold = op.font === "sansBold" || op.font === "serifBold";
  const italic = op.font === "serifItalic";
  return `${italic ? "italic " : ""}${bold ? "700 " : "400 "}${op.size * PT_TO_MM * pxPerMm}px ${CSS_FONT[op.font]}`;
}

function withRotation(
  ctx: CanvasRenderingContext2D,
  o: { x: number; y: number; w: number; h: number; rotation: number },
  s: number,
) {
  if (!o.rotation) return;
  const cx = (o.x + o.w / 2) * s;
  const cy = (o.y + o.h / 2) * s;
  ctx.translate(cx, cy);
  ctx.rotate((o.rotation * Math.PI) / 180);
  ctx.translate(-cx, -cy);
}

/** Tegner plakaten. `pxPerMm` er oppløsningen; `images` er bildene etter mediesti. */
export function drawPosterOps(
  ctx: CanvasRenderingContext2D,
  ops: readonly RenderOp[],
  pxPerMm: number,
  images: ReadonlyMap<string, Img>,
): void {
  const s = pxPerMm;
  for (const o of ops) {
    ctx.save();
    if (o.op === "rect") {
      withRotation(ctx, o, s);
      ctx.globalAlpha = o.opacity;
      ctx.beginPath();
      if (o.radius > 0) ctx.roundRect(o.x * s, o.y * s, o.w * s, o.h * s, o.radius * s);
      else ctx.rect(o.x * s, o.y * s, o.w * s, o.h * s);
      if (o.fill) {
        ctx.fillStyle = o.fill;
        ctx.fill();
      }
      if (o.stroke && o.strokeWidth > 0) {
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.strokeWidth * s;
        ctx.stroke();
      }
    } else if (o.op === "line") {
      ctx.globalAlpha = o.opacity;
      ctx.strokeStyle = o.stroke;
      ctx.lineWidth = o.strokeWidth * s;
      ctx.lineCap = "round";
      if (o.dashed) ctx.setLineDash([o.strokeWidth * 3 * s, o.strokeWidth * 2.5 * s]);
      ctx.beginPath();
      ctx.moveTo(o.x1 * s, o.y1 * s);
      ctx.lineTo(o.x2 * s, o.y2 * s);
      ctx.stroke();
    } else if (o.op === "image") {
      withRotation(ctx, o, s);
      ctx.globalAlpha = o.opacity;
      const img = images.get(o.mediaPath);
      if (!img) {
        ctx.strokeStyle = "#999999";
        ctx.lineWidth = 0.5 * s;
        ctx.strokeRect(o.x * s, o.y * s, o.w * s, o.h * s);
      } else {
        if (o.clip) {
          ctx.beginPath();
          ctx.rect(o.x * s, o.y * s, o.w * s, o.h * s);
          ctx.clip();
        }
        ctx.drawImage(img, o.ix * s, o.iy * s, o.iw * s, o.ih * s);
      }
    } else if (o.op === "text") {
      withRotation(ctx, o, s);
      ctx.globalAlpha = o.opacity;
      ctx.fillStyle = o.color;
      ctx.font = cssFont(o, s);
      ctx.textBaseline = "alphabetic";
      for (const l of o.lines) {
        if (!o.tracking) {
          ctx.fillText(l.text, l.x * s, l.y * s);
          continue;
        }
        // Sperret tekst: tegn for tegn med standardskriftens mål
        let x = l.x;
        for (const ch of l.text) {
          ctx.fillText(ch, x * s, l.y * s);
          x += (textWidthPt(ch, o.font, o.size) + (o.tracking / 1000) * o.size) * PT_TO_MM;
        }
      }
    }
    ctx.restore();
  }
}

/** Høyeste oppløsning (px/mm) som holder lerretet under nettlesernes grense (Safari: 16,7 Mpx). */
export function maxPxPerMm(widthMm: number, heightMm: number, ppi: number): number {
  const wanted = ppi / 25.4;
  const cap = Math.sqrt(16_000_000 / (widthMm * heightMm));
  return Math.min(wanted, cap);
}

/** Største bilde (piksler) nettleserne kan tegne på et lerret (Safari: ca. 16,7 Mpx). */
export const MAX_CANVAS_PIXELS = 16_000_000;

/** Henter et bilde som kan tegnes, høyst `maxW` × `maxH` og høyst MAX_CANVAS_PIXELS. */
export async function fetchBitmap(url: string, maxW?: number, maxH?: number): Promise<ImageBitmap> {
  if (maxW && maxH && maxW * maxH > MAX_CANVAS_PIXELS) {
    const k = Math.sqrt(MAX_CANVAS_PIXELS / (maxW * maxH));
    maxW = Math.max(1, Math.floor(maxW * k));
    maxH = Math.max(1, Math.floor(maxH * k));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bildet kunne ikke hentes (${res.status})`);
  const blob = await res.blob();
  const full = await createImageBitmap(blob);
  if (!maxW || !maxH || (full.width <= maxW && full.height <= maxH)) return full;
  const scale = Math.min(maxW / full.width, maxH / full.height);
  const w = Math.max(1, Math.round(full.width * scale));
  const h = Math.max(1, Math.round(full.height * scale));
  full.close();
  return createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
}

/** Bildet som RGB og dekkevne for PDF-en. */
export function bitmapToPdfImage(bmp: ImageBitmap): PdfImage {
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Bildet er for stort for nettleseren.");
  ctx.drawImage(bmp, 0, 0);
  const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const px = bmp.width * bmp.height;
  const rgbBytes = new Uint8Array(px * 3);
  const alpha = new Uint8Array(px);
  let opaque = true;
  for (let i = 0; i < px; i++) {
    const a = data[i * 4 + 3]!;
    alpha[i] = a;
    if (a !== 255) opaque = false;
    // Lerretet gir forhåndsmultiplisert farge ut som vanlig farge; kantene kan bli litt mørke, ikke synlig
    rgbBytes[i * 3] = data[i * 4]!;
    rgbBytes[i * 3 + 1] = data[i * 4 + 1]!;
    rgbBytes[i * 3 + 2] = data[i * 4 + 2]!;
  }
  canvas.width = 0;
  canvas.height = 0;
  return { width: bmp.width, height: bmp.height, rgb: rgbBytes, alpha: opaque ? null : alpha };
}

/** PNG av plakaten (uten utfallende kant). */
export async function posterPng(
  ops: readonly RenderOp[],
  widthMm: number,
  heightMm: number,
  ppi: number,
  urls: Readonly<Record<string, string>>,
): Promise<{ blob: Blob; ppi: number; width: number; height: number; missing: number }> {
  const s = maxPxPerMm(widthMm, heightMm, ppi);
  const width = Math.round(widthMm * s);
  const height = Math.round(heightMm * s);
  const images = new Map<string, ImageBitmap>();
  let missing = 0;
  for (const [path, need] of imagePixelNeeds(ops, s * 25.4)) {
    if (!urls[path]) {
      missing++;
      continue;
    }
    try {
      images.set(path, await fetchBitmap(urls[path]!, need.w, need.h));
    } catch {
      // Bildet mangler: tom ramme (meldes)
      missing++;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Nettleseren kunne ikke lage bildet (for stort?).");
  drawPosterOps(ctx, ops, s, images);
  for (const b of images.values()) b.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error("PNG-filen kunne ikke lages.");
  return { blob, ppi: Math.round(s * 25.4), width, height, missing };
}
