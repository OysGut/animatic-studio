/**
 * CA8 (§71–§99): rytmeverktøyet (Director's Rhythm Engine), oransje markert. Takt, pauser og vekt per replikk,
 * skjæringspunkt og forskyvning (samlet eller proporsjonalt). Endringen forhåndsvises; «Bruk» kjører én
 * RetimeScene (én angring). Ingenting lagres før «Bruk».
 */
import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { L, type ProjectState } from "@/core";
import type { Command } from "@/core/commands/types";
import { planRhythm, RHYTHM_TEMPO_MAX, RHYTHM_TEMPO_MIN, type RhythmLine } from "@/core/animation/rhythm";
import { formatAnimationTime, formatFrameGap } from "@/core/animation/time-format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { timingOf } from "@/core/composition/timing";
import { compositionForOccurrence } from "@/core/composition/retime";
import { compositionFieldsOf } from "../timeline-helpers";

export function RhythmPanel({ state, occurrenceId, editable, run }: {
  state: ProjectState; occurrenceId: string; editable: boolean;
  run: (c: Command, label: string) => string | null;
}) {
  const [open, setOpen] = useState(false);
  const [tempo, setTempo] = useState(1);
  const [cutFrame, setCutFrame] = useState(0);
  const [shift, setShift] = useState(0);
  const [proportional, setProportional] = useState(false);
  const [lines, setLines] = useState<Record<string, RhythmLine>>({});
  const [error, setError] = useState<string | null>(null);
  const fps = state.project.fps;
  const speech = useMemo(() => Object.values(state.audioClips)
    .filter(a => a.occurrenceId === occurrenceId && !a.removed && (a.kind === "dialogue" || a.kind === "narration"))
    .sort((a, b) => a.offsetMs - b.offsetMs || (a.id < b.id ? -1 : 1)), [state.audioClips, occurrenceId]);
  const plan = useMemo(() => open ? planRhythm(state, occurrenceId, { tempo, lines, cutFrame, shiftFrames: shift, proportional }) : null,
    [open, state, occurrenceId, tempo, lines, cutFrame, shift, proportional]);
  const reset = () => { setTempo(1); setShift(0); setCutFrame(0); setProportional(false); setLines({}); setError(null); };
  const setLine = (id: string, patch: RhythmLine) => setLines(l => ({ ...l, [id]: { ...l[id], ...patch } }));
  const delta = plan ? plan.afterFrames - plan.beforeFrames : 0;
  const ready = !!plan?.retime?.ok;
  // U5 del B: beskyttede tidsområder = scenens låste tidsrom (lagret, vises også i tidslinjen)
  const occ = state.occurrences[occurrenceId];
  const comp = occ ? compositionForOccurrence(state, occ) : undefined;
  const locked = comp ? timingOf(comp).lockedRanges : [];
  const [protFrom, setProtFrom] = useState(0);
  const [protTo, setProtTo] = useState(25);
  const setProtected = (next: typeof locked, label: string) => {
    if (!comp) return;
    setError(run({ type: "UpdateComposition", compositionId: comp.id, fields: compositionFieldsOf(comp), timing: { ...timingOf(comp), lockedRanges: next } } as Command, label));
  };

  const apply = () => {
    if (!plan?.retime?.ok) return;
    const failure = run(plan.retime.command, L("Juster rytmen", "Adjust the rhythm"));
    setError(failure);
    if (!failure) { reset(); setOpen(false); }
  };

  return <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
    <PopoverTrigger asChild>
      <button type="button" data-testid="ca8-rhythm-open" aria-label={L("Rytmeverktøy", "Rhythm tool")} disabled={!editable}
        className="flex h-7 items-center gap-1 rounded-sm border border-accent-warm px-2 text-xs text-accent-warm hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50">
        <Activity className="size-3.5" aria-hidden />{L("Rytme", "Rhythm")}
      </button>
    </PopoverTrigger>
    <PopoverContent data-testid="ca8-rhythm-panel" className="w-96 space-y-2 border-accent-warm p-3" aria-label={L("Rytmeverktøy", "Rhythm tool")}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-accent-warm">{L("Rytme", "Rhythm")}</span>
        <output data-testid="ca8-rhythm-new-duration" className="font-mono text-xs text-text-primary">
          {L("Ny scenetid:", "New scene time:")} {formatAnimationTime(plan?.afterFrames ?? 0, fps)}
        </output>
      </div>
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        <span className="w-24">{L("Takt", "Tempo")}</span>
        <input data-testid="ca8-rhythm-tempo" type="range" min={RHYTHM_TEMPO_MIN} max={RHYTHM_TEMPO_MAX} step={0.05} value={tempo}
          onChange={e => setTempo(Number(e.target.value))} className="flex-1 accent-accent-warm" />
        <span className="w-10 text-right font-mono">{tempo.toFixed(2)}×</span>
      </label>
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <label className="flex items-center gap-1">{L("Skjæringspunkt (frame)", "Cut point (frame)")}
          <input data-testid="ca8-rhythm-cut" type="number" min={0} value={cutFrame} onChange={e => setCutFrame(Math.max(0, Math.round(Number(e.target.value) || 0)))}
            className="h-7 w-16 rounded-sm border border-border-control bg-surface-3 px-1 text-text-primary" /></label>
        <label className="flex items-center gap-1">{L("Forskyv", "Shift")}
          <input data-testid="ca8-rhythm-shift" type="number" value={shift} onChange={e => setShift(Math.round(Number(e.target.value) || 0))}
            className="h-7 w-16 rounded-sm border border-border-control bg-surface-3 px-1 text-text-primary" /></label>
        <label className="flex items-center gap-1"><input type="checkbox" data-testid="ca8-rhythm-proportional" checked={proportional} onChange={e => setProportional(e.target.checked)} />{L("Fordel", "Spread")}</label>
      </div>
      {speech.length ? <div className="max-h-40 space-y-1 overflow-auto">
        {speech.map(a => <div key={a.id} data-testid={`ca8-rhythm-line-${a.id}`} className="flex items-center gap-2 text-xs text-text-secondary">
          <span className="flex-1 truncate">{state.blocks[a.blockId ?? ""]?.text ?? a.name}</span>
          <label className="flex items-center gap-1">{L("Pause", "Pause")}
            <input data-testid={`ca8-rhythm-pause-${a.id}`} type="number" value={lines[a.id]?.pauseFrames ?? 0} onChange={e => setLine(a.id, { pauseFrames: Math.round(Number(e.target.value) || 0) })}
              className="h-7 w-14 rounded-sm border border-border-control bg-surface-3 px-1 text-text-primary" /></label>
          <label className="flex items-center gap-1">{L("Vekt", "Weight")}
            <input data-testid={`ca8-rhythm-weight-${a.id}`} type="number" min={0} max={3} step={0.1} value={lines[a.id]?.weight ?? 1} onChange={e => setLine(a.id, { weight: Number(e.target.value) })}
              className="h-7 w-14 rounded-sm border border-border-control bg-surface-3 px-1 text-text-primary" /></label>
        </div>)}
      </div> : <p className="text-[11px] text-text-tertiary">{L("Scenen har ingen replikker. Takt og forskyvning virker på mellomrommene.", "The scene has no lines. Tempo and shift act on the gaps.")}</p>}
      <fieldset data-testid="ca8-rhythm-protected" className="space-y-1 rounded-sm border border-border p-2">
        <legend className="px-1 text-[11px] text-text-secondary">{L("Beskyttede tidsområder (flyttes aldri)", "Protected ranges (never moved)")}</legend>
        {locked.map(r => <div key={r.id} data-testid={`ca8-rhythm-protected-${r.id}`} className="flex items-center justify-between font-mono text-[11px] text-text-secondary">
          <span>{formatAnimationTime(r.startFrame, fps)} – {formatAnimationTime(r.endFrame, fps)}</span>
          <button type="button" disabled={!editable} className="rounded-sm px-1 text-text-tertiary hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label={L("Fjern beskyttelsen", "Remove the protection")}
            onClick={() => setProtected(locked.filter(x => x.id !== r.id), L("Fjern beskyttet tidsområde", "Remove protected range"))}>×</button>
        </div>)}
        <div className="flex items-center gap-1 text-xs text-text-secondary">
          <label className="flex items-center gap-1">{L("Fra", "From")}
            <input data-testid="ca8-rhythm-protect-from" type="number" min={0} value={protFrom} onChange={e => setProtFrom(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              className="h-7 w-14 rounded-sm border border-border-control bg-surface-3 px-1 text-text-primary" /></label>
          <label className="flex items-center gap-1">{L("til", "to")}
            <input data-testid="ca8-rhythm-protect-to" type="number" min={1} value={protTo} onChange={e => setProtTo(Math.max(1, Math.round(Number(e.target.value) || 0)))}
              className="h-7 w-14 rounded-sm border border-border-control bg-surface-3 px-1 text-text-primary" /></label>
          <Button size="sm" variant="outline" data-testid="ca8-rhythm-protect-add" disabled={!editable || protTo <= protFrom || locked.some(r => protFrom < r.endFrame && protTo > r.startFrame)}
            onClick={() => setProtected([...locked, { id: crypto.randomUUID(), startFrame: protFrom, endFrame: protTo, label: L("Beskyttet (rytme)", "Protected (rhythm)") }], L("Beskytt tidsområde", "Protect range"))}>
            {L("Beskytt", "Protect")}
          </Button>
        </div>
        <p className="text-[11px] text-text-tertiary">{L("Hold Cmd/Ctrl og dra i tidslinjen for å justere rytmen direkte. Shift fordeler.", "Hold Cmd/Ctrl and drag in the timeline to adjust the rhythm directly. Shift spreads.")}</p>
      </fieldset>
      <div data-testid="ca8-rhythm-preview" className="space-y-0.5 rounded-sm border border-accent-warm/40 bg-surface-2 p-2">
        <div className="text-[11px] text-accent-warm">{L("Forhåndsvisning", "Preview")}{delta ? ` · ${delta > 0 ? "+" : "−"} ${formatFrameGap(Math.abs(delta), fps)}` : ""}</div>
        {plan?.gaps.map((g, i) => {
          const before = g.before.endFrame - g.before.startFrame, after = before + g.change;
          return <div key={i} data-testid={`ca8-rhythm-gap-${i}`} className="flex justify-between font-mono text-[11px] text-text-secondary">
            <span>{L(`Mellomrom ${i + 1}`, `Gap ${i + 1}`)}</span>
            <span>{formatFrameGap(before, fps) || "—"} → {formatFrameGap(after, fps) || "—"}</span>
          </div>;
        })}
      </div>
      <div aria-live="polite" className="min-h-4 text-[11px]">
        {error ?? plan?.error ? <p role="alert" className="text-status-danger">{error ?? plan?.error}</p> : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" data-testid="ca8-rhythm-discard" onClick={() => { reset(); setOpen(false); }}>{L("Forkast", "Discard")}</Button>
        <Button size="sm" data-testid="ca8-rhythm-apply" disabled={!editable || !ready} onClick={apply}>{L("Bruk", "Apply")}</Button>
      </div>
    </PopoverContent>
  </Popover>;
}
