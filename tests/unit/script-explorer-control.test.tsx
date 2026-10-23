/** Manusutforskeren, «stålkontroll» del 1 (Øystein 23.10): vindu, panelbredder, notater, «Åpne i» og brikkemenyen. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blocksOfVariant, orderedOccurrences, setLanguage, type ProjectState } from "@/core";
import { seedProject } from "../helpers/fixtures";
import {
  PREF_KEYS, clampRect, layoutRect, popupFeatures, resizeRect, toggleMaximized, validWindowPref,
} from "@/app/script-explorer/window-geometry";
import { appearanceTargets, projectUrls } from "@/app/script-explorer/ExplorerNav";

const uiStore = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/app/account/ui-prefs", async () => {
  const React = await import("react");
  return { useUiPref: <T,>(key: string, fallback: T) => { const [v, setV] = React.useState<T>(uiStore.has(key) ? (uiStore.get(key) as T) : fallback); return [v, (n: T) => { uiStore.set(key, n); setV(n); }]; } };
});
const harness = vi.hoisted(() => ({ state: null as unknown, occurrenceId: "", run: vi.fn() }));
vi.mock("@/app/project/use-project", () => ({
  useProjectState: () => ({ data: harness.state, isLoading: false, isError: false }),
  useMembers: () => ({ data: [{ user_id: "user", role: "editor" }], isLoading: false, isError: false }),
  canEdit: () => true,
}));
vi.mock("@/app/project/use-commands", () => ({ useCommands: () => ({ run: harness.run, undo: vi.fn(), redo: vi.fn(), canUndo: false, canRedo: false, status: { kind: "idle" }, rejected: [] }) }));
vi.mock("@/app/shell/current-scene", () => ({ useActiveSceneInfo: () => ({ scene: { occurrenceId: harness.occurrenceId }, closed: false }), sourceWindowId: () => "source" }));
vi.mock("@/app/auth/use-session", () => ({ useSession: () => ({ status: "signed-in", session: { user: { id: "user", email: "" } } }) }));

const { ScriptExplorer } = await import("@/app/script-explorer/ScriptExplorer");
const { ScriptExplorerPanel } = await import("@/app/script-explorer/ScriptExplorerPanel");

const VP = { w: 1280, h: 800 };
// jsdom mangler PointerEvent; uten den får dra-hendelsene ingen koordinater
if (!("PointerEvent" in window)) {
  class PointerEventShim extends MouseEvent { pointerId: number; constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; } }
  vi.stubGlobal("PointerEvent", PointerEventShim);
}
beforeEach(() => {
  uiStore.clear(); setLanguage("nb");
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: VP.w });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: VP.h });
});
afterEach(() => { cleanup(); vi.stubGlobal("opener", null); });

function withMaja(s: ProjectState): ProjectState {
  const asset = { id: "maja-asset", kind: "character", name: "Maja", names: [], archived: false, removed: false } as unknown as ProjectState["assets"][string];
  return { ...s, assets: { ...s.assets, [asset.id]: asset } } as ProjectState;
}
function setup(opts: { source?: string } = {}) {
  const { state: base, mainId } = seedProject(3);
  const state = withMaja(base);
  const occ = orderedOccurrences(state, mainId);
  harness.state = state; harness.occurrenceId = occ[0]!.id;
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "/", component: () => <ScriptExplorer projectId={state.project.id} userId="user" authorName="Test" {...(opts.source ? { source: opts.source } : {})} /> });
  const catchAll = createRoute({ getParentRoute: () => root, path: "$", component: () => <p>annen side</p> });
  const router = createRouter({ routeTree: root.addChildren([route, catchAll]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  render(<RouterProvider router={router} />);
  return { state, occ, router };
}

describe("vindusgeometri", () => {
  const start = { x: 400, y: 100, w: 500, h: 500 };
  it("drar i alle kanter og hjørner; motsatt kant står stille", () => {
    expect(resizeRect(start, "e", 50, 0, VP)).toEqual({ x: 400, y: 100, w: 550, h: 500 });
    expect(resizeRect(start, "w", -50, 0, VP)).toEqual({ x: 350, y: 100, w: 550, h: 500 });
    expect(resizeRect(start, "n", 0, -40, VP)).toEqual({ x: 400, y: 60, w: 500, h: 540 });
    expect(resizeRect(start, "s", 0, 40, VP)).toEqual({ x: 400, y: 100, w: 500, h: 540 });
    expect(resizeRect(start, "nw", -10, -10, VP)).toEqual({ x: 390, y: 90, w: 510, h: 510 });
    expect(resizeRect(start, "se", 10, 10, VP)).toEqual({ x: 400, y: 100, w: 510, h: 510 });
    expect(resizeRect(start, "ne", 10, -10, VP)).toEqual({ x: 400, y: 90, w: 510, h: 510 });
    expect(resizeRect(start, "sw", -10, 10, VP)).toEqual({ x: 390, y: 100, w: 510, h: 510 });
  });
  it("aldri mindre enn 320 × 240 og aldri utenfor vinduet", () => {
    expect(resizeRect(start, "w", 400, 0, VP)).toMatchObject({ w: 320, x: 580 });
    expect(resizeRect(start, "e", 5000, 0, VP).w).toBe(VP.w - start.x);
    expect(clampRect({ x: 2000, y: -50, w: 500, h: 500 }, VP)).toEqual({ x: 780, y: 0, w: 500, h: 500 });
  });
  it("maksimer, fest til halvdel og gjenopprett", () => {
    expect(layoutRect("max", start, VP)).toEqual({ x: 0, y: 0, w: 1280, h: 800 });
    expect(layoutRect("left", start, VP)).toEqual({ x: 0, y: 0, w: 640, h: 800 });
    expect(layoutRect("right", start, VP)).toEqual({ x: 640, y: 0, w: 640, h: 800 });
    expect(toggleMaximized("free")).toBe("max");
    expect(toggleMaximized("max")).toBe("free");
    expect(toggleMaximized("left")).toBe("free");
    expect(validWindowPref({ rect: start, layout: "sideways" })).toBe(false);
  });
  it("popup-vinduet åpnes med lagret størrelse og plass", () => {
    expect(popupFeatures({ x: 10, y: 20, w: 700, h: 900 }, { w: 560, h: 760 })).toBe("popup,width=700,height=900,left=10,top=20");
    expect(popupFeatures(null, { w: 560, h: 760 })).toBe("popup,width=560,height=760");
  });
});

describe("panelet husker størrelse og plass", () => {
  it("dobbeltklikk på tittellinjen maksimerer og gjenoppretter, og valget lagres", () => {
    render(<ScriptExplorerPanel projectId="p" onClose={vi.fn()} />);
    const win = screen.getAllByTestId("script-explorer")[0]!;
    fireEvent.doubleClick(screen.getByTestId("script-explorer-titlebar"));
    expect(win.dataset["layout"]).toBe("max");
    expect(win.style.width).toBe("1280px");
    expect((uiStore.get(PREF_KEYS.window) as { layout: string }).layout).toBe("max");
    fireEvent.doubleClick(screen.getByTestId("script-explorer-titlebar"));
    expect(win.dataset["layout"]).toBe("free");
  });
  it("festeknappene legger vinduet i venstre eller høyre halvdel", () => {
    render(<ScriptExplorerPanel projectId="p" onClose={vi.fn()} />);
    const win = screen.getAllByTestId("script-explorer")[0]!;
    fireEvent.click(screen.getByTestId("script-explorer-snap-left"));
    expect(win.style.left).toBe("0px"); expect(win.style.width).toBe("640px");
    fireEvent.click(screen.getByTestId("script-explorer-snap-right"));
    expect(win.style.left).toBe("640px");
  });
  it("dra i venstre kant lagrer ny plass, og den brukes neste gang", () => {
    const first = render(<ScriptExplorerPanel projectId="p" onClose={vi.fn()} />);
    const grip = screen.getByTestId("script-explorer-grip-w");
    fireEvent.pointerDown(grip, { button: 0, clientX: 700, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: 600, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(grip, { pointerId: 1 });
    const saved = uiStore.get(PREF_KEYS.window) as { rect: { x: number; w: number }; layout: string };
    expect(saved.layout).toBe("free");
    expect(saved.rect.w).toBe(660);
    first.unmount();
    render(<ScriptExplorerPanel projectId="p" onClose={vi.fn()} />);
    expect(screen.getAllByTestId("script-explorer")[0]!.style.width).toBe("660px");
  });
  it("hjørnegrepet endrer størrelsen med piltastene", () => {
    render(<ScriptExplorerPanel projectId="p" onClose={vi.fn()} />);
    fireEvent.keyDown(screen.getByTestId("script-explorer-grip-se"), { key: "ArrowDown" });
    expect((uiStore.get(PREF_KEYS.window) as { rect: { h: number } }).rect.h).toBe(680);
  });
});

describe("notater", () => {
  it("skjules uten notater og uten valg, vises etter valg, og knappen lukker panelet og huskes", async () => {
    const { state, occ } = setup();
    await screen.findByTestId("script-explorer-search");
    expect(screen.queryByTestId("script-explorer-note")).toBeNull();
    expect(screen.getByTestId("script-explorer-notes-toggle").textContent).toContain("Notater (0)");
    const action = blocksOfVariant(state, occ[0]!.variantId).find((b) => b.kind === "action")!;
    fireEvent.click(document.querySelector(`[data-block="${action.id}"]`)!);
    await screen.findByTestId("script-explorer-note");
    fireEvent.click(screen.getByTestId("script-explorer-notes-toggle"));
    expect(screen.queryByTestId("script-explorer-note")).toBeNull();
    expect(uiStore.get(PREF_KEYS.notes)).toEqual({ open: false, marks: true });
  });
  it("bryteren slår notatmerkene av og på og huskes", async () => {
    setup();
    const marks = await screen.findByTestId("script-explorer-note-marks");
    fireEvent.click(marks);
    expect(uiStore.get(PREF_KEYS.notes)).toEqual({ open: true, marks: false });
  });
  it("panelbredden endres med piltast på skillet og huskes", async () => {
    setup();
    fireEvent.keyDown(await screen.findByTestId("script-explorer-split-side"), { key: "ArrowLeft" });
    expect((uiStore.get(PREF_KEYS.panes) as { side: number }).side).toBe(240);
    expect(screen.getByTestId("script-explorer-side").style.width).toBe("240px");
  });
});

describe("«Åpne i …» og brikkemenyen", () => {
  it("lager riktige mål for manus, montering, sceneeditor, replikk og Story Lab", () => {
    const u = projectUrls("p", "occ", "blk", "line");
    expect(u.script).toBe("/prosjekt/p/manus?scene=occ&blokk=blk");
    expect(u.assembly).toBe("/prosjekt/p/montering?scene=occ&blokk=blk");
    expect(u.scene).toBe("/prosjekt/p/scene?scene=occ");
    expect(u.dialogue).toBe("/prosjekt/p/scene?scene=occ&line=line");
    expect(u.storylab).toBe("/prosjekt/p/storylab?scene=occ");
    expect(projectUrls("p", "occ", null, null).dialogue).toBeNull();
  });
  it("knappene peker på scenen; replikkvalget aktiverer «Replikk og lyd»", async () => {
    const { state, occ } = setup();
    const bar = await screen.findByTestId("script-explorer-open-in");
    const id = occ[0]!.id;
    expect(within(bar).getByTestId("script-explorer-open-assembly").getAttribute("href")).toBe(`/prosjekt/${state.project.id}/montering?scene=${id}`);
    expect(within(bar).getByTestId("script-explorer-open-scene").getAttribute("href")).toBe(`/prosjekt/${state.project.id}/scene?scene=${id}`);
    expect(within(bar).getByTestId("script-explorer-open-storylab").getAttribute("href")).toBe(`/prosjekt/${state.project.id}/storylab?scene=${id}`);
    expect(within(bar).getByTestId("script-explorer-open-dialogue").tagName).toBe("BUTTON");
    const line = blocksOfVariant(state, occ[0]!.variantId).find((b) => b.kind === "dialogue")!;
    fireEvent.click(document.querySelector(`[data-block="${line.id}"]`)!);
    await waitFor(() => expect(screen.getByTestId("script-explorer-open-dialogue").getAttribute("href")).toBe(`/prosjekt/${state.project.id}/scene?scene=${id}&line=${line.id}`));
    expect(screen.getByTestId("script-explorer-open-script").getAttribute("href")).toBe(`/prosjekt/${state.project.id}/manus?scene=${id}&blokk=${line.id}`);
  });
  it("i hovedvinduet navigerer knappen; fra popup-vinduet åpnes målet i hovedvinduet", async () => {
    const { router } = setup();
    fireEvent.click(await screen.findByTestId("script-explorer-open-assembly"));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/montering$/));
    cleanup();
    const opener = { closed: false, focus: vi.fn(), location: { href: "" } };
    vi.stubGlobal("opener", opener);
    setup({ source: "11111111-1111-1111-1111-111111111111" });
    fireEvent.click(await screen.findByTestId("script-explorer-open-scene"));
    expect(opener.location.href).toMatch(/\/scene\?scene=/);
    expect(opener.focus).toHaveBeenCalled();
  });
  it("brikkene viser karakterene i scenen; menyen hopper, filtrerer og åpner biblioteket", async () => {
    const { state, occ, router } = setup();
    const chip = await screen.findByTestId("script-explorer-chip");
    expect(chip.dataset["assetId"]).toBe("maja-asset");
    fireEvent.click(chip);
    const menu = screen.getByTestId("script-explorer-asset-menu");
    expect(document.activeElement?.getAttribute("data-testid")).toBe("asset-menu-library");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement?.getAttribute("data-testid")).toBe("asset-menu-filter");
    expect(within(menu).getByTestId("asset-menu-prev").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(within(menu).getByTestId("asset-menu-next"));
    await waitFor(() => expect(screen.getByTestId("script-explorer-status").textContent).toContain("STED 1"));
    fireEvent.click(screen.getByTestId("script-explorer-chip"));
    fireEvent.click(within(screen.getByTestId("script-explorer-asset-menu")).getByTestId("asset-menu-first"));
    await waitFor(() => expect(screen.getByTestId("script-explorer-status").textContent).toContain("STED 0"));
    fireEvent.click(screen.getByTestId("script-explorer-chip"));
    fireEvent.click(within(screen.getByTestId("script-explorer-asset-menu")).getByTestId("asset-menu-all"));
    expect(screen.getAllByTestId("asset-menu-scene").map((b) => b.dataset["occurrenceId"])).toEqual(occ.map((o) => o.id));
    fireEvent.keyDown(screen.getByTestId("script-explorer-asset-menu"), { key: "Escape" });
    expect(screen.queryByTestId("script-explorer-asset-menu")).toBeNull();
    fireEvent.click(screen.getByTestId("script-explorer-chip"));
    fireEvent.click(within(screen.getByTestId("script-explorer-asset-menu")).getByTestId("asset-menu-filter"));
    expect((screen.getByTestId("script-explorer-character") as HTMLSelectElement).value).toBe("MAJA");
    fireEvent.click(screen.getByTestId("script-explorer-chip"));
    fireEvent.click(within(screen.getByTestId("script-explorer-asset-menu")).getByTestId("asset-menu-library"));
    await waitFor(() => expect(router.state.location.href).toBe(`/prosjekt/${state.project.id}/bibliotek?asset=maja-asset`));
  });
  it("klikk på talernavnet i manusteksten gir samme meny", async () => {
    const { state, occ } = setup();
    await screen.findByTestId("script-explorer-chip");
    const speaker = blocksOfVariant(state, occ[0]!.variantId).find((b) => b.kind === "character")!;
    act(() => { fireEvent.click(document.querySelector(`[data-block="${speaker.id}"]`)!, { clientX: 100, clientY: 100 }); });
    expect(screen.getByTestId("script-explorer-asset-menu").getAttribute("aria-label")).toBe("Valg for Maja");
  });
  it("viser engelske tekster", async () => {
    setLanguage("en");
    setup();
    expect((await screen.findByTestId("script-explorer-notes-toggle")).textContent).toContain("Notes (0)");
    expect(screen.getByTestId("script-explorer-open-assembly").getAttribute("aria-label")).toBe("Open in the assembly with the playhead at the scene");
  });
  it("neste/forrige/første opptreden følger produksjonsrekkefølgen", () => {
    const u = ["a", "b", "c"].map((occurrenceId) => ({ occurrenceId, number: null, active: true, how: "speaks" as const, matchedName: "X" }));
    expect(appearanceTargets(u, "b")).toEqual({ first: "a", prev: "a", next: "c" });
    expect(appearanceTargets(u, "z")).toEqual({ first: "a", prev: null, next: "a" });
  });
});
