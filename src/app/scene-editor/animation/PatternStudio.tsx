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

const TARGET_LABELS: Record<PatternTarget, string> = {
  "eye:left": L("Venstre øye", "Left eye"), "eye:right": L("Høyre øye", "Right eye"),
  eyes: L("Begge øyne", "Both eyes"), overlay: L("Overlegg", "Overlay"),
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
    setError(run({ type: "SaveAnimationPattern", pattern: { id: crypto.randomUUID(), revision: 1, rigId: null, name: L("Nytt mønster", "New pattern"), color: "#7c5cd6", spec, removed: false } }, L("Lagre mønster", "Save pattern")));
  };

  const update = (pattern: AnimationPattern, fields: Partial<Pick<AnimationPattern, "name" | "color">> & { spec?: PatternSpec }) => {
    const next: AnimationPattern = { ...pattern, ...fields, revision: pattern.revision + 1 };
    const err = patternError(next);
    if (err) { setError(err); return; }
    setError(run({ type: "SaveAnimationPattern", pattern: next }, L("Endre mønster", "Change pattern")));
  };

  const events = useMemo(() => selected ? planPatternEvents(selected.spec, 0, duration, state.project.fps.num / state.project.fps.den) : [], [selected, duration, state.project.fps]);

  return <section data-testid="pattern-studio" aria-label={L("Mønstre", "Patterns")} className="flex min-h-0 flex-col border-t border-border">
    <PanelHeader title={L("Mønstre", "Patterns")}
      actions={<IconButton data-testid="pattern-add" label={L("Nytt mønster", "New pattern")} disabled={!editable} onClick={create}><Plus /></IconButton>} />
    <div className="flex min-h-0">
      <ul className="w-44 shrink-0 overflow-y-auto border-r border-border" aria-label={L("Mønstre i prosjektet", "Patterns in the project")}>
        {patterns.map(p => <li key={p.id}>
          <button type="button" data-testid={`pattern-select-${p.id}`} onClick={() => setSelectedId(p.id)}
            aria-pressed={p.id === selectedId}
            className={"flex w-full items-center gap-2 px-2 py-1 text-left text-xs focus-visible:ring-2 focus-visible:ring-focus-ring " + (p.id === selectedId ? "bg-surface-3 text-text-primary" : "text-text-secondary hover:bg-surface-2")}>
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="truncate">{p.name}</span>
          </button>
        </li>)}
        {!patterns.length ? <li className="px-2 py-2 text-[11px] text-text-tertiary">{L("Ingen mønstre ennå.", "No patterns yet.")}</li> : null}
      </ul>
      {selected && !selected.removed ? <div className="min-w-0 flex-1 space-y-2 p-2">
        <div className="flex items-center gap-2">
          <input data-testid="pattern-name" aria-label={L("Navn på mønsteret", "Pattern name")} value={selected.name} disabled={!editable}
            onChange={e => update(selected, { name: e.target.value })}
            className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary" />
          <input data-testid="pattern-color" type="color" aria-label={L("Mønsterfarge (bare markør)", "Pattern color (marker only)")} value={selected.color} disabled={!editable}
            onChange={e => update(selected, { color: e.target.value })} className="h-7 w-9 rounded-sm border border-border-control bg-surface-3" />
          <select data-testid="pattern-target" aria-label={L("Mål for mønsteret", "Pattern target")} value={selected.spec.target} disabled={!editable}
            onChange={e => update(selected, { spec: { ...selected.spec, target: e.target.value as PatternTarget } })}
            className="h-7 rounded-sm border border-border-control bg-surface-3 text-xs text-text-primary">
            {PATTERN_TARGETS.map(t => <option key={t} value={t}>{TARGET_LABELS[t]}</option>)}
          </select>
          <IconButton data-testid="pattern-remove" label={L("Fjern mønsteret", "Remove the pattern")} disabled={!editable}
            onClick={() => { setError(run({ type: "RemoveAnimationPattern", patternId: selected.id }, L("Fjern mønster", "Remove pattern"))); setSelectedId(null); }}><Trash2 /></IconButton>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-text-secondary">
          {([
            ["intervalMinMs", L("Min. mellomrom (ms)", "Min interval (ms)"), 100, 60000],
            ["intervalMaxMs", L("Maks. mellomrom (ms)", "Max interval (ms)"), 100, 60000],
            ["durationMinFrames", L("Min. varighet (frames)", "Min duration (frames)"), 1, 600],
            ["durationMaxFrames", L("Maks. varighet (frames)", "Max duration (frames)"), 1, 600],
            ["seed", L("Seed", "Seed"), 0, 4294967295],
          ] as const).map(([key, label, min, max]) => <label key={key} className="flex items-center gap-1">
            <span className="w-28 truncate">{label}</span>
            <input data-testid={`pattern-${key}`} type="number" min={min} max={max} value={selected.spec[key]} disabled={!editable}
              onChange={e => update(selected, { spec: { ...selected.spec, [key]: Number(e.target.value) } })}
              className="h-6 w-20 rounded-sm border border-border-control bg-surface-3 px-1 text-xs text-text-primary" />
          </label>)}
        </div>
        {/* Grafeditoren: hendelsene som kurve over tid; samme seed gir samme kurve (§63). */}
        <svg data-testid="pattern-graph" role="img" aria-label={L("Mønsterkurven", "The pattern curve")} viewBox={`0 0 ${duration} 10`} preserveAspectRatio="none" className="h-16 w-full rounded-sm border border-border bg-surface-1">
          {events.map((e, i) => <rect key={i} data-testid={`pattern-event-${i}`} x={e.frame} y={10 - e.intensity * 9} width={Math.max(0.5, e.endFrame - e.frame)} height={e.intensity * 9} fill={selected.color} opacity={0.85} />)}
        </svg>
        <p className="text-[10px] text-text-tertiary">{L("Samme seed gir samme kurve – også ved eksport.", "The same seed gives the same curve – also on export.")}</p>
      </div> : <p className="flex-1 p-3 text-[11px] text-text-tertiary">{L("Velg et mønster, eller lag et nytt.", "Choose a pattern, or create a new one.")}</p>}
    </div>
    {error ? <p role="alert" className="px-2 pb-1 text-[11px] text-danger">{error}</p> : null}
  </section>;
}
