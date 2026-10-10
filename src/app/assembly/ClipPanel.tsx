/**
 * Panelet til høyre i monteringen: den valgte scenen (materiale, start, lengde og handlinger) og manuset for
 * scenen (mandat 6.2 på scenenivå: manus og film side ved side, «Følg avspillingen» av/på – REQ-0100/0101).
 * Tekniske detaljer vises her, ikke i manuset (mandat 6.3).
 */
import { Link } from "@tanstack/react-router";
import {
  Check,
  Clapperboard,
  EyeOff,
  FileText,
  Film,
  Layers,
  Loader2,
  Plus,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FILM_AUDIO_MAX_BYTES,
  MAX_DURATION_SECONDS,
  MAX_TRANSITION_FRAMES,
  MIN_DURATION_SECONDS,
  blockAtFrame,
  blockSpans,
  blocksOfVariant,
  formatHeading,
  formatTimecode,
  framesToSeconds,
  secondsToFrames,
  type BlockSpan,
  type FilmClip,
  type ProjectState,
  type ScriptBlock,
  type Take,
  type Transition,
  type TransitionKind,
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
  frame,
  onSeek,
  onUseTake,
  onImportFilm,
  onTransition,
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
  /** Avspillingshodet (bilde i filmen). */
  frame: number;
  /** Flytt avspillingshodet (klikk på en replikk). */
  onSeek: (frame: number) => void;
  /** «Bruk denne»: importert film (versjonens id) eller animatic (null). */
  onUseTake: (takeId: string | null) => void;
  /** Importer en filmfil til scenen. Returnerer feilmelding eller null. */
  onImportFilm: (file: File) => Promise<string | null>;
  onTransition: (t: Transition) => void;
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
  const film = clip.source === "film";
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
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
            {film ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <Film className="size-3.5 shrink-0 text-accent-warm" aria-hidden />
                <span className="truncate" title={clip.take?.media?.fileName}>
                  Ferdig film – {clip.take?.media?.fileName ?? "importert"}
                </span>
              </span>
            ) : placeholder ? (
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
            {film ? (
              <span className="text-text-secondary">
                {formatSeconds(seconds)}{" "}
                <span className="text-text-tertiary">(filmens lengde)</span>
              </span>
            ) : placeholder ? (
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

      <Versions
        state={state}
        clip={clip}
        editable={editable}
        onUseTake={onUseTake}
        onImportFilm={onImportFilm}
      />
      <TransitionRow
        key={clip.occurrenceId}
        clip={clip}
        fps={fps.num / fps.den}
        editable={editable}
        onTransition={onTransition}
      />

      <section aria-label="Manus for scenen" className="flex min-h-[280px] flex-1 flex-col">
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
        <SceneText state={state} clip={clip} frame={frame} follow={follow} onSeek={onSeek} />
      </section>
    </div>
  );
}

/** Scenens tekst i manusform (forenklet: ingen sideskift). Klikk på en blokk flytter avspillingshodet dit. */
function SceneText({
  state,
  clip,
  frame,
  follow,
  onSeek,
}: {
  state: ProjectState;
  clip: FilmClip;
  frame: number;
  follow: boolean;
  onSeek: (frame: number) => void;
}) {
  const blocks = blocksOfVariant(state, clip.variantId);
  const spans = useMemo(() => blockSpans(state, clip), [state, clip]);
  const spanOf = useMemo(() => new Map(spans.map((x) => [x.blockId, x])), [spans]);
  const here = blockAtFrame(spans, frame);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [clip.occurrenceId]);
  // Følg avspillingen: blokken under avspillingshodet holdes synlig
  useEffect(() => {
    if (!follow || !here) return;
    const el = ref.current?.querySelector<HTMLElement>(`[data-block="${here.blockId}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [follow, here?.blockId, here]);
  return (
    <div
      ref={ref}
      className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 font-['Courier_Prime',_'Courier_New',_monospace] text-[12px] leading-[1.35] text-text-primary"
    >
      <button
        type="button"
        onClick={() => onSeek(clip.startFrame)}
        className="mb-2 block text-left font-bold uppercase hover:text-accent-brand"
        title="Gå til starten av scenen"
      >
        {formatHeading(clip.heading)}
      </button>
      {blocks.length === 0 ? (
        <p className="text-text-tertiary">Scenen har ingen tekst.</p>
      ) : (
        blocks.map((b) => {
          const sp = spanOf.get(b.id);
          const on =
            here !== null &&
            sp !== undefined &&
            sp.startFrame === here.startFrame &&
            frame < sp.endFrame;
          return (
            <Block
              key={b.id}
              b={b}
              span={sp}
              active={on}
              fps={state.project.fps.num / state.project.fps.den}
              onSeek={onSeek}
            />
          );
        })
      )}
    </div>
  );
}

function Block({
  b,
  span,
  active,
  fps,
  onSeek,
}: {
  b: ScriptBlock;
  span: BlockSpan | undefined;
  active: boolean;
  fps: number;
  onSeek: (frame: number) => void;
}) {
  if (b.kind === "heading") return null;
  const cls =
    b.kind === "character"
      ? "mt-2 pl-[38%] uppercase"
      : b.kind === "parenthetical"
        ? "pl-[30%] pr-[25%]"
        : b.kind === "dialogue"
          ? "pl-[20%] pr-[15%]"
          : b.kind === "transition"
            ? "mt-2 text-right uppercase"
            : b.kind === "note"
              ? "mt-2 text-text-tertiary"
              : "mt-2 whitespace-pre-wrap";
  const text = b.kind === "note" ? `[${b.text}]` : b.text;
  if (!span) return <p className={cls}>{text}</p>;
  const at = `${(Math.floor((span.startFrame / fps) * 10) / 10).toLocaleString("nb-NO")} s`;
  return (
    <p
      data-block={b.id}
      role="button"
      tabIndex={0}
      onClick={() => onSeek(span.startFrame)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSeek(span.startFrame);
        }
      }}
      title={`Gå hit i filmen (${at}${span.kind === "linked" ? ", fra lydklippet" : ", beregnet"})`}
      aria-current={active ? "true" : undefined}
      className={
        cls +
        " -mx-1 cursor-pointer rounded-sm px-1 outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring" +
        (active ? " bg-accent-selection" : "")
      }
    >
      {text}
    </p>
  );
}

/** Versjonene av scenen: animatic (2D-scene/tittelkort) og importert film. «Bruk denne» velger (REQ-0233). */
function Versions({
  state,
  clip,
  editable,
  onUseTake,
  onImportFilm,
}: {
  state: ProjectState;
  clip: FilmClip;
  editable: boolean;
  onUseTake: (takeId: string | null) => void;
  onImportFilm: (file: File) => Promise<string | null>;
}) {
  const fps = state.project.fps;
  const films = useMemo(
    () =>
      Object.values(state.takes)
        .filter(
          (t) =>
            t.kind === "imported_film" &&
            t.mediaRef !== null &&
            state.occurrences[t.occurrenceId]?.sceneId === clip.sceneId,
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
    [state.takes, state.occurrences, clip.sceneId],
  );
  const activeId = clip.take?.id ?? null;
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [clip.occurrenceId]);

  async function pick(file: File) {
    setBusy(true);
    setError(null);
    try {
      setError(await onImportFilm(file));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const row = (on: boolean) =>
    "flex items-center gap-2 rounded-sm border px-2 py-1.5 text-xs " +
    (on ? "border-accent-brand bg-accent-selection/40" : "border-border bg-surface-2");
  const use = (on: boolean, id: string | null, name: string) =>
    on ? (
      <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-status-success">
        <Check className="size-3" aria-hidden />I bruk
      </span>
    ) : editable ? (
      <button
        type="button"
        onClick={() => onUseTake(id)}
        className="shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
        aria-label={`Bruk ${name}`}
      >
        Bruk denne
      </button>
    ) : null;

  return (
    <section
      aria-label="Versjoner av scenen"
      className="flex flex-col gap-1.5 border-b border-border p-3"
    >
      <h2 className={label}>Versjoner av scenen</h2>
      <div className={row(activeId === null)}>
        {clip.compositionId ? (
          <Layers className="size-3.5 shrink-0 text-accent-brand" aria-hidden />
        ) : (
          <Clapperboard className="size-3.5 shrink-0 text-text-tertiary" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-text-primary">
          Animatic {clip.compositionId ? "(2D-scene)" : "(tittelkort)"}
        </span>
        {use(activeId === null, null, "animatic")}
      </div>
      {films.map((t) => (
        <FilmRow key={t.id} take={t} fps={fps.num / fps.den} className={row(activeId === t.id)}>
          {use(activeId === t.id, t.id, t.media?.fileName ?? "filmen")}
        </FilmRow>
      ))}
      {editable ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm"
            className="sr-only"
            aria-label="Velg filmfil"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pick(f);
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            title="Last opp ferdig film for scenen (MP4, MOV eller WebM). Filen lagres uendret, og den tas i bruk med én gang."
          >
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            {busy ? "Importerer …" : "Importer ferdig film …"}
          </Button>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function FilmRow({
  take,
  fps,
  className,
  children,
}: {
  take: Take;
  fps: number;
  className: string;
  children: React.ReactNode;
}) {
  const m = take.media;
  const facts = [
    take.durationFrames ? formatSeconds(take.durationFrames / fps) : null,
    m?.width && m.height ? `${m.width}×${m.height}` : null,
    m?.fps ? `${Math.round(m.fps * 100) / 100} b/s` : null,
    m && !m.hasAudio ? "uten lyd" : null,
    m && m.hasAudio && m.byteSize > FILM_AUDIO_MAX_BYTES
      ? "lyden spilles ikke (filen er over 400 MB)"
      : null,
  ].filter(Boolean);
  const off = m?.fps && Math.abs(m.fps - fps) > 0.05;
  return (
    <div className={className}>
      <Film className="size-3.5 shrink-0 text-accent-warm" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-text-primary" title={m?.fileName}>
          {m?.fileName ?? "Importert film"}
        </span>
        <span className="block truncate text-[10px] text-text-tertiary">
          {facts.join(" · ")}
          {off ? ` · prosjektet har ${Math.round(fps * 100) / 100} b/s` : ""}
        </span>
      </span>
      {children}
    </div>
  );
}

const TRANSITION_LABEL: Record<TransitionKind, string> = {
  cut: "Kutt",
  dissolve: "Overtoning",
  dip: "Via svart",
};

/** Overgangen inn i scenen (REQ-0223): kutt, overtoning eller via svart, med lengde i sekunder. */
function TransitionRow({
  clip,
  fps,
  editable,
  onTransition,
}: {
  clip: FilmClip;
  fps: number;
  editable: boolean;
  onTransition: (t: Transition) => void;
}) {
  const t = clip.transition;
  const [draft, setDraft] = useState<string | null>(null);
  const seconds = Math.round((t.frames / fps) * 100) / 100;
  const first = clip.startFrame === 0;
  function setSeconds(text: string) {
    const v = Number(text.trim().replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return;
    const frames = Math.max(1, Math.min(MAX_TRANSITION_FRAMES, Math.round(v * fps)));
    if (frames !== t.frames) onTransition({ kind: t.kind, frames });
  }
  return (
    <section
      aria-label="Overgang inn i scenen"
      className="flex flex-col gap-1.5 border-b border-border p-3"
    >
      <h2 className={label}>{first ? "Starten av filmen" : "Overgang inn i scenen"}</h2>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <select
          aria-label="Overgang"
          value={t.kind}
          disabled={!editable}
          onChange={(e) => {
            const kind = e.target.value as TransitionKind;
            onTransition(
              kind === "cut" ? { kind, frames: 0 } : { kind, frames: t.frames || Math.round(fps) },
            );
          }}
          className="h-6 rounded-sm border border-border-control bg-surface-3 px-1 text-xs text-text-primary disabled:opacity-50"
        >
          {(["cut", "dissolve", "dip"] as const).map((k) => (
            <option key={k} value={k}>
              {first && k !== "cut" ? "Inntoning fra svart" : TRANSITION_LABEL[k]}
            </option>
          ))}
        </select>
        {t.kind !== "cut" ? (
          <>
            <input
              type="number"
              inputMode="decimal"
              aria-label="Overgangens lengde i sekunder"
              step={0.1}
              min={0.04}
              max={MAX_TRANSITION_FRAMES / fps}
              disabled={!editable}
              value={draft ?? String(seconds)}
              onFocus={() => setDraft(String(seconds))}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (draft !== null) setSeconds(draft);
                setDraft(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                else if (e.key === "Escape") {
                  setDraft(null);
                  e.currentTarget.blur();
                }
              }}
              className="h-6 w-14 rounded-sm border border-border-control bg-surface-3 px-1.5 font-mono text-xs text-text-primary disabled:opacity-50"
            />
            <span className="text-text-tertiary">s</span>
          </>
        ) : null}
      </div>
      {t.kind !== "cut" && !first ? (
        <p className="text-[11px] text-text-tertiary">
          Midt på klippet: halvparten før og halvparten etter. Filmens lengde endres ikke.
        </p>
      ) : null}
    </section>
  );
}
