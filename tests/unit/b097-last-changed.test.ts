import { describe, expect, it } from "vitest";
import { emptyProjectState, scenesOfChange, type ProjectState } from "@/core";

const base = emptyProjectState({ id: "p", revision: 1, name: "P", fps: { num: 25, den: 1 } } as never);
const state = {
  ...base,
  scenes: { s1: { id: "s1" }, s2: { id: "s2" } },
  variants: { v1: { id: "v1", sceneId: "s1" }, v2: { id: "v2", sceneId: "s2" } },
  occurrences: { o1: { id: "o1", sceneId: "s1", variantId: "v1" } },
  blocks: { b2: { id: "b2", variantId: "v2" } },
  compositions: { c1: { id: "c1", variantId: "v1" } },
  layers: { l1: { id: "l1", compositionId: "c1", assetId: "a1" } },
  audioClips: { ac1: { id: "ac1", occurrenceId: "o1", assetId: "a1", blockId: null } },
  dialogueVersions: { dv1: { id: "dv1", clipId: "ac1" } },
  assets: { a1: { id: "a1" } },
} as unknown as ProjectState;

describe("B-097 scenesOfChange", () => {
  it("lag, lydversjon og manusblokk føres til riktig scene", () => {
    expect(scenesOfChange(state, state, ["l1"])).toEqual(["s1"]);
    expect(scenesOfChange(state, state, ["dv1"])).toEqual(["s1"]);
    expect(scenesOfChange(state, state, ["b2", "l1"])).toEqual(["s1", "s2"]);
  });
  it("en ressurs alene gjelder ingen scene", () => {
    expect(scenesOfChange(state, state, ["a1"])).toEqual([]);
  });
  it("en rad som bare finnes før endringen (slettet), teller også", () => {
    const after = { ...state, layers: {} } as unknown as ProjectState;
    expect(scenesOfChange(state, after, ["l1"])).toEqual(["s1"]);
  });
  it("ukjente ID-er gir ingen scene", () => {
    expect(scenesOfChange(state, state, ["x"])).toEqual([]);
  });
});
