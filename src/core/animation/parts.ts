/** CA4: compact non-destructive vector parts, independent of any rendering platform. */
import { isUuid } from "../ids";
import type { RelativePoint } from "./rig";
import { t as tk } from "@/core/i18n/keyed";
export const VISEMES = ["A", "B", "C", "D", "E", "F", "G", "H", "X"] as const;
export type Viseme = typeof VISEMES[number];
export const PART_SLOTS = [...VISEMES.map(v => `mouth:${v}`), "eye:left:open", "eye:left:closed", "eye:right:open", "eye:right:closed", "head", "nose"] as const;
export type PartSlot = string;
export interface VectorStroke { readonly points: readonly RelativePoint[]; readonly radius: number; readonly feather: number; readonly mode: "add" | "subtract" }
export interface PartAdjustments { readonly brightness: number; readonly contrast: number; readonly saturation: number; readonly hue: number; readonly opacity: number }
export interface RigPart {
  readonly versionId: string | null;
  readonly mobileImportId?: string;
  readonly drawing: readonly VectorStroke[];
  readonly mask: readonly VectorStroke[];
  /** Relative to the source image, offset from the named face anchor. */
  readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rotation: number;
  readonly adjustments: PartAdjustments;
}
export const DEFAULT_ADJUSTMENTS: PartAdjustments = { brightness: 1, contrast: 1, saturation: 1, hue: 0, opacity: 1 };
export function emptyRigPart(): RigPart { return { versionId: null, drawing: [], mask: [], x: 0, y: 0, width: .2, height: .1, rotation: 0, adjustments: { ...DEFAULT_ADJUSTMENTS } }; }
export function isPartSlot(v: unknown): v is PartSlot { return typeof v === "string" && (PART_SLOTS as readonly string[]).includes(v); }
export function strokesError(strokes: readonly VectorStroke[]): string | null {
  if (!Array.isArray(strokes) || strokes.length > 2048) return tk("core-animation-parts.strokes-error.message.e24368e91a18");
  for (const s of strokes) {
    if (!s || !["add", "subtract"].includes(s.mode) || !Number.isFinite(s.radius) || s.radius <= 0 || s.radius > 1 || !Number.isFinite(s.feather) || s.feather < 0 || s.feather > 1 || !Array.isArray(s.points) || !s.points.length || s.points.length > 4096 || s.points.some((p: RelativePoint) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return tk("core-animation-parts.strokes-error.message.cf771f661268");
  }
  return null;
}
export function rigPartError(p: RigPart): string | null {
  if (!p || (p.mobileImportId !== undefined && !isUuid(p.mobileImportId)) || (p.versionId !== null && !isUuid(p.versionId)) || strokesError(p.drawing) || strokesError(p.mask)) return tk("core-animation-parts.rig-part-error.message.94b0b6bd314b");
  if (![p.x, p.y, p.width, p.height, p.rotation].every(Number.isFinite) || Math.abs(p.x) > 2 || Math.abs(p.y) > 2 || p.width <= 0 || p.width > 4 || p.height <= 0 || p.height > 4 || Math.abs(p.rotation) > 360) return tk("core-animation-parts.rig-part-error.message.893787a526dd");
  const a = p.adjustments;
  if (!a || ![a.brightness, a.contrast, a.saturation, a.hue, a.opacity].every(Number.isFinite) || a.brightness < 0 || a.brightness > 3 || a.contrast < 0 || a.contrast > 3 || a.saturation < 0 || a.saturation > 3 || Math.abs(a.hue) > 180 || a.opacity < 0 || a.opacity > 1) return tk("core-animation-parts.rig-part-error.message.9d6336a9b425");
  return null;
}
/** Coverage of the ordered add/subtract strokes; useful for hit-testing and platform-independent tests. */
export function maskCoverage(strokes: readonly VectorStroke[], p: RelativePoint): number {
  let alpha = 1;
  for (const s of strokes) {
    let distance = Infinity;
    for (let i = 0; i < s.points.length; i++) {
      const b = s.points[i]; if (!b) continue;
      const a = s.points[Math.max(0, i - 1)] ?? b;
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      distance = Math.min(distance, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
    }
    const inner = s.radius * (1 - s.feather);
    const coverage = distance >= s.radius ? 0 : distance <= inner ? 1 : Math.max(0, 1 - (distance - inner) / (s.radius - inner || 1));
    alpha = s.mode === "add" ? alpha + (1 - alpha) * coverage : alpha * (1 - coverage);
  }
  return alpha;
}
export const SHEET_COLUMNS = 3;
export const SHEET_CELL = 320;
export function sheetCells(slots: readonly string[] = PART_SLOTS) { return slots.map((slot, i) => ({ slot, x: i % SHEET_COLUMNS * SHEET_CELL, y: Math.floor(i / SHEET_COLUMNS) * SHEET_CELL, width: SHEET_CELL, height: SHEET_CELL })); }
export function visemeExample(v: Viseme): string {
  const examples: Record<Viseme, string> = { A: "P / B / M", B: "K / S / T", C: "EH / AE", D: "AA", E: tk("core-animation-parts.e.e.866639f68389"), F: "UW / OW", G: "F / V", H: "L", X: "—" };
  return examples[v];
}
