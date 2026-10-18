// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classifySuggestion } from "@/core/library/classify";
import { nounForms, LEXICON_FORMS } from "@/core/library/lexicon";
import { classificationFromJson, classifyEntitiesPrompt } from "@/core/library/classification-prompt";
import { blocksOfVariant, librarySuggestions, orderedOccurrences } from "@/core";
import { seedProject } from "../helpers/fixtures";

describe("OG1 lexical classification", () => {
  it("supports Bokmål, Nynorsk and English noun forms", () => {
    expect(nounForms("katt")).toContain("kattene");
    expect(nounForms("høne")).toContain("høna");
    expect(nounForms("butterfly")).toContain("butterflies");
    for (const [word, kind] of [["kyr", "animal"], ["aure", "animal"], ["spøkjelse", "character"], ["kjøkenet", "location"], ["wolves", "animal"]]) expect(LEXICON_FORMS.get(word ?? "")?.kind).toBe(kind);
  });
  it.each(["KATTEN", "MÅNS (KATT)"])("classifies animal speaker %s", (name) => {
    expect(classifySuggestion({ name, speaker: true })).toMatchObject({ kind: "animal", confidence: "high" });
  });
  it("classifies human speakers", () => expect(classifySuggestion({ name: "MAJA", speaker: true }).kind).toBe("character"));
  it.each(["katten Måns går ut.", "Svarten, hesten, står stille.", "Den gamle hesten Svarten går inn."])("recognizes animal apposition: %s", (context) => {
    expect(classifySuggestion({ name: context.includes("Måns") ? "Måns" : "Svarten", contexts: [context] }).kind).toBe("animal");
  });
  it("recognizes animal verbs", () => expect(classifySuggestion({ name: "Svarten", contexts: ["Svarten vrinsker."] }).kind).toBe("animal"));
  it("recognizes living verbs", () => expect(classifySuggestion({ name: "Ole", contexts: ["Ole roper."] }).kind).toBe("character"));
  it("recognizes sound cues", () => expect(classifySuggestion({ name: "Knirk", contexts: ["Vi hører Knirk fra gulvet."] }).kind).toBe("sound"));
  it("recognizes specific places and landscapes in headings", () => {
    expect(classifySuggestion({ name: "KJØKKENET", heading: true }).kind).toBe("location");
    expect(classifySuggestion({ name: "SKOGEN", heading: true }).kind).toBe("environment");
  });
  it("does not blindly label unknown capitalized things as characters", () => expect(classifySuggestion({ name: "Glitterding" })).toMatchObject({ kind: "object", confidence: "low" }));
  it("retains animals and supernatural beings from synthetic manuscript excerpts plus appositions", () => {
    const { state, mainId } = seedProject(1);
    const occurrence = orderedOccurrences(state, mainId)[0];
    if (!occurrence) throw new Error("missing scene");
    const block = blocksOfVariant(state, occurrence.variantId).find((b) => b.kind === "action");
    if (!block) throw new Error("missing action");
    // First sentence is the existing synthetic visual fixture's animal excerpt; other sentences exercise named species.
    const text = "Det knirker i gulvet. En katt stryker forbi døra. Den gamle hesten Svarten vrinsker. Katten Måns mjauer. En nisse og et troll går inn.";
    const changed = { ...state, blocks: { ...state.blocks, [block.id]: { ...block, text } } };
    const suggestions = librarySuggestions(changed, mainId);
    for (const name of ["katt", "hest", "Svarten", "Måns"]) expect(suggestions.find((s) => s.name === name)?.kind, name).toBe("animal");
    for (const name of ["nisse", "troll"]) expect(suggestions.find((s) => s.name === name)?.kind).toBe("character");
  });
});
describe("OG1 bounded AI classification", () => {
  it("tolerates invalid JSON and rejects unknown kinds and confidence", () => {
    expect(classificationFromJson("not JSON")).toEqual([]);
    expect(classificationFromJson('{"items":[{"name":"Måns","kind":"dragon","confidence":"high","reason":"x"}]}')).toEqual([]);
    expect(classificationFromJson('{"items":[{"name":"Måns","kind":"animal","confidence":"certain","reason":"x"}]}')).toEqual([]);
    expect(classificationFromJson('```json\n{"items":[{"name":"Måns","kind":"animal","confidence":"high","reason":"cat","aliasOf":"Katten"}]}\n```')[0]?.aliasOf).toBe("Katten");
  });
  it("only includes two 300-character excerpts per candidate and no unrelated context", () => {
    const p = classifyEntitiesPrompt({ candidates: [{ name: "Måns" }], contexts: { Måns: ["a".repeat(500), "b".repeat(400), "secret third excerpt"], Other: ["unrelated context"] }, language: "en" });
    expect(JSON.parse(p.user)).toEqual([{ name: "Måns", excerpts: ["a".repeat(300), "b".repeat(300)] }]);
    expect(p.system).toContain("Write reasons in English");
    expect(p.user).not.toContain("secret");
  });
  it("keeps the entity prompt input snapshot limited to names and excerpts", () => {
    const prompt = classifyEntitiesPrompt({ candidates: [{ name: "Måns" }], contexts: { Måns: ["Katten Måns mjauer."], omitted: ["Entire script must not be sent"] }, language: "nb" });
    expect(JSON.parse(prompt.user)).toMatchInlineSnapshot(`
      [
        {
          "excerpts": [
            "Katten Måns mjauer.",
          ],
          "name": "Måns",
        },
      ]
    `);
  });
  it("retains animal information in a parenthesized speaker description", () => {
    const { state, mainId } = seedProject(1);
    const speaker = Object.values(state.blocks).find((b) => b.kind === "character");
    if (!speaker) throw new Error("missing speaker");
    const changed = { ...state, blocks: { ...state.blocks, [speaker.id]: { ...speaker, text: "MÅNS (KATT)" } } };
    expect(librarySuggestions(changed, mainId).find((s) => s.name === "MÅNS")).toMatchObject({ kind: "animal", confidence: "high" });
  });
});