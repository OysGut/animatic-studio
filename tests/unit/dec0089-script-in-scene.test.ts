// @vitest-environment node
/** DEC-0089: manuset i sceneeditoren markerer linjen som spilles av (blockAtCompositionFrame). */
import { describe, expect, it } from "vitest";
import { blockAtCompositionFrame, blockSpans, filmClips, orderedOccurrences } from "@/core";
import { seedProject } from "../helpers/fixtures";

describe("linjen som spilles av", () => {
  it("følger blokkene i scenen gjennom klippet, og ingenting utenfor", () => {
    const { state, mainId } = seedProject(3);
    const occ = orderedOccurrences(state, mainId)[1]!;
    const clip = filmClips(state, mainId).find((c) => c.occurrenceId === occ.id)!;
    expect(clip).toBeDefined();
    const spans = blockSpans(state, clip);
    expect(spans.length).toBeGreaterThan(0);
    // Hvert bilde inne i en blokk gir den blokken (karakter og replikk deler tid: replikken vises)
    const ids = new Set<string>();
    for (let f = 0; f < clip.durationFrames; f += 5) {
      const id = blockAtCompositionFrame(state, clip, f);
      if (id) ids.add(id);
    }
    const kinds = [...ids].map((id) => state.blocks[id]!.kind);
    expect(kinds).toContain("action");
    expect(kinds).toContain("dialogue");
    expect(kinds).not.toContain("character");
    // Forhåndsberegnede tider gir samme svar
    const mid = Math.floor(clip.durationFrames / 2);
    expect(blockAtCompositionFrame(state, clip, mid, spans)).toBe(
      blockAtCompositionFrame(state, clip, mid),
    );
    expect(blockAtCompositionFrame(state, clip, clip.durationFrames + 50)).toBeNull();
  });
});
