/**
 * Lydopptak i sceneeditoren (DEC-0052, REQ-0583): ta opp en replikk eller en lyd direkte mens scenen
 * spilles av fra avspillingshodet. Opptaket lagres som en ny lydressurs i biblioteket og legges i scenen der
 * opptaket startet. Det kan trimmes etterpå uten at opptaket endres (klippets inn- og utpunkt).
 */
import { Circle, Loader2, Mic, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AUDIO_KIND_LABEL,
  AUDIO_TRACK_ORDER,
  blocksOfVariant,
  newId,
  type AudioKind,
  type ProjectState,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
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

/** Formatet nettleseren kan ta opp i (Chrome/Firefox: WebM, Safari: MP4). */
function recordingType(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const [mime, ext] of [
    ["audio/webm;codecs=opus", "webm"],
    ["audio/webm", "webm"],
    ["audio/mp4", "m4a"],
    ["audio/ogg;codecs=opus", "ogg"],
  ] as const)
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  return null;
}

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
}: {
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
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [take, setTake] = useState<{ blob: Blob; url: string; ext: string; atMs: number } | null>(
    null,
  );
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; started: number } | null>(
    null,
  );
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
  useEffect(() => {
    if (open) return;
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
      setError("Nettleseren kan ikke ta opp lyd. Prøv Chrome, Edge, Firefox eller Safari.");
      return;
    }
    setPhase("starting");
    const mine = session.current;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      setPhase("idle");
      setError(
        (e as Error).name === "NotAllowedError"
          ? "Nettleseren fikk ikke bruke mikrofonen. Tillat mikrofon for siden og prøv igjen."
          : `Fant ingen mikrofon (${(e as Error).message}).`,
      );
      return;
    }
    if (mine !== session.current) {
      // Vinduet ble lukket mens nettleseren spurte om mikrofonen
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: type.mime });
    const atMs = startMs;
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: type.mime.split(";")[0] ?? type.mime });
      if (blob.size === 0) {
        setPhase("idle");
        setError("Opptaket ble tomt.");
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
      const stamp = new Date().toLocaleString("nb-NO", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const title = name.trim() || `Opptak ${stamp}`;
      const file = new File([take.blob], `opptak.${take.ext}`, { type: take.blob.type });
      const made = await createSoundAsset(cmds, projectId, file, title);
      const clipId = newId<"audio_clip">();
      const r = await cmds.runAndWait(
        {
          type: "AddAudioClips",
          clips: [
            {
              clipId: clipId as never,
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
        `Lydopptak «${title}»`,
      );
      if (r.error) throw new Error(r.error);
      URL.revokeObjectURL(take.url);
      setTake(null);
      setPhase("idle");
      onAdded(clipId);
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
      setPhase("done");
    }
  }

  const busy = phase === "starting" || phase === "recording" || phase === "saving";
  const select =
    "h-8 min-w-0 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary disabled:opacity-50";
  const legend = "text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary";
  const at = (ms: number) => `${(Math.round(ms / 100) / 10).toLocaleString("nb-NO")} s`;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-[520px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>Lydopptak</DialogTitle>
          <DialogDescription>
            Opptaket starter {at(take?.atMs ?? startMs)} ut i scenen. Bruk hodetelefoner hvis scenen
            spilles av mens du tar opp.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span className={legend}>Spor</span>
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
            <span className={legend}>Replikk (valgfritt)</span>
            <select
              value={blockId}
              disabled={busy || lines.length === 0}
              onChange={(e) => setBlockId(e.target.value)}
              className={select}
            >
              <option value="">{lines.length ? "Ingen" : "Ingen replikker i scenen"}</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs text-text-secondary">
            <span className={legend}>Navn i biblioteket</span>
            <input
              value={name}
              disabled={phase === "saving"}
              maxLength={200}
              placeholder="Opptak (dato og tid)"
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
            Spill av scenen mens du tar opp
          </label>
        </div>

        <div className="flex items-center gap-3 rounded-sm border border-border bg-surface-1 p-3">
          {phase === "recording" ? (
            <>
              <Button variant="destructive" onClick={stop}>
                <Square className="fill-current" />
                Stopp
              </Button>
              <span className="flex items-center gap-1.5 text-[13px] tabular-nums text-status-danger">
                <Circle className="size-3 animate-pulse fill-current" aria-hidden />
                Tar opp … {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
              </span>
            </>
          ) : take ? (
            <>
              <audio src={take.url} controls className="h-8 min-w-0 flex-1" />
              <Button variant="ghost" size="sm" disabled={phase === "saving"} onClick={discard}>
                Forkast
              </Button>
            </>
          ) : (
            <Button onClick={() => void start()} disabled={phase === "starting"}>
              {phase === "starting" ? <Loader2 className="animate-spin" /> : <Mic />}
              Ta opp
            </Button>
          )}
        </div>

        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button disabled={!take || phase === "saving"} onClick={() => void save()}>
            {phase === "saving" ? <Loader2 className="animate-spin" /> : null}
            Legg i scenen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
