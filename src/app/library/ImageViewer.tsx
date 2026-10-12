/**
 * Bildet i fullskjerm (ønske fra Mars 11.10.2026, DEC-0064, REQ-0588): dobbeltklikk på et bilde i
 * biblioteket åpner det over hele vinduet. Rullehjul (eller knappene) zoomer rundt pekeren, dra flytter
 * bildet, piltastene viser forrige og neste versjon, og «Last ned» lagrer bildet med prosjektets navn
 * («Ressurs - Variant - vN.png»), så det kjennes igjen når det lastes opp igjen.
 */
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Maximize,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { versionFileName, type AssetVersion, type ProjectState } from "@/core";
import { prepareDownload } from "@/app/download";
import { Button } from "@/components/ui/button";

const MIN = 0.05;
const MAX = 16;

export function ImageViewer({
  state,
  versions,
  index,
  urls,
  onIndex,
  onClose,
}: {
  state: ProjectState;
  /** Versjonene det kan bla mellom (samme variant). */
  versions: readonly AssetVersion[];
  index: number;
  urls: Readonly<Record<string, string>>;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const v = versions[index];
  const url = v ? urls[v.mediaPath] : undefined;
  const box = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [fitted, setFitted] = useState(true);
  const drag = useRef<{ id: number; x: number; y: number; vx: number; vy: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Hele bildet i vinduet, midtstilt. */
  const fit = useCallback(() => {
    const el = box.current;
    if (!el || !natural) return;
    const r = el.getBoundingClientRect();
    const zoom = Math.min(1, (r.width - 48) / natural.w, (r.height - 48) / natural.h);
    setView({ zoom, x: (r.width - natural.w * zoom) / 2, y: (r.height - natural.h * zoom) / 2 });
    setFitted(true);
  }, [natural]);

  // Ny versjon: hele bildet igjen
  useEffect(() => {
    setNatural(null);
    setError(null);
    setFitted(true);
  }, [index]);
  useEffect(() => {
    if (natural && fitted) fit();
  }, [natural, fitted, fit]);
  useEffect(() => {
    const onResize = () => fitted && fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fit, fitted]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => prev?.focus?.();
  }, []);

  /** Zoom rundt et punkt i vinduet (pekeren eller midten). */
  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = cx ?? r.width / 2;
    const py = cy ?? r.height / 2;
    setView((w) => {
      const zoom = Math.min(MAX, Math.max(MIN, w.zoom * factor));
      const k = zoom / w.zoom;
      return { zoom, x: px - (px - w.x) * k, y: py - (py - w.y) * k };
    });
    setFitted(false);
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Tab holdes inne i visningen (fokusfelle)
      if (e.key === "Tab") {
        const root = rootRef.current;
        const items = root
          ? [...root.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")]
          : [];
        if (items.length) {
          const i = items.indexOf(document.activeElement as HTMLElement);
          const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
          items[next]!.focus();
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Snarveier med Cmd/Ctrl/Alt hører til nettleseren
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      else if (e.key === "ArrowRight" && index < versions.length - 1) onIndex(index + 1);
      else if (e.key === "+" || e.key === "=") zoomAt(1.25);
      else if (e.key === "-") zoomAt(0.8);
      else if (e.key === "0") fit();
      else return;
      e.preventDefault();
      // Ikke la sidens egne snarveier (angre, piler i lister) reagere bak visningen
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  async function download() {
    if (!v || !url) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Bildet kunne ikke hentes (${res.status})`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      prepareDownload(bytes, versionFileName(state, v), v.mimeType || "image/png");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!v) return null;
  const name = versionFileName(state, v);
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setView((w) => ({ ...w, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
    setFitted(false);
  };
  const onUp = () => {
    drag.current = null;
  };

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Bilde: ${name}`}
      className="fixed inset-0 z-[100] flex flex-col text-white"
      style={{ background: "rgb(8, 8, 10)" }}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/10 px-3">
        <span className="min-w-0 flex-1 truncate text-[13px]" title={name}>
          {name}
          {v.width && v.height ? (
            <span className="ml-2 text-white/50">
              {v.width} × {v.height}
            </span>
          ) : null}
          {v.note ? <span className="ml-2 text-white/50">· {v.note}</span> : null}
        </span>
        {versions.length > 1 ? (
          <span className="flex items-center gap-1 text-xs text-white/70">
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-white hover:bg-white/10"
              disabled={index === 0}
              onClick={() => onIndex(index - 1)}
              aria-label="Forrige versjon"
              title="Forrige versjon (←)"
            >
              <ChevronLeft />
            </Button>
            {index + 1} / {versions.length}
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-white hover:bg-white/10"
              disabled={index === versions.length - 1}
              onClick={() => onIndex(index + 1)}
              aria-label="Neste versjon"
              title="Neste versjon (→)"
            >
              <ChevronRight />
            </Button>
          </span>
        ) : null}
        <span className="mx-1 h-5 w-px bg-white/15" aria-hidden />
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-white hover:bg-white/10"
          onClick={() => zoomAt(0.8)}
          aria-label="Zoom ut"
          title="Zoom ut (−)"
        >
          <Minus />
        </Button>
        <span
          className="w-12 text-center font-mono text-xs tabular-nums text-white/80"
          aria-live="polite"
        >
          {Math.round(view.zoom * 100)} %
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-white hover:bg-white/10"
          onClick={() => zoomAt(1.25)}
          aria-label="Zoom inn"
          title="Zoom inn (+)"
        >
          <Plus />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-white hover:bg-white/10"
          onClick={fit}
          title="Hele bildet (0)"
        >
          <Maximize />
          Tilpass
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-white hover:bg-white/10"
          onClick={() => {
            if (!natural || !box.current) return;
            const r = box.current.getBoundingClientRect();
            setView({ zoom: 1, x: (r.width - natural.w) / 2, y: (r.height - natural.h) / 2 });
            setFitted(false);
          }}
        >
          1:1
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={download}
          disabled={busy || !url}
          title={`Last ned som «${name}»`}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Download />}
          Last ned
        </Button>
        <Button
          ref={closeRef}
          size="icon"
          variant="ghost"
          className="size-8 text-white hover:bg-white/10"
          onClick={onClose}
          aria-label="Lukk"
          title="Lukk (Esc)"
        >
          <X />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="bg-red-950 px-3 py-1.5 text-xs text-red-200">
          {error}
        </p>
      ) : null}
      <div
        ref={box}
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (fitted) zoomAt(2, e.clientX - r.left, e.clientY - r.top);
          else fit();
        }}
      >
        {url ? (
          <img
            key={v.id}
            src={url}
            alt={name}
            draggable={false}
            onLoad={(e) =>
              setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
            className="absolute left-0 top-0 max-w-none select-none"
            style={{
              width: natural ? natural.w * view.zoom : undefined,
              height: natural ? natural.h * view.zoom : undefined,
              transform: `translate(${view.x}px, ${view.y}px)`,
              visibility: natural ? "visible" : "hidden",
              // Gjennomsiktige bilder (frilagte figurer) vises på rutemønster
              backgroundImage:
                "conic-gradient(#3a3a3a 25%, #2a2a2a 0 50%, #3a3a3a 0 75%, #2a2a2a 0)",
              backgroundSize: "24px 24px",
              imageRendering: view.zoom > 2 ? "pixelated" : "auto",
            }}
          />
        ) : (
          <Loader2 className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/60" />
        )}
      </div>
      <p className="shrink-0 px-3 py-1.5 text-center text-[11px] text-white/50">
        Rullehjul zoomer · dra for å flytte · dobbeltklikk veksler mellom hele bildet og zoom · ← →
        bytter versjon · Esc lukker
      </p>
    </div>,
    document.body,
  );
}
