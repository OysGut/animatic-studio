// @vitest-environment node
/** Story Lab (SL1): promptbyggere – karakteren får bare det den vet; JSON-reparasjon; analysepunkter. */
import { describe, expect, it } from "vitest";
import {
  ANALYSIS_ASPECTS,
  ANALYSIS_ASPECT_LABEL,
  characterSystemPrompt,
  emptyStoryProfile,
  groupTurnMessages,
  knowledgeAt,
  mainProduction,
  newEngineState,
  orderedOccurrences,
  parseJsonLoose,
  profileFromJson,
  reduceEngine,
  sceneAnalysisFromJson,
  sceneAnalysisPrompt,
  type AssetId,
  type EngineAction,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const occs = orderedOccurrences(s0, mainProduction(s0)!.id);
const chars = Object.values(s0.assets).filter((a) => a.kind === "character");
const maja = chars[0]!.id as AssetId;
const anne = chars[1]!.id as AssetId;

describe("characterSystemPrompt", () => {
  it("tar ikke med andres hemmeligheter eller regissørens fakta (øyeblikksbilde)", () => {
    let s = s0;
    const add = (text: string, kind: "fact" | "secret", knownBy: AssetId[]) =>
      (s = mustApply(s, {
        type: "AddStoryFact",
        factId: tid(),
        fields: { text, kind, atSceneId: null, knownBy: knownBy.map((assetId) => ({ assetId, fromSceneId: null })) },
      } as never));
    add("ANNES-HEMMELIGHET: hun har gjemt brevet", "secret", [anne]);
    add("REGISSØR-FAKTUM: huset er solgt", "fact", []);
    add("Det er julaften", "fact", [maja, anne]);
    add("MAJAS-HEMMELIGHET: hun knuste vasen", "secret", [maja]);
    const prompt = characterSystemPrompt({
      name: "Maja",
      profile: { ...emptyStoryProfile(), psychology: { ...emptyStoryProfile().psychology, facade: "Glad" } },
      knowledge: knowledgeAt(s, maja, occs[0]!.sceneId),
      directions: [{ text: "Maja er bakfull" }],
      language: "nb",
    });
    expect(prompt).not.toContain("ANNES-HEMMELIGHET");
    expect(prompt).not.toContain("REGISSØR-FAKTUM");
    expect(prompt).toContain("Det er julaften");
    expect(prompt).toMatch(/# Your secrets \(hint only, never state outright\)\n- MAJAS-HEMMELIGHET/);
    expect(prompt).toMatch(/# Current state \(this moment only, not part of the personality\)\n- Maja er bakfull/);
    expect(prompt).toContain("Norwegian (Bokmal)");
    expect(prompt).toMatchSnapshot();
  });
});

describe("groupTurnMessages", () => {
  it("egne replikker som assistant, andre med navn, regi i systemtillegget, slutter med user", () => {
    const A = maja;
    const B = anne;
    const at = "2026-10-18T10:00:00.000Z";
    const s = [
      { type: "start" },
      { type: "ask", id: "q", text: "Hva skjedde?", to: A, at },
      { type: "appendLine", id: "1", speaker: A, text: "Ingenting.", at },
      { type: "appendLine", id: "2", speaker: B, text: "Ingenting?", at },
      { type: "direct", id: "d", text: "Maja blir nervøs", target: A, scope: "next", at },
      { type: "appendLine", id: "3", speaker: "analyst", text: "Analyse", at },
    ].reduce((x, a) => reduceEngine(x, a as EngineAction), newEngineState({ participants: [A, B], mode: "improv", seed: 1 }));
    const m = groupTurnMessages(s, A, { [A]: "Maja", [B]: "Anne" });
    expect(m.messages).toEqual([
      { role: "user", content: "Director: Hva skjedde?" },
      { role: "assistant", content: "Ingenting." },
      { role: "user", content: "Anne: Ingenting?" },
    ]);
    expect(m.systemAddition).toContain("Maja blir nervøs");
    const forB = groupTurnMessages(s, B, { [A]: "Maja", [B]: "Anne" });
    expect(forB.systemAddition).toBe("");
    expect(forB.messages.at(-1)!.role).toBe("user");
  });
});

describe("parseJsonLoose", () => {
  it.each([
    ['{"a":1}', { a: 1 }],
    ['```json\n{"a":1}\n```', { a: 1 }],
    ['Her er svaret: {"a":[1,2]} Håper det hjelper.', { a: [1, 2] }],
    ['{"a":1,}', { a: 1 }],
    ["{\u201Ca\u201D: \u201Cb\u201D}", { a: "b" }],
    ["ingen json her", null],
  ])("%s", (raw, want) => {
    expect(parseJsonLoose(raw)).toEqual(want);
  });
});

describe("scenanalyse og profilgenerator", () => {
  it("bruker de ti faste punktene, og beholder bare kjente blokk-ID-er", () => {
    expect(ANALYSIS_ASPECTS).toHaveLength(10);
    for (const a of ANALYSIS_ASPECTS) expect(ANALYSIS_ASPECT_LABEL[a]).toBeTruthy();
    const p = sceneAnalysisPrompt({ heading: "INT. STUA", blocks: [{ id: "b1", kind: "dialogue", text: "Hei" }], characters: [], language: "nb" });
    for (const a of ANALYSIS_ASPECTS) expect(p.system).toContain(`- ${a}:`);
    expect(p.system).toContain("Never invent events");
    const pts = sceneAnalysisFromJson(
      '{"points":[{"aspect":"conflict","finding":"f","evidence":["b1","oppdiktet"],"suggestion":"s","uncertain":true},{"aspect":"ukjent"}]}',
      ["b1"],
    )!;
    expect(pts).toEqual([{ aspect: "conflict", finding: "f", evidence: ["b1"], suggestion: "s", uncertain: true }]);
  });

  it("profilFromJson fyller ut tomme felt og avviser ugyldige profiler", () => {
    expect(profileFromJson('{"notes":"x","speech":{"mood":"glad"}}')!.speech).toMatchObject({ mood: "glad", level: "adult" });
    expect(profileFromJson('{"speech":{"level":"pirat"}}')).toBeNull();
  });
});
