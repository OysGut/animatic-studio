import { L } from "@/core";
import { DEFAULT_ADJUSTMENTS, type RigPart } from "@/core/animation/parts";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { Input } from "@/components/ui/input";
import { t } from "@/core/i18n/keyed";
export function AdjustPanel({ part, onChange }: { part: RigPart; onChange: (p: RigPart) => void }) {
  const adjustments = { brightness: t("app-scene-editor-animation-adjust-panel.brightness.brightness.c9540ca177cf"), contrast: t("app-scene-editor-animation-adjust-panel.contrast.contrast.497537c4a6f9"), saturation: t("app-scene-editor-animation-adjust-panel.saturation.saturation.996f78c02f29"), hue: t("app-scene-editor-animation-adjust-panel.hue.hue.743bd5cd8f21"), opacity: t("app-scene-editor-animation-adjust-panel.opacity.opacity.c2733215de17") };
  const placement = { x: t("app-scene-editor-animation-adjust-panel.x.x.b559a336c63f"), y: t("app-scene-editor-animation-adjust-panel.y.y.26643f22c547"), width: t("app-scene-editor-animation-adjust-panel.width.width.a71fe2475655"), height: t("app-scene-editor-animation-adjust-panel.height.height.ed146ae03395"), rotation: t("app-scene-editor-animation-adjust-panel.rotation.rotation.36c7f69a8966") };
  return <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary sm:grid-cols-5">
    {Object.entries(placement).map(([k, label]) => { const key = k as keyof typeof placement; return <label key={k}>{label}<Input data-testid={`ca4-part-${k}`} aria-label={label} type="number" step={key === "rotation" ? 1 : .01} min={key === "width" || key === "height" ? .01 : key === "rotation" ? -360 : -2} max={key === "rotation" ? 360 : key === "width" || key === "height" ? 4 : 2} value={part[key]} onChange={e => onChange({ ...part, [key]: Number(e.target.value) })} className="h-7" /></label>; })}
    {Object.entries(adjustments).map(([k, label]) => { const key = k as keyof typeof adjustments; return <label key={k}>{label}<input data-testid={`ca4-adjust-${k}`} aria-label={label} className="w-full accent-accent-brand" type="range" min={key === "hue" ? -180 : 0} max={key === "hue" ? 180 : key === "opacity" ? 1 : 3} step={key === "hue" ? 1 : .05} value={part.adjustments[key]} onChange={e => onChange({ ...part, adjustments: { ...part.adjustments, [key]: Number(e.target.value) } })} /></label>; })}
    <ToolbarButton data-testid="ca4-normalize" onClick={() => onChange({ ...part, adjustments: { ...DEFAULT_ADJUSTMENTS } })}>{t("app-scene-editor-animation-adjust-panel.adjust-panel.toolbar-button.09ac4dde5ecb")}</ToolbarButton>
  </div>;
}
