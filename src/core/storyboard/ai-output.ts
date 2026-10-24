/** SB-7 output policy and instruction-free render plan. Browser rasterization stays in adapters. */
import type { Composition, ProjectState } from "../model";
import type { ProviderModel } from "../generation/providers";
import { layersOf, renderFrame, multiply, modelMatrix, applyMatrix, type Frame } from "../composition/render";
import { panelAspect } from "./ai";

export function panelOutputPlan(panel: Composition, mask: string, model: ProviderModel) {
  const ratio = panelAspect(panel, mask);
  const supported = model.panelAi?.aspects ?? ["1:1", "2:3", "3:2"];
  const aspectRatio = (value: string) => { const [w, h] = value.split(":").map(Number); return w && h ? w / h : 1; };
  const aspect = [...supported].sort((a, b) => Math.abs(Math.log(aspectRatio(a) / ratio)) - Math.abs(Math.log(aspectRatio(b) / ratio)))[0] ?? "1:1";
  // Exact rational dimensions, not a rounded prompt hint. Multiples of 16 for native OpenAI sizes.
  const rational = mask === "project" ? [panel.width, panel.height] : mask.includes(":") ? mask.split(":").map(Number) : [Math.round(ratio * 100), 100];
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const w = rational[0] ?? 1, h = rational[1] ?? 1, divisor = gcd(w, h);
  const unitW = w / divisor, unitH = h / divisor;
  const k = Math.ceil(Math.sqrt(655360 / (unitW * unitH)) / 16) * 16;
  const width = unitW * k, height = unitH * k;
  const custom = model.panelAi?.customSize === true && ratio >= 1 / 3 && ratio <= 3 && Math.max(width, height) <= 3840 && width * height <= 8294400;
  const native = custom || Math.abs(aspectRatio(aspect) - ratio) < 1e-9;
  return { ratio, aspect, width, height, custom, native, adaptation: native ? "native" as const : "contain" as const };
}

/** Shared renderFrame handles groups; instruction layers never enter the structure raster. */
export function panelStructureFrame(s: ProjectState, panel: Composition, basis: "composition" | "sketch", sketchLayerId?: string | null): Frame {
  const selected = new Set(layersOf(s, panel.id).filter(l => l.visible && (basis === "sketch" ? l.id === sketchLayerId && !!l.sketch : !!l.assetId && !l.note && !l.arrow && !l.text && !l.shape && !l.cameraMark && !l.sketch)).map(l => l.id));
  const frame = renderFrame(s, panel.id, 0, { onlyLayers: selected, view: "camera" });
  const marker = layersOf(s, panel.id).find(l => l.visible && l.cameraMark);
  if (!marker?.cameraMark) return frame;
  const f = marker.cameraMark.frame;
  const origin = applyMatrix(modelMatrix(marker.transform), f.x, f.y);
  const k = Math.min(panel.width / f.width, panel.height / f.height);
  const view = [k, 0, 0, k, -origin.x * k, -origin.y * k] as const;
  return { ...frame, items: frame.items.map(it => ({ ...it, matrix: multiply(view, it.matrix) })) };
}

/** Letterboxing preserves every source pixel and records a separate derived image. */
export function containGeometry(width: number, height: number, ratio: number) {
  const targetWidth = Math.max(width, Math.round(height * ratio));
  const targetHeight = Math.max(height, Math.round(width / ratio));
  return { width: targetWidth, height: targetHeight, x: Math.floor((targetWidth - width) / 2), y: Math.floor((targetHeight - height) / 2) };
}