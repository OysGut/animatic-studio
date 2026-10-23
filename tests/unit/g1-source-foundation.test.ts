// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyCommand, blocksOfVariant, buildInterchange, clipLanguage, diffStates, emptyProjectState, isSourceLanguage, languageVersionError, stateFromRows, sourceLanguageOf, speechLanguageOf, translatedState, TABLE_ORDER, type Command, type ProjectRows, type ProjectState } from "@/core";
import { envelope, seedProject } from "../helpers/fixtures";

function run(s: ProjectState, c: Command) {
  const result = applyCommand(s, envelope(c));
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

describe("G-1 source foundation", () => {
  it.each(["ja", "en", "nb"])("%s source survives targets, serialization and reversible source changes", language => {
    const seed = seedProject(2).state;
    const changed = run(seed, { type: "SetDialogueLanguage", target: "project", targetId: seed.project.id, language });
    const s = changed.state;
    expect(sourceLanguageOf(s)).toBe(language);
    expect(Object.values(s.blocks).every(b => b.language === language)).toBe(true);
    expect(translatedState(s, language)).toBe(s);
    const block = Object.values(s.blocks).find(b => b.kind === "dialogue");
    const production = Object.values(s.productions).find(p => p.kind === "main");
    if (!block || !production) throw new Error("fixture missing");
    expect(speechLanguageOf(s, "missing", block.id, null)).toBe(language);
    expect(clipLanguage({ kind: "dialogue" }, s)).toBe(language);
    expect(isSourceLanguage(s, "source")).toBe(true);
    expect(languageVersionError(s, { language, name: language, status: "active" })).toBe("source");
    for (const target of language === "ja" ? ["nb", "en"] : language === "en" ? ["nb", "ja"] : ["en", "ja"])
      expect(languageVersionError(s, { language: target, name: target, status: "active" })).toBeNull();
    const text = blocksOfVariant(s, block.variantId).map(b => b.text);
    expect(buildInterchange(s, { productionId: production.id, language }).language.dialogue).toBe(language);
    const patch = diffStates(emptyProjectState(s.project), s);
    const loaded = stateFromRows({ ...Object.fromEntries(TABLE_ORDER.map(table => [table, []])), script_block_revisions: [], project: { id: s.project.id, name: s.project.name, fps_num: 25, fps_den: 1, frame_width: 1920, frame_height: 1080, revision: s.project.revision, source_language: language }, ...patch.inserts } as unknown as ProjectRows);
    expect(sourceLanguageOf(loaded)).toBe(language);
    expect(blocksOfVariant(loaded, block.variantId).map(b => b.text)).toEqual(text);
    const undo = run(s, changed.inverse);
    expect(sourceLanguageOf(undo.state)).toBe("nb");
    const redo = run(undo.state, undo.inverse);
    expect(sourceLanguageOf(redo.state)).toBe(language);
    expect(Object.values(redo.state.blocks).map(b => b.text)).toEqual(Object.values(s.blocks).map(b => b.text));
  });
});