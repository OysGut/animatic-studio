/**
 * Flytte et lag inn i, ut av eller mellom grupper uten at det hopper (DEC-0052): plassering, nøkkelbilder
 * og bevegelsesbane regnes om fra den gamle gruppens koordinater til den nye. Gruppene regnes slik de står
 * på bildet `frame` (animerte grupper følges ikke bakover i tid).
 */
import type { CompositionLayer, Keyframe, ProjectState } from "../model";
import type { LayerFields } from "../commands/types";
import {
  IDENTITY,
  applyMatrix,
  groupMatrixAt,
  groupOf,
  invert,
  multiply,
  valueAt,
  type Matrix,
} from "./render";
import { layerFieldsOf } from "./index";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Lagets felter med `groupId` byttet og alt regnet om, så laget blir stående der det er. */
export function regroupFields(
  s: ProjectState,
  layer: CompositionLayer,
  groupId: string | null,
  frame: number,
): LayerFields {
  const base = { ...layerFieldsOf(layer), groupId: groupId as LayerFields["groupId"] };
  const from = groupOf(s, layer);
  const target = groupId ? s.layers[groupId] : undefined;
  const to = target && target.kind === "group" && !target.removed ? target : null;
  const fromM: Matrix = from ? groupMatrixAt(from, frame) : IDENTITY;
  const toInv = to ? invert(groupMatrixAt(to, frame)) : IDENTITY;
  if (!toInv) return base;
  const c = multiply(toInv, fromM);
  if (c.every((v, i) => Math.abs(v - IDENTITY[i]!) < 1e-9)) return base;
  // Rotasjon og skalering i omregningen (gruppene skaleres likt i begge retninger i praksis)
  const rot = (Math.atan2(c[1], c[0]) * 180) / Math.PI;
  const sx = Math.hypot(c[0], c[1]);
  const sy = (c[0] * c[3] - c[1] * c[2]) / (sx || 1);
  const pt = (x: number, y: number) => {
    const q = applyMatrix(c, x, y);
    return { x: r1(q.x), y: r1(q.y) };
  };
  const t = layer.transform;
  const p = pt(t.x, t.y);
  const keyframes: Keyframe[] = layer.keyframes.map((k) => {
    if (k.property === "x" || k.property === "y") {
      const q = pt(valueAt(layer, "x", k.frame), valueAt(layer, "y", k.frame));
      return { ...k, value: k.property === "x" ? q.x : q.y };
    }
    if (k.property === "rotation") return { ...k, value: r1(k.value + rot) };
    if (k.property === "scaleX") return { ...k, value: r3(k.value * sx) };
    if (k.property === "scaleY") return { ...k, value: r3(k.value * sy) };
    return k;
  });
  return {
    ...base,
    transform: {
      ...t,
      x: p.x,
      y: p.y,
      rotation: r1(t.rotation + rot),
      scaleX: r3(t.scaleX * sx),
      scaleY: r3(t.scaleY * sy),
    },
    keyframes,
    path: layer.path
      ? { ...layer.path, points: layer.path.points.map((q) => ({ ...q, ...pt(q.x, q.y) })) }
      : null,
  };
}
