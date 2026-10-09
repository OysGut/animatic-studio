// @vitest-environment node
/** Syntetiske tester for manusparseren (ingen manustekst fra referansen – DEC-0004). */
import { describe, expect, it } from "vitest";
import {
  collapseDoubledGlyphs,
  parseHeading,
  parseScreenplayLines,
  type RawLine,
} from "@/core/screenplay";

const A = 108; // handling
const L = (page: number, row: number, x: number, text: string): RawLine => ({
  page,
  x,
  y: 72 + row * 12,
  text,
});

describe("Manusparser", () => {
  it("leser nummererte og unummererte overskrifter, karakterer, replikker og parenteser", () => {
    const lines = [
      L(1, 0, 54, "7 INT. KJØKKEN - KVELD 7"),
      L(1, 2, A, "Det er mørkt. Noen"),
      L(1, 3, A, "lister seg inn."),
      L(1, 5, 252, "OLE"),
      L(1, 6, 209, "(hvisker)"),
      L(1, 7, 180, "Er det noen her?"),
      L(1, 9, A, "EXT. GÅRDSPLASS - NATT"),
      L(1, 11, A, "Snøen laver ned."),
    ];
    const p = parseScreenplayLines(lines, { format: "pdf" });
    expect(p.scenes.map((s) => s.number)).toEqual(["7", null]);
    expect(p.scenes[0]!.heading).toEqual({ intExt: "INT.", location: "KJØKKEN", time: "KVELD" });
    expect(p.scenes[0]!.elements.map((e) => [e.kind, e.text])).toEqual([
      ["action", "Det er mørkt. Noen\nlister seg inn."], // kort linje = manuelt linjeskift
      ["character", "OLE"],
      ["parenthetical", "(hvisker)"],
      ["dialogue", "Er det noen her?"],
    ]);
    expect(p.stats).toMatchObject({ numbered: 1, unnumbered: 1 });
  });

  it("skiller automatisk ordbryting fra manuelle linjeskift og bevarer ekstra tomme linjer", () => {
    const long = "Dette er en lang handlingslinje som fyller nesten hele bredden"; // 61 tegn
    const p = parseScreenplayLines(
      [
        L(1, 0, 54, "1 INT. STUE - DAG 1"),
        L(1, 2, A, long),
        L(1, 3, A, "fortsettelse."),
        L(1, 6, A, "Etter én ekstra tom linje."),
        L(1, 8, 252, "OLE"),
        L(1, 9, 180, "Hei!"),
        L(1, 10, 180, "Hvordan går det?"),
      ],
      { format: "pdf" },
    );
    expect(p.scenes[0]!.elements.map((e) => e.text)).toEqual([
      `${long} fortsettelse.`,
      "\nEtter én ekstra tom linje.",
      "OLE",
      "Hei!\nHvordan går det?",
    ]);
  });

  it("håndterer delmanus som starter midt i en scene (mandat 4.1) uten å finne opp en ny scene", () => {
    const p = parseScreenplayLines(
      [
        L(1, 0, A, "…og så går hun ut."),
        L(1, 2, 54, "31 EXT. VED MELKERAMPA - KVELD 31"),
        L(1, 4, A, "Kaldt."),
      ],
      { format: "pdf" },
    );
    expect(p.scenes).toHaveLength(2);
    expect(p.scenes[0]!.isContinuation).toBe(true);
    expect(p.scenes[0]!.number).toBeNull();
    expect(p.scenes[1]!.number).toBe("31");
    expect(p.stats.unnumbered).toBe(0); // fortsettelsen telles ikke som scene uten nummer
  });

  it("beholder uregelmessige numre (42A, hull, like numre) og varsler om duplikater", () => {
    const p = parseScreenplayLines(
      [
        L(1, 0, 54, "42 INT. A - DAG 42"),
        L(1, 2, 54, "42A INT. B - DAG 42A"),
        L(1, 4, 54, "45 INT. C - DAG 45"),
        L(1, 6, 54, "45 INT. D - DAG 45"),
      ],
      { format: "pdf" },
    );
    expect(p.scenes.map((s) => s.number)).toEqual(["42", "42A", "45", "45"]);
    expect(p.stats.duplicateNumbers).toEqual(["45"]);
  });

  it("slår sammen replikk over sideskift med (MORE)/(CONT'D) og fjerner sidetall", () => {
    const p = parseScreenplayLines(
      [
        L(1, 0, 54, "1 INT. STUE - DAG 1"),
        L(1, 2, 252, "MAJA"),
        L(1, 3, 180, "Første del av"),
        L(1, 4, 252, "((MMOORREE))"),
        { page: 2, x: 508, y: 36, text: "22.." },
        L(2, 0, 252, "MAJA (CONT'D)"),
        L(2, 1, 180, "replikken."),
        L(2, 3, 252, "MAJA (CONT'D)"),
        L(2, 4, 180, "Ny replikk."),
      ],
      { format: "pdf" },
    );
    const els = p.scenes[0]!.elements.map((e) => [e.kind, e.text]);
    expect(els).toEqual([
      ["character", "MAJA"],
      ["dialogue", "Første del av replikken."],
      ["character", "MAJA"],
      ["dialogue", "Ny replikk."],
    ]);
  });

  it("kollapser doble tegn fra fet skrift i PDF", () => {
    expect(collapseDoubledGlyphs("((MMOORREE))")).toBe("(MORE)");
    expect(collapseDoubledGlyphs("1100..")).toBe("10.");
    expect(collapseDoubledGlyphs("Maja")).toBe("Maja");
  });

  it("tolker sceneoverskrifter med INT./EXT.", () => {
    expect(parseHeading("INT./EXT. BIL - NATT")).toEqual({
      intExt: "INT./EXT.",
      location: "BIL",
      time: "NATT",
    });
    expect(parseHeading("EXT. “VISNING” AV HUSET TIL ROLF - DAG")).toEqual({
      intExt: "EXT.",
      location: "“VISNING” AV HUSET TIL ROLF",
      time: "DAG",
    });
  });

  it("merker linjer utenfor kjente kolonner som usikre (mandat 4.3 punkt 9)", () => {
    const p = parseScreenplayLines(
      [
        L(1, 0, 54, "1 INT. A - DAG 1"),
        L(1, 2, A, "Handling."),
        L(1, 3, A, "Mer."),
        L(1, 5, 60, "rar linje"),
      ],
      { format: "pdf" },
    );
    expect(p.scenes[0]!.elements.some((e) => e.uncertain)).toBe(true);
  });
});
