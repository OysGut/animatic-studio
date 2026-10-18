import { describe, expect, it } from "vitest";
import { blocksOfVariant, orderedOccurrences, scriptPages } from "@/core";
import { selectedNoteTarget } from "@/app/script-explorer/selection-note";
import { seedProject } from "../helpers/fixtures";

describe("explorer note selection", () => {
  it("resolves quote/start/end with existing screenplay alignment without modifying script text", () => {
    const { state, mainId } = seedProject(1);
    const occurrence = orderedOccurrences(state, mainId)[0];
    if (!occurrence) throw new Error("missing fixture scene");
    const block = blocksOfVariant(state, occurrence.variantId).find((b) => b.kind === "action");
    if (!block) throw new Error("missing fixture action");
    const pages = scriptPages(state, mainId).pages;
    const page = pages.find((p) => p.lines.some((l) => l.blockId === block.id));
    if (!page) throw new Error("missing page");
    const index = page.lines.findIndex((l) => l.blockId === block.id);
    const line = page.lines[index];
    if (!line) throw new Error("missing line");
    const root = document.createElement("div");
    const element = document.createElement("span");
    element.dataset["block"] = block.id; element.dataset["line"] = `${page.number}:${index}`;
    element.textContent = line.text; root.append(element); document.body.append(root);
    const node = element.firstChild;
    if (!node) throw new Error("missing text node");
    const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 8);
    window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
    expect(selectedNoteTarget(root, state, pages)).toEqual({ blockId: block.id, variantId: null, start: 0, end: 8, quote: "Handling" });
    expect(state.blocks[block.id]?.text).toBe("Handling 0");
    root.remove(); window.getSelection()?.removeAllRanges();
  });
  it("rejects a selection outside the explorer", () => {
    const { state } = seedProject(0);
    const outside = document.createElement("p"); outside.textContent = "Other window"; document.body.append(outside);
    const range = document.createRange(); range.selectNodeContents(outside);
    window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
    expect(selectedNoteTarget(document.createElement("div"), state, [])).toBeNull();
    outside.remove(); window.getSelection()?.removeAllRanges();
  });
});