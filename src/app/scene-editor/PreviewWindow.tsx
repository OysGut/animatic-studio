/**
 * Forhåndsvisning av ferdig utsnitt (DEC-0040): det filmen viser på gjeldende bilde – kamerabevegelse,
 * parallakse og animerte lag – i et eget vindu, mens lerretet brukes til redigering.
 * Vises med knappen «Forhåndsvisning», eller automatisk ved avspilling når «Automatisk visning» er på.
 */
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { renderFrame, type Composition, type ProjectState } from "@/core";
import { ImageCache, drawFrame } from "@/engine/compositor/canvas";
import { PaneResizer, usePaneSize } from "@/app/shell/pane-size";

const loadListeners = new Set<() => void>();
const sharedCache = new ImageCache(() => {
  for (const l of loadListeners) l();
});
function onImageLoad(l: () => void) {
  loadListeners.add(l);
  return () => {
    loadListeners.delete(l);
  };
}

export function PreviewWindow({
  state,
  composition,
  frame,
  imageUrls,
  onClose,
}: {
  state: ProjectState;
  composition: Composition;
  frame: number;
  imageUrls: Readonly<Record<string, string>>;
  onClose: () => void;
}) {
  const [width, setWidth] = usePaneSize("scene-editor-preview", 360, 200, 900, {
    viewportShare: 0.5,
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tick, setTick] = useState(0);
  const height = Math.round((width * composition.height) / composition.width);

  useEffect(() => {
    // Felles bildebuffer: vinduet åpnes og lukkes ofte (automatisk ved avspilling) uten å laste bildene på nytt
    const off = onImageLoad(() => setTick((t) => t + 1));
    sharedCache.ensure(imageUrls);
    return off;
  }, [imageUrls]);

  const out = useMemo(
    () => renderFrame(state, composition.id, frame, { view: "camera" }),
    [state, composition.id, frame],
  );

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const k = w / composition.width;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    drawFrame(ctx, out, {
      view: [k, 0, 0, k, 0, 0],
      images: sharedCache.images,
      placeholders: false,
    });
    ctx.restore();
  }, [out, width, height, composition.width, tick]);

  return (
    <div
      role="region"
      aria-label="Forhåndsvisning av ferdig utsnitt"
      style={{ width, maxWidth: "calc(100% - 24px)" }}
      className="absolute bottom-[52px] right-3 z-30 flex flex-col overflow-visible rounded-md border border-border bg-surface-1 shadow-[var(--shadow-float)]"
    >
      <PaneResizer
        edge="left"
        size={width}
        onSize={setWidth}
        min={200}
        max={900}
        label="Bredde på forhåndsvisningen"
      />
      <div className="flex h-7 items-center gap-2 border-b border-border px-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
          Ferdig utsnitt
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-sm p-0.5 text-text-tertiary hover:text-text-primary"
          aria-label="Lukk forhåndsvisningen"
          title="Lukk forhåndsvisningen"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Bildet slik det blir i filmen"
        style={{ width: "100%", aspectRatio: `${composition.width} / ${composition.height}` }}
        className="block rounded-b-md bg-black"
      />
    </div>
  );
}
