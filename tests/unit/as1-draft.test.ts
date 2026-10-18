// @vitest-environment node
/** AS1: prøveversjon for scenen (utkast) og den samlede kommandoen UpdateSceneDraft. */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION,
  applyCommand,
  createDraft,
  defaultLayerFields,
  draftBaseRevisions,
  draftCommand,
  draftConflicts,
  isDraftEmpty,
  layerFieldsOf,
  pushDraft,
  rebaseDraft,
  redoDraft,
  scriptView,
  undoDraft,
  type Command,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

function scene() {
  const seed = seedProject(2);
  const occ = scriptView(seed.state, seed.mainId)[1]!.occurrenceId;
  const o = seed.state.occurrences[occ]!;
  const compositionId = tid<"composition">();
  let s = mustApply(seed.state, {
    type: "CreateComposition",
    compositionId,
    variantId: o.variantId,
    fields: { ...DEFAULT_COMPOSITION, durationFrames: 200 },
  });
  const layerId = tid<"composition_layer">();
  s = mustApply(s, {
    type: "AddLayers",
    layers: [
      {
        layerId,
        compositionId,
        fields: defaultLayerFields(s, s.compositions[compositionId]!, { fill: "#c08040" }),
      },
    ],
  });
  return { s, occ, compositionId, layerId };
}

function move(s: ProjectState, layerId: string, x: number): Command {
  const l = s.layers[layerId as never]!;
  const f = layerFieldsOf(l);
  return {
    type: "UpdateLayers",
    layers: [{ layerId: l.id, fields: { ...f, transform: { ...f.transform, x } } }],
  };
}
const xOf = (s: ProjectState, id: string) => s.layers[id as never]!.transform.x;

describe("AS1 – utkast for scenen", () => {
  it("push, angre og gjør om endrer bare kopien", () => {
    const { s, occ, compositionId, layerId } = scene();
    const x0 = xOf(s, layerId);
    let d = createDraft(s, occ, compositionId);
    expect(isDraftEmpty(d)).toBe(true);
    const r = pushDraft(d, move(d.state, layerId, 111));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    d = r.draft;
    expect(xOf(d.state, layerId)).toBe(111);
    expect(xOf(s, layerId)).toBe(x0);
    d = undoDraft(d);
    expect(xOf(d.state, layerId)).toBe(x0);
    d = redoDraft(d);
    expect(xOf(d.state, layerId)).toBe(111);
  });

  it("avviser kommandoer for biblioteket og notater", () => {
    const { s, occ, compositionId } = scene();
    const d = createDraft(s, occ, compositionId);
    const r = pushDraft(d, {
      type: "SetCompositionRemoved",
      compositionId: compositionId as never,
      removed: true,
    });
    expect(r.ok).toBe(false);
  });

  it("UpdateSceneDraft er én kommando; inversen gir tilstanden tilbake", () => {
    const { s, occ, compositionId, layerId } = scene();
    const x0 = xOf(s, layerId);
    let d = createDraft(s, occ, compositionId);
    for (const x of [10, 20, 30]) {
      const r = pushDraft(d, move(d.state, layerId, x));
      if (r.ok) d = r.draft;
    }
    const cmd = draftCommand(d)!;
    const saved = applyCommand(s, envelope(cmd, undefined, draftBaseRevisions(d)));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(xOf(saved.state, layerId)).toBe(30);
    const undo = applyCommand(saved.state, envelope(saved.inverse));
    expect(undo.ok && xOf(undo.state, layerId)).toBe(x0);
  });

  it("revisjonskonflikt avviser hele utkastet, og rebase legger det oppå", () => {
    const { s, occ, compositionId, layerId } = scene();
    let d = createDraft(s, occ, compositionId);
    const r = pushDraft(d, move(d.state, layerId, 50));
    if (r.ok) d = r.draft;
    const other = mustApply(s, move(s, layerId, 999));
    expect(draftConflicts(d, other)).toEqual([layerId]);
    const stale = applyCommand(other, envelope(draftCommand(d)!, undefined, draftBaseRevisions(d)));
    expect(stale.ok).toBe(false);
    const rb = rebaseDraft(d, other);
    expect(rb.ok).toBe(true);
    if (!rb.ok) return;
    expect(draftConflicts(rb.draft, other)).toEqual([]);
    const ok = applyCommand(other, envelope(draftCommand(rb.draft)!, undefined, draftBaseRevisions(rb.draft)));
    expect(ok.ok && xOf(ok.state, layerId)).toBe(50);
  });

  it("avviser lag fra en annen scene", () => {
    const a = scene();
    const b = scene();
    const merged = { ...a.s, layers: { ...a.s.layers, ...b.s.layers } } as ProjectState;
    const r = applyCommand(
      merged,
      envelope({
        type: "UpdateSceneDraft",
        occurrenceId: a.occ as never,
        compositionId: a.compositionId as never,
        steps: [move(merged, b.layerId, 1)],
      }),
    );
    expect(r.ok).toBe(false);
  });
});
