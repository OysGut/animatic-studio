/** Grupper i laglisten kan lukkes og åpnes, «slik en kan i Photoshop» (Mars 15.10.2026). */
import { describe, expect, it } from "vitest";
import {
  COLLAPSED_SCENES_LIMIT,
  ancestorGroups,
  groupMemberCount,
  groupsToOpenFor,
  isCollapsedGroups,
  selectionAfterCollapse,
  visibleLayerRows,
  withCollapsed,
  type GroupNode,
} from "@/app/scene-editor/layer-groups";
import { fixture } from "../visual/fixture-state";
import { layersOf } from "@/core";

// Forreste øverst, som i laglisten: gruppe A med a1 og en nestet gruppe B (b1); x utenfor
const layers: GroupNode[] = [
  { id: "x", kind: "character", groupId: null },
  { id: "A", kind: "group", groupId: null },
  { id: "a1", kind: "character", groupId: "A" },
  { id: "B", kind: "group", groupId: "A" },
  { id: "b1", kind: "object", groupId: "B" },
  { id: "bg", kind: "background", groupId: null },
];
const ids = (rows: { layer: GroupNode }[]) => rows.map((r) => r.layer.id);

describe("lukkede grupper i laglisten", () => {
  it("alt åpent: alle lagene vises, med innrykk etter dybde", () => {
    const rows = visibleLayerRows(layers, new Set());
    expect(ids(rows)).toEqual(["x", "A", "a1", "B", "b1", "bg"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 0, 1, 1, 2, 0]);
  });

  it("lukket gruppe: én linje for gruppen, lagene i den (også nestede) skjules", () => {
    expect(ids(visibleLayerRows(layers, new Set(["A"])))).toEqual(["x", "A", "bg"]);
    expect(ids(visibleLayerRows(layers, new Set(["B"])))).toEqual(["x", "A", "a1", "B", "bg"]);
    expect(groupMemberCount(layers, "A")).toBe(3);
    expect(groupMemberCount(layers, "B")).toBe(1);
  });

  it("lukkes gruppen med et valgt lag i, blir gruppen valgt (den ytterste lukkede)", () => {
    expect(selectionAfterCollapse(layers, new Set(["A"]), "b1")).toBe("A");
    expect(selectionAfterCollapse(layers, new Set(["B"]), "b1")).toBe("B");
    expect(selectionAfterCollapse(layers, new Set(["A", "B"]), "b1")).toBe("A");
    expect(selectionAfterCollapse(layers, new Set(["A"]), "x")).toBe("x");
    expect(selectionAfterCollapse(layers, new Set(["A"]), null)).toBe(null);
  });

  it("et lag valgt på lerretet i en lukket gruppe: gruppene rundt det åpnes", () => {
    expect(groupsToOpenFor(layers, new Set(["A", "B"]), "b1").sort()).toEqual(["A", "B"]);
    expect(groupsToOpenFor(layers, new Set(["A"]), "a1")).toEqual(["A"]);
    expect(groupsToOpenFor(layers, new Set(["A"]), "x")).toEqual([]);
  });

  it("en ring av grupper (ødelagte data) gir ingen evig løkke", () => {
    const ring: GroupNode[] = [
      { id: "G1", kind: "group", groupId: "G2" },
      { id: "G2", kind: "group", groupId: "G1" },
    ];
    expect(ancestorGroups(new Map(ring.map((l) => [l.id, l])), "G1")).toEqual(["G2"]);
    expect(visibleLayerRows(ring, new Set()).length).toBe(2);
  });

  it("huskes per scene, sist brukte sist, høyst 50 scener, tomme lister fjernes", () => {
    let all: Record<string, string[]> = {};
    for (let i = 0; i < COLLAPSED_SCENES_LIMIT + 5; i++) all = withCollapsed(all, `c${i}`, ["g"]);
    expect(Object.keys(all).length).toBe(COLLAPSED_SCENES_LIMIT);
    expect(all["c0"]).toBeUndefined();
    // Endres en gammel scene, blir den sist brukt
    all = withCollapsed(all, "c10", ["g", "h", "g"]);
    expect(Object.keys(all).at(-1)).toBe("c10");
    expect(all["c10"]).toEqual(["g", "h"]);
    all = withCollapsed(all, "c10", []);
    expect(all["c10"]).toBeUndefined();
  });

  it("bare gyldige lagrede verdier godtas", () => {
    expect(isCollapsedGroups({ c: ["g"] })).toBe(true);
    expect(isCollapsedGroups({ c: "g" })).toBe(false);
    expect(isCollapsedGroups([])).toBe(false);
  });

  it("virker med en ekte scene (gruppen «Familien» i testprosjektet)", () => {
    const s = fixture.state;
    const comp = Object.values(s.compositions)[0]!;
    const front = [...layersOf(s, comp.id)].reverse();
    const group = front.find((l) => l.kind === "group")!;
    const rows = visibleLayerRows(front, new Set([group.id]));
    expect(rows.some((r) => r.layer.groupId === group.id)).toBe(false);
    expect(rows.some((r) => r.layer.id === group.id)).toBe(true);
  });
});
