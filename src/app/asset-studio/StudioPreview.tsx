/**
 * Forhåndsvisningen i Asset Studio (AS2, A4): «Bare objektet» tegner bare laget, tilpasset vinduet, uten å endre
 * den virkelige plasseringen; «Hele scenen» er kameravisningen med alle lag. Begge tegner fra utkastet.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { L, renderFrame, type Composition, type ProjectState } from "@/core";
import { ImageCache, drawFrame } from "@/engine/compositor/canvas";

export type StudioPreviewMode = "object" | "scene";

type Matrix = readonly [number, number, number, number, number, number];

/** Visningsmatrisen som passer et område (scenekoordinater) inn i lerretet med litt luft. */
export function fitView(
  box: { x: number; y: number; w: number; h: number },
  cw: number,
  ch: number,
  margin = 0.9,
): Matrix {
  const w = Math.max(1, box.w);
  const h = Math.max(1, box.h);
  const k = Math.min(cw / w, ch / h) * margin;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return [k, 0, 0, k, cw / 2 - k * cx, ch / 2 - k * cy];
}

export function StudioPreview({
  state,
  composition,
  layerId,
  frame,
  mode,
  urls,
}: {
  state: ProjectState;
  composition: Composition;
  layerId: string;
  frame: number;
  mode: StudioPreviewMode;
  urls: Readonly<Record<string, string>>;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tick, setTick] = useState(0);
  const cache = useMemo(() => new ImageCache(() => setTick((t) => t + 1)), []);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => cache.ensure(urls), [cache, urls]);

  const out = useMemo(
    () =>
      mode === "object"
        ? renderFrame(state, composition.id, frame, {
            view: "scene",
            onlyLayers: new Set([layerId]),
          })
        : renderFrame(state, composition.id, frame, { view: "camera" }),
    [state, composition.id, frame, mode, layerId],
  );

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || size.w <= 0 || size.h <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(size.w * dpr));
    const h = Math.max(1, Math.round(size.h * dpr));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    let view: Matrix;
    let frameToDraw = out;
    if (mode === "object") {
      // Tilpass objektet til vinduet (ytterkantene av det som tegnes nå), uten bakgrunnen
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      for (const it of out.items) {
        const [a, b, cc, d, e, f] = it.matrix;
        for (const [px, py] of [
          [-it.width / 2, -it.height / 2],
          [it.width / 2, -it.height / 2],
          [it.width / 2, it.height / 2],
          [-it.width / 2, it.height / 2],
        ] as const) {
          const x = a * px + cc * py + e;
          const y = b * px + d * py + f;
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
      const box = Number.isFinite(x0)
        ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
        : { x: 0, y: 0, w: composition.width, h: composition.height };
      view = fitView(box, w, h);
      frameToDraw = { ...out, background: "transparent" };
    } else {
      view = fitView({ x: 0, y: 0, w: out.width, h: out.height }, w, h, 1);
    }
    drawFrame(ctx, frameToDraw, { view, images: cache.images, placeholders: false });
  }, [out, size, tick, mode, cache, composition.width, composition.height]);

  return (
    <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-surface-0">
      <canvas
        ref={canvasRef}
        role="img"
        data-testid="asset-studio-preview"
        data-mode={mode}
        aria-label={
          mode === "object"
            ? L("Bare objektet", "Object only")
            : L("Hele scenen slik den blir i filmen", "The whole scene as it will be in the film")
        }
        style={{ width: size.w, height: size.h, display: "block" }}
      />
    </div>
  );
}
