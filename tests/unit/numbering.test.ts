// @vitest-environment node
/** Eksportnummerering (mandat 5.2, REQ-0080–REQ-0086). */
import { describe, expect, it } from "vitest";
import {
  exportNumbering,
  exportPaginationInput,
  keyBetween,
  nextInsertNumber,
  orderedOccurrences,
  type ProductionId,
} from "@/core";
import { mustApply, seedProject, tid } from "../helpers/fixtures";

describe("nextInsertNumber", () => {
  it("lager mellomnumre som ikke kolliderer", () => {
    expect(nextInsertNumber("42", new Set(["42", "43"]))).toBe("42A");
    expect(nextInsertNumber("42A", new Set(["42", "42A"]))).toBe("42B");
    expect(nextInsertNumber("42", new Set(["42", "42A"]))).toBe("42B");
    expect(nextInsertNumber("9Z", new Set())).toBe("9ZA");
    expect(nextInsertNumber(null, new Set())).toBe("A1");
  });
});

describe("exportNumbering", () => {
  it("fortløpende: aktive scener får 1..N (REQ-0081)", () => {
    const { state, mainId } = seedProject();
    const n = exportNumbering(state, mainId, { method: "continuous", includeInactive: false });
    expect(n.map((x) => x.exportNumber)).toEqual(n.map((_, i) => String(i + 1)));
  });

  it("bevar produksjonsnummerering: nye scener mellom 42 og 43 blir 42A og 42B (REQ-0082)", () => {
    const { state, mainId } = seedProject();
    const occ = orderedOccurrences(state, mainId);
    // Fixturen har nummermønster 1, –, 2, 3, 5 …; legg to nye scener etter «3»
    const i3 = occ.findIndex((o) => o.productionNumber === "3");
    let s = state;
    let after = occ[i3]!.orderKey;
    for (let k = 0; k < 2; k++) {
      const key = keyBetween(after, occ[i3 + 1]!.orderKey);
      s = mustApply(s, {
        type: "CreateScene",
        productionId: mainId as ProductionId,
        sceneId: tid(),
        variantId: tid(),
        occurrenceId: tid(),
        orderKey: key,
        heading: { intExt: "INT.", location: "NY", time: "DAG" },
        blocks: [],
      });
      after = key;
    }
    const n = exportNumbering(s, mainId, { method: "production", includeInactive: false });
    const nums = n.map((x) => x.exportNumber);
    expect(nums.slice(i3, i3 + 3)).toEqual(["3", "3A", "3B"]);
    // Den unummererte scenen i fixturen (etter 1) er laget i appen (ingen kildereferanse) og får 1A
    expect(nums[1]).toBe("1A");
    // Uten utfylling beholdes manglende nummer
    expect(
      exportNumbering(s, mainId, {
        method: "production",
        includeInactive: false,
        fillMissing: "none",
      })[1]!.exportNumber,
    ).toBeNull();
  });

  it("deaktiverte scener utelates, eller tas med som UTGÅR / merket (REQ-0084, Q-08)", () => {
    const { state, mainId } = seedProject();
    const target = orderedOccurrences(state, mainId)[3]!;
    const s = mustApply(state, {
      type: "SetOccurrenceActive",
      occurrenceId: target.id,
      active: false,
    });
    expect(
      exportNumbering(s, mainId, { method: "production", includeInactive: false }).some(
        (x) => x.occurrenceId === target.id,
      ),
    ).toBe(false);
    const withOmitted = exportPaginationInput(s, mainId, {
      method: "production",
      includeInactive: true,
    });
    const om = withOmitted.find((x) => x.occurrenceId === target.id)!;
    expect(om).toMatchObject({ headingText: "UTGÅR", blocks: [], number: target.productionNumber });
    const cont = exportPaginationInput(s, mainId, { method: "continuous", includeInactive: true });
    const marked = cont.find((x) => x.occurrenceId === target.id)!;
    expect(marked.number).toBeNull();
    expect(marked.blocks[0]!.kind).toBe("note");
  });

  it("eksport endrer ikke prosjektet (REQ-0085)", () => {
    const { state, mainId } = seedProject();
    const snapshot = JSON.stringify(state);
    exportPaginationInput(state, mainId, {
      method: "continuous",
      includeInactive: true,
      lockedPages: true,
    });
    exportPaginationInput(state, mainId, { method: "production", includeInactive: true });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe("Unummererte scener fra originalen", () => {
  it("beholdes uten nummer som standard, men kan få mellomnummer", async () => {
    const { parseScreenplayLines, planImport } = await import("@/core");
    const { state, mainId } = seedProject(0);
    const L = (row: number, x: number, text: string) => ({ page: 1, x, y: 72 + row * 12, text });
    const parsed = parseScreenplayLines(
      [
        L(0, 54, "1 INT. A - DAG 1"),
        L(2, 108, "Tekst."),
        L(4, 108, "INT. B - DAG"),
        L(6, 108, "Mer."),
      ],
      { format: "pdf" },
    );
    const s = mustApply(state, planImport(state, parsed, { productionId: mainId as ProductionId }));
    expect(
      exportNumbering(s, mainId, { method: "production", includeInactive: false }).map(
        (x) => x.exportNumber,
      ),
    ).toEqual(["1", null]);
    expect(
      exportNumbering(s, mainId, {
        method: "production",
        includeInactive: false,
        fillMissing: "all",
      }).map((x) => x.exportNumber),
    ).toEqual(["1", "1A"]);
  });
});
