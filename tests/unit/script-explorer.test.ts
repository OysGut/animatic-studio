// @vitest-environment node
import { describe, expect, it } from "vitest";
import { blocksOfVariant, orderedOccurrences } from "@/core";
import { explorerContext, explorerGroups } from "@/core/screenplay/explorer";
import { explorerUrl, validateExplorerSearch } from "@/app/script-explorer/explorer-state";
import { seedProject } from "../helpers/fixtures";

describe("script explorer grouping", () => {
  it("separates speaking scenes from mentions in other characters' dialogue", () => {
    const { state, mainId } = seedProject(2);
    const [first, second] = orderedOccurrences(state, mainId);
    if (!first || !second) throw new Error("missing fixture scenes");
    const blocks = blocksOfVariant(state, second.variantId);
    const character = blocks.find((b) => b.kind === "character"), dialogue = blocks.find((b) => b.kind === "dialogue");
    if (!character || !dialogue) throw new Error("missing fixture blocks");
    const changed = { ...state, blocks: { ...state.blocks, [character.id]: { ...character, text: "OLE" }, [dialogue.id]: { ...dialogue, text: "Hvor er Maja?" } } };
    const before = JSON.stringify(changed);
    const groups = explorerGroups(changed, mainId, { character: "MAJA" });
    expect(groups.map((g) => [g.occurrenceId, g.role])).toEqual([[first.id, "participates"], [second.id, "mentioned"]]);
    expect(JSON.stringify(changed)).toBe(before);
  });
  it("returns two blocks before and after, clipped at scene boundaries", () => {
    const { state, mainId } = seedProject(1);
    const occurrence = orderedOccurrences(state, mainId)[0];
    if (!occurrence) throw new Error("missing fixture scene");
    const original = blocksOfVariant(state, occurrence.variantId)[0];
    if (!original) throw new Error("missing fixture block");
    const blocks = Array.from({ length: 7 }, (_, i) => ({ ...original, id: `block-${i}` as typeof original.id, orderKey: String(i + 1), text: `Action ${i}` }));
    const changed = { ...state, blocks: Object.fromEntries(blocks.map((b) => [b.id, b])) };
    expect(explorerContext(changed, occurrence.id, "block-3").map((b) => b.id)).toEqual(["block-1", "block-2", "block-3", "block-4", "block-5"]);
    expect(explorerContext(changed, occurrence.id, "block-0").map((b) => b.id)).toEqual(["block-0", "block-1", "block-2"]);
    expect(explorerContext(changed, occurrence.id, "unknown")).toEqual([]);
  });
  it("reuses whole-script search while filtering dialogue and headings locally", () => {
    const { state, mainId } = seedProject(2);
    expect(explorerGroups(state, mainId, { text: "Replikk 1" }, "dialogue")).toHaveLength(1);
    expect(explorerGroups(state, mainId, { text: "Replikk 1" }, "heading")).toEqual([]);
    expect(explorerGroups(state, mainId, { text: "STED 1" }, "heading")[0]?.hits[0]?.kind).toBe("heading");
  });
  it("validates pinned state and preserves search, source, scene and selected block", () => {
    const id = "00000000-0000-7000-8000-000000000001";
    const search = validateExplorerSearch({ modus: "search", kilde: id, scene: id, blokk: id, q: "Maja", karakter: "MAJA" });
    const url = new URL(explorerUrl(id, id, search), "https://example.test");
    expect(url.searchParams.get("modus")).toBe("search"); expect(url.searchParams.get("q")).toBe("Maja");
    expect(url.searchParams.get("scene")).toBe(id); expect(url.searchParams.get("blokk")).toBe(id);
    expect(validateExplorerSearch({ modus: "invalid", scene: "42", kilde: "no", q: 1 })).toEqual({ modus: "follow" });
  });
});