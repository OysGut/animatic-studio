/**
 * Tegner ett bilde av den samlede filmen (M4 del 1, DEC-0043; del 3, DEC-0047): importert ferdig film som er
 * tatt i bruk, scenens 2D-scene i ferdig utsnitt, eller et tittelkort for scener uten 2D-scene
 * (REQ-0239/0240), med overganger mellom scenene. Brukes av monteringen og av eksporten, så det som
 * spilles av er det samme som eksporteres. Bare på klienten.
 */
import {
  formatHeading,
  frameMix,
  framesToSeconds,
  renderFrame,
  type ClipFrame,
  type FilmClip,
  type ProjectState,
  type Take,
} from "@/core";
import { drawFrame, type ImageSource } from "./canvas";

export interface FilmDrawOptions {
  /** Lerretets størrelse i piksler. */
  readonly width: number;
  readonly height: number;
  readonly images: ReadonlyMap<string, ImageSource>;
  /** Tegn plassholdere for bilder som ikke er lastet (redigering). Eksporten tegner dem ikke. */
  readonly placeholders?: boolean;
  /** Bildet i en importert film på et tidspunkt (s i filmfilen), eller null hvis det ikke er klart. */
  readonly video?: (take: Take, seconds: number, held: boolean) => ImageSource | null;
}

let scratch: HTMLCanvasElement | OffscreenCanvas | null = null;
function scratchCanvas(w: number, h: number) {
  if (!scratch)
    scratch =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : document.createElement("canvas");
  if (scratch.width !== w) scratch.width = w;
  if (scratch.height !== h) scratch.height = h;
  return scratch;
}

/**
 * Tegner bildet `frame` i filmen, med overganger (kutt, overtoning, via svart – DEC-0047). Returnerer
 * klippet som dominerer bildet (eller null for en tom film).
 */
export function drawFilmFrame(
  ctx: CanvasRenderingContext2D,
  state: ProjectState,
  clips: readonly FilmClip[],
  frame: number,
  o: FilmDrawOptions,
): FilmClip | null {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, o.width, o.height);
  ctx.restore();
  const m = frameMix(clips, frame);
  if (!m) return null;
  drawClipFrame(ctx, state, m.a, o);
  if (m.b && m.mix > 0) {
    const sc = scratchCanvas(o.width, o.height);
    const sctx = sc.getContext("2d") as CanvasRenderingContext2D | null;
    if (sctx) {
      sctx.save();
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.fillStyle = "#000";
      sctx.fillRect(0, 0, o.width, o.height);
      sctx.restore();
      drawClipFrame(sctx, state, m.b, o);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = m.mix;
      ctx.drawImage(sc as CanvasImageSource, 0, 0);
      ctx.restore();
    }
  }
  if (m.black > 0) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.min(1, m.black);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, o.width, o.height);
    ctx.restore();
  }
  return m.b && m.mix >= 0.5 ? m.b.clip : m.a.clip;
}

/** Ett klipp på et bilde i scenen: importert film, 2D-scenen eller tittelkort. */
function drawClipFrame(
  ctx: CanvasRenderingContext2D,
  state: ProjectState,
  at: ClipFrame,
  o: FilmDrawOptions,
): void {
  const take = at.clip.take;
  if (take) {
    const img =
      o.video?.(take, framesToSeconds(at.localFrame, state.project.fps), at.held ?? false) ?? null;
    if (img && img.width > 0 && img.height > 0) {
      const k = Math.min(o.width / img.width, o.height / img.height);
      const w = img.width * k;
      const h = img.height * k;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(img, (o.width - w) / 2, (o.height - h) / 2, w, h);
      ctx.restore();
    } else if (o.placeholders ?? false) {
      drawTitleCard(ctx, at.clip, o.width, o.height, take.media?.fileName ?? "Ferdig film");
    }
    return;
  }
  const c = at.clip.compositionId ? state.compositions[at.clip.compositionId] : undefined;
  if (c) {
    // Scenen i formatet sitt, sentrert (skulle en 2D-scene ha et annet format, får den svarte kanter)
    const k = Math.min(o.width / c.width, o.height / c.height);
    const ox = (o.width - c.width * k) / 2;
    const oy = (o.height - c.height * k) / 2;
    const out = renderFrame(state, c.id, at.localFrame, { view: "camera" });
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, c.width * k, c.height * k);
    ctx.clip();
    drawFrame(ctx, out, {
      view: [k, 0, 0, k, ox, oy],
      images: o.images,
      placeholders: o.placeholders ?? false,
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
  note = "Ingen 2D-scene ennå",
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
    formatHeading(clip.heading) || "Uten overskrift",
    width / 2,
    height / 2,
    width * 0.9,
  );
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = `${Math.round(3.4 * u)}px Inter, system-ui, sans-serif`;
  ctx.fillText(note, width / 2, height / 2 + 9 * u, width * 0.9);
  ctx.restore();
}
