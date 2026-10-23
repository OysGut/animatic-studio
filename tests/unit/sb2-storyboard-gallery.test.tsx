/**
 * SB-2: storyboardgalleriet. Kjernen (fortellerrekkefølge, nøkler, rutenett) og flaten i jsdom:
 * dobbeltklikk/Enter navigerer riktig, scenerekkefølgen endrer manusets rekkefølge, valg huskes,
 * forslag ved første åpning krever bekreftelse, og 2 000 paneler virtualiseres.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCommand,
  buildGallery,
  gridStep,
  keysEvenly,
  orderedOccurrences,
  planDuplicatePanel,
  storyboardPanelsOf,
  type Command,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";
import { DEFAULT_GALLERY_PREFS, isGalleryPrefs, virtualRows, visibleRows, zoomStep } from "@/app/storyboard/gallery-prefs";

const store = new Map<string, unknown>();
vi.mock("@/app/account/ui-prefs", async () => {
  const React = await import("react");
  return {
    useUiPref: <T,>(key: string, fallback: T) => {
      const [v, setV] = React.useState<T>(store.has(key) ? (store.get(key) as T) : fallback);
      return [v, (n: T) => (store.set(key, n), setV(n))];
    },
  };
});
const nav = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => nav, Link: () => null }));
vi.mock("@/app/library/asset-images", () => ({ useImageUrls: () => ({ data: {} }) }));
vi.mock("@/app/shell/current-scene", () => ({ rememberScene: () => undefined }));

const { Gallery } = await import("@/app/storyboard/StoryboardWorkspace");

function withPanels(s: ProjectState, perScene: number): ProjectState {
  let st = s;
  for (const o of Object.values(s.occurrences)) {
    for (const key of keysEvenly(perScene))
      st = mustApply(st, { type: "AddStoryboardPanel", panelId: tid(), occurrenceId: o.id, variantId: o.variantId, orderKey: key });
  }
  return st;
}

/** Galleriet med en minimal kommandokjøring (samme kjerne som serveren) og angreliste. */
function Harness({ initial, projectId = "p1" }: { initial: ProjectState; projectId?: string }) {
  const [state, setState] = useState(initial);
  const [undo, setUndo] = useState<Command[]>([]);
  const cmds = {
    run: (c: Command) => {
      const r = applyCommand(state, envelope(c));
      if (!r.ok) return r.error.message;
      setState(r.state);
      harness.state = r.state;
      setUndo((u) => [...u, r.inverse!]);
      return null;
    },
    undo: () => {
      const inv = undo[undo.length - 1];
      if (!inv) return;
      const r = applyCommand(state, envelope(inv));
      if (r.ok) {
        setState(r.state);
        harness.state = r.state;
        setUndo((u) => u.slice(0, -1));
      }
    },
    redo: () => undefined,
    canUndo: undo.length > 0,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
  } as never;
  return <Gallery projectId={projectId} state={state} editable cmds={cmds} initialPanelId={null} initialOccurrenceId={null} />;
}
const harness: { state: ProjectState | null } = { state: null };

beforeEach(() => {
  store.clear();
  nav.mockReset();
  localStorage.clear();
});

describe("SB-2 kjerne", () => {
  it("galleriet følger manusets rekkefølge og hopper over deaktiverte scener", () => {
    const seed = seedProject(4);
    const s = withPanels(seed.state, 2);
    const occs = orderedOccurrences(s, seed.mainId);
    const off = mustApply(s, { type: "SetOccurrenceActive", occurrenceId: occs[1]!.id, active: false });
    const g = buildGallery(off, seed.mainId, { showHidden: false, filter: null });
    expect(g.map((x) => x.occurrence.id)).toEqual([occs[0]!.id, occs[2]!.id, occs[3]!.id]);
    expect(g.flatMap((x) => x.panels.map((p) => p.index))).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("filter på status per fagområde og skjulte paneler", () => {
    const seed = seedProject(2);
    let s = withPanels(seed.state, 2);
    const occ = orderedOccurrences(s, seed.mainId)[0]!;
    const [p1, p2] = storyboardPanelsOf(s, occ.id);
    s = mustApply(s, { type: "SetProductionStatus", statusId: tid(), eventId: tid(), area: "storyboard", compositionId: p1!.id, status: "done" });
    s = mustApply(s, { type: "UpdateStoryboardPanel", panelId: p2!.id, hidden: true });
    const done = buildGallery(s, seed.mainId, { showHidden: false, filter: { area: "storyboard", status: "done" } });
    expect(done.flatMap((x) => x.panels.map((p) => p.panel.id))).toEqual([p1!.id]);
    const all = buildGallery(s, seed.mainId, { showHidden: false, filter: null });
    expect(all.flatMap((x) => x.panels).some((p) => p.panel.id === p2!.id)).toBe(false);
    const withHidden = buildGallery(s, seed.mainId, { showHidden: true, filter: null });
    expect(withHidden.flatMap((x) => x.panels).some((p) => p.panel.id === p2!.id)).toBe(true);
  });

  it("dupliser legger panelet rett etter, med samme forankring og timing, og kan angres", () => {
    const seed = seedProject(1);
    const s0 = withPanels(seed.state, 2);
    const occ = orderedOccurrences(s0, seed.mainId)[0]!;
    const [first, second] = storyboardPanelsOf(s0, occ.id);
    const plan = planDuplicatePanel(s0, first!.id);
    let s = s0;
    const inverses: Command[] = [];
    for (const c of plan) {
      const r = applyCommand(s, envelope(c));
      if (!r.ok) throw new Error(r.error.message);
      s = r.state;
      inverses.push(r.inverse!);
    }
    const order = storyboardPanelsOf(s, occ.id).map((p) => p.id);
    expect(order[0]).toBe(first!.id);
    expect(order[2]).toBe(second!.id);
    for (const inv of inverses.reverse()) s = mustApply(s, inv);
    expect(storyboardPanelsOf(s, occ.id).map((p) => p.id)).toEqual([first!.id, second!.id]);
  });

  it("piltaster i rutenettet, speilet i høyre-til-venstre", () => {
    expect(gridStep(0, 10, 4, "ArrowRight", false)).toBe(1);
    expect(gridStep(1, 10, 4, "ArrowRight", true)).toBe(0);
    expect(gridStep(1, 10, 4, "ArrowLeft", true)).toBe(2);
    expect(gridStep(1, 10, 4, "ArrowDown", false)).toBe(5);
    expect(gridStep(9, 10, 4, "ArrowDown", false)).toBe(9);
    expect(gridStep(5, 10, 4, "Home", false)).toBe(0);
  });

  it("valgene valideres, zoom holder seg innenfor grensene", () => {
    expect(isGalleryPrefs(DEFAULT_GALLERY_PREFS)).toBe(true);
    expect(isGalleryPrefs({ ...DEFAULT_GALLERY_PREFS, size: 9999 })).toBe(false);
    expect(isGalleryPrefs({ ...DEFAULT_GALLERY_PREFS, filterArea: "x" })).toBe(false);
    expect(zoomStep(480, 1)).toBe(480);
    expect(zoomStep(96, -1)).toBe(96);
  });

  it("virtualisering: 2 000 paneler gir bare noen få synlige rader", () => {
    const sizes = Array.from({ length: 200 }, () => 10);
    const t0 = performance.now();
    const rows = virtualRows(sizes, 5, 44, 180);
    const shown = visibleRows(rows, 50_000, 900);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(rows.filter((r) => r.kind === "panels").length).toBe(400);
    expect(shown.length).toBeLessThan(20);
  });
});

describe("SB-2 galleriflaten", () => {
  it("enkeltklikk velger, dobbeltklikk og Enter åpner sceneeditoren med forekomst og panel", () => {
    const seed = seedProject(2);
    const s = withPanels(seed.state, 1);
    render(<Harness initial={s} />);
    const cards = screen.getAllByTestId("sb-panel");
    fireEvent.click(cards[1]!);
    expect(cards[1]!.getAttribute("aria-selected")).toBe("true");
    const id = cards[1]!.getAttribute("data-panel-id")!;
    const occ = s.compositions[id]!.occurrenceId;
    fireEvent.doubleClick(cards[1]!);
    expect(nav).toHaveBeenCalledWith(expect.objectContaining({ to: "/prosjekt/$projectId/scene", search: { scene: occ, panel: id } }));
    nav.mockReset();
    fireEvent.keyDown(screen.getByTestId("sb-grid"), { key: "Enter" });
    expect(nav).toHaveBeenCalledWith(expect.objectContaining({ search: { scene: occ, panel: id } }));
  });

  it("flytting av scene endrer rekkefølgen i manuset (MoveOccurrence) og kan angres", () => {
    const seed = seedProject(3);
    const s = withPanels(seed.state, 1);
    const before = orderedOccurrences(s, seed.mainId).map((o) => o.id);
    render(<Harness initial={s} />);
    fireEvent.click(screen.getAllByTestId("sb-scene-down")[0]!);
    const after = orderedOccurrences(harness.state!, seed.mainId).map((o) => o.id);
    expect(after).toEqual([before[1], before[0], before[2]]);
    expect(screen.getByTestId("sb-notice")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /undo|angre/i }));
    expect(orderedOccurrences(harness.state!, seed.mainId).map((o) => o.id)).toEqual(before);
  });

  it("vis/skjul og filter huskes i brukervalget", () => {
    const seed = seedProject(1);
    render(<Harness initial={withPanels(seed.state, 1)} />);
    fireEvent.click(screen.getByTestId("sb-show-dialogue"));
    fireEvent.change(screen.getByTestId("sb-filter-area"), { target: { value: "sound" } });
    fireEvent.click(screen.getByTestId("sb-text-view"));
    const saved = store.get("storyboard-gallery") as typeof DEFAULT_GALLERY_PREFS;
    expect(saved.show.dialogue).toBe(false);
    expect(saved.filterArea).toBe("sound");
    expect(saved.view).toBe("text");
  });

  it("første åpning foreslår ett tomt panel per scene; ingenting lages uten bekreftelse", () => {
    const seed = seedProject(3);
    harness.state = seed.state;
    render(<Harness initial={seed.state} />);
    expect(Object.values(harness.state!.compositions).filter((c) => c.kind === "storyboard")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("sb-seed-confirm"));
    expect(Object.values(harness.state!.compositions).filter((c) => c.kind === "storyboard")).toHaveLength(3);
  });

  it("skjul og deaktiver bruker kommandoer; ingenting slettes", () => {
    const seed = seedProject(1);
    render(<Harness initial={withPanels(seed.state, 2)} />);
    const card = screen.getAllByTestId("sb-panel")[0]!;
    const id = card.getAttribute("data-panel-id")!;
    fireEvent.click(card);
    fireEvent.click(screen.getByTestId("sb-deactivate"));
    expect(harness.state!.compositions[id]!.active).toBe(false);
    expect(harness.state!.compositions[id]!.removed).toBe(false);
    expect(screen.getAllByTestId("sb-panel")).toHaveLength(1);
  });

  it("2 000 syntetiske paneler: bare synlige kort tegnes", () => {
    const seed = seedProject(10);
    const s = withPanels(seed.state, 200);
    const t0 = performance.now();
    render(<Harness initial={s} />);
    const ms = performance.now() - t0;
    const cards = screen.getAllByTestId("sb-panel");
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThan(300);
    expect(ms).toBeLessThan(5000);
    void within;
    void act;
  }, 60_000);
});
