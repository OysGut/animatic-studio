// @vitest-environment node
/**
 * Gyldne tester mot referansemanuset «Jula på Dovre» (DEC-0002, ADR-0007).
 * Manusfilene ligger UTENFOR repoet (DEC-0004). Testene hoppes over når filene ikke finnes.
 * Sett MANUS_DIR, eller legg filene i ../Manus/ (Mars' Mac) eller /tmp/claude-0/ (Claudes miljø).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatHeading,
  paginate,
  parseScreenplayLines,
  planImport,
  scriptPages,
  type ParsedScreenplay,
} from "@/core/screenplay";
import {
  applyCommand,
  checkInvariants,
  diffStates,
  orderedOccurrences,
  type ProductionId,
} from "@/core";
import { envelope, seedProject } from "../helpers/fixtures";
import { docxToLines } from "@/engine/import/docx-lines";
import { pdfToLines } from "@/engine/import/pdf-lines";

function find(ext: string, hint: RegExp): string | null {
  const dirs = [
    process.env["MANUS_DIR"],
    join(__dirname, "../../../Manus"),
    "/tmp/claude-0",
  ].filter(Boolean) as string[];
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    const f = readdirSync(d).find((n) => n.toLowerCase().endsWith(ext) && hint.test(n));
    if (f) return join(d, f);
  }
  return null;
}

const PDF = find(".pdf", /norsk|ref_no|DOVRE/i);
const DOCX = find(".docx", /engelsk|ref_en|ENGLISH/i);

/** Scenenumrene slik de står i referansemanuset (målt 2026-10-08): 96 nummererte, hull opp til 109. */
const EXPECTED_NUMBERS = [
  "1",
  "3",
  ...Array.from({ length: 34 }, (_, i) => String(13 + i)), // 13–46
  ...Array.from({ length: 51 }, (_, i) => String(48 + i)), // 48–98
  "100",
  "101",
  "102",
  "103",
  "104",
  "105",
  "106",
  "108",
  "109",
];

function checkCommon(p: ParsedScreenplay) {
  expect(p.pageCount).toBe(106);
  expect(p.stats.numbered).toBe(96);
  expect(p.stats.unnumbered).toBe(1);
  expect(p.stats.duplicateNumbers).toEqual([]);
  expect(p.scenes.filter((s) => s.number !== null).map((s) => s.number)).toEqual(EXPECTED_NUMBERS);
  expect(p.scenes).toHaveLength(97); // ingen oppdiktede scener (mandat 4.1)
  expect(p.scenes.some((s) => s.isContinuation)).toBe(false);
  expect(p.titlePage.join(" ")).toContain("JULA PÅ DOVRE");
  // Ingen tekniske markører lekker inn i innholdet
  const all = p.scenes.flatMap((s) => s.elements);
  expect(all.some((e) => /^\((MORE|MER)\)$/i.test(e.text))).toBe(false);
  expect(all.filter((e) => e.kind === "character").some((e) => /CONT.D/i.test(e.text))).toBe(false);
  // Hver karakterlinje følges av replikk eller parentes
  for (const s of p.scenes) {
    s.elements.forEach((e, i) => {
      if (e.kind === "character")
        expect(["dialogue", "parenthetical"]).toContain(s.elements[i + 1]?.kind);
    });
  }
  return all;
}

describe.skipIf(!PDF)("Referansemanus – norsk PDF (Final Draft 11)", () => {
  it("tolker alle scener, numre, tittelside og elementer", async () => {
    const lines = await pdfToLines(
      new Uint8Array(readFileSync(PDF!)),
      () => import("pdfjs-dist/legacy/build/pdf.mjs") as never,
    );
    const p = parseScreenplayLines(lines, { format: "pdf" });
    const all = checkCommon(p);
    expect(p.stats.uncertain).toBe(0);
    const s1 = p.scenes[0]!;
    expect(s1.number).toBe("1");
    expect(s1.heading).toEqual({
      intExt: "INT.",
      location: "LILLEHAMMER, ROLFS HUS, BAD",
      time: "DAG",
    });
    const unnumbered = p.scenes.find((s) => s.number === null)!;
    expect(unnumbered.heading.location).toBe("LILLEHAMMER, ROLFS HUS, SOVEROM");
    expect(unnumbered.source.page).toBe(3);
    const s18 = p.scenes.find((s) => s.number === "18")!;
    expect(s18.elements.some((e) => e.kind === "character" && e.text === "MALIN (O.S.)")).toBe(
      true,
    );
    // Replikk over sideskift med (MORE)/(CONT'D) blir én replikk (side 3→4)
    const cross = p.scenes[1]!.elements.find(
      (e) => e.kind === "dialogue" && e.text.startsWith("Mamma! Nå MÅ du stå opp!"),
    );
    expect(cross).toBeDefined();
    expect(cross!.text.length).toBeGreaterThan(60);
    expect(all.filter((e) => e.kind === "transition").map((e) => e.text)).toContain("KLIPP TIL:");
  }, 60_000);
});

describe.skipIf(!DOCX)("Referansemanus – engelsk DOCX", () => {
  it("har samme scenestruktur som det norske manuset", () => {
    const p = parseScreenplayLines(docxToLines(new Uint8Array(readFileSync(DOCX!))), {
      format: "docx",
    });
    checkCommon(p);
    expect(p.scenes[0]!.heading).toEqual({
      intExt: "INT.",
      location: "LILLEHAMMER, ROLF'S HOUSE, BATHROOM",
      time: "DAY",
    });
  });
});

describe.skipIf(!PDF)("Referansemanus – import i prosjekt", () => {
  it("hele manuset importeres atomisk, raskt, uten brudd på invarianter, og kan angres", async () => {
    const lines = await pdfToLines(
      new Uint8Array(readFileSync(PDF!)),
      () => import("pdfjs-dist/legacy/build/pdf.mjs") as never,
    );
    const parsed = parseScreenplayLines(lines, { format: "pdf" });
    const { state } = seedProject(0);
    const main = Object.values(state.productions).find((p) => p.kind === "main")!;
    const cmd = planImport(state, parsed, { productionId: main.id as ProductionId });
    const t0 = performance.now();
    const r = applyCommand(state, envelope(cmd));
    const ms = performance.now() - t0;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ms).toBeLessThan(5000);
    expect(checkInvariants(r.state)).toEqual([]);
    expect(orderedOccurrences(r.state, main.id)).toHaveLength(97);
    const cs = diffStates(state, r.state);
    const bytes = JSON.stringify(cs).length + JSON.stringify(cmd).length * 2;
    expect(bytes).toBeLessThan(8_000_000);
    // Låste sider: hver scene starter på samme side som i originalen (tittelsiden er side 1 i PDF-en)
    const locked = scriptPages(r.state, main.id, { lockedPages: true });
    expect(locked.pages).toHaveLength(105);
    const occ = orderedOccurrences(r.state, main.id);
    parsed.scenes.forEach((sc, i) =>
      expect(locked.sceneStartPage[occ[i]!.id]).toBe(sc.source.page - 1),
    );
    const u = applyCommand(r.state, envelope(r.inverse));
    expect(u.ok).toBe(true);
    if (u.ok) expect(Object.keys(u.state.blocks)).toHaveLength(0);
  }, 60_000);
});

describe.skipIf(!PDF)("Referansemanus – fri sidebryting (KI-08)", () => {
  it("gir samme sideantall og scenestart innen én side av Final Draft", async () => {
    const lines = await pdfToLines(
      new Uint8Array(readFileSync(PDF!)),
      () => import("pdfjs-dist/legacy/build/pdf.mjs") as never,
    );
    const p = parseScreenplayLines(lines, { format: "pdf" });
    const r = paginate(
      p.scenes.map((s, i) => ({
        occurrenceId: String(i),
        number: s.number,
        headingText: formatHeading(s.heading),
        blocks: s.elements.map((e, j) => ({ id: `${i}:${j}`, kind: e.kind, text: e.text })),
      })),
    );
    expect(Math.abs(r.pages.length - 105)).toBeLessThanOrEqual(1);
    const diffs = p.scenes.map((s, i) => r.sceneStartPage[String(i)]! - (s.source.page - 1));
    expect(diffs.every((d) => Math.abs(d) <= 1)).toBe(true);
    // Målt 2026-10-09: 63 av 97 scener starter på nøyaktig samme side. Skal ikke bli dårligere.
    expect(diffs.filter((d) => d === 0).length).toBeGreaterThanOrEqual(60);
  }, 60_000);
});

describe.skipIf(!PDF)("Referansemanus – eksport til PDF og tilbake (mandat 5.3)", () => {
  it("eksportert PDF leses inn igjen med samme scener, numre og tekst", async () => {
    const { screenplayPdf } = await import("@/engine/export/screenplay-pdf");
    const { exportPaginationInput } = await import("@/core/screenplay");
    const lines = await pdfToLines(
      new Uint8Array(readFileSync(PDF!)),
      () => import("pdfjs-dist/legacy/build/pdf.mjs") as never,
    );
    const parsed = parseScreenplayLines(lines, { format: "pdf" });
    const { state } = seedProject(0);
    const main = Object.values(state.productions).find((p) => p.kind === "main")!;
    const r = applyCommand(
      state,
      envelope(planImport(state, parsed, { productionId: main.id as ProductionId })),
    );
    if (!r.ok) throw new Error(r.error.message);
    const input = exportPaginationInput(r.state, main.id, {
      method: "production",
      includeInactive: false,
      fillMissing: "none",
      lockedPages: true,
    });
    const pages = paginate(input).pages;
    const pdf = screenplayPdf(pages, { title: "Test", titlePage: parsed.titlePage.slice(0, 3) });
    const back = parseScreenplayLines(
      await pdfToLines(pdf, () => import("pdfjs-dist/legacy/build/pdf.mjs") as never),
      { format: "pdf" },
    );
    expect(back.scenes.map((s) => s.number)).toEqual(parsed.scenes.map((s) => s.number));
    expect(back.scenes.map((s) => s.heading)).toEqual(parsed.scenes.map((s) => s.heading));
    const texts = (p: ParsedScreenplay) =>
      p.scenes.flatMap((s) => s.elements.map((e) => `${e.kind}:${e.text}`));
    expect(texts(back)).toEqual(texts(parsed));
    // Sidene starter der originalen gjør
    back.scenes.forEach((s, i) => expect(s.source.page).toBe(parsed.scenes[i]!.source.page));
  }, 120_000);
});

describe.skipIf(!PDF)("Referansemanus – eksport til DOCX og tilbake (mandat 5.3, REQ-0087)", () => {
  it("eksportert DOCX leses inn igjen med samme scener, numre og elementer", async () => {
    const { screenplayDocx } = await import("@/engine/export/screenplay-docx");
    const { exportPaginationInput } = await import("@/core/screenplay");
    const lines = await pdfToLines(
      new Uint8Array(readFileSync(PDF!)),
      () => import("pdfjs-dist/legacy/build/pdf.mjs") as never,
    );
    const parsed = parseScreenplayLines(lines, { format: "pdf" });
    const { state } = seedProject(0);
    const main = Object.values(state.productions).find((p) => p.kind === "main")!;
    const r = applyCommand(
      state,
      envelope(planImport(state, parsed, { productionId: main.id as ProductionId })),
    );
    if (!r.ok) throw new Error(r.error.message);
    const input = exportPaginationInput(r.state, main.id, {
      method: "production",
      includeInactive: false,
      fillMissing: "none",
    });
    const docx = screenplayDocx(input, { title: "Test", titlePage: ["JULA PÅ DOVRE"] });
    const back = parseScreenplayLines(docxToLines(docx), { format: "docx" });
    expect(back.scenes.map((s) => s.number)).toEqual(parsed.scenes.map((s) => s.number));
    expect(back.scenes.map((s) => s.heading)).toEqual(parsed.scenes.map((s) => s.heading));
    const kinds = (p: ParsedScreenplay) => p.scenes.flatMap((s) => s.elements.map((e) => e.kind));
    expect(kinds(back)).toEqual(kinds(parsed));
    const norm = (t: string) => t.replace(/\s+/g, " ").trim();
    const texts = (p: ParsedScreenplay) =>
      p.scenes.flatMap((s) => s.elements.map((e) => norm(e.text)));
    expect(texts(back)).toEqual(texts(parsed));
  }, 120_000);
});
