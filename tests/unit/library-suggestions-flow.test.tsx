import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage, type LibrarySuggestion } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { SuggestionsDialog } from "@/app/library/SuggestionsDialog";
import { seedProject } from "../helpers/fixtures";
const mocks = vi.hoisted(() => ({ gen: vi.fn(), run: vi.fn(), stored: [] as unknown[] }));
// OG2 (B-047): typene kommer fra lagret automatisk analyse; «Analyser på nytt» uten kostnadsdialog
vi.mock("@/app/library/entity-analysis-store", () => ({
  useAnalysisRows: () => mocks.stored,
  requestReanalyze: (...a: unknown[]) => mocks.gen(...a),
  useAnalysisStatus: () => ({ kind: "idle" }),
}));
const suggestions: LibrarySuggestion[] = [
  { name: "Måns", kind: "animal", reason: "named", scenes: 1, sceneNumbers: ["1"], sources: [], possibleMatch: null, uncertain: false, kindUncertain: false, confidence: "high", evidence: "Katten Måns", contexts: ["Katten Måns mjauer."] },
  { name: "Ding", kind: "object", reason: "named", scenes: 1, sceneNumbers: ["1"], sources: [], possibleMatch: null, uncertain: true, kindUncertain: true, confidence: "low", evidence: "Ukjent" },
];
beforeEach(() => { setLanguage("nb"); mocks.run.mockReset().mockResolvedValue({ error: null }); mocks.gen.mockReset().mockResolvedValue({ ok: true, text: '{"items":[{"name":"Ding","kind":"sound","confidence":"medium","reason":"A sound cue","aliasOf":"Måns"},{"name":"INVENTED","kind":"animal","confidence":"high","reason":"Ignore"}]}', usedFallback: true }); });
function show(state = seedProject(1).state) {
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
  it("uses the stored automatic analysis for types without a cost dialog, and never auto-applies it", async () => {
    const { analysisScenes } = await import("@/core/library/analysis-hash");
    const { mainProduction } = await import("@/core");
    const { state } = seedProject(1);
    const sc = analysisScenes(state, mainProduction(state)!.id)[0]!;
    mocks.stored = [{ sceneId: sc.sceneId, contentHash: sc.hash, items: [{ name: "Ding", kind: "sound", confidence: "medium", reason: "A sound cue", aliasOf: "Måns" }] }];
    mocks.gen.mockResolvedValue(null);
    show(state);
    expect(screen.queryByTestId("library-suggestions-cost")).toBeNull();
    expect(screen.getByText("A sound cue")).toBeTruthy();
    expect(screen.getAllByTestId("library-suggestion").find((el) => el.dataset["name"] === "Ding")?.dataset["kind"]).toBe("sound");
    expect(screen.getByText(/Mulig samme som/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("library-suggestions-ai"));
    await waitFor(() => expect(mocks.gen).toHaveBeenCalledOnce());
    expect(mocks.run).not.toHaveBeenCalled();
    mocks.stored = [];
  });
  it("ignores stored analysis whose scene content has changed", () => {
    mocks.stored = [{ sceneId: "x", contentHash: "stale", items: [{ name: "Ding", kind: "sound", confidence: "high", reason: "Old" }] }];
    show();
    expect(screen.queryByText("Old")).toBeNull();
    mocks.stored = [];
  });
});
