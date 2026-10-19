/** Camera preview shares rendering and fonts with the scene/export engines. View transforms are local. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { L, renderFrame, type Composition, type ProjectState } from "@/core";
import { ImageCache, drawFrame } from "@/engine/compositor/canvas";
import { textSpecsOf, useTextFonts } from "@/engine/typography/fonts";
import { fitView } from "@/app/asset-studio/StudioPreview";
import { PanelHeader, Toolbar, ToolbarGroup, IconButton } from "@/app/shell/workspace-chrome";
import { RotateCcw } from "lucide-react";
export function AnimPreview({ state, composition, frame, urls }: { state: ProjectState; composition: Composition; frame: number; urls: Readonly<Record<string, string>> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; pan: typeof pan } | null>(null);
  const [tick, setTick] = useState(0);
  const cache = useMemo(() => new ImageCache(() => setTick(t => t + 1)), []);
  const fonts = useTextFonts(textSpecsOf(state, composition.id)).version;
  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const observer = new ResizeObserver(update); observer.observe(el); update(); return () => observer.disconnect();
  }, []);
  useEffect(() => cache.ensure(urls), [cache, urls]);
  useEffect(() => {
    const c = canvas.current; const ctx = c?.getContext("2d"); if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(size.w * dpr)); c.height = Math.max(1, Math.round(size.h * dpr));
    const out = renderFrame(state, composition.id, frame, { view: "camera" });
    const fit = fitView({ x: 0, y: 0, w: out.width, h: out.height }, c.width, c.height, 1);
    const k = fit[0] * zoom;
    drawFrame(ctx, out, { view: [k, 0, 0, k, c.width / 2 - k * out.width / 2 + pan.x * dpr, c.height / 2 - k * out.height / 2 + pan.y * dpr], images: cache.images, placeholders: true });
  }, [state, composition.id, frame, size, zoom, pan, tick, cache, fonts]);
  return <section data-testid="anim-preview" className="flex min-h-0 flex-1 flex-col">
    <PanelHeader title={L("Forhåndsvisning", "Preview")} />
    <Toolbar><ToolbarGroup>
      <select data-testid="anim-preview-zoom" aria-label={L("Zoom i forhåndsvisningen", "Preview zoom")} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="h-7 rounded-sm border border-border-control bg-surface-3 text-xs text-text-primary">
        {[0.5, 1, 2, 4, 8].map(z => <option key={z} value={z}>{z * 100}%</option>)}
      </select>
      <IconButton label={L("Tilbakestill visningen", "Reset view")} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><RotateCcw /></IconButton>
    </ToolbarGroup></Toolbar>
    <div ref={wrap} data-testid="anim-preview-pan" data-pan-x={pan.x} data-pan-y={pan.y} tabIndex={0} role="img" aria-label={L("Forhåndsvisning av scenen", "Scene preview")}
      className="relative min-h-0 flex-1 touch-none overflow-hidden bg-media focus-visible:ring-2 focus-visible:ring-focus-ring"
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, pan }; }}
      onPointerMove={e => { const d = drag.current; if (d) setPan({ x: d.pan.x + e.clientX - d.x, y: d.pan.y + e.clientY - d.y }); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onKeyDown={e => { if (!e.shiftKey || !e.key.startsWith("Arrow")) return; e.preventDefault(); e.stopPropagation(); setPan(p => ({ x: p.x + (e.key === "ArrowRight" ? 10 : e.key === "ArrowLeft" ? -10 : 0), y: p.y + (e.key === "ArrowDown" ? 10 : e.key === "ArrowUp" ? -10 : 0) })); }}>
      <canvas ref={canvas} data-testid="anim-preview-canvas" data-frame={frame} className="block h-full w-full" />
    </div>
  </section>;
}
