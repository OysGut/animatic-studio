/**
 * Justerbare paneler (DEC-0038): brukeren drar i rammen mellom paneler som ruller hver for seg.
 * Størrelsen huskes per panel i nettleseren (localStorage) og deles mellom alle visninger i økten,
 * så den står likt når brukeren går mellom manus, bibliotek og sceneeditor. Dobbeltklikk = standard.
 */
import { useCallback, useRef, useState, useSyncExternalStore } from "react";

const PREFIX = "animatic:pane:";
const cache = new Map<string, number>();
const listeners = new Set<() => void>();

function read(key: string): number | null {
  if (cache.has(key)) return cache.get(key)!;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    const n = raw === null ? NaN : Number(raw);
    if (Number.isFinite(n)) {
      cache.set(key, n);
      return n;
    }
  } catch {
    // Lagring kan være sperret (privat vindu): bruk standard
  }
  return null;
}

function write(key: string, value: number | null) {
  if (value === null) cache.delete(key);
  else cache.set(key, value);
  try {
    if (value === null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, String(Math.round(value)));
  } catch {
    // ignoreres – størrelsen gjelder da bare denne økten
  }
  for (const l of listeners) l();
}

let viewport = { w: 0, h: 0 };
let listening = false;

function subscribe(l: () => void) {
  listeners.add(l);
  if (!listening && typeof window !== "undefined") {
    listening = true;
    viewport = { w: window.innerWidth, h: window.innerHeight };
    window.addEventListener("resize", () => {
      viewport = { w: window.innerWidth, h: window.innerHeight };
      for (const x of listeners) x();
    });
    // Endret i en annen fane
    window.addEventListener("storage", (e) => {
      if (!e.key?.startsWith(PREFIX)) return;
      cache.delete(e.key.slice(PREFIX.length));
      for (const x of listeners) x();
    });
  }
  return () => {
    listeners.delete(l);
  };
}

/**
 * Lagret størrelse (piksler) for et panel. Serveren og første tegning bruker standardverdien (lik på
 * server og klient), deretter den lagrede. Et panel tar aldri mer enn `viewportShare` av vinduet, så
 * midtfeltet ikke forsvinner på en smal skjerm.
 */
export function usePaneSize(
  key: string,
  fallback: number,
  min: number,
  max: number,
  opts: { readonly axis?: "x" | "y"; readonly viewportShare?: number } = {},
) {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const vp = useSyncExternalStore(
    subscribe,
    () => (opts.axis === "y" ? viewport.h : viewport.w),
    () => 0,
  );
  const share = opts.viewportShare ?? 0.35;
  const limit = vp > 0 ? Math.max(min, Math.floor(vp * share)) : max;
  const clamp = useCallback((n: number) => Math.min(max, Math.max(min, n)), [min, max]);
  const size = Math.min(limit, clamp(stored ?? fallback));
  const set = useCallback(
    (n: number | null) => write(key, n === null ? null : clamp(n)),
    [key, clamp],
  );
  return [size, set] as const;
}

/**
 * Håndtaket i rammen. `edge` sier hvilken kant av panelet det sitter på: «right» = panelet er til venstre
 * og blir bredere når man drar mot høyre; «left» = panelet er til høyre; «top» = panelet er under (høyde).
 * Plasseres inne i et element med `position: relative`.
 */
export function PaneResizer({
  edge,
  size,
  onSize,
  min,
  max,
  label,
}: {
  edge: "left" | "right" | "top";
  size: number;
  onSize: (n: number | null) => void;
  min: number;
  max: number;
  label: string;
}) {
  const start = useRef<{ pos: number; size: number } | null>(null);
  const [active, setActive] = useState(false);
  const horizontal = edge !== "top";
  const sign = edge === "right" ? 1 : -1;
  const pos = (e: { clientX: number; clientY: number }) => (horizontal ? e.clientX : e.clientY);
  const place =
    edge === "right"
      ? "right-[-3px] top-0 h-full w-[6px] cursor-col-resize"
      : edge === "left"
        ? "left-[-3px] top-0 h-full w-[6px] cursor-col-resize"
        : "left-0 top-[-3px] h-[6px] w-full cursor-row-resize";
  return (
    <div
      role="separator"
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuenow={Math.round(size)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${label} – dra for å endre, dobbeltklikk for standard`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { pos: pos(e), size };
        setActive(true);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        onSize(s.size + sign * (pos(e) - s.pos));
      }}
      onPointerUp={(e) => {
        start.current = null;
        setActive(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        start.current = null;
        setActive(false);
      }}
      onLostPointerCapture={() => {
        start.current = null;
        setActive(false);
      }}
      onDoubleClick={() => onSize(null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10;
        const grow = horizontal ? (edge === "right" ? "ArrowRight" : "ArrowLeft") : "ArrowUp";
        const shrink = horizontal ? (edge === "right" ? "ArrowLeft" : "ArrowRight") : "ArrowDown";
        if (e.key === grow) onSize(size + step);
        else if (e.key === shrink) onSize(size - step);
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
      className={
        "absolute z-20 touch-none select-none outline-none transition-colors " +
        place +
        (active
          ? " bg-accent-brand/60"
          : " hover:bg-accent-brand/40 focus-visible:bg-accent-brand/40")
      }
    />
  );
}
