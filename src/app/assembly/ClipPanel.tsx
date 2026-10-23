/**
 * Panelet til høyre i monteringen: den valgte scenen (materiale, start, lengde og handlinger) og manuset for
 * scenen (mandat 6.2 på scenenivå: manus og film side ved side, «Følg avspillingen» av/på – REQ-0100/0101).
 * Tekniske detaljer vises her, ikke i manuset (mandat 6.3).
 */
import { TransitionEditor } from "./TransitionEditor";
import { isSourceLanguage } from "@/core/dialogue/languages";
import { ScriptChanges, useSceneDiscrepancies } from "./ScriptChanges";
import { Link } from "@tanstack/react-router";
import {
  Check,
  Clapperboard,
  Columns2,
  EyeOff,
  FileText,
  Film,
  ImageIcon,
  Layers,
  Loader2,
  Mic,
  Plus,
  Timer,
  Upload,
} from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { useEffect, useMemo, useRef, useState } from "react";
import { FILM_AUDIO_MAX_BYTES, MAX_DURATION_SECONDS, MAX_TRANSITION_FRAMES, MIN_DURATION_SECONDS, blockAtFrame, compositionFrameInClip, blockSpans, blocksOfVariant, formatHeading, formatTimecode, locale, tm, framesToSeconds, secondsToFrames, takeLabel, type BlockSpan, type Command, type FilmClip, type ProjectState, type ScriptBlock, type Take, type TakeStatus, type TimeLink, type ClipPartFields, type Transition, type TransitionKind } from "@/core";
import { Button } from "@/components/ui/button";
import { FILM_ACCEPT } from "./film-import";
import { formatSeconds } from "./FilmTimeline";
import { ClipParts } from "./ClipParts";
import { StillPickerDialog } from "./StillPickerDialog";
import { TechnicalSection } from "./TechnicalSection";
import { CompareVersionsDialog } from "./CompareVersionsDialog";
import { ContentSyncFlag } from "./ContentSyncFlag";
import { useContentSync } from "./use-content-sync";
import type { Commands } from "@/app/project/use-commands";
import { t as tk } from "@/core/i18n/keyed";

const label = "text-[11px] font-medium uppercase tracking-wider text-text-tertiary";

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
  onAiDialogue,
  run,
  technical = false,
  cmds,
}: {
  /** Arbeidsflatens kommandoer: arbeidslisten fra flagget «Ressurs oppdatert» bruker dem (kan angres). */
  cmds?: Commands;
  /** Teknisk visning (DEC-0072, REQ-0103). */
  technical?: boolean;
  /** Kjør en kommando (avvik ved manusendring: godkjenn eller angre, DEC-0054). */
  run?: (command: Command, label: string, group?: string) => string | null;
  /** «Generer scene …» (DEC-0053): beskrivelser og inndeling for AI-video. */
  onGenerateScene?: () => void;
  /** Dialog med AI-stemmer (DEC-0071). */
  onAiDialogue?: (() => void) | undefined;
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
  // «Ressurs oppdatert» (REQ-0022): scenen viser en eldre versjon av en ressurs enn den som er godkjent
  const syncProductionId = clip ? (state.occurrences[clip.occurrenceId]?.productionId ?? "") : "";
  const syncByScene = useContentSync(state, projectId, syncProductionId);
  if (!clip)
    return (
      <p className="p-3 text-[13px] text-text-tertiary">
        {clipCount === 0
          ? tk("app-assembly-clip-panel.clip-panel.p.94ed7f145a1c")
          : tk("app-assembly-clip-panel.clip-panel.p.d72078209662")}
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
    // Uendret plan: ingenting skjer (bare å gå gjennom feltet skal ikke gjøre planen om til fast lengde)
    if (frames !== clip?.durationFrames || clip.durationKind === "estimate") onDuration(frames);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <section
        aria-label={tk("app-assembly-clip-panel.clip-panel.aria-label.65d01ec7c46a")}
        className="flex flex-col gap-2 border-b border-border p-3"
      >
        <div className="-mx-3 group flex h-8 shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-2">
          <span className="font-mono text-[11px] text-text-tertiary">
            {clip.productionNumber ?? "–"}
          </span>
          <h2 className="min-w-0 truncate text-chrome-label font-medium uppercase tracking-label text-text-tertiary">
            {formatHeading(clip.heading) || tk("app-assembly-clip-panel.clip-panel.h2.6200b131dc8b")}
          </h2>
          <span className="ml-auto self-center">
            <ContentSyncFlag
              state={state}
              projectId={projectId}
              productionId={syncProductionId}
              sync={syncByScene.get(clip.occurrenceId)}
              editable={editable}
              cmds={cmds}
            />
          </span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-text-tertiary">{tk("app-assembly-clip-panel.clip-panel.dt.c102c4a446e0")}</dt>
          <dd className="flex items-center gap-1.5 text-text-primary">
            {clip.source === "film" ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <Film className="size-3.5 shrink-0 text-accent-warm" aria-hidden />
                <span className="truncate" title={clip.take?.media?.fileName}>
                  {tk("app-assembly-clip-panel.clip-panel.span.fccdc9c61be2")}{" "}
                  {clip.take?.media?.fileName ?? tk("app-assembly-clip-panel.clip-panel.span.65afc9f67eed")}
                </span>
              </span>
            ) : placeholder ? (
              <>
                <Clapperboard className="size-3.5 text-text-tertiary" aria-hidden />
                {tk("app-assembly-clip-panel.clip-panel.dd.743591669634")}
              </>
            ) : (
              <>
                <Layers className="size-3.5 text-accent-brand" aria-hidden />
                2D-scene{comp?.name ? ` – ${comp.name}` : ""}
              </>
            )}
          </dd>
          <dt className="text-text-tertiary">{tk("app-assembly-clip-panel.clip-panel.dt.4d157383d3de")}</dt>
          <dd className="font-mono text-text-primary">{formatTimecode(clip.startFrame, fps)}</dd>
          <dt className="self-center text-text-tertiary">{tk("app-assembly-clip-panel.clip-panel.dt.08069689c8ca")}</dt>
          <dd className="flex flex-wrap items-center gap-1.5">
            {film ? (
              <span className="text-text-secondary">
                {formatSeconds(seconds)}{" "}
                <span className="text-text-tertiary">
                  (
                  {clip.edited
                    ? tk("app-assembly-clip-panel.clip-panel.span.d7a6a6275f73")
                    : tk("app-assembly-clip-panel.clip-panel.span.7d096b2cb640")}
                  )
                </span>
              </span>
            ) : placeholder ? (
              <span className="italic text-text-secondary">
                ≈ {formatSeconds(seconds)}{" "}
                <span className="not-italic text-text-tertiary">
                  (
                  {clip.durationKind === "planned"
                    ? tk("app-assembly-clip-panel.clip-panel.span.ff2e511cab3c")
                    : tk("app-assembly-clip-panel.clip-panel.span.d6e5d96dd1c1")}
                  )
                </span>
              </span>
            ) : (
              <>
                <input
                  type="number"
                  inputMode="decimal"
                  aria-label={tk("app-assembly-clip-panel.clip-panel.aria-label.e679b66c91ef")}
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
                  <span className="text-text-tertiary">
                    {tk("app-assembly-clip-panel.clip-panel.span.3f20cdbe8dd4")}
                  </span>
                ) : clip.durationKind === "planned" ? (
                  <span className="text-text-tertiary">
                    {tk("app-assembly-clip-panel.clip-panel.span.22b6933a77ce")}
                  </span>
                ) : editable ? (
                  <button
                    type="button"
                    onClick={onEstimate}
                    className="rounded-sm px-1 text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                    title={tk("app-assembly-clip-panel.clip-panel.title.b04a05937055")}
                  >
                    {tk("app-assembly-clip-panel.clip-panel.button.3a2b98b43bd3")}
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
              {tk("app-assembly-clip-panel.clip-panel.button.49253a9670dd")}
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" asChild>
            <Link
              to="/prosjekt/$projectId/scene"
              params={{ projectId }}
              search={{ scene: clip.occurrenceId }}
            >
              <Layers />
              {tk("app-assembly-clip-panel.clip-panel.link.36e0fe403371")}
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
              title={tk("app-assembly-clip-panel.clip-panel.title.a68b03ba85a3")}
            >
              <FileText />
              {tk("app-assembly-clip-panel.clip-panel.link.b929ec96f50e")}
            </Link>
          </Button>
          {onGenerateScene ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onGenerateScene}
              title={tk("app-assembly-clip-panel.clip-panel.title.8256856243d6")}
            >
              <AiGlyph />
              {tk("app-assembly-clip-panel.clip-panel.button.c3ab4b386090")}
            </Button>
          ) : null}
          {onAiDialogue ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onAiDialogue}
              title={tk("app-assembly-clip-panel.clip-panel.title.d0c5cb7ec4aa")}
            >
              <Mic />
              {tk("app-assembly-clip-panel.clip-panel.button.d8a66bd8e7ba")}
            </Button>
          ) : null}
          {editable ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDeactivate}
              title={tk("app-assembly-clip-panel.clip-panel.title.db8196f200d7")}
            >
              <EyeOff />
              {tk("app-assembly-clip-panel.clip-panel.button.111bfe616bd3")}
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

      {technical ? <TechnicalSection state={state} clip={clip} frame={frame} /> : null}
      <Versions
        state={state}
        projectId={projectId}
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

      <section
        aria-label={tk("app-assembly-clip-panel.clip-panel.aria-label.6d6531c99186")}
        className="flex min-h-[280px] flex-1 flex-col"
      >
        <div className="group flex h-8 shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-2">
          <h2 className={label + " flex h-8 shrink-0 items-center"}>{tk("app-assembly-clip-panel.clip-panel.h2.898787411427")}</h2>
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
              title={tk("app-assembly-clip-panel.clip-panel.title.959168d85247")}
            >
              <Timer className="size-3" aria-hidden />
              {sync && sync.occurrenceId === clip.occurrenceId
                ? tk("app-assembly-clip-panel.clip-panel.button.69a63abc2582")
                : tk("app-assembly-clip-panel.clip-panel.button.b3bb2ed5620c")}
            </button>
          ) : null}
          <label
            className="ml-auto flex items-center gap-1.5 text-xs text-text-secondary"
            title={tk("app-assembly-clip-panel.clip-panel.title.0bebd92f1a31")}
          >
            <input
              type="checkbox"
              checked={follow}
              onChange={(e) => onFollowChange(e.target.checked)}
              className="size-3.5 accent-[var(--accent-brand)]"
            />
            {tk("app-assembly-clip-panel.clip-panel.label.990f9f298512")}
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
        title={tk("app-assembly-clip-panel.scene-text.title.d7c315795777")}
      >
        {formatHeading(clip.heading)}
      </button>
      {blocks.length === 0 ? (
        <p className="text-text-tertiary">
          {tk("app-assembly-clip-panel.scene-text.p.26d0602a123e")}
        </p>
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
  const sec = (f: number) => `${(Math.floor((f / fps) * 10) / 10).toLocaleString(locale())} s`;
  const how =
    span.kind === "time"
      ? tk("app-assembly-clip-panel.how.message.c861a7564fdb")
      : span.kind === "linked"
        ? tk("app-assembly-clip-panel.how.message.41a9c95c3d6e")
        : tk("app-assembly-clip-panel.how.message.04f5bbd36a1c");
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
        title={`${tk("app-assembly-clip-panel.block.title.4a8eedcf67d9")} (${sec(span.startFrame)}, ${how})${
          span.uncovered
            ? "\n" +
              tk("app-assembly-clip-panel.block.title.14023ffc98cc")
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
        <div className="-mt-0.5 flex flex-wrap items-center justify-end gap-1 font-sans text-[11px]">
          {syncing ? (
            <span className="rounded-sm bg-accent-warm/20 px-1 text-text-primary">
              {tk("app-assembly-clip-panel.block.span.47e6f755ad7f")}
            </span>
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
                  ? `${tk("app-assembly-clip-panel.block.title.5535abfd482e")}: ${layerName(l.layerId) ?? tk("app-assembly-clip-panel.block.title.c77bf3fa5b69")} (${tk("app-assembly-clip-panel.block.title.1704b616f3f7")})${linkFrame(l) === null ? ` – ${tk("app-assembly-clip-panel.block.title.d13c41b8b7ef")}` : ""}`
                  : tk("app-assembly-clip-panel.block.title.5e70c7cb41c5")
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
                ⏱ {(Math.round(l.startMs / 100) / 10).toLocaleString(locale())} s
                {l.layerId ? ` · ${layerName(l.layerId) ?? tk("app-assembly-clip-panel.block.button.c77bf3fa5b69")}` : ""}
              </button>
              {linkable ? (
                <button
                  type="button"
                  onClick={() => onRemoveLink(l.id)}
                  aria-label={tk("app-assembly-clip-panel.block.aria-label.3183c55f251b")}
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
                    ? tk("app-assembly-clip-panel.block.title.1be66caeea35")
                    : tk("app-assembly-clip-panel.block.title.cd90e560278b")
                }
              >
                ⏱ {links.length ? tk("app-assembly-clip-panel.block.button.3ede03278d27") : tk("app-assembly-clip-panel.block.button.63568e4ef97b")}
              </button>
              {links.length ? (
                <button
                  type="button"
                  onClick={() => onLink("add")}
                  className="rounded-sm px-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
                  title={tk("app-assembly-clip-panel.block.title.3a3b363b8abb")}
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

/** Importerte filmer, AI-videoer og stillbilder (DEC-0072) for scenen. */
function scenesFilms(state: ProjectState, clip: FilmClip): Take[] {
  return Object.values(state.takes)
    .filter(
      (t) =>
        (t.kind === "imported_film" || t.kind === "ai_video" || t.kind === "still") &&
        t.mediaRef !== null &&
        state.occurrences[t.occurrenceId]?.sceneId === clip.sceneId,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Versjonene av scenen: animatic (2D-scene/tittelkort) og importert film. «Bruk denne» velger (REQ-0233). */
function Versions({
  state,
  projectId,
  clip,
  editable,
  onUseTake,
  onImportFilm,
  onTakeStatus,
  run,
}: {
  state: ProjectState;
  projectId: string;
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
            (t.kind === "imported_film" || t.kind === "ai_video") &&
            t.mediaRef !== null &&
            state.occurrences[t.occurrenceId]?.sceneId === clip.sceneId,
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
    [state.takes, state.occurrences, clip.sceneId],
  );
  const activeId = clip.edited
    ? // i18n-ignore – intern markør, vises ikke
      "__deler__"
    : (state.occurrences[clip.inheritedFrom ?? clip.occurrenceId]?.activeTakeId ?? null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [stillOpen, setStillOpen] = useState(false);
  /** Sammenlign to versjoner side ved side (REQ-0318). */
  const [compareOpen, setCompareOpen] = useState(false);
  const stills = useMemo(
    () =>
      Object.values(state.takes)
        .filter(
          (t) =>
            t.kind === "still" &&
            t.mediaRef !== null &&
            state.occurrences[t.occurrenceId]?.sceneId === clip.sceneId,
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
    [state.takes, state.occurrences, clip.sceneId],
  );
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
        <Check className="size-3" aria-hidden />
        {tk("app-assembly-clip-panel.use.span.649ee126fc4e")}
      </span>
    ) : editable ? (
      <button
        type="button"
        onClick={() => onUseTake(id)}
        className="shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
        aria-label={`${tk("app-assembly-clip-panel.use.aria-label.e17d76024cd1")} ${name}`}
      >
        {tk("app-assembly-clip-panel.use.button.d95b06a1ef34")}
      </button>
    ) : null;

  return (
    <section
      aria-label={tk("app-assembly-clip-panel.versions.aria-label.785053120649")}
      className="flex flex-col gap-1.5 border-b border-border p-3"
    >
      <h2 className={label + " -mx-3 flex h-8 shrink-0 items-center border-b border-border bg-surface-2 px-2"}>{tk("app-assembly-clip-panel.versions.h2.785053120649")}</h2>
      {clip.inheritedFrom ? (
        <p className="text-[11px] text-text-tertiary">
          {tk("app-assembly-clip-panel.versions.p.68f4671c4e31")}
        </p>
      ) : null}
      {clip.edited ? (
        <p className="text-[11px] text-text-tertiary">
          {tk("app-assembly-clip-panel.versions.p.7c0eec48c55d")}
        </p>
      ) : null}
      <div className={row(activeId === null)}>
        {clip.compositionId ? (
          <Layers className="size-3.5 shrink-0 text-accent-brand" aria-hidden />
        ) : (
          <Clapperboard className="size-3.5 shrink-0 text-text-tertiary" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-text-primary">
          Animatic{" "}
          {clip.compositionId ? tk("app-assembly-clip-panel.versions.span.dcc8938bfd13") : tk("app-assembly-clip-panel.versions.span.1bf589db4412")}
        </span>
        {use(activeId === null, null, "animatic")}
      </div>
      {stills.map((t) => (
        <div key={t.id} className={row(activeId === t.id)}>
          <ImageIcon className="size-3.5 shrink-0 text-accent-warm" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-text-primary">{takeLabel(state, t)}</span>
          <span className="shrink-0 font-mono text-[11px] text-text-tertiary">
            {t.durationFrames ? formatSeconds(t.durationFrames / (fps.num / fps.den)) : ""}
          </span>
          {use(activeId === t.id, t.id, takeLabel(state, t))}
        </div>
      ))}
      {films.map((t) => (
        <FilmRow key={t.id} take={t} fps={fps.num / fps.den} className={row(activeId === t.id)}>
          <select
            aria-label={`Status for ${t.media?.fileName ?? tk("app-assembly-clip-panel.versions.aria-label.014bb29ad9fe")}`}
            value={t.status}
            disabled={!editable}
            onChange={(e) => onTakeStatus(t.id, e.target.value as TakeStatus)}
            className="h-5 shrink-0 rounded-sm border border-border-control bg-surface-3 px-0.5 text-[11px] text-text-secondary disabled:opacity-50"
            title={tk("app-assembly-clip-panel.versions.title.d036abd45983")}
          >
            <option value="reference">{tk("app-assembly-clip-panel.versions.option.b2001a1f41e2")}</option>
            <option value="in_progress">{tk("app-assembly-clip-panel.versions.option.6fcd11e727b5")}</option>
            <option value="approved">{tk("app-assembly-clip-panel.versions.option.910806eb14b2")}</option>
          </select>
          {use(activeId === t.id, t.id, t.media?.fileName ?? tk("app-assembly-clip-panel.versions.use.014bb29ad9fe"))}
        </FilmRow>
      ))}
      {films.map((t) => (
        <CoverageRow
          key={`dekning:${t.id}`}
          state={state}
          take={t}
          variantId={clip.variantId}
          editable={editable && !!run}
          run={run}
        />
      ))}
      {films
        .filter((t) => t.media?.hasAudio !== false)
        .map((t) => (
          // Dialogen i filmlyden (DEC-0059, REQ-0341/0342): språkversjoner varsler om blandet lyd
          <label
            key={`lyd:${t.id}`}
            className="flex items-center gap-2 pl-6 text-[11px] text-text-tertiary"
          >
            <span className="min-w-0 truncate">
              {tk("app-assembly-clip-panel.versions.span.7b455c5c63ce")} {t.media?.fileName ?? tk("app-assembly-clip-panel.versions.span.014bb29ad9fe")}
            </span>
            <select
              aria-label={`${tk("app-assembly-clip-panel.versions.aria-label.7b455c5c63ce")} ${t.media?.fileName ?? tk("app-assembly-clip-panel.versions.aria-label.014bb29ad9fe.2")}`}
              value={!t.audioLanguage || isSourceLanguage(state, t.audioLanguage) ? "" : t.audioLanguage}
              disabled={!editable || !run}
              onChange={(e) =>
                run?.(
                  {
                    type: "SetTakeAudioLanguage",
                    takeId: t.id,
                    audioLanguage: e.target.value || null,
                  },
                  tk("app-assembly-clip-panel.versions.run.d78aa13a6ce9"),
                )
              }
              className="ml-auto h-5 shrink-0 rounded-sm border border-border-control bg-surface-3 px-0.5 text-[11px] text-text-secondary disabled:opacity-50"
              title={tk("app-assembly-clip-panel.versions.title.759f19ac4327")}
            >
              <option value="">{tk("app-assembly-clip-panel.versions.option.0c6433cf90a7")}</option>
              <option value="en">{tk("app-assembly-clip-panel.versions.option.000514f9f2ed")}</option>
              <option value="none">{tk("app-assembly-clip-panel.versions.option.caad573e2191")}</option>
            </select>
          </label>
        ))}
      {films.length + stills.length + (clip.edited ? 1 : 0) > 0 ? (
        <>
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            onClick={() => setCompareOpen(true)}
            title={tk("app-assembly-clip-panel.versions.title.1d30d49ae65b")}
          >
            <Columns2 /> {tk("app-assembly-clip-panel.versions.button.bd3d3aae8322")}
          </Button>
          {compareOpen ? (
            <CompareVersionsDialog
              open={compareOpen}
              onOpenChange={setCompareOpen}
              state={state}
              projectId={projectId}
              productionId={state.occurrences[clip.occurrenceId]?.productionId ?? ""}
              occurrenceId={clip.occurrenceId}
              title={`${clip.productionNumber ?? "–"} ${formatHeading(clip.heading)}`}
            />
          ) : null}
        </>
      ) : null}
      {editable ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={FILM_ACCEPT}
            className="sr-only"
            aria-label={tk("app-assembly-clip-panel.versions.aria-label.c44e135c07c7")}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pick(f);
            }}
          />
          {run ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                onClick={() => setStillOpen(true)}
                title={tk("app-assembly-clip-panel.versions.title.f0618822bbd3")}
              >
                <ImageIcon /> {tk("app-assembly-clip-panel.versions.button.e98a536e8bd8")}
              </Button>
              {stillOpen ? (
                <StillPickerDialog
                  open={stillOpen}
                  onOpenChange={setStillOpen}
                  state={state}
                  clip={clip}
                  run={run}
                />
              ) : null}
            </>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            title={tk("app-assembly-clip-panel.versions.title.c0ca1b4c4be5")}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            {busy
              ? tk("app-assembly-clip-panel.versions.button.9415560acd9f")
              : tk("app-assembly-clip-panel.versions.button.67949c564705")}
          </Button>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-status-danger">
          {tm(error)}
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
    m?.fps ? `${Math.round(m.fps * 100) / 100} ${tk("app-assembly-clip-panel.facts.take-duration-frames-format-seconds-take-duration-frames-fps-null-m-width-m-height-m-width-m-height-null-m-fps-math-round-m-fps-100-100-l-b-s-fps-null-m-m-has-audio-l-uten-lyd-no-audio-null-m-m-has-audio-m-byte-size-film-audio-max-bytes-l-lyden-spilles-ikke-filen-er-over-400-mb-the-audio-is-not-played-the-file-is-over-400-mb-null-filter.9ccb5f85fc08")}` : null,
    m && !m.hasAudio ? tk("app-assembly-clip-panel.facts.take-duration-frames-format-seconds-take-duration-frames-fps-null-m-width-m-height-m-width-m-height-null-m-fps-math-round-m-fps-100-100-l-b-s-fps-null-m-m-has-audio-l-uten-lyd-no-audio-null-m-m-has-audio-m-byte-size-film-audio-max-bytes-l-lyden-spilles-ikke-filen-er-over-400-mb-the-audio-is-not-played-the-file-is-over-400-mb-null-filter.19c7e8f8fedd") : null,
    m && m.hasAudio && m.byteSize > FILM_AUDIO_MAX_BYTES
      ? tk("app-assembly-clip-panel.facts.take-duration-frames-format-seconds-take-duration-frames-fps-null-m-width-m-height-m-width-m-height-null-m-fps-math-round-m-fps-100-100-l-b-s-fps-null-m-m-has-audio-l-uten-lyd-no-audio-null-m-m-has-audio-m-byte-size-film-audio-max-bytes-l-lyden-spilles-ikke-filen-er-over-400-mb-the-audio-is-not-played-the-file-is-over-400-mb-null-filter.f3a2dfb92cbf")
      : null,
  ].filter(Boolean);
  const off = m?.fps && Math.abs(m.fps - fps) > 0.05;
  return (
    <div className={className}>
      <Film className="size-3.5 shrink-0 text-accent-warm" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-text-primary" title={m?.fileName}>
          {m?.fileName ?? tk("app-assembly-clip-panel.film-row.span.be01fe50a25c")}
        </span>
        <span className="block truncate text-[11px] text-text-tertiary">
          {facts.join(" · ")}
          {off
            ? ` · ${tk("app-assembly-clip-panel.film-row.span.9c61c804f374")} ${Math.round(fps * 100) / 100} ${tk("app-assembly-clip-panel.film-row.span.7f409ef2ef8a")}`
            : ""}
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
      aria-label={tk("app-assembly-clip-panel.transition-row.aria-label.8dc4d6bbde87")}
      className="flex flex-col gap-1.5 border-b border-border p-3"
    >
      <h2 className={label + " -mx-3 flex h-8 shrink-0 items-center border-b border-border bg-surface-2 px-2"}>
        {first
          ? tk("app-assembly-clip-panel.transition-row.h2.fe87ad95e68e")
          : tk("app-assembly-clip-panel.transition-row.h2.8dc4d6bbde87")}
      </h2>
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
        title={tk("app-assembly-clip-panel.transition-row.title.d917d64007d8")}
      >
        <input
          type="checkbox"
          checked={clip.monochrome}
          disabled={!editable}
          onChange={(e) => onMonochrome(e.target.checked)}
          className="size-3.5 accent-[var(--accent-brand)]"
        />
        {tk("app-assembly-clip-panel.transition-row.label.d7a0e0606f89")}
      </label>
    </section>
  );
}

/**
 * Manusdekning (REQ-0237, DEC-0071): hvilken del av manuset filmen dekker – første og siste linje. Avvik fra
 * manuset gjelder da bare linjene i dette området.
 */
function CoverageRow({
  state,
  take,
  variantId,
  editable,
  run,
}: {
  state: ProjectState;
  take: Take;
  variantId: string;
  editable: boolean;
  run: ((command: Command, label: string, group?: string) => string | null) | undefined;
}) {
  const blocks = useMemo(
    () => blocksOfVariant(state, variantId).filter((b) => b.kind !== "heading"),
    [state, variantId],
  );
  const [err, setErr] = useState<string | null>(null);
  if (blocks.length < 2) return null;
  const cov = take.coverage ?? null;
  const short = (t: string) => (t.length > 40 ? `${t.slice(0, 38)}…` : t);
  const set = (startBlockId: string, endBlockId: string) =>
    setErr(
      run?.(
        {
          type: "SetTakeCoverage",
          takeId: take.id,
          coverage:
            startBlockId === blocks[0]!.id && endBlockId === blocks[blocks.length - 1]!.id
              ? null
              : { startBlockId, endBlockId },
        } as never,
        tk("app-assembly-clip-panel.set.run.67b9a4484e0a"),
      ) ?? null,
    );
  const start = cov?.startBlockId ?? blocks[0]!.id;
  const end = cov?.endBlockId ?? blocks[blocks.length - 1]!.id;
  return (
    <div className="flex flex-col gap-0.5 pl-6 text-[11px] text-text-tertiary">
      <span>
        {take.media?.fileName ?? tk("app-assembly-clip-panel.coverage-row.span.d5c18fe57923")}{" "}
        {cov
          ? tk("app-assembly-clip-panel.coverage-row.span.82424be89c7d")
          : tk("app-assembly-clip-panel.coverage-row.span.77124bca97fd")}
      </span>
      <div className="flex gap-1">
        {(["start", "end"] as const).map((which) => (
          <select
            key={which}
            aria-label={
              which === "start"
                ? tk("app-assembly-clip-panel.coverage-row.aria-label.2e407db99a66")
                : tk("app-assembly-clip-panel.coverage-row.aria-label.cab80234aa8a")
            }
            value={which === "start" ? start : end}
            disabled={!editable}
            onChange={(e) =>
              which === "start" ? set(e.target.value, end) : set(start, e.target.value)
            }
            className="h-5 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-0.5 text-[11px] text-text-secondary disabled:opacity-50"
          >
            {blocks.map((b, i) => (
              <option key={b.id} value={b.id}>
                {i + 1}. {short(b.text)}
              </option>
            ))}
          </select>
        ))}
      </div>
      {err ? (
        <span role="alert" className="text-status-danger">
          {tm(err)}
        </span>
      ) : null}
    </div>
  );
}
