/**
 * CA6 (§54–§66): mønsterstudio. Navngitte mønstre (f.eks. «nervøs blinking») lagres i prosjektet
 * og gjenbrukes på karakterlag. Grafeditoren viser hendelsene som kurve over tid; seed gjør
 * variasjonen deterministisk (§63), og lokale seeds per scene påvirker ikke andre scener (§67).
 */
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { L, type ProjectState } from "@/core";
import type { Command } from "@/core/commands/types";
import { PATTERN_TARGETS, patternError, planPatternEvents, type AnimationPattern, type PatternSpec, type PatternTarget } from "@/core/animation/patterns";
import { IconButton } from "@/app/shell/workspace-chrome";
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { t as tk } from "@/core/i18n/keyed";

const TARGET_LABELS: Record<PatternTarget, string> = {
  "eye:left": tk("app-scene-editor-animation-pattern-studio.eye-left.eye-left.b28ceb1b5df1"), "eye:right": tk("app-scene-editor-animation-pattern-studio.eye-right.eye-right.04b9a4f583d8"),
  eyes: tk("app-scene-editor-animation-pattern-studio.eyes.eyes.15c0db8c0f03"), overlay: tk("app-scene-editor-animation-pattern-studio.overlay.overlay.b048bb93d775"),
};

export function PatternStudio({ state, duration, editable, run }: {
  state: ProjectState; duration: number; editable: boolean; run: (c: Command, label: string) => string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const patterns = Object.values(state.animationPatterns).filter(p => !p.removed).sort((a, b) => a.name.localeCompare(b.name));
  const selected = selectedId ? state.animationPatterns[selectedId] : undefined;

  const create = () => {
    const spec: PatternSpec = { format: 1, target: "eyes", intervalMinMs: 3000, intervalMaxMs: 8000, durationMinFrames: 3, durationMaxFrames: 7, intensity: 1, seed: 18427, vary: { interval: true, duration: true, intensity: false }, algorithmVersion: 1 };
    setError(run({ type: "SaveAnimationPattern", pattern: { id: crypto.randomUUID(), revision: 1, rigId: null, name: tk("app-scene-editor-animation-pattern-studio.name.name.1c42a36a877f"), color: "#7c5cd6", spec, removed: false } }, tk("app-scene-editor-animation-pattern-studio.create.run.10a9fa4fc072")));
  };

  const update = (pattern: AnimationPattern, fields: Partial<Pick<AnimationPattern, "name" | "color">> & { spec?: PatternSpec }) => {
    const next: AnimationPattern = { ...pattern, ...fields, revision: pattern.revision + 1 };
    const err = patternError(next);
    if (err) { setError(err); return; }
    setError(run({ type: "SaveAnimationPattern", pattern: next }, tk("app-scene-editor-animation-pattern-studio.update.run.6b57f2ef1879")));
  };

  const events = useMemo(() => selected ? planPatternEvents(selected.spec, 0, duration, state.project.fps.num / state.project.fps.den) : [], [selected, duration, state.project.fps]);

  return <section data-testid="pattern-studio" aria-label={tk("app-scene-editor-animation-pattern-studio.pattern-studio.aria-label.811b5602f7b4")} className="flex min-h-0 flex-col border-t border-border">
    <PanelHeader title={tk("app-scene-editor-animation-pattern-studio.pattern-studio.title.811b5602f7b4")}
      actions={<IconButton data-testid="pattern-add" label={tk("app-scene-editor-animation-pattern-studio.pattern-studio.label.9d4cc0c9790c")} disabled={!editable} onClick={create}><Plus /></IconButton>} />
    <div className="flex min-h-0">
      <ul className="w-44 shrink-0 overflow-y-auto border-r border-border" aria-label={tk("app-scene-editor-animation-pattern-studio.pattern-studio.aria-label.07058fcdfd93")}>
        {patterns.map(p => <li key={p.id}>
          <button type="button" data-testid={`pattern-select-${p.id}`} onClick={() => setSelectedId(p.id)}
            aria-pressed={p.id === selectedId}
            className={"flex w-full items-center gap-2 px-2 py-1 text-left text-xs focus-visible:ring-2 focus-visible:ring-focus-ring " + (p.id === selectedId ? "bg-surface-3 text-text-primary" : "text-text-secondary hover:bg-surface-2")}>
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="truncate">{p.name}</span>
          </button>
        </li>)}
        {!patterns.length ? <li className="px-2 py-2 text-[11px] text-text-tertiary">{tk("app-scene-editor-animation-pattern-studio.pattern-studio.li.b6e2272ed826")}</li> : null}
      </ul>
      {selected && !selected.removed ? <div className="min-w-0 flex-1 space-y-2 p-2">
        <div className="flex items-center gap-2">
          <input data-testid="pattern-name" aria-label={tk("app-scene-editor-animation-pattern-studio.pattern-studio.aria-label.ba94fcbbcdf5")} value={selected.name} disabled={!editable}
            onChange={e => update(selected, { name: e.target.value })}
            className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary" />
          <input data-testid="pattern-color" type="color" aria-label={tk("app-scene-editor-animation-pattern-studio.pattern-studio.aria-label.d98f978f420b")} value={selected.color} disabled={!editable}
            onChange={e => update(selected, { color: e.target.value })} className="h-7 w-9 rounded-sm border border-border-control bg-surface-3" />
          <select data-testid="pattern-target" aria-label={tk("app-scene-editor-animation-pattern-studio.pattern-studio.aria-label.384e7b1a311f")} value={selected.spec.target} disabled={!editable}
            onChange={e => update(selected, { spec: { ...selected.spec, target: e.target.value as PatternTarget } })}
            className="h-7 rounded-sm border border-border-control bg-surface-3 text-xs text-text-primary">
            {PATTERN_TARGETS.map(t => <option key={t} value={t}>{TARGET_LABELS[t]}</option>)}
          </select>
          <IconButton data-testid="pattern-remove" label={tk("app-scene-editor-animation-pattern-studio.pattern-studio.label.2b48f14a8b6e")} disabled={!editable}
            onClick={() => { setError(run({ type: "RemoveAnimationPattern", patternId: selected.id }, tk("app-scene-editor-animation-pattern-studio.pattern-studio.run.8819a7880c5e"))); setSelectedId(null); }}><Trash2 /></IconButton>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-text-secondary">
          {([
            ["intervalMinMs", tk("app-scene-editor-animation-pattern-studio.pattern-studio.interval-min-ms-l-min-mellomrom-ms-min-interval-ms-100-60000-interval-max-ms-l-maks-mellomrom-ms-max-interval-ms-100-60000-duration-min-frames-l-min-varighet-frames-min-duration-frames-1-600-duration-max-frames-l-maks-varighet-frames-max-duration-frames-1-600-seed-l-seed-seed-0-4294967295-as-const-map.9525cc4f5aac"), 100, 60000],
            ["intervalMaxMs", tk("app-scene-editor-animation-pattern-studio.pattern-studio.interval-min-ms-l-min-mellomrom-ms-min-interval-ms-100-60000-interval-max-ms-l-maks-mellomrom-ms-max-interval-ms-100-60000-duration-min-frames-l-min-varighet-frames-min-duration-frames-1-600-duration-max-frames-l-maks-varighet-frames-max-duration-frames-1-600-seed-l-seed-seed-0-4294967295-as-const-map.ca527042ee85"), 100, 60000],
            ["durationMinFrames", tk("app-scene-editor-animation-pattern-studio.pattern-studio.interval-min-ms-l-min-mellomrom-ms-min-interval-ms-100-60000-interval-max-ms-l-maks-mellomrom-ms-max-interval-ms-100-60000-duration-min-frames-l-min-varighet-frames-min-duration-frames-1-600-duration-max-frames-l-maks-varighet-frames-max-duration-frames-1-600-seed-l-seed-seed-0-4294967295-as-const-map.2c0fb557bf67"), 1, 600],
            ["durationMaxFrames", tk("app-scene-editor-animation-pattern-studio.pattern-studio.interval-min-ms-l-min-mellomrom-ms-min-interval-ms-100-60000-interval-max-ms-l-maks-mellomrom-ms-max-interval-ms-100-60000-duration-min-frames-l-min-varighet-frames-min-duration-frames-1-600-duration-max-frames-l-maks-varighet-frames-max-duration-frames-1-600-seed-l-seed-seed-0-4294967295-as-const-map.0fad020c0deb"), 1, 600],
            ["seed", tk("app-scene-editor-animation-pattern-studio.pattern-studio.interval-min-ms-l-min-mellomrom-ms-min-interval-ms-100-60000-interval-max-ms-l-maks-mellomrom-ms-max-interval-ms-100-60000-duration-min-frames-l-min-varighet-frames-min-duration-frames-1-600-duration-max-frames-l-maks-varighet-frames-max-duration-frames-1-600-seed-l-seed-seed-0-4294967295-as-const-map.747a89fa09a3"), 0, 4294967295],
          ] as const).map(([key, label, min, max]) => <label key={key} className="flex items-center gap-1">
            <span className="w-28 truncate">{label}</span>
            <input data-testid={`pattern-${key}`} type="number" min={min} max={max} value={selected.spec[key]} disabled={!editable}
              onChange={e => update(selected, { spec: { ...selected.spec, [key]: Number(e.target.value) } })}
              className="h-6 w-20 rounded-sm border border-border-control bg-surface-3 px-1 text-xs text-text-primary" />
          </label>)}
        </div>
        {/* Grafeditoren: hendelsene som kurve over tid; samme seed gir samme kurve (§63). */}
        <svg data-testid="pattern-graph" role="img" aria-label={tk("app-scene-editor-animation-pattern-studio.pattern-studio.aria-label.2a174348c7d1")} viewBox={`0 0 ${duration} 10`} preserveAspectRatio="none" className="h-16 w-full rounded-sm border border-border bg-surface-1">
          {events.map((e, i) => <rect key={i} data-testid={`pattern-event-${i}`} x={e.frame} y={10 - e.intensity * 9} width={Math.max(0.5, e.endFrame - e.frame)} height={e.intensity * 9} fill={selected.color} opacity={0.85} />)}
        </svg>
        <p className="text-[11px] text-text-tertiary">{tk("app-scene-editor-animation-pattern-studio.pattern-studio.p.4b8597cf2af3")}</p>
      </div> : <p className="flex-1 p-3 text-[11px] text-text-tertiary">{tk("app-scene-editor-animation-pattern-studio.pattern-studio.p.b288af166da6")}</p>}
    </div>
    {error ? <p role="alert" className="px-2 pb-1 text-[11px] text-status-danger">{error}</p> : null}
  </section>;
}
