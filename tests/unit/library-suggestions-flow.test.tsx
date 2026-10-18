import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage, type LibrarySuggestion } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { SuggestionsDialog } from "@/app/library/SuggestionsDialog";
import { seedProject } from "../helpers/fixtures";
const mocks = vi.hoisted(() => ({ gen: vi.fn(), run: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.gen }));
vi.mock("@/adapters/ai/text.functions", () => ({ generateText: vi.fn() }));
vi.mock("@/app/storylab/storylab-data", () => ({ usd: () => "$0.001", useTextEstimate: () => ({ label: "Test model (Test provider)", usd: 0.001, loading: false, error: null }) }));
const suggestions: LibrarySuggestion[] = [
  { name: "Måns", kind: "animal", reason: "named", scenes: 1, sceneNumbers: ["1"], sources: [], possibleMatch: null, uncertain: false, kindUncertain: false, confidence: "high", evidence: "Katten Måns", contexts: ["Katten Måns mjauer."] },
  { name: "Ding", kind: "object", reason: "named", scenes: 1, sceneNumbers: ["1"], sources: [], possibleMatch: null, uncertain: true, kindUncertain: true, confidence: "low", evidence: "Ukjent" },
];
beforeEach(() => { setLanguage("nb"); mocks.run.mockReset().mockResolvedValue({ error: null }); mocks.gen.mockReset().mockResolvedValue({ ok: true, text: '{"items":[{"name":"Ding","kind":"sound","confidence":"medium","reason":"A sound cue","aliasOf":"Måns"},{"name":"INVENTED","kind":"animal","confidence":"high","reason":"Ignore"}]}', usedFallback: true }); });
function show() {
  const { state } = seedProject(0);
  render(<SuggestionsDialog open onOpenChange={vi.fn()} state={state} projectId={state.project.id} suggestions={suggestions} cmds={{ runAndWait: mocks.run } as unknown as Commands} />);
}
describe("OG1 review flow", () => {
  it("preselects high confidence only and writes the user-selected type", async () => {
    show();
    const animal = screen.getAllByTestId("library-suggestion").find((el) => el.dataset["name"] === "Måns");
    const unknown = screen.getAllByTestId("library-suggestion").find((el) => el.dataset["name"] === "Ding");
    if (!animal || !unknown) throw new Error("missing candidates");
    expect((within(animal).getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    expect((within(unknown).getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    fireEvent.change(within(animal).getByTestId("library-suggestion-kind"), { target: { value: "object" } });
    fireEvent.click(screen.getByTestId("library-suggestions-add"));
    await waitFor(() => expect(mocks.run).toHaveBeenCalledOnce());
    expect(mocks.run.mock.calls[0]?.[0]).toMatchObject({ type: "CreateAssets", assets: [{ fields: { name: "Måns", kind: "object", names: [] } }] });
  });
  it("requires confirmation, changes only classification, and never auto-applies an AI response", async () => {
    show();
    fireEvent.click(screen.getByTestId("library-suggestions-ai"));
    expect(mocks.gen).not.toHaveBeenCalled();
    expect(screen.getByTestId("library-suggestions-cost").textContent).toContain("Test model (Test provider)");
    fireEvent.click(screen.getByTestId("library-suggestions-ai-confirm"));
    await waitFor(() => expect(screen.getByText("A sound cue")).toBeTruthy());
    expect(screen.getAllByTestId("library-suggestion")).toHaveLength(2);
    expect(screen.getAllByTestId("library-suggestion").find((el) => el.dataset["name"] === "Ding")?.dataset["kind"]).toBe("sound");
    expect(mocks.gen.mock.calls[0]?.[0].data).toMatchObject({ task: "general", json: true });
    expect(mocks.run).not.toHaveBeenCalled();
    expect(screen.getByText(/Mulig samme som/)).toBeTruthy();
    expect(screen.getByText(/ble brukt som reserve/)).toBeTruthy();
  });
});