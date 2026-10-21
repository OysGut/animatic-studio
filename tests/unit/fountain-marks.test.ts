// @vitest-environment node
/**
 * Fountain-markering manusmodellen ikke har egne felt for (DEC-0073, KI-164): dobbel dialog (^), sentrert tekst
 * (> <), sangtekst (~) og notater ([[ ]]) på riktig blokk og tegn. Rundtur Fountain → From Pen to Glass → Fountain.
 * Ingen ekte manus (DEC-0004).
 */
import { describe, expect, it } from "vitest";
import {
  exportNotes,
  exportPaginationInput,
  fountainMarksOf,
  orderedOccurrences,
  parseFountain,
  planImport,
  planImportNotes,
  screenplayFountain,
  toRow,
  type ProductionId,
  type ProjectState,
} from "@/core";
import { mustApply, seedProject, tid } from "../helpers/fixtures";

const els = (src: string) => parseFountain(src).parsed.scenes.flatMap((s) => s.elements);

/** Importerer Fountain-teksten (med notater) i et tomt prosjekt slik appen gjør det. */
function importFountain(src: string): { s: ProjectState; mainId: string } {
  const { parsed, notes } = parseFountain(src);
  const fresh = seedProject(0);
  const cmd = planImport(fresh.state, parsed, {
    productionId: fresh.mainId as ProductionId,
    newId: tid,
  });
  let s = mustApply(fresh.state, cmd);
  const annotations = planImportNotes(parsed, cmd, notes, {
    fallbackAuthor: "Importør",
    newId: tid,
  });
  if (annotations.length) s = mustApply(s, { type: "AddAnnotations", annotations, imported: true });
  return { s, mainId: fresh.mainId };
}

function exportFountain(s: ProjectState, mainId: string, withNotes = true): string {
  const input = exportPaginationInput(s, mainId, {
    method: "production",
    includeInactive: false,
    fillMissing: "none",
  });
  const notes = withNotes
    ? exportNotes(
        s,
        input.map((x) => x.occurrenceId),
      )
    : undefined;
  return screenplayFountain(input, notes ? { notes } : {});
}

const roundTrip = (src: string) => {
  const { s, mainId } = importFountain(src);
  return exportFountain(s, mainId);
};

/** Første blokk med teksten (eller som begynner med den). */
function blockWith(s: ProjectState, text: string) {
  return Object.values(s.blocks).find((b) => b.text === text || b.text.startsWith(text))!;
}

describe("Fountain-markering – import", () => {
  it("dobbel dialog: andre taler får markering; usikker bare uten replikk rett foran", () => {
    const e = els(
      [
        "INT. HUS - DAG",
        "",
        "MAJA",
        "Ja!",
        "",
        "PER ^",
        "Nei!",
        "",
        "Stille.",
        "",
        "@Bestemor ^",
        "Hysj.",
      ].join("\n"),
    );
    expect(e.map((x) => `${x.kind}:${x.text}`)).toEqual([
      "character:MAJA",
      "dialogue:Ja!",
      "character:PER",
      "dialogue:Nei!",
      "action:Stille.",
      "character:Bestemor",
      "dialogue:Hysj.",
    ]);
    expect(e[2]!.source.fountain).toEqual({ dual: true });
    expect(e[2]!.uncertain).toBeUndefined();
    // Ingen replikk rett foran: uklart hvem som snakker samtidig
    expect(e[5]!.source.fountain).toEqual({ dual: true });
    expect(e[5]!.uncertain).toMatch(/Dobbel dialog/);
    // Navnet er rent (karakterlister og PDF ser ikke «^»)
    expect(e.some((x) => x.text.includes("^"))).toBe(false);
  });

  it("sentrert tekst: handling med ren tekst og sentrerte linjer markert", () => {
    const e = els(
      ["INT. HUS - DAG", "", "> KAPITTEL ÉN <", "> Vinteren 1952 <", "Det snør."].join("\n"),
    );
    expect(e.map((x) => `${x.kind}:${x.text}`)).toEqual([
      "action:KAPITTEL ÉN\nVinteren 1952\nDet snør.",
    ]);
    expect(e[0]!.source.fountain).toMatchObject({ centered: [0, 1] });
    expect(e[0]!.uncertain).toBeUndefined();
  });

  it("sangtekst: ~ i handling og replikk blir ren tekst med linjene markert", () => {
    const e = els(
      [
        "INT. HUS - DAG",
        "",
        "~Det snør, det snør",
        "~tiddelibom",
        "",
        "MAJA",
        "(synger)",
        "~Jeg er en liten nisse",
        "Sa hun.",
      ].join("\n"),
    );
    expect(e.map((x) => `${x.kind}:${x.text}`)).toEqual([
      "action:Det snør, det snør\ntiddelibom",
      "character:MAJA",
      "parenthetical:(synger)",
      "dialogue:Jeg er en liten nisse\nSa hun.",
    ]);
    expect(e[0]!.source.fountain).toMatchObject({ lyrics: [0, 1] });
    expect(e[3]!.source.fountain).toMatchObject({ lyrics: [0] });
  });

  it("! opphever sentrering og sangtekst for linjen", () => {
    const e = els(["INT. HUS - DAG", "", "!> ikke sentrert <", "!~ikke sang"].join("\n"));
    expect(e.map((x) => x.text)).toEqual(["> ikke sentrert <\n~ikke sang"]);
    expect(e[0]!.source.fountain).toBeUndefined();
  });

  it("notater festes til riktig blokk og linje, også når teksten står flere ganger", () => {
    const { parsed, notes } = parseFountain(
      [
        "INT. HUS - DAG",
        "",
        "Vasen står der.",
        "Vasen står der.[[Den andre]]",
        "",
        "MAJA[[Om navnet]]",
        "Hei.",
        "Hei igjen.[[Om replikken]]",
        "",
        "> SLUTT[[Sentrert]] <",
      ].join("\n"),
    );
    const fresh = seedProject(0);
    const cmd = planImport(fresh.state, parsed, {
      productionId: fresh.mainId as ProductionId,
      newId: tid,
    });
    const ann = planImportNotes(parsed, cmd, notes, { fallbackAuthor: "Importør", newId: tid });
    const blocks = cmd.scenes[0]!.blocks;
    const at = (text: string) => {
      const a = ann.find((x) => x.text === text)!;
      const b = blocks.find((x) => x.blockId === a.blockId)!;
      return { kind: b.kind, start: a.start, end: a.end, quote: a.quote, blockText: b.text };
    };
    // Andre linje (ikke første forekomst av samme tekst): notatet slutter der merket stod
    const second = at("Den andre");
    expect(second.kind).toBe("action");
    expect(second.end).toBe(second.blockText.length);
    expect(at("Om navnet")).toMatchObject({ kind: "character", start: 0, end: 4 });
    const line2 = at("Om replikken");
    expect(line2.kind).toBe("dialogue");
    expect(line2.blockText.slice(line2.start, line2.end)).toBe("Hei igjen.");
    expect(at("Sentrert")).toMatchObject({ kind: "action", start: 0, end: 5 });
  });
});

describe("Fountain-markering – rundtur Fountain → From Pen to Glass → Fountain", () => {
  it("dobbel dialog", () => {
    const src = ["INT. HUS - DAG #1#", "", "MAJA", "Ja!", "", "PER ^", "Nei!", ""].join("\n");
    expect(roundTrip(src)).toBe(src);
  });

  it("dobbel dialog med tvunget navn og parentes", () => {
    const src = [
      "INT. HUS - DAG #1#",
      "",
      "@Maja",
      "Ja!",
      "",
      "@Bestemor Anne ^",
      "(hvisker)",
      "Nei!",
      "",
    ].join("\n");
    expect(roundTrip(src)).toBe(src);
  });

  it("sentrert tekst", () => {
    const src = [
      "INT. HUS - DAG #1#",
      "",
      "> KAPITTEL ÉN <",
      "> Vinteren 1952 <",
      "Det snør.",
      "",
      "> SLUTT <",
      "",
    ].join("\n");
    expect(roundTrip(src)).toBe(src);
  });

  it("sangtekst i handling og replikk", () => {
    const src = [
      "INT. HUS - DAG #1#",
      "",
      "~Det snør, det snør",
      "~tiddelibom",
      "",
      "MAJA",
      "(synger)",
      "~Jeg er en liten nisse",
      "Sa hun.",
      "",
    ].join("\n");
    expect(roundTrip(src)).toBe(src);
  });

  it("notater på riktig blokk og tegn", () => {
    const src = [
      "INT. HUS - DAG #1#",
      "",
      "[[Mars (2026-10-01): Nål på scenen]]",
      "",
      "Vasen står der.",
      "Vasen står der.[[Anita Killi (2026-10-02): Den andre vasen]]",
      "",
      "MAJA",
      "Hei.[[Mars (2026-10-03): Første linje]] Hei igjen.",
      "~Det snør[[Mars (2026-10-04): Sangen]]",
      "",
      "> SLUTT[[Mars (2026-10-05): Sentrert]] <",
      "",
    ].join("\n");
    expect(roundTrip(src)).toBe(src);
    // Og en rundtur til gir det samme
    expect(roundTrip(roundTrip(src))).toBe(src);
  });

  it("alt sammen, med flere scener", () => {
    const src = [
      "INT. HUS - DAG #1#",
      "",
      "> KAPITTEL ÉN <",
      "",
      "MAJA",
      "Ja![[Mars (2026-10-01): Høyt]]",
      "",
      "PER ^",
      "~Nei, nei, nei",
      "",
      "EXT. GÅRDEN - KVELD #2#",
      "",
      "~Det snør",
      "Maja går ut.",
      "",
      "> SLUTT <",
      "",
    ].join("\n");
    expect(roundTrip(src)).toBe(src);
  });
});

describe("Fountain-markering – lagring og redigering", () => {
  it("markeringen ligger i sourceRef og overlever databaseraden (jsonb)", () => {
    const { s } = importFountain(
      ["INT. HUS - DAG", "", "MAJA", "Ja!", "", "PER ^", "Nei!", "", "> SLUTT <"].join("\n"),
    );
    const per = blockWith(s, "PER");
    const slutt = blockWith(s, "SLUTT");
    expect(per.text).toBe("PER");
    expect(slutt.text).toBe("SLUTT");
    for (const b of [per, slutt]) {
      const row = toRow("blocks", b, s.project.id);
      const back = JSON.parse(JSON.stringify(row["source_ref"])) as {
        page: number;
        y: number;
      };
      expect(fountainMarksOf(back)).toEqual(fountainMarksOf(b.sourceRef));
    }
    expect(fountainMarksOf(per.sourceRef)).toEqual({ fountain: { dual: true } });
    expect(fountainMarksOf(slutt.sourceRef)).toEqual({ fountain: { centered: [0] } });
  });

  it("fountainMarksOf godtar bare gyldig form", () => {
    expect(fountainMarksOf(null)).toEqual({});
    expect(fountainMarksOf({ page: 1, y: 0 })).toEqual({});
    const bad = { page: 1, y: 0, fountain: { dual: "ja", centered: [-1, 1.5, "x", 2] } };
    expect(fountainMarksOf(bad as never)).toEqual({ fountain: { centered: [2] } });
  });

  it("redigert tekst og endret blokktype: markering brukes bare der den fortsatt passer", () => {
    const { s: base, mainId } = importFountain(
      ["INT. HUS - DAG #1#", "", "> SLUTT <", "> Rulletekst <"].join("\n"),
    );
    const b = blockWith(base, "SLUTT");
    // Teksten er endret etter importen: linjemerkene kunne truffet feil linje og brukes ikke (DEC-0073)
    let s = mustApply(base, {
      type: "EditBlockText",
      productionId: mainId as ProductionId,
      blockId: b.id,
      text: "THE END",
    });
    expect(exportFountain(s, mainId)).toBe("INT. HUS - DAG #1#\n\nTHE END\n");
    // Som overgang er den ikke lenger sentrert handling
    s = mustApply(s, {
      type: "SetBlockKind",
      productionId: mainId as ProductionId,
      blockId: b.id,
      kind: "transition",
    });
    expect(exportFountain(s, mainId)).toBe("INT. HUS - DAG #1#\n\n>THE END\n");
  });

  it("tekst som ser ut som markering, men ikke er det, tvinges med ! ved eksport", () => {
    const fresh = seedProject(0);
    const occ = {
      sceneId: tid(),
      variantId: tid(),
      occurrenceId: tid(),
    };
    const s = mustApply(fresh.state, {
      type: "CreateScene",
      productionId: fresh.mainId as never,
      ...occ,
      orderKey: "m",
      heading: { intExt: "INT.", location: "HUS", time: "DAG" },
      blocks: [
        {
          blockId: tid(),
          kind: "action",
          text: "Vanlig linje.\n> ikke sentrert <\n~ikke sang",
          orderKey: "a",
        },
      ],
      productionNumber: "1",
    } as never);
    expect(orderedOccurrences(s, fresh.mainId)).toHaveLength(1);
    const text = exportFountain(s, fresh.mainId, false);
    expect(text).toContain("\nVanlig linje.\n!> ikke sentrert <\n!~ikke sang\n");
    const e = els(text);
    expect(e.map((x) => x.text)).toEqual(["Vanlig linje.\n> ikke sentrert <\n~ikke sang"]);
    expect(e[0]!.source.fountain).toBeUndefined();
  });
});
