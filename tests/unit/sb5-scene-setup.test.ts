// @vitest-environment node
/**
 * SB-5: kobling storyboard → sceneeditor.
 * Tester at «Opprett sceneoppsett fra storyboard» kopierer riktig, aldri overskriver en scene med
 * innhold, at angre/gjør om virker, og at referansepanelets aktive panel følger avspillingshodet.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION,
  applyCommand,
  defaultLayerFields,
  filmClips,
  orderedOccurrences,
  planSceneSetup,
  activePanelIdAtFrame,
  scenePanelReferences,
  panelTiming,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

function setup() {
  const seed = seedProject(1);
  const occurrenceId = orderedOccurrences(seed.state, seed.mainId)[0]!.id as string;
  return { s: seed.state, mainId: seed.mainId, occurrenceId };
}

function addPanel(s: ProjectState, occurrenceId: string, orderKey: string, durationFrames = 0) {
  const panelId = tid<"composition">();
  const st = mustApply(s, {
    type: "AddStoryboardPanel",
    panelId,
    occurrenceId: occurrenceId as never,
    variantId: s.occurrences[occurrenceId as never]!.variantId,
    orderKey,
    ...(durationFrames > 0 ? { durationFrames } : {}),
  });
  return { s: st, panelId };
}

function addPanelLayer(s: ProjectState, panelId: string, over: Partial<import("@/core").LayerFields> = {}) {
  const layerId = tid<"composition_layer>();
  const st = mustApply(s, {
    type: "AddLayers",
    layers: [
      {
        layerId,
        compositionId: panelId as never,
        orderKey: `l${layerId.slice(-2)}`,
        fields: { ...defaultLayerFields(s, s.compositions[panelId]!, { fill: "#ffffff" }), ...over },
      },
    ],
  });
  return { s: st, layerId };
}

describe("SB-5 planSceneSetup", () => {
  it("oppretter ny 2D-scene med riktige felter når scenen ikke har en", () => {
    let { s, mainId, occurrenceId } = setup();
    const p = addPanel(s, occurrenceId, "a", 120);
    s = addPanelLayer(p.s, p.panelId, { assetId: tid<"asset">() as never }).s;
    const plan = planSceneSetup(s, filmClips(s, mainId), occurrenceId, p.panelId);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.mode).toBe("create");
    expect(plan.summary).toMatchObject({ copied: 1, skippedNotes: 0, skippedArrows: 0, cameraMark: false, cameraAdded: false });
    const st = mustApply(s, plan.commands[0]!);
    const comp = st.compositions[plan.compositionId]!;
    expect(comp.kind ?? "scene").toBe("scene");
    expect(comp.variantId).toBe(occ.variantId(s));
    expect(comp.width).toBe(s.project.frameWidth);
    function occVariant(state: ProjectState) { return state.occurrences[occurrenceId as never]!.variantId; }
    function occVariantId() { return occVariant(s); }
    expect(comp.variantId).toBe(occVariantId());
    expect(comp.background).toBe(s.compositions[p.panelId]!.background);
    expect(comp.durationFrames).toBe(120);
  });

  function occVariantOf(state: ProjectState, occurrenceId: string) {
    return state.occurrences[occurrenceId as never]!.variantId;
  }

  it("kopierer ressurslag med ID/versjon og transformasjon; hopper over lapp, pil og kameramerke", () => {
    let { s, mainId, occurrenceId } = setup();
    const p = addPanel(s, occurrenceId, "a", 100);
    const assetId = tid<"asset">();
    s = addPanelLayer(p.s, p.panelId, {
      assetId: assetId as never,
      assetVariantId: tid<"asset_variant">() as never,
      versionId: tid<"asset_version">() as never,
      transform: { x: 500, y: 300, scaleX: 1.5, scaleY: 1.5, rotation: 15, opacity: 1 },
    }).s;
    s = addPanelLayer(s, p.panelId, { kind: "note", fill: null, note: { text: "regi", color: "#fff", noteType: "direction", handled: false, anchor: null } }).s;
    s = addPanelLayer(s, p.panelId, { kind: "arrow", fill: null, arrow: { points: [{ x: 0, y: 0, smooth: false }, { x: 10, y: 10, smooth: false }], form: "straight", thickness: 2, color: "#fff", category: "character", layerId: null } }).s;
    s = addPanelLayer(s, p.panelId, { kind: "camera_mark", fill: null, cameraMark: { frame: { x: 100, y: 100, width: 400, height: 300 }, zoom: 2, pan: { x: 0, y: 0 }, tilt: 0 } }).s;

    const plan = planSceneSetup(s, filmClips(s, mainId), occurrenceId, p.panelId);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.summary).toMatchObject({ copied: 1, skippedNotes: 1, skippedArrows: 1, cameraMark: true, cameraAdded: true });

    let st = s;
    for (const c of plan.commands) st = mustApply(st, c);
    const newLayers = layersOf(st, plan.compositionId);
    expect(newLayers).toHaveLength(1);
    const layer = newLayers[0]!;
    expect(layer.assetId).toBe(assetId);
    expect(layer.transform).toEqual({ x: 500, y: 300, scaleX: 1.5, scaleY: 1.5, rotation: 15, opacity: 1 });
    expect(layersOf(st, plan.compositionId).some((l) => l.note || l.arrow || l.cameraMark)).toBe(false);
    // Kameramerket ble et kameraskudd, ikke et synlig lag
    expect(st.compositions[plan.compositionId]!.camera.shots).toHaveLength(1);
    expect(st.compositions[plan.compositionId]!.camera.shots[0]!.to.zoom).toBe(2);
  });

  it("avviser scene med innhold; «nytt utkast» legger lag øverst uten å røre eksisterende", () => {
    let { s, mainId, occurrenceId } = setup();
    const p = addPanel(s, occurrenceId, "a", 50);
    s = addPanelLayer(p.s, p.panelId, { assetId: tid<"asset">() as never }).s;
    const compId = tid<"composition">();
    s = mustApply(s, { type: "CreateComposition", compositionId: compId, variantId: s.occurrences[occurrenceId as never]!.variantId, fields: { ...DEFAULT_COMPOSITION, durationFrames: 50 } });
    const oldLayerId = tid<"composition_layer">();
    s = mustApply(s, { type: "AddLayers", layers: [{ layerId: oldLayerId, compositionId: compId, fields: defaultLayerFields(s, s.compositions[compId]!, { fill: "#123456" }) }] });

    const refused = planSceneSetup(s, filmClips(s, mainId), occurrenceId, p.panelId);
    expect(refused).toEqual({ ok: false, reason: "has_content" });

    const draft = planSceneSetup(s, filmClips(s, mainId), occurrenceId, p.panelId, { draft: true });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.mode).toBe("layers");
    expect(draft.commands.every((c) => c.type !== "CreateComposition")).toBe(true);
    let st = s;
    for (const c of draft.commands) st = mustApply(st, c);
    const layers = layersOf(st, compId);
    expect(layers).toHaveLength(2);
    expect(layers.find((l) => l.id === oldLayerId)).toBeDefined(); // eksisterende bevart
    expect(st.compositions[compId]!.background).toBe(DEFAULT_COMPOSITION.background); // urørt
  });

  it("alle kommandoer har inverser; angre gjennoppretter utgangstilstanden", () => {
    let { s, mainId, occurrenceId } = setup();
    const p = addPanel(s, occurrenceId, "a", 100);
    s = addPanelLayer(p.s, p.panelId, { assetId: tid<"asset">() as never }).s;
    const plan = planSceneSetup(s, filmClips(s, mainId), occurrenceId, p.panelId);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    let st = s;
    const inverses: import("@/core").Command[] = [];
    for (const c of plan.commands) {
      const r = applyCommand(st, envelope(c));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      st = r.state;
      inverses.unshift(r.inverse);
    }
    expect(layersOf(st, plan.compositionId).length).toBe(1);
    for (const inv of inverses) st = mustApply(st, inv);
    // Alt borte igjen: komposisjonen er fjernet og panelets lag er urørt
    expect(st.compositions[plan.compositionId]?.removed ?? true).toBe(true);
    expect(Object.values(st.layers).filter((l) => !l.removed)).toHaveLength(1);
    expect(Object.values(st.layers).find((l) => !l.removed)!.compositionId).toBe(p.panelId);
  });
});

describe("SB-5 referansepanelet følger avspillingen", () => {
  it("aktivt panel følger scenens bilde etter storyboardtimingen", () => {
    let { s, mainId, occurrenceId } = setup();
    const a = addPanel(s, occurrenceId, "a", 50);
    const b = addPanel(a.s, occurrenceId, "b", 50);
    s = b.s;
    const clips = filmClips(s, mainId);
    expect(activePanelIdAtFrame(s, clips, occurrenceId, 0)).toBe(a.panelId);
    expect(activePanelIdAtFrame(s, clips, occurrenceId, 49)).toBe(a.panelId);
    expect(activePanelIdAtFrame(s, clips, occurrenceId, 50)).toBe(b.panelId);
    expect(activePanelIdAtFrame(s, clips, occurrenceId, 9999)).toBe(b.panelId);
  });

  it("referanseinfoen oppsummerer figurer, lapper, piler, kamera, replikker og kommentarer", () => {
    let { s, occurrenceId } = setup();
    const p = addPanel(s, occurrenceId, "a", 100);
    s = addPanelLayer(p.s, p.panelId, { assetId: tid<"asset">() as never }).s;
    s = addPanelLayer(s, p.panelId, { kind: "note", fill: null, note: { text: "x", color: "#fff", noteType: "visual", handled: false, anchor: null } }).s;
    s = addPanelLayer(s, p.panelId, { kind: "camera_mark", fill: null, cameraMark: { frame: { x: 0, y: 0, width: 100, height: 100 }, zoom: 1, pan: { x: 0, y: 0 }, tilt: 0 } }).s;
    s = mustApply(s, {
      type: "AddAnnotation",
      annotationId: tid<"annotation">(),
      variantId: s.occurrences[occurrenceId as never]!.variantId,
      blockId: null,
      panelId: p.panelId,
      start: 0,
      end: 0,
      quote: "",
      text: "Sjekk lyset",
      authorName: "Test",
      stampAt: "2026-10-24T00:00:00.000Z",
    } as never);
    const info = scenePanelReferences(s, occurrenceId)[0]!;
    expect(info).toMatchObject({ figures: 1, notes: 1, arrows: 0, cameraMark: true, comments: 1 });
  });
});
