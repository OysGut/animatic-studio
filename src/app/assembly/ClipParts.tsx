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
import { t as tk } from "@/core/i18n/keyed";

const label = "text-[11px] font-medium uppercase tracking-wider text-text-tertiary";

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
        aria-label={tk("app-assembly-clip-parts.clip-parts.aria-label.b5dad0f44b23")}
        className="flex flex-col gap-1.5 border-b border-border p-3"
      >
        <h2 className={label + " -mx-3 flex h-8 shrink-0 items-center border-b border-border bg-surface-2 px-2"}>{tk("app-assembly-clip-parts.clip-parts.h2.b5dad0f44b23")}</h2>
        <p className="text-xs text-text-tertiary">
          {tk("app-assembly-clip-parts.clip-parts.p.0514e3afce37")}
        </p>
        {editable ? (
          <Button size="sm" variant="secondary" className="self-start" onClick={onReset}>
            <RotateCcw /> {tk("app-assembly-clip-parts.clip-parts.button.c80119357046")}
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
      aria-label={tk("app-assembly-clip-parts.clip-parts.aria-label.b5dad0f44b23.2")}
      className="flex flex-col gap-1.5 border-b border-border p-3"
    >
      <div className="-mx-3 group flex h-8 shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-2">
        <h2 className={label + " flex h-8 shrink-0 items-center"}>{tk("app-assembly-clip-parts.clip-parts.h2.b5dad0f44b23.2")}</h2>
        <span className="text-[11px] text-text-tertiary">
          {parts.length === 1
            ? tk("app-assembly-clip-parts.clip-parts.span.ebec0aeec253")
            : tk("app-assembly-clip-parts.clip-parts.span.bfe1a3480422", { length: String(parts.length) })}
        </span>
        {clip.edited && editable && !clip.inheritedFrom ? (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto flex items-center gap-1 rounded-sm px-1 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title={tk("app-assembly-clip-parts.clip-parts.title.1c7bfb496256")}
          >
            <RotateCcw className="size-3" aria-hidden /> {tk("app-assembly-clip-parts.clip-parts.button.b2d3da6336ed")}
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
                  aria-label={tk("app-assembly-clip-parts.clip-parts.aria-label.1538b2bace0c", { value1: String(i + 1) })}
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
                      tk("app-assembly-clip-parts.clip-parts.edit.685bf9c582b9"),
                    )
                  }
                  className="h-6 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1 text-xs text-text-primary disabled:opacity-50"
                >
                  {canAnimatic ? (
                    <option value="">{tk("app-assembly-clip-parts.clip-parts.option.7632fe4d3f95")}</option>
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
                    aria-label={tk("app-assembly-clip-parts.clip-parts.aria-label.2d624eee09e6", { value1: String(i + 1) })}
                    title={tk("app-assembly-clip-parts.clip-parts.title.d8ca1c2e35aa")}
                    value={String(p.transitionMs ?? 0)}
                    disabled={!editable}
                    onChange={(e) =>
                      edit(
                        setPartTransition(parts, i, Number(e.target.value)),
                        tk("app-assembly-clip-parts.clip-parts.edit.165076610641"),
                      )
                    }
                    className="h-6 shrink-0 rounded-sm border border-border-control bg-surface-3 px-1 text-[11px] text-text-primary disabled:opacity-50"
                  >
                    <option value="0">{tk("app-assembly-clip-parts.clip-parts.option.3913cda02d76")}</option>
                    <option value="250">{tk("app-assembly-clip-parts.clip-parts.option.e765fd4973a3")}</option>
                    <option value="500">{tk("app-assembly-clip-parts.clip-parts.option.048281f6722b")}</option>
                    <option value="1000">{tk("app-assembly-clip-parts.clip-parts.option.78173653a9e5")}</option>
                    <option value="2000">{tk("app-assembly-clip-parts.clip-parts.option.0894298c24f6")}</option>
                  </select>
                ) : null}
                {editable && parts.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => edit(removePart(parts, i), tk("app-assembly-clip-parts.clip-parts.edit.831f674d8fe9"))}
                    aria-label={tk("app-assembly-clip-parts.clip-parts.aria-label.d6c133661d07", { value1: String(i + 1) })}
                    title={tk("app-assembly-clip-parts.clip-parts.title.8a801aedfec8")}
                    className="rounded-sm p-0.5 text-text-tertiary hover:bg-surface-3 hover:text-status-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <PointInput
                  label={tk("app-assembly-clip-parts.clip-parts.label.e6be0aafb79f")}
                  ms={p.inMs}
                  fps={fps}
                  disabled={!editable}
                  onChange={(ms) =>
                    edit(
                      trimPart(parts, i, { inMs: ms }, maxMs),
                      tk("app-assembly-clip-parts.clip-parts.edit.e397358d955a"),
                    )
                  }
                  step={frameMs}
                />
                <PointInput
                  label={tk("app-assembly-clip-parts.clip-parts.label.1895eb0f75a5")}
                  ms={p.outMs}
                  fps={fps}
                  disabled={!editable}
                  onChange={(ms) =>
                    edit(
                      trimPart(parts, i, { outMs: ms }, maxMs),
                      tk("app-assembly-clip-parts.clip-parts.edit.e497d809b818"),
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
          title={tk("app-assembly-clip-parts.clip-parts.title.c460bb6637c8")}
        >
          <Scissors /> {tk("app-assembly-clip-parts.clip-parts.button.fd2194a99a7b")}
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
        aria-label={tk("app-assembly-clip-parts.point-input.aria-label.dc1592f615eb", { l: String(l) })}
        title={tk("app-assembly-clip-parts.point-input.title.85a7cc6df4fa")}
      >
        <Minus className="size-3" />
      </button>
      <input
        type="text"
        inputMode="decimal"
        aria-label={tk("app-assembly-clip-parts.point-input.aria-label.577bba60303f", { l: String(l) })}
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
        title={tk("app-assembly-clip-parts.point-input.title.d4a803d3be6e", { frame: String(frame) })}
      />
      <button
        type="button"
        className={btn}
        disabled={disabled}
        onClick={() => onChange(Math.round((frame + 1) * step))}
        aria-label={tk("app-assembly-clip-parts.point-input.aria-label.90ebac78dd45", { l: String(l) })}
        title={tk("app-assembly-clip-parts.point-input.title.693a4d5aa0e1")}
      >
        <Plus className="size-3" />
      </button>
    </label>
  );
}
