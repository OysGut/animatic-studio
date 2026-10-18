// @vitest-environment node
/** SL4: karakter B får aldri fakta bare A vet, heller ikke via samtaleturer. */
import { expect, it } from "vitest";
import { activeDirections, characterSystemPrompt, emptyStoryProfile, groupTurnMessages, knowledgeAt, replayTurns, type AssetId, type Turn } from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

it("gruppeprompt for B utelater As hemmelighet og analyseturer (øyeblikksbilde)", () => {
  const chars = Object.values(fixture.state.assets).filter((a) => a.kind === "character");
  const a = chars[0]; const b = chars[1];
  if (!a || !b) throw new Error("fixture needs two characters");
  const secret = "MAJAS-HEMMELIGHET: hun knuste vasen";
  const s = mustApply(fixture.state, { type: "AddStoryFact", factId: tid(), fields: {
    text: secret, kind: "secret", atSceneId: null, knownBy: [{ assetId: a.id as AssetId, fromSceneId: null }],
  } } as never);
  const turns: Turn[] = [
    { id: "a", speaker: a.id, text: "God kveld.", kind: "line", at: "2026-10-18" },
    { id: "analysis", speaker: "analyst", text: secret, kind: "analysis", at: "2026-10-18" },
    { id: `d:next:${a.id}:id`, speaker: "director", text: secret, kind: "direction", at: "2026-10-18", to: a.id },
  ];
  const names = { [a.id]: "Maja", [b.id]: "Bestemor Anne" };
  const e = replayTurns({ participants: [a.id, b.id], mode: "improv", seed: 42 }, turns);
  const system = characterSystemPrompt({ name: names[b.id] ?? "Bestemor Anne", profile: emptyStoryProfile(), knowledge: knowledgeAt(s, b.id, ""),
    directions: activeDirections(e, b.id), language: "nb", names });
  const messages = groupTurnMessages(e, b.id, names);
  expect(system).not.toContain(secret);
  expect(JSON.stringify(messages)).not.toContain(secret);
  expect(messages.messages).toEqual([{ role: "user", content: "Maja: God kveld." }]);
  expect({ system, messages }).toMatchSnapshot();
});