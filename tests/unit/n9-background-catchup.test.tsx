/** N9 (KI-22): et resultat som blir ferdig mens massegenereringspanelet er lukket, kommer på angrelisten neste gang arbeidsflaten åpnes. */
import { createElement } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { registerServerHistoryCatchUp, adoptServerHistory, useCommands } from "@/app/project/use-commands";
import { projectStateKey } from "@/app/project/use-project";
import { batchesToAdopt, catchUpProject, watchBatches, watchedBatches } from "@/app/library/background-history";
import { applyCommand, blocksOfVariant, mainProduction, orderedOccurrences, suggestionToCommands, type ProjectState } from "@/core";
import { fixture } from "../visual/fixture-state";

const h = vi.hoisted(() => ({ run: vi.fn(), speech: vi.fn() }));
vi.mock("@/adapters/storage/commands.functions", () => ({ runCommand: (args: unknown) => h.run(args) }));
vi.mock("@/adapters/ai/speech.functions", () => ({ generateSpeech: h.speech, listSpeechModels: h.speech }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const ACTOR = "00000000-0000-7000-8000-000000000001";

function serverResult() {
  const state = fixture.state;
  const main = mainProduction(state)!;
  const scene = orderedOccurrences(state, main.id)[0]!;
  const asset = Object.values(state.assets).find((a) => a.kind === "character")!;
  const block = blocksOfVariant(state, scene.variantId)[0]!;
  const plan = suggestionToCommands(state, { id: "bg9", kind: "line", payload: { speaker: asset.id, text: "Lukket panel" } }, { productionId: main.id, variantId: scene.variantId, afterBlockId: block.id });
  if (!plan.ok) throw new Error(plan.message);
  const commandId = crypto.randomUUID();
  const applied = applyCommand(state, { id: commandId as never, actor: ACTOR as never, at: new Date().toISOString(), command: plan.commands[0]! });
  if (!applied.ok) throw new Error(applied.error.message);
  return { after: applied.state as ProjectState, commandId, inverse: applied.inverse, affected: applied.affected };
}

function mount(state: ProjectState) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(projectStateKey(state.project.id), state);
  return renderHook(() => useCommands(state.project.id, ACTOR, true, undefined, false, true), { wrapper: ({ children }) => createElement(QueryClientProvider, { client: qc }, children) });
}

it("resultat ferdig mens panelet er lukket legges på angrelisten når arbeidsflaten åpnes igjen, og angres uten betalte kall", async () => {
  h.run.mockResolvedValue({ ok: true, inverse: null, affected: [], revisions: {} });
  const r = serverResult();
  const projectId = r.after.project.id;
  // Panelet var åpent og så elementet i arbeid, så ble det lukket (ingen flere hentinger fra panelet)
  const running = [{ id: "job-9", items: [{ id: "item-9", status: "running" }] }];
  expect(batchesToAdopt(running)).toEqual([]);
  watchBatches(projectId, running);
  expect(watchedBatches.get(projectId)?.has("job-9")).toBe(true);

  const list = vi.fn(async () => [{ id: "job-9", items: [{ id: "item-9", status: "done" }] }]);
  const history = vi.fn(async () => [{ itemId: "item-9", commandId: r.commandId, inverseJson: JSON.stringify(r.inverse), affected: r.affected }]);
  registerServerHistoryCatchUp((id) => { void catchUpProject(id, { list, history, adopt: (pid, rows) => adoptServerHistory(pid, rows, "Legg inn bakgrunnsresultat") }); });

  // Arbeidsflaten åpnes på nytt i samme økt
  const m = mount(r.after);
  await waitFor(() => expect(m.result.current.canUndo).toBe(true));
  expect(m.result.current.undoLabel).toBe("Legg inn bakgrunnsresultat");
  expect(list).toHaveBeenCalledWith(projectId);
  expect(watchedBatches.has(projectId)).toBe(false);

  await act(async () => { m.result.current.undo(); await m.result.current.whenIdle(); });
  expect((h.run.mock.calls[0]![0] as { data: { command: unknown } }).data.command).toEqual(r.inverse);
  expect(h.speech).not.toHaveBeenCalled();

  // Ny åpning henter ikke det samme igjen
  cleanup();
  const again = mount(r.after);
  await new Promise((res) => setTimeout(res, 20));
  expect(again.result.current.canUndo).toBe(false);
  expect(history).toHaveBeenCalledTimes(1);
});

it("prosjekter uten fulgte jobber gjør ingen oppslag", async () => {
  const list = vi.fn(async () => []);
  expect(await catchUpProject("ukjent", { list, history: vi.fn(), adopt: vi.fn() })).toBe(0);
  expect(list).not.toHaveBeenCalled();
});
