// @vitest-environment node
/** Fountain-import og -eksport (REQ-0089, https://fountain.io/syntax). Ingen ekte manus (DEC-0004). */
import { describe, expect, it } from "vitest";
import {
  exportNotes,
  exportPaginationInput,
  formatHeading,
  keysEvenly,
  orderedOccurrences,
  parseFountain,
  planImport,
  planImportNotes,
  screenplayFountain,
  type BlockKind,
  type ParsedScreenplay,
  type ProductionId,
  type ProjectState,
} from "@/core";
import { decodeFountain, formatOf } from "@/engine/import/browser";
import { fixture } from "../visual/fixture-state";
import { mustApply, seedProject, tid } from "../helpers/fixtures";

const kinds = (p: ParsedScreenplay) =>
  p.scenes.flatMap((s) => s.elements.map((e) => `${e.kind}:${e.text}`));
const els = (src: string) => parseFountain(src).parsed.scenes.flatMap((s) => s.elements);

function mainOf(s: ProjectState): string {
  return Object.values(s.productions).find((p) => p.kind === "main")!.id;
}

/** Fixturen pluss en scene med elementer som krever tvang og spesialtilfeller i Fountain. */
function richState() {
  let s = fixture.state;
  const mainId = mainOf(s);
  const occs = orderedOccurrences(s, mainId);
  const last = occs[occs.length - 1]!.orderKey;
  const add = (
    heading: { intExt: string; location: string; time: string },
    blocks: [BlockKind, string][],
    productionNumber: string | null,
    key: string,
  ) => {
    const bk = keysEvenly(blocks.length);
    s = mustApply(s, {
      type: "CreateScene",
      productionId: mainId as never,
      sceneId: tid(),
      variantId: tid(),
      occurrenceId: tid(),
      orderKey: last + key,
      heading,
      blocks: blocks.map(([kind, text], i) => ({ blockId: tid(), kind, text, orderKey: bk[i]! })),
      productionNumber,
    });
  };
  add(
    { intExt: "INT./EXT.", location: "BILEN", time: "NATT" },
    [
      ["action", "BANG!\nAlle snur seg."],
      ["character", "MAJA (V.O.)"],
      ["dialogue", "Hvem er det?\n\nSvar meg!"],
      ["character", "Bestemor Anne"],
      ["parenthetical", "(ser opp,\nsmiler)"],
      ["dialogue", "Det er bare nissen, vennen."],
      ["character", "FAR (CONT'D)"],
      ["dialogue", "Legg deg nå."],
      ["transition", "KLIPP TIL:"],
    ],
    "14A",
    "1",
  );
  add(
    { intExt: "INNE.", location: "FJØSET", time: "MORGEN" },
    [
      ["action", "INT. ER IKKE EN OVERSKRIFT HER"],
      ["action", "!Utropstegn først, *stjerne* og _strek_."],
      ["action", "\nEkstra tom linje før, æøå ÆØÅ."],
      ["action", "CUT TO:"],
      ["transition", "CUT TO:"],
    ],
    null,
    "2",
  );
  add(
    { intExt: "EST.", location: "gården", time: "dag" },
    [
      ["action", "Snø."],
      ["transition", "Toning til svart"],
    ],
    "15",
    "3",
  );
  return { s, mainId };
}

describe("Fountain – eksport og ny import (rundtur)", () => {
  it("gir samme scener, numre, elementtyper og tekst", () => {
    const { s, mainId } = richState();
    const input = exportPaginationInput(s, mainId, {
      method: "production",
      includeInactive: false,
      fillMissing: "none",
    });
    const text = screenplayFountain(input, { titlePage: ["Jula på Dovre", "av Testforfatter"] });
    const { parsed } = parseFountain(text);
    expect(parsed.format).toBe("fountain");
    expect(parsed.titlePage).toEqual(["Jula på Dovre", "av", "Testforfatter"]);
    expect(parsed.scenes.map((x) => x.number)).toEqual(input.map((x) => x.number));
    expect(parsed.scenes.map((x) => formatHeading(x.heading))).toEqual(
      input.map((x) => x.headingText),
    );
    expect(kinds(parsed)).toEqual(input.flatMap((x) => x.blocks.map((b) => `${b.kind}:${b.text}`)));
    expect(parsed.scenes.some((x) => x.isContinuation)).toBe(false);
  });

  it("bruker tvungne elementer bare der det trengs", () => {
    const { s, mainId } = richState();
    const text = screenplayFountain(
      exportPaginationInput(s, mainId, {
        method: "production",
        includeInactive: false,
        fillMissing: "none",
      }),
    );
    expect(text).toContain("\nINT./EXT. BILEN - NATT #14A#\n");
    expect(text).toContain("\n.INNE. FJØSET - MORGEN\n");
    expect(text).toContain("\nEST. gården - dag #15#\n");
    expect(text).toContain("\n!INT. ER IKKE EN OVERSKRIFT HER\n");
    expect(text).toContain("\n!!Utropstegn først, \\*stjerne\\* og \\_strek\\_.\n");
    expect(text).toContain("\n!\nEkstra tom linje før");
    expect(text).toContain("\n!BANG!\nAlle snur seg.\n");
    expect(text).toContain("\nMAJA (V.O.)\nHvem er det?\n  \nSvar meg!\n");
    expect(text).toContain("\n@Bestemor Anne\n(ser opp,\nsmiler)\n");
    expect(text).toContain("\n>KLIPP TIL:\n");
    expect(text).toContain("\n!CUT TO:\n\nCUT TO:\n");
    expect(text).toContain("\n>Toning til svart\n");
  });

  it("skriver aldri tekniske ID-er (REQ-0104)", () => {
    const { s, mainId } = richState();
    const input = exportPaginationInput(s, mainId, { method: "continuous", includeInactive: true });
    const text = screenplayFountain(input, { titlePage: ["Tittel"] });
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    for (const x of input) {
      expect(text).not.toContain(x.occurrenceId);
      for (const b of x.blocks) expect(text).not.toContain(b.id);
    }
  });

  it("følger nummereringsvalget og tar med deaktiverte scener bare når valgt", () => {
    const { s, mainId } = richState();
    const cont = screenplayFountain(
      exportPaginationInput(s, mainId, { method: "continuous", includeInactive: false }),
    );
    expect(cont).toContain("#1#");
    expect(cont).not.toContain("#14A#");
    expect(cont).not.toContain("DEAKTIVERT");
    const prod = screenplayFountain(
      exportPaginationInput(s, mainId, { method: "production", includeInactive: true }),
    );
    expect(prod).toContain("\n.UTGÅR #10#\n");
  });

  it("notater blir [[…]] bare når de tas med, og gjenopprettes med navn og dato", () => {
    const { s: base, mainId } = richState();
    const occ = orderedOccurrences(base, mainId)[0]!;
    const block = Object.values(base.blocks).find(
      (b) => b.variantId === occ.variantId && b.kind === "dialogue",
    )!;
    const s = mustApply(base, {
      type: "AddAnnotations",
      annotations: [
        {
          annotationId: tid(),
          blockId: block.id,
          variantId: null,
          start: 0,
          end: 10,
          quote: block.text.slice(0, 10),
          text: "Hvisk dette – æøå",
          authorName: "Anita Killi",
          stampAt: "2026-10-09T12:34:00.000Z",
        },
        {
          annotationId: tid(),
          blockId: null,
          variantId: occ.variantId,
          start: 0,
          end: 0,
          quote: "",
          text: "Nål på scenen",
          authorName: "Mars",
          stampAt: "2026-10-01T08:00:00.000Z",
        },
      ],
    });
    const input = exportPaginationInput(s, mainId, {
      method: "production",
      includeInactive: false,
    });
    expect(screenplayFountain(input)).not.toContain("[[");
    const notes = exportNotes(
      s,
      input.map((x) => x.occurrenceId),
    );
    const text = screenplayFountain(input, { notes });
    expect(text).toContain("[[Anita Killi (2026-10-09): Hvisk dette – æøå]]");
    expect(text).toContain("[[Mars (2026-10-01): Nål på scenen]]");

    const imp = parseFountain(text);
    // Notatene endrer ikke manusteksten
    expect(kinds(imp.parsed)).toEqual(
      input.flatMap((x) => x.blocks.map((b) => `${b.kind}:${b.text}`)),
    );
    const fresh = seedProject(0);
    const cmd = planImport(fresh.state, imp.parsed, {
      productionId: fresh.mainId as ProductionId,
      newId: tid,
    });
    const ann = planImportNotes(imp.parsed, cmd, imp.notes, {
      fallbackAuthor: "Importør",
      newId: tid,
    });
    // Fixturen har egne notater fra før; se på de to som ble lagt til her
    expect(ann.length).toBe(Object.values(s.annotations).filter((a) => !a.removed).length);
    const onBlock = ann.find((a) => a.text === "Hvisk dette – æøå")!;
    expect(onBlock.text).toBe("Hvisk dette – æøå");
    expect(onBlock.authorName).toBe("Anita Killi");
    expect(onBlock.stampAt?.slice(0, 10)).toBe("2026-10-09");
    expect(cmd.scenes[0]!.blocks.find((b) => b.blockId === onBlock.blockId)!.text).toBe(block.text);
    const pin = ann.find((a) => a.text === "Nål på scenen")!;
    expect(pin.variantId).toBe(cmd.scenes[0]!.variantId);
    expect(pin.authorName).toBe("Mars");
  });

  it("importen går gjennom samme planImport som PDF/DOCX", () => {
    const { s, mainId } = richState();
    const input = exportPaginationInput(s, mainId, {
      method: "production",
      includeInactive: false,
    });
    const { parsed } = parseFountain(screenplayFountain(input));
    const fresh = seedProject(0);
    const cmd = planImport(fresh.state, parsed, {
      productionId: fresh.mainId as ProductionId,
      newId: tid,
    });
    const st = mustApply(fresh.state, cmd);
    expect(orderedOccurrences(st, fresh.mainId).map((o) => o.productionNumber)).toEqual(
      input.map((x) => x.number),
    );
  });
});

describe("Fountain – import etter spesifikasjonen", () => {
  it("tittelside, sceneoverskrifter og scenenumre", () => {
    const { parsed } = parseFountain(
      [
        "Title: **BRØDET**",
        "Credit: Skrevet av",
        "Author: Kari Nordmann",
        "Contact:",
        "    Gata 1",
        "    0001 Oslo",
        "",
        "INT. HUS - DAG #1#",
        "",
        "Hei.",
        "",
        "EXT. HAGEN - KVELD #12A#",
        "",
        "INT./EXT. BIL - NATT",
        "",
        "I/E BÅT - DAG",
        "",
        "EST. BYEN - MORGEN #I-1-A#",
        "",
        "int. kjøkken - dag",
        "",
        ".snøen på veien - natt",
        "",
        "...og så videre.",
      ].join("\n"),
    );
    expect(parsed.titlePage).toEqual([
      "BRØDET",
      "Skrevet av",
      "Kari Nordmann",
      "Gata 1",
      "0001 Oslo",
    ]);
    expect(
      parsed.scenes.map((s) => [s.number, s.heading.intExt, s.heading.location, s.heading.time]),
    ).toEqual([
      ["1", "INT.", "HUS", "DAG"],
      ["12A", "EXT.", "HAGEN", "KVELD"],
      [null, "INT./EXT.", "BIL", "NATT"],
      [null, "I/E", "BÅT", "DAG"],
      ["I-1-A", "EST.", "BYEN", "MORGEN"],
      [null, "INT.", "kjøkken", "dag"],
      [null, "", "snøen på veien", "natt"],
    ]);
    expect(parsed.scenes[6]!.elements.map((e) => `${e.kind}:${e.text}`)).toEqual([
      "action:...og så videre.",
    ]);
    expect(parsed.stats).toMatchObject({ numbered: 3, unnumbered: 4 });
  });

  it("karakterer, extensions, parenteser og dialog", () => {
    expect(
      els(
        [
          "INT. STUA - DAG",
          "",
          "MAJA (V.O.)",
          "(hvisker)",
          "Hører du det?",
          "Det er noen der.",
          "",
          "BESTEMOR ANNE (cont'd)",
          "Bare vinden.",
          "(ser bort,",
          "smiler)",
          "Sov nå.",
          "",
          "@McCLANE",
          "Yippee.",
          "",
          "R2D2",
          "Bip.",
          "",
          "23",
          "Ikke en karakter.",
        ].join("\n"),
      ).map((e) => `${e.kind}:${e.text}`),
    ).toEqual([
      "character:MAJA (V.O.)",
      "parenthetical:(hvisker)",
      "dialogue:Hører du det?\nDet er noen der.",
      "character:BESTEMOR ANNE (cont'd)",
      "dialogue:Bare vinden.",
      "parenthetical:(ser bort,\nsmiler)",
      "dialogue:Sov nå.",
      "character:McCLANE",
      "dialogue:Yippee.",
      "character:R2D2",
      "dialogue:Bip.",
      "action:23\nIkke en karakter.",
    ]);
  });

  it("tvungne elementer: ! @ . > og sentrert tekst", () => {
    expect(
      els(
        [
          ".stua hos maja",
          "",
          "!SCENEN ER MØRK",
          "Ingen sier noe.",
          "",
          "@maja",
          "Hei?",
          "",
          ">Toning til svart",
          "",
          "CUT TO:",
          "",
          "> SLUTT <",
          "",
          "KLIPP TIL:",
          "",
        ].join("\n"),
      ).map((e) => `${e.kind}:${e.text}`),
    ).toEqual([
      "action:SCENEN ER MØRK\nIngen sier noe.",
      "character:maja",
      "dialogue:Hei?",
      "transition:Toning til svart",
      "transition:CUT TO:",
      "action:SLUTT",
      // «KLIPP TIL:» slutter ikke på «TO:» og må tvinges med «>» for å bli overgang
      "action:KLIPP TIL:",
    ]);
  });

  it("regler for tomme linjer", () => {
    const e = els(
      [
        "INT. HUS - DAG",
        "Ikke en overskrift likevel? (mangler tom linje etter – tolkes likevel som overskrift)",
        "",
        "MAJA",
        "",
        "Tom linje etter: handling, ikke karakter.",
        "",
        "PER",
        "Linje én.",
        "  ",
        "Linje tre etter tom linje i replikken.",
        "",
        "",
        "",
        "Flere tomme linjer gir bare nytt avsnitt.",
        "CUT TO:",
        "Overgang uten tom linje rundt er handling.",
      ].join("\n"),
    );
    expect(e.map((x) => `${x.kind}:${x.text}`)).toEqual([
      "action:Ikke en overskrift likevel? (mangler tom linje etter – tolkes likevel som overskrift)",
      "action:MAJA",
      "action:Tom linje etter: handling, ikke karakter.",
      "character:PER",
      "dialogue:Linje én.\n\nLinje tre etter tom linje i replikken.",
      "action:Flere tomme linjer gir bare nytt avsnitt.\nCUT TO:\nOvergang uten tom linje rundt er handling.",
    ]);
  });

  it("dobbel dialog ^ importeres etter hverandre med markering (DEC-0073)", () => {
    const e = els(["INT. HUS - DAG", "", "MAJA", "Ja!", "", "PER ^", "Nei!"].join("\n"));
    expect(e.map((x) => `${x.kind}:${x.text}`)).toEqual([
      "character:MAJA",
      "dialogue:Ja!",
      "character:PER",
      "dialogue:Nei!",
    ]);
    // Tolkningen er sikker (replikk rett foran): ikke usikker, men markert for eksport
    expect(e[2]!.uncertain).toBeUndefined();
    expect(e[2]!.source.fountain).toEqual({ dual: true });
    expect(e[0]!.source.fountain).toBeUndefined();
  });

  it("ignorerer boneyard, avsnitt, synopsis og sideskift; notater blir notater", () => {
    const r = parseFountain(
      [
        "# Akt én",
        "",
        "= Maja finner vasen.",
        "",
        "INT. STUA - DAG #3#",
        "",
        "/* Gammel versjon:",
        "Maja knuser vasen. */",
        "Maja ser på vasen.[[Bør den være rød?]]",
        "",
        "[[Nål på scenen]]",
        "",
        "MAJA",
        "Den er /* ikke */ fin.",
        "",
        "===",
        "",
        "EXT. GÅRDEN - KVELD",
        "",
        "Snø.",
      ].join("\n"),
    );
    expect(kinds(r.parsed)).toEqual([
      "action:Maja ser på vasen.",
      "character:MAJA",
      "dialogue:Den er  fin.",
      "action:Snø.",
    ]);
    expect(r.parsed.scenes.map((s) => s.number)).toEqual(["3", null]);
    expect(r.parsed.scenes[1]!.elements[0]!.source.page).toBe(2);
    expect(r.notes.map((n) => [n.quote, n.text, n.author])).toEqual([
      ["Maja ser på vasen.", "Bør den være rød?", ""],
      ["", "Nål på scenen", ""],
    ]);
    // Notatene går gjennom samme gjenoppretting som Word-kommentarer
    const fresh = seedProject(0);
    const cmd = planImport(fresh.state, r.parsed, {
      productionId: fresh.mainId as ProductionId,
      newId: tid,
    });
    const ann = planImportNotes(r.parsed, cmd, r.notes, { fallbackAuthor: "Importør", newId: tid });
    expect(ann.map((a) => [a.blockId !== null, a.quote, a.authorName])).toEqual([
      [true, "Maja ser på vasen.", "Importør"],
      [false, "", "Importør"],
    ]);
  });

  it("tekst før første overskrift blir fortsettelse, og utheving fjernes", () => {
    const { parsed } = parseFountain(
      "FADE IN:\n\nHun løper *fort* og **ser** seg _tilbake_, 5 * 3 = 15 \\*ikke\\*.\n\nINT. HUS - DAG\n\nInne.\n",
    );
    expect(parsed.scenes[0]!.isContinuation).toBe(true);
    expect(kinds(parsed).slice(0, 2)).toEqual([
      "action:FADE IN:",
      "action:Hun løper fort og ser seg tilbake, 5 * 3 = 15 *ikke*.",
    ]);
  });

  it("Windows-linjeskift, BOM og norske tegn", () => {
    const { parsed } = parseFountain(
      "\uFEFF.INNE. FJØSET - MØRKT\r\n\r\nÆRLIG ÅSE\r\nÅ nei, øyeblikk!\r\n",
    );
    expect(parsed.scenes[0]!.heading).toEqual({
      intExt: "INNE.",
      location: "FJØSET",
      time: "MØRKT",
    });
    expect(kinds(parsed)).toEqual(["character:ÆRLIG ÅSE", "dialogue:Å nei, øyeblikk!"]);
  });

  it("anslår sidetall fordi Fountain ikke har faste sider", () => {
    const body = Array.from(
      { length: 120 },
      (_, i) => `INT. ROM ${i} - DAG\n\nHandling ${i}.\n`,
    ).join("\n");
    expect(parseFountain(body).parsed.pageCount).toBeGreaterThan(5);
  });
});

describe("Fountain – filtype", () => {
  it("godtar .fountain, .spmd og .txt", () => {
    expect(formatOf("manus.fountain")).toBe("fountain");
    expect(formatOf("MANUS.SPMD")).toBe("fountain");
    expect(formatOf("manus.txt")).toBe("fountain");
    expect(formatOf("manus.fdx")).toBe("fdx"); // G-1b: Final Draft importeres via fdxToFountain
    expect(formatOf("manus.odt")).toBeNull();
  });

  it("avviser binærfiler og leser UTF-8 eller Windows-1252", () => {
    expect(() => decodeFountain(new Uint8Array([0x50, 0x4b, 3, 4, 0]))).toThrow(/Fountain/);
    expect(() => decodeFountain(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toThrow(/Fountain/);
    expect(decodeFountain(new TextEncoder().encode("Blåbær"))).toBe("Blåbær");
    expect(decodeFountain(new Uint8Array([0x42, 0x6c, 0xe5, 0x62, 0xe6, 0x72]))).toBe("Blåbær");
  });
});

describe("Fountain – rettinger etter kodegjennomgang (DEC-0070)", () => {
  it("tankestrek mellom sted og tid i overskriften", () => {
    const { parsed } = parseFountain("INT. KJØKKEN – DAG\n\nMaja står ved vinduet.\n");
    expect(parsed.scenes[0]!.heading).toEqual({ intExt: "INT.", location: "KJØKKEN", time: "DAG" });
    const em = parseFountain("EXT. TUNET — NATT\n\nSnø.\n").parsed.scenes[0]!.heading;
    expect(em.location).toBe("TUNET");
    expect(em.time).toBe("NATT");
  });

  it("UTF-16 med byte-rekkefølgemerke leses", () => {
    const text = "INT. STUA - DAG\n\nØ og å.\n";
    const le = new Uint8Array(2 + text.length * 2);
    le[0] = 0xff;
    le[1] = 0xfe;
    for (let i = 0; i < text.length; i++) {
      le[2 + i * 2] = text.charCodeAt(i) & 0xff;
      le[3 + i * 2] = text.charCodeAt(i) >> 8;
    }
    expect(decodeFountain(le)).toBe(text);
  });
});
