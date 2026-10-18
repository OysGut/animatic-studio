// @vitest-environment node
import { expect, it } from "vitest";
import { runSceneBatch } from "@/app/storylab/scene-batch";
import { lineAndWordCount, sceneLabData } from "@/app/storylab/scene-lab-data";
import { fixture } from "../visual/fixture-state";
import { mainProduction, orderedOccurrences } from "@/core";
import type { StorySession } from "@/adapters/storylab/sessions.functions";

it("SL5 lagrer hver tur før neste kall og stopper ved åtte", async () => {
  const ids = Object.values(fixture.state.assets).filter((a) => a.kind === "character").map((a) => a.id).slice(0, 2);
  const events: string[] = [];
  const session = { context: { participants: ids, sceneId: null, profiles: {}, mode: "improv", seed: 1, situation: "Middag" }, turns: [] } as unknown as StorySession;
  await runSceneBatch({ state: fixture.state, session, language: "en", generate: async () => { events.push("generate"); return { text: "Hei", costUsd: 0.01, usedFallback: false }; }, save: async () => { events.push("save"); } });
  expect(events).toEqual(Array.from({ length: 8 }, () => ["generate", "save"]).flat());
});
it("SL5 leser hovedproduksjonens scene og teller replikker og ord", () => {
  const main = mainProduction(fixture.state); if (!main) throw new Error("Missing main");
  const scene = orderedOccurrences(fixture.state, main.id)[0]; if (!scene) throw new Error("Missing scene");
  const data = sceneLabData(fixture.state, scene.sceneId);
  expect(data.blocks.length).toBeGreaterThan(0);
  expect(lineAndWordCount([{ text: "Hei på deg" }, { text: "Ha det" }])).toEqual({ lines: 2, words: 5 });
});
