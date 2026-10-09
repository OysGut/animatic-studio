/**
 * Tegner en tegneliste fra `renderFrame` (src/core/composition) på et Canvas 2D (ADR-0008).
 * Brukes av sceneeditoren og avspillingen; eksporten bruker samme funksjon på et OffscreenCanvas.
 * Bare på klienten (nettleser-API-er).
 */
import type { DrawItem, Frame, Matrix } from "@/core";

export type ImageSource = CanvasImageSource & { readonly width: number; readonly height: number };

export interface DrawOptions {
  /** Ekstra transformasjon fra scenekoordinater til lerretet (zoom og panorering i editoren). */
  readonly view?: Matrix;
  /** Bildene som er lastet, per mediesti (AssetVersion.mediaPath). */
  readonly images: ReadonlyMap<string, ImageSource>;
  /** Tegn en dempet ramme og navnet for bilder som ikke er lastet ennå. Standard: ja. */
  readonly placeholders?: boolean;
}

/** Tegner hele bildet: bakgrunnsfarge innenfor formatet og lagene bakerst først. */
export function drawFrame(ctx: CanvasRenderingContext2D, frame: Frame, opts: DrawOptions): void {
  const v = opts.view ?? [1, 0, 0, 1, 0, 0];
  ctx.save();
  ctx.setTransform(v[0], v[1], v[2], v[3], v[4], v[5]);
  ctx.fillStyle = frame.background;
  ctx.fillRect(0, 0, frame.width, frame.height);
  for (const it of frame.items) drawItem(ctx, it, v, opts);
  ctx.restore();
}

function drawItem(ctx: CanvasRenderingContext2D, it: DrawItem, v: Matrix, opts: DrawOptions) {
  if (it.opacity <= 0) return;
  const m = it.matrix;
  ctx.save();
  // lerret ← scene (v) ← lag (m)
  ctx.setTransform(v[0], v[1], v[2], v[3], v[4], v[5]);
  ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.globalAlpha = it.opacity;
  const x = -it.width / 2;
  const y = -it.height / 2;
  if (it.kind === "fill") {
    ctx.fillStyle = it.fill ?? "#808080";
    ctx.fillRect(x, y, it.width, it.height);
  } else {
    const img = it.version ? opts.images.get(it.version.mediaPath) : undefined;
    if (img) ctx.drawImage(img, x, y, it.width, it.height);
    else if (opts.placeholders !== false) drawPlaceholder(ctx, it, x, y);
  }
  ctx.restore();
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, it: DrawItem, x: number, y: number) {
  ctx.fillStyle = "rgba(128,128,128,0.18)";
  ctx.fillRect(x, y, it.width, it.height);
  ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 0.9);
  ctx.strokeStyle = "rgba(200,200,200,0.6)";
  ctx.lineWidth = Math.max(1, it.width / 300);
  ctx.setLineDash([it.width / 40, it.width / 60]);
  ctx.strokeRect(x, y, it.width, it.height);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(220,220,220,0.85)";
  ctx.font = `${Math.max(12, Math.round(it.height / 12))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(it.version ? it.name : `${it.name} (uten bilde)`, 0, 0, it.width * 0.9);
}

/** Laster bilder fra signerte lenker og holder dem i en hurtigbuffer per mediesti. */
export class ImageCache {
  private readonly loaded = new Map<string, HTMLImageElement>();
  private readonly pending = new Map<string, string>();
  constructor(private readonly onLoad: () => void) {}

  /** Sørger for at bildene lastes. `urls`: mediesti → signert lenke. */
  ensure(urls: Readonly<Record<string, string>>): void {
    for (const [path, url] of Object.entries(urls)) {
      if (this.loaded.has(path) || this.pending.get(path) === url) continue;
      this.pending.set(path, url);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        this.pending.delete(path);
        this.loaded.set(path, img);
        this.onLoad();
      };
      img.onerror = () => this.pending.delete(path);
      img.src = url;
    }
  }

  get images(): ReadonlyMap<string, ImageSource> {
    return this.loaded;
  }
}
