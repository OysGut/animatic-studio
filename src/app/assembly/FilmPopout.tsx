/**
 * Forhåndsvisning av monteringen i eget nettleservindu (DEC-0051, REQ-0572), som i sceneeditoren:
 * vinduet kan legges på en annen skjerm, og plass og størrelse huskes. Bildet følger avspillingshodet i
 * hovedvinduet; mellomrom i vinduet starter og stopper avspillingen.
 */
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { L, type FilmClip, type ProjectState } from "@/core";
import { drawFilmFrame, type FilmDrawOptions } from "@/engine/compositor/film";
import { previewPopup } from "@/app/scene-editor/PreviewWindow";
import { filmImageCache } from "./film-images";

export function FilmPopout({
  state,
  clips,
  frame,
  tick,
  video,
  monochrome,
  subtitle = null,
  onClose,
  onBlocked,
  onTogglePlay,
}: {
  state: ProjectState;
  clips: readonly FilmClip[];
  frame: number;
  tick: number;
  video?: FilmDrawOptions["video"];
  monochrome: boolean;
  /** Undertekst på avspillingshodet (DEC-0059). */
  subtitle?: string | null;
  onClose: () => void;
  onBlocked: () => void;
  onTogglePlay: () => void;
}) {
  const fw = state.project.frameWidth;
  const fh = state.project.frameHeight;
  const H = previewPopup.header;
  const [win, setWin] = useState<Window | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const latest = useRef({ onClose, onBlocked, onTogglePlay });
  latest.current = { onClose, onBlocked, onTogglePlay };

  useEffect(() => {
    const w = previewPopup.open(640, Math.round(640 * (fh / fw)) + H);
    if (!w) {
      latest.current.onBlocked();
      return;
    }
    w.document.title = L("Montering – Animatic Studio", "Assembly – Animatic Studio");
    setWin(w);
    const measure = () => setSize({ w: w.innerWidth, h: w.innerHeight });
    measure();
    const onResize = () => {
      measure();
      previewPopup.save(w);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || (e.target as HTMLElement | null)?.closest?.("select,button,input"))
        return;
      e.preventDefault();
      latest.current.onTogglePlay();
    };
    const onHide = () => {
      if (!previewPopup.closingByUs()) {
        previewPopup.save(w);
        previewPopup.forget();
        latest.current.onClose();
      }
    };
    const poll = setInterval(() => {
      if (w.closed) {
        clearInterval(poll);
        if (!previewPopup.closingByUs()) onHide();
      } else previewPopup.save(w);
    }, 1000);
    w.addEventListener("resize", onResize);
    w.addEventListener("keydown", onKey);
    w.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(poll);
      try {
        w.removeEventListener("resize", onResize);
        w.removeEventListener("keydown", onKey);
        w.removeEventListener("pagehide", onHide);
      } catch {
        // allerede lukket
      }
      previewPopup.close();
    };
    // Vinduet åpnes én gang per visning
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dpr = win?.devicePixelRatio || 1;
  const k = Math.max(0, Math.min(size.w / fw, (size.h - H) / fh));
  const cssW = Math.floor(fw * k);
  const cssH = Math.floor(fh * k);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || cssW <= 0 || cssH <= 0) return;
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    drawFilmFrame(ctx, state, clips, frame, {
      width: w,
      height: h,
      images: filmImageCache.images,
      placeholders: true,
      monochrome,
      subtitle,
      ...(video ? { video } : {}),
    });
  }, [state, clips, frame, cssW, cssH, dpr, tick, video, monochrome, subtitle, win]);

  const container = previewPopup.container();
  if (!win || !container) return null;
  return createPortal(
    <div className="flex h-full flex-col bg-media text-text-primary">
      <div
        className="flex shrink-0 items-center gap-1.5 border-b border-border bg-surface-1 px-2"
        style={{ height: H }}
      >
        <span className="truncate text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
          {L("Montering", "Assembly")}
        </span>
        <span className="truncate text-[11px] text-text-tertiary">
          {fw} × {fh}
          {monochrome ? L(" · svart-hvitt", " · black and white") : ""}
        </span>
        <span className="ml-auto" />
        <button
          type="button"
          onClick={onClose}
          className={previewPopup.iconButton}
          aria-label={L("Lukk det egne vinduet", "Close this window")}
          title={L(
            "Lukk det egne vinduet (filmen vises fortsatt i monteringen)",
            "Close this window (the film is still shown in the assembly)",
          )}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={L("Filmen på avspillingshodet", "The film at the playhead")}
          style={{ width: cssW, height: cssH }}
          className="block bg-media"
        />
      </div>
    </div>,
    container,
  );
}
