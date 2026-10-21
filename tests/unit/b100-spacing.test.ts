// @vitest-environment node
/** B-100 runde 3: spacing-drag (tidsskalering av ett objekts animasjon). */
import { describe, expect, it } from "vitest";
import { applyCommand, type CompositionLayer, type Keyframe, type ProjectState } from "@/core";
import { planSpacingDrag } from "@/core/animation/spacing";
import { envelope } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const base = Object.values(fixture.state.layers).find((l) => !l.removed && l.compositionId)!;
const kf = (frame: number, value: number, property: Keyframe["property"] = "x" as Keyframe["property"]): Keyframe => ({ frame, value, property, easing: "linear" });

function withLayers(extra: Partial<CompositionLayer>, child?: Partial<CompositionLayer>, timing?: unknown): ProjectState {
  const l: CompositionLayer = { ...base, keyframes: [], swaps: [], path: null, locked: false, groupId: null, ...extra };
  const layers: Record<string, CompositionLayer> = { ...fixture.state.layers, [l.id]: l };
  if (child) layers["child-1"] = { ...l, id: "child-1" as never, groupId: l.id, ...child };
  const comps = timing
    ? { ...fixture.state.compositions, [l.compositionId]: { ...fixture.state.compositions[l.compositionId]!, timing: timing as never } }
    : fixture.state.compositions;
  return { ...fixture.state, layers, compositions: comps } as ProjectState;
}
const fields = (p: ReturnType<typeof planSpacingDrag>, id: string) =>
  (p.command as unknown as { layers: { layerId: string; fields: CompositionLayer }[] }).layers.find((x) => x.layerId === id)!.fields;

describe("planSpacingDrag", () => {
  it("fra punktet og ut: nøkkelbilder etter ankeret strekkes, de før står", () => {
    const s = withLayers({ keyframes: [kf(0, 0), kf(10, 5), kf(20, 10), kf(30, 20)] });
    const p = planSpacingDrag(s, base.id, 10, 20, { whole: false });
    expect(p.ok && p.delta).toBe(20);
    expect(fields(p, base.id).keyframes.map((k) => k.frame)).toEqual([0, 10, 30, 50]);
    expect(p.newEnd).toBe(50);
  });
  it("hele animasjonen med anker: ankeret står fast", () => {
    const s = withLayers({ keyframes: [kf(10, 0), kf(20, 5), kf(40, 20)] });
    const p = planSpacingDrag(s, base.id, 20, 20, { whole: true });
    expect(fields(p, base.id).keyframes.map((k) => k.frame)).toEqual([0, 20, 60]);
  });
  it("verdiene (nodene i rommet) endres aldri, og banens punkter er uendret", () => {
    const path = { points: [{ x: 0, y: 0, smooth: false }, { x: 100, y: 50, smooth: true }], startFrame: 0, endFrame: 40, easeOut: 0, easeIn: 0, tempo: [{ t: 0.5, p: 0.3 }] };
    const s = withLayers({ keyframes: [kf(0, 1), kf(40, 9)], path });
    const p = planSpacingDrag(s, base.id, 0, 40, { whole: false });
    const f = fields(p, base.id);
    expect(f.keyframes.map((k) => k.value)).toEqual([1, 9]);
    expect(f.path!.points).toEqual(path.points);
    expect(f.path!.endFrame).toBe(80);
    expect(f.path!.tempo).toEqual(path.tempo); // jevn skalering beholder tempo eksakt
  });
  it("rekkefølgen bevares og to nøkkelbilder slås aldri sammen: draget stopper ved grensen", () => {
    const s = withLayers({ keyframes: [kf(0, 0), kf(10, 1), kf(12, 2), kf(14, 3)] });
    const p = planSpacingDrag(s, base.id, 10, -100, { whole: false });
    expect(p.limit).toBe("merge");
    const frames = fields(p, base.id).keyframes.map((k) => k.frame);
    for (let i = 1; i < frames.length; i++) expect(frames[i]!).toBeGreaterThan(frames[i - 1]!);
    expect(frames[3]).toBe(12);
  });
  it("hele animasjonen før scenens start stoppes", () => {
    const s = withLayers({ keyframes: [kf(0, 0), kf(10, 5), kf(30, 20)] });
    const p = planSpacingDrag(s, base.id, 10, 20, { whole: true });
    expect(p.limit).toBe("start");
    expect(Math.min(...fields(p, base.id).keyframes.map((k) => k.frame))).toBe(0);
  });
  it("barn i en gruppe følger med", () => {
    const s = withLayers({ keyframes: [kf(0, 0), kf(20, 1)] }, { keyframes: [kf(0, 0), kf(20, 4)] });
    const p = planSpacingDrag(s, base.id, 0, 20, { whole: false });
    expect(fields(p, "child-1").keyframes.map((k) => k.frame)).toEqual([0, 40]);
  });
  it("låste tidsrom flyttes aldri", () => {
    const timing = { lockedRanges: [{ id: "r", startFrame: 25, endFrame: 35, label: "x" }], padding: { start: null, end: null } };
    const s = withLayers({ keyframes: [kf(0, 0), kf(10, 1), kf(30, 2)] }, undefined, timing);
    const p = planSpacingDrag(s, base.id, 10, 10, { whole: false });
    expect(p.limit).toBe("locked");
    expect(p.command).toBeNull();
  });
  it("låst lag avvises; andre lag røres ikke", () => {
    expect(planSpacingDrag(withLayers({ locked: true, keyframes: [kf(0, 0), kf(9, 1)] }), base.id, 0, 5, { whole: false }).reason).toBe("layer-locked");
    const p = planSpacingDrag(withLayers({ keyframes: [kf(0, 0), kf(9, 1)] }), base.id, 0, 5, { whole: false });
    expect(p.layerIds).toEqual([base.id]);
  });
  it("én kommando: brukes og angres som én endring", () => {
    const s = withLayers({ keyframes: [kf(0, 0), kf(10, 5), kf(20, 10)] });
    const p = planSpacingDrag(s, base.id, 10, 6, { whole: false });
    const r = applyCommand(s, envelope(p.command!));
    if (!r.ok) throw new Error(r.error.message);
    expect(r.state.layers[base.id]!.keyframes.map((k) => k.frame)).toEqual([0, 10, 26]);
    const u = applyCommand(r.state, envelope(r.inverse));
    if (!u.ok) throw new Error(u.error.message);
    expect(u.state.layers[base.id]!.keyframes.map((k) => k.frame)).toEqual([0, 10, 20]);
  });
});
