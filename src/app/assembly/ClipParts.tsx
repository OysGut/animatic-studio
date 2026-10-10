/**
 * «Klipp» i scenepanelet (DEC-0048, REQ-0220–0222, REQ-0239): delene klippet består av, med inn- og
 * utpunkt bildepresist, kilde (importert film eller animatic), splitting ved avspillingshodet og fjerning.
 * Kildemediet endres aldri; alt lagres som deler (SetSceneEdit) og kan angres.
 */
import { Film, Layers, Minus, Plus, RotateCcw, Scissors, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import {
  editableParts,
  newId,
  removePart,
  setPartSource,
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
  /** Importerte filmer for scenen (kan brukes som kilde for en del). */
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
      <section aria-label="Klipp" className="flex flex-col gap-1.5 border-b border-border p-3">
        <h2 className={label}>Klipp</h2>
        <p className="text-xs text-text-tertiary">
          En av delene mangler kilde (2D-scenen eller filmen er borte) og vises som tittelkort.
        </p>
        {editable ? (
          <Button size="sm" variant="secondary" className="self-start" onClick={onReset}>
            <RotateCcw /> Hele klippet igjen
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
    <section aria-label="Klipp" className="flex flex-col gap-1.5 border-b border-border p-3">
      <div className="flex items-center gap-2">
        <h2 className={label}>Klipp</h2>
        <span className="text-[11px] text-text-tertiary">
          {parts.length === 1 ? "én del" : `${parts.length} deler`}
        </span>
        {clip.edited && editable ? (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto flex items-center gap-1 rounded-sm px-1 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title="Fjern kutt og splitting: hele versjonen brukes igjen"
          >
            <RotateCcw className="size-3" aria-hidden /> Hele klippet
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
                <span className="font-mono text-[10px] text-text-tertiary">{i + 1}</span>
                {p.source === "take" ? (
                  <Film className="size-3.5 shrink-0 text-accent-warm" aria-hidden />
                ) : (
                  <Layers className="size-3.5 shrink-0 text-accent-brand" aria-hidden />
                )}
                <select
                  aria-label={`Kilde for del ${i + 1}`}
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
                      "Bytt kilde for del",
                    )
                  }
                  className="h-6 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1 text-xs text-text-primary disabled:opacity-50"
                >
                  {canAnimatic ? <option value="">Animatic (2D-scene)</option> : null}
                  {films.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.media?.fileName ?? "Importert film"}
                    </option>
                  ))}
                  {take && !films.some((t) => t.id === take.id) ? (
                    <option value={take.id}>{take.media?.fileName ?? "Importert film"}</option>
                  ) : null}
                </select>
                <span className="shrink-0 font-mono text-[11px] text-text-secondary">
                  {(r.durationFrames / fps).toLocaleString("nb-NO", { maximumFractionDigits: 2 })} s
                </span>
                {editable && parts.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => edit(removePart(parts, i), "Fjern del")}
                    aria-label={`Fjern del ${i + 1}`}
                    title="Fjern delen (kildemediet beholdes)"
                    className="rounded-sm p-0.5 text-text-tertiary hover:bg-surface-3 hover:text-status-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <PointInput
                  label="Inn"
                  ms={p.inMs}
                  fps={fps}
                  disabled={!editable}
                  onChange={(ms) => edit(trimPart(parts, i, { inMs: ms }, maxMs), "Endre innpunkt")}
                  step={frameMs}
                />
                <PointInput
                  label="Ut"
                  ms={p.outMs}
                  fps={fps}
                  disabled={!editable}
                  onChange={(ms) => edit(trimPart(parts, i, { outMs: ms }, maxMs), "Endre utpunkt")}
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
          title="Del klippet i to der avspillingshodet står (tasten S). Begge delene bruker samme kilde."
        >
          <Scissors /> Splitt ved avspillingshodet
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
        aria-label={`${l}: ett bilde tilbake`}
        title="Ett bilde tilbake"
      >
        <Minus className="size-3" />
      </button>
      <input
        type="text"
        inputMode="decimal"
        aria-label={`${l}punkt i sekunder`}
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
        title={`Bilde ${frame}`}
      />
      <button
        type="button"
        className={btn}
        disabled={disabled}
        onClick={() => onChange(Math.round((frame + 1) * step))}
        aria-label={`${l}: ett bilde fram`}
        title="Ett bilde fram"
      >
        <Plus className="size-3" />
      </button>
    </label>
  );
}
