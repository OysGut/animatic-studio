/**
 * CA6 (§34–§38, §67): blinking per øye for én animasjonsbruk. Automatisk blinking kan slås av,
 * hvert øye kan ha sitt eget mønster, og manuelle blink/halvlukkede perioder kan legges til og
 * fjernes. Alt lagres som atferd på bruken (per scene) via kommandoene – ingenting slettes.
 */
import { useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { L, type ProjectState } from "@/core";
import type { Command } from "@/core/commands/types";
import type { AnimationUse, UseBehavior } from "@/core/animation/rig";
import { IconButton } from "@/app/shell/workspace-chrome";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
      <select data-testid={`blink-pattern-${eye}`} aria-label={L(`Mønster for ${label.toLowerCase()}`, `Pattern for ${label.toLowerCase()}`)}
        value={current ?? ""} disabled={!editable}
        onChange={e => save({ ...behavior, [key]: e.target.value || null }, L("Endre blinkemønster", "Change blink pattern"))}
        className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 text-xs text-text-primary">
        <option value="">{L("Standardblinking", "Default blinking")}</option>
        {patterns.filter(p => p.spec.target === "eyes" || p.spec.target === `eye:${eye}`).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>;
  };

  const blinks = behavior.manualBlinks ?? [];
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" data-testid="blink-panel-open" aria-label={L("Blinking og øyne", "Blinking and eyes")}
        className="flex h-6 items-center gap-1 rounded-sm px-1 text-text-tertiary hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus-ring">
        <Eye className="size-3.5" aria-hidden />
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-72 space-y-2 p-3" aria-label={L("Blinking og øyne", "Blinking and eyes")}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-text-tertiary">{L("Blinking", "Blinking")}</span>
        <IconButton data-testid="blink-enabled" aria-pressed={behavior.blinkEnabled !== false}
          label={behavior.blinkEnabled !== false ? L("Slå av automatisk blinking", "Turn off automatic blinking") : L("Slå på automatisk blinking", "Turn on automatic blinking")}
          active={behavior.blinkEnabled !== false} disabled={!editable}
          onClick={() => save({ ...behavior, blinkEnabled: behavior.blinkEnabled === false }, L("Endre blinking", "Change blinking"))}>
          {behavior.blinkEnabled !== false ? <Eye /> : <EyeOff />}
        </IconButton>
      </div>
      {eyeRow("left", L("Venstre øye", "Left eye"))}
      {eyeRow("right", L("Høyre øye", "Right eye"))}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-text-tertiary">{L("Manuelle blink", "Manual blinks")}</span>
          <IconButton data-testid="blink-add" label={L("Legg til blink på denne framen", "Add a blink at this frame")} disabled={!editable}
            onClick={() => save({ ...behavior, manualBlinks: [...blinks, { eye: "both", frame, endFrame: frame + 4, intensity: 1 }] }, L("Legg til blink", "Add blink"))}><Plus /></IconButton>
        </div>
        {blinks.map((b, i) => <div key={i} data-testid={`blink-manual-${i}`} className="flex items-center gap-1 text-[11px] text-text-secondary">
          <span className="flex-1">{b.eye === "both" ? L("Begge øyne", "Both eyes") : b.eye === "left" ? L("Venstre", "Left") : L("Høyre", "Right")} · {b.frame}–{b.endFrame}{b.intensity < 1 ? ` · ${Math.round(b.intensity * 100)} %` : ""}</span>
          <IconButton data-testid={`blink-half-${i}`} label={L("Gjør halvlukket eller hel", "Toggle half-closed or full")} disabled={!editable}
            onClick={() => save({ ...behavior, manualBlinks: blinks.map((x, j) => j === i ? { ...x, intensity: x.intensity >= 1 ? 0.5 : 1 } : x) }, L("Endre blink", "Change blink"))}><Eye /></IconButton>
          <IconButton data-testid={`blink-remove-${i}`} label={L("Fjern blinket", "Remove the blink")} disabled={!editable}
            onClick={() => save({ ...behavior, manualBlinks: blinks.filter((_, j) => j !== i) }, L("Fjern blink", "Remove blink"))}><Trash2 /></IconButton>
        </div>)}
        {!blinks.length ? <p className="text-[11px] text-text-tertiary">{L("Ingen manuelle blink ennå.", "No manual blinks yet.")}</p> : null}
      </div>
      {error ? <p role="alert" className="text-[11px] text-danger">{error}</p> : null}
    </PopoverContent>
  </Popover>;
}
