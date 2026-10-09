/**
 * Avspilling i sceneeditoren (mandat 14.1, DEC-0036): gjeldende bilde, spill/pause og løkke.
 * Tiden styres av klokka (performance.now), så avspillingen holder takten selv om tegningen er treg.
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

export function usePlayback(durationFrames: number, fps: Rational): Playback {
  const [frame, setFrameState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
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
    const from = frameRef.current >= last ? 0 : frameRef.current;
    start.current = { t: performance.now(), frame: from };
    setFrameState(from);
    const tick = (now: number) => {
      const s = start.current;
      if (s) {
        let f = s.frame + Math.floor((now - s.t) * perMs);
        if (f > last) {
          if (loop && last > 0) {
            f = f % (last + 1);
            start.current = { t: now - f / perMs, frame: 0 };
          } else {
            setFrameState(last);
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
  }, [playing, last, loop, fps.num, fps.den]);

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => setPlaying((p) => !p), []);
  return { frame, playing, loop, setFrame, play, pause, toggle, setLoop };
}
