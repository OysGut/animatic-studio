/**
 * Lydvinduet bak mikrofonikonet (fase 2, bolk B, DEC-0093, REQ-0684–0690): «Ta opp på denne datamaskinen» og
 * QR-koden for mobilen vises samtidig fra første øyeblikk, for akkurat denne lyden eller replikken. Fra en
 * replikk vises hele replikken med karakter og scene. Hvert opptak er et eget take: et nytt take overskriver
 * aldri et tidligere, og brukeren velger selv hvilket som er aktivt («Bruk dette»).
 */
import { Check, Circle, Loader2, Mic, Play, Smartphone, Square, Trash2, Waves } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  L,
  activeLineTake,
  audioTakeLabel,
  formatDate,
  formatTakeLength,
  lineInfo,
  newId,
  roomToneAsset,
  roomToneName,
  roomToneSceneName,
  soundTakes,
  type ProjectState,
  type UploadContext,
  LINE_STATUS_LABEL,
  LINE_STATUS_MARK,
  lineAudioStatus,
  type LineAudioStatus,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { uploadAssetAudio } from "@/app/library/asset-audio";
import { useImageUrls } from "@/app/library/asset-images";
import { MobileQr, useMobileSession } from "@/app/mobile/MobileImportDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { chooseTake, saveRoomTone, saveTake, type TakeTarget } from "./takes";
import { AudioCompositionEditor } from "./AudioCompositionEditor";
import { useRecorder, type Recording } from "./use-recorder";

export function AudioTakesDialog({
  open,
  onOpenChange,
  projectId,
  state,
  cmds,
  target,
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  state: ProjectState;
  cmds: Commands;
  target: TakeTarget;
  /** Hva opptaket gjelder (vises her og på mobilen), f.eks. «Scene 3 · MAJA». */
  label: string;
}) {
  const [confirmClose, setConfirmClose] = useState(false);
  const unsaved = useRef(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && unsaved.current > 0 && !confirmClose) {
          setConfirmClose(true);
          return;
        }
        setConfirmClose(false);
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-h-[90vh] max-w-[860px] overflow-y-auto border-border bg-surface-2"
        data-testid="audio-takes-dialog"
      >
        {open ? (
          <Body
            projectId={projectId}
            state={state}
            cmds={cmds}
            target={target}
            label={label}
            onUnsaved={(n) => {
              unsaved.current = n;
              if (n === 0) setConfirmClose(false);
            }}
          />
        ) : null}
        {confirmClose ? (
          <div
            role="alert"
            className="mt-3 flex flex-wrap items-center gap-2 rounded-sm border border-accent-warm/60 p-2 text-xs text-accent-warm"
            data-testid="audio-takes-confirm-close"
          >
            {L(
              "Du har opptak som ikke er beholdt. De forsvinner hvis du lukker.",
              "You have recordings that are not kept. They disappear if you close.",
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                unsaved.current = 0;
                setConfirmClose(false);
                onOpenChange(false);
              }}
            >
              {L("Lukk likevel", "Close anyway")}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  projectId,
  state,
  cmds,
  target,
  label,
  onUnsaved,
}: {
  projectId: string;
  state: ProjectState;
  cmds: Commands;
  target: TakeTarget;
  label: string;
  onUnsaved: (n: number) => void;
}) {
  const context: UploadContext =
    target.kind === "sound"
      ? { type: "sound", assetId: target.assetId, variantId: target.variantId }
      : { type: "line", occurrenceId: target.occurrenceId, blockId: target.blockId };
  const m = useMobileSession(projectId, context, label);
  const info = target.kind === "line" ? lineInfo(state, target.occurrenceId, target.blockId) : null;
  const assetId = target.kind === "sound" ? target.assetId : (info?.clip?.assetId ?? null);
  const takes = useMemo(() => (assetId ? soundTakes(state, assetId) : []), [state, assetId]);
  const active =
    target.kind === "line"
      ? info
        ? activeLineTake(state, info)
        : null
      : (takes.find((t) => t.approved)?.versionId ?? null);
  const where =
    target.kind === "line" ? roomToneSceneName(info) : (state.assets[target.assetId]?.name ?? "");
  const roomAsset = roomToneAsset(state, where);
  const roomTakes = useMemo(
    () => (roomAsset ? soundTakes(state, roomAsset.id) : []),
    [state, roomAsset],
  );
  const urls = useImageUrls([...takes, ...roomTakes].map((t) => t.mediaPath));

  const rec = useRecorder();
  /** Versjonen som er åpen i lydeditoren (bolk C). */
  const [editing, setEditing] = useState<string | null>(null);
  /** Ordene som er markert i lydeditoren (fremheves i replikken over opptaksknappene). */
  const [marked, setMarked] = useState<{ start: number; end: number } | null>(null);
  const [local, setLocal] = useState<Recording[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => onUnsaved(local.length), [local.length, onUnsaved]);
  const localRef = useRef(local);
  localRef.current = local;
  useEffect(
    () => () => {
      for (const r of localRef.current) URL.revokeObjectURL(r.url);
    },
    [],
  );

  async function record(roomTone: boolean) {
    const done = await rec.start({ roomTone });
    if (!done) return;
    const r = await done;
    if (r) setLocal((l) => [...l, r]);
  }

  function forget(id: string) {
    setLocal((l) => {
      const r = l.find((x) => x.id === id);
      if (r) URL.revokeObjectURL(r.url);
      return l.filter((x) => x.id !== id);
    });
  }

  async function keep(r: Recording) {
    setBusy(r.id);
    setError(null);
    try {
      const s = cmds.current() ?? state;
      // Lagres i lydressursen (som finnes, eller lages for replikken)
      const existing = r.roomTone ? roomToneAsset(s, where)?.id : assetId;
      const owner = existing ?? newId<"asset">();
      const file = new File([r.blob], `opptak.${r.ext}`, { type: r.mime }); // i18n-ignore – filnavn
      const { media } = await uploadAssetAudio(projectId, owner, file);
      const note = L("Opptak på datamaskinen", "Recorded on the computer");
      if (r.roomTone) await saveRoomTone(cmds, s, where, media, note, existing ? undefined : owner);
      else await saveTake(cmds, s, target, media, note, existing ? undefined : owner);
      forget(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function choose(t: { variantId: string; versionId: string; durationMs: number | null }) {
    setBusy(t.versionId);
    setError(null);
    try {
      await chooseTake(cmds, cmds.current() ?? state, target, t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const recording = rec.phase === "recording";
  const seconds = Math.floor(rec.ms / 1000);

  return (
    <>
      <div className="flex items-start gap-2 pr-6">
        <Mic className="mt-0.5 size-4 shrink-0 text-accent-brand" aria-hidden />
        <div className="min-w-0">
          <DialogTitle className="text-base font-semibold text-text-primary">
            {L("Lydopptak", "Audio recording")}
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-[13px] text-text-secondary">
            {label}
          </DialogDescription>
        </div>
      </div>

      {info ? (
        <figure
          className="mt-3 rounded-sm border border-border bg-surface-1 px-4 py-3 text-center"
          data-testid="audio-takes-line"
        >
          <p className="text-[11px] text-text-tertiary">
            {info.sceneNumber
              ? L(`Scene ${info.sceneNumber}`, `Scene ${info.sceneNumber}`)
              : L("Scene", "Scene")}
            {info.heading ? ` · ${info.heading}` : ""}
          </p>
          <p className="mt-1 font-mono text-[13px] font-semibold uppercase text-text-primary">
            {info.speaker}
          </p>
          {info.parenthetical ? (
            <p className="font-mono text-xs text-text-secondary">{info.parenthetical}</p>
          ) : null}
          <blockquote className="mx-auto mt-1 max-w-[52ch] font-mono text-[14px] leading-relaxed text-text-primary">
            <HighlightedLine text={state.blocks[info.blockId]?.text ?? info.text} mark={marked} />
          </blockquote>
          <LineStatusBadge status={lineAudioStatus(state, info.occurrenceId, info.blockId)} />
        </figure>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
        <section aria-labelledby="pc-rec" className="flex flex-col gap-2">
          <h3 id="pc-rec" className="text-[13px] font-semibold text-text-primary">
            {L("Ta opp på denne datamaskinen", "Record on this computer")}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {recording ? (
              <Button size="sm" variant="destructive" onClick={rec.stop} data-testid="pc-rec-stop">
                <Square className="size-3.5" aria-hidden />
                {L(`Stopp (${seconds} s)`, `Stop (${seconds} s)`)}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void record(false)}
                disabled={rec.phase === "starting"}
                data-testid="pc-rec-start"
              >
                {rec.phase === "starting" ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Circle className="size-3.5 fill-current text-status-danger" aria-hidden />
                )}
                {local.length || takes.length
                  ? L("Ta opp på nytt", "Record again")
                  : L("Start opptak", "Start recording")}
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void record(true)}
              disabled={recording || rec.phase === "starting"}
              title={L(
                "Ta opp noen sekunder der ingen snakker – til bruk i dialogredigering",
                "Record a few seconds where nobody speaks – for use in dialogue editing",
              )}
              data-testid="pc-rec-roomtone"
            >
              <Waves className="size-3.5" aria-hidden />
              {L("Ta opp romlyd", "Record room tone")}
            </Button>
            {recording ? (
              <span className="flex items-center gap-1 text-xs text-status-danger" role="status">
                <Circle className="size-2.5 animate-pulse fill-current" aria-hidden />
                {rec.roomTone
                  ? L("Tar opp romlyd …", "Recording room tone …")
                  : L("Tar opp …", "Recording …")}
              </span>
            ) : null}
          </div>
          {rec.error ? (
            <p role="alert" className="text-xs text-status-danger">
              {rec.error}
            </p>
          ) : null}
          {local.length ? (
            <ul className="flex flex-col gap-1.5" data-testid="pc-rec-local">
              {local.map((r, i) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 rounded-sm border border-accent-warm/50 bg-surface-1 px-2 py-1.5"
                >
                  <span className="text-xs font-medium text-text-primary">
                    {r.roomTone
                      ? L("Romlyd", "Room tone")
                      : L(`Nytt opptak ${i + 1}`, `New recording ${i + 1}`)}{" "}
                    · {formatTakeLength(r.durationMs)}
                  </span>
                  <audio src={r.url} controls preload="metadata" className="h-8 max-w-[220px]" />
                  <Button
                    size="sm"
                    onClick={() => void keep(r)}
                    disabled={busy !== null}
                    data-testid="pc-rec-keep"
                  >
                    {busy === r.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Check className="size-3.5" aria-hidden />
                    )}
                    {L("Behold", "Keep")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => forget(r.id)}
                    disabled={busy === r.id}
                    aria-label={L("Forkast opptaket", "Discard the recording")}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-[11px] text-text-tertiary">
            {L(
              "Opptakene blir liggende her til du trykker «Behold». Et nytt take overskriver aldri et tidligere.",
              "Recordings stay here until you press “Keep”. A new take never overwrites an earlier one.",
            )}
          </p>
        </section>

        <section
          aria-labelledby="mob-rec"
          className="flex flex-col items-center gap-2 sm:border-l sm:border-border sm:pl-4"
        >
          <h3 id="mob-rec" className="self-start text-[13px] font-semibold text-text-primary">
            {L("Ta opp på mobilen", "Record on the phone")}
          </h3>
          <MobileQr m={m} size={170} />
          <p
            className={
              "flex items-center gap-1.5 text-xs " +
              (m.connected ? "text-status-success" : "text-text-tertiary")
            }
            data-testid="audio-mobile-connected"
          >
            <Smartphone className="size-3.5" aria-hidden />
            {m.connected
              ? L("Mobilen er tilkoblet", "The phone is connected")
              : L("Venter på mobilen …", "Waiting for the phone …")}
          </p>
          {m.pending.length ? (
            <p className="text-xs text-text-secondary">
              {L(`${m.pending.length} lastes opp`, `${m.pending.length} uploading`)}
            </p>
          ) : null}
        </section>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-status-danger">
          {error}
        </p>
      ) : null}

      <section aria-labelledby="takes-h" className="mt-4">
        <h3 id="takes-h" className="text-[13px] font-semibold text-text-primary">
          {L("Takes", "Takes")}
        </h3>
        {takes.length ? (
          <ul className="mt-1.5 flex flex-col gap-1" data-testid="audio-takes-list">
            {[...takes].reverse().map((t) => {
              const isActive = t.versionId === active;
              return (
                <li
                  key={t.versionId}
                  className={
                    "flex flex-wrap items-center gap-2 rounded-sm border px-2 py-1.5 " +
                    (isActive
                      ? "border-accent-brand bg-accent-brand/10"
                      : "border-border bg-surface-1")
                  }
                  data-active={isActive || undefined}
                >
                  <span className="min-w-[110px] text-xs font-medium text-text-primary">
                    {audioTakeLabel(t.number)} · {formatTakeLength(t.durationMs)}
                    {t.composition ? (
                      <span className="ml-1 rounded-sm bg-accent-warm/20 px-1 text-[11px] font-normal text-accent-warm">
                        {L("komposisjon", "composition")}
                      </span>
                    ) : null}
                  </span>
                  {urls.data?.[t.mediaPath] ? (
                    <audio
                      src={urls.data[t.mediaPath]}
                      controls
                      preload="none"
                      className="h-8 max-w-[220px]"
                    />
                  ) : (
                    <Play className="size-3.5 text-text-tertiary" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[11px] text-text-tertiary">
                    {t.note || L("Opplastet", "Uploaded")} · {formatDate(t.createdAt)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(t.versionId)}
                    disabled={!assetId}
                    data-testid="audio-take-edit"
                  >
                    {L("Rediger", "Edit")}
                  </Button>
                  {isActive ? (
                    <span className="text-[11px] font-medium text-accent-brand">
                      {target.kind === "line"
                        ? L("Brukes i scenen", "Used in the scene")
                        : L("Aktiv", "Active")}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void choose(t)}
                      disabled={busy !== null}
                      data-testid="audio-take-use"
                    >
                      {busy === t.versionId ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : null}
                      {L("Bruk dette", "Use this")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-text-tertiary">
            {target.kind === "line"
              ? L(
                  "Ingen opptak ennå. Det første opptaket du beholder, legges i scenen der replikken begynner.",
                  "No recordings yet. The first recording you keep is placed in the scene where the line begins.",
                )
              : L("Ingen opptak ennå.", "No recordings yet.")}
          </p>
        )}
        {editing && assetId ? (
          <AudioCompositionEditor
            key={editing}
            projectId={projectId}
            state={state}
            cmds={cmds}
            target={target}
            assetId={assetId}
            baseVersionId={editing}
            onClose={() => {
              setEditing(null);
              setMarked(null);
            }}
            onSaved={(id) => setEditing(id)}
            onWords={setMarked}
          />
        ) : null}
        {roomTakes.length ? (
          <p className="mt-2 text-[11px] text-text-tertiary" data-testid="audio-roomtone-count">
            {L(
              `${roomToneName(where)}: ${roomTakes.length} opptak i biblioteket`,
              `${roomToneName(where)}: ${roomTakes.length} recordings in the library`,
            )}
          </p>
        ) : null}
      </section>
    </>
  );
}

/** Replikken med de markerte ordene fremhevet (REQ-0685): man ser hva som skal tas opp. */
function HighlightedLine({
  text,
  mark,
}: {
  text: string;
  mark: { start: number; end: number } | null;
}) {
  if (!mark || mark.start >= mark.end || mark.end > text.length) return <>{text}</>;
  return (
    <>
      {text.slice(0, mark.start)}
      <mark
        className="rounded-sm bg-accent-warm/40 px-0.5 text-text-primary"
        data-testid="line-marked"
      >
        {text.slice(mark.start, mark.end)}
      </mark>
      {text.slice(mark.end)}
    </>
  );
}

/** Status for tekst mot lyd (REQ-0703): tegn og tekst, ikke bare farge. */
export function LineStatusBadge({ status }: { status: LineAudioStatus }) {
  const tone =
    status === "approved" || status === "synced"
      ? "text-status-success"
      : status === "new_take"
        ? "text-accent-brand"
        : "text-accent-warm";
  return (
    <p
      className={"mt-1 text-[11px] font-medium " + tone}
      data-testid="line-status"
      data-status={status}
    >
      <span aria-hidden>{LINE_STATUS_MARK[status]} </span>
      {LINE_STATUS_LABEL[status]}
    </p>
  );
}

/** Mikrofonikonet øverst til høyre i lyd- og replikkvinduer (REQ-0684). */
export function MicButton({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex size-7 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-3 hover:text-text-primary " +
        (className ?? "")
      }
      aria-label={L(`Ta opp lyd: ${label}`, `Record audio: ${label}`)}
      title={L(
        "Ta opp lyd på datamaskinen eller mobilen",
        "Record audio on the computer or the phone",
      )}
      data-testid="mic-button"
    >
      <Mic className="size-4" aria-hidden />
    </button>
  );
}

/** Mikrofonikonet med lydvinduet for en lydressurs eller en replikk. */
export function TakesMicButton({
  projectId,
  state,
  cmds,
  target,
  label,
  className,
}: {
  projectId: string;
  state: ProjectState;
  cmds: Commands;
  target: TakeTarget;
  label: string;
  className?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MicButton label={label} onClick={() => setOpen(true)} className={className} />
      <AudioTakesDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        state={state}
        cmds={cmds}
        target={target}
        label={label}
      />
    </>
  );
}
