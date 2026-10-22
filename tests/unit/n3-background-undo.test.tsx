/** DV5-rest (N3): et bakgrunnsresultat lagt inn av serveren angres fra den lokale angrelisten som en vanlig kommando. */
import { createElement } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { adoptServerHistory, adoptedServerCommands, serverHistoryEntry, useCommands } from "@/app/project/use-commands";
import { ownCommandIds, projectStateKey } from "@/app/project/use-project";
import { batchesStartedHere, batchesToAdopt, rowsToAdopt, seenOpenItems } from "@/app/library/background-history";
import { applyCommand, blocksOfVariant, mainProduction, orderedOccurrences, suggestionToCommands, type ProjectState } from "@/core";
import { fixture } from "../visual/fixture-state";

const h = vi.hoisted(() => ({ run: vi.fn(), speech: vi.fn() }));
vi.mock("@/adapters/storage/commands.functions", () => ({ runCommand: (args: unknown) => h.run(args) }));
// Ingen betalte kall: talegenerering skal aldri nås fra angring
vi.mock("@/adapters/ai/speech.functions", () => ({ generateSpeech: h.speech, listSpeechModels: h.speech }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const ACTOR = "00000000-0000-7000-8000-000000000001";

/** «Serveren» legger inn et resultat: en kommando på fixturen, med inversen slik kommandologgen lagrer den. */
function serverResult() {
  const state = fixture.state;
  const main = mainProduction(state)!;
  const scene = orderedOccurrences(state, main.id)[0]!;
  const asset = Object.values(state.assets).find((a) => a.kind === "character")!;
  const block = blocksOfVariant(state, scene.variantId)[0]!;
  const plan = suggestionToCommands(state, { id: "bg", kind: "line", payload: { speaker: asset.id, text: "Bakgrunn" } }, { productionId: main.id, variantId: scene.variantId, afterBlockId: block.id });
  if (!plan.ok) throw new Error(plan.message);
  const commandId = crypto.randomUUID();
  const applied = applyCommand(state, { id: commandId as never, actor: ACTOR as never, at: new Date().toISOString(), command: plan.commands[0]! });
  if (!applied.ok) throw new Error(applied.error.message);
  return { variantId: scene.variantId, before: state, after: applied.state as ProjectState, row: { commandId, inverse: applied.inverse, affected: applied.affected } };
}

function mount(state: ProjectState, serverHistory = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(projectStateKey(state.project.id), state);
  const hook = renderHook(() => useCommands(state.project.id, ACTOR, true, undefined, false, serverHistory), { wrapper: ({ children }) => createElement(QueryClientProvider, { client: qc }, children) });
  return { ...hook, qc };
}

it("et bakgrunnsresultat på angrelisten angres med den lagrede inversen via runCommand", async () => {
  h.run.mockResolvedValue({ ok: true, inverse: null, affected: [], revisions: {} });
  const r = serverResult();
  const m = mount(r.after);
  expect(m.result.current.canUndo).toBe(false);
  act(() => { expect(adoptServerHistory(r.after.project.id, [r.row], "Legg inn bakgrunnsresultat")).toBe(1); });
  expect(m.result.current.canUndo).toBe(true);
  expect(m.result.current.undoLabel).toBe("Legg inn bakgrunnsresultat");
  expect(ownCommandIds.has(r.row.commandId)).toBe(true);
  await act(async () => { m.result.current.undo(); await m.result.current.whenIdle(); });
  expect(h.run).toHaveBeenCalledTimes(1);
  const sent = (h.run.mock.calls[0]![0] as { data: { command: unknown } }).data.command;
  expect(sent).toEqual(r.row.inverse);
  // Etter angring kan resultatet gjøres om, og ingen betalte kall er gjort
  expect(m.result.current.canRedo).toBe(true);
  expect(h.speech).not.toHaveBeenCalled();
  const local = m.qc.getQueryData<ProjectState>(projectStateKey(r.after.project.id))!;
  const ids = (st: ProjectState) => blocksOfVariant(st, r.variantId).map((b) => b.id);
  expect(ids(r.after).length).toBe(ids(r.before).length + 1);
  expect(ids(local)).toEqual(ids(r.before));
});

it("samme resultat legges aldri inn to ganger, og venter til en angreliste er montert", () => {
  const r = serverResult();
  const pid = r.after.project.id;
  expect(adoptServerHistory(pid, [r.row], "x")).toBe(1);
  expect(adoptServerHistory(pid, [r.row], "x")).toBe(0);
  const m = mount(r.after);
  expect(m.result.current.canUndo).toBe(true);
  const other = mount(r.after, false);
  expect(other.result.current.canUndo).toBe(false);
  expect(adoptedServerCommands.has(r.row.commandId)).toBe(true);
});

it("ugyldige rader fra serveren blir ikke angresteg", () => {
  expect(serverHistoryEntry({ commandId: "", inverse: { type: "X" } as never, affected: [] }, "x", 0)).toBeNull();
  expect(serverHistoryEntry({ commandId: "a", inverse: {} as never, affected: [] }, "x", 0)).toBeNull();
});

it("bare resultater som ble ferdige i økten, eller fra jobber startet her, hentes", () => {
  const job = (id: string, items: [string, string][]) => ({ id, items: items.map(([i, status]) => ({ id: i, status })) });
  // Ferdig allerede da panelet ble åpnet: ikke angrebart
  expect(batchesToAdopt([job("old", [["o1", "done"]])])).toEqual([]);
  // Sett mens den ventet, så ferdig
  expect(batchesToAdopt([job("b", [["i1", "waiting"]])])).toEqual([]);
  expect(seenOpenItems.has("i1")).toBe(true);
  expect(batchesToAdopt([job("b", [["i1", "done"]])])).toEqual(["b"]);
  const rows = rowsToAdopt("b", [{ itemId: "i1", commandId: "c-i1" }, { itemId: "o1", commandId: "c-o1" }]);
  expect(rows.map((x) => x.itemId)).toEqual(["i1"]);
  expect(batchesToAdopt([job("b", [["i1", "done"]])])).toEqual([]);
  batchesStartedHere.add("new");
  expect(batchesToAdopt([job("new", [["n1", "done"]])])).toEqual(["new"]);
});
