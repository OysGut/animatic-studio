// @vitest-environment node
/** Story Lab SL7: intervjuprompten og forslag til noder fra intervjuet. */
import { describe, expect, it } from "vitest";
import {
  canvasNodeDefaults,
  canvasSummary,
  interviewNodesFromJson,
  interviewSystemPrompt,
  interviewToNodesPrompt,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

describe("interviewSystemPrompt", () => {
  it("tar aldri med hemmeligheter fra story_facts (øyeblikksbilde)", () => {
    let s = mustApply(fixture.state, {
      type: "AddStoryFact",
      factId: tid(),
      fields: { text: "HEMMELIGHET: brevet er gjemt", kind: "secret", atSceneId: null, knownBy: [] },
    } as never);
    s = mustApply(s, {
      type: "AddStoryFact",
      factId: tid(),
      fields: { text: "REGISSØR-FAKTUM: huset er solgt", kind: "fact", atSceneId: null, knownBy: [] },
    } as never);
    s = mustApply(s, {
      type: "AddCanvasNodes",
      nodes: [
        { id: "00000000-0000-7000-8000-c0000000000a" as never, ...canvasNodeDefaults("premise", { title: "Jul på fjellet", body: "En familie samles" }) },
        { id: "00000000-0000-7000-8000-c0000000000b" as never, ...canvasNodeDefaults("character", { title: "Bestemor" }) },
      ],
    });
    const prompt = interviewSystemPrompt({ language: "nb", canvasSummary: canvasSummary(s), projectTitle: "Testfilm" });
    expect(prompt).not.toContain("HEMMELIGHET");
    expect(prompt).not.toContain("REGISSØR-FAKTUM");
    expect(prompt).toContain("[premise] Jul på fjellet: En familie samles");
    expect(prompt).toContain("Norwegian (Bokmal)");
    expect(prompt).toMatch(/one or two questions at a time/);
    expect(prompt).toMatchSnapshot();
  });

  it("følger grensesnittspråket og kutter canvasteksten ved 4000 tegn", () => {
    const p = interviewSystemPrompt({ language: "en", canvasSummary: "x".repeat(5000), projectTitle: "" });
    expect(p).toContain("Always answer in English.");
    expect(p).not.toContain("x".repeat(4001));
  });
});

describe("interviewToNodesPrompt", () => {
  it("ber om JSON og tar med samtalen", () => {
    const p = interviewToNodesPrompt({ language: "nb", canvasSummary: "", transcript: [{ role: "user", content: "Det handler om jul" }] });
    expect(p.system).toContain('"nodes"');
    expect(p.user).toContain("Filmmaker: Det handler om jul");
  });
});

describe("interviewNodesFromJson", () => {
  it("leser gyldige noder og kanter og hopper over ugyldige", () => {
    const r = interviewNodesFromJson(
      "```json\n" +
        JSON.stringify({
          nodes: [
            { tempId: "n1", kind: "premise", title: "Jul", body: "b" },
            { tempId: "n2", kind: "character", title: "Anne", body: "" },
            { tempId: "n3", kind: "ukjent", title: "x" },
            { tempId: "n1", kind: "idea", title: "dublett" },
            { tempId: "n4", kind: "group", title: "gruppe" },
            { tempId: "n5", kind: "idea", title: "" },
          ],
          edges: [
            { from: "n1", to: "n2", kind: "leads_to", label: "fordi" },
            { from: "n1", to: "n3", kind: "leads_to" },
            { from: "n1", to: "n1", kind: "causes" },
            { from: "n2", to: "n1", kind: "nope" },
          ],
        }) +
        "\n```",
    );
    expect(r).not.toBeNull();
    expect(r!.nodes.map((n) => n.tempId)).toEqual(["n1", "n2"]);
    expect(r!.edges).toEqual([{ from: "n1", to: "n2", kind: "leads_to", label: "fordi" }]);
  });

  it("gir null for svar som ikke kan brukes", () => {
    expect(interviewNodesFromJson("ikke json")).toBeNull();
    expect(interviewNodesFromJson('{"nodes":[]}')).toBeNull();
    expect(interviewNodesFromJson('{"nodes":"x"}')).toBeNull();
  });
});
