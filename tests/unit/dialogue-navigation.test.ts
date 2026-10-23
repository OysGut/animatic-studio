// @vitest-environment node
/** DV1: klikk i manuset → avspillingshodet. Fast rekkefølge ord → time_links → klippstart → sceneanker (M1–M5). */
import { describe, expect, it } from "vitest";
import {
  audioVersion,
  dialogueOwnerOf,
  filmClips,
  scriptSeekTarget,
  tokenizeLine,
  blocksOfVariant,
  SCRIPT_CLICK_DELAY_MS,
  type ProjectState,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

function setup() {
  const base = fixture.state;
  const clip = Object.values(base.audioClips).find((c) => !c.removed && c.kind === "dialogue" && c.blockId && audioVersion(base, c))!;
  // Uten tidskoblinger for replikken, så hvert trinn i rekkefølgen kan prøves for seg
  const s: ProjectState = { ...base, timeLinks: Object.fromEntries(Object.entries(base.timeLinks).filter(([, l]) => l.blockId !== clip.blockId)) };
  const main = Object.values(s.productions).find((p) => p.kind === "main")!;
  const film = filmClips(s, main.id).find((c) => c.occurrenceId === clip.occurrenceId)!;
  return { s, clip, film };
}

/** Legger en ordkobling på aktiv lydfil for replikken: ord i starter 400 ms × i inn i opptaket. */
function withAlignment(s: ProjectState, clipId: string): ProjectState {
  const clip = s.audioClips[clipId]!;
  const v = audioVersion(s, clip)!;
  const text = s.blocks[clip.blockId!]!.text;
  const words = tokenizeLine(text).map((_, i) => ({ startMs: 400 * i, endMs: 400 * i + 300 }));
  const alignment = { format: 1, blockId: clip.blockId!, text, words, provider: "manual", model: "test", loss: null, at: "2026-10-19T00:00:00Z" };
  return { ...s, assetVersions: { ...s.assetVersions, [v.id]: { ...v, alignment } as never } };
}

describe("DV1 manusnavigasjon", () => {
  it("uten plass i filmen er tiden «mangler» – aldri en tilfeldig posisjon", () => {
    const { s, clip } = setup();
    expect(scriptSeekTarget(s, null, clip.blockId!)).toEqual({ blockId: clip.blockId, compFrame: null, quality: "missing", source: "none" });
  });

  it("replikk med lydklipp: klippets start, merket nøyaktig", () => {
    const { s, clip, film } = setup();
    const t = scriptSeekTarget(s, film, clip.blockId!);
    expect(t.source).toBe("clip");
    expect(t.quality).toBe("exact");
    expect(t.compFrame).not.toBeNull();
  });

  it("time_links går foran klippstart", () => {
    const { s: s0, clip, film } = setup();
    const s = mustApply(s0, { type: "AddTimeLinks", links: [{ linkId: tid<"time_link">(), fields: { occurrenceId: clip.occurrenceId, blockId: clip.blockId!, startMs: 3000, endMs: 4000 } }] });
    const t = scriptSeekTarget(s, film, clip.blockId!);
    expect(t.source).toBe("time_link");
    expect(t.compFrame).toBe(75);
  });

  it("ordkobling går foran alt: klikk på ord nr. 2 gir ordets tid i aktiv versjon", () => {
    const { s: s0, clip, film } = setup();
    const s = withAlignment(s0, clip.id);
    const text = s.blocks[clip.blockId!]!.text;
    const tokens = tokenizeLine(text);
    expect(tokens.length).toBeGreaterThan(1);
    const atLine = scriptSeekTarget(s, film, clip.blockId!);
    const atWord = scriptSeekTarget(s, film, clip.blockId!, tokens[1]!.start);
    expect(atLine.source).toBe("clip");
    expect(atWord.source).toBe("word");
    expect(atWord.quality).toBe("exact");
    expect(atWord.compFrame!).toBeGreaterThan(atLine.compFrame!);
    // Ordet vinner også over en tidskobling
    const linked = mustApply(s, { type: "AddTimeLinks", links: [{ linkId: tid<"time_link">(), fields: { occurrenceId: clip.occurrenceId, blockId: clip.blockId!, startMs: 1000, endMs: 1500 } }] });
    expect(scriptSeekTarget(linked, film, clip.blockId!, tokens[1]!.start).source).toBe("word");
    expect(scriptSeekTarget(linked, film, clip.blockId!).source).toBe("time_link");
    // Endret tekst etter koblingen → ikke presis lenger; faller tilbake til klippets start
    const edited = { ...s, blocks: { ...s.blocks, [clip.blockId!]: { ...s.blocks[clip.blockId!]!, text: text + " ekstra" } } };
    expect(scriptSeekTarget(edited, film, clip.blockId!, tokens[1]!.start).source).toBe("clip");
  });

  it("karakternavn og parentes følger replikken de hører til", () => {
    const { s, clip, film } = setup();
    const blocks = blocksOfVariant(s, film.variantId);
    const i = blocks.findIndex((b) => b.id === clip.blockId);
    const name = blocks.slice(0, i).reverse().find((b) => b.kind === "character");
    if (name) expect(dialogueOwnerOf(s, film.variantId, name.id)).toBe(clip.blockId);
    expect(dialogueOwnerOf(s, film.variantId, clip.blockId!)).toBe(clip.blockId);
  });

  it("enkeltklikk venter kort nok til at dobbeltklikk kan avlyse det", () => {
    expect(SCRIPT_CLICK_DELAY_MS).toBeGreaterThanOrEqual(200);
    expect(SCRIPT_CLICK_DELAY_MS).toBeLessThanOrEqual(400);
  });
});
