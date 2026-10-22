import type { Rational } from "../time";

export type CaptureMode = "ones" | "twos" | "custom";
export interface CaptureSettings {
  readonly mode: CaptureMode;
  readonly fps: Rational;
}
export const DEFAULT_CAPTURE: CaptureSettings = { mode: "ones", fps: { num: 24, den: 1 } };
export function projectCodeValid(code: string | null): boolean {
  return code === null || /^[A-Z0-9-]{1,32}$/.test(code);
}
export function suggestProjectCode(name: string): string {
  return name.toUpperCase().replace(/Æ/g, "AE").replace(/Ø/g, "OE").replace(/Å/g, "AA")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/g, "") || "PROJECT";
}
export function captureSettingsValid(c: CaptureSettings): boolean {
  return ["ones", "twos", "custom"].includes(c.mode) && Number.isInteger(c.fps.num)
    && Number.isInteger(c.fps.den) && c.fps.num > 0 && c.fps.num <= 120000
    && c.fps.den > 0 && c.fps.den <= 10000 && c.fps.num / c.fps.den <= 120
    && (c.mode === "custom" || (c.fps.den === 1 && c.fps.num === (c.mode === "ones" ? 24 : 12)));
}
/** Twelve captures on twos remain a 24 fps editorial timeline. */
export function captureTimeline(c: CaptureSettings): { fps: Rational; exposureStep: number } {
  return c.mode === "twos" ? { fps: { num: 24, den: 1 }, exposureStep: 2 } : { fps: c.fps, exposureStep: 1 };
}