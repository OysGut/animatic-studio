/** Shared rasterization of CA4 vector data; originals are never modified. */
import type { RigPart, VectorStroke } from "@/core/animation/parts";
export type PartCanvas = HTMLCanvasElement | OffscreenCanvas;
function canvas(w: number, h: number): PartCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}
function stroke(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, s: VectorStroke, w: number, h: number) {
  const first = s.points[0]; if (!first) return;
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = s.radius * Math.min(w, h) * 2;
  ctx.beginPath(); ctx.moveTo(first.x * w, first.y * h);
  for (const p of s.points.slice(1)) ctx.lineTo(p.x * w, p.y * h);
  if (s.points.length === 1) ctx.lineTo(first.x * w + .01, first.y * h);
  ctx.stroke();
}
export function renderRigPart(part: RigPart, image?: CanvasImageSource, width = 512, height = 256): PartCanvas {
  const c = canvas(width, height), ctx = c.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return c;
  if (image) ctx.drawImage(image, 0, 0, width, height);
  // Drawings use the neutral ink token supplied by the source image when imported; authored strokes are monochrome.
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--on-paper").trim();
  for (const s of part.drawing) { ctx.globalCompositeOperation = s.mode === "add" ? "source-over" : "destination-out"; stroke(ctx, s, width, height); }
  const original = canvas(width, height), base = original.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  base?.drawImage(c, 0, 0);
  for (const s of part.mask) {
    const brush = canvas(width, height), b = brush.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null; if (!b) continue;
    b.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--on-media").trim(); b.filter = s.feather ? `blur(${s.radius * s.feather * Math.min(width, height) / 2}px)` : "none"; stroke(b, s, width, height);
    if (s.mode === "subtract") { ctx.globalCompositeOperation = "destination-out"; ctx.drawImage(brush, 0, 0); }
    else {
      b.globalCompositeOperation = "source-in"; b.filter = "none"; b.drawImage(original, 0, 0);
      ctx.globalCompositeOperation = "source-over"; ctx.drawImage(brush, 0, 0);
    }
  }
  const result = canvas(width, height), out = result.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (out) { const a = part.adjustments; out.filter = `brightness(${a.brightness}) contrast(${a.contrast}) saturate(${a.saturation}) hue-rotate(${a.hue}deg)`; out.globalAlpha = a.opacity; out.drawImage(c, 0, 0); }
  return result;
}
