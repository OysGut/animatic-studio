/**
 * Øystein 23.10: dobbeltklikk (eller Enter i listen) på en scene på Manus-siden åpner scenen i sceneeditoren.
 * Dobbeltklikk i vanlig manustekst virker som før (ordet markeres, teksten kan redigeres).
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mainProduction, paginate, scriptPaginationInput, setLanguage } from "@/core";
import { ScriptPageView } from "@/app/script/ScriptPageView";
import { SceneNavigator } from "@/app/script/SceneNavigator";
import { fixture } from "../visual/fixture-state";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const s = fixture.state;
const main = mainProduction(s)!;
const pages = paginate(scriptPaginationInput(s, main.id)).pages;

afterEach(cleanup);

function page() {
  const onActivate = vi.fn();
  const r = render(
    <ScriptPageView pages={pages} state={s} selection={{ occurrenceId: null, blockId: null }} zoom={1} onSelect={vi.fn()} onActivate={onActivate} />,
  );
  return { ...r, onActivate };
}

describe("Manus: dobbeltklikk åpner scenen", () => {
  it("sceneoverskriften åpner akkurat den scenen", () => {
    const { container, onActivate } = page();
    const heading = pages.flatMap((p) => p.lines).find((l) => l.kind === "heading" && l.first)!;
    const el = container.querySelector(`#scene-${heading.occurrenceId}`)!;
    fireEvent.doubleClick(el);
    expect(onActivate).toHaveBeenCalledWith({ occurrenceId: heading.occurrenceId, blockId: heading.blockId }, true);
  });

  it("dobbeltklikk i vanlig tekst åpner ikke scenen og stopper ikke markering av ord", () => {
    const { container, onActivate } = page();
    const line = pages.flatMap((p) => p.lines).find((l) => (l.kind === "dialogue" || l.kind === "action") && l.blockId)!;
    const el = container.querySelector(`[data-block="${line.blockId}"]`)!;
    const ev = new MouseEvent("dblclick", { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false); // nettleserens ordmarkering får virke
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0]![1]).toBe(false);
  });

  for (const [lang, hint] of [["nb", "Dobbeltklikk for å åpne scenen"], ["en", "Double-click to open the scene"]] as const) {
    it(`scenelisten: dobbeltklikk og Enter åpner riktig scene, med verktøytips (${lang})`, () => {
      setLanguage(lang);
      const onOpenScene = vi.fn();
      const occ = scriptPaginationInput(s, main.id)[1]!.occurrenceId;
      const { container } = render(
        <QueryClientProvider client={new QueryClient()}><SceneNavigator
          state={s} productionId={main.id} startPages={{}} selectedOcc={null} editable={false}
          onSelect={vi.fn()} onOpenScene={onOpenScene} onMove={vi.fn()} onToggleActive={vi.fn()}
          filter={{}} onFilterChange={vi.fn()} characters={[]} visible={null}
          structureEditing={false} onStructureEditingChange={vi.fn()} moved={null} movedBaseline={null}
          hits={null} noteCounts={null} inView={null}
        /></QueryClientProvider>,
      );
      const btn = container.querySelector<HTMLButtonElement>(`#nav-${occ}`)!;
      expect(btn.title).toBe(hint);
      fireEvent.doubleClick(btn);
      expect(onOpenScene).toHaveBeenLastCalledWith(occ);
      fireEvent.keyDown(btn, { key: "Enter" });
      expect(onOpenScene).toHaveBeenCalledTimes(2);
      setLanguage("nb");
    });
  }
});
