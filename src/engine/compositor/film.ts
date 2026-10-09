/**
 * Tegner ett bilde av den samlede filmen (M4 del 1, DEC-0043): scenens 2D-scene i ferdig utsnitt, eller et
 * tittelkort for scener uten 2D-scene (REQ-0239/0240). Brukes av monteringen og av eksporten, så det som
 * spilles av er det samme som eksporteres. Bare på klienten.
 */
import { clipAtFrame, formatHeading, renderFrame, type FilmClip, type ProjectState } from "@/core";
import { drawFrame, type ImageSource } from "./canvas";

export interface FilmDrawOptions {
  /** Lerretets størrelse i piksler. */
  readonly width: number;
  readonly height: number;
  readonly images: ReadonlyMap<string, ImageSource>;
  /** Tegn plassholdere for bilder som ikke er lastet (redigering). Eksporten tegner dem ikke. */
  readonly placeholders?: boolean;
}

/** Tegner bildet `frame` i filmen. Returnerer klippet som vises (eller null for en tom film). */
export function drawFilmFrame(
  ctx: CanvasRenderingContext2D,
  state: ProjectState,
  clips: readonly FilmClip[],
  frame: number,
  o: FilmDrawOptions,
): FilmClip | null {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, o.width, o.height);
  ctx.restore();
  const at = clipAtFrame(clips, frame);
  if (!at) return null;
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
  return at.clip;
}

/** Tittelkort for en scene som ikke har 2D-scene ennå: nummer og sceneoverskrift på mørk bakgrunn. */
export function drawTitleCard(
  ctx: CanvasRenderingContext2D,
  clip: FilmClip,
  width: number,
  height: number,
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
  ctx.fillText("Ingen 2D-scene ennå", width / 2, height / 2 + 9 * u);
  ctx.restore();
}
