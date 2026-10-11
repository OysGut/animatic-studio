/**
 * Panelet til høyre i monteringen: den valgte scenen (materiale, start, lengde og handlinger) og manuset for
 * scenen (mandat 6.2 på scenenivå: manus og film side ved side, «Følg avspillingen» av/på – REQ-0100/0101).
 * Tekniske detaljer vises her, ikke i manuset (mandat 6.3).
 */
import { TransitionEditor } from "./TransitionEditor";
import { ScriptChanges, useSceneDiscrepancies } from "./ScriptChanges";
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
  Timer,
  Sparkles,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FILM_AUDIO_MAX_BYTES,
  MAX_DURATION_SECONDS,
  MAX_TRANSITION_FRAMES,
  MIN_DURATION_SECONDS,
  blockAtFrame,
  compositionFrameInClip,
  blockSpans,
  blocksOfVariant,
  formatHeading,
  formatTimecode,
  framesToSeconds,
  secondsToFrames,
  type BlockSpan,
  type Command,
  type FilmClip,
  type ProjectState,
  type ScriptBlock,
  type Take,
  type TakeStatus,
  type TimeLink,
  type ClipPartFields,
  type Transition,
  type TransitionKind,
} from "@/core";
import { Button } from "@/components/ui/button";
import { formatSeconds } from "./FilmTimeline";
import { ClipParts } from "./ClipParts";

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
  onMonochrome,
  onTakeStatus,
  maxMsOf,
  onEditParts,
  onResetParts,
  onSplit,
  sync,
  onSync,
  onLink,
  onRemoveLink,
  onGenerateScene,
  run,
}: {
  /** Kjør en kommando (avvik ved manusendring: godkjenn eller angre, DEC-0054). */
  run?: (command: Command, label: string, group?: string) => string | null;
  /** «Generer scene …» (DEC-0053): beskrivelser og inndeling for AI-video. */
  onGenerateScene?: () => void;
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
  onTransition: (t: Transition | null) => void;
  /** Svart-hvitt for scenen (REQ-0574). */
  onMonochrome: (on: boolean) => void;
  /** Status for en importert film (REQ-0241). */
  onTakeStatus: (takeId: string, status: TakeStatus) => void;
  /** Lengste utpunkt (ms) for en kilde (film eller 2D-scenen). */
  maxMsOf: (takeId: string | null) => number;
  onEditParts: (parts: ClipPartFields[], label: string) => void;
  onResetParts: () => void;
  onSplit: () => void;
  /** «Synk replikker»: blokken som står for tur (tasten T), eller null. */
  sync: { readonly occurrenceId: string; readonly blockId: string } | null;
  onSync: (blockId: string | null) => void;
  /** Koble blokken til avspillingshodet («replace»: flytt koblingen, «add»: nytt tidsrom). */
  onLink: (blockId: string, mode: "replace" | "add") => void;
  onRemoveLink: (linkId: string) => void;
}) {
  // Blokken under avspillingshodet (for «Vis i manus»)
  const hereBlock =
    clip && frame >= clip.startFrame && frame < clip.startFrame + clip.durationFrames
      ? (blockAtFrame(blockSpans(state, clip), frame)?.blockId ?? null)
      : null;
  const fps = state.project.fps;
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  useEffect(() => setDraft(null), [clip?.occurrenceId]);
  const found = useSceneDiscrepancies(state, clip?.occurrenceId ?? null);
  if (!clip)
    return (
      <p className="p-3 text-[13px] text-text-tertiary">
        {clipCount === 0 ? "Ingen aktive scener." : "Velg en scene i tidslinjen."}
      </p>
    );
  const seconds = Math.round(framesToSeconds(clip.durationFrames, fps) * 100) / 100;
  const placeholder = clip.source === "placeholder";
  const film = clip.source === "film" || clip.edited;
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
            {clip.source === "film" ? (
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
                <span className="text-text-tertiary">
                  ({clip.edited ? "summen av delene" : "filmens lengde"})
                </span>
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
              search={{
                scene: clip.occurrenceId,
                ...(hereBlock ? { blokk: hereBlock } : {}),
              }}
              title="Åpne manuset med replikken eller handlingen under avspillingshodet valgt"
            >
              <FileText />
              Vis i manus
            </Link>
          </Button>
          {onGenerateScene ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onGenerateScene}
              title="Les og forbered beskrivelsene for AI-video av scenen"
            >
              <Sparkles />
              Generer scene …
            </Button>
          ) : null}
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

      {run && found.length > 0 ? (
        <div className="px-3 pb-3">
          <ScriptChanges
            state={state}
            projectId={projectId}
            occurrenceId={clip.occurrenceId}
            found={found}
            editable={editable}
            run={run}
          />
        </div>
      ) : null}

      <Versions
        state={state}
        clip={clip}
        editable={editable}
        onUseTake={onUseTake}
        onImportFilm={onImportFilm}
        onTakeStatus={onTakeStatus}
        {...(run ? { run } : {})}
      />
      <ClipParts
        state={state}
        clip={clip}
        films={scenesFilms(state, clip)}
        editable={editable}
        maxMsOf={maxMsOf}
        onEdit={onEditParts}
        onReset={onResetParts}
        onSplit={onSplit}
      />
      <TransitionRow
        key={clip.occurrenceId}
        clip={clip}
        standard={state.project.defaultTransition ?? { kind: "cut", frames: 0 }}
        fps={fps.num / fps.den}
        editable={editable}
        onTransition={onTransition}
        onMonochrome={onMonochrome}
      />

      <section aria-label="Manus for scenen" className="flex min-h-[280px] flex-1 flex-col">
        <div className="flex items-center gap-2 px-3 pb-1 pt-2">
          <h2 className={label}>Manus</h2>
          {editable ? (
            <button
              type="button"
              aria-pressed={sync !== null && sync.occurrenceId === clip.occurrenceId}
              onClick={() => {
                if (sync && sync.occurrenceId === clip.occurrenceId) onSync(null);
                else {
                  const first = blocksOfVariant(state, clip.variantId).find(
                    (b) => b.kind === "dialogue" || b.kind === "action" || b.kind === "shot",
                  );
                  if (first) onSync(first.id);
                }
              }}
              className={
                "flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] " +
                (sync && sync.occurrenceId === clip.occurrenceId
                  ? "bg-accent-warm/20 text-text-primary ring-1 ring-accent-warm"
                  : "text-text-secondary hover:bg-surface-3 hover:text-text-primary")
              }
              title="Synk replikker: spill av, og trykk T hver gang replikken eller handlingen som står for tur, begynner. Klikk på en blokk for å begynne der."
            >
              <Timer className="size-3" aria-hidden />
              {sync && sync.occurrenceId === clip.occurrenceId ? "Synker (T)" : "Synk replikker"}
            </button>
          ) : null}
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
        <SceneText
          state={state}
          clip={clip}
          frame={frame}
          follow={follow}
          onSeek={onSeek}
          editable={editable}
          syncBlockId={sync && sync.occurrenceId === clip.occurrenceId ? sync.blockId : null}
          onSync={onSync}
          onLink={onLink}
          onRemoveLink={onRemoveLink}
        />
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
  editable,
  syncBlockId,
  onSync,
  onLink,
  onRemoveLink,
}: {
  state: ProjectState;
  clip: FilmClip;
  frame: number;
  follow: boolean;
  onSeek: (frame: number) => void;
  editable: boolean;
  syncBlockId: string | null;
  onSync: (blockId: string | null) => void;
  onLink: (blockId: string, mode: "replace" | "add") => void;
  onRemoveLink: (linkId: string) => void;
}) {
  const links = useMemo(() => {
    const m = new Map<string, TimeLink[]>();
    for (const l of Object.values(state.timeLinks))
      if (!l.removed && l.occurrenceId === clip.occurrenceId)
        m.set(
          l.blockId,
          [...(m.get(l.blockId) ?? []), l].sort((a, b) => a.startMs - b.startMs),
        );
    return m;
  }, [state.timeLinks, clip.occurrenceId]);
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
              onSeek={(f) => {
                // I synkmodus velger klikket også hvor synkingen fortsetter
                if (
                  syncBlockId &&
                  (b.kind === "dialogue" || b.kind === "action" || b.kind === "shot")
                )
                  onSync(b.id);
                onSeek(f);
              }}
              clipStart={clip.startFrame}
              links={links.get(b.id) ?? []}
              linkFrame={(l) => {
                const fpsN = state.project.fps.num / state.project.fps.den;
                const f = Math.round((l.startMs / 1000) * fpsN);
                if (!l.layerId) return clip.startFrame + f;
                const local = compositionFrameInClip(clip, f);
                return local === null ? null : clip.startFrame + local;
              }}
              layerName={(id) => state.layers[id]?.name ?? null}
              linkable={editable && b.kind !== "character" && b.kind !== "parenthetical"}
              syncing={syncBlockId === b.id}
              onLink={(mode) => onLink(b.id, mode)}
              onRemoveLink={onRemoveLink}
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
  clipStart,
  links,
  linkable,
  syncing,
  onLink,
  onRemoveLink,
  linkFrame,
  layerName,
}: {
  b: ScriptBlock;
  span: BlockSpan | undefined;
  active: boolean;
  fps: number;
  onSeek: (frame: number) => void;
  clipStart: number;
  links: readonly TimeLink[];
  linkable: boolean;
  syncing: boolean;
  onLink: (mode: "replace" | "add") => void;
  onRemoveLink: (linkId: string) => void;
  /** Bildet i filmen en kobling peker på (null: kuttet bort), og navnet på laget for hendelser. */
  linkFrame: (l: TimeLink) => number | null;
  layerName: (layerId: string) => string | null;
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
  const sec = (f: number) => `${(Math.floor((f / fps) * 10) / 10).toLocaleString("nb-NO")} s`;
  const how =
    span.kind === "time" ? "satt tid" : span.kind === "linked" ? "fra lydklippet" : "beregnet";
  return (
    <div className={"group relative " + (syncing ? "rounded-sm ring-1 ring-accent-warm" : "")}>
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
        title={`Gå hit i filmen (${sec(span.startFrame)}, ${how})${
          span.uncovered
            ? "\nTidskoblingen ligger etter slutten av klippet – ikke dekket av filmen"
            : ""
        }`}
        aria-current={active ? "true" : undefined}
        className={
          cls +
          " -mx-1 cursor-pointer rounded-sm px-1 outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring" +
          (active ? " bg-accent-selection" : "") +
          (span.uncovered ? " underline decoration-status-danger decoration-wavy" : "")
        }
      >
        {text}
      </p>
      {links.length > 0 || linkable ? (
        <div className="-mt-0.5 flex flex-wrap items-center justify-end gap-1 font-sans text-[10px]">
          {syncing ? (
            <span className="rounded-sm bg-accent-warm/20 px-1 text-text-primary">neste: T</span>
          ) : null}
          {links.map((l) => (
            <span
              key={l.id}
              className={
                "flex items-center gap-0.5 rounded-sm px-1 " +
                (span.uncovered
                  ? "bg-status-danger-bg text-status-danger"
                  : "bg-surface-3 text-text-secondary")
              }
              title={
                l.layerId
                  ? `Hendelse i 2D-scenen: ${layerName(l.layerId) ?? "lag"} (tid i 2D-scenen)${linkFrame(l) === null ? " – kuttet bort i klippet" : ""}`
                  : "Tidskobling (tid fra scenens begynnelse)"
              }
            >
              <button
                type="button"
                onClick={() => {
                  const f = linkFrame(l);
                  if (f !== null) onSeek(f);
                }}
                className="hover:text-text-primary"
              >
                ⏱ {(Math.round(l.startMs / 100) / 10).toLocaleString("nb-NO")} s
                {l.layerId ? ` · ${layerName(l.layerId) ?? "lag"}` : ""}
              </button>
              {linkable ? (
                <button
                  type="button"
                  onClick={() => onRemoveLink(l.id)}
                  aria-label="Fjern tidskobling"
                  className="px-0.5 hover:text-status-danger"
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
          {linkable ? (
            <span className="hidden items-center gap-1 group-focus-within:flex group-hover:flex">
              <button
                type="button"
                onClick={() => onLink("replace")}
                className="rounded-sm px-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
                title={
                  links.length
                    ? "Flytt tidskoblingen til avspillingshodet"
                    : "Koble blokken til avspillingshodet"
                }
              >
                ⏱ {links.length ? "Flytt hit" : "Sett tid her"}
              </button>
              {links.length ? (
                <button
                  type="button"
                  onClick={() => onLink("add")}
                  className="rounded-sm px-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
                  title="Legg til et tidsrom til (en replikk kan høres flere ganger)"
                >
                  + tid
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Importerte filmer for scenen. */
function scenesFilms(state: ProjectState, clip: FilmClip): Take[] {
  return Object.values(state.takes)
    .filter(
      (t) =>
        t.kind === "imported_film" &&
        t.mediaRef !== null &&
        state.occurrences[t.occurrenceId]?.sceneId === clip.sceneId,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Versjonene av scenen: animatic (2D-scene/tittelkort) og importert film. «Bruk denne» velger (REQ-0233). */
function Versions({
  state,
  clip,
  editable,
  onUseTake,
  onImportFilm,
  onTakeStatus,
  run,
}: {
  state: ProjectState;
  clip: FilmClip;
  editable: boolean;
  onUseTake: (takeId: string | null) => void;
  onImportFilm: (file: File) => Promise<string | null>;
  onTakeStatus: (takeId: string, status: TakeStatus) => void;
  run?: (command: Command, label: string, group?: string) => string | null;
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
  const activeId = clip.edited
    ? "__deler__"
    : (state.occurrences[clip.occurrenceId]?.activeTakeId ?? null);
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
      {clip.edited ? (
        <p className="text-[11px] text-text-tertiary">
          Scenen er klippet sammen av deler (se «Klipp»). «Bruk denne» starter på nytt med hele
          versjonen.
        </p>
      ) : null}
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
          <select
            aria-label={`Status for ${t.media?.fileName ?? "filmen"}`}
            value={t.status}
            disabled={!editable}
            onChange={(e) => onTakeStatus(t.id, e.target.value as TakeStatus)}
            className="h-5 shrink-0 rounded-sm border border-border-control bg-surface-3 px-0.5 text-[10px] text-text-secondary disabled:opacity-50"
            title="Status for filmen"
          >
            <option value="reference">Referanse</option>
            <option value="in_progress">Under arbeid</option>
            <option value="approved">Godkjent</option>
          </select>
          {use(activeId === t.id, t.id, t.media?.fileName ?? "filmen")}
        </FilmRow>
      ))}
      {films
        .filter((t) => t.media?.hasAudio !== false)
        .map((t) => (
          // Dialogen i filmlyden (DEC-0059, REQ-0341/0342): språkversjoner varsler om blandet lyd
          <label
            key={`lyd:${t.id}`}
            className="flex items-center gap-2 pl-6 text-[11px] text-text-tertiary"
          >
            <span className="min-w-0 truncate">Lyden i {t.media?.fileName ?? "filmen"}</span>
            <select
              aria-label={`Lyden i ${t.media?.fileName ?? "filmen"}`}
              value={t.audioLanguage === "nb" ? "" : (t.audioLanguage ?? "")}
              disabled={!editable || !run}
              onChange={(e) =>
                run?.(
                  {
                    type: "SetTakeAudioLanguage",
                    takeId: t.id,
                    audioLanguage: e.target.value || null,
                  },
                  "Endre dialog i filmlyden",
                )
              }
              className="ml-auto h-5 shrink-0 rounded-sm border border-border-control bg-surface-3 px-0.5 text-[10px] text-text-secondary disabled:opacity-50"
              title="Er dialogen blandet inn i filmens lyd? Da kan den ikke byttes helt ut i en annen språkversjon."
            >
              <option value="">Med norsk dialog</option>
              <option value="en">Med engelsk dialog</option>
              <option value="none">Bare musikk og effekter</option>
            </select>
          </label>
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

/** Overgangen inn i scenen og svart-hvitt (DEC-0051). */
function TransitionRow({
  clip,
  standard,
  fps,
  editable,
  onTransition,
  onMonochrome,
}: {
  clip: FilmClip;
  standard: Transition;
  fps: number;
  editable: boolean;
  onTransition: (t: Transition | null) => void;
  onMonochrome: (on: boolean) => void;
}) {
  const first = clip.startFrame === 0;
  return (
    <section
      aria-label="Overgang inn i scenen"
      className="flex flex-col gap-1.5 border-b border-border p-3"
    >
      <h2 className={label}>{first ? "Starten av filmen" : "Overgang inn i scenen"}</h2>
      <TransitionEditor
        idPrefix={`overgang-${clip.occurrenceId}`}
        value={clip.transitionInherited ? null : clip.transition}
        standard={standard}
        fps={fps}
        editable={editable}
        first={first}
        onChange={onTransition}
      />
      <label
        className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary"
        title="Scenen vises og eksporteres i svart-hvitt"
      >
        <input
          type="checkbox"
          checked={clip.monochrome}
          disabled={!editable}
          onChange={(e) => onMonochrome(e.target.checked)}
          className="size-3.5 accent-[var(--accent-brand)]"
        />
        Svart-hvitt (også i eksporten)
      </label>
    </section>
  );
}
