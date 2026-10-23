// @vitest-environment node
/** SB-1 (0102): storyboardgrunnmur – paneler som komposisjoner, blokkforankring, statusspor og
 * bevarte revisjoner, alle med angre/gjøre om. */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  backupIdMap,
  defaultLayerFields,
  diffStates,
  emptyProjectState,
  makeBackup,
  orderedOccurrences,
  panelBlockIds,
  planStoryboardSeed,
  productionStatusHistoryOf,
  productionStatusOf,
  restoredState,
  storyboardPanelsOf,
  type Command,
  type ProjectRows,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

function setup() {
  const seed = seedProject(3);
  const occs = orderedOccurrences(seed.state, seed.mainId);
  return { s: seed.state, mainId: seed.mainId, occ: occs[0]!, occ2: occs[1]! };
}

function undoRedo(s0: ProjectState, c: Command) {
  const r = applyCommand(s0, envelope(c));
  if (!r.ok) throw new Error(`${c.type}: ${r.error.message}`);
  const u = applyCommand(r.state, envelope(r.inverse!));
  if (!u.ok) throw new Error(`angre ${c.type}: ${u.error.message}`);
  const again = applyCommand(u.state, envelope(u.inverse!));
  if (!again.ok) throw new Error(`gjør om ${c.type}: ${again.error.message}`);
  return { done: r.state, undone: u.state, redone: again.state, inverse: r.inverse };
}

function addPanel(s: ProjectState, occ: { id: string; variantId: string }, orderKey = "a") {
  const panelId = tid();
  const st = mustApply(s, {
    type: "AddStoryboardPanel",
    panelId,
    occurrenceId: occ.id,
    variantId: occ.variantId,
    orderKey,
  });
  return { st, panelId };
}

describe("SB-1 paneler", () => {
  it("opprette med blokkforankring, angre og gjøre om", () => {
    const { s, occ } = setup();
    const blocks = Object.values(s.blocks).filter((b) => b.variantId === occ.variantId && !b.removed);
    const linkId = tid();
    const r = undoRedo(s, {
      type: "AddStoryboardPanel",
      panelId: tid(),
      occurrenceId: occ.id,
      variantId: occ.variantId,
      orderKey: "a",
      name: "Panel 1",
      blocks: [{ linkId, blockId: blocks[0]!.id, orderKey: "a" }],
    });
    const panel = Object.values(r.done.compositions).find((c) => c.kind === "storyboard")!;
    expect(panel.occurrenceId).toBe(occ.id);
    expect(panelBlockIds(r.done, panel.id)).toEqual([blocks[0]!.id]);
    expect(r.undone.compositions[panel.id]).toBeUndefined();
    expect(Object.keys(r.undone.panelBlocks).length).toBe(0);
    expect(panelBlockIds(r.redone, panel.id)).toEqual([blocks[0]!.id]);
  });
  it("avviser variant som ikke samsvarer med forekomsten", () => {
    const { s, occ, occ2 } = setup();
    const r = applyCommand(s, envelope({
      type: "AddStoryboardPanel", panelId: tid(), occurrenceId: occ.id, variantId: occ2.variantId, orderKey: "a",
    }));
    expect(r.ok).toBe(false);
  });
  it("oppdater, deaktiver, skjul og skjul i historikken – med angre", () => {
    const { s, occ } = setup();
    const { st, panelId } = addPanel(s, occ);
    const r = undoRedo(st, { type: "UpdateStoryboardPanel", panelId, name: "Nytt navn", active: false, hidden: true, durationFrames: 48 });
    const p = r.done.compositions[panelId]!;
    expect([p.name, p.active, p.hidden, p.durationFrames]).toEqual(["Nytt navn", false, true, 48]);
    const q = r.undone.compositions[panelId]!;
    expect([q.name, q.active, q.hidden, q.durationFrames]).toEqual(["", true, false, 0]);
  });
  it("flytt innen scenen og til annen scene med ny forankring – inversen gjenoppretter koblingene", () => {
    const { s, occ, occ2 } = setup();
    const blocks = Object.values(s.blocks).filter((b) => b.variantId === occ.variantId && !b.removed);
    const panelId = tid();
    let st = mustApply(s, {
      type: "AddStoryboardPanel", panelId, occurrenceId: occ.id, variantId: occ.variantId, orderKey: "a",
      blocks: [{ linkId: tid(), blockId: blocks[0]!.id, orderKey: "a" }],
    });
    const mv = undoRedo(st, { type: "MoveStoryboardPanel", panelId, orderKey: "b" });
    expect(mv.done.compositions[panelId]!.orderKey).toBe("b");
    expect(mv.undone.compositions[panelId]!.orderKey).toBe("a");
    const panelIdS = panelId as string;
    const blocks2 = Object.values(st.blocks).filter((b) => b.variantId === occ2.variantId && !b.removed);
    const to = undoRedo(st, {
      type: "MoveStoryboardPanelToScene", panelId, occurrenceId: occ2.id, variantId: occ2.variantId, orderKey: "a",
      blocks: [{ linkId: tid(), blockId: blocks2[0]!.id, orderKey: "a" }],
    });
    expect(to.done.compositions[panelId]!.occurrenceId).toBe(occ2.id);
    expect(panelBlockIds(to.done, panelIdS as never)).toEqual([blocks2[0]!.id]);
    expect(to.undone.compositions[panelId]!.occurrenceId).toBe(occ.id);
    expect(panelBlockIds(to.undone, panelIdS as never)).toEqual([blocks[0]!.id]);
  });
  it("fjern og gjeninnfør (removed, ikke slettet)", () => {
    const { s, occ } = setup();
    const { st, panelId } = addPanel(s, occ);
    const r = undoRedo(st, { type: "SetStoryboardPanelRemoved", panelId, removed: true });
    expect(r.done.compositions[panelId]!.removed).toBe(true);
    expect(storyboardPanelsOf(r.done, occ.id as never).length).toBe(0);
    expect(r.undone.compositions[panelId]!.removed).toBe(false);
  });
});

describe("SB-1 første åpning (seed-forslag)", () => {
  it("forslår ett tomt panel per aktiv forekomst uten paneler; ingenting opprettes uten kommando", () => {
    const { s, mainId, occ } = setup();
    const plan = planStoryboardSeed(s, mainId);
    expect(plan.length).toBe(3);
    const { st } = addPanel(s, occ);
    expect(planStoryboardSeed(st, mainId).length).toBe(2);
  });
  it("SeedStoryboardPanels oppretter alle i én kommando med én angring", () => {
    const { s, mainId } = setup();
    const plan = planStoryboardSeed(s, mainId);
    const panels = plan.map((p, i) => ({ panelId: tid(), occurrenceId: p.occurrenceId, variantId: p.variantId, orderKey: `a${i}` }));
    const r = undoRedo(s, { type: "SeedStoryboardPanels", productionId: mainId, panels });
    expect(Object.values(r.done.compositions).filter((c) => c.kind === "storyboard").length).toBe(3);
    expect(Object.values(r.undone.compositions).filter((c) => c.kind === "storyboard").length).toBe(0);
    expect(Object.values(r.redone.compositions).filter((c) => c.kind === "storyboard").length).toBe(3);
  });
});

describe("SB-1 statusspor", () => {
  it("setter status med historikk; tidligere godkjenninger bevares; angre gjør om", () => {
    const { s, occ } = setup();
    const { st, panelId } = addPanel(s, occ);
    const s1 = mustApply(st, {
      type: "SetProductionStatus", statusId: tid(), eventId: tid(), area: "storyboard", compositionId: panelId, status: "in_progress",
    });
    const r = undoRedo(s1, {
      type: "SetProductionStatus", statusId: tid(), eventId: tid(), area: "storyboard", compositionId: panelId, status: "done",
    });
    expect(productionStatusOf(r.done, "storyboard", { compositionId: panelId as never })!.status).toBe("done");
    const hist = productionStatusHistoryOf(r.done, "storyboard", { compositionId: panelId as never });
    expect(hist.map((e) => e.status)).toEqual(["in_progress", "done"]);
    // Angre fjerner den nyeste hendelsen og setter statusen tilbake; den første godkjenningen står igjen
    expect(productionStatusOf(r.undone, "storyboard", { compositionId: panelId as never })!.status).toBe("in_progress");
    expect(productionStatusHistoryOf(r.undone, "storyboard", { compositionId: panelId as never }).map((e) => e.status)).toEqual(["in_progress"]);
    expect(productionStatusOf(r.redone, "storyboard", { compositionId: panelId as never })!.status).toBe("done");
  });
  it("avviser to mål, ingen mål og ukjent status", () => {
    const { s, occ } = setup();
    const base = { type: "SetProductionStatus", statusId: tid(), eventId: tid(), area: "storyboard", status: "done" } as const;
    expect(applyCommand(s, envelope({ ...base, occurrenceId: occ.id, compositionId: tid() })).ok).toBe(false);
    expect(applyCommand(s, envelope(base)).ok).toBe(false);
    expect(applyCommand(s, envelope({ ...base, occurrenceId: occ.id, status: "ferdig" as never })).ok).toBe(false);
  });
});

describe("SB-1 bevarte revisjoner", () => {
  it("øyeblikksbilde bare etter godkjenning; innholdet har komposisjon, lag og blokker", () => {
    const { s, occ } = setup();
    const blocks = Object.values(s.blocks).filter((b) => b.variantId === occ.variantId && !b.removed);
    const panelId = tid();
    let st = mustApply(s, {
      type: "AddStoryboardPanel", panelId, occurrenceId: occ.id, variantId: occ.variantId, orderKey: "a",
      blocks: [{ linkId: tid(), blockId: blocks[0]!.id, orderKey: "a" }],
    });
    // Ikke godkjent ennå
    expect(applyCommand(st, envelope({ type: "SnapshotStoryboardPanel", panelId, snapshotId: tid() })).ok).toBe(false);
    st = mustApply(st, {
      type: "SetProductionStatus", statusId: tid(), eventId: tid(), area: "storyboard", compositionId: panelId, status: "done",
    });
    st = mustApply(st, {
      type: "AddLayers", layers: [{
        layerId: tid(), compositionId: panelId as never,
        fields: { ...defaultLayerFields(st, st.compositions[panelId]!, { fill: "#101114" }),
          kind: "note", fill: null, name: "Lapp",
          note: { noteType: "visual", text: "Husk skygge", color: "#ffcc00", handled: false, anchor: null },
        },
      }],
    });
    const r = undoRedo(st, { type: "SnapshotStoryboardPanel", panelId, snapshotId: tid() });
    const snap = Object.values(r.done.panelSnapshots)[0]!;
    expect(snap.panelRevision).toBe(r.done.compositions[panelId]!.revision);
    expect(snap.snapshot.blockIds).toEqual([blocks[0]!.id]);
    expect(snap.snapshot.layers.length).toBe(1);
    expect(snap.snapshot.layers[0]!.kind).toBe("note");
    expect(Object.keys(r.undone.panelSnapshots).length).toBe(0);
    expect(Object.keys(r.redone.panelSnapshots).length).toBe(1);
  });
});

describe("SB-1 storyboardlag", () => {
  it("note/arrow/camera_mark bare i storyboardkomposisjoner", () => {
    const { s, occ } = setup();
    const { st, panelId } = addPanel(s, occ);
    const sceneComp = Object.values(st.compositions).find((c) => (c.kind ?? "scene") === "scene");
    const note = { noteType: "direction" as const, text: "x", color: "#ffcc00", handled: false, anchor: null };
    const mk = (compositionId: string): Command => ({
      type: "AddLayers",
      layers: [{ layerId: tid(), compositionId: compositionId as never, fields: { ...defaultLayerFields(st, st.compositions[compositionId]!, { fill: "#101114" }), kind: "note", fill: null, note } }],
    });
    if (sceneComp) expect(applyCommand(st, envelope(mk(sceneComp.id))).ok).toBe(false);
    const r = undoRedo(st, mk(panelId));
    const layer = Object.values(r.done.layers).find((l) => l.kind === "note")!;
    expect(layer.compositionId).toBe(panelId);
    expect(r.undone.layers[layer.id]).toBeUndefined();
    // Ugyldig spesifikasjon avvises (farge må være #rrggbb)
    expect(applyCommand(st, envelope({
      type: "AddLayers",
      layers: [{ layerId: tid(), compositionId: panelId, fields: { ...defaultLayerFields(st, st.compositions[panelId]!, { fill: "#101114" }), kind: "note", fill: null, note: { ...note, color: "gul" } } }],
    })).ok).toBe(false);
    // note-felt på en vanlig lagtype avvises
    expect(applyCommand(st, envelope({
      type: "AddLayers",
      layers: [{ layerId: tid(), compositionId: panelId as never, fields: { ...defaultLayerFields(st, st.compositions[panelId]!, { fill: "#101114" }), kind: "other", note } }],
    })).ok).toBe(false);
  });
});

describe("SB-1 sikkerhetskopi", () => {
  it("rundtur tar med paneler, forankringer, status og øyeblikksbilder", async () => {
    const { s, occ } = setup();
    const blocks = Object.values(s.blocks).filter((b) => b.variantId === occ.variantId && !b.removed);
    const panelId = tid();
    const st = mustApply(s, {
      type: "AddStoryboardPanel", panelId, occurrenceId: occ.id, variantId: occ.variantId, orderKey: "a",
      blocks: [{ linkId: tid(), blockId: blocks[0]!.id, orderKey: "a" }],
    });
    const st2 = mustApply(st, {
      type: "SetProductionStatus", statusId: tid(), eventId: tid(), area: "storyboard", compositionId: panelId, status: "done",
    });
    const st3 = mustApply(st2, { type: "SnapshotStoryboardPanel", panelId, snapshotId: tid() });
    const patch = diffStates(emptyProjectState(st3.project), st3);
    const rows = { project: st3.project, ...patch.inserts, script_block_revisions: patch.blockRevisions } as unknown as ProjectRows;
    const backup = makeBackup({
      rows, scriptVersions: [], importedDocuments: [], changeLog: [], generationJobs: [],
      schemaVersion: 102, createdAt: "2026-10-23T00:00:00Z", include: new Set(),
    });
    expect(backup.tables["storyboard_panel_blocks"]?.length).toBe(1);
    expect(backup.tables["production_statuses"]?.length).toBe(1);
    expect(backup.tables["storyboard_panel_snapshots"]?.length).toBe(1);
    // Gjenoppretting i et tomt prosjekt tar med panel, status og øyeblikksbilde
    const newProject = tid();
    const newMain = tid();
    const map = await backupIdMap(backup, newProject as never, newMain as never);
    const main = Object.values(st3.productions).find((p) => p.kind === "main")!;
    const restored = restoredState(backup, map, {
      ...emptyProjectState({ ...st3.project, id: newProject as never }),
      productions: { [newMain]: { ...main, id: newMain as never } },
    }, tid() as never);
    expect(Object.values(restored.compositions).some((c) => c.kind === "storyboard")).toBe(true);
    expect(Object.keys(restored.panelSnapshots).length).toBe(1);
    expect(Object.keys(restored.productionStatuses).length).toBe(1);
    expect(Object.keys(restored.panelBlocks).length).toBe(1);
  });
});
