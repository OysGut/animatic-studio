// @vitest-environment node
/** Manusversjoner og sammenligning (REQ-0032, REQ-0069, REQ-0076–0078, REQ-0083). */
import { describe, expect, it } from "vitest";
import {
  diffSnapshots,
  exportNumbering,
  keyBetween,
  numbersByOccurrence,
  orderedOccurrences,
  paginate,
  parseScreenplayLines,
  planImport,
  scriptView,
  snapshotFromState,
  snapshotPaginationInput,
  type ProductionId,
} from "@/core";
import { mustApply, seedProject, tid } from "../helpers/fixtures";

const L = (row: number, x: number, text: string) => ({ page: 1, x, y: 72 + row * 12, text });

function project() {
  const { state, mainId } = seedProject(0);
  const parsed = parseScreenplayLines(
    [
      L(0, 54, "1 INT. A - DAG 1"),
      L(2, 108, "Handling A."),
      L(4, 252, "MAJA"),
      L(5, 180, "Hei."),
      L(7, 54, "2 INT. B - DAG 2"),
      L(9, 108, "Handling B."),
      L(11, 54, "3 INT. C - NATT 3"),
      L(13, 108, "Handling C."),
      L(15, 54, "4 INT. D - NATT 4"),
      L(17, 108, "Handling D."),
    ],
    { format: "pdf" },
  );
  const cmd = planImport(state, parsed, { productionId: mainId as ProductionId, newId: tid });
  return { s: mustApply(state, cmd), mainId: mainId as ProductionId, cmd };
}

describe("Øyeblikksbilde", () => {
  it("bevarer rekkefølge, synlighet, nummer, overskrift og tekst, og endres ikke av senere endringer (REQ-0032, REQ-0077)", () => {
    const { s, mainId, cmd } = project();
    const v1 = snapshotFromState(s, mainId);
    const frozen = JSON.stringify(v1);
    const s2 = mustApply(s, {
      type: "EditBlockText",
      productionId: mainId,
      blockId: cmd.scenes[0]!.blocks[0]!.blockId,
      text: "Ny handling A.",
    });
    expect(JSON.stringify(v1)).toBe(frozen);
    expect(v1.scenes.map((x) => x.number)).toEqual(["1", "2", "3", "4"]);
    expect(v1.scenes[0]!.blocks[0]!.rev).toBe(1);
    expect(snapshotFromState(s2, mainId).scenes[0]!.blocks[0]!.rev).toBe(2);
    // Versjonen kan sidebrytes og eksporteres for seg (identisk med manuset da den ble laget)
    const pages = paginate(snapshotPaginationInput(v1)).pages;
    expect(pages[0]!.lines.some((l) => l.text === "Handling A.")).toBe(true);
    expect(scriptView(s, mainId)).toHaveLength(4);
  });
});

describe("Sammenligning", () => {
  it("finner hver endringstype med riktig type (REQ-0078)", () => {
    const { s, mainId, cmd } = project();
    const before = snapshotFromState(s, mainId);
    const [a, b, c, d] = cmd.scenes;
    let x = s;
    // Endret dialog i A, endret handling i B, overskrift i C, D flyttes først, B deaktiveres, ny scene
    x = mustApply(x, {
      type: "EditBlockText",
      productionId: mainId,
      blockId: a!.blocks[2]!.blockId,
      text: "Hallo!",
    });
    x = mustApply(x, {
      type: "EditBlockText",
      productionId: mainId,
      blockId: b!.blocks[0]!.blockId,
      text: "Ny B.",
    });
    x = mustApply(x, {
      type: "EditSceneHeading",
      productionId: mainId,
      variantId: c!.variantId,
      heading: { intExt: "EXT.", location: "C", time: "NATT" },
    });
    const first = orderedOccurrences(x, mainId)[0]!;
    x = mustApply(x, {
      type: "MoveOccurrence",
      occurrenceId: d!.occurrenceId,
      orderKey: keyBetween(null, first.orderKey),
    });
    x = mustApply(x, { type: "SetOccurrenceActive", occurrenceId: b!.occurrenceId, active: false });
    const newScene = tid<"scene">();
    x = mustApply(x, {
      type: "CreateScene",
      productionId: mainId,
      sceneId: newScene,
      variantId: tid(),
      occurrenceId: tid(),
      orderKey: keyBetween(orderedOccurrences(x, mainId).at(-1)!.orderKey, null),
      heading: { intExt: "INT.", location: "E", time: "DAG" },
      blocks: [
        { blockId: tid(), kind: "character", text: "OLE", orderKey: "a" },
        { blockId: tid(), kind: "dialogue", text: "Ja.", orderKey: "b" },
      ],
    });
    // Karakterendring i A: MAJA byttes ut med OLE
    x = mustApply(x, {
      type: "EditBlockText",
      productionId: mainId,
      blockId: a!.blocks[1]!.blockId,
      text: "OLE",
    });
    const changes = diffSnapshots(before, snapshotFromState(x, mainId));
    const has = (type: string, sceneId: string) =>
      changes.some((ch) => ch.type === type && ch.sceneId === sceneId);
    expect(has("dialogue", a!.sceneId)).toBe(true);
    expect(has("characters", a!.sceneId)).toBe(true);
    expect(has("action", b!.sceneId)).toBe(true);
    expect(has("deactivated", b!.sceneId)).toBe(true);
    expect(has("heading", c!.sceneId)).toBe(true);
    expect(has("moved", d!.sceneId)).toBe(true);
    expect(has("added", newScene)).toBe(true);
    // Bare D er flyttet – de andre har samme innbyrdes rekkefølge
    expect(changes.filter((ch) => ch.type === "moved").map((ch) => ch.sceneId)).toEqual([
      d!.sceneId,
    ]);
    expect(changes.some((ch) => ch.type === "added" && ch.sceneId !== newScene)).toBe(false);
  });

  it("en scene som bare har fått nytt nummer, er ikke en ny scene (mandat 5.1)", () => {
    const { s, mainId } = project();
    const before = snapshotFromState(s, mainId);
    const renumbered = {
      ...before,
      scenes: before.scenes.map((sc, i) => ({ ...sc, number: String(i + 10) })),
    };
    const changes = diffSnapshots(before, renumbered);
    expect(changes.every((ch) => ch.type === "renumbered")).toBe(true);
    expect(changes).toHaveLength(4);
  });

  it("fjernede scener rapporteres", () => {
    const { s, mainId } = project();
    const before = snapshotFromState(s, mainId);
    const after = { ...before, scenes: before.scenes.slice(1) };
    expect(diffSnapshots(before, after).map((c) => c.type)).toEqual(["removed"]);
  });
});

describe("Historisk nummerering (REQ-0083)", () => {
  it("scener i versjonen får versjonens nummer, nye scener mellomnummer", () => {
    const { s, mainId, cmd } = project();
    // Versjon der scenene hadde andre numre
    const snap = snapshotFromState(s, mainId);
    const hist = {
      ...snap,
      scenes: snap.scenes.map((sc, i) => ({ ...sc, number: String((i + 1) * 10) })),
    };
    const newOcc = tid<"scene_occurrence">();
    const x = mustApply(s, {
      type: "CreateScene",
      productionId: mainId,
      sceneId: tid(),
      variantId: tid(),
      occurrenceId: newOcc,
      orderKey: keyBetween(cmd.scenes[1]!.orderKey, cmd.scenes[2]!.orderKey),
      heading: { intExt: "INT.", location: "NY", time: "DAG" },
      blocks: [],
    });
    const n = exportNumbering(x, mainId, {
      method: "historical",
      includeInactive: false,
      historical: numbersByOccurrence(hist),
    });
    expect(n.map((e) => e.exportNumber)).toEqual(["10", "20", "20A", "30", "40"]);
    expect(n.find((e) => e.occurrenceId === newOcc)!.exportNumber).toBe("20A");
  });
});

describe("Samme scene brukt to ganger", () => {
  it("sammenligning og historiske numre skiller forekomstene", () => {
    const { s, mainId, cmd } = project();
    const a = cmd.scenes[0]!;
    const second = tid<"scene_occurrence">();
    const x = mustApply(s, {
      type: "AddOccurrence",
      productionId: mainId,
      occurrenceId: second,
      sceneId: a.sceneId,
      variantId: a.variantId,
      orderKey: keyBetween(orderedOccurrences(s, mainId).at(-1)!.orderKey, null),
    });
    const changes = diffSnapshots(snapshotFromState(s, mainId), snapshotFromState(x, mainId));
    expect(changes.map((c) => [c.type, c.occurrenceId])).toEqual([["added", second]]);
    const n = exportNumbering(x, mainId, {
      method: "historical",
      includeInactive: false,
      historical: new Map([
        [a.occurrenceId as string, "1"],
        [second as string, "1"],
      ]),
    });
    const nums = n.map((e) => e.exportNumber).filter((x) => x !== null);
    expect(new Set(nums).size).toBe(nums.length);
    expect(n.find((e) => e.occurrenceId === a.occurrenceId)!.exportNumber).toBe("1");
    expect(n.find((e) => e.occurrenceId === second)!.exportNumber).not.toBe("1");
  });
});
