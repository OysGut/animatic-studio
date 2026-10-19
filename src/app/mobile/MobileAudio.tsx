/**
 * Lydopptak på mobilsiden (fase 2, bolk B, DEC-0093, REQ-0685/0687/0689/0690): replikken vises øverst, så man
 * kan lese fra telefonen. Hvert opptak blir et take som bare ligger på telefonen til brukeren velger å sende
 * det – ett, flere eller alle. Status for hvert take: bare på telefonen, valgt, sendes, sendt eller feilet
 * (kan sendes på nytt uten nytt opptak). Ren romlyd kan tas opp for seg.
 */
import {
  Check,
  Circle,
  Loader2,
  RotateCw,
  Send,
  Square,
  Trash2,
  TriangleAlert,
  Waves,
} from "lucide-react";
import { useEffect, useState } from "react";
import { L, audioTakeLabel, formatTakeLength, takeFileName, type MobileScript } from "@/core";
import { useRecorder } from "@/app/audio/use-recorder";
import type { QueueItem, UploadQueue, Uploader } from "./upload-queue";

export function MobileAudio({
  script,
  items,
  queue,
  uploader,
}: {
  script: MobileScript | null | undefined;
  items: readonly QueueItem[];
  queue: UploadQueue;
  uploader: Uploader;
}) {
  const rec = useRecorder();
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const takes = items.filter((x) => !x.roomTone);
  const room = items.filter((x) => x.roomTone);

  async function record(roomTone: boolean) {
    const done = await rec.start({ roomTone });
    if (!done) return;
    const r = await done;
    if (!r) return;
    URL.revokeObjectURL(r.url);
    const n = (roomTone ? room.length : takes.length) + 1;
    const it = queue.add(r.blob, takeFileName(n, r.ext, roomTone), {
      local: true,
      durationMs: r.durationMs,
      roomTone,
    });
    // Det nye takeet er valgt, men sendes ikke før brukeren trykker «Send»
    setChosen((c) => new Set([...c, it.id]));
  }

  const sendable = items.filter((x) => x.status === "local" || x.status === "failed");
  const picked = sendable.filter((x) => chosen.has(x.id));

  function send(ids: readonly string[]) {
    queue.send(ids);
    setChosen((c) => new Set([...c].filter((id) => !ids.includes(id))));
    uploader.pump();
  }

  const recording = rec.phase === "recording";
  return (
    <div className="flex flex-col gap-4" data-testid="mobile-audio">
      {script ? (
        <figure
          className="rounded-lg border border-border bg-surface-2 px-4 py-4 text-center"
          data-testid="mobile-script"
        >
          <p className="font-mono text-sm font-semibold uppercase text-text-primary">
            {script.speaker}
          </p>
          {script.parenthetical ? (
            <p className="font-mono text-sm text-text-secondary">{script.parenthetical}</p>
          ) : null}
          <blockquote className="mt-2 font-mono text-lg leading-relaxed text-text-primary">
            {script.text}
          </blockquote>
        </figure>
      ) : null}

      <div className="flex flex-col items-center gap-2">
        {recording ? (
          <button
            type="button"
            onClick={rec.stop}
            className="flex size-24 items-center justify-center rounded-full bg-status-danger text-on-media active:opacity-80"
            aria-label={L("Stopp opptaket", "Stop the recording")}
            data-testid="mobile-rec-stop"
          >
            <Square className="size-9 fill-current" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void record(false)}
            disabled={rec.phase === "starting"}
            className="flex size-24 items-center justify-center rounded-full border-4 border-status-danger bg-surface-2 active:bg-surface-3 disabled:opacity-60"
            aria-label={L("Start opptak", "Start recording")}
            data-testid="mobile-rec-start"
          >
            {rec.phase === "starting" ? (
              <Loader2 className="size-8 animate-spin text-text-tertiary" aria-hidden />
            ) : (
              <Circle className="size-12 fill-status-danger text-status-danger" aria-hidden />
            )}
          </button>
        )}
        <p className="text-sm text-text-secondary" role="status">
          {recording
            ? rec.roomTone
              ? L(
                  `Romlyd … ${formatTakeLength(rec.ms)} – vær helt stille`,
                  `Room tone … ${formatTakeLength(rec.ms)} – keep completely quiet`,
                )
              : L(
                  `Tar opp … ${formatTakeLength(rec.ms)}`,
                  `Recording … ${formatTakeLength(rec.ms)}`,
                )
            : takes.length
              ? L("Trykk for et nytt take", "Tap for a new take")
              : L("Trykk for å ta opp", "Tap to record")}
        </p>
        {rec.error ? (
          <p role="alert" className="text-center text-sm text-status-danger">
            {rec.error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void record(true)}
          disabled={recording || rec.phase === "starting"}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-text-secondary active:bg-surface-3 disabled:opacity-50"
          data-testid="mobile-rec-roomtone"
        >
          <Waves className="size-4" aria-hidden />
          {L(
            "Ta opp romlyd (noen sekunder stillhet)",
            "Record room tone (a few seconds of silence)",
          )}
        </button>
      </div>

      {items.length ? (
        <section aria-label={L("Dine opptak", "Your recordings")} data-testid="mobile-takes">
          <ul className="flex flex-col gap-2">
            {[...items].reverse().map((it) => (
              <TakeRow
                key={it.id}
                it={it}
                n={(it.roomTone ? room : takes).findIndex((x) => x.id === it.id) + 1}
                chosen={chosen.has(it.id)}
                onToggle={() =>
                  setChosen((c) => {
                    const next = new Set(c);
                    if (next.has(it.id)) next.delete(it.id);
                    else next.add(it.id);
                    return next;
                  })
                }
                onRemove={() => queue.remove(it.id)}
                onRetry={() => send([it.id])}
              />
            ))}
          </ul>
          <button
            type="button"
            onClick={() => send(picked.map((x) => x.id))}
            disabled={!picked.length}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent-brand text-base font-medium text-accent-fg disabled:opacity-40"
            data-testid="mobile-send-takes"
          >
            <Send className="size-4" aria-hidden />
            {picked.length === 1
              ? L("Send det valgte opptaket", "Send the chosen recording")
              : L(`Send de valgte (${picked.length})`, `Send the chosen ones (${picked.length})`)}
          </button>
          {sendable.length > picked.length ? (
            <p className="mt-1 text-center text-xs text-text-tertiary">
              {L(
                "Opptak som ikke er valgt, blir liggende på telefonen.",
                "Recordings that are not chosen stay on the phone.",
              )}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function statusText(status: QueueItem["status"]): string {
  switch (status) {
    case "local":
      return L("Bare på telefonen", "Only on the phone");
    case "queued":
      return L("Venter på sending", "Waiting to send");
    case "uploading":
      return L("Sendes …", "Sending …");
    case "sent":
      return L("Sendt", "Sent");
    case "failed":
      return L("Feilet", "Failed");
  }
}

function TakeRow({
  it,
  n,
  chosen,
  onToggle,
  onRemove,
  onRetry,
}: {
  it: QueueItem;
  n: number;
  chosen: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(it.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [it.blob]);
  const canPick = it.status === "local" || it.status === "failed";
  const status =
    canPick && chosen && it.status === "local" ? L("Valgt", "Chosen") : statusText(it.status);
  return (
    <li
      className={
        "flex flex-col gap-1.5 rounded-lg border p-2 " +
        (chosen && canPick
          ? "border-accent-brand bg-accent-brand/10"
          : "border-border bg-surface-2")
      }
      data-status={it.status}
      data-testid="mobile-take"
    >
      <div className="flex items-center gap-2">
        {canPick ? (
          <input
            type="checkbox"
            checked={chosen}
            onChange={onToggle}
            className="size-5 accent-[var(--color-accent-brand)]"
            aria-label={L(`Velg ${audioTakeLabel(n)}`, `Choose ${audioTakeLabel(n)}`)}
            data-testid="mobile-take-choose"
          />
        ) : it.status === "sent" ? (
          <Check className="size-5 text-status-success" aria-hidden />
        ) : (
          <Loader2 className="size-5 animate-spin text-text-tertiary" aria-hidden />
        )}
        <span className="text-sm font-medium text-text-primary">
          {it.roomTone ? L(`Romlyd ${n}`, `Room tone ${n}`) : audioTakeLabel(n)} ·{" "}
          {formatTakeLength(it.durationMs)}
        </span>
        <span
          className={
            "ml-auto text-xs " +
            (it.status === "failed"
              ? "text-status-danger"
              : it.status === "sent"
                ? "text-status-success"
                : "text-text-tertiary")
          }
          data-testid="mobile-take-status"
        >
          {status}
        </span>
      </div>
      {url ? <audio src={url} controls preload="metadata" className="h-9 w-full" /> : null}
      {it.status === "failed" ? (
        <div className="flex items-center gap-2 text-xs text-status-danger">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{it.error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1 rounded-sm bg-surface-3 px-2 py-1 text-text-primary"
          >
            <RotateCw className="size-3" aria-hidden />
            {L("Prøv igjen", "Try again")}
          </button>
        </div>
      ) : null}
      {it.status === "local" ? (
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center gap-1 self-end text-xs text-text-tertiary"
        >
          <Trash2 className="size-3" aria-hidden />
          {L("Forkast", "Discard")}
        </button>
      ) : null}
    </li>
  );
}
