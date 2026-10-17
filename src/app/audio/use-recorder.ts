/**
 * Lydopptak med nettleserens mikrofon (fase 2, bolk B, REQ-0686/0687): brukt både på datamaskinen og på
 * mobilsiden. Chrome/Firefox tar opp WebM/Opus, Safari (også iPhone) MP4/AAC. Mikrofonen slås av når
 * opptaket stopper eller komponenten forsvinner.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { L } from "@/core";

/** Formatet nettleseren kan ta opp i. */
export function recordingType(): { mime: string; ext: string } | null {
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

export interface Recording {
  readonly id: string;
  readonly blob: Blob;
  /** Lokal avspillingsadresse (frigis av den som eier opptaket). */
  readonly url: string;
  readonly ext: string;
  readonly mime: string;
  readonly durationMs: number;
  /** Ren romlyd (REQ-0690). */
  readonly roomTone: boolean;
}

type Phase = "idle" | "starting" | "recording";

export function useRecorder() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [ms, setMs] = useState(0);
  const [roomToneNow, setRoomToneNow] = useState(false);
  const rec = useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    started: number;
    roomTone: boolean;
    done: (r: Recording | null) => void;
  } | null>(null);
  const generation = useRef(0);

  const release = useCallback(() => {
    const r = rec.current;
    rec.current = null;
    if (!r) return;
    r.recorder.ondataavailable = null;
    r.recorder.onstop = null;
    if (r.recorder.state !== "inactive") r.recorder.stop();
    r.stream.getTracks().forEach((t) => t.stop());
    r.done(null);
  }, []);

  useEffect(
    () => () => {
      generation.current++;
      release();
    },
    [release],
  );

  useEffect(() => {
    if (phase !== "recording") return;
    const id = window.setInterval(() => {
      const r = rec.current;
      if (r) setMs(performance.now() - r.started);
    }, 200);
    return () => window.clearInterval(id);
  }, [phase]);

  /**
   * Starter opptaket. Løftet løses når opptaket stoppes (med opptaket) eller avbrytes (null). Gir null med en
   * gang når mikrofonen ikke kan brukes (feilen står i `error`).
   */
  const start = useCallback(
    async (opts: { roomTone?: boolean } = {}): Promise<Promise<Recording | null> | null> => {
      setError(null);
      const type = recordingType();
      if (!type) {
        setError(
          L(
            "Nettleseren kan ikke ta opp lyd. Prøv Chrome, Edge, Firefox eller Safari.",
            "The browser cannot record audio. Try Chrome, Edge, Firefox or Safari.",
          ),
        );
        return null;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          L(
            "Mikrofonen kan bare brukes på en sikker adresse (https).",
            "The microphone can only be used on a secure address (https).",
          ),
        );
        return null;
      }
      setPhase("starting");
      const mine = ++generation.current;
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (e) {
        setPhase("idle");
        setError(
          (e as Error).name === "NotAllowedError"
            ? L(
                "Nettleseren fikk ikke bruke mikrofonen. Tillat mikrofon for siden og prøv igjen.",
                "The browser was not allowed to use the microphone. Allow microphone access for the page and try again.",
              )
            : L(
                `Fant ingen mikrofon (${(e as Error).message}).`,
                `No microphone found (${(e as Error).message}).`,
              ),
        );
        return null;
      }
      if (mine !== generation.current) {
        stream.getTracks().forEach((t) => t.stop());
        return null;
      }
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, { mimeType: type.mime });
      const started = performance.now();
      const roomTone = !!opts.roomTone;
      const result = new Promise<Recording | null>((resolve) => {
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunks.push(ev.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          rec.current = null;
          setPhase("idle");
          const mime = type.mime.split(";")[0] ?? type.mime;
          const blob = new Blob(chunks, { type: mime });
          if (blob.size === 0) {
            setError(L("Opptaket ble tomt.", "The recording is empty."));
            resolve(null);
            return;
          }
          resolve({
            id: crypto.randomUUID(),
            blob,
            url: URL.createObjectURL(blob),
            ext: type.ext,
            mime,
            durationMs: Math.max(1, Math.round(performance.now() - started)),
            roomTone,
          });
        };
        rec.current = { recorder, stream, started, roomTone, done: resolve };
      });
      recorder.start(250);
      setMs(0);
      setRoomToneNow(roomTone);
      setPhase("recording");
      return result;
    },
    [],
  );

  const stop = useCallback(() => {
    const r = rec.current;
    if (r && r.recorder.state !== "inactive") r.recorder.stop();
  }, []);

  return {
    phase,
    error,
    /** Tid tatt opp så langt (ms). */
    ms,
    /** Tar opp ren romlyd nå. */
    roomTone: roomToneNow,
    start,
    stop,
    /** Avbryt uten å lage opptak. */
    cancel: release,
  };
}
