/**
 * Avspilling i sceneeditoren (mandat 14.1, DEC-0036): gjeldende bilde, spill/pause og løkke.
 * Tiden styres av klokka (performance.now), så avspillingen holder takten selv om tegningen er treg.
 * Med `range` spilles bare et område (Asset Studio AS2: objektets aktive område), med løkke innenfor.
 * Med `clock` (REQ-0210, N2) følger bildet lydklokken når lyd spilles, så bilde og lyd ikke får hver sin
 * startforsinkelse. Uten lyd (klokken gir null) brukes performance.now som før.
 */
import { createElement, Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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
  /** N8: gjeldende bilde som liten store; bare delene som abonnerer, tegnes på nytt per bilde. */
  readonly store: FrameStore;
}

/** N8: lite lager for gjeldende bilde (abonnement med selector, se useFrame/FrameValue). */
export interface FrameStore {
  get: () => number;
  set: (f: number | ((old: number) => number)) => void;
  subscribe: (fn: () => void) => () => void;
}

export function createFrameStore(initial = 0): FrameStore {
  let v = initial;
  const subs = new Set<() => void>();
  return {
    get: () => v,
    set: (f) => {
      const n = typeof f === "function" ? f(v) : f;
      if (n === v) return;
      v = n;
      for (const s of [...subs]) s();
    },
    subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}

/** Abonnerer på bildet (eller en verdi avledet av det); komponenten tegnes bare når verdien endres. */
export function useFrame(p: { readonly store: FrameStore }): number;
export function useFrame<T>(p: { readonly store: FrameStore }, select: (f: number) => T): T;
export function useFrame<T>(p: { readonly store: FrameStore }, select?: (f: number) => T): T | number {
  const { store } = p;
  const get = () => (select ? select(store.get()) : store.get());
  return useSyncExternalStore(store.subscribe, get, get);
}

/** Render-prop som abonnerer på bildet, så foreldrekomponenten slipper å tegnes per bilde. */
export function FrameValue<T = number>({ playback, select, children }: {
  playback: { readonly store: FrameStore };
  select?: (f: number) => T;
  children: (v: T) => ReactNode;
}) {
  const v = useFrame(playback, select ?? ((f: number) => f as unknown as T));
  return createElement(Fragment, null, children(v));
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

/** Som usePlaybackStore, men komponenten abonnerer på bildet (tegnes per bilde). */
export function usePlayback(
  durationFrames: number,
  fps: Rational,
  initialLoop = true,
  range?: { readonly from: number; readonly to: number } | null,
  clock?: { readonly current: (() => number | null) | null },
): Playback {
  const p = usePlaybackStore(durationFrames, fps, initialLoop, range, clock);
  const frame = useFrame(p);
  // Nytt objekt per bilde, som før N8, så barn som sammenligner props fortsatt får bildet
  return useMemo(() => ({ ...p, frame }), [p, frame]);
}

/**
 * N8: avspilling uten abonnement. `frame` leses fra lageret når den brukes (riktig i tilbakekall),
 * men komponenten tegnes ikke på nytt når bildet endres; bruk useFrame/FrameValue der bildet vises.
 */
export function usePlaybackStore(
  durationFrames: number,
  fps: Rational,
  initialLoop = true,
  range?: { readonly from: number; readonly to: number } | null,
  /** Avspillingshodet i sekunder etter lydklokken, eller null når ingen lyd spilles. */
  clock?: { readonly current: (() => number | null) | null },
): Playback {
  const [store] = useState(() => createFrameStore(0));
  const setFrameState = store.set;
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(initialLoop);
  const { first, last: rangeLast } = playRange(durationFrames, range);
  const last = Math.max(0, durationFrames - 1);
  const start = useRef<{ t: number; frame: number } | null>(null);

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
  }, [last, setFrameState]);

  useEffect(() => {
    if (!playing) {
      start.current = null;
      return;
    }
    let raf = 0;
    const perMs = fps.num / fps.den / 1000;
    const cur = store.get();
    const from = cur >= rangeLast || cur < first ? first : cur;
    start.current = { t: performance.now(), frame: from };
    setFrameState(from);
    const span = rangeLast - first + 1;
    const tick = (now: number) => {
      const s = start.current;
      if (s) {
        const ext = clock?.current?.() ?? null;
        // Lydklokken bestemmer bildet; perioden følger med, så overgangen tilbake til klokka er sømløs
        if (ext !== null) start.current = { t: now - ext * 1000, frame: 0 };
        const c = start.current ?? s;
        let f = c.frame + Math.floor((now - c.t) * perMs + 1e-6);
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
  }, [playing, first, rangeLast, loop, fps.num, fps.den, clock, store]);

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => setPlaying((p) => !p), []);
  return useMemo(
    () => ({ get frame() { return store.get(); }, playing, loop, setFrame, play, pause, toggle, setLoop, store }),
    [store, playing, loop, setFrame, play, pause, toggle],
  );
}
