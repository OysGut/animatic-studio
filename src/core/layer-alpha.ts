/** Pure export choices and scene planning. No media or browser APIs. */
import { L } from "./i18n";
import { filmClips } from "./assembly/film";
import { layersOf } from "./composition";
import type { Composition, ProjectState } from "./model";
import type { FilmClip } from "./assembly/film";

export interface AlphaExportSettings {
  readonly layerIds: readonly string[];
  readonly range: "scene" | "in-out";
  readonly inFrame: number;
  readonly outFrame: number;
  readonly effects: boolean;
  readonly alpha: "straight" | "premultiplied";
  readonly format: "png-seq" | "webm-vp9";
}
export const DEFAULT_ALPHA_SETTINGS: AlphaExportSettings = {
  layerIds: [], range: "scene", inFrame: 0, outFrame: 1,
  effects: true, alpha: "straight", format: "png-seq",
};
export function isAlphaSettings(v: unknown): v is AlphaExportSettings {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o["layerIds"]) && o["layerIds"].every(id => typeof id === "string") &&
    (o["range"] === "scene" || o["range"] === "in-out") &&
    Number.isInteger(o["inFrame"]) && Number.isInteger(o["outFrame"]) &&
    typeof o["effects"] === "boolean" && (o["alpha"] === "straight" || o["alpha"] === "premultiplied") &&
    (o["format"] === "png-seq" || o["format"] === "webm-vp9");
}
export function alphaRange(c: Composition, o: AlphaExportSettings) {
  return o.range === "scene" ? { start: 0, end: c.durationFrames } : { start: o.inFrame, end: o.outFrame };
}
export function alphaExportError(s: ProjectState, c: Composition, o: AlphaExportSettings): string | null {
  const r = alphaRange(c, o);
  if (!Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 0 || r.end > c.durationFrames || r.start >= r.end)
    return L("Velg et gyldig inn/ut-område innenfor scenen.", "Choose a valid in/out range within the scene.");
  const layers = layersOf(s, c.id);
  if (!o.layerIds.length || o.layerIds.some(id => !layers.some(l => l.id === id)))
    return L("Velg minst ett lag fra denne scenen.", "Select at least one layer from this scene.");
  return null;
}
/** A composition export intentionally uses the 2D source, not an active imported take. */
export function alphaSceneClip(s: ProjectState, c: Composition): FilmClip | null {
  const clip = Object.values(s.productions).flatMap(p => filmClips(s, p.id))
    .find(it => it.compositionId === c.id);
  if (!clip) return null;
  return { ...clip, source: "composition", take: null, startFrame: 0,
    durationFrames: c.durationFrames, overlapFrames: 0, transition: { kind: "cut", frames: 0 },
    parts: [{ id: null, source: "composition", take: null, startFrame: 0,
      durationFrames: c.durationFrames, inFrame: 0, inMs: 0, outMs: 0 }] };
}
export function alphaLayerIds(s: ProjectState, c: Composition, ids: readonly string[]): ReadonlySet<string> {
  const out = new Set(ids);
  for (const l of layersOf(s, c.id)) if (l.groupId && out.has(l.groupId)) out.add(l.id);
  return out;
}
export function alphaFileBase(scene: string, layers: readonly string[], start: number, end: number): string {
  const safe = (v: string) => v.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim().slice(0, 100);
  return `${safe(scene)} - ${safe(layers.join(" + "))} - f${start}-${end}`;
}
/** Canvas pixels are straight RGBA. Change RGB only; never change alpha. */
export function alphaPixels(px: Uint8ClampedArray, mode: AlphaExportSettings["alpha"]): Uint8ClampedArray {
  if (mode === "straight") return px;
  const out = new Uint8ClampedArray(px);
  for (let i = 0; i < out.length; i += 4) {
    const a = (out[i + 3] ?? 0) / 255;
    for (let k = 0; k < 3; k++) out[i + k] = Math.round((out[i + k] ?? 0) * a);
  }
  return out;
}