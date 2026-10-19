/**
 * Lydeditoren i lydvinduet (fase 2, bolk C, DEC-0094, REQ-0691–0697): eksisterende lyd og nye takes i samme
 * vindu, med bølgeformer, spor, avspillingshode, områdevalg, trim, volum og inn-/uttoning. Et nytt opptak kan
 * erstatte alt, settes inn før eller etter, legges oppå eller erstatte et markert område. Endringene kan
 * angres, og resultatet lagres som ny versjon (komposisjonen følger med, så den kan redigeres videre).
 * Andre replikker i scenen flyttes aldri; overlapper lyden en annen replikk, vises det som en konflikt.
 *
 * Bolk E (DEC-0096): pauser mellom ord med romlyd (`PauseTimingPanel` via `LineWordsPanel`), overganger mellom
 * takes (`TransitionsPanel`) og «Spill av automatisk etter endring» (REQ-0710): etter en fullført endring
 * spilles det endrede området med kontekst, aldri mens man drar, og aldri oppå en avspilling som pågår.
 */
import {
  ArrowDownToLine,
  Loader2,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COMPOSITION_TRACKS,
  L,
  audioTakeLabel,
  autoPlayRange,
  changedSpan,
  compositionFromTake,
  compositionLengthMs,
  formatTakeLength,
  insertTake,
  lineConflicts,
  lineInfo,
  newId,
  removeSegment,
  roomToneAsset,
  roomToneSceneName,
  sameComposition,
  soundTakes,
  updateSegment,
  type AlignmentSource,
  type AudioComposition,
  type AudioSegment,
  type InsertMode,
  type ProjectState,
  type WordAlignment,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { useUiPref } from "@/app/account/ui-prefs";
import { Button } from "@/components/ui/button";
import { peaks } from "@/engine/audio/mixer";
import { renderComposition } from "@/engine/audio/composition";
import {
  audioExportName,
  downloadBlob,
  encodeComposition,
  exportPart,
  loadVersionBuffers,
  saveComposition,
  type ExportSettings,
} from "./composition-actions";
import type { TakeTarget } from "./takes";
import { LineWordsPanel } from "./LineWordsPanel";
import { TransitionsPanel } from "./TransitionsPanel";
import { fillRoom, roomToneFiles } from "./room-fill";

const segId = () => newId<"audio_segment">();
const sec = (ms: number) => (ms / 1000).toFixed(2);
const TRACK_COLORS = ["#4fb3bf", "#c9a24b", "#a37bd6", "#d67b9a"];
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

export function AudioCompositionEditor({
  projectId,
  state,
  cmds,
  target,
  assetId,
  baseVersionId,
  onClose,
  onSaved,
  onWords,
}: {
  projectId: string;
  state: ProjectState;
  cmds: Commands;
  target: TakeTarget;
  assetId: string;
  /** Versjonen (take eller komposisjon) editoren starter fra. */
  baseVersionId: string;
  onClose: () => void;
  onSaved?: (versionId: string) => void;
  /** De markerte ordene i replikken (for fremheving over opptaksknappene, REQ-0685). */
  onWords?: (w: { start: number; end: number } | null) => void;
}) {
  const base = state.assetVersions[baseVersionId];
  const takes = useMemo(() => soundTakes(state, assetId), [state, assetId]);
  const plain = takes.filter((t) => !state.assetVersions[t.versionId]?.composition);
  const takeNo = useMemo(() => new Map(takes.map((t) => [t.versionId, t.number])), [takes]);
  const initial = useMemo<AudioComposition>(
    () =>
      base?.composition ??
      compositionFromTake(
        { versionId: baseVersionId, durationMs: base?.durationMs ?? 1000 },
        segId,
      ),
    // Startpunktet låses når editoren åpnes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseVersionId],
  );
  const [history, setHistory] = useState<{ list: AudioComposition[]; at: number }>({
    list: [initial],
    at: 0,
  });
  const storedComp = history.list[history.at] ?? initial;
  const [dragPreview, setDragPreview] = useState<AudioComposition | null>(null);
  const segmentDrag = useRef<{ pointerId: number; x: number; msPerPixel: number; base: AudioComposition; segment: AudioSegment; next: AudioComposition } | null>(null);
  const comp = dragPreview ?? storedComp;
  const push = useCallback((next: AudioComposition) => {
    setHistory((h) => {
      const cur = h.list[h.at]!;
      if (sameComposition(cur, next) && next.segments.length === cur.segments.length) return h;
      const list = [...h.list.slice(0, h.at + 1), next].slice(-100);
      return { list, at: list.length - 1 };
    });
  }, []);
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [buffers, setBuffers] = useState<Map<string, AudioBuffer> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insertFrom, setInsertFrom] = useState(plain.at(-1)?.versionId ?? "");
  const [contextMs, setContextMs] = useState(500);
  const [autoPlay, setAutoPlay] = useUiPref<boolean>("audio.autoPlayAfterEdit", false, isBool);
  const roomFiles = useMemo(() => roomToneFiles(state), [state]);
  const info = target.kind === "line" ? lineInfo(state, target.occurrenceId, target.blockId, target.clipId) : null;
  /** Reserve for romlyd i pauser: siste opptak av romlyden for scenen (bolk B, REQ-0690). */
  const roomFallback = useMemo(() => {
    const a = target.kind === "line" ? roomToneAsset(state, roomToneSceneName(info)) : null;
    const t = a ? soundTakes(state, a.id).filter((x) => x.durationMs) : [];
    return t.at(-1)?.versionId ?? null;
  }, [state, info, target.kind]);

  // Opptakene som trengs (alle takes av ressursen, så de kan settes inn, og reserven for romlyd)
  const sourceIds = useMemo(
    () => [
      ...new Set([
        ...plain.map((t) => t.versionId),
        ...comp.segments.map((s) => s.versionId),
        ...(roomFallback ? [roomFallback] : []),
      ]),
    ],
    [plain, comp, roomFallback],
  );
  useEffect(() => {
    let alive = true;
    const versions = sourceIds.map((id) => state.assetVersions[id]).filter((v) => !!v);
    void loadVersionBuffers(versions).then((m) => alive && setBuffers(m));
    return () => {
      alive = false;
    };
    // Hentes på nytt når et nytt opptak kommer til
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceIds.join(",")]);

  const length = compositionLengthMs(comp);
  const view = Math.max(1000, length * 1.08, range?.to ?? 0);
  const pct = (ms: number) => `${(ms / view) * 100}%`;
  const tracksUsed = Math.min(
    COMPOSITION_TRACKS,
    Math.max(1, ...comp.segments.map((s) => s.track + 1)) + (comp.segments.length ? 1 : 0),
  );
  const conflicts = info?.clip ? lineConflicts(state, info.clip, length) : [];
  const dirty = !sameComposition(comp, initial);

  // ---------- avspilling (samme miks som lagres og eksporteres)
  const play = useRef<{
    ctx: AudioContext;
    src: AudioBufferSourceNode;
    t0: number;
    from: number;
  } | null>(null);
  const [playing, setPlaying] = useState(false);
  const stop = useCallback(() => {
    const p = play.current;
    play.current = null;
    if (p) {
      p.src.onended = null;
      try {
        p.src.stop();
      } catch {
        /* allerede stoppet */
      }
      void p.ctx.close();
    }
    setPlaying(false);
  }, []);
  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const p = play.current;
      if (p) setPlayhead(p.from + (p.ctx.currentTime - p.t0) * 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  /** Spiller komposisjonen (standard: den som vises nå). En ny avspilling stopper den forrige først. */
  async function start(fromMs: number, toMs?: number, c: AudioComposition = comp) {
    if (!buffers) return;
    stop();
    const mix = await renderComposition(c, (id) => buffers.get(id), {
      sampleRate: 48000,
      channels: 1,
    });
    // En annen avspilling kan ha startet mens miksen ble laget: den nyeste vinner
    stop();
    const ctx = new AudioContext();
    const src = ctx.createBufferSource();
    src.buffer = mix;
    src.connect(ctx.destination);
    const from = Math.max(0, Math.min(fromMs, compositionLengthMs(c) - 1));
    const t0 = ctx.currentTime + 0.05;
    src.start(
      t0,
      from / 1000,
      toMs !== undefined ? Math.max(0.01, (toMs - from) / 1000) : undefined,
    );
    src.onended = () => stop();
    play.current = { ctx, src, t0, from };
    setPlaying(true);
  }

  // ---------- endringer
  /**
   * En fullført endring: legges i angre-listen og spilles automatisk med kontekst når det er slått på
   * (REQ-0710). Kalles aldri mens brukeren drar.
   */
  function edit(next: AudioComposition) {
    const before = storedComp;
    push(next);
    if (!autoPlay) return;
    const span = changedSpan(before, next);
    if (!span) return;
    const r = autoPlayRange(span, contextMs, compositionLengthMs(next));
    void start(r.fromMs, r.toMs, next);
  }
  /** En pauseendring: pausene fylles med romlyd før endringen legges inn (REQ-0708). */
  function timingEdit(next: AudioComposition, al: WordAlignment, src: AlignmentSource): string[] {
    const r = fillRoom(next, al, src, state, buffers, roomFallback);
    edit(r.composition);
    return r.messages;
  }
  const sel = comp.segments.find((s) => s.id === selected) ?? null;
  const srcMs = (s: AudioSegment) => state.assetVersions[s.versionId]?.durationMs ?? null;
  function patch(p: Partial<AudioSegment>) {
    if (sel) edit(updateSegment(comp, sel.id, p, srcMs(sel)));
  }
  function insert(mode: InsertMode, at?: { from: number; to: number }) {
    const v = state.assetVersions[insertFrom];
    if (!v?.durationMs) return;
    const take = { versionId: v.id, durationMs: v.durationMs };
    const r = at ?? range;
    if (mode === "range" && !r) return;
    edit(
      insertTake(comp, take, mode, segId, {
        atMs: r?.from ?? playhead,
        ...(r ? { startMs: r.from, endMs: r.to } : {}),
      }),
    );
    setSelected(null);
  }

  async function save(newVariant: boolean) {
    if (!buffers || !base) return;
    setBusy(newVariant ? "variant" : "save");
    setError(null);
    try {
      const s = cmds.current() ?? state;
      const variants = Object.values(s.assetVariants).filter((v) => v.assetId === assetId);
      const r = await saveComposition(
        cmds,
        s,
        projectId,
        assetId,
        newVariant
          ? {
              newVariantName: L(
                `Komposisjon ${variants.length + 1}`,
                `Composition ${variants.length + 1}`,
              ),
            }
          : { variantId: base.variantId },
        comp,
        buffers,
        L(
          `Komposisjon av ${new Set(comp.segments.map((x) => x.versionId)).size} opptak`,
          `Composition of ${new Set(comp.segments.map((x) => x.versionId)).size} recordings`,
        ),
      );
      onSaved?.(r.versionId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // ---------- områdevalg ved å dra i linjalen
  const ruler = useRef<HTMLDivElement | null>(null);
  const msAt = (clientX: number) => {
    const r = ruler.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return 0;
    return Math.max(0, Math.min(view, ((clientX - r.left) / r.width) * view));
  };
  const drag = useRef<number | null>(null);

  if (!base) return null;
  return (
    <section
      aria-label={L("Lydeditor", "Audio editor")}
      className="mt-4 rounded-sm border border-border bg-surface-1 p-3"
      data-testid="audio-editor"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-semibold text-text-primary">
          {L("Lydeditor", "Audio editor")}
        </h3>
        <span className="text-xs text-text-tertiary" data-testid="audio-editor-length">
          {L(`Lengde ${formatTakeLength(length)}`, `Length ${formatTakeLength(length)}`)} (
          {sec(length)} s)
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => (playing ? stop() : void start(range?.from ?? playhead, range?.to))}
            disabled={!buffers}
            data-testid="audio-editor-play"
          >
            {!buffers ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : playing ? (
              <Pause className="size-3.5" aria-hidden />
            ) : (
              <Play className="size-3.5" aria-hidden />
            )}
            {playing
              ? L("Stopp", "Stop")
              : range
                ? L("Spill området", "Play the range")
                : L("Spill av", "Play")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setHistory((h) => ({ ...h, at: Math.max(0, h.at - 1) }))}
            disabled={history.at === 0}
            aria-label={L("Angre", "Undo")}
            data-testid="audio-editor-undo"
          >
            <Undo2 className="size-3.5" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setHistory((h) => ({ ...h, at: Math.min(h.list.length - 1, h.at + 1) }))}
            disabled={history.at >= history.list.length - 1}
            aria-label={L("Gjør om", "Redo")}
          >
            <Redo2 className="size-3.5" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => push(initial)}
            disabled={!dirty}
            title={L(
              "Tilbake til lyden editoren startet med",
              "Back to the audio the editor started with",
            )}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {L("Opprinnelig", "Original")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {L("Lukk editoren", "Close the editor")}
          </Button>
        </div>
      </div>
      <label
        className="mt-1 flex w-fit items-center gap-1.5 text-xs text-text-secondary"
        title={L(
          "Spiller det endrede området med kontekst når en endring er fullført",
          "Plays the changed range with context when a change is completed",
        )}
      >
        <input
          type="checkbox"
          checked={autoPlay}
          onChange={(e) => setAutoPlay(e.target.checked)}
          data-testid="audio-editor-autoplay"
        />
        {L("Spill av automatisk etter endring", "Play automatically after a change")}
      </label>

      {/* Linjal (dra for å markere et område) og sporene */}
      <div className="mt-2 select-none">
        <div
          ref={ruler}
          className="relative h-5 cursor-text rounded-t-sm bg-surface-3"
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            drag.current = msAt(e.clientX);
            setRange(null);
            setPlayhead(drag.current);
          }}
          onPointerMove={(e) => {
            if (drag.current === null) return;
            const a = drag.current;
            const b = msAt(e.clientX);
            if (Math.abs(b - a) > 20)
              setRange({ from: Math.round(Math.min(a, b)), to: Math.round(Math.max(a, b)) });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          data-testid="audio-editor-ruler"
          title={L(
            "Klikk for avspillingshodet, dra for å markere et område",
            "Click for the playhead, drag to mark a range",
          )}
        >
          {Array.from({ length: Math.floor(view / 1000) + 1 }, (_, i) => (
            <span
              key={i}
              className="absolute top-0 h-full border-l border-border pl-0.5 text-[11px] leading-5 text-text-tertiary"
              style={{ left: pct(i * 1000) }}
            >
              {i}s
            </span>
          ))}
        </div>
        <div className="relative">
          {Array.from({ length: tracksUsed }, (_, track) => (
            <div
              key={track}
              className="relative h-14 border-b border-border bg-surface-2"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setSelected(null);
                  setPlayhead(msAt(e.clientX));
                }
              }}
              data-testid={`audio-editor-track-${track}`}
            >
              <span className="pointer-events-none absolute left-1 top-0.5 z-10 text-[11px] text-text-tertiary">
                {track === 0 ? L("Dialog", "Dialogue") : L(`Oppå ${track}`, `Over ${track}`)}
              </span>
              {comp.segments
                .filter((s) => s.track === track)
                .map((s) => (
                  <SegmentBlock
                    key={s.id}
                    s={s}
                    left={pct(s.atMs)}
                    width={pct(s.lengthMs)}
                    color={TRACK_COLORS[track] ?? TRACK_COLORS[0]!}
                    label={
                      s.role === "room"
                        ? L("Romlyd", "Room tone")
                        : s.role === "transition"
                          ? L("Overgang", "Transition")
                          : audioTakeLabel(takeNo.get(s.versionId) ?? 0)
                    }
                    buffer={buffers?.get(s.versionId)}
                    selected={s.id === selected}
                    onSelect={() => setSelected(s.id)}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      const width = ruler.current?.getBoundingClientRect().width;
                      if (!width) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setSelected(s.id);
                      segmentDrag.current = { pointerId: e.pointerId, x: e.clientX, msPerPixel: view / width, base: storedComp, segment: s, next: storedComp };
                    }}
                    onPointerMove={(e) => {
                      const d = segmentDrag.current;
                      if (!d || d.pointerId !== e.pointerId) return;
                      const atMs = Math.max(0, Math.round(d.segment.atMs + (e.clientX - d.x) * d.msPerPixel));
                      d.next = updateSegment(d.base, d.segment.id, { atMs }, srcMs(d.segment));
                      setDragPreview(d.next);
                    }}
                    onPointerUp={(e) => {
                      const d = segmentDrag.current;
                      if (!d || d.pointerId !== e.pointerId) return;
                      segmentDrag.current = null;
                      setDragPreview(null);
                      edit(d.next);
                    }}
                    onPointerCancel={() => { segmentDrag.current = null; setDragPreview(null); }}
                    onLostPointerCapture={() => { segmentDrag.current = null; setDragPreview(null); }}
                  />
                ))}
            </div>
          ))}
          {range ? (
            <div
              className="pointer-events-none absolute inset-y-0 bg-accent-warm/20 ring-1 ring-accent-warm"
              style={{ left: pct(range.from), width: pct(range.to - range.from) }}
              data-testid="audio-editor-range-mark"
            />
          ) : null}
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-status-danger"
            style={{ left: pct(playhead) }}
            aria-hidden
          />
        </div>
        <p className="mt-1 text-[11px] text-text-tertiary">
          {range
            ? L(
                `Område ${sec(range.from)}–${sec(range.to)} s`,
                `Range ${sec(range.from)}–${sec(range.to)} s`,
              )
            : L(
                `Avspillingshodet ${sec(playhead)} s · dra i linjalen for å markere et område`,
                `Playhead ${sec(playhead)} s · drag in the ruler to mark a range`,
              )}
        </p>
      </div>

      {target.kind === "line" ? (
        <LineWordsPanel
          projectId={projectId}
          state={state}
          cmds={cmds}
          blockId={target.blockId}
          baseVersionId={baseVersionId}
          initial={initial}
          comp={comp}
          range={range}
          onRange={(r) => {
            setRange(r);
            if (r) setPlayhead(r.from);
          }}
          onPlay={(a, b) => void start(a, b)}
          onSuggest={(sug) =>
            insert(
              sug.mode,
              sug.mode === "range" ? { from: sug.startMs, to: sug.endMs } : undefined,
            )
          }
          onWords={(w) => onWords?.(w)}
          contextMs={contextMs}
          onContextMs={setContextMs}
          onTimingEdit={timingEdit}
          roomFiles={roomFiles}
        />
      ) : null}

      <TransitionsPanel
        state={state}
        comp={comp}
        buffers={buffers}
        roomFiles={roomFiles}
        takeLabel={(id) =>
          takeNo.has(id)
            ? audioTakeLabel(takeNo.get(id)!)
            : (roomFiles.find((f) => f.versionId === id)?.label ?? L("Opptak", "Recording"))
        }
        contextMs={contextMs}
        onEdit={edit}
        onPreview={(a, b) => void start(a, b)}
      />

      {conflicts.length ? (
        <div
          role="alert"
          className="mt-2 flex items-start gap-1.5 rounded-sm border border-accent-warm/60 p-2 text-xs text-accent-warm"
          data-testid="audio-editor-conflicts"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {L(
              `Lyden overlapper ${conflicts.length === 1 ? "en annen replikk" : `${conflicts.length} andre replikker`} i scenen: ${conflicts.map((c) => `${c.name} (${sec(c.overlapMs)} s)`).join(", ")}. Ingenting flyttes – håndter det i scenen når du vil.`,
              `The audio overlaps ${conflicts.length === 1 ? "another line" : `${conflicts.length} other lines`} in the scene: ${conflicts.map((c) => `${c.name} (${sec(c.overlapMs)} s)`).join(", ")}. Nothing is moved – deal with it in the scene when you want.`,
            )}
          </span>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {/* Nytt opptak inn i lyden */}
        <div className="flex flex-col gap-2" data-testid="audio-editor-insert">
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            {L("Opptak", "Recording")}
            <select
              value={insertFrom}
              onChange={(e) => setInsertFrom(e.target.value)}
              className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
              data-testid="audio-editor-take"
            >
              {plain.map((t) => (
                <option key={t.versionId} value={t.versionId}>
                  {audioTakeLabel(t.number)} · {formatTakeLength(t.durationMs)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["replace", L("Erstatt alt", "Replace all")],
                ["before", L("Sett inn før", "Insert before")],
                ["after", L("Sett inn etter", "Insert after")],
                ["over", L("Legg oppå", "Lay over")],
                ["range", L("Erstatt området", "Replace the range")],
              ] as const
            ).map(([mode, label]) => (
              <Button
                key={mode}
                size="sm"
                variant="secondary"
                onClick={() => insert(mode)}
                disabled={!insertFrom || (mode === "range" && !range)}
                data-testid={`audio-editor-${mode}`}
                title={
                  mode === "over"
                    ? L(
                        "Som eget spor fra avspillingshodet (eller områdets start)",
                        "As its own track from the playhead (or the start of the range)",
                      )
                    : mode === "range"
                      ? L("Marker først et område i linjalen", "First mark a range in the ruler")
                      : undefined
                }
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-text-tertiary">
            {L(
              "Bare denne lyden endres. Andre replikker i scenen flyttes aldri, og hastighet og tonehøyde endres ikke.",
              "Only this audio changes. Other lines in the scene are never moved, and speed and pitch are not changed.",
            )}
          </p>
        </div>

        {/* Valgt del */}
        <div className="flex flex-col gap-1.5" data-testid="audio-editor-segment">
          {sel ? (
            <>
              <p className="text-xs font-medium text-text-primary">
                {L("Valgt del", "Selected part")}: {audioTakeLabel(takeNo.get(sel.versionId) ?? 0)}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                <Num
                  label={L("Start (s)", "Start (s)")}
                  value={sel.atMs / 1000}
                  onCommit={(v) => patch({ atMs: v * 1000 })}
                />
                <Num
                  label={L("Inn i opptaket (s)", "Into the recording (s)")}
                  value={sel.sourceInMs / 1000}
                  onCommit={(v) => patch({ sourceInMs: v * 1000 })}
                />
                <Num
                  label={L("Lengde (s)", "Length (s)")}
                  value={sel.lengthMs / 1000}
                  onCommit={(v) => patch({ lengthMs: v * 1000 })}
                  testId="audio-editor-seg-length"
                />
                <Num
                  label={L("Volum (dB)", "Volume (dB)")}
                  value={sel.gainDb}
                  step={0.5}
                  onCommit={(v) => patch({ gainDb: v })}
                />
                <Num
                  label={L("Inntoning (s)", "Fade in (s)")}
                  value={sel.fadeInMs / 1000}
                  onCommit={(v) => patch({ fadeInMs: v * 1000 })}
                />
                <Num
                  label={L("Uttoning (s)", "Fade out (s)")}
                  value={sel.fadeOutMs / 1000}
                  onCommit={(v) => patch({ fadeOutMs: v * 1000 })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <label className="flex items-center gap-1 text-xs text-text-secondary">
                  {L("Spor", "Track")}
                  <select
                    value={sel.track}
                    onChange={(e) => patch({ track: Number(e.target.value) })}
                    className="h-7 rounded-sm border border-border-control bg-surface-3 px-1 text-xs text-text-primary"
                  >
                    {Array.from({ length: COMPOSITION_TRACKS }, (_, t) => (
                      <option key={t} value={t}>
                        {t === 0 ? L("Dialog", "Dialogue") : L(`Oppå ${t}`, `Over ${t}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    edit(removeSegment(comp, sel.id));
                    setSelected(null);
                  }}
                  disabled={comp.segments.length <= 1}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  {L("Fjern delen", "Remove the part")}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs text-text-tertiary">
              {L(
                "Klikk på en del i sporene for å trimme, flytte eller endre volum og toning.",
                "Click a part in the tracks to trim, move or change volume and fades.",
              )}
            </p>
          )}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-status-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button
          size="sm"
          onClick={() => void save(false)}
          disabled={!buffers || busy !== null || !dirty}
          data-testid="audio-editor-save"
        >
          {busy === "save" ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Save className="size-3.5" aria-hidden />
          )}
          {L("Lagre som ny versjon", "Save as a new version")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void save(true)}
          disabled={!buffers || busy !== null}
          data-testid="audio-editor-save-variant"
        >
          {busy === "variant" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {L("Lagre som ny variant", "Save as a new variant")}
        </Button>
        <span className="text-[11px] text-text-tertiary">
          {L(
            "Originalopptakene endres aldri. Den nye versjonen brukes først når du velger «Bruk dette».",
            "The original recordings never change. The new version is used only when you choose “Use this”.",
          )}
        </span>
      </div>

      <ExportPanel
        comp={comp}
        buffers={buffers}
        range={range}
        plain={plain}
        name={state.assets[assetId]?.name ?? L("lyd", "audio")}
        onToLibrary={async (part, label) => {
          if (!buffers) return;
          const s = cmds.current() ?? state;
          await saveComposition(
            cmds,
            s,
            projectId,
            assetId,
            { newVariantName: label },
            part,
            buffers,
            L("Eksportert fra lydeditoren", "Exported from the audio editor"),
          );
        }}
      />
    </section>
  );
}

function SegmentBlock({
  s,
  left,
  width,
  color,
  label,
  buffer,
  selected,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
}: {
  s: AudioSegment;
  left: string;
  width: string;
  color: string;
  label: string;
  buffer: AudioBuffer | undefined;
  selected: boolean;
  onSelect: () => void;
  onPointerDown: React.PointerEventHandler<HTMLButtonElement>;
  onPointerMove: React.PointerEventHandler<HTMLButtonElement>;
  onPointerUp: React.PointerEventHandler<HTMLButtonElement>;
  onPointerCancel: React.PointerEventHandler<HTMLButtonElement>;
  onLostPointerCapture: React.PointerEventHandler<HTMLButtonElement>;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!buffer) return;
    const p = peaks(buffer, s.sourceInMs / 1000, (s.sourceInMs + s.lengthMs) / 1000, c.width);
    ctx.fillStyle = color;
    const mid = c.height / 2;
    for (let i = 0; i < p.length; i++) {
      const h = Math.max(1, p[i]! * mid * 0.95);
      ctx.fillRect(i, mid - h, 1, h * 2);
    }
  }, [buffer, s.sourceInMs, s.lengthMs, color]);
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={onSelect}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      className={
        "absolute block touch-none cursor-grab overflow-hidden rounded-sm border p-0 text-left active:cursor-grabbing " +
        // Romlyd og overganger (bolk E) vises lavere, så talen under alltid synes
        (s.role === "room" || s.role === "transition"
          ? "top-8 z-10 h-5 border-dashed "
          : "top-3 h-10 ") +
        (selected
          ? "border-text-primary ring-1 ring-text-primary"
          : s.role === "room" || s.role === "transition"
            ? "border-text-tertiary"
            : "border-transparent")
      }
      style={{ left, width, background: `${color}22` }}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      data-role={s.role ?? "speech"}
      data-at-ms={s.atMs}
      data-testid="audio-editor-seg"
    >
      <canvas
        ref={canvas}
        width={240}
        height={40}
        className="absolute inset-0 size-full"
        aria-hidden
      />
      <span className="relative z-10 whitespace-nowrap px-1 text-[11px] leading-4 font-medium text-text-primary drop-shadow">
        {label}
      </span>
    </Button>
  );
}

function Num({
  label,
  value,
  onCommit,
  step = 0.01,
  testId,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  testId?: string;
}) {
  const [text, setText] = useState(String(Math.round(value * 100) / 100));
  useEffect(() => setText(String(Math.round(value * 100) / 100)), [value]);
  const commit = () => {
    const v = Number(text.replace(",", "."));
    if (Number.isFinite(v)) onCommit(v);
    else setText(String(value));
  };
  return (
    <label className="flex flex-col gap-0.5 text-[11px] text-text-tertiary">
      {label}
      <input
        value={text}
        inputMode="decimal"
        step={step}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
        data-testid={testId}
      />
    </label>
  );
}

function ExportPanel({
  comp,
  buffers,
  range,
  plain,
  name,
  onToLibrary,
}: {
  comp: AudioComposition;
  buffers: Map<string, AudioBuffer> | null;
  range: { from: number; to: number } | null;
  plain: readonly { versionId: string; number: number; durationMs: number | null }[];
  name: string;
  onToLibrary: (part: AudioComposition, label: string) => Promise<void>;
}) {
  const [what, setWhat] = useState<"all" | "range" | "take">("all");
  const [take, setTake] = useState(plain[0]?.versionId ?? "");
  const [e, setE] = useState<ExportSettings>({ format: "wav", sampleRate: 48000, channels: 1 });
  const [fileName, setFileName] = useState(name);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const part = () => {
    if (what === "range" && range)
      return exportPart(comp, { kind: "range", fromMs: range.from, toMs: range.to });
    const t = plain.find((x) => x.versionId === take);
    if (what === "take" && t)
      return exportPart(comp, {
        kind: "take",
        versionId: t.versionId,
        durationMs: t.durationMs ?? 1000,
      });
    return comp;
  };
  async function run(kind: "download" | "library") {
    if (!buffers) return;
    setBusy(kind);
    setMsg(null);
    try {
      if (kind === "download")
        downloadBlob(
          await encodeComposition(part(), buffers, e),
          audioExportName(fileName, e.format),
        );
      else {
        await onToLibrary(part(), fileName.trim() || name);
        setMsg(
          L(
            "Lagt i biblioteket som ny lydvariant.",
            "Added to the library as a new audio variant.",
          ),
        );
      }
    } catch (x) {
      setMsg((x as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const sel =
    "h-7 rounded-sm border border-border-control bg-surface-3 px-1 text-xs text-text-primary";
  return (
    <details className="mt-3 border-t border-border pt-3" data-testid="audio-export">
      <summary className="cursor-pointer text-[13px] font-semibold text-text-primary">
        {L("Eksporter lyd", "Export audio")}
      </summary>
      <div className="mt-2 flex flex-wrap items-end gap-2 text-xs text-text-secondary">
        <label className="flex flex-col gap-0.5">
          {L("Hva", "What")}
          <select
            value={what}
            onChange={(x) => setWhat(x.target.value as never)}
            className={sel}
            data-testid="audio-export-what"
          >
            <option value="all">{L("Hele komposisjonen", "The whole composition")}</option>
            <option value="range" disabled={!range}>
              {L("Valgt område", "Selected range")}
            </option>
            <option value="take">{L("Ett take", "One take")}</option>
          </select>
        </label>
        {what === "take" ? (
          <label className="flex flex-col gap-0.5">
            {L("Take", "Take")}
            <select value={take} onChange={(x) => setTake(x.target.value)} className={sel}>
              {plain.map((t) => (
                <option key={t.versionId} value={t.versionId}>
                  {audioTakeLabel(t.number)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-0.5">
          {L("Format", "Format")}
          <select
            value={e.format}
            onChange={(x) => setE({ ...e, format: x.target.value as never })}
            className={sel}
            data-testid="audio-export-format"
          >
            <option value="wav">WAV</option>
            <option value="mp3">MP3</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          {L("Samplingsfrekvens", "Sample rate")}
          <select
            value={e.sampleRate}
            onChange={(x) => setE({ ...e, sampleRate: Number(x.target.value) as never })}
            className={sel}
          >
            <option value={48000}>48 kHz</option>
            <option value={44100}>44,1 kHz</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          {L("Kanaler", "Channels")}
          <select
            value={e.channels}
            onChange={(x) => setE({ ...e, channels: Number(x.target.value) as never })}
            className={sel}
          >
            <option value={1}>{L("Mono", "Mono")}</option>
            <option value={2}>{L("Stereo", "Stereo")}</option>
          </select>
        </label>
        <label className="flex min-w-[160px] flex-1 flex-col gap-0.5">
          {L("Filnavn", "File name")}
          <input
            value={fileName}
            onChange={(x) => setFileName(x.target.value)}
            className={sel + " px-1.5"}
          />
        </label>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void run("download")}
          disabled={!buffers || busy !== null}
          data-testid="audio-export-download"
        >
          {busy === "download" ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <ArrowDownToLine className="size-3.5" aria-hidden />
          )}
          {L("Last ned", "Download")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void run("library")}
          disabled={!buffers || busy !== null}
          data-testid="audio-export-library"
        >
          {busy === "library" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {L("Legg i biblioteket", "Add to the library")}
        </Button>
      </div>
      {msg ? (
        <p className="mt-1 text-xs text-text-secondary" role="status">
          {msg}
        </p>
      ) : null}
      <p className="mt-1 text-[11px] text-text-tertiary">
        {L(
          "Eksporten flater ikke ut komposisjonen – den kan fortsatt redigeres.",
          "Exporting does not flatten the composition – it can still be edited.",
        )}
      </p>
    </details>
  );
}
