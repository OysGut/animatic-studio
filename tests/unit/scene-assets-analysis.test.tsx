import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { librarySuggestions, mainProduction, orderedOccurrences, setLanguage } from "@/core";
import { analysisScenes } from "@/core/library/analysis-hash";
import { setAnalysisRows } from "@/app/library/entity-analysis-store";
import { SceneAssetsPanel } from "@/app/scene-editor/SceneAssetsPanel";
import { sceneSuggestions } from "@/app/scene-editor/scene-suggestions";
import type { Commands } from "@/app/project/use-commands";
import { fixture } from "../visual/fixture-state";
const h = vi.hoisted(() => ({ dialog: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/app/library/asset-images", () => ({ useImageUrls: () => ({ data: {} }) }));
vi.mock("@/app/library/AssetSymbolIcon", () => ({ AssetSymbolIcon: () => null }));
vi.mock("@/app/scene-editor/AddElementDialog", () => ({ AddElementDialog: () => null }));
vi.mock("@/app/library/SuggestionsDialog", () => ({ SuggestionsDialog: (props: unknown) => { h.dialog(props); return null; } }));
function setup() {
  const state = fixture.state;
  const prod = mainProduction(state);
  if (!prod) throw new Error("Missing production");
  const all = librarySuggestions(state, prod.id);
  const occurrence = orderedOccurrences(state, prod.id).find((o) => sceneSuggestions(state, prod.id, o.id, all).length);
  if (!occurrence) throw new Error("Missing suggestions");
  const candidate = sceneSuggestions(state, prod.id, occurrence.id, all)[0];
  const scene = analysisScenes(state, prod.id).find((s) => s.sceneId === occurrence.sceneId);
  if (!candidate || !scene) throw new Error("Missing scene");
  const stored = [{ sceneId: scene.sceneId, contentHash: scene.hash, items: [{ name: candidate.name, kind: "sound" as const, confidence: "medium" as const, reason: "Saved sound assessment" }] }] as const;
  return { state, prod, all, occurrence, candidate, stored };
}
describe("OG2 scene analysis", () => {
  it("sceneSuggestions merges current stored type, confidence and reason, with lexical fallback", () => {
    const s = setup();
    expect(sceneSuggestions(s.state, s.prod.id, s.occurrence.id, s.all, s.stored).find((x) => x.name === s.candidate.name))
      .toMatchObject({ kind: "sound", confidence: "medium", evidence: "Saved sound assessment", uncertain: true });
    expect(sceneSuggestions(s.state, s.prod.id, s.occurrence.id, s.all, [{ ...s.stored[0], contentHash: "stale" }]))
      .toEqual(sceneSuggestions(s.state, s.prod.id, s.occurrence.id, s.all));
  });
  it("SceneAssetsPanel subscribes to saved analysis and passes its classification into confirmed review", () => {
    setLanguage("nb");
    const s = setup();
    setAnalysisRows(s.state.project.id, []);
    h.dialog.mockClear();
    const view = render(<SceneAssetsPanel state={s.state} projectId={s.state.project.id} productionId={s.prod.id} occurrenceId={s.occurrence.id} editable onAdd={null} cmds={{ run: vi.fn() } as unknown as Commands} />);
    act(() => setAnalysisRows(s.state.project.id, s.stored));
    const row = screen.getByText("Saved sound assessment").closest("li");
    if (!row) throw new Error("Missing analyzed row");
    fireEvent.click(within(row).getByRole("button"));
    expect(h.dialog.mock.lastCall?.[0]).toMatchObject({ suggestions: [{ name: s.candidate.name, kind: "sound", confidence: "medium", evidence: "Saved sound assessment" }] });
    view.unmount();
    setAnalysisRows(s.state.project.id, []);
  });
});