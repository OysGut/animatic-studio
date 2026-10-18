/**
 * Avspilling i sceneeditoren (mandat 14.1, DEC-0036): gjeldende bilde, spill/pause og løkke.
 * Tiden styres av klokka (performance.now), så avspillingen holder takten selv om tegningen er treg.
 * Med `range` spilles bare et område (Asset Studio AS2: objektets aktive område), med løkke innenfor.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Rational } from "@/core";

export interface Playback {
  readonly frame: number;
  readonly playing: boolean;
  readonly loop: boolean;
  setFrame: (f: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setLoop: (on: boolean) => void;
}

/** Området som spilles: første og siste bilde (inkludert), innenfor varigheten. */
export function playRange(
  durationFrames: number,
  range?: { readonly from: number; readonly to: number } | null,
): { first: number; last: number } {
  const end = Math.max(0, durationFrames - 1);
  if (!range) return { first: 0, last: end };
  const first = Math.min(end, Math.max(0, Math.round(range.from)));
  return { first, last: Math.min(end, Math.max(first, Math.round(range.to))) };
}

export function usePlayback(
  durationFrames: number,
  fps: Rational,
  initialLoop = true,
  range?: { readonly from: number; readonly to: number } | null,
): Playback {
  const [frame, setFrameState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(initialLoop);
  const { first, last: rangeLast } = playRange(durationFrames, range);
  const last = Math.max(0, durationFrames - 1);
  const start = useRef<{ t: number; frame: number } | null>(null);
  const frameRef = useRef(0);
  frameRef.current = frame;

  const setFrame = useCallback(
    (f: number) => {
      const v = Math.min(last, Math.max(0, Math.round(f)));
      setFrameState(v);
      if (start.current) start.current = { t: performance.now(), frame: v };
    },
    [last],
  );

  // Hold bildet innenfor varigheten når den endres
  useEffect(() => {
    setFrameState((f) => Math.min(f, last));
  }, [last]);

  useEffect(() => {
    if (!playing) {
      start.current = null;
      return;
    }
    let raf = 0;
    const perMs = fps.num / fps.den / 1000;
    const cur = frameRef.current;
    const from = cur >= rangeLast || cur < first ? first : cur;
    start.current = { t: performance.now(), frame: from };
    setFrameState(from);
    const span = rangeLast - first + 1;
    const tick = (now: number) => {
      const s = start.current;
      if (s) {
        let f = s.frame + Math.floor((now - s.t) * perMs);
        if (f > rangeLast) {
          if (loop && span > 1) {
            f = first + ((f - first) % span);
            start.current = { t: now - (f - first) / perMs, frame: first };
          } else {
            setFrameState(rangeLast);
            setPlaying(false);
            return;
          }
        }
        setFrameState((old) => (old === f ? old : f));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, first, rangeLast, loop, fps.num, fps.den]);

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => setPlaying((p) => !p), []);
  return { frame, playing, loop, setFrame, play, pause, toggle, setLoop };
}
