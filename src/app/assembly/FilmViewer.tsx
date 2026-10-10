/**
 * Filmvisningen i monteringen: bildet i den samlede filmen på avspillingshodet, i prosjektets format.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FilmClip, ProjectState } from "@/core";
import { drawFilmFrame, type FilmDrawOptions } from "@/engine/compositor/film";
import { filmImageCache } from "./film-images";

export function FilmViewer({
  state,
  clips,
  frame,
  tick,
  video,
  onDrawn,
}: {
  state: ProjectState;
  clips: readonly FilmClip[];
  frame: number;
  /** Øker når et bilde er lastet. */
  tick: number;
  /** Bilder fra importert film (DEC-0047). */
  video?: FilmDrawOptions["video"];
  /** Etter hver tegning (filmer som ikke vises, settes på pause). */
  onDrawn?: () => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const fw = state.project.frameWidth;
  const fh = state.project.frameHeight;

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Største størrelse som får plass, med prosjektets sideforhold
  const k = box.w > 0 && box.h > 0 ? Math.min(box.w / fw, box.h / fh) : 0;
  const cssW = Math.floor(fw * k);
  const cssH = Math.floor(fh * k);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || cssW <= 0 || cssH <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    drawFilmFrame(ctx, state, clips, frame, {
      width: w,
      height: h,
      images: filmImageCache.images,
      placeholders: true,
      ...(video ? { video } : {}),
    });
    onDrawn?.();
  }, [state, clips, frame, cssW, cssH, tick, video, onDrawn]);

  return (
    <div ref={boxRef} className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
      {clips.length === 0 ? (
        <p className="text-[13px] text-text-tertiary">Ingen aktive scener i filmen.</p>
      ) : (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Filmen på avspillingshodet"
          style={{ width: cssW, height: cssH }}
          className="block bg-black shadow-[0_0_0_1px_var(--border)]"
        />
      )}
    </div>
  );
}
