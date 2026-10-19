import { L } from "@/core";
import { DEFAULT_ADJUSTMENTS, type RigPart } from "@/core/animation/parts";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { Input } from "@/components/ui/input";
export function AdjustPanel({ part, onChange }: { part: RigPart; onChange: (p: RigPart) => void }) {
  const adjustments = { brightness: L("Lysstyrke", "Brightness"), contrast: L("Kontrast", "Contrast"), saturation: L("Metning", "Saturation"), hue: L("Fargetone", "Hue"), opacity: L("Opasitet", "Opacity") };
  const placement = { x: L("Forskyvning X", "Offset X"), y: L("Forskyvning Y", "Offset Y"), width: L("Bredde", "Width"), height: L("Høyde", "Height"), rotation: L("Rotasjon", "Rotation") };
  return <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary sm:grid-cols-5">
    {Object.entries(placement).map(([k, label]) => { const key = k as keyof typeof placement; return <label key={k}>{label}<Input data-testid={`ca4-part-${k}`} aria-label={label} type="number" step={key === "rotation" ? 1 : .01} min={key === "width" || key === "height" ? .01 : key === "rotation" ? -360 : -2} max={key === "rotation" ? 360 : key === "width" || key === "height" ? 4 : 2} value={part[key]} onChange={e => onChange({ ...part, [key]: Number(e.target.value) })} className="h-7" /></label>; })}
    {Object.entries(adjustments).map(([k, label]) => { const key = k as keyof typeof adjustments; return <label key={k}>{label}<input data-testid={`ca4-adjust-${k}`} aria-label={label} className="w-full accent-accent-brand" type="range" min={key === "hue" ? -180 : 0} max={key === "hue" ? 180 : key === "opacity" ? 1 : 3} step={key === "hue" ? 1 : .05} value={part.adjustments[key]} onChange={e => onChange({ ...part, adjustments: { ...part.adjustments, [key]: Number(e.target.value) } })} /></label>; })}
    <ToolbarButton data-testid="ca4-normalize" onClick={() => onChange({ ...part, adjustments: { ...DEFAULT_ADJUSTMENTS } })}>{L("Nullstill justeringer", "Reset adjustments")}</ToolbarButton>
  </div>;
}
