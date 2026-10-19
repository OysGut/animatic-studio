import { useEffect, useRef, useState } from "react";
import { L } from "@/core";
import type { RigPart, VectorStroke } from "@/core/animation/parts";
import { renderRigPart } from "@/engine/compositor/rig-parts";
import { Toolbar, ToolbarGroup, ToolbarButton } from "@/app/shell/workspace-chrome";
export function MaskBrush({ part, url, onChange }: { part: RigPart; url?: string | undefined; onChange: (p: RigPart) => void }) {
  const ref = useRef<HTMLCanvasElement>(null), drag = useRef<VectorStroke | null>(null);
  const [tool, setTool] = useState<"draw" | "add" | "subtract">("draw");
  const [radius, setRadius] = useState(.025), [feather, setFeather] = useState(0);
  useEffect(() => {
    let alive = true;
    const draw = (image?: HTMLImageElement) => { const c = ref.current, ctx = c?.getContext("2d"); if (!alive || !c || !ctx) return; ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(renderRigPart(part, image, c.width, c.height), 0, 0); };
    if (url) { const image = new Image(); image.crossOrigin = "anonymous"; image.onload = () => draw(image); image.onerror = () => draw(); image.src = url; } else draw();
    return () => { alive = false; };
  }, [part, url]);
  const append = (s: VectorStroke) => onChange({ ...part, [tool === "draw" ? "drawing" : "mask"]: [...(tool === "draw" ? part.drawing : part.mask), s] });
  return <div className="flex min-w-0 flex-col gap-2">
    <Toolbar><ToolbarGroup>{(["draw", "subtract", "add"] as const).map(t => <ToolbarButton key={t} data-testid={`ca4-brush-${t}`} active={tool === t} onClick={() => setTool(t)}>{t === "draw" ? L("Tegn", "Draw") : t === "subtract" ? L("Trekk fra", "Subtract") : L("Legg tilbake", "Restore")}</ToolbarButton>)}
      <ToolbarButton data-testid="ca4-clear-mask" onClick={() => onChange({ ...part, mask: [] })}>{L("Nullstill maske", "Reset mask")}</ToolbarButton>
      <ToolbarButton data-testid="ca4-undo-stroke" onClick={() => onChange({ ...part, [tool === "draw" ? "drawing" : "mask"]: (tool === "draw" ? part.drawing : part.mask).slice(0, -1) })}>{L("Angre strøk", "Undo stroke")}</ToolbarButton>
    </ToolbarGroup></Toolbar>
    <div className="flex flex-wrap gap-3 text-xs text-text-secondary"><label>{L("Penselstørrelse", "Brush size")}<input data-testid="ca4-brush-size" aria-label={L("Penselstørrelse", "Brush size")} type="range" min={.005} max={.2} step={.005} value={radius} onChange={e => setRadius(Number(e.target.value))} /></label><label>{L("Myk kant", "Feather")}<input data-testid="ca4-feather" aria-label={L("Myk kant", "Feather")} type="range" min={0} max={1} step={.05} value={feather} onChange={e => setFeather(Number(e.target.value))} /></label></div>
    <canvas ref={ref} width={640} height={320} data-testid="ca4-brush-canvas" tabIndex={0} aria-label={L("Tegn og masker rigg-delen", "Draw and mask the rig part")} className="aspect-[2/1] w-full touch-none border border-border bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus-ring"
      onPointerDown={e => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { points: [{ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }], radius, feather, mode: tool === "subtract" ? "subtract" : "add" }; }}
      onPointerMove={e => { const s = drag.current; if (!s) return; const r = e.currentTarget.getBoundingClientRect(); drag.current = { ...s, points: [...s.points, { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }] }; }}
      onPointerUp={() => { const s = drag.current; drag.current = null; if (s) append(s); }} onPointerCancel={() => { drag.current = null; }}
      onKeyDown={e => { if (e.key !== "Enter" && e.key !== " ") return; e.preventDefault(); append({ points: [{ x: .5, y: .5 }], radius, feather, mode: tool === "subtract" ? "subtract" : "add" }); }} />
  </div>;
}
