/**
 * Tegner ett bilde av den samlede filmen (M4 del 1, DEC-0043; del 3, DEC-0047): importert ferdig film som er
 * tatt i bruk, scenens 2D-scene i ferdig utsnitt, eller et tittelkort for scener uten 2D-scene
 * (REQ-0239/0240), med overganger mellom scenene. Brukes av monteringen og av eksporten, så det som
 * spilles av er det samme som eksporteres. Bare på klienten.
 */
import { formatHeading, frameMix, partBlendAt, renderFrame, sourceAt, type ClipFrame, type FilmClip, type ProjectState, type SourceFrame, type Take } from "@/core";
import { drawFrame, type ImageSource } from "./canvas";
import { t } from "@/core/i18n/keyed";

export interface FilmDrawOptions {
  readonly background?: "transparent";
  readonly layerIds?: ReadonlySet<string>;
  readonly effects?: boolean;
  /** Lerretets størrelse i piksler. */
  readonly width: number;
  readonly height: number;
  readonly images: ReadonlyMap<string, ImageSource>;
  /** Tegn plassholdere for bilder som ikke er lastet (redigering). Eksporten tegner dem ikke. */
  readonly placeholders?: boolean;
  /**
   * Bildet i en importert film på et tidspunkt (s i filmfilen), eller null hvis det ikke er klart.
   * `slot`: 0 for klippet som vises (eller det første i en overgang), 1 for det andre i en overgang.
   */
  readonly video?: (take: Take, seconds: number, held: boolean, slot: number) => ImageSource | null;
  /** Hele filmen i svart-hvitt (global kontroll og valg i eksporten, REQ-0573). */
  readonly monochrome?: boolean;
  /** Undertekst som vises i bildet (DEC-0059, REQ-0352), eller null. */
  readonly subtitle?: string | null;
  /** CA8: karakterlag som eksporteres som eget lag (se DrawOptions.characterPass). */
  readonly characterPass?: "all" | "main" | "separate";
}

type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Hjelpelerreter for overganger, per størrelse (visningen, eget vindu og eksporten tegner i ulike størrelser). */
const scratches = new Map<string, (HTMLCanvasElement | OffscreenCanvas)[]>();
function scratchCanvas(i: number, w: number, h: number) {
  const key = `${w}x${h}`;
  let list = scratches.get(key);
  if (!list) {
    if (scratches.size >= 4) scratches.clear();
    list = [];
    scratches.set(key, list);
  }
  let c = list[i];
  if (!c) {
    c =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : document.createElement("canvas");
    c.width = w;
    c.height = h;
    list[i] = c;
  }
  return c;
}

function fill(ctx: Canvas2D, color: string, alpha: number, w: number, h: number) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Gjør det som er tegnet, svart-hvitt (fargemetning 0, lysstyrken beholdes). */
export function desaturate(ctx: Canvas2D, w: number, h: number, preserveAlpha = false): void {
  if (preserveAlpha) {
    const image = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < image.data.length; i += 4) {
      const r = image.data[i] ?? 0, g = image.data[i + 1] ?? 0, b = image.data[i + 2] ?? 0;
      const l = Math.round(.3 * r + .59 * g + .11 * b);
      image.data[i] = l; image.data[i + 1] = l; image.data[i + 2] = l;
    }
    ctx.putImageData(image, 0, 0);
    return;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "saturation";
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Ett klipp tegnet på et eget lerret (svart bakgrunn, svart-hvitt hvis scenen er det). */
function clipLayer(
  i: number,
  state: ProjectState,
  at: ClipFrame,
  o: FilmDrawOptions,
): HTMLCanvasElement | OffscreenCanvas | null {
  const c = scratchCanvas(i, o.width, o.height);
  const cx = c.getContext("2d") as CanvasRenderingContext2D | null;
  if (!cx) return null;
  if (o.background === "transparent") cx.clearRect(0, 0, o.width, o.height);
  else fill(cx, "#000", 1, o.width, o.height);
  drawClipFrame(cx, state, at, o, i);
  if (at.clip.monochrome) desaturate(cx, o.width, o.height, o.background === "transparent");
  return c;
}

/**
 * Tegner bildet `frame` i filmen, med overganger (kutt, overtoning, via svart/hvitt, tørk, skyv og iris –
 * DEC-0047, DEC-0051) og svart-hvitt per scene og for hele filmen. Returnerer klippet som dominerer
 * bildet (eller null for en tom film).
 */
/**
 * Undertekst nederst i bildet (DEC-0059): hvit tekst med mørk kant, høyst to linjer, sentrert. Samme
 * tegning i visningen og eksporten.
 */
export function drawSubtitle(ctx: Canvas2D, text: string, w: number, h: number): void {
  const lines = text.split("\n").filter((x) => x.trim());
  if (!lines.length) return;
  const size = Math.max(10, Math.round(h * 0.048));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, size * 0.16);
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = "#ffffff";
  const lineH = size * 1.25;
  const bottom = h - h * 0.06;
  lines.forEach((line, i) => {
    const y = bottom - (lines.length - 1 - i) * lineH;
    ctx.strokeText(line, w / 2, y, w * 0.92);
    ctx.fillText(line, w / 2, y, w * 0.92);
  });
  ctx.restore();
}

export function drawFilmFrame(
  ctx: CanvasRenderingContext2D,
  state: ProjectState,
  clips: readonly FilmClip[],
  frame: number,
  o: FilmDrawOptions,
): FilmClip | null {
  const W = o.width;
  const H = o.height;
  if (o.background === "transparent") {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.restore();
  } else fill(ctx, "#000", 1, W, H);
  const m = frameMix(clips, frame);
  if (!m) return null;
  if (!m.b) {
    drawClipFrame(ctx, state, m.a, o);
    if (m.a.clip.monochrome) desaturate(ctx, W, H, o.background === "transparent");
  } else {
    const A = clipLayer(0, state, m.a, o);
    const B = clipLayer(1, state, m.b, o);
    const p = Math.max(0, Math.min(1, m.mix));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (A) ctx.drawImage(A as CanvasImageSource, m.kind === "push" ? -p * W : 0, 0);
    if (B) {
      if (m.kind === "push") ctx.drawImage(B as CanvasImageSource, (1 - p) * W, 0);
      else if (m.kind === "wipe") {
        ctx.beginPath();
        ctx.rect(0, 0, p * W, H);
        ctx.clip();
        ctx.drawImage(B as CanvasImageSource, 0, 0);
      } else if (m.kind === "iris") {
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, (p * Math.hypot(W, H)) / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(B as CanvasImageSource, 0, 0);
      } else {
        ctx.globalAlpha = p;
        ctx.drawImage(B as CanvasImageSource, 0, 0);
      }
    }
    ctx.restore();
  }
  if (m.black > 0) fill(ctx, "#000", Math.min(1, m.black), W, H);
  if (m.white > 0) fill(ctx, "#fff", Math.min(1, m.white), W, H);
  if (o.monochrome) desaturate(ctx, W, H, o.background === "transparent");
  if (o.subtitle) drawSubtitle(ctx, o.subtitle, W, H);
  return m.b && m.mix >= 0.5 ? m.b.clip : m.a.clip;
}

/** Ett klipp på et bilde i scenen: delen som vises (importert film, 2D-scenen eller tittelkort). */
function drawClipFrame(
  ctx: CanvasRenderingContext2D,
  state: ProjectState,
  at: ClipFrame,
  o: FilmDrawOptions,
  slot = 0,
): void {
  const src = sourceAt(at.clip, at.localFrame, state.project.fps);
  drawSource(ctx, state, at.clip, src, o, slot, at.held ?? false);
  // Myk overgang mellom to deler i scenen (DEC-0071): den andre delen tegnes gjennomsiktig oppå
  const blend = partBlendAt(at.clip, at.localFrame, state.project.fps);
  if (blend && blend.alpha > 0.001) {
    // På et eget lerret først: 2D-scenen setter selv gjennomsiktighet per lag
    const sc = scratchCanvas(2 + slot, o.width, o.height);
    const g = sc.getContext("2d") as CanvasRenderingContext2D | null;
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.clearRect(0, 0, o.width, o.height);
    drawSource(g, state, at.clip, blend.source, { ...o, placeholders: false }, slot + 2, true);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.min(1, blend.alpha);
    ctx.drawImage(sc as CanvasImageSource, 0, 0);
    ctx.restore();
  }
}

/** Én kilde (filmbilde, 2D-scene eller tittelkort) i hele bildet. */
function drawSource(
  ctx: CanvasRenderingContext2D,
  state: ProjectState,
  clip: FilmClip,
  src: SourceFrame,
  o: FilmDrawOptions,
  slot: number,
  held: boolean,
): void {
  const at = { clip };
  if (src.kind === "take") {
    const img = o.video?.(src.take, src.seconds, held, slot) ?? null;
    if (img && img.width > 0 && img.height > 0) {
      const k = Math.min(o.width / img.width, o.height / img.height);
      const w = img.width * k;
      const h = img.height * k;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(img, (o.width - w) / 2, (o.height - h) / 2, w, h);
      ctx.restore();
    } else if (o.placeholders ?? false) {
      drawTitleCard(
        ctx,
        at.clip,
        o.width,
        o.height,
        src.take.media?.fileName ?? t("engine-compositor-film.draw-source.draw-title-card.ddbf843041c0"),
      );
    }
    return;
  }
  const c = at.clip.compositionId ? state.compositions[at.clip.compositionId] : undefined;
  if (src.kind === "composition" && c) {
    // Scenen i formatet sitt, sentrert (skulle en 2D-scene ha et annet format, får den svarte kanter)
    const k = Math.min(o.width / c.width, o.height / c.height);
    const ox = (o.width - c.width * k) / 2;
    const oy = (o.height - c.height * k) / 2;
    const out = renderFrame(state, c.id, src.frame, { view: "camera" });
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, c.width * k, c.height * k);
    ctx.clip();
    drawFrame(ctx, out, {
      view: [k, 0, 0, k, ox, oy],
      images: o.images,
      ...(o.background ? { background: o.background } : {}),
      ...(o.layerIds ? { layerIds: o.layerIds } : {}),
      ...(o.effects !== undefined ? { effects: o.effects } : {}),
      placeholders: o.placeholders ?? false,
      ...(o.characterPass ? { characterPass: o.characterPass } : {}),
    });
    ctx.restore();
  } else {
    drawTitleCard(ctx, at.clip, o.width, o.height);
  }
}

/** Tittelkort for en scene som ikke har 2D-scene ennå: nummer og sceneoverskrift på mørk bakgrunn. */
export function drawTitleCard(
  ctx: CanvasRenderingContext2D,
  clip: FilmClip,
  width: number,
  height: number,
  note = t("engine-compositor-film.draw-title-card.message.b687cba6a4c5"),
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#14161b";
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const u = height / 100;
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `500 ${Math.round(4.2 * u)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.fillText(
    clip.productionNumber ? `SCENE ${clip.productionNumber}` : "SCENE",
    width / 2,
    height / 2 - 9 * u,
  );
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `600 ${Math.round(6.4 * u)}px "Courier Prime", "Courier New", monospace`;
  ctx.fillText(
    formatHeading(clip.heading) || t("engine-compositor-film.draw-title-card.ctx-fill-text.2500c7899415"),
    width / 2,
    height / 2,
    width * 0.9,
  );
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = `${Math.round(3.4 * u)}px Inter, system-ui, sans-serif`;
  ctx.fillText(note, width / 2, height / 2 + 9 * u, width * 0.9);
  ctx.restore();
}
