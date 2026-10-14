/**
 * «Klipp» i scenepanelet (DEC-0048, REQ-0220–0222, REQ-0239): delene klippet består av, med inn- og
 * utpunkt bildepresist, kilde (importert film eller animatic), splitting ved avspillingshodet og fjerning.
 * Kildemediet endres aldri; alt lagres som deler (SetSceneEdit) og kan angres.
 */
import { Film, ImageIcon, Layers, Minus, Plus, RotateCcw, Scissors, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import {
  L,
  editableParts,
  locale,
  newId,
  removePart,
  setPartSource,
  setPartTransition,
  takeLabel,
  trimPart,
  type ClipPartFields,
  type FilmClip,
  type ProjectState,
  type Take,
} from "@/core";
import { Button } from "@/components/ui/button";

const label = "text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary";

export function ClipParts({
  state,
  clip,
  films,
  editable,
  maxMsOf,
  onEdit,
  onReset,
  onSplit,
}: {
  state: ProjectState;
  clip: FilmClip;
  /** Importerte filmer, AI-videoer og stillbilder for scenen (kan brukes som kilde for en del). */
  films: readonly Take[];
  editable: boolean;
  maxMsOf: (takeId: string | null) => number;
  onEdit: (parts: ClipPartFields[], label: string) => void;
  onReset: () => void;
  onSplit: () => void;
}) {
  const fps = state.project.fps.num / state.project.fps.den;
  const frameMs = 1000 / fps;
  const parts = editableParts(clip, () => newId());
  if (!parts) {
    // En del mangler kilde (f.eks. 2D-scenen er slettet): bare tilbakestilling er mulig
    if (!clip.edited) return null;
    return (
      <section
        aria-label={L("Klipp", "Clip")}
        className="flex flex-col gap-1.5 border-b border-border p-3"
      >
        <h2 className={label}>{L("Klipp", "Clip")}</h2>
        <p className="text-xs text-text-tertiary">
          {L(
            "En av delene mangler kilde (2D-scenen eller filmen er borte) og vises som tittelkort.",
            "One of the parts has no source (the 2D scene or film is gone) and is shown as a title card.",
          )}
        </p>
        {editable ? (
          <Button size="sm" variant="secondary" className="self-start" onClick={onReset}>
            <RotateCcw /> {L("Hele klippet igjen", "Whole clip again")}
          </Button>
        ) : null}
      </section>
    );
  }
  const canAnimatic = clip.compositionId !== null;

  const edit = (next: ClipPartFields[] | null, what: string) => {
    if (next) onEdit(next, what);
  };

  return (
    <section
      aria-label={L("Klipp", "Clip")}
      className="flex flex-col gap-1.5 border-b border-border p-3"
    >
      <div className="flex items-center gap-2">
        <h2 className={label}>{L("Klipp", "Clip")}</h2>
        <span className="text-[11px] text-text-tertiary">
          {parts.length === 1
            ? L("én del", "one part")
            : L(`${parts.length} deler`, `${parts.length} parts`)}
        </span>
        {clip.edited && editable && !clip.inheritedFrom ? (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto flex items-center gap-1 rounded-sm px-1 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title={L(
              "Fjern kutt og splitting: hele versjonen brukes igjen",
              "Remove cuts and splits: the whole version is used again",
            )}
          >
            <RotateCcw className="size-3" aria-hidden /> {L("Hele klippet", "Whole clip")}
          </button>
        ) : null}
      </div>
      <ol className="flex flex-col gap-1">
        {parts.map((p, i) => {
          const r = clip.parts[i]!;
          const take = p.takeId ? state.takes[p.takeId] : undefined;
          const maxMs = maxMsOf(p.takeId);
          return (
            <li
              key={r.id ?? `del-${i}`}
              className="rounded-sm border border-border bg-surface-2 px-2 py-1.5"
            >
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-mono text-[11px] text-text-tertiary">{i + 1}</span>
                {take?.kind === "still" ? (
                  <ImageIcon className="size-3.5 shrink-0 text-accent-warm" aria-hidden />
                ) : p.source === "take" ? (
                  <Film className="size-3.5 shrink-0 text-accent-warm" aria-hidden />
                ) : (
                  <Layers className="size-3.5 shrink-0 text-accent-brand" aria-hidden />
                )}
                <select
                  aria-label={L(`Kilde for del ${i + 1}`, `Source for part ${i + 1}`)}
                  value={p.takeId ?? ""}
                  disabled={!editable}
                  onChange={(e) =>
                    edit(
                      setPartSource(
                        parts,
                        i,
                        { takeId: e.target.value || null },
                        maxMsOf(e.target.value || null),
                      ),
                      L("Bytt kilde for del", "Change source for part"),
                    )
                  }
                  className="h-6 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1 text-xs text-text-primary disabled:opacity-50"
                >
                  {canAnimatic ? (
                    <option value="">{L("Animatic (2D-scene)", "Animatic (2D scene)")}</option>
                  ) : null}
                  {films.map((t) => (
                    <option key={t.id} value={t.id}>
                      {takeLabel(state, t)}
                    </option>
                  ))}
                  {take && !films.some((t) => t.id === take.id) ? (
                    <option value={take.id}>{takeLabel(state, take)}</option>
                  ) : null}
                </select>
                <span className="shrink-0 font-mono text-[11px] text-text-secondary">
                  {(r.durationFrames / fps).toLocaleString(locale(), { maximumFractionDigits: 2 })}{" "}
                  s
                </span>
                {i > 0 ? (
                  <select
                    aria-label={L(`Overgang inn i del ${i + 1}`, `Transition into part ${i + 1}`)}
                    title={L(
                      "Myk overgang fra delen før (krysstoning, scenen blir ikke kortere)",
                      "Soft transition from the previous part (cross-dissolve, the scene does not get shorter)",
                    )}
                    value={String(p.transitionMs ?? 0)}
                    disabled={!editable}
                    onChange={(e) =>
                      edit(
                        setPartTransition(parts, i, Number(e.target.value)),
                        L("Overgang mellom deler", "Transition between parts"),
                      )
                    }
                    className="h-6 shrink-0 rounded-sm border border-border-control bg-surface-3 px-1 text-[11px] text-text-primary disabled:opacity-50"
                  >
                    <option value="0">{L("Kutt", "Cut")}</option>
                    <option value="250">{L("Tone 0,25 s", "Dissolve 0.25 s")}</option>
                    <option value="500">{L("Tone 0,5 s", "Dissolve 0.5 s")}</option>
                    <option value="1000">{L("Tone 1 s", "Dissolve 1 s")}</option>
                    <option value="2000">{L("Tone 2 s", "Dissolve 2 s")}</option>
                  </select>
                ) : null}
                {editable && parts.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => edit(removePart(parts, i), L("Fjern del", "Remove part"))}
                    aria-label={L(`Fjern del ${i + 1}`, `Remove part ${i + 1}`)}
                    title={L(
                      "Fjern delen (kildemediet beholdes)",
                      "Remove the part (the source media is kept)",
                    )}
                    className="rounded-sm p-0.5 text-text-tertiary hover:bg-surface-3 hover:text-status-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <PointInput
                  label={L("Inn", "In")}
                  ms={p.inMs}
                  fps={fps}
                  disabled={!editable}
                  onChange={(ms) =>
                    edit(
                      trimPart(parts, i, { inMs: ms }, maxMs),
                      L("Endre innpunkt", "Change in point"),
                    )
                  }
                  step={frameMs}
                />
                <PointInput
                  label={L("Ut", "Out")}
                  ms={p.outMs}
                  fps={fps}
                  disabled={!editable}
                  onChange={(ms) =>
                    edit(
                      trimPart(parts, i, { outMs: ms }, maxMs),
                      L("Endre utpunkt", "Change out point"),
                    )
                  }
                  step={frameMs}
                />
              </div>
            </li>
          );
        })}
      </ol>
      {editable ? (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={onSplit}
          title={L(
            "Del klippet i to der avspillingshodet står (tasten S). Begge delene bruker samme kilde.",
            "Split the clip in two at the playhead (key S). Both parts use the same source.",
          )}
        >
          <Scissors /> {L("Splitt ved avspillingshodet", "Split at the playhead")}
        </Button>
      ) : null}
    </section>
  );
}

/** Inn- eller utpunkt i sekunder i kilden, med ett bilde fram og tilbake. */
function PointInput({
  label: l,
  ms,
  fps,
  step,
  disabled,
  onChange,
}: {
  label: string;
  ms: number;
  fps: number;
  step: number;
  disabled: boolean;
  onChange: (ms: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const seconds = Math.round(ms / 10) / 100;
  const frame = Math.round((ms / 1000) * fps);
  const commit = () => {
    const text = draft;
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    // Bare når brukeren faktisk har endret tallet
    if (text === null || text.trim() === String(seconds)) return;
    const v = Number(text.trim().replace(",", "."));
    if (Number.isFinite(v) && v >= 0) onChange(Math.round(Math.round(v * fps) * (1000 / fps)));
  };
  const btn =
    "rounded-sm p-0.5 text-text-tertiary hover:bg-surface-3 hover:text-text-primary disabled:opacity-40";
  return (
    <label className="flex items-center gap-1 text-[11px] text-text-tertiary">
      <span className="w-5">{l}</span>
      <button
        type="button"
        className={btn}
        disabled={disabled}
        onClick={() => onChange(Math.max(0, Math.round((frame - 1) * step)))}
        aria-label={L(`${l}: ett bilde tilbake`, `${l}: one frame back`)}
        title={L("Ett bilde tilbake", "One frame back")}
      >
        <Minus className="size-3" />
      </button>
      <input
        type="text"
        inputMode="decimal"
        aria-label={L(`${l}punkt i sekunder`, `${l} point in seconds`)}
        disabled={disabled}
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
        className="h-6 w-14 min-w-0 rounded-sm border border-border-control bg-surface-3 px-1 font-mono text-xs text-text-primary disabled:opacity-50"
        title={L(`Bilde ${frame}`, `Frame ${frame}`)}
      />
      <button
        type="button"
        className={btn}
        disabled={disabled}
        onClick={() => onChange(Math.round((frame + 1) * step))}
        aria-label={L(`${l}: ett bilde fram`, `${l}: one frame forward`)}
        title={L("Ett bilde fram", "One frame forward")}
      >
        <Plus className="size-3" />
      </button>
    </label>
  );
}
