/**
 * CA5 (§29–§33): munnformsporet under dialogsporet. Leppesynk per replikk med av/på og
 * «generer på nytt». Analysen lager et forslag i minnet; ingenting lagres før brukeren
 * trykker «Bruk». Manuelle rettelser lagres som overstyringer og overlever ny generering.
 */
import { useState } from "react";
import { Mic, RefreshCw, Check, X } from "lucide-react";
import { L, type ProjectState } from "@/core";
import type { Command } from "@/core/commands/types";
import { animationDialogueTracks } from "@/core/animation/tracks";
import { lipsyncStale, visemeAt, VISEME_ORDER, type LipsyncResult, type VisemeSpan } from "@/core/animation/lipsync";
import { analyzeLipsync, lipsyncDraft } from "@/engine/lipsync/analyze";
import { audioVersion } from "@/core/audio";
import { IconButton } from "@/app/shell/workspace-chrome";
import type { AnimWindow } from "./TimeNavigator";
import { AssetThumb } from "@/app/library/AssetThumb";
import { t as tk } from "@/core/i18n/keyed";

const VISEME_COLORS: Record<string, string> = {
  A: "var(--viseme-a)", B: "var(--viseme-b)", C: "var(--viseme-c)", D: "var(--viseme-d)", E: "var(--viseme-e)", F: "var(--viseme-f)", G: "var(--viseme-g)", H: "var(--viseme-h)", X: "var(--viseme-x)",
};

export function MouthTrack({ state, occurrenceId, language, view, frame, editable, run, urls }: {
  state: ProjectState; occurrenceId: string; language: string; view: AnimWindow; frame: number;
  editable: boolean; run: (c: Command, label: string) => string | null; urls: Readonly<Record<string, string>>;
}) {
  const tracks = animationDialogueTracks(state, occurrenceId, language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{ clipId: string; draft: LipsyncResult } | null>(null);
  const occurrence = state.occurrences[occurrenceId];
  const takeId = occurrence?.activeTakeId ?? null;

  const resultOf = (clipId: string) =>
    Object.values(state.lipsyncResults).find(r => !r.removed && r.clipId === clipId && r.takeId === takeId);

  const px = (f: number) => ((f - view.from) / view.span) * 100;

  const analyze = async (clipId: string) => {
    const track = tracks.find(t => t.clip.id === clipId);
    if (!track || !takeId) return;
    const version = audioVersion(state, track.clip);
    const url = version ? urls[version.id] : undefined;
    if (!version || !url) { setError(tk("app-scene-editor-animation-mouth-track.analyze.set-error.2d6009abe85b")); return; }
    setBusy(true); setError(null);
    try {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      const words = (version.alignment?.words ?? []).map(w => ({ startMs: w.startMs === null ? null : w.startMs - track.clip.sourceInMs, endMs: w.endMs === null ? null : w.endMs - track.clip.sourceInMs, text: w.text }));
      const out = await analyzeLipsync({ audioBytes: bytes, fps: state.project.fps.num / state.project.fps.den, words, dialogText: track.block?.text ?? "" });
      const draft = lipsyncDraft(crypto.randomUUID(), clipId, takeId, track.clip.blockId, out, resultOf(clipId) ?? null);
      setProposal({ clipId, draft });
    } catch {
      setError(tk("app-scene-editor-animation-mouth-track.analyze.set-error.d7cb2781631d"));
    } finally { setBusy(false); }
  };

  const applyProposal = () => {
    if (!proposal) return;
    const failure = run({ type: "SaveLipsyncResult", result: proposal.draft }, tk("app-scene-editor-animation-mouth-track.failure.run.7927bb01e6ce"));
    if (failure) { setError(failure); return; }
    setProposal(null);
  };

  const cycleViseme = (result: LipsyncResult, span: VisemeSpan) => {
    const current = result.overrides.find(o => o.frame === span.frame)?.viseme ?? span.viseme;
    const next = VISEME_ORDER[(VISEME_ORDER.indexOf(current) + 1) % VISEME_ORDER.length]!;
    const overrides = [...result.overrides.filter(o => o.frame !== span.frame), { frame: span.frame, viseme: next }]
      .sort((a, b) => a.frame - b.frame);
    setError(run({ type: "SetLipsyncOverrides", lipsyncId: result.id, overrides }, tk("app-scene-editor-animation-mouth-track.cycle-viseme.run.1e9dc8078635")));
  };

  if (!tracks.length) return null;
  return <section data-testid="anim-mouth-track" aria-label={tk("app-scene-editor-animation-mouth-track.mouth-track.aria-label.3069222c7121")} className="border-t border-border">
    <div className="flex h-6 items-center gap-1 border-b border-border bg-surface-2 px-2">
      <Mic className="size-3 text-text-tertiary" aria-hidden />
      <span className="text-[11px] uppercase tracking-wider text-text-tertiary">{tk("app-scene-editor-animation-mouth-track.mouth-track.span.3069222c7121")}</span>
      {proposal ? <span className="ml-auto flex items-center gap-1">
        <span className="text-[11px] text-text-secondary">{tk("app-scene-editor-animation-mouth-track.mouth-track.span.e56c589724ab")}</span>
        <IconButton data-testid="lipsync-apply" label={tk("app-scene-editor-animation-mouth-track.mouth-track.label.0a9f89123ac1")} onClick={applyProposal}><Check /></IconButton>
        <IconButton data-testid="lipsync-discard" label={tk("app-scene-editor-animation-mouth-track.mouth-track.label.681a5e530236")} onClick={() => setProposal(null)}><X /></IconButton>
      </span> : null}
      <span aria-live="assertive" data-testid="lipsync-message" className="ml-auto text-[11px] text-status-danger">{error ? <span role="alert">{error}</span> : null}</span>
    </div>
    {tracks.map(t => {
      const result = resultOf(t.clip.id);
      const isProposal = proposal?.clipId === t.clip.id;
      const shown = isProposal ? proposal.draft : result;
      const stale = result ? lipsyncStale(result, "", "") : false;
      const active = frame >= t.start && frame < t.end;
      return <div key={t.clip.id} data-testid={`mouth-row-${t.clip.id}`} className="relative flex h-7 items-center border-b border-border bg-surface-1">
        <div className="flex w-40 shrink-0 items-center gap-1 truncate px-2">
          <AssetThumb state={state} assetId={t.clip.assetId} size="sm" />
          <span className="truncate text-[11px] text-text-secondary">{t.block?.text ?? t.clip.name}</span>
          {result ? <IconButton data-testid={`lipsync-toggle-${t.clip.id}`} aria-pressed={result.enabled} label={result.enabled ? tk("app-scene-editor-animation-mouth-track.mouth-track.label.1be0031bd305") : tk("app-scene-editor-animation-mouth-track.mouth-track.label.69d757b4a151")} active={result.enabled} disabled={!editable}
            onClick={() => setError(run({ type: "SetLipsyncEnabled", lipsyncId: result.id, enabled: !result.enabled }, tk("app-scene-editor-animation-mouth-track.mouth-track.run.323cd339490e")))}><Mic /></IconButton> : null}
          <IconButton data-testid={`lipsync-generate-${t.clip.id}`} label={result ? tk("app-scene-editor-animation-mouth-track.mouth-track.label.01d46e56c2f7") : tk("app-scene-editor-animation-mouth-track.mouth-track.label.921e9ab066c5")} disabled={!editable || busy || !takeId} onClick={() => void analyze(t.clip.id)}><RefreshCw /></IconButton>
          {stale ? <span className="text-[11px] text-status-discrepancy" title={tk("app-scene-editor-animation-mouth-track.mouth-track.title.549c70b0a94f")}>!</span> : null}
        </div>
        <div className="relative h-full min-w-0 flex-1">
          {shown?.spans.map(span => {
            const a = Math.max(span.frame + t.start, view.from), b = Math.min(span.endFrame + t.start, view.from + view.span);
            if (b <= a) return null;
            const viseme = visemeAt(shown, span.frame);
            return <button key={span.frame} type="button" data-testid={`viseme-${t.clip.id}-${span.frame}`} data-viseme={viseme}
              aria-label={tk("app-scene-editor-animation-mouth-track.mouth-track.aria-label.e117606e9862", { viseme: String(viseme) })} disabled={!editable || isProposal || !result}
              onClick={() => result && cycleViseme(result, span)}
              className={"absolute top-1 flex h-5 items-center justify-center overflow-hidden rounded-sm font-mono text-[11px] font-semibold leading-none text-accent-fg focus-visible:ring-2 focus-visible:ring-focus-ring " + (isProposal ? "opacity-60 outline-dashed outline-1 outline-accent-brand" : "") + (active ? "" : " opacity-80")}
              style={{ left: `${px(a)}%`, width: `${Math.max(0.4, px(b) - px(a))}%`, background: VISEME_COLORS[viseme] }}><span aria-hidden data-testid="viseme-letter">{viseme}</span></button>;
          })}
          {!shown ? <span className="absolute top-1.5 text-[11px] text-text-tertiary" style={{ left: `${px(t.start)}%` }}>{takeId ? tk("app-scene-editor-animation-mouth-track.mouth-track.span.dccc327c354c") : tk("app-scene-editor-animation-mouth-track.mouth-track.span.de86e9b87672")}</span> : null}
        </div>
      </div>;
    })}
  </section>;
}
