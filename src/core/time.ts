/**
 * Tidsmodell (ADR-0006, mandat 6.4): heltall bilder og rasjonell bildefrekvens.
 * Absolutt filmtid lagres aldri; den beregnes fra aktiv rekkefølge.
 */

export interface Rational {
  readonly num: number;
  readonly den: number;
}

export const FPS_24: Rational = { num: 24, den: 1 };
export const FPS_25: Rational = { num: 25, den: 1 };
export const FPS_23_976: Rational = { num: 24000, den: 1001 };

export function validateFps(fps: Rational): void {
  if (!Number.isInteger(fps.num) || !Number.isInteger(fps.den) || fps.num <= 0 || fps.den <= 0) {
    throw new Error(`Ugyldig bildefrekvens ${fps.num}/${fps.den}`);
  }
}

export function fpsToNumber(fps: Rational): number {
  return fps.num / fps.den;
}

/** Sekunder → nærmeste hele bilde (avrunding: nærmeste, halvveis opp). */
export function secondsToFrames(seconds: number, fps: Rational): number {
  validateFps(fps);
  return Math.round((seconds * fps.num) / fps.den);
}

export function framesToSeconds(frames: number, fps: Rational): number {
  validateFps(fps);
  return (frames * fps.den) / fps.num;
}

/** Konverter bildeantall mellom to bildefrekvenser (nærmeste bilde). */
export function convertFrames(frames: number, from: Rational, to: Rational): number {
  validateFps(from);
  validateFps(to);
  return Math.round((frames * from.den * to.num) / (from.num * to.den));
}

/** Tidskode HH:MM:SS:FF uten drop-frame (visning). */
export function formatTimecode(frames: number, fps: Rational): string {
  validateFps(fps);
  const base = Math.round(fps.num / fps.den);
  const sign = frames < 0 ? "-" : "";
  let f = Math.abs(Math.trunc(frames));
  const ff = f % base;
  f = Math.floor(f / base);
  const ss = f % 60;
  f = Math.floor(f / 60);
  const mm = f % 60;
  const hh = Math.floor(f / 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${sign}${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`;
}
