// @vitest-environment node
/** Manuseksport PDF/DOCX (mandat 5.3) – syntetisk rundtur gjennom egne importører. */
import { describe, expect, it } from "vitest";
import { exportPaginationInput, paginate, parseScreenplayLines, scriptView } from "@/core";
import { screenplayPdf, toWinAnsi } from "@/engine/export/screenplay-pdf";
import { screenplayDocx } from "@/engine/export/screenplay-docx";
import { pdfToLines } from "@/engine/import/pdf-lines";
import { docxToLines } from "@/engine/import/docx-lines";
import { seedProject } from "../helpers/fixtures";

const loadPdf = () => import("pdfjs-dist/legacy/build/pdf.mjs") as never;

describe("Eksport", () => {
  it("WinAnsi dekker norske og typografiske tegn", () => {
    expect(toWinAnsi("æøåÆØÅ–“”…")).toEqual([
      0xe6, 0xf8, 0xe5, 0xc6, 0xd8, 0xc5, 0x96, 0x93, 0x94, 0x85,
    ]);
    expect(toWinAnsi("中")).toEqual([0x3f]);
  });

  it("PDF og DOCX leses inn igjen med samme scener og tekst", async () => {
    const { state, mainId } = seedProject();
    const input = exportPaginationInput(state, mainId, {
      method: "production",
      includeInactive: false,
      fillMissing: "none",
    });
    const expected = scriptView(state, mainId);

    const pdf = screenplayPdf(paginate(input).pages, {
      title: "Test – æøå",
      titlePage: ["TESTPROSJEKT"],
    });
    expect(new TextDecoder().decode(pdf.slice(0, 8))).toBe("%PDF-1.4");
    const fromPdf = parseScreenplayLines(await pdfToLines(pdf, loadPdf), { format: "pdf" });
    expect(fromPdf.titlePage).toEqual(["TESTPROSJEKT"]);
    expect(fromPdf.scenes.map((s) => s.number)).toEqual(expected.map((s) => s.productionNumber));
    expect(fromPdf.scenes.flatMap((s) => s.elements.map((e) => e.text))).toEqual(
      expected.flatMap((s) => s.blocks.map((b) => b.text)),
    );

    const docx = screenplayDocx(input, { titlePage: ["TESTPROSJEKT"] });
    const fromDocx = parseScreenplayLines(docxToLines(docx), { format: "docx" });
    expect(fromDocx.scenes.map((s) => s.number)).toEqual(expected.map((s) => s.productionNumber));
    expect(fromDocx.scenes.flatMap((s) => s.elements.map((e) => `${e.kind}:${e.text}`))).toEqual(
      expected.flatMap((s) => s.blocks.map((b) => `${b.kind}:${b.text}`)),
    );
  });

  it("samme manus gir byte-identisk fil (deterministisk)", () => {
    const { state, mainId } = seedProject();
    const input = exportPaginationInput(state, mainId, {
      method: "continuous",
      includeInactive: false,
    });
    expect(screenplayPdf(paginate(input).pages)).toEqual(screenplayPdf(paginate(input).pages));
    expect(screenplayDocx(input)).toEqual(screenplayDocx(input));
  });
});
