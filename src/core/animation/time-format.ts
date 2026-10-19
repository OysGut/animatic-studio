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
