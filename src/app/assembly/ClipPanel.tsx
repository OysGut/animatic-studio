/**
 * Panelet til høyre i monteringen: den valgte scenen (materiale, start, lengde og handlinger) og manuset for
 * scenen (mandat 6.2 på scenenivå: manus og film side ved side, «Følg avspillingen» av/på – REQ-0100/0101).
 * Tekniske detaljer vises her, ikke i manuset (mandat 6.3).
 */
import { Link } from "@tanstack/react-router";
import { Clapperboard, EyeOff, FileText, Layers, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  blocksOfVariant,
  formatHeading,
  formatTimecode,
  framesToSeconds,
  secondsToFrames,
  type FilmClip,
  type ProjectState,
  type ScriptBlock,
} from "@/core";
import { Button } from "@/components/ui/button";
import { formatSeconds } from "./FilmTimeline";

const label = "text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary";

export function ClipPanel({
  state,
  projectId,
  clip,
  clipCount,
  editable,
  follow,
  onFollowChange,
  onDuration,
  onEstimate,
  onCreateComposition,
  onDeactivate,
}: {
  state: ProjectState;
  projectId: string;
  clip: FilmClip | null;
  clipCount: number;
  editable: boolean;
  follow: boolean;
  onFollowChange: (on: boolean) => void;
  onDuration: (frames: number) => void;
  /** Bruk lengden som er beregnet fra manuset. */
  onEstimate: () => void;
  onCreateComposition: () => void;
  onDeactivate: () => void;
}) {
  const fps = state.project.fps;
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  useEffect(() => setDraft(null), [clip?.occurrenceId]);
  if (!clip)
    return (
      <p className="p-3 text-[13px] text-text-tertiary">
        {clipCount === 0 ? "Ingen aktive scener." : "Velg en scene i tidslinjen."}
      </p>
    );
  const seconds = Math.round(framesToSeconds(clip.durationFrames, fps) * 100) / 100;
  const placeholder = clip.source === "placeholder";
  const comp = clip.compositionId ? state.compositions[clip.compositionId] : undefined;

  function commit() {
    const text = draft;
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (text === null || text.trim() === "") return;
    const v = Number(text.trim().replace(",", "."));
    if (!Number.isFinite(v)) return;
    const frames = secondsToFrames(
      Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, v)),
      fps,
    );
    if (frames !== clip?.durationFrames || clip.durationKind === "estimate") onDuration(frames);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section aria-label="Valgt scene" className="flex flex-col gap-2 border-b border-border p-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] text-text-tertiary">
            {clip.productionNumber ?? "–"}
          </span>
          <h2 className="min-w-0 truncate text-[13px] font-medium text-text-primary">
            {formatHeading(clip.heading) || "Uten overskrift"}
          </h2>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-text-tertiary">Materiale</dt>
          <dd className="flex items-center gap-1.5 text-text-primary">
            {placeholder ? (
              <>
                <Clapperboard className="size-3.5 text-text-tertiary" aria-hidden />
                Tittelkort (ingen 2D-scene ennå)
              </>
            ) : (
              <>
                <Layers className="size-3.5 text-accent-brand" aria-hidden />
                2D-scene{comp?.name ? ` – ${comp.name}` : ""}
              </>
            )}
          </dd>
          <dt className="text-text-tertiary">Starter</dt>
          <dd className="font-mono text-text-primary">{formatTimecode(clip.startFrame, fps)}</dd>
          <dt className="self-center text-text-tertiary">Lengde</dt>
          <dd className="flex flex-wrap items-center gap-1.5">
            {placeholder ? (
              <span className="italic text-text-secondary">
                ≈ {formatSeconds(seconds)}{" "}
                <span className="not-italic text-text-tertiary">(beregnet fra manus)</span>
              </span>
            ) : (
              <>
                <input
                  type="number"
                  inputMode="decimal"
                  aria-label="Lengde i sekunder"
                  step={0.5}
                  min={MIN_DURATION_SECONDS}
                  max={MAX_DURATION_SECONDS}
                  disabled={!editable}
                  value={draft ?? String(seconds)}
                  onFocus={() => setDraft(String(seconds))}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    else if (e.key === "Escape") {
                      cancelled.current = true;
                      e.currentTarget.blur();
                    }
                  }}
                  className="h-6 w-16 rounded-sm border border-border-control bg-surface-3 px-1.5 font-mono text-xs text-text-primary disabled:opacity-50"
                />
                <span className="text-text-tertiary">s</span>
                {clip.durationKind === "estimate" ? (
                  <span className="text-text-tertiary">(beregnet fra manus)</span>
                ) : editable ? (
                  <button
                    type="button"
                    onClick={onEstimate}
                    className="rounded-sm px-1 text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                    title="Bruk lengden som er beregnet fra manuset"
                  >
                    Fra manus
                  </button>
                ) : null}
              </>
            )}
          </dd>
        </dl>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {placeholder && editable ? (
            <Button size="sm" variant="secondary" onClick={onCreateComposition}>
              <Plus />
              Lag 2D-scene
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" asChild>
            <Link
              to="/prosjekt/$projectId/scene"
              params={{ projectId }}
              search={{ scene: clip.occurrenceId }}
            >
              <Layers />
              Åpne i sceneeditoren
            </Link>
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link
              to="/prosjekt/$projectId/manus"
              params={{ projectId }}
              search={{ scene: clip.occurrenceId }}
            >
              <FileText />
              Vis i manus
            </Link>
          </Button>
          {editable ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDeactivate}
              title="Tar scenen ut av filmen og manuset. Den slettes ikke og kan aktiveres igjen i manuset."
            >
              <EyeOff />
              Deaktiver
            </Button>
          ) : null}
        </div>
      </section>

      <section aria-label="Manus for scenen" className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-3 pb-1 pt-2">
          <h2 className={label}>Manus</h2>
          <label
            className="ml-auto flex items-center gap-1.5 text-xs text-text-secondary"
            title="Manuset viser scenen under avspillingshodet"
          >
            <input
              type="checkbox"
              checked={follow}
              onChange={(e) => onFollowChange(e.target.checked)}
              className="size-3.5 accent-[var(--accent-brand)]"
            />
            Følg avspillingen
          </label>
        </div>
        <SceneText state={state} clip={clip} />
      </section>
    </div>
  );
}

/** Scenens tekst i manusform (forenklet: ingen sideskift). */
function SceneText({ state, clip }: { state: ProjectState; clip: FilmClip }) {
  const blocks = blocksOfVariant(state, clip.variantId);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [clip.occurrenceId]);
  return (
    <div
      ref={ref}
      className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 font-['Courier_Prime',_'Courier_New',_monospace] text-[12px] leading-[1.35] text-text-primary"
    >
      <p className="mb-2 font-bold uppercase">{formatHeading(clip.heading)}</p>
      {blocks.length === 0 ? (
        <p className="text-text-tertiary">Scenen har ingen tekst.</p>
      ) : (
        blocks.map((b) => <Block key={b.id} b={b} />)
      )}
    </div>
  );
}

function Block({ b }: { b: ScriptBlock }) {
  switch (b.kind) {
    case "heading":
      return null;
    case "character":
      return <p className="mt-2 pl-[38%] uppercase">{b.text}</p>;
    case "parenthetical":
      return <p className="pl-[30%] pr-[25%]">{b.text}</p>;
    case "dialogue":
      return <p className="pl-[20%] pr-[15%]">{b.text}</p>;
    case "transition":
      return <p className="mt-2 text-right uppercase">{b.text}</p>;
    case "note":
      return <p className="mt-2 text-text-tertiary">[{b.text}]</p>;
    default:
      return <p className="mt-2 whitespace-pre-wrap">{b.text}</p>;
  }
}
