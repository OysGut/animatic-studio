/**
 * CA6 (§34–§38, §67): blinking per øye for én animasjonsbruk. Automatisk blinking kan slås av,
 * hvert øye kan ha sitt eget mønster, og manuelle blink/halvlukkede perioder kan legges til og
 * fjernes. Alt lagres som atferd på bruken (per scene) via kommandoene – ingenting slettes.
 */
import { useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { type ProjectState } from "@/core";
import type { Command } from "@/core/commands/types";
import type { AnimationUse, UseBehavior } from "@/core/animation/rig";
import { IconButton } from "@/app/shell/workspace-chrome";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "@/core/i18n/keyed";

export function BlinkPanel({ state, use, frame, editable, run }: {
  state: ProjectState; use: AnimationUse; frame: number; editable: boolean;
  run: (c: Command, label: string) => string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const behavior: UseBehavior = use.behavior ?? {};
  const patterns = Object.values(state.animationPatterns).filter(p => !p.removed && (p.spec.target === "eyes" || p.spec.target === "eye:left" || p.spec.target === "eye:right"));
  const save = (next: UseBehavior, label: string) => setError(run({ type: "SetAnimationBehavior", useId: use.id, behavior: next }, label));

  const eyeRow = (eye: "left" | "right", label: string) => {
    const key = eye === "left" ? "leftEyePatternId" : "rightEyePatternId";
    const current = behavior[key];
    return <div className="flex items-center gap-2">
      <span className="w-20 text-[11px] text-text-secondary">{label}</span>
      <select data-testid={`blink-pattern-${eye}`} aria-label={t("app-scene-editor-animation-blink-panel.eye-row.aria-label.185a57aeb9e9", { value1: String(label.toLowerCase()) })}
        value={current ?? ""} disabled={!editable}
        onChange={e => save({ ...behavior, [key]: e.target.value || null }, t("app-scene-editor-animation-blink-panel.eye-row.save.92bc0ce395ff"))}
        className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 text-xs text-text-primary">
        <option value="">{t("app-scene-editor-animation-blink-panel.eye-row.option.940bbe0d6c76")}</option>
        {patterns.filter(p => p.spec.target === "eyes" || p.spec.target === `eye:${eye}`).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>;
  };

  const blinks = behavior.manualBlinks ?? [];
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" data-testid="blink-panel-open" aria-label={t("app-scene-editor-animation-blink-panel.blink-panel.aria-label.281c719242d1")}
        className="flex h-6 items-center gap-1 rounded-sm px-1 text-text-tertiary hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus-ring">
        <Eye className="size-3.5" aria-hidden />
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-72 space-y-2 p-3" aria-label={t("app-scene-editor-animation-blink-panel.blink-panel.aria-label.281c719242d1.2")}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-text-tertiary">{t("app-scene-editor-animation-blink-panel.blink-panel.span.b67a7ff43bab")}</span>
        <IconButton data-testid="blink-enabled" aria-pressed={behavior.blinkEnabled !== false}
          label={behavior.blinkEnabled !== false ? t("app-scene-editor-animation-blink-panel.blink-panel.label.e6314294cedb") : t("app-scene-editor-animation-blink-panel.blink-panel.label.c3f02489ab9b")}
          active={behavior.blinkEnabled !== false} disabled={!editable}
          onClick={() => save({ ...behavior, blinkEnabled: behavior.blinkEnabled === false }, t("app-scene-editor-animation-blink-panel.blink-panel.save.965eb15be4a6"))}>
          {behavior.blinkEnabled !== false ? <Eye /> : <EyeOff />}
        </IconButton>
      </div>
      {eyeRow("left", t("app-scene-editor-animation-blink-panel.blink-panel.eye-row.64985e67ac8d"))}
      {eyeRow("right", t("app-scene-editor-animation-blink-panel.blink-panel.eye-row.a9d547b61b2c"))}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-text-tertiary">{t("app-scene-editor-animation-blink-panel.blink-panel.span.8797661cc0ec")}</span>
          <IconButton data-testid="blink-add" label={t("app-scene-editor-animation-blink-panel.blink-panel.label.ac183fdf4683")} disabled={!editable}
            onClick={() => save({ ...behavior, manualBlinks: [...blinks, { eye: "both", frame, endFrame: frame + 4, intensity: 1 }] }, t("app-scene-editor-animation-blink-panel.blink-panel.save.987f3e165cf6"))}><Plus /></IconButton>
        </div>
        {blinks.map((b, i) => <div key={i} data-testid={`blink-manual-${i}`} className="flex items-center gap-1 text-[11px] text-text-secondary">
          <span className="flex-1">{b.eye === "both" ? t("app-scene-editor-animation-blink-panel.blink-panel.span.117f58aa1bc3") : b.eye === "left" ? t("app-scene-editor-animation-blink-panel.blink-panel.span.39780e36ac0e") : t("app-scene-editor-animation-blink-panel.blink-panel.span.f6d06427bd70")} · {b.frame}–{b.endFrame}{b.intensity < 1 ? ` · ${Math.round(b.intensity * 100)} %` : ""}</span>
          <IconButton data-testid={`blink-half-${i}`} label={t("app-scene-editor-animation-blink-panel.blink-panel.label.9db6d02d3917")} disabled={!editable}
            onClick={() => save({ ...behavior, manualBlinks: blinks.map((x, j) => j === i ? { ...x, intensity: x.intensity >= 1 ? 0.5 : 1 } : x) }, t("app-scene-editor-animation-blink-panel.blink-panel.save.50a126f44f14"))}><Eye /></IconButton>
          <IconButton data-testid={`blink-remove-${i}`} label={t("app-scene-editor-animation-blink-panel.blink-panel.label.b7709c028cb0")} disabled={!editable}
            onClick={() => save({ ...behavior, manualBlinks: blinks.filter((_, j) => j !== i) }, t("app-scene-editor-animation-blink-panel.blink-panel.save.95d308b5f535"))}><Trash2 /></IconButton>
        </div>)}
        {!blinks.length ? <p className="text-[11px] text-text-tertiary">{t("app-scene-editor-animation-blink-panel.blink-panel.p.57c314d975ca")}</p> : null}
      </div>
      {error ? <p role="alert" className="text-[11px] text-status-danger">{error}</p> : null}
    </PopoverContent>
  </Popover>;
}
