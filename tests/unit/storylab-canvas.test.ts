// @vitest-environment node
/** Story Lab SL7: canvaskommandoene (angre og gjør om), validering, layoutFromStructure, radformatet og overføring. */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  canvasEdgeError,
  canvasNodeDefaults,
  canvasNodeError,
  canvasNodeToCommands,
  canvasSummary,
  diffStates,
  layoutFromStructure,
  mainProduction,
  orderedOccurrences,
  scenesInStoryTime,
  stateFromRows,
  toRow,
  type Command,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;

const plain = (x: ProjectState) =>
  JSON.parse(
    JSON.stringify([x.canvasNodes, x.canvasEdges, x.assets, x.storyProfiles, x.scenes], (k, v) =>
      k === "revision" ? undefined : v,
    ),
  );

function roundTrip(s: ProjectState, c: Command): ProjectState {
  const r = applyCommand(s, envelope(c));
  if (!r.ok) throw new Error(`${c.type}: ${r.error.message}`);
  const undo = applyCommand(r.state, envelope(r.inverse!));
  if (!undo.ok) throw new Error(`angre ${c.type}: ${undo.error.message}`);
  expect(plain(undo.state)).toEqual(plain(s));
  const redo = applyCommand(undo.state, envelope(undo.inverse!));
  if (!redo.ok) throw new Error(`gjør om ${c.type}: ${redo.error.message}`);
  expect(plain(redo.state)).toEqual(plain(r.state));
  return r.state;
}

const node = (kind: Parameters<typeof canvasNodeDefaults>[0], over = {}) => ({
  id: tid<"canvas_node">(),
  ...canvasNodeDefaults(kind, { title: kind, ...over }),
});
const failOf = (s: ProjectState, c: unknown) => applyCommand(s, envelope(c as Command));

describe("canvaskommandoene", () => {
  it("alle kan gjøres, angres og gjøres om", () => {
    const a = node("premise");
    const b = node("event", { x: 300 });
    const g = node("group");
    let s = roundTrip(s0, { type: "AddCanvasNodes", nodes: [a, b, g] });
    s = roundTrip(s, { type: "UpdateCanvasNode", nodeId: a.id, patch: { title: "Ny", body: "Tekst", color: "accent-brand" } });
    s = roundTrip(s, { type: "UpdateCanvasNode", nodeId: b.id, patch: { groupId: g.id } });
    s = roundTrip(s, { type: "MoveCanvasNodes", moves: [{ nodeId: a.id, x: 10, y: 20 }, { nodeId: b.id, x: 30, y: 40 }] });
    const edgeId = tid<"canvas_edge">();
    s = roundTrip(s, { type: "AddCanvasEdge", edgeId, fields: { fromNodeId: a.id, toNodeId: b.id, label: "", kind: "leads_to" } });
    s = roundTrip(s, { type: "UpdateCanvasEdge", edgeId, patch: { label: "fordi", kind: "causes" } });
    s = roundTrip(s, { type: "RemoveCanvasEdge", edgeId, removed: true });
    s = roundTrip(s, { type: "RemoveCanvasEdge", edgeId, removed: false });
    s = roundTrip(s, { type: "RemoveCanvasNodes", nodeIds: [a.id], removed: true });
    expect(s.canvasNodes[a.id]!.removed).toBe(true);
  });

  it("MoveCanvasNodes flytter flere noder i én kommando, og angring gir de gamle posisjonene", () => {
    const a = node("idea", { x: 1, y: 2 });
    const b = node("idea", { x: 3, y: 4 });
    const s = mustApply(s0, { type: "AddCanvasNodes", nodes: [a, b] });
    const r = applyCommand(s, envelope({ type: "MoveCanvasNodes", moves: [{ nodeId: a.id, x: 100, y: 100 }, { nodeId: b.id, x: 200, y: 200 }] }));
    if (!r.ok) throw new Error(r.error.message);
    expect(r.inverse).toEqual({ type: "MoveCanvasNodes", moves: [{ nodeId: a.id, x: 1, y: 2 }, { nodeId: b.id, x: 3, y: 4 }] });
  });

  it("RemoveCanvasNodes fjerner kantene, og angring tar dem tilbake", () => {
    const a = node("event");
    const b = node("event");
    const c = node("event");
    let s = mustApply(s0, { type: "AddCanvasNodes", nodes: [a, b, c] });
    const e1 = tid<"canvas_edge">();
    const e2 = tid<"canvas_edge">();
    s = mustApply(s, { type: "AddCanvasEdge", edgeId: e1, fields: { fromNodeId: a.id, toNodeId: b.id, label: "", kind: "leads_to" } });
    s = mustApply(s, { type: "AddCanvasEdge", edgeId: e2, fields: { fromNodeId: b.id, toNodeId: c.id, label: "", kind: "causes" } });
    const r = applyCommand(s, envelope({ type: "RemoveCanvasNodes", nodeIds: [b.id], removed: true }));
    if (!r.ok) throw new Error(r.error.message);
    expect(r.state.canvasEdges[e1]!.removed).toBe(true);
    expect(r.state.canvasEdges[e2]!.removed).toBe(true);
    expect(r.state.canvasNodes[a.id]!.removed).toBe(false);
    const u = applyCommand(r.state, envelope(r.inverse!));
    if (!u.ok) throw new Error(u.error.message);
    expect(u.state.canvasEdges[e1]!.removed).toBe(false);
    expect(u.state.canvasEdges[e2]!.removed).toBe(false);
    expect(u.state.canvasNodes[b.id]!.removed).toBe(false);
  });

  it("avviser ugyldige noder, kanter og koblinger", () => {
    const a = node("note");
    const s = mustApply(s0, { type: "AddCanvasNodes", nodes: [a] });
    expect(failOf(s0, { type: "AddCanvasNodes", nodes: [{ ...node("note"), kind: "x" }] }).ok).toBe(false);
    expect(failOf(s0, { type: "AddCanvasNodes", nodes: [node("note", { title: "x".repeat(301) })] }).ok).toBe(false);
    expect(failOf(s0, { type: "AddCanvasNodes", nodes: [node("note", { body: "x".repeat(8001) })] }).ok).toBe(false);
    expect(failOf(s0, { type: "AddCanvasNodes", nodes: [node("note", { groupId: a.id })] }).ok).toBe(false);
    expect(failOf(s, { type: "AddCanvasNodes", nodes: [node("note", { groupId: a.id })] }).ok).toBe(false);
    expect(failOf(s, { type: "AddCanvasNodes", nodes: [node("note", { assetId: tid() })] }).ok).toBe(false);
    expect(failOf(s, { type: "AddCanvasEdge", edgeId: tid(), fields: { fromNodeId: a.id, toNodeId: a.id, label: "", kind: "leads_to" } }).ok).toBe(false);
    expect(failOf(s, { type: "AddCanvasEdge", edgeId: tid(), fields: { fromNodeId: a.id, toNodeId: tid(), label: "", kind: "leads_to" } }).ok).toBe(false);
    expect(failOf(s, { type: "UndoAddCanvasNodes", nodeIds: [tid()] }).ok).toBe(false);
  });

  it("en gruppe og nodene i den kan legges inn i samme kommando", () => {
    const g = node("group");
    const a = node("idea", { groupId: g.id });
    const s = mustApply(s0, { type: "AddCanvasNodes", nodes: [g, a] });
    expect(s.canvasNodes[a.id]!.groupId).toBe(g.id);
  });
});

describe("validering", () => {
  it("canvasNodeError og canvasEdgeError", () => {
    expect(canvasNodeError(canvasNodeDefaults("idea"))).toBeNull();
    expect(canvasNodeError({ ...canvasNodeDefaults("idea"), w: 0 })).not.toBeNull();
    expect(canvasNodeError({ ...canvasNodeDefaults("idea"), x: Number.NaN })).not.toBeNull();
    expect(canvasNodeError({ ...canvasNodeDefaults("idea"), color: "#fff" })).not.toBeNull();
    expect(canvasEdgeError({ fromNodeId: "a", toNodeId: "b", label: "", kind: "conflicts" })).toBeNull();
    expect(canvasEdgeError({ fromNodeId: "a", toNodeId: "b", label: "x".repeat(201), kind: "conflicts" })).not.toBeNull();
    expect(canvasEdgeError({ fromNodeId: "a", toNodeId: "b", label: "", kind: "x" })).not.toBeNull();
  });
});

describe("radformatet", () => {
  it("noder og kanter går gjennom rader og tilbake", () => {
    const a = node("character", { color: "status-warning" });
    const b = node("location");
    const e = tid<"canvas_edge">();
    let s = mustApply(s0, { type: "AddCanvasNodes", nodes: [a, b] });
    s = mustApply(s, { type: "AddCanvasEdge", edgeId: e, fields: { fromNodeId: a.id, toNodeId: b.id, label: "bor", kind: "relation" } });
    const diff = diffStates(s0, s);
    expect(diff.inserts["story_canvas_nodes"]).toHaveLength(2);
    expect(diff.inserts["story_canvas_edges"]).toHaveLength(1);
    const back = stateFromRows({
      project: {} as never,
      productions: [], scenes: [], scene_variants: [], script_blocks: [], script_block_revisions: [], scene_occurrences: [], production_segments: [], takes: [],
      story_canvas_nodes: Object.values(s.canvasNodes).map((n) => toRow("canvasNodes", n, s.project.id)),
      story_canvas_edges: Object.values(s.canvasEdges).map((x) => toRow("canvasEdges", x, s.project.id)),
    } as never);
    expect(back.canvasNodes).toEqual(s.canvasNodes);
    expect(back.canvasEdges).toEqual(s.canvasEdges);
  });
});

describe("layoutFromStructure", () => {
  it("gir en premissnode og scenenoder i fortellingstid langs en tidslinje", () => {
    const nodes = layoutFromStructure(s0);
    const scenes = scenesInStoryTime(s0);
    expect(nodes[0]!.kind).toBe("premise");
    const sceneNodes = nodes.filter((n) => n.kind === "scene");
    expect(sceneNodes.map((n) => n.sceneId)).toEqual(scenes.map((s) => s.sceneId));
    for (let i = 1; i < sceneNodes.length; i++) expect(sceneNodes[i]!.x).toBeGreaterThan(sceneNodes[i - 1]!.x);
    expect(new Set(sceneNodes.map((n) => n.y)).size).toBe(1);
    // Ren funksjon: ingenting er lagret
    expect(Object.keys(s0.canvasNodes)).toHaveLength(0);
  });

  it("hopper over premiss og scener som allerede finnes på canvaset", () => {
    const first = layoutFromStructure(s0);
    const s = mustApply(s0, {
      type: "AddCanvasNodes",
      nodes: first.slice(0, 2).map(({ key: _k, ...f }) => ({ id: tid<"canvas_node">(), ...f })),
    });
    const again = layoutFromStructure(s);
    expect(again.some((n) => n.kind === "premise")).toBe(false);
    expect(again).toHaveLength(first.length - 2);
  });
});

describe("canvasSummary", () => {
  it("er kort og tar aldri med fakta eller hemmeligheter", () => {
    let s = mustApply(s0, {
      type: "AddStoryFact",
      factId: tid(),
      fields: { text: "HEMMELIG-FAKTUM", kind: "secret", atSceneId: null, knownBy: [] },
    } as never);
    s = mustApply(s, { type: "AddCanvasNodes", nodes: Array.from({ length: 200 }, (_, i) => node("idea", { title: `Idé ${i}`, body: "x".repeat(100) })) });
    const t = canvasSummary(s);
    expect(t.length).toBeLessThanOrEqual(4000);
    expect(t).not.toContain("HEMMELIG-FAKTUM");
    expect(t).toContain("[idea] Idé 0");
  });
});

describe("overføring fra canvaset", () => {
  it("karakter: CreateAssets, tom profil med notat og kobling – én angregruppe", () => {
    const a = node("character", { title: "Bestefar", body: "Gretten, men snill" });
    const s = mustApply(s0, { type: "AddCanvasNodes", nodes: [a] });
    const plan = canvasNodeToCommands(s, a.id, { kind: "asset", assetKind: "character", withProfile: true }, () => tid());
    if (!plan.ok) throw new Error(plan.message);
    expect(plan.commands.map((c) => c.type)).toEqual(["CreateAssets", "SetStoryProfile", "UpdateCanvasNode"]);
    let t = s;
    const inverses: Command[] = [];
    for (const c of plan.commands) {
      const r = applyCommand(t, envelope(c));
      if (!r.ok) throw new Error(r.error.message);
      inverses.unshift(r.inverse!);
      t = r.state;
    }
    const assetId = plan.result.kind === "asset" ? plan.result.assetId : "";
    expect(t.assets[assetId]!.name).toBe("Bestefar");
    expect(t.assets[assetId]!.kind).toBe("character");
    expect(t.canvasNodes[a.id]!.assetId).toBe(assetId);
    expect(Object.values(t.storyProfiles).find((p) => p.assetId === assetId)!.profile.notes).toBe("Gretten, men snill");
    for (const c of inverses) t = mustApply(t, c);
    expect(plain(t)).toEqual(plain(s));
  });

  it("dyr og sted bruker riktig ressurstype", () => {
    const a = node("character", { title: "Katten" });
    const b = node("location", { title: "Låven" });
    const s = mustApply(s0, { type: "AddCanvasNodes", nodes: [a, b] });
    const p1 = canvasNodeToCommands(s, a.id, { kind: "asset", assetKind: "animal" }, () => tid());
    const p2 = canvasNodeToCommands(s, b.id, { kind: "asset", assetKind: "location" }, () => tid());
    expect(p1.ok && p1.commands[0]!.type === "CreateAssets" && p1.commands[0]!.assets[0]!.fields.kind).toBe("animal");
    expect(p2.ok && p2.commands[0]!.type === "CreateAssets" && p2.commands[0]!.assets[0]!.fields.kind).toBe("location");
    expect(canvasNodeToCommands(s, b.id, { kind: "asset", assetKind: "character" }).ok).toBe(false);
  });

  it("scene: CreateScene i hovedproduksjonen etter valgt scene, med handlingsblokk og kobling", () => {
    const main = mainProduction(s0)!;
    const occs = orderedOccurrences(s0, main.id);
    const a = node("scene", { title: "EXT. LÅVEN - NATT", body: "Snøen faller." });
    const s = mustApply(s0, { type: "AddCanvasNodes", nodes: [a] });
    const plan = canvasNodeToCommands(s, a.id, { kind: "scene", afterOccurrenceId: occs[0]!.id }, () => tid());
    if (!plan.ok) throw new Error(plan.message);
    let t = s;
    for (const c of plan.commands) t = mustApply(t, c);
    const after = orderedOccurrences(t, main.id);
    const occId = plan.result.kind === "scene" ? plan.result.occurrenceId : "";
    expect(after[1]!.id).toBe(occId);
    const v = t.variants[after[1]!.variantId]!;
    expect(v.heading).toEqual({ intExt: "EXT.", location: "LÅVEN", time: "NATT" });
    expect(Object.values(t.blocks).some((b) => b.variantId === v.id && b.kind === "action" && b.text === "Snøen faller.")).toBe(true);
    expect(t.canvasNodes[a.id]!.sceneId).toBe(after[1]!.sceneId);
    expect(canvasNodeToCommands(t, a.id, { kind: "scene", afterOccurrenceId: null }).ok).toBe(false);
    expect(canvasNodeToCommands(s, a.id, { kind: "scene", afterOccurrenceId: tid() }).ok).toBe(false);
  });
});
