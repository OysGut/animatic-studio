// @vitest-environment node
import { describe, expect, it } from "vitest";
import { emptyStoryProfile, knowledgeAt, lineCheckFromJson, lineCheckPrompt, mainProduction, orderedOccurrences } from "@/core";
import { fixture } from "../visual/fixture-state";
import { mustApply, tid } from "../helpers/fixtures";

describe("SL5 replikksjekk", () => {
  it("sender bare talerens kunnskap, og begrenser tidligere dialog til tolv", () => {
    const chars = Object.values(fixture.state.assets).filter((a) => a.kind === "character");
    const a = chars[0], b = chars[1], main = mainProduction(fixture.state);
    if (!a || !b || !main) throw new Error("Missing fixture");
    const scene = orderedOccurrences(fixture.state, main.id)[0];
    if (!scene) throw new Error("Missing scene");
    let s = fixture.state;
    for (const [text, id] of [["OWN_SECRET", a.id], ["OTHER_SECRET", b.id]] as const) s = mustApply(s, { type: "AddStoryFact", factId: tid(), fields: { text, kind: "secret", atSceneId: null, knownBy: [{ assetId: id, fromSceneId: null }] } } as never);
    const p = lineCheckPrompt({ name: a.name, profile: emptyStoryProfile(), knowledge: knowledgeAt(s, a.id, scene.sceneId), sceneHeading: "INT. STUA", before: Array.from({ length: 15 }, (_, i) => `dialogue-${i}`), line: "Jeg vet alt.", language: "en" });
    expect(p.system).toContain("OWN_SECRET"); expect(p.system).not.toContain("OTHER_SECRET");
    expect(p.user).not.toContain("dialogue-0\n"); expect(p.user).toContain("dialogue-3\n");
    expect(p).toMatchSnapshot();
  });
  it.each(["no json", '{"verdict":"no","reasons":[{"text":"x","evidence":["profile.speech.inventedField"]}]}', '{"verdict":"maybe","reasons":[]}', '{"verdict":"no","reasons":[{"text":"x","evidence":["other.secret"]}]}'])("avviser ugyldig svar %s", (raw) => expect(lineCheckFromJson(raw)).toBeNull());
  it("validerer vurdering, profilkilder og omskriving", () => expect(lineCheckFromJson('```json\n{"verdict":"no","reasons":[{"text":"For voksent","evidence":["profile.speech.level","knowledge"]}],"rewrite":"Hei"}\n```')).toEqual({ verdict: "no", reasons: [{ text: "For voksent", evidence: ["profile.speech.level", "knowledge"] }], rewrite: "Hei" }));
});
