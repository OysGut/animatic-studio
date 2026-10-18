// @vitest-environment node
/** SL4: lagrede gruppeturer, målrettet regi, turgrense og determinisme. */
import { describe, expect, it } from "vitest";
import { activeDirections, replayTurns, reduceEngine, suggestSpeaker, type Turn } from "@/core";

const A = "a0000000-0000-7000-8000-000000000001";
const B = "b0000000-0000-7000-8000-000000000002";
const options = { participants: [A, B], mode: "improv" as const, seed: 42 };
const at = "2026-10-18T05:43:00.000Z";
const direction = (id: string, to?: string | null): Turn => ({ id, speaker: "director", text: "nervøs", kind: "direction", at, to });
const line = (id: string, speaker: string): Turn => ({ id, speaker, text: "Hei", kind: "line", at });

describe("replayTurns", () => {
  it("leser det gamle SL3-formatet og fjernet regi", () => {
    const d = `d:next:old-id`;
    const s = replayTurns(A, [direction(d)]);
    expect(activeDirections(s, A)).toMatchObject([{ target: A, scope: "next" }]);
    expect(replayTurns(A, [direction(d), direction(`r:${d}`)]).directions).toEqual([]);
  });
  it("leser gamle gruppe-ID-er med lagret mål og nye målrettede ID-er", () => {
    const s = replayTurns(options, [direction("d:session:old-id", B), direction(`d:scene:${A}:new-id`), direction("d:next:all:all-id")]);
    expect(activeDirections(s, A).map((d) => d.target)).toEqual([A, null]);
    expect(activeDirections(s, B).map((d) => d.target)).toEqual([B, null]);
    expect(s.directions.map((d) => d.scope)).toEqual(["session", "scene", "next"]);
  });
  it("next forsvinner bare etter målets replikk, ikke andre eller analysen", () => {
    const d = direction(`d:next:${A}:id`);
    const analysis: Turn = { id: "analysis", speaker: "analyst", kind: "analysis", text: "tolkning", at, to: A };
    expect(activeDirections(replayTurns(options, [d, line("b", B), analysis]), A)).toHaveLength(1);
    expect(activeDirections(replayTurns(options, [d, line("b", B), analysis, line("a", A)]), A)).toEqual([]);
  });
  it("pauser etter åtte turer i improvisasjon og kan gjenskape senere bolker", () => {
    const turns = Array.from({ length: 8 }, (_, i) => line(`t${i}`, i % 2 ? A : B));
    const s = replayTurns(options, turns);
    expect(s.status).toBe("paused");
    expect(s.turnsThisRun).toBe(8);
    const continued = replayTurns(options, [...turns, line("ninth", A)]);
    expect(continued.turns).toHaveLength(9);
    expect(continued.turnsThisRun).toBe(1);
  });
  it("gjenskaper talerforslag med samme seed og unngår tre like på rad", () => {
    const makeSequence = () => {
      let s = replayTurns(options, []);
      const speakers: string[] = [];
      for (let i = 0; i < 8; i++) {
        const speaker = suggestSpeaker(s);
        if (!speaker) throw new Error("missing speaker");
        speakers.push(speaker);
        s = reduceEngine(s, { type: "appendLine", id: String(i), speaker, text: "Hei", at });
      }
      return speakers;
    };
    const first = makeSequence();
    expect(first).toEqual(makeSequence());
    expect(first).toHaveLength(8);
    expect(first.every((p, i) => i < 2 || p !== first[i - 1] || p !== first[i - 2])).toBe(true);
  });
  it("beholder rettede spørsmål og flere taleres replikker", () => {
    const q: Turn = { id: "q", speaker: "director", text: "Hva nå?", kind: "question", to: B, at };
    expect(suggestSpeaker(replayTurns(options, [q]))).toBe(B);
    expect(replayTurns(options, [q, line("b", B), line("a", A)]).turns.map((t) => t.speaker)).toEqual(["director", B, A]);
  });
});