/**
 * Avspilling av lyd sammen med bildet (M4 del 2, DEC-0044). Lyden startes på nytt fra riktig sted når
 * avspillingen starter, når man hopper (ny plassering eller løkke) og når lyden endres. Lyd spilles også i
 * scener uten 2D-scene (tittelkort).
 */
import { useEffect, useRef, useState } from "react";
import type { AudioKind, FilmAudioItem } from "@/core";
import { AudioBank, scheduleAudio, scheduleOne } from "@/engine/audio/mixer";

const listeners = new Set<() => void>();
/** Felles lager av dekodet lyd for monteringen, sceneeditoren og eksporten. */
export const audioBank = new AudioBank(() => {
  for (const l of listeners) l();
});

/** Øker når en lydfil er ferdig dekodet (for bølgeformer). */
export function useAudioLoaded(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return tick;
}

interface Session {
  startAt: number;
  from: number;
  sources: AudioBufferSourceNode[];
  /** Klippene som er lagt inn (resten venter på at lydfilen dekodes). */
  scheduled: Set<string>;
}

/** Hvor langt lyden kan gli fra bildet før den startes på nytt (s). */
const MAX_DRIFT = 0.25;

export function useAudioPlayback({
  items,
  urls,
  playing,
  time,
  mutedKinds,
  mutedClipIds,
  previewBuffers,
  clock,
}: {
  items: readonly FilmAudioItem[];
  /** Mediesti → lenke for lydfilene. */
  urls: Readonly<Record<string, string>> | null;
  playing: boolean;
  /** Avspillingshodet (s). */
  time: number;
  mutedKinds?: ReadonlySet<AudioKind>;
  /** Klipp som er dempet bare i denne avspillingen (Asset Studio, forhåndslytting). Lagres aldri. */
  mutedClipIds?: ReadonlySet<string>;
  /** Lokale, ferdige mikser for forhåndslytting. Ingen opplasting eller deling via audioBank. */
  previewBuffers?: ReadonlyMap<string, AudioBuffer> | undefined;
  /** REQ-0210 (N2): fylles med avspillingshodet etter lydklokken, så bildet kan følge lyden. */
  clock?: { current: (() => number | null) | null };
}) {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const session = useRef<Session | null>(null);
  const loaded = useAudioLoaded();
  const latest = useRef({ items, mutedKinds, mutedClipIds, time });
  latest.current = { items, mutedKinds, mutedClipIds, time };

  if (clock)
    clock.current = () => {
      const s = session.current;
      const ctx = ctxRef.current;
      // Bare når lyden faktisk spilles: konteksten går, og minst én kilde er lagt inn
      if (!s || !ctx || ctx.state !== "running" || s.sources.length === 0) return null;
      return s.from + Math.max(0, ctx.currentTime - s.startAt);
    };

  // Last lydfilene på forhånd
  useEffect(() => {
    if (urls) void audioBank.loadAll(urls);
  }, [urls]);

  function stop() {
    const s = session.current;
    session.current = null;
    if (!s) return;
    for (const src of s.sources)
      try {
        src.stop();
        src.disconnect();
      } catch {
        // allerede stoppet
      }
  }

  function start(from: number) {
    stop();
    let ctx = ctxRef.current;
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: "interactive" });
      ctxRef.current = ctx;
      masterRef.current = ctx.createGain();
      masterRef.current.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    const startAt = ctx.currentTime + 0.04;
    const { items: list, mutedKinds: muted, mutedClipIds: mutedClips } = latest.current;
    const sources = scheduleAudio(ctx, masterRef.current!, list, audioBank, {
      from,
      startAt,
      ...(muted ? { mutedKinds: muted } : {}),
      ...(mutedClips ? { mutedClipIds: mutedClips } : {}),
      ...(previewBuffers ? { previewBuffers } : {}),
    });
    const scheduled = new Set(
      list
        .filter((it) => previewBuffers?.has(it.clip.id) || (it.version && audioBank.get(it.version.mediaPath)))
        .map((it) => it.clip.id),
    );
    session.current = { startAt, from, sources, scheduled };
  }

  /** Legg inn klipp der lydfilen er blitt dekodet etter starten (uten å starte resten på nytt). */
  function addLoaded() {
    const s = session.current;
    const ctx = ctxRef.current;
    if (!s || !ctx || !masterRef.current) return;
    const { items: list, mutedKinds: muted, mutedClipIds: mutedClips } = latest.current;
    for (const it of list) {
      if (s.scheduled.has(it.clip.id) || !it.version) continue;
      const buf = previewBuffers?.get(it.clip.id) ?? audioBank.get(it.version.mediaPath);
      if (!buf) continue;
      s.scheduled.add(it.clip.id);
      if (it.clip.muted || muted?.has(it.clip.kind) || mutedClips?.has(it.clip.id)) continue;
      const src = scheduleOne(ctx, masterRef.current, it, buf, {
        from: s.from,
        startAt: s.startAt,
      });
      if (src) s.sources.push(src);
    }
  }

  // Start/stopp, og ny start når lyden eller dempingen endres
  useEffect(() => {
    if (!playing) {
      stop();
      return;
    }
    // Bildet bestemmer tiden; lyden følger
    start(latest.current.time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, items, mutedKinds, mutedClipIds, previewBuffers]);

  // En lydfil er ferdig dekodet under avspilling: legg bare den inn
  useEffect(() => {
    if (playing) addLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Hopp (klikk i tidslinjen, løkke): bildet og lyden er ikke lenger sammen
  useEffect(() => {
    const s = session.current;
    const ctx = ctxRef.current;
    if (!playing || !s || !ctx) return;
    const expected = s.from + (ctx.currentTime - s.startAt);
    if (Math.abs(time - expected) > MAX_DRIFT) start(time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, playing]);

  useEffect(
    () => () => {
      stop();
      void ctxRef.current?.close();
      ctxRef.current = null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}
