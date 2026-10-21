/** Frame-based labels shared by animation and the later rhythm engine. */
import { validateFps, type Rational } from "../time";

export function formatFrameGap(frames: number, fps: Rational): string {
  validateFps(fps);
  const count = Math.abs(Math.trunc(frames));
  if (!count) return "";
  const base = Math.round(fps.num / fps.den);
  if (count < base) return `${count} f`;
  const seconds = Math.floor(count / base);
  const remainder = count % base;
  return `${seconds} s${remainder ? ` ${String(remainder).padStart(2, "0")} f` : ""}`;
}

/** Non-drop-frame display, with unbounded minutes rather than an hour field. */
export function formatAnimationTime(frames: number, fps: Rational): string {
  validateFps(fps);
  const base = Math.round(fps.num / fps.den);
  const count = Math.max(0, Math.trunc(frames));
  const seconds = Math.floor(count / base);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}:${String(count % base).padStart(2, "0")}`;
}

export function clampAnimationWindow(from: number, span: number, duration: number) {
  const length = Math.min(Math.max(1, duration), Math.max(1, Math.round(span)));
  return { from: Math.min(Math.max(0, Math.round(from)), Math.max(0, duration - length)), span: length };
}

/** Nice ruler steps in project frames; labels are aligned to the scene origin. */
export function animationRuler(from: number, span: number, fps: Rational, width: number) {
  validateFps(fps);
  const rate = fps.num / fps.den;
  const desired = span / Math.max(1, Math.floor(width / 88));
  const choices = [...[1, 2, 5, 10].filter(f => f < rate), ...[1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].map(s => Math.round(s * rate))];
  let step = choices.find(s => s >= desired) ?? Math.round(3600 * rate);
  while (step < desired) step *= 2;
  const subsecond = step < rate;
  const ticks = [];
  for (let frame = Math.ceil(from / step) * step; frame < from + span; frame += step) {
    const text = formatAnimationTime(frame, fps);
    ticks.push({ frame, label: subsecond ? text : text.slice(0, text.lastIndexOf(":")) });
  }
  const minor = span / Math.max(1, width) <= 0.15 ? 1 : 0;
  const frames = [];
  if (minor) for (let f = Math.ceil(from); f < from + span; f++) frames.push(f);
  return { step, ticks, frames };
}

/** Navigator edge drags keep the opposite edge fixed. */
export function resizeAnimationWindow(from: number, span: number, delta: number, edge: "from" | "to", duration: number) {
  const end = from + span;
  if (edge === "from") {
    const start = Math.max(0, Math.min(end - 1, Math.round(from + delta)));
    return clampAnimationWindow(start, end - start, duration);
  }
  return clampAnimationWindow(from, Math.max(1, Math.min(duration - from, Math.round(span + delta))), duration);
}

/**
 * B-100: when the scene length changes (RetimeScene, rhythm tool), a window that
 * covered the whole scene keeps covering it; other windows are only clamped.
 */
export function followWindowLength(view: { from: number; span: number }, prevDuration: number, nextDuration: number) {
  if (view.from <= 0 && view.span >= prevDuration) return { from: 0, span: Math.max(1, nextDuration) };
  return clampAnimationWindow(view.from, view.span, nextDuration);
}

/** B-100: a play range that ran to the old end follows the new end; null stays null. */
export function followRangeLength(range: { from: number; to: number } | null, prevDuration: number, nextDuration: number) {
  if (!range) return null;
  const last = Math.max(0, nextDuration - 1);
  const to = range.to >= prevDuration - 1 ? last : Math.min(range.to, last);
  const from = Math.min(range.from, to);
  return from === 0 && to === last ? null : { from, to };
}
