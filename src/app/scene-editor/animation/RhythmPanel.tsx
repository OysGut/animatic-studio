/**
 * CA8 (§71–§99): rytmeverktøyet (Director's Rhythm Engine), oransje markert. Takt, pauser og vekt per replikk,
 * skjæringspunkt og forskyvning (samlet eller proporsjonalt). Endringen forhåndsvises; «Bruk» kjører én
 * RetimeScene (én angring). Ingenting lagres før «Bruk».
 */
import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { type ProjectState } from "@/core";
import type { Command } from "@/core/commands/types";
import { planRhythm, RHYTHM_TEMPO_MAX, RHYTHM_TEMPO_MIN, type RhythmLine } from "@/core/animation/rhythm";
import { formatAnimationTime, formatFrameGap } from "@/core/animation/time-format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { timingOf } from "@/core/composition/timing";
import { compositionForOccurrence } from "@/core/composition/retime";
import { compositionFieldsOf } from "../timeline-helpers";
import { t } from "@/core/i18n/keyed";

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
    const failure = run(plan.retime.command, t("app-scene-editor-animation-rhythm-panel.failure.run.e5c8e3318d65"));
    setError(failure);
    if (!failure) { reset(); setOpen(false); }
  };

  return <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
    <PopoverTrigger asChild>
      <button type="button" data-testid="ca8-rhythm-open" aria-description={t("app-scene-editor-animation-rhythm-panel.rhythm-panel.aria-label.f19d593893d0")} disabled={!editable}
        className="flex h-7 items-center gap-1 rounded-sm border border-accent-warm px-2 text-xs text-accent-warm hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50">
        <Activity className="size-3.5" aria-hidden />{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.button.3ce45bd0ae01")}
      </button>
    </PopoverTrigger>
    <PopoverContent data-testid="ca8-rhythm-panel" className="w-96 space-y-2 border-accent-warm p-3" aria-label={t("app-scene-editor-animation-rhythm-panel.rhythm-panel.aria-label.f19d593893d0.2")}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-accent-warm">{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.span.3ce45bd0ae01")}</span>
        <output data-testid="ca8-rhythm-new-duration" className="font-mono text-xs text-text-primary">
          {t("app-scene-editor-animation-rhythm-panel.rhythm-panel.output.910e0b35cf99")} {formatAnimationTime(plan?.afterFrames ?? 0, fps)}
        </output>
      </div>
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        <span className="w-24">{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.span.8ccbeee2ac1f")}</span>
        <input data-testid="ca8-rhythm-tempo" type="range" min={RHYTHM_TEMPO_MIN} max={RHYTHM_TEMPO_MAX} step={0.05} value={tempo}
          onChange={e => setTempo(Number(e.target.value))} className="flex-1 accent-accent-warm" />
        <span className="w-10 text-right font-mono">{tempo.toFixed(2)}×</span>
      </label>
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <label className="flex items-center gap-1">{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.label.8c12fda0fac9")}
          <input data-testid="ca8-rhythm-cut" type="number" min={0} value={cutFrame} onChange={e => setCutFrame(Math.max(0, Math.round(Number(e.target.value) || 0)))}
            className="h-7 w-16 rounded-sm border border-border-control bg-surface-3 px-1 text-text-primary" /></label>
        <label className="flex items-center gap-1">{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.label.3abab56147f0")}
          <input data-testid="ca8-rhythm-shift" type="number" value={shift} onChange={e => setShift(Math.round(Number(e.target.value) || 0))}
            className="h-7 w-16 rounded-sm border border-border-control bg-surface-3 px-1 text-text-primary" /></label>
        <label className="flex items-center gap-1"><input type="checkbox" data-testid="ca8-rhythm-proportional" checked={proportional} onChange={e => setProportional(e.target.checked)} />{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.label.cfcdcf9f816b")}</label>
      </div>
      {speech.length ? <div className="max-h-40 space-y-1 overflow-auto">
        {speech.map(a => <div key={a.id} data-testid={`ca8-rhythm-line-${a.id}`} className="flex items-center gap-2 text-xs text-text-secondary">
          <span className="flex-1 truncate">{state.blocks[a.blockId ?? ""]?.text ?? a.name}</span>
          <label className="flex items-center gap-1">{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.label.bfbb6a8861cd")}
            <input data-testid={`ca8-rhythm-pause-${a.id}`} type="number" value={lines[a.id]?.pauseFrames ?? 0} onChange={e => setLine(a.id, { pauseFrames: Math.round(Number(e.target.value) || 0) })}
              className="h-7 w-14 rounded-sm border border-border-control bg-surface-3 px-1 text-text-primary" /></label>
          <label className="flex items-center gap-1">{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.label.e67a2a0652c9")}
            <input data-testid={`ca8-rhythm-weight-${a.id}`} type="number" min={0} max={3} step={0.1} value={lines[a.id]?.weight ?? 1} onChange={e => setLine(a.id, { weight: Number(e.target.value) })}
              className="h-7 w-14 rounded-sm border border-border-control bg-surface-3 px-1 text-text-primary" /></label>
        </div>)}
      </div> : <p className="text-[11px] text-text-tertiary">{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.p.0bc315e59315")}</p>}
      <fieldset data-testid="ca8-rhythm-protected" className="space-y-1 rounded-sm border border-border p-2">
        <legend className="px-1 text-[11px] text-text-secondary">{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.legend.0a8c804552ce")}</legend>
        {locked.map(r => <div key={r.id} data-testid={`ca8-rhythm-protected-${r.id}`} className="flex items-center justify-between font-mono text-[11px] text-text-secondary">
          <span>{formatAnimationTime(r.startFrame, fps)} – {formatAnimationTime(r.endFrame, fps)}</span>
          <button type="button" disabled={!editable} className="rounded-sm px-1 text-text-tertiary hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label={t("app-scene-editor-animation-rhythm-panel.rhythm-panel.aria-label.177bacb4abc5")}
            onClick={() => setProtected(locked.filter(x => x.id !== r.id), t("app-scene-editor-animation-rhythm-panel.rhythm-panel.set-protected.a8e7c7e8966f"))}>×</button>
        </div>)}
        <div className="flex items-center gap-1 text-xs text-text-secondary">
          <label className="flex items-center gap-1">{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.label.e5ecb7f74070")}
            <input data-testid="ca8-rhythm-protect-from" type="number" min={0} value={protFrom} onChange={e => setProtFrom(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              className="h-7 w-14 rounded-sm border border-border-control bg-surface-3 px-1 text-text-primary" /></label>
          <label className="flex items-center gap-1">{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.label.e923cdd382c1")}
            <input data-testid="ca8-rhythm-protect-to" type="number" min={1} value={protTo} onChange={e => setProtTo(Math.max(1, Math.round(Number(e.target.value) || 0)))}
              className="h-7 w-14 rounded-sm border border-border-control bg-surface-3 px-1 text-text-primary" /></label>
          <Button size="sm" variant="outline" data-testid="ca8-rhythm-protect-add" disabled={!editable || protTo <= protFrom || locked.some(r => protFrom < r.endFrame && protTo > r.startFrame)}
            onClick={() => setProtected([...locked, { id: crypto.randomUUID(), startFrame: protFrom, endFrame: protTo, label: t("app-scene-editor-animation-rhythm-panel.label.label.0785d03a2957") }], t("app-scene-editor-animation-rhythm-panel.rhythm-panel.set-protected.358332bff108"))}>
            {t("app-scene-editor-animation-rhythm-panel.rhythm-panel.button.b39950abeee9")}
          </Button>
        </div>
        <p className="text-[11px] text-text-tertiary">{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.p.0163bae93df4")}</p>
      </fieldset>
      <div data-testid="ca8-rhythm-preview" className="space-y-0.5 rounded-sm border border-accent-warm/40 bg-surface-2 p-2">
        <div className="text-[11px] text-accent-warm">{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.div.a36d7829f46b")}{delta ? ` · ${delta > 0 ? "+" : "−"} ${formatFrameGap(Math.abs(delta), fps)}` : ""}</div>
        {plan?.gaps.map((g, i) => {
          const before = g.before.endFrame - g.before.startFrame, after = before + g.change;
          return <div key={i} data-testid={`ca8-rhythm-gap-${i}`} className="flex justify-between font-mono text-[11px] text-text-secondary">
            <span>{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.span.45ce15edb9b3", { value1: String(i + 1) })}</span>
            <span>{formatFrameGap(before, fps) || "—"} → {formatFrameGap(after, fps) || "—"}</span>
          </div>;
        })}
      </div>
      <div aria-live="polite" className="min-h-4 text-[11px]">
        {error ?? plan?.error ? <p role="alert" className="text-status-danger">{error ?? plan?.error}</p> : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" data-testid="ca8-rhythm-discard" onClick={() => { reset(); setOpen(false); }}>{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.button.12195c0de768")}</Button>
        <Button size="sm" data-testid="ca8-rhythm-apply" disabled={!editable || !ready} onClick={apply}>{t("app-scene-editor-animation-rhythm-panel.rhythm-panel.button.4bb251b2b72f")}</Button>
      </div>
    </PopoverContent>
  </Popover>;
}
