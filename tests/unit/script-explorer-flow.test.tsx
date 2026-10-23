import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { blocksOfVariant, orderedOccurrences, setLanguage, type Command } from "@/core";
import { seedProject } from "../helpers/fixtures";
import { ScriptExplorer } from "@/app/script-explorer/ScriptExplorer";

const harness = vi.hoisted(() => ({ state: null as unknown, occurrenceId: "", editable: true, sent: [] as unknown[], run: vi.fn() }));
// Visningsvalg (nettleser + konto) erstattes med et minnelager i testene
const uiStore = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/app/account/ui-prefs", async () => {
  const React = await import("react");
  return { useUiPref: <T,>(key: string, fallback: T) => { const [v, setV] = React.useState<T>(uiStore.has(key) ? (uiStore.get(key) as T) : fallback); return [v, (n: T) => { uiStore.set(key, n); setV(n); }]; } };
});
vi.mock("@/app/project/use-project", () => ({
  useProjectState: () => ({ data: harness.state, isLoading: false, isError: false }),
  useMembers: () => ({ data: [{ user_id: "user", role: harness.editable ? "editor" : "viewer" }], isLoading: false, isError: false }),
  canEdit: (role: string) => role === "editor",
}));
vi.mock("@/app/project/use-commands", () => ({ useCommands: () => ({ run: harness.run, undo: vi.fn(), redo: vi.fn(), canUndo: false, canRedo: false, status: { kind: "idle" }, rejected: [] }) }));
vi.mock("@/app/shell/current-scene", () => ({ useActiveSceneInfo: () => ({ scene: { occurrenceId: harness.occurrenceId }, closed: false }) }));
beforeEach(() => {
  harness.sent = []; harness.editable = true; harness.run.mockImplementation((command: Command) => { harness.sent.push(command); return null; });
  setLanguage("nb");
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
});
function setup() {
  const { state, mainId } = seedProject(2);
  const occurrences = orderedOccurrences(state, mainId);
  const first = occurrences[0], second = occurrences[1];
  if (!first || !second) throw new Error("missing fixture scenes");
  harness.state = state; harness.occurrenceId = first.id;
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "/", component: () => <ScriptExplorer projectId={state.project.id} userId="user" authorName="Test" /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  const view = render(<RouterProvider router={router} />);
  return { ...view, state, first, second, router };
}
describe("script explorer user flow", () => {
  it("searches and opens another scene locally, then follows the source again", async () => {
    const { router, first, second } = setup();
    await screen.findByTestId("script-explorer-search");
    expect(screen.getByTestId("script-explorer-status").textContent).toContain("STED 0");
    fireEvent.change(screen.getByTestId("script-explorer-search"), { target: { value: "Replikk 1" } });
    const hit = await screen.findByTestId("script-explorer-hit");
    fireEvent.click(within(hit).getByRole("button", { name: "Åpne", hidden: true }));
    expect(screen.getByTestId("script-explorer-status").textContent).toContain("STED 1");
    expect(harness.occurrenceId).toBe(first.id);
    expect(router.state.location.pathname).toBe("/");
    act(() => { harness.occurrenceId = second.id; });
    fireEvent.click(screen.getByTestId("script-explorer-back"));
    await waitFor(() => expect(screen.getByTestId("script-explorer-status").dataset["mode"]).toBe("follow"));
    expect(screen.getByTestId("script-explorer-status").textContent).toContain("STED 1");
    expect(harness.sent).toEqual([]);
  });
  it("creates only an AddAnnotations note on a selected block without changing the original script", async () => {
    const { state, first } = setup();
    await screen.findByTestId("script-explorer-search");
    // Notatpanelet vises først når noe er valgt (scenen har ingen notater ennå)
    expect(screen.queryByTestId("script-explorer-note")).toBeNull();
    const block = blocksOfVariant(state, first.variantId).find((b) => b.kind === "action");
    if (!block) throw new Error("missing action");
    const line = document.querySelector(`[data-block="${block.id}"]`);
    if (!line) throw new Error("missing rendered line");
    fireEvent.click(line);
    await screen.findByTestId("script-explorer-note");
    fireEvent.click(screen.getByRole("button", { name: "Legg til notat" }));
    fireEvent.change(within(screen.getByTestId("script-explorer-note")).getByRole("textbox"), { target: { value: "Notat om handlingen" } });
    fireEvent.click(screen.getByRole("button", { name: "Lagre notat" }));
    expect(harness.sent).toHaveLength(1);
    expect(harness.sent[0]).toMatchObject({ type: "AddAnnotations", annotations: [{ blockId: block.id, variantId: null, start: 0, end: 0, quote: "", text: "Notat om handlingen", authorName: "Test" }] });
    expect(state.blocks[block.id]?.text).toBe("Handling 0");
  });
  it("does not offer annotation writes to a reader", async () => {
    harness.editable = false;
    setup();
    harness.editable = false;
    await screen.findByTestId("script-explorer-search");
    expect(screen.queryByTestId("script-explorer-note")).toBeNull();
    expect(screen.queryByRole("button", { name: "Legg til notat" })).toBeNull();
  });
});