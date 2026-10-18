/** SL6: reopen only after a successful persisted undo, including multi-step transfers. */
import { createElement } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useCommands } from "@/app/project/use-commands";
import { projectStateKey } from "@/app/project/use-project";
import { blocksOfVariant, mainProduction, orderedOccurrences, suggestionToCommands } from "@/core";
import { fixture } from "../visual/fixture-state";
const h = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/adapters/storage/commands.functions", () => ({ runCommand: (args: unknown) => h.run(args) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const state = fixture.state, main = mainProduction(state);
  if (!main) throw new Error("Missing main");
  const scene = orderedOccurrences(state, main.id)[0], asset = Object.values(state.assets).find((a) => a.kind === "character");
  if (!scene || !asset) throw new Error("Missing fixture");
  const block = blocksOfVariant(state, scene.variantId)[0];
  if (!block) throw new Error("Missing block");
  qc.setQueryData(projectStateKey(state.project.id), state);
  const onUndo = vi.fn();
  const hook = renderHook(() => useCommands(state.project.id, "00000000-0000-7000-8000-000000000001", true, onUndo), { wrapper: ({ children }) => createElement(QueryClientProvider, { client: qc }, children) });
  const plan = suggestionToCommands(state, { id: "s", kind: "line", payload: { speaker: asset.id, text: "Ny" } }, { productionId: main.id, variantId: scene.variantId, afterBlockId: block.id });
  if (!plan.ok) throw new Error(plan.message);
  return { ...hook, plan, onUndo };
}
it("successful group undo notifies exactly once after both inverse writes", async () => {
  h.run.mockResolvedValue({ ok: true, inverse: null, affected: [], revisions: {} });
  const s = setup();
  for (const c of s.plan.commands) await act(async () => { expect((await s.result.current.runAndWait(c, "Transfer", "storylab:s:1")).error).toBeNull(); });
  await act(async () => { s.result.current.undo(); await s.result.current.whenIdle(); });
  await waitFor(() => expect(s.onUndo).toHaveBeenCalledExactlyOnceWith("storylab:s:1"));
  expect(h.run).toHaveBeenCalledTimes(4);
});
it("a rejected undo does not reopen the suggestion", async () => {
  h.run.mockResolvedValue({ ok: true, inverse: null, affected: [], revisions: {} });
  const s = setup();
  for (const c of s.plan.commands) await act(async () => { await s.result.current.runAndWait(c, "Transfer", "storylab:s:1"); });
  h.run.mockResolvedValue({ ok: false, code: "forbidden", message: "Rejected" });
  await act(async () => { s.result.current.undo(); await s.result.current.whenIdle(); });
  expect(s.onUndo).not.toHaveBeenCalled();
  expect(s.result.current.status.kind).toBe("error");
});