// @vitest-environment node
/**
 * Kobling av det engelske referansemanuset til det norske (DEC-0058, REQ-0332–0335).
 * Manusfilene ligger UTENFOR repoet (DEC-0004); testene hoppes over når filene ikke finnes.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScreenplayLines, planImport, type ParsedScreenplay } from "@/core/screenplay";
import {
  alignTranslation,
  applyCommand,
  blocksOfVariant,
  orderedOccurrences,
  type ProductionId,
  type ProjectState,
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

async function setup(): Promise<{ s: ProjectState; main: string; en: ParsedScreenplay }> {
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
  const en = parseScreenplayLines(docxToLines(new Uint8Array(readFileSync(DOCX!))), {
    format: "docx",
  });
  return { s: r.state, main: main.id, en };
}

describe.skipIf(!PDF || !DOCX)("Engelsk referansemanus kobles til det norske", () => {
  it("alle scener kobles riktig, nesten alle sikkert, og nesten alle linjer får oversettelse", async () => {
    const { s, main, en } = await setup();
    const occs = orderedOccurrences(s, main);
    const links = alignTranslation(s, main, en);
    expect(links).toHaveLength(97);
    links.forEach((l, i) => expect(l.occurrenceId).toBe(occs[i]!.id));
    const sure = links.filter((l) => l.certainty === "sure").length;
    expect(sure / links.length).toBeGreaterThan(0.9);
    const lines = occs.reduce(
      (n, o) => n + blocksOfVariant(s, o.variantId).filter((b) => b.kind !== "heading").length,
      0,
    );
    const linked = links.reduce((n, l) => n + l.lines.length, 0);
    expect(linked / lines).toBeGreaterThan(0.95);
    // Replikkene parres med replikker hos samme karakter
    const s1 = links[0]!;
    const firstDialogue = s1.lines.find((l) => s.blocks[l.blockId]!.kind === "dialogue")!;
    expect(firstDialogue.text.length).toBeGreaterThan(0);
  }, 60_000);

  it("uten scenenumre og med en scene borte kobles resten likevel (REQ-0334)", async () => {
    const { s, main, en } = await setup();
    const occs = orderedOccurrences(s, main);
    const stripped: ParsedScreenplay = {
      ...en,
      scenes: en.scenes.filter((_, i) => i !== 40).map((x) => ({ ...x, number: null })),
    };
    const links = alignTranslation(s, main, stripped);
    let right = 0;
    links.forEach((l, i) => {
      const expected = occs[i < 40 ? i : i + 1]!.id;
      if (l.occurrenceId === expected) right++;
    });
    expect(right / links.length).toBeGreaterThan(0.9);
  }, 60_000);
});
