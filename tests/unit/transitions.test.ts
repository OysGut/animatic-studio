// @vitest-environment node
/**
 * Montering del 5 (DEC-0051): flere overgangstyper, overlapp, prosjektets standardovergang, svart-hvitt per
 * scene og hendelser i 2D-scenen (tidskobling til et lag).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION,
  applyCommand,
  blockSpans,
  blocksOfVariant,
  defaultLayerFields,
  filmClips,
  filmDurationFrames,
  filmRange,
  frameMix,
  scriptView,
  stateFromRows,
  toRow,
  type Command,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

function fails(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.error.message;
}

/** Tre scener à 100 bilder (2D-scener med satt lengde). */
function setup() {
  const seed = seedProject(3);
  let s = seed.state;
  const view = scriptView(s, seed.mainId);
  const comps: string[] = [];
  for (const v of view) {
    const compositionId = tid<"composition">();
    comps.push(compositionId);
    s = mustApply(s, {
      type: "CreateComposition",
      compositionId,
      variantId: s.occurrences[v.occurrenceId]!.variantId,
      fields: { ...DEFAULT_COMPOSITION, width: 1920, height: 1080, durationFrames: 100 },
    });
  }
  return { ...seed, s, view, comps };
}

const clipsOf = (s: ProjectState, mainId: string) => filmClips(s, mainId);

describe("overganger", () => {
  it("prosjektets standard gjelder scener uten egen overgang; egen overgang og «Kutt» overstyrer", () => {
    const { s: s0, mainId, view } = setup();
    let s = mustApply(s0, {
      type: "SetDefaultTransition",
      transition: { kind: "dissolve", frames: 10 },
    });
    let c = clipsOf(s, mainId);
    expect(c.map((x) => x.transition.kind)).toEqual(["dissolve", "dissolve", "dissolve"]);
    expect(c.every((x) => x.transitionInherited)).toBe(true);
    s = mustApply(s, {
      type: "SetTransition",
      occurrenceId: view[1]!.occurrenceId,
      transition: { kind: "cut", frames: 0 },
    });
    s = mustApply(s, {
      type: "SetTransition",
      occurrenceId: view[2]!.occurrenceId,
      transition: { kind: "iris", frames: 20 },
    });
    c = clipsOf(s, mainId);
    expect(c.map((x) => x.transition.kind)).toEqual(["dissolve", "cut", "iris"]);
    expect(c.map((x) => x.transitionInherited)).toEqual([true, false, false]);
    // Tilbake til standarden (null), og angring av standarden
    const r = applyCommand(
      s,
      envelope({ type: "SetTransition", occurrenceId: view[1]!.occurrenceId, transition: null }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(clipsOf(r.state, mainId)[1]!.transition.kind).toBe("dissolve");
    expect(r.inverse).toEqual({
      type: "SetTransition",
      occurrenceId: view[1]!.occurrenceId,
      transition: { kind: "cut", frames: 0 },
    });
    const d = applyCommand(s, envelope({ type: "SetDefaultTransition", transition: null }));
    expect(d.ok && d.inverse).toEqual({
      type: "SetDefaultTransition",
      transition: { kind: "dissolve", frames: 10 },
    });
    expect(d.ok && clipsOf(d.state, mainId)[0]!.transition.kind).toBe("cut");
  });

  it("overlapp gjør filmen kortere, og begge klippene spilles i overlappen", () => {
    const { s: s0, mainId, view } = setup();
    expect(filmDurationFrames(clipsOf(s0, mainId))).toBe(300);
    const s = mustApply(s0, {
      type: "SetTransition",
      occurrenceId: view[1]!.occurrenceId,
      transition: { kind: "wipe", frames: 20, overlap: true },
    });
    const c = clipsOf(s, mainId);
    expect(c.map((x) => x.startFrame)).toEqual([0, 80, 180]);
    expect(c[1]!.overlapFrames).toBe(20);
    expect(filmDurationFrames(c)).toBe(280);
    const m = frameMix(c, 90)!;
    expect(m.kind).toBe("wipe");
    expect(m.a.localFrame).toBe(90);
    expect(m.a.held).toBeUndefined();
    expect(m.b!.localFrame).toBe(10);
    expect(m.b!.held).toBeUndefined();
    expect(m.mix).toBeCloseTo(10.5 / 20, 6);
    // Etter overlappen: bare neste scene
    expect(frameMix(c, 100)!.b).toBeNull();
  });

  it("via hvitt toner til hvitt; første scene tones inn fra hvitt", () => {
    const { s: s0, mainId, view } = setup();
    let s = mustApply(s0, {
      type: "SetTransition",
      occurrenceId: view[1]!.occurrenceId,
      transition: { kind: "dipWhite", frames: 20 },
    });
    s = mustApply(s, {
      type: "SetTransition",
      occurrenceId: view[0]!.occurrenceId,
      transition: { kind: "dipWhite", frames: 10 },
    });
    const c = clipsOf(s, mainId);
    const mid = frameMix(c, 99)!;
    expect(mid.white).toBeGreaterThan(0.9);
    expect(mid.black).toBe(0);
    expect(frameMix(c, 0)!.white).toBeGreaterThan(0.9);
  });

  it("ugyldige overganger avvises", () => {
    const { s, view } = setup();
    const occ = view[1]!.occurrenceId;
    expect(
      fails(s, {
        type: "SetTransition",
        occurrenceId: occ,
        transition: { kind: "spin" as never, frames: 10 },
      }),
    ).toMatch(/Ugyldig overgang/);
    expect(
      fails(s, {
        type: "SetTransition",
        occurrenceId: occ,
        transition: { kind: "push", frames: 0 },
      }),
    ).toMatch(/må vare/);
  });

  it("lagres og leses tilbake; rader fra før 0013 tolkes som før", () => {
    const { s: s0, view } = setup();
    let s = mustApply(s0, {
      type: "SetTransition",
      occurrenceId: view[1]!.occurrenceId,
      transition: { kind: "push", frames: 12, overlap: true },
    });
    s = mustApply(s, {
      type: "SetOccurrenceMonochrome",
      occurrenceId: view[2]!.occurrenceId,
      monochrome: true,
    });
    s = mustApply(s, {
      type: "SetDefaultTransition",
      transition: { kind: "dip", frames: 8 },
    });
    const rows = (col: "occurrences") =>
      Object.values(s[col]).map((e) => toRow(col, e, s.project.id));
    const occRows = rows("occurrences");
    const projectRow = {
      id: s.project.id,
      name: "x",
      fps_num: 25,
      fps_den: 1,
      revision: s.project.revision,
      default_transition_kind: "dip",
      default_transition_frames: 8,
      default_transition_overlap: false,
    };
    const back = stateFromRows({
      project: projectRow,
      productions: [],
      scenes: [],
      scene_variants: [],
      script_blocks: [],
      script_block_revisions: [],
      scene_occurrences: occRows,
      production_segments: [],
      takes: [],
    });
    for (const o of Object.values(s.occurrences)) expect(back.occurrences[o.id]).toEqual(o);
    expect(back.project.defaultTransition).toEqual({ kind: "dip", frames: 8 });
    // Før 0013: ingen transition_custom-kolonne; kutt = standard, annen overgang = eget valg
    const old = stateFromRows({
      project: projectRow,
      productions: [],
      scenes: [],
      scene_variants: [],
      script_blocks: [],
      script_block_revisions: [],
      scene_occurrences: occRows.map((r) => {
        const { transition_custom: _c, transition_overlap: _o, monochrome: _m, ...rest } = r;
        return rest;
      }),
      production_segments: [],
      takes: [],
    });
    expect(old.occurrences[view[0]!.occurrenceId]!.transition).toBeUndefined();
    expect(old.occurrences[view[1]!.occurrenceId]!.transition?.kind).toBe("push");
  });
});

describe("svart-hvitt per scene", () => {
  it("settes og angres", () => {
    const { s, mainId, view } = setup();
    const r = applyCommand(
      s,
      envelope({
        type: "SetOccurrenceMonochrome",
        occurrenceId: view[0]!.occurrenceId,
        monochrome: true,
      }),
    );
    expect(r.ok && clipsOf(r.state, mainId).map((c) => c.monochrome)).toEqual([true, false, false]);
    expect(r.ok && r.inverse).toEqual({
      type: "SetOccurrenceMonochrome",
      occurrenceId: view[0]!.occurrenceId,
      monochrome: false,
    });
  });
});

describe("hendelser i 2D-scenen (REQ-0095/0096)", () => {
  function withLayer() {
    const b = setup();
    const occ = b.view[0]!.occurrenceId;
    const comp = b.s.compositions[b.comps[0]!]!;
    const layerId = tid<"composition_layer">();
    const s = mustApply(b.s, {
      type: "AddLayers",
      layers: [
        {
          layerId,
          compositionId: comp.id,
          fields: defaultLayerFields(b.s, comp, { fill: "#222222", name: "Maja" }),
        },
      ],
    });
    const action = blocksOfVariant(s, comp.variantId).find((x) => x.kind === "action")!;
    return { ...b, s, occ, comp, layerId, action };
  }

  it("en handling kan ha flere hendelser, og tiden følger 2D-scenen når klippet kuttes", () => {
    const { s: s0, mainId, occ, layerId, action } = withLayer();
    const l1 = tid<"time_link">();
    const l2 = tid<"time_link">();
    let s = mustApply(s0, {
      type: "AddTimeLinks",
      links: [
        {
          linkId: l1,
          fields: { occurrenceId: occ, blockId: action.id, startMs: 2000, endMs: null, layerId },
        },
        {
          linkId: l2,
          fields: { occurrenceId: occ, blockId: action.id, startMs: 3000, endMs: null, layerId },
        },
      ],
    });
    expect(Object.values(s.timeLinks).filter((l) => l.blockId === action.id)).toHaveLength(2);
    const clip = clipsOf(s, mainId)[0]!;
    expect(blockSpans(s, clip).find((x) => x.blockId === action.id)!.startFrame).toBe(50);
    // Kutt bort de første 40 bildene (1,6 s) av 2D-scenen: hendelsen kommer 40 bilder tidligere i filmen
    s = mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId: occ,
      activeTakeId: null,
      parts: [{ partId: tid(), source: "composition", takeId: null, inMs: 1600, outMs: 4000 }],
    });
    const cut = clipsOf(s, mainId)[0]!;
    expect(blockSpans(s, cut).find((x) => x.blockId === action.id)!.startFrame).toBe(10);
    // Kutt bort hendelsene helt: ikke dekket
    s = mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId: occ,
      activeTakeId: null,
      parts: [{ partId: tid(), source: "composition", takeId: null, inMs: 3500, outMs: 4000 }],
    });
    const gone = blockSpans(s, clipsOf(s, mainId)[0]!).find((x) => x.blockId === action.id)!;
    expect(gone.uncovered).toBe(true);
  });

  it("laget må høre til scenens 2D-scene, og flytting av koblingen beholder laget", () => {
    const { s, view, occ, layerId, action } = withLayer();
    const other = view[1]!.occurrenceId;
    const otherBlock = blocksOfVariant(s, s.occurrences[other]!.variantId).find(
      (x) => x.kind === "action",
    )!;
    expect(
      fails(s, {
        type: "AddTimeLinks",
        links: [
          {
            linkId: tid(),
            fields: {
              occurrenceId: other,
              blockId: otherBlock.id,
              startMs: 0,
              endMs: null,
              layerId,
            },
          },
        ],
      }),
    ).toMatch(/hører ikke til scenens 2D-scene/);
    const id = tid<"time_link">();
    const s1 = mustApply(s, {
      type: "AddTimeLinks",
      links: [
        {
          linkId: id,
          fields: { occurrenceId: occ, blockId: action.id, startMs: 500, endMs: null, layerId },
        },
      ],
    });
    const s2 = mustApply(s1, {
      type: "UpdateTimeLinks",
      links: [
        {
          linkId: id,
          fields: { occurrenceId: occ, blockId: action.id, startMs: 900, endMs: null },
        },
      ],
    });
    expect(s2.timeLinks[id]).toMatchObject({ startMs: 900, layerId });
  });
});

describe("rettelser etter gjennomgang (DEC-0051)", () => {
  it("overlapp går aldri inn i forrige klipps egen overgang, og et utsnitt begynner rent", () => {
    const { s: s0, mainId, view } = setup();
    let s = mustApply(s0, {
      type: "SetTransition",
      occurrenceId: view[1]!.occurrenceId,
      transition: { kind: "dissolve", frames: 60, overlap: true },
    });
    s = mustApply(s, {
      type: "SetTransition",
      occurrenceId: view[2]!.occurrenceId,
      transition: { kind: "wipe", frames: 60, overlap: true },
    });
    const c = clipsOf(s, mainId);
    // Klipp 2 begynner ved 40 og har 60 bilders overgang inn: klipp 3 kan overlappe høyst 39
    expect(c[1]!.startFrame).toBe(40);
    expect(c[2]!.overlapFrames).toBe(39);
    expect(c[2]!.startFrame).toBeGreaterThanOrEqual(c[1]!.startFrame + 60);
    const r = filmRange(c, {
      kind: "scenes",
      fromOccurrenceId: view[1]!.occurrenceId,
      toOccurrenceId: view[1]!.occurrenceId,
    });
    expect(r.clips[0]!.transition.kind).toBe("cut");
    expect(frameMix(r.clips, r.startFrame)!.b).toBeNull();
  });

  it("toRow tar alltid med layer_id (også null)", () => {
    const { s } = setup();
    const row = toRow(
      "timeLinks",
      {
        id: tid(),
        revision: 1,
        occurrenceId: tid(),
        blockId: tid(),
        startMs: 0,
        endMs: null,
        layerId: null,
        removed: false,
      } as never,
      s.project.id,
    );
    expect("layer_id" in row).toBe(true);
  });
});

describe("naboscener (DEC-0052, REQ-0578)", () => {
  it("utvalget går fra forrige til neste scene og starter rent", async () => {
    const { neighbourRange, clipFrameToComposition, compositionFrameInClip } =
      await import("@/core");
    const { s, mainId } = setup();
    const clips = clipsOf(s, mainId);
    expect(clips.length).toBe(3);
    const mid = neighbourRange(clips, clips[1]!.occurrenceId)!;
    expect(mid.clips.map((c) => c.occurrenceId)).toEqual(clips.map((c) => c.occurrenceId));
    expect(mid.startFrame).toBe(clips[0]!.startFrame);
    expect(mid.clips[0]!.transition.kind).toBe("cut");
    expect(mid.prev?.occurrenceId).toBe(clips[0]!.occurrenceId);
    const first = neighbourRange(clips, clips[0]!.occurrenceId)!;
    expect(first.prev).toBeNull();
    expect(first.clips).toHaveLength(2);
    const last = neighbourRange(clips, clips[2]!.occurrenceId)!;
    expect(last.next).toBeNull();
    expect(neighbourRange(clips, "ukjent")).toBeNull();
    // Bildet i klippet og bildet i 2D-scenen er hverandres omvendte
    const c = clips[1]!;
    for (const f of [0, 3, c.durationFrames - 1]) {
      const local = compositionFrameInClip(c, f);
      if (local !== null) expect(clipFrameToComposition(c, local)).toBe(f);
    }
    expect(clipFrameToComposition(c, c.durationFrames)).toBeNull();
  });
});
