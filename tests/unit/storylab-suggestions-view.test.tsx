/** SL6: preview consent, persisted transfer, status failure and partial-transfer recovery. */
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SuggestionsPanel } from "@/app/storylab/SuggestionsPanel";
import { blocksOfVariant, mainProduction, orderedOccurrences } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import type { StorySuggestion } from "@/adapters/storylab/sessions.functions";
import { suggestionKey } from "@/app/storylab/suggestions-data";
import { fixture } from "../visual/fixture-state";
const h = vi.hoisted(() => ({ list: vi.fn(), status: vi.fn(), run: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/app/script/Inspector", () => ({ ForkNotice: () => null }));
vi.mock("@/adapters/storylab/sessions.functions", () => ({ listStorySuggestions: (a: unknown) => h.list(a), setSuggestionStatus: (a: unknown) => h.status(a) }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => createElement("a", null, children) }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); h.status.mockResolvedValue({ ok: true }); h.run.mockResolvedValue({ error: null, commandId: "c" }); });
function setup(insert = false) {
  const state = fixture.state, main = mainProduction(state);
  if (!main) throw new Error("Missing main");
  const occ = orderedOccurrences(state, main.id).find((o) => blocksOfVariant(state, o.variantId).some((b) => b.kind === "dialogue"));
  const asset = Object.values(state.assets).find((a) => a.kind === "character");
  if (!occ || !asset) throw new Error("Missing fixture");
  const b = blocksOfVariant(state, occ.variantId).find((b) => b.kind === "dialogue");
  if (!b) throw new Error("Missing dialogue");
  const suggestion: StorySuggestion = { id: "suggestion", sessionId: null, turnId: null, kind: "line", payload: { sceneId: occ.sceneId, ...(insert ? { speaker: asset.id, text: "Nytt" } : { blockId: b.id, suggestion: "Nytt" }) }, status: "open", createdAt: "now", createdBy: "user" };
  h.list.mockResolvedValue({ ok: true, suggestions: [suggestion] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }); qc.setQueryData(suggestionKey("p"), [suggestion]);
  const cmds = { current: () => state, whenIdle: async () => {}, runAndWait: h.run, undoGroup: null, status: { kind: "idle" }, run: vi.fn() } as unknown as Commands;
  render(createElement(QueryClientProvider, { client: qc }, createElement(SuggestionsPanel, { state, projectId: "p", cmds, editable: true, onSource: vi.fn() })));
  return { qc, b };
}
it("preview is read-only; confirmation persists EditBlockText before applying status", async () => {
  const s = setup(); fireEvent.click(screen.getByTestId("storylab-suggestion-apply"));
  expect(h.run).not.toHaveBeenCalled(); expect(h.status).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId("storylab-suggestion-confirm"));
  await waitFor(() => expect(h.status).toHaveBeenCalledWith({ data: { projectId: "p", suggestionId: "suggestion", status: "applied" } }));
  expect(h.run.mock.calls[0]?.[0]).toEqual({ type: "EditBlockText", productionId: mainProduction(fixture.state)?.id, blockId: s.b.id, text: "Nytt" });
});
it("status failure cannot insert again; only status retry is offered", async () => {
  setup(true); h.status.mockResolvedValue({ ok: false, message: "Status failed" });
  fireEvent.click(screen.getByTestId("storylab-suggestion-apply")); fireEvent.click(screen.getByTestId("storylab-suggestion-confirm"));
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(h.run).toHaveBeenCalledTimes(2);
  expect(screen.queryByTestId("storylab-suggestion-apply")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Merk som brukt" })).toBeInTheDocument();
});
it("partial insertion leaves status open and prevents duplicating completed steps", async () => {
  setup(true); h.run.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: "Rejected" });
  fireEvent.click(screen.getByTestId("storylab-suggestion-apply")); fireEvent.click(screen.getByTestId("storylab-suggestion-confirm"));
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(h.status).not.toHaveBeenCalled();
  expect(screen.queryByTestId("storylab-suggestion-apply")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Merk som brukt" })).not.toBeInTheDocument();
});