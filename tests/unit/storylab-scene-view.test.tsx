/** SL5: kostnadsport, lagret analyse, replikksjekk og variantgrener med mockede tjenester. */
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SceneLab } from "@/app/storylab/SceneLab";
import { ANALYSIS_ASPECTS, mainProduction, orderedOccurrences } from "@/core";
import { fixture } from "../visual/fixture-state";
import { sceneLabData } from "@/app/storylab/scene-lab-data";
import type { StorySession } from "@/adapters/storylab/sessions.functions";
const h = vi.hoisted(() => ({ gen: vi.fn(), create: vi.fn(), append: vi.fn(), fork: vi.fn(), suggest: vi.fn(), list: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/adapters/ai/text.functions", () => ({ generateText: (arg: unknown) => h.gen(arg) }));
vi.mock("@/adapters/storylab/sessions.functions", () => ({ createStorySession: (arg: unknown) => h.create(arg), appendStoryTurns: (arg: unknown) => h.append(arg), forkStorySession: (arg: unknown) => h.fork(arg), saveStorySuggestion: (arg: unknown) => h.suggest(arg), getStorySession: vi.fn(), listStorySessions: (arg: unknown) => h.list(arg) }));
vi.mock("@/adapters/ai/provider-keys.functions", () => ({ listTextChoices: vi.fn() }));
vi.mock("@/app/storylab/GroupConversationView", () => ({ GroupConversationView: () => null }));
vi.mock("@/app/storylab/storylab-data", async (importOriginal) => ({ ...await importOriginal<Record<string, unknown>>(), useTextEstimate: () => ({ usd: 0.01, label: "Test model", loading: false, error: null }) }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); h.list.mockResolvedValue({ ok: true, sessions: [] }); });
function setup(initial?: StorySession) {
  const main = mainProduction(fixture.state); if (!main) throw new Error("Missing main");
  const scenes = orderedOccurrences(fixture.state, main.id);
  const scene = scenes.find((o) => sceneLabData(fixture.state, o.sceneId).participants.length >= 2); if (!scene) throw new Error("Missing participants");
  const data = sceneLabData(fixture.state, scene.sceneId);
  const points = ANALYSIS_ASPECTS.map((aspect) => ({ aspect, finding: "Finding", evidence: [data.blocks[0]?.id ?? ""], suggestion: "Suggestion", uncertain: false }));
  const session: StorySession = initial ?? { id: "session", kind: "scene_analysis", title: "Scene", status: "active", costUsd: 0, createdBy: "u", createdAt: "now", updatedAt: "now", parentSessionId: null, fromTurn: null, context: { sceneId: scene.sceneId }, turns: [] };
  h.create.mockResolvedValue({ ok: true, session }); h.append.mockResolvedValue({ ok: true, turns: 1, costUsd: 0.02 });
  h.gen.mockResolvedValue({ ok: true, text: JSON.stringify({ points }), costUsd: 0.02, usedFallback: false });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(createElement(QueryClientProvider, { client: qc }, createElement(SceneLab, { state: fixture.state, projectId: "project", sceneId: scene.sceneId, editable: true, ...(initial ? { initialSession: initial } : {}) })));
  return { session, scene, data, points, qc };
}
it("analyse krever samtykke og lagrer én JSON-tur med alle ti punkter", async () => {
  const s = setup(); fireEvent.click(screen.getByTestId("storylab-analyze")); expect(h.gen).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId("storylab-scene-confirm")); await waitFor(() => expect(h.append).toHaveBeenCalledTimes(1));
  expect(h.gen.mock.calls[0]?.[0]).toMatchObject({ data: { task: "storylab_analysis", json: true } });
  expect(h.append.mock.calls[0]?.[0]).toMatchObject({ data: { turns: [{ kind: "analysis", text: JSON.stringify({ points: s.points }) }], addCostUsd: 0.02 } });
  expect(s.qc.getQueryData(["story-session", "project", s.session.id])).toMatchObject({ ok: true, session: { turns: [{ kind: "analysis" }] } });
});
it("mislykket analyselagring prøves igjen uten et nytt betalt kall", async () => {
  setup(); h.append.mockResolvedValueOnce({ ok: false, message: "Save failed" });
  fireEvent.click(screen.getByTestId("storylab-analyze")); fireEvent.click(screen.getByTestId("storylab-scene-confirm"));
  await screen.findByRole("alert"); fireEvent.click(screen.getByRole("button", { name: "Prøv igjen" }));
  await waitFor(() => expect(h.append).toHaveBeenCalledTimes(2)); expect(h.gen).toHaveBeenCalledTimes(1);
});
it("replikksjekk bruker analysis-task og lagrer resultat med permanent blokk-ID", async () => {
  const s = setup(); h.gen.mockResolvedValue({ ok: true, text: JSON.stringify({ verdict: "no", reasons: [{ text: "Wrong voice", evidence: ["profile.speech.level"] }], rewrite: "Hei" }), costUsd: 0.02, usedFallback: false });
  fireEvent.click(screen.getAllByTestId("storylab-line-check")[0] ?? (() => { throw new Error("No line"); })());
  fireEvent.click(screen.getByTestId("storylab-scene-confirm")); await waitFor(() => expect(h.append).toHaveBeenCalledTimes(1));
  const call = h.append.mock.calls[0]?.[0]; const saved = JSON.parse(call.data.turns[0].text);
  expect(saved.result.verdict).toBe("no"); expect(s.data.blocks.some((b) => b.id === saved.blockId)).toBe(true);
  expect(h.gen.mock.calls[0]?.[0]).toMatchObject({ data: { task: "storylab_analysis", json: true } });
});
it("lagret sceneanalyse åpnes uten nytt AI-kall", async () => {
  const main = mainProduction(fixture.state); if (!main) throw new Error("Missing main");
  const scene = orderedOccurrences(fixture.state, main.id).find((o) => sceneLabData(fixture.state, o.sceneId).participants.length >= 2); if (!scene) throw new Error("Missing scene");
  const initial = { id: "stored", kind: "scene_analysis", context: { sceneId: scene.sceneId }, turns: [{ id: "analysis", kind: "analysis", text: JSON.stringify({ points: ANALYSIS_ASPECTS.map((aspect) => ({ aspect, finding: "Finding", evidence: [], suggestion: "Suggestion", uncertain: false })) }) }], costUsd: 0.02 } as unknown as StorySession;
  setup(initial); expect(h.gen).not.toHaveBeenCalled(); expect(h.create).not.toHaveBeenCalled();
});
it("A B C forgrenes tomt, får øktregi og kjører 24 sekvensielle kall", async () => {
  const main = mainProduction(fixture.state); if (!main) throw new Error("Missing main");
  const scene = orderedOccurrences(fixture.state, main.id).find((o) => sceneLabData(fixture.state, o.sceneId).participants.length >= 2); if (!scene) throw new Error("Missing scene");
  const participants = sceneLabData(fixture.state, scene.sceneId).participants.map((a) => a.id);
  const initial = { id: "improv", kind: "scene_improv", title: "Scene", context: { sceneId: scene.sceneId, participants, profiles: {}, seed: 1, mode: "improv", situation: "Middag" }, turns: [], costUsd: 0 } as unknown as StorySession;
  setup(initial);
  let active = 0, maximum = 0;
  h.gen.mockImplementation(async () => { active++; maximum = Math.max(maximum, active); await Promise.resolve(); active--; return { ok: true, text: "Hei", costUsd: 0.01, usedFallback: false }; });
  let count = 0;
  h.fork.mockImplementation(async ({ data }) => ({ ok: true, session: { ...initial, id: `branch-${++count}`, title: data.title, parentSessionId: initial.id, turns: [] } }));
  fireEvent.click(screen.getByTestId("storylab-variants"));
  for (const letter of ["a", "b", "c"]) fireEvent.change(screen.getByTestId(`storylab-variant-${letter}`), { target: { value: `Direction ${letter}` } });
  expect(h.gen).not.toHaveBeenCalled(); fireEvent.click(screen.getByTestId("storylab-scene-confirm"));
  await waitFor(() => expect(h.gen).toHaveBeenCalledTimes(24));
  await waitFor(() => expect(h.append).toHaveBeenCalledTimes(30));
  expect(maximum).toBe(1);
  expect(h.fork.mock.calls.map(([arg]) => arg.data.fromTurn)).toEqual([-1, -1, -1]);
  expect(h.fork.mock.calls.map(([arg]) => arg.data.title.slice(-1))).toEqual(["A", "B", "C"]);
  expect(h.gen.mock.calls[0]?.[0].data.system).toContain("Direction a");
  expect(h.gen.mock.calls[8]?.[0].data.system).toContain("Direction b");
  expect(h.gen.mock.calls[16]?.[0].data.system).toContain("Direction c");
});
