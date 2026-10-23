/**
 * Lydopptak i sceneeditoren (DEC-0052, REQ-0583): ta opp en replikk eller en lyd direkte mens scenen
 * spilles av fra avspillingshodet. Opptaket lagres som en ny lydressurs i biblioteket og legges i scenen der
 * opptaket startet. Det kan trimmes etterpå uten at opptaket endres (klippets inn- og utpunkt).
 */
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { Circle, Loader2, Mic, Smartphone, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AUDIO_KIND_LABEL, AUDIO_TRACK_ORDER, lineInfo, lineLabel, microphoneConstraints, sceneNumberOf, type UploadContext, blocksOfVariant, locale, newId, type AudioKind, dialogueSpeaker, suggestedDialogueCharacter, type ProjectState, lineDrift } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { DialogueVersions } from "./DialogueVersions";
import { DriftBadge, DriftDiffView } from "@/app/dialogue/DriftBadge";
import { NoteFlagControl } from "@/app/dialogue/NoteFlagControl";
import { DialogueCharacters } from "./DialogueCharacters";
import { GenerateDialogue } from "./GenerateDialogue";
import { DialogueLanguageControls } from "./DialogueLanguageControls";
import { AssetThumb, useAssetCovers } from "@/app/library/AssetThumb";
import { saveTake } from "@/app/audio/takes";
import { newRecorder, recordingType } from "@/app/audio/use-recorder";
import { useRawAudioPref } from "@/app/audio/raw-audio-pref";
import { MobileQr, useMobileSession } from "@/app/mobile/MobileImportDialog";
import { uploadAssetAudio } from "@/app/library/asset-audio";
import { createSoundAsset } from "@/app/library/asset-audio";
import { useFilmLanguage } from "@/app/assembly/use-film-language";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t as tk } from "@/core/i18n/keyed";

type Phase = "idle" | "starting" | "recording" | "done" | "saving";

export function RecordAudioDialog({
  open,
  onOpenChange,
  state,
  projectId,
  cmds,
  occurrenceId,
  variantId,
  frame,
  onPlay,
  onStop,
  onAdded,
  initialBlockId = null,
}: {
  /** DV1: replikken som er valgt når vinduet åpnes fra et dobbeltklikk i manuset (M3/M4). */
  initialBlockId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  projectId: string;
  cmds: Commands;
  occurrenceId: string;
  variantId: string;
  /** Avspillingshodet (opptaket starter her i scenen). */
  frame: number;
  /** Spill av scenen fra avspillingshodet under opptaket. */
  onPlay: () => void;
  onStop: () => void;
  onAdded: (clipId: string) => void;
}) {
  const fps = state.project.fps.num / state.project.fps.den;
  const [kind, setKind] = useState<AudioKind>("dialogue");
  const [filmLang] = useFilmLanguage(projectId);
  const [blockId, setBlockId] = useState("");
  const [name, setName] = useState("");
  const [playAlong, setPlayAlong] = useState(true);
  const [raw, setRaw] = useRawAudioPref();
  /** B-099: PC-mikrofonen virker ikke – QR-koden fremheves som alternativ. */
  const [micFailed, setMicFailed] = useState(false);
  /** B-099: avspillingshodet da vinduet (og QR-koden) ble åpnet – der mobillyd legges i scenen. */
  const [openedAtMs, setOpenedAtMs] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [take, setTake] = useState<{ blob: Blob; url: string; ext: string; atMs: number } | null>(
    null,
  );
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; started: number } | null>(
    null,
  );
  const selectedClip = Object.values(state.audioClips).find(c => !c.removed && c.kind === "dialogue" && c.occurrenceId === occurrenceId && c.blockId === blockId);
  const [characterPick, setCharacterPick] = useState<string | null>(null);
  useEffect(() => setCharacterPick(null), [blockId]);
  const characterId = characterPick ?? selectedClip?.characterAssetId ?? null;
  const character = characterId ? state.assets[characterId] : null;
  const covers = useAssetCovers(state, characterId ? [characterId] : []);
  const blocks = blocksOfVariant(state, variantId);
  const index = blocks.findIndex(b => b.id === blockId);
  const contextBefore = blocks.slice(Math.max(0, index - 3), index).filter(b => ["dialogue", "action"].includes(b.kind));
  const contextAfter = blocks.slice(index + 1, index + 4).filter(b => ["dialogue", "action"].includes(b.kind));
  const startMs = Math.max(0, Math.round((frame / fps) * 1000));

  const lines = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    let speaker = "";
    for (const b of blocksOfVariant(state, variantId)) {
      if (b.kind === "character") speaker = b.text.trim();
      else if (b.kind === "dialogue")
        out.push({ id: b.id, label: `${speaker ? speaker + ": " : ""}${b.text.slice(0, 70)}` });
    }
    return out;
  }, [state, variantId]);

  /** Øker når vinduet lukkes: et opptak eller en mikrofon som starter etterpå, forkastes. */
  const session = useRef(0);
  const takeRef = useRef<string | null>(null);
  takeRef.current = take?.url ?? null;

  function cleanup() {
    session.current++;
    const r = rec.current;
    rec.current = null;
    if (r) {
      // Ikke lag et opptak av et avbrutt opptak
      r.recorder.ondataavailable = null;
      r.recorder.onstop = null;
      if (r.recorder.state !== "inactive") r.recorder.stop();
      r.stream.getTracks().forEach((t) => t.stop());
    }
  }

  // Lukkes vinduet: stopp mikrofonen og glem opptaket
  // DV1: åpnet fra manuset – riktig replikk er valgt, sporet er dialog
  useEffect(() => {
    if (!open || !initialBlockId) return;
    if (state.blocks[initialBlockId]?.kind !== "dialogue") return;
    setKind("dialogue");
    setBlockId(initialBlockId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialBlockId]);
  useEffect(() => {
    if (open) {
      setOpenedAtMs(startMs);
      return;
    }
    setMicFailed(false);
    cleanup();
    setPhase("idle");
    setError(null);
    setSeconds(0);
    setTake((t) => {
      if (t) URL.revokeObjectURL(t.url);
      return null;
    });
  }, [open]);
  useEffect(
    () => () => {
      cleanup();
      if (takeRef.current) URL.revokeObjectURL(takeRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (phase !== "recording") return;
    const id = window.setInterval(() => {
      const r = rec.current;
      if (r) setSeconds(Math.floor((performance.now() - r.started) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [phase]);

  async function start() {
    setError(null);
    const type = recordingType();
    if (!type) {
      setMicFailed(true);
      setError(
        tk("app-scene-editor-record-audio-dialog.start.set-error.aff4b707fbc5"),
      );
      return;
    }
    setPhase("starting");
    const mine = session.current;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: microphoneConstraints(raw),
      });
    } catch (e) {
      setPhase("idle");
      setMicFailed(true);
      setError(
        (e as Error).name === "NotAllowedError"
          ? tk("app-scene-editor-record-audio-dialog.start.set-error.df0e4825b0da")
          : tk("app-scene-editor-record-audio-dialog.start.set-error.2fe099680aff", { message: String((e as Error).message) }),
      );
      return;
    }
    if (mine !== session.current) {
      // Vinduet ble lukket mens nettleseren spurte om mikrofonen
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const chunks: Blob[] = [];
    const recorder = newRecorder(stream, type);
    setMicFailed(false);
    const atMs = startMs;
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: type.mime.split(";")[0] ?? type.mime });
      if (blob.size === 0) {
        setPhase("idle");
        setError(tk("app-scene-editor-record-audio-dialog.start.set-error.c67a5559ad35"));
        return;
      }
      setTake({ blob, url: URL.createObjectURL(blob), ext: type.ext, atMs });
      setPhase("done");
    };
    recorder.start(250);
    rec.current = { recorder, stream, started: performance.now() };
    setSeconds(0);
    setPhase("recording");
    if (playAlong) onPlay();
  }

  function stop() {
    onStop();
    const r = rec.current;
    rec.current = null;
    if (r && r.recorder.state !== "inactive") r.recorder.stop();
  }

  function discard() {
    setTake((t) => {
      if (t) URL.revokeObjectURL(t.url);
      return null;
    });
    setPhase("idle");
  }

  async function save() {
    if (!take) return;
    setPhase("saving");
    setError(null);
    try {
      const stamp = new Date().toLocaleString(locale(), {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const title = name.trim() || tk("app-scene-editor-record-audio-dialog.title.message.6cb66d126fd2", { stamp: String(stamp) });
      // i18n-ignore – filnavn
      const file = new File([take.blob], `opptak.${take.ext}`, { type: take.blob.type });
      let clipId: string;
      if (kind === "dialogue" && blockId) {
        const targetAsset = selectedClip?.assetId ?? newId<"asset">();
        const uploaded = await uploadAssetAudio(projectId, targetAsset, file);
        const current = cmds.current();
        if (!current) throw new Error(tk("app-scene-editor-record-audio-dialog.save.message.342a352bd751"));
        const saved = await saveTake(cmds, current, { kind: "line", occurrenceId, blockId, ...(selectedClip ? { clipId: selectedClip.id } : {}) }, uploaded.media, title, targetAsset, undefined, true);
        const fresh = cmds.current();
        if (!fresh) throw new Error(tk("app-scene-editor-record-audio-dialog.save.message.342a352bd751.2"));
        const clip = saved.clipId ? fresh.audioClips[saved.clipId] : selectedClip;
        if (!clip) throw new Error(tk("app-scene-editor-record-audio-dialog.save.message.9cb2b7afbb96"));
        clipId = clip.id;
        // A new recording can use the uniquely matched screenplay speaker. Legacy rows need confirmation.
        const speaker = characterId ?? suggestedDialogueCharacter(fresh, occurrenceId, blockId)?.id ?? null;
        if (speaker) {
          const linked = await cmds.runAndWait({ type: "SetDialogueCharacter", clipIds: [clip.id], characterAssetId: speaker as never }, tk("app-scene-editor-record-audio-dialog.linked.cmds-run-and-wait.95259e018399"));
          if (linked.error) throw new Error(linked.error);
        }
      } else {
        const made = await createSoundAsset(cmds, projectId, file, title);
        const createdClipId = newId<"audio_clip">();
      const r = await cmds.runAndWait(
        {
          type: "AddAudioClips",
          clips: [
            {
              clipId: createdClipId as never,
              fields: {
                occurrenceId: occurrenceId as never,
                kind,
                name: title,
                assetId: made.assetId as never,
                assetVariantId: null,
                versionId: null,
                blockId: (blockId || null) as never,
                offsetMs: take.atMs,
                sourceInMs: 0,
                lengthMs: Math.max(1, made.durationMs),
                gainDb: 0,
                fadeInMs: 0,
                fadeOutMs: 0,
                muted: false,
                continues: false,
                volumeKeys: [],
                // Tale tatt opp mens en annen språkversjon er valgt, hører til det språket (DEC-0059)
                ...(filmLang.dialogue !== "nb" && (kind === "dialogue" || kind === "narration")
                  ? { language: filmLang.dialogue }
                  : {}),
              },
            },
          ],
        },
        tk("app-scene-editor-record-audio-dialog.r.cmds-run-and-wait.622d0ca8ca57", { title: String(title) }),
      );
      if (r.error) throw new Error(r.error);
        clipId = createdClipId;
      }
      URL.revokeObjectURL(take.url);
      setTake(null);
      setPhase("idle");
      if (kind !== "dialogue" || !blockId) onAdded(clipId);
      if (kind !== "dialogue" || !blockId) onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
      setPhase("done");
    }
  }

  const mobileLine = kind === "dialogue" && !!blockId;
  const mobileContext: UploadContext = mobileLine
    ? { type: "line", occurrenceId, blockId, ...(selectedClip ? { clipId: selectedClip.id } : {}) }
    : { type: "scene_sound", occurrenceId, atMs: openedAtMs, kind };
  const occ = state.occurrences[occurrenceId];
  const mobileLabel = mobileLine
    ? lineLabel(lineInfo(state, occurrenceId, blockId, selectedClip?.id))
    : tk("b099.qr.label-sound", { scene: String((occ ? sceneNumberOf(state, occ) : null) ?? ""), kind: AUDIO_KIND_LABEL[kind] });

  const busy = generating || phase === "starting" || phase === "recording" || phase === "saving";
  const select =
    "h-8 min-w-0 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary disabled:opacity-50";
  /** N10: replikken fokus skal tilbake til når dialogen lukkes. */
  const returnTo = useRef<string | null>(null);
  const legend = "text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary";
  const at = (ms: number) => `${(Math.round(ms / 100) / 10).toLocaleString(locale())} s`;

  if (open && initialBlockId) returnTo.current = initialBlockId;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <ResizableDialogContent sizeKey="record-audio" className="max-h-[90vh] max-w-[860px] overflow-y-auto border-border bg-surface-2" data-testid="record-audio-dialog"
        onCloseAutoFocus={(e) => {
          // N10: fokus tilbake til replikken i manuspanelet når dialogen ble åpnet derfra
          const id = returnTo.current;
          returnTo.current = null;
          const el = id ? document.querySelector<HTMLElement>(`[data-testid="scene-script"] [data-script-block="${CSS.escape(id)}"]`) : null;
          if (el) { e.preventDefault(); el.focus(); }
        }}>
        <DialogHeader>
          <DialogTitle>{tk("app-scene-editor-record-audio-dialog.record-audio-dialog.dialog-title.98648fefb495")}</DialogTitle>
          <DialogDescription>
            {tk("app-scene-editor-record-audio-dialog.record-audio-dialog.dialog-description.25f4e227460c", { value1: String(at(take?.atMs ?? startMs)) })}
          </DialogDescription>
        </DialogHeader>
        {kind === "dialogue" && blockId ? <section data-testid="dialogue-context" className="flex flex-col gap-3">
          <div className="flex items-center gap-3">{characterId ? <AssetThumb state={state} assetId={characterId} url={covers[characterId]} /> : null}<strong data-testid="dialogue-character-name" className="text-base text-text-primary">{character?.name ?? dialogueSpeaker(state, occurrenceId, blockId)}</strong></div>
          {contextBefore.map(b => <p key={b.id} data-testid="dialogue-context-before" className="text-sm text-text-primary opacity-70">{b.text}</p>)}
          <p data-testid="dialogue-active-text" className="whitespace-pre-wrap break-words text-xl leading-relaxed text-text-primary">{state.blocks[blockId]?.text}</p>
          {lineDrift(state, occurrenceId, blockId).status === "drift" ? <div data-testid="dialogue-drift" role="status" className="rounded-sm border border-status-danger/40 bg-status-danger-bg p-2"><div className="mb-1 flex items-center gap-2 text-xs text-status-danger"><DriftBadge state={state} projectId={projectId} occurrenceId={occurrenceId} blockId={blockId} run={cmds.run} editable={!busy} onGo={() => onOpenChange(false)} />{tk("app-scene-editor-record-audio-dialog.record-audio-dialog.div.e0e446d3c491")}</div><DriftDiffView state={state} occurrenceId={occurrenceId} blockId={blockId} /></div> : <DriftBadge state={state} projectId={projectId} occurrenceId={occurrenceId} blockId={blockId} run={cmds.run} editable={!busy} onGo={() => onOpenChange(false)} />}
          {selectedClip ? <div className="flex items-center gap-2 text-xs text-text-secondary"><NoteFlagControl state={state} kind="audio_clip" targetId={selectedClip.id} run={cmds.run} editable={!busy} />{tk("app-scene-editor-record-audio-dialog.record-audio-dialog.div.44f2ab294970")}</div> : null}
          {contextAfter.map(b => <p key={b.id} data-testid="dialogue-context-after" className="text-sm text-text-primary opacity-70">{b.text}</p>)}
          <label className="flex flex-col gap-1 text-xs text-text-secondary">{tk("app-scene-editor-record-audio-dialog.record-audio-dialog.label.d7f53f15259f")}<select data-testid="dialogue-character-select" value={characterId ?? ""} disabled={busy} className={select} onChange={e => {
            const id = e.target.value || null; setCharacterPick(id ?? "");
            if (selectedClip) setError(cmds.run({ type: "SetDialogueCharacter", clipIds: [selectedClip.id], characterAssetId: id as never }, tk("app-scene-editor-record-audio-dialog.record-audio-dialog.cmds-run.f875c933b69b")));
          }}><option value="">{tk("app-scene-editor-record-audio-dialog.record-audio-dialog.option.1e8164ab62e8")}</option>{Object.values(state.assets).filter(a => !a.removed && !a.archived && ["character", "animal", "other"].includes(a.kind)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        </section> : null}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span className={legend}>{tk("app-scene-editor-record-audio-dialog.record-audio-dialog.span.3bb3ee349a15")}</span>
            <select
              value={kind}
              disabled={busy}
              onChange={(e) => setKind(e.target.value as AudioKind)}
              className={select}
            >
              {AUDIO_TRACK_ORDER.map((k) => (
                <option key={k} value={k}>
                  {AUDIO_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span className={legend}>{tk("app-scene-editor-record-audio-dialog.record-audio-dialog.span.38b3663f6ac7")}</span>
            <select
              data-testid="record-line-select"
              value={blockId}
              disabled={busy || lines.length === 0}
              onChange={(e) => setBlockId(e.target.value)}
              className={select}
            >
              <option value="">
                {lines.length
                  ? tk("app-scene-editor-record-audio-dialog.record-audio-dialog.option.7eec3bb384d7")
                  : tk("app-scene-editor-record-audio-dialog.record-audio-dialog.option.9cbc47ca923c")}
              </option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs text-text-secondary">
            <span className={legend}>{tk("app-scene-editor-record-audio-dialog.record-audio-dialog.span.87c6b2c662d6")}</span>
            <input
              value={name}
              disabled={busy}
              maxLength={200}
              placeholder={tk("app-scene-editor-record-audio-dialog.record-audio-dialog.placeholder.3c6ca787bd88")}
              onChange={(e) => setName(e.target.value)}
              className={select}
            />
          </label>
          <label className="col-span-2 flex items-center gap-2 text-[13px] text-text-primary">
            <input
              type="checkbox"
              checked={playAlong}
              disabled={busy}
              onChange={(e) => setPlayAlong(e.target.checked)}
              className="size-3.5 accent-[var(--accent-brand)]"
            />
            {tk("app-scene-editor-record-audio-dialog.record-audio-dialog.label.33e3ee40e1da")}
          </label>
        </div>

        {playAlong ? <p role="status" data-testid="dialogue-headphones" className="text-xs text-status-uncertain">{tk("app-scene-editor-record-audio-dialog.record-audio-dialog.p.dadb79d04045")}</p> : null}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 rounded-sm border border-border bg-surface-1 p-3">
            {phase === "recording" ? (
              <>
                <Button variant="destructive" onClick={stop}>
                  <Square className="fill-current" />
                  {tk("app-scene-editor-record-audio-dialog.record-audio-dialog.button.0105f189ee3b")}
                </Button>
                <span className="flex items-center gap-1.5 text-[13px] tabular-nums text-status-danger">
                  <Circle className="size-3 animate-pulse fill-current" aria-hidden />
                  {tk("app-scene-editor-record-audio-dialog.record-audio-dialog.span.dbfce3788f71")} {Math.floor(seconds / 60)}:
                  {String(seconds % 60).padStart(2, "0")}
                </span>
              </>
            ) : take ? (
              <>
                <audio src={take.url} controls className="h-8 min-w-0 flex-1" />
                <Button variant="ghost" size="sm" disabled={busy} onClick={discard}>
                  {tk("app-scene-editor-record-audio-dialog.record-audio-dialog.button.459663350e6a")}
                </Button>
              </>
            ) : (
              <Button onClick={() => void start()} disabled={busy}>
                {phase === "starting" ? <Loader2 className="animate-spin" /> : <Mic />}
                {tk("app-scene-editor-record-audio-dialog.record-audio-dialog.button.ae4c0e1df207")}
              </Button>
            )}
          </div>
          <label className="flex items-start gap-2 text-[13px] text-text-primary">
            <input
              type="checkbox"
              checked={raw}
              disabled={busy}
              onChange={(e) => setRaw(e.target.checked)}
              className="mt-0.5 size-3.5 accent-[var(--accent-brand)]"
              data-testid="record-raw-audio"
            />
            <span>
              {tk("b099.raw.label")}
              <span className="block text-xs text-text-tertiary">{tk("b099.raw.hint")}</span>
            </span>
          </label>
          {micFailed ? (
            <p role="alert" data-testid="record-mic-failed" className="flex items-center gap-2 rounded-sm border border-accent-warm/60 bg-accent-warm/10 p-2 text-[13px] text-text-primary">
              <Smartphone className="size-4 shrink-0 text-accent-warm" aria-hidden />
              {tk("b099.mic.failed")}
            </p>
          ) : null}
        </div>
        {open ? (
          <RecordMobilePanel
            key={JSON.stringify(mobileContext)}
            projectId={projectId}
            context={mobileContext}
            label={mobileLabel}
            highlight={micFailed}
            hint={mobileLine ? tk("b099.qr.hint-line") : tk("b099.qr.hint-sound", { at: at(openedAtMs) })}
          />
        ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}

        {kind === "dialogue" && blockId ? <>
          <DialogueLanguageControls key={blockId} state={state} occurrenceId={occurrenceId} blockId={blockId} characterId={characterId} cmds={cmds} disabled={busy} />
          {selectedClip ? <DialogueVersions state={state} clip={selectedClip} cmds={cmds} onStopScene={onStop} /> : null}
          <GenerateDialogue state={state} projectId={projectId} occurrenceId={occurrenceId} blockId={blockId} characterId={characterId} cmds={cmds} onSaved={() => {}} onBusy={setGenerating} />
          <DialogueCharacters state={state} occurrenceId={occurrenceId} cmds={cmds} />
        </> : null}
        <DialogFooter>
          <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
            {tk("app-scene-editor-record-audio-dialog.record-audio-dialog.button.bc281784a1ed")}
          </Button>
          <Button disabled={!take || busy} onClick={() => void save()}>
            {phase === "saving" ? <Loader2 className="animate-spin" /> : null}
            {tk("app-scene-editor-record-audio-dialog.record-audio-dialog.button.a95f00f8e593")}
          </Button>
        </DialogFooter>
      </ResizableDialogContent>
    </Dialog>
  );
}

/** B-099: QR-koden for opptak på mobilen, med status (samme økt og komponent som i lydvinduet). */
function RecordMobilePanel({
  projectId,
  context,
  label,
  hint,
  highlight,
}: {
  projectId: string;
  context: UploadContext;
  label: string;
  hint: string;
  highlight: boolean;
}) {
  const m = useMobileSession(projectId, context, label);
  return (
    <section
      aria-labelledby="record-mobile-h"
      data-testid="record-mobile"
      data-highlight={highlight || undefined}
      className={
        "flex w-[200px] flex-col items-center gap-2 rounded-sm border p-2 " +
        (highlight ? "border-accent-warm ring-2 ring-accent-warm/60" : "border-border")
      }
    >
      <h3 id="record-mobile-h" className="self-start text-[13px] font-semibold text-text-primary">
        {tk("b099.qr.title")}
      </h3>
      <MobileQr m={m} size={150} />
      <p className="text-[11px] text-text-tertiary">{hint}</p>
      <p
        className={"flex items-center gap-1.5 text-xs " + (m.connected ? "text-status-success" : "text-text-tertiary")}
        data-testid="record-mobile-connected"
        data-connected={m.connected || undefined}
      >
        <Smartphone className="size-3.5" aria-hidden />
        {m.connected ? tk("b099.qr.connected") : tk("b099.qr.waiting")}
      </p>
      {m.pending.length ? (
        <p className="text-xs text-text-secondary" data-testid="record-mobile-pending">
          {tk("b099.qr.pending", { n: String(m.pending.length) })}
        </p>
      ) : null}
      {m.received.length ? (
        <p className="text-xs text-text-secondary" data-testid="record-mobile-received">
          {tk("b099.qr.received", { n: String(m.received.length) })}
        </p>
      ) : null}
    </section>
  );
}
