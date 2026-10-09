// @vitest-environment node
/** Notater i manus (DEC-0031, REQ-0535–0541). */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  emptyProjectState,
  exportNotes,
  formatEdited,
  exportPaginationInput,
  lineKey,
  matchingOccurrences,
  pageDecorations,
  paginate,
  parseScreenplayLines,
  placeNotes,
  planImport,
  planImportNotes,
  resolveRange,
  scriptPages,
  scriptView,
  searchHits,
  type Command,
  type ProductionId,
  type ProjectState,
} from "@/core";
import { screenplayPdf } from "@/engine/export/screenplay-pdf";
import { screenplayDocx } from "@/engine/export/screenplay-docx";
import { pdfDateToIso, pdfToLinesAndNotes } from "@/engine/import/pdf-lines";
import { docxToLinesAndNotes } from "@/engine/import/docx-lines";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const L = (row: number, x: number, text: string) => ({ page: 1, x, y: 72 + row * 12, text });
const loadPdf = () => import("pdfjs-dist/legacy/build/pdf.mjs") as never;

function project() {
  const { state, mainId } = seedProject(0);
  const parsed = parseScreenplayLines(
    [
      L(0, 54, "1 INT. STUA - DAG 1"),
      L(2, 108, "Maja setter den blå vasen i vinduet og ser ut i mørket."),
      L(4, 252, "MAJA"),
      L(5, 180, "Hører du det? Det er noen der ute."),
      L(7, 54, "2 EXT. TUNET - NATT 2"),
      L(9, 108, "Snøen faller."),
    ],
    { format: "pdf" },
  );
  const cmd = planImport(state, parsed, { productionId: mainId as ProductionId, newId: tid });
  return { s: mustApply(state, cmd), mainId: mainId as ProductionId, cmd };
}

function addNote(s: ProjectState, blockId: string, quote: string, text: string, author = "Mars") {
  const b = s.blocks[blockId]!;
  const start = b.text.indexOf(quote);
  const id = tid<"annotation">();
  return {
    id,
    s: mustApply(s, {
      type: "AddAnnotations",
      annotations: [
        {
          annotationId: id,
          blockId: b.id,
          variantId: null,
          start,
          end: start + quote.length,
          quote,
          text,
          authorName: author,
          stampAt: "2026-10-09T12:34:00.000Z",
        },
      ],
    }),
  };
}

function fails(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  return r.ok ? null : r.error.code;
}

describe("Notater: opprette, endre, slette (REQ-0535–0537)", () => {
  it("notat på tekst og nål på scenen, med stempel; sletting kan angres", () => {
    const { s: s0, cmd } = project();
    const action = cmd.scenes[0]!.blocks[0]!.blockId;
    const { s, id } = addNote(s0, action, "den blå vasen", "Bør vasen være rød?");
    const a = s.annotations[id]!;
    expect([a.authorName, a.stampAt, a.quote]).toEqual([
      "Mars",
      "2026-10-09T12:34:00.000Z",
      "den blå vasen",
    ]);
    const pin = tid<"annotation">();
    const s2 = mustApply(s, {
      type: "AddAnnotations",
      annotations: [
        {
          annotationId: pin,
          blockId: null,
          variantId: cmd.scenes[1]!.variantId,
          start: 0,
          end: 0,
          quote: "",
          text: "Musikk her",
          authorName: "Anita",
        },
      ],
    });
    expect(s2.annotations[pin]!.stampAt).toBe("2026-10-08T12:00:00.000Z"); // tidspunktet for kommandoen
    const del = applyCommand(
      s2,
      envelope({ type: "SetAnnotationRemoved", annotationId: id, removed: true }),
    );
    if (!del.ok) throw new Error(del.error.message);
    expect(del.state.annotations[id]!.removed).toBe(true);
    const back = applyCommand(del.state, envelope(del.inverse));
    expect(back.ok && back.state.annotations[id]!.removed).toBe(false);
    const edit = mustApply(s2, { type: "EditAnnotation", annotationId: id, text: "  Rød vase.  " });
    expect(edit.annotations[id]!.text).toBe("Rød vase.");
    // Ugyldige notater avvises
    expect(
      fails(s, {
        type: "AddAnnotations",
        annotations: [
          {
            annotationId: tid(),
            blockId: action as never,
            variantId: null,
            start: 0,
            end: 4,
            quote: "feil",
            text: "x",
            authorName: "M",
          },
        ],
      }),
    ).toBe("invalid");
    expect(
      fails(s, {
        type: "AddAnnotations",
        annotations: [
          {
            annotationId: tid(),
            blockId: action as never,
            variantId: null,
            start: 0,
            end: 4,
            quote: "Maja",
            text: "  ",
            authorName: "M",
          },
        ],
      }),
    ).toBe("invalid");
  });

  it("notatet finner teksten igjen når manuset endres, og står ved blokkens start hvis den er borte", () => {
    const { s: s0, mainId, cmd } = project();
    const action = cmd.scenes[0]!.blocks[0]!.blockId;
    const { s, id } = addNote(s0, action, "vasen", "Rekvisitt");
    const s2 = mustApply(s, {
      type: "EditBlockText",
      productionId: mainId,
      blockId: action,
      text: "Om kvelden setter Maja den blå vasen i vinduet.",
    });
    const r = resolveRange(s2.annotations[id]!, s2.blocks[action]!.text);
    expect(s2.blocks[action]!.text.slice(r.start, r.end)).toBe("vasen");
    const s3 = mustApply(s2, {
      type: "EditBlockText",
      productionId: mainId,
      blockId: action,
      text: "Helt ny tekst.",
    });
    expect(resolveRange(s3.annotations[id]!, s3.blocks[action]!.text).found).toBe(false);
  });
});

describe("Søk og markering (REQ-0539, REQ-0541)", () => {
  it("søk treffer notater og forteller hva som ble truffet", () => {
    const { s: s0, mainId, cmd } = project();
    const { s } = addNote(s0, cmd.scenes[1]!.blocks[0]!.blockId, "Snøen", "Husk snømaskinen");
    const occ = cmd.scenes.map((x) => x.occurrenceId as string);
    expect([...matchingOccurrences(s, mainId, { text: "snømaskin" })]).toEqual([occ[1]]);
    expect(searchHits(s, mainId, "snømaskin").get(occ[1]!)).toEqual(["note"]);
    expect(searchHits(s, mainId, "maja").get(occ[0]!)).toEqual(["action", "character"]);
    expect(searchHits(s, mainId, "stua").get(occ[0]!)).toEqual(["heading"]);
  });

  it("markerer søketreff og notater på riktige kolonner i linjene", () => {
    const { s: s0, mainId, cmd } = project();
    const action = cmd.scenes[0]!.blocks[0]!.blockId;
    const { s, id } = addNote(s0, action, "blå vasen", "Farge?");
    const pages = scriptPages(s, mainId).pages;
    const deco = pageDecorations(pages, s, { query: "mørket", notes: true });
    const idx = pages[0]!.lines.findIndex((l) => l.blockId === action);
    const line = pages[0]!.lines[idx]!;
    const d = deco.get(lineKey(1, idx))!;
    const note = d.marks.find((m) => m.kind === "note")!;
    expect(line.text.slice(note.from, note.to)).toBe("blå vasen");
    expect(d.notesHere).toEqual([id]);
    // «mørket» står på neste linje i samme blokk
    const all = pages[0]!.lines
      .map((l, i) => ({ l, d: deco.get(lineKey(1, i)) }))
      .flatMap(({ l, d }) =>
        (d?.marks ?? []).filter((m) => m.kind === "search").map((m) => l.text.slice(m.from, m.to)),
      );
    expect(all).toEqual(["mørket"]);
  });
});

describe("Notater i eksport og ny import (REQ-0540)", () => {
  function withNotes() {
    const { s: s0, mainId, cmd } = project();
    let { s } = addNote(
      s0,
      cmd.scenes[0]!.blocks[0]!.blockId,
      "den blå vasen",
      "Bør vasen være rød?\nSjekk med Anita.",
      "Mars",
    );
    ({ s } = addNote(
      s,
      cmd.scenes[0]!.blocks[2]!.blockId,
      "Det er noen der ute.",
      "Hvisk dette",
      "Anita Killi",
    ));
    s = mustApply(s, {
      type: "AddAnnotations",
      annotations: [
        {
          annotationId: tid(),
          blockId: null,
          variantId: cmd.scenes[1]!.variantId,
          start: 0,
          end: 0,
          quote: "",
          text: "Nålen på scene 2 – æøå",
          authorName: "Mars",
          stampAt: "2026-10-01T08:00:00.000Z",
        },
      ],
    });
    const input = exportPaginationInput(s, mainId, {
      method: "production",
      includeInactive: false,
    });
    const notes = exportNotes(
      s,
      input.map((x) => x.occurrenceId),
    );
    return { s, mainId, input, notes };
  }

  function reimport(
    lines: Parameters<typeof parseScreenplayLines>[0],
    format: "pdf" | "docx",
    notes: never[],
  ) {
    const fresh = seedProject(0);
    const parsed = parseScreenplayLines(lines, { format });
    const cmd = planImport(fresh.state, parsed, {
      productionId: fresh.mainId as ProductionId,
      newId: tid,
    });
    let st = mustApply(fresh.state, cmd);
    const ann = planImportNotes(parsed, cmd, notes, { fallbackAuthor: "Importør", newId: tid });
    st = mustApply(st, { type: "AddAnnotations", annotations: ann });
    return Object.values(st.annotations)
      .map((a) => ({
        on: a.blockId
          ? a.quote
          : `scene ${Object.values(st.occurrences).find((o) => o.variantId === a.variantId)?.productionNumber}`,
        text: a.text,
        author: a.authorName,
        at: a.stampAt.slice(0, 16),
      }))
      .sort((a, b) => a.text.localeCompare(b.text));
  }

  const expected = [
    {
      on: "den blå vasen",
      text: "Bør vasen være rød?\nSjekk med Anita.",
      author: "Mars",
      at: "2026-10-09T12:34",
    },
    {
      on: "Det er noen der ute.",
      text: "Hvisk dette",
      author: "Anita Killi",
      at: "2026-10-09T12:34",
    },
    { on: "scene 2", text: "Nålen på scene 2 – æøå", author: "Mars", at: "2026-10-01T08:00" },
  ].sort((a, b) => a.text.localeCompare(b.text));

  it("Word: notatene blir kommentarer og gjenopprettes ved import", () => {
    const { input, notes } = withNotes();
    const docx = screenplayDocx(input, { notes });
    const { lines, notes: read } = docxToLinesAndNotes(docx);
    expect(read).toHaveLength(3);
    expect(reimport(lines, "docx", read as never[])).toEqual(expected);
    // Uten notater: ingen kommentarer
    expect(docxToLinesAndNotes(screenplayDocx(input)).notes).toEqual([]);
  });

  it("PDF: notatene blir merknader og gjenopprettes ved import", async () => {
    const { s, input, notes } = withNotes();
    const pages = paginate(input).pages;
    const texts = new Map(Object.values(s.blocks).map((b) => [b.id as string, b.text]));
    const pdf = screenplayPdf(pages, { notes: placeNotes(pages, texts, notes) });
    const { lines, notes: read } = await pdfToLinesAndNotes(pdf, loadPdf);
    expect(read).toHaveLength(3);
    expect(reimport(lines, "pdf", read as never[])).toEqual(expected);
  });

  it("PDF-datoer", () => {
    expect(pdfDateToIso("D:20261009143200Z")).toBe("2026-10-09T14:32:00.000Z");
    expect(pdfDateToIso("D:20261009163200+02'00'")).toBe("2026-10-09T14:32:00.000Z");
    expect(pdfDateToIso("tull")).toBeNull();
    expect(emptyProjectState).toBeTypeOf("function");
  });
});

describe("Notater: grensetilfeller (kodegjennomgang)", () => {
  it("«__proto__» som ID gir feilmelding, ikke krasj", () => {
    const { s } = project();
    for (const bad of ["__proto__", "constructor"])
      expect(
        fails(s, {
          type: "AddAnnotations",
          annotations: [
            {
              annotationId: tid(),
              blockId: bad as never,
              variantId: null,
              start: 0,
              end: 1,
              quote: "x",
              text: "x",
              authorName: "M",
            },
          ],
        }),
      ).toBe("not_found");
  });

  it("notat på hele elementet følger teksten også etter endringer", () => {
    const { s: s0, mainId, cmd } = project();
    const action = cmd.scenes[1]!.blocks[0]!.blockId;
    const id = tid<"annotation">();
    let s = mustApply(s0, {
      type: "AddAnnotations",
      annotations: [
        {
          annotationId: id,
          blockId: action,
          variantId: null,
          start: 0,
          end: 0,
          quote: "",
          text: "Hele",
          authorName: "M",
        },
      ],
    });
    s = mustApply(s, {
      type: "EditBlockText",
      productionId: mainId,
      blockId: action,
      text: "Snøen faller tett.",
    });
    expect(resolveRange(s.annotations[id]!, s.blocks[action]!.text)).toEqual({
      start: 0,
      end: 18,
      found: true,
    });
  });

  it("gjør om et notat etter at teksten er endret: finner ordene på nytt sted", () => {
    const { s: s0, mainId, cmd } = project();
    const action = cmd.scenes[0]!.blocks[0]!.blockId;
    const r = applyCommand(
      s0,
      envelope({
        type: "AddAnnotations",
        annotations: [
          {
            annotationId: tid(),
            blockId: action,
            variantId: null,
            start: 19,
            end: 24,
            quote: "vasen",
            text: "x",
            authorName: "M",
          },
        ],
      }),
    );
    if (!r.ok) throw new Error(r.error.message);
    const undo = applyCommand(r.state, envelope(r.inverse));
    if (!undo.ok) throw new Error(undo.error.message);
    const edited = mustApply(undo.state, {
      type: "EditBlockText",
      productionId: mainId,
      blockId: action,
      text: "Nå setter Maja den blå vasen i vinduet.",
    });
    const redo = applyCommand(edited, envelope(undo.inverse));
    expect(redo.ok).toBe(true);
    if (redo.ok) {
      const a = Object.values(redo.state.annotations)[0]!;
      expect(redo.state.blocks[action]!.text.slice(a.start, a.end)).toBe("vasen");
    }
  });

  it("angring av ny tekst: slettede notater fjernes med, synlige notater stopper med tydelig melding", () => {
    const { s: s0, cmd } = project();
    const ins = applyCommand(
      s0,
      envelope({
        type: "InsertBlock",
        productionId: cmd.productionId,
        variantId: cmd.scenes[1]!.variantId,
        block: { blockId: tid(), kind: "action", text: "Ny linje her.", orderKey: "z" },
      }),
    );
    if (!ins.ok) throw new Error(ins.error.message);
    const blockId = Object.keys(ins.state.blocks).find((k) => !s0.blocks[k])!;
    const { s, id } = addNote(ins.state, blockId, "linje", "Notat");
    const blocked = applyCommand(s, envelope(ins.inverse));
    expect(blocked.ok ? null : [blocked.error.code, blocked.error.message]).toEqual([
      "referenced",
      "Det finnes et notat på denne teksten. Slett notatet først hvis endringen skal angres.",
    ]);
    const removed = mustApply(s, { type: "SetAnnotationRemoved", annotationId: id, removed: true });
    const ok = applyCommand(removed, envelope(ins.inverse));
    expect(ok.ok && ok.state.annotations[id]).toBe(undefined);
  });

  it("Word: notat over linjeskift og notat uten tekstområde går ikke tapt", () => {
    const { s: s0, mainId, cmd } = project();
    let s = mustApply(s0, {
      type: "EditBlockText",
      productionId: mainId,
      blockId: cmd.scenes[1]!.blocks[0]!.blockId,
      text: "\n\nSnøen faller\ntett over tunet.",
    });
    ({ s } = addNote(s, cmd.scenes[1]!.blocks[0]!.blockId, "faller\ntett", "Over linjeskift"));
    const input = exportPaginationInput(s, mainId, {
      method: "production",
      includeInactive: false,
    });
    const notes = exportNotes(
      s,
      input.map((x) => x.occurrenceId),
    );
    // Et notat med tomt område (f.eks. på et tomt element) blir en punktkommentar
    notes.byBlock.set(cmd.scenes[0]!.blocks[0]!.blockId, [
      {
        id: "p",
        start: 0,
        end: 0,
        text: "Punkt",
        author: "M",
        stampAt: "2026-10-09T10:00:00.000Z",
      },
    ]);
    const { notes: read } = docxToLinesAndNotes(screenplayDocx(input, { notes }));
    expect(read.map((n) => [n.text, n.quote])).toEqual([
      ["Punkt", ""],
      ["Over linjeskift", "faller tett"],
    ]);
  });
});

describe("«Endret av …» (DEC-0032)", () => {
  it("endring stemples med hvem og når; angre fjerner stempelet igjen", () => {
    const { s: s0, cmd } = project();
    const { s, id } = addNote(s0, cmd.scenes[0]!.blocks[0]!.blockId, "vasen", "Første", "Mars");
    const r = applyCommand(
      s,
      envelope({
        type: "EditAnnotation",
        annotationId: id as never,
        text: "Andre",
        editedByName: "Anita",
      }),
    );
    if (!r.ok) throw new Error(r.error.message);
    const a = r.state.annotations[id]!;
    expect([a.authorName, a.editedByName, a.editedAt]).toEqual([
      "Mars",
      "Anita",
      "2026-10-08T12:00:00.000Z",
    ]);
    expect(formatEdited(a)).toMatch(/^endret av Anita · /);
    expect(formatEdited({ ...a, editedByName: "Mars" })).toMatch(/^endret · /);
    const back = applyCommand(r.state, envelope(r.inverse));
    expect(
      back.ok && [back.state.annotations[id]!.editedByName, back.state.annotations[id]!.editedAt],
    ).toEqual([null, null]);
  });
});
