/**
 * Tegner en tegneliste fra `renderFrame` (src/core/composition) på et Canvas 2D (ADR-0008).
 * Brukes av sceneeditoren og avspillingen; eksporten bruker samme funksjon på et OffscreenCanvas.
 * Bare på klienten (nettleser-API-er).
 */
import { matrixScale, multiply, type DrawItem, type Frame, type Matrix } from "@/core";

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
  if (it.opacity <= 0 || it.kind === "group") return;
  // Maske (REQ-0175): laget tegnes på et hjelpelerret, maskeres der og legges så på bildet
  if (it.mask) {
    const off = maskedItem(ctx, it, v, opts);
    if (off) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = compositeOf(it.blend);
      ctx.drawImage(off as CanvasImageSource, 0, 0);
      ctx.restore();
      return;
    }
  }
  ctx.save();
  ctx.globalCompositeOperation = compositeOf(it.blend);
  paintItem(ctx, it, v, opts, opts.placeholders !== false);
  ctx.restore();
}

/** Blandingsmodus (REQ-0175) → Canvas-operasjon. */
export function compositeOf(blend: DrawItem["blend"]): GlobalCompositeOperation {
  return !blend || blend === "normal" ? "source-over" : blend;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Tegner selve laget (bilde eller fargeflate) gjennom lerret ← scene (v) ← lag (it.matrix). */
function paintItem(ctx: Ctx2D, it: DrawItem, v: Matrix, opts: DrawOptions, placeholders: boolean) {
  const m = it.matrix;
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
    else {
      // Uten bilde ennå: ressursens symbol (fylt form i egen farge, DEC-0079) – også i animaticen
      if (it.symbol) drawSymbol(ctx, it, x, y);
      if (placeholders) drawPlaceholder(ctx as CanvasRenderingContext2D, it, x, y);
    }
  }
}

/**
 * Hjelpelerreter per lerret det tegnes på (gjenbrukes for alle maskerte lag): 0 = laget, 1 = myk maske.
 */
const maskScratch = new WeakMap<object, (HTMLCanvasElement | OffscreenCanvas)[]>();

function scratchFor(ctx: CanvasRenderingContext2D, slot: 0 | 1): Ctx2D | null {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (w <= 0 || h <= 0) return null;
  let list = maskScratch.get(ctx.canvas);
  if (!list) maskScratch.set(ctx.canvas, (list = []));
  let c = list[slot];
  if (!c) {
    c =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : typeof document !== "undefined"
          ? document.createElement("canvas")
          : undefined;
    if (!c) return null;
    list[slot] = c;
  }
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  const cx = c.getContext("2d") as Ctx2D | null;
  if (!cx) return null;
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.globalAlpha = 1;
  cx.globalCompositeOperation = "source-over";
  cx.shadowColor = "transparent";
  cx.shadowBlur = 0;
  cx.shadowOffsetX = 0;
  cx.shadowOffsetY = 0;
  cx.clearRect(0, 0, w, h);
  return cx;
}

/**
 * Laget med masken brukt, på et hjelpelerret i lerretets piksler, eller null (ingen maske kan brukes – da
 * tegnes laget uten). Rektangel/ellipse: «destination-in» (eller «destination-out» når masken er snudd)
 * med formen i lagets koordinater. Myk kant: formen tegnes uskarp på et eget hjelpelerret med skyggeuskarphet
 * (formen legges utenfor lerretet, og skyggen havner på plass – virker også der `filter` mangler), som så
 * brukes som maske. Maskelag: maskelagets dekning med «destination-in»/«destination-out».
 */
function maskedItem(
  ctx: CanvasRenderingContext2D,
  it: DrawItem,
  v: Matrix,
  opts: DrawOptions,
): HTMLCanvasElement | OffscreenCanvas | null {
  const m = it.mask;
  if (!m) return null;
  if (m.kind === "layer") {
    // Maskelag med bilde som ikke er lastet ennå: vis laget uten maske heller enn ingenting
    const src = m.item;
    if (src.kind === "image" && !(src.version && opts.images.get(src.version.mediaPath)))
      return null;
  }
  const cx = scratchFor(ctx, 0);
  if (!cx) return null;
  paintItem(cx, it, v, opts, opts.placeholders !== false);
  cx.globalCompositeOperation = m.invert ? "destination-out" : "destination-in";
  if (m.kind === "layer") {
    paintItem(cx, m.item, v, opts, false);
  } else {
    const full = multiply(v, it.matrix);
    const blur = m.feather > 0 ? m.feather * matrixScale(full) : 0;
    const shape = (c: Ctx2D) => {
      c.beginPath();
      if (m.kind === "rect") c.rect(m.x, m.y, m.width, m.height);
      else
        c.ellipse(
          m.x + m.width / 2,
          m.y + m.height / 2,
          m.width / 2,
          m.height / 2,
          0,
          0,
          Math.PI * 2,
        );
      c.fill();
    };
    const soft = blur > 0 ? scratchFor(ctx, 1) : null;
    if (soft) {
      // Formen legges så langt utenfor lerretet at bare skyggen (den myke formen) havner på bildet
      const shift = soft.canvas.width + blur * 4 + 100;
      soft.setTransform(1, 0, 0, 1, -shift, 0);
      soft.transform(full[0], full[1], full[2], full[3], full[4], full[5]);
      soft.fillStyle = "#000";
      soft.shadowColor = "#000";
      soft.shadowBlur = blur;
      soft.shadowOffsetX = shift;
      shape(soft);
      soft.shadowColor = "transparent";
      soft.shadowBlur = 0;
      soft.shadowOffsetX = 0;
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.globalAlpha = 1;
      cx.drawImage(soft.canvas as CanvasImageSource, 0, 0);
    } else {
      cx.setTransform(full[0], full[1], full[2], full[3], full[4], full[5]);
      cx.globalAlpha = 1;
      cx.fillStyle = "#000";
      shape(cx);
    }
  }
  return cx.canvas;
}

/** Symbolstiene som Path2D (laget én gang per form). */
const symbolPaths = new Map<string, Path2D>();

/** Ressursens symbol midt i laget, så stort som laget tillater (samme forhold). */
function drawSymbol(ctx: Ctx2D, it: DrawItem, x: number, y: number) {
  const sym = it.symbol;
  if (!sym || typeof Path2D === "undefined") return;
  let p = symbolPaths.get(sym.path);
  if (!p) {
    p = new Path2D(sym.path);
    symbolPaths.set(sym.path, p);
  }
  const k = (Math.min(it.width, it.height) * 0.9) / 100;
  ctx.save();
  ctx.translate(x + it.width / 2 - 50 * k, y + it.height / 2 - 50 * k);
  ctx.scale(k, k);
  ctx.fillStyle = sym.color;
  ctx.fill(p);
  ctx.restore();
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, it: DrawItem, x: number, y: number) {
  // Med symbol: bare navnet og en svak ramme (symbolet viser hvem det er)
  ctx.fillStyle = it.symbol ? "rgba(128,128,128,0.06)" : "rgba(128,128,128,0.18)";
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

/** Et bilde som lastes (HTMLImageElement i nettleseren; kan byttes ut i tester). */
export interface LoadingImage {
  crossOrigin: string | null;
  decoding: "async" | "sync" | "auto";
  onload: ((this: GlobalEventHandlers, ev: Event) => unknown) | null;
  onerror: OnErrorEventHandler;
  src: string;
  readonly naturalWidth?: number;
  readonly naturalHeight?: number;
  readonly width: number;
  readonly height: number;
}

export interface ImageCacheLimits {
  /** Høyst så mange bilder i bufferen (standard 200). */
  readonly maxImages?: number;
  /** Høyst så mange byte dekodede bilder, anslått som bredde × høyde × 4 (standard 512 MB). */
  readonly maxBytes?: number;
  /** Lager bildeobjektet (standard `new Image()`). */
  readonly createImage?: () => LoadingImage;
}

export const IMAGE_CACHE_MAX_IMAGES = 200;
export const IMAGE_CACHE_MAX_BYTES = 512 * 1024 * 1024;

/** Anslått minne for et dekodet bilde (RGBA). */
export function decodedBytes(img: {
  naturalWidth?: number;
  naturalHeight?: number;
  width: number;
  height: number;
}): number {
  const w = img.naturalWidth || img.width || 0;
  const h = img.naturalHeight || img.height || 0;
  return w * h * 4;
}

/**
 * Laster bilder fra signerte lenker og holder dem i en hurtigbuffer per mediesti. Bufferen har en grense
 * (KI-42): de minst nylig brukte bildene kastes når det er for mange eller de tar for mye minne, men aldri
 * bilder som er i bruk på et lerret. En buffer kan deles av flere visninger (`consumer`): hver visning sitt
 * siste kall til `ensure` gjelder for den, og bilder som noen av visningene bruker, kastes ikke. En visning
 * som lukkes, kaller `release`. Kastede bilder frigjøres (`close()` for ImageBitmap, ellers fjernes kilden) og
 * lastes på nytt hvis de trengs igjen.
 */
const DEFAULT_CONSUMER = Symbol("felles visning");

export class ImageCache {
  /** Mediesti → bilde, minst nylig brukt først. */
  private readonly loaded = new Map<string, LoadingImage>();
  private readonly bytes = new Map<string, number>();
  private readonly pending = new Map<string, string>();
  /** Visning → mediestiene den bruker nå (siste `ensure`). */
  private readonly inUse = new Map<unknown, ReadonlySet<string>>();
  private total = 0;
  private readonly maxImages: number;
  private readonly maxBytes: number;
  private readonly createImage: () => LoadingImage;

  constructor(
    private readonly onLoad: () => void,
    limits: ImageCacheLimits = {},
  ) {
    this.maxImages = limits.maxImages ?? IMAGE_CACHE_MAX_IMAGES;
    this.maxBytes = limits.maxBytes ?? IMAGE_CACHE_MAX_BYTES;
    this.createImage = limits.createImage ?? (() => new Image() as LoadingImage);
  }

  /**
   * Sørger for at bildene lastes. `urls`: mediesti → signert lenke. Bildene regnes som i bruk av `consumer`
   * (en nøkkel per visning, f.eks. et objekt fra useRef) til neste `ensure` fra den eller `release`. Uten
   * `consumer` gjelder én felles visning (som før).
   */
  ensure(urls: Readonly<Record<string, string>>, consumer: unknown = DEFAULT_CONSUMER): void {
    this.inUse.set(consumer, new Set(Object.keys(urls)));
    for (const [path, url] of Object.entries(urls)) {
      const img = this.loaded.get(path);
      if (img) {
        // Nylig brukt: flytt bakerst
        this.loaded.delete(path);
        this.loaded.set(path, img);
        continue;
      }
      if (this.pending.get(path) === url) continue;
      this.pending.set(path, url);
      const next = this.createImage();
      next.crossOrigin = "anonymous";
      next.decoding = "async";
      next.onload = () => {
        if (this.pending.get(path) !== url) return; // en nyere lenke er på vei
        this.pending.delete(path);
        this.loaded.set(path, next);
        const b = decodedBytes(next);
        this.bytes.set(path, b);
        this.total += b;
        this.evict();
        this.onLoad();
      };
      next.onerror = () => {
        if (this.pending.get(path) === url) this.pending.delete(path);
      };
      next.src = url;
    }
    this.evict();
  }

  get images(): ReadonlyMap<string, ImageSource> {
    return this.loaded as unknown as ReadonlyMap<string, ImageSource>;
  }

  /** Antall bilder og anslått minne (for tester og feilsøking). */
  get size(): { readonly images: number; readonly bytes: number } {
    return { images: this.loaded.size, bytes: this.total };
  }

  /** Visningen bruker ikke lenger bildene sine (lukket); de kan kastes når grensen nås. */
  release(consumer: unknown = DEFAULT_CONSUMER): void {
    if (this.inUse.delete(consumer)) this.evict();
  }

  private isInUse(path: string): boolean {
    for (const paths of this.inUse.values()) if (paths.has(path)) return true;
    return false;
  }

  private evict(): void {
    if (this.loaded.size <= this.maxImages && this.total <= this.maxBytes) return;
    for (const [path, img] of [...this.loaded]) {
      if (this.loaded.size <= this.maxImages && this.total <= this.maxBytes) break;
      if (this.isInUse(path)) continue;
      this.loaded.delete(path);
      this.total -= this.bytes.get(path) ?? 0;
      this.bytes.delete(path);
      release(img);
    }
  }
}

/** Frigjør et kastet bilde: ImageBitmap lukkes; for et <img> fjernes kilden så det dekodede bildet kan frigjøres. */
function release(img: LoadingImage): void {
  const closable = img as unknown as { close?: () => void };
  if (typeof closable.close === "function") {
    closable.close();
    return;
  }
  img.onload = null;
  img.onerror = null;
  img.src = "";
}
