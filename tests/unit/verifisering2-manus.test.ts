// @vitest-environment node
/**
 * Verifisering av krav (DEC-0074): originaltro manusvisning mot referansemanuset (REQ-0050) og at
 * originalfilen leses uendret med kontrollsum før den lagres (REQ-0053).
 *
 * Referansemanuset ligger utenfor repoet (DEC-0004); testene mot det hoppes over når filen ikke finnes
 * (samme oppslag som tests/golden/reference-screenplay.test.ts).
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyCommand, orderedOccurrences, scriptView, type ProductionId } from "@/core";
import { parseScreenplayLines, planImport, scriptPages } from "@/core/screenplay";
import { pdfToLines } from "@/engine/import/pdf-lines";
import { readScreenplayFile } from "@/engine/import/browser";
import { envelope, seedProject } from "../helpers/fixtures";

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

describe.skipIf(!PDF)("REQ-0050 – manusvisningen følger originalens sider", () => {
  it("REQ-0050: referansemanuset gir 106 sider (med tittelsiden), og hver blokk begynner på samme side som i originalen", async () => {
    const lines = await pdfToLines(
      new Uint8Array(readFileSync(PDF!)),
      () => import("pdfjs-dist/legacy/build/pdf.mjs") as never,
    );
    const parsed = parseScreenplayLines(lines, { format: "pdf" });
    expect(parsed.pageCount).toBe(106);
    const { state } = seedProject(0);
    const main = Object.values(state.productions).find((p) => p.kind === "main")!;
    const r = applyCommand(
      state,
      envelope(planImport(state, parsed, { productionId: main.id as ProductionId })),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.state;
    // Manusvisningen bruker låste sider som standard for importert tekst (ScriptWorkspace)
    const pagination = scriptPages(s, main.id, { lockedPages: true });
    // Tittelsiden er side 1 i PDF-en; manussidene er de 105 neste
    expect(pagination.pages.length + 1).toBe(106);
    const pageOfBlock = new Map<string, number>();
    for (const p of pagination.pages)
      for (const l of p.lines)
        if (l.blockId && l.first && !pageOfBlock.has(l.blockId))
          pageOfBlock.set(l.blockId, p.number);
    const view = scriptView(s, main.id);
    let checked = 0;
    const off: string[] = [];
    for (const sc of view)
      for (const b of sc.blocks) {
        if (!b.sourceRef) continue;
        checked++;
        const shown = pageOfBlock.get(b.id);
        if (shown !== b.sourceRef.page - 1)
          off.push(`${b.id}: original ${b.sourceRef.page - 1}, vist ${shown}`);
      }
    expect(checked).toBeGreaterThan(2000);
    expect(off).toEqual([]);
    // Scenene begynner på samme side, og scenenumrene står på scenehodene
    const occ = orderedOccurrences(s, main.id);
    parsed.scenes.forEach((sc, i) =>
      expect(pagination.sceneStartPage[occ[i]!.id]).toBe(sc.source.page - 1),
    );
    const numbered = pagination.pages
      .flatMap((p) => p.lines)
      .filter((l) => l.kind === "heading" && l.sceneNumber);
    expect(numbered).toHaveLength(96);
  }, 60_000);
});

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("REQ-0053 – originalfilen leses uendret, med kontrollsum", () => {
  it("REQ-0053: Fountain – bytene som lastes opp er identiske med filen, og kontrollsummen stemmer", async () => {
    const text =
      "Title: Prøve\n\nINT. STUE - DAG #1#\n\nMaja kommer inn.\n\nMAJA\nHei, æøå!\n\nEXT. TUNET - KVELD #2#\n\nDet snør.\n";
    const original = new TextEncoder().encode(text);
    const file = new File([original.slice()], "prove.fountain", { type: "text/plain" });
    const read = await readScreenplayFile(file);
    expect(read.format).toBe("fountain");
    expect(read.parsed.scenes.length).toBeGreaterThanOrEqual(2);
    expect(Buffer.from(read.bytes).equals(Buffer.from(original))).toBe(true);
    expect(read.sha256).toBe(sha256(original));
  });

  it.skipIf(!DOCX)(
    "REQ-0053: Word – tolkningen endrer ikke bytene som lastes opp, og kontrollsummen stemmer",
    async () => {
      const original = new Uint8Array(readFileSync(DOCX!));
      const file = new File([original.slice()], "manus.docx");
      const read = await readScreenplayFile(file);
      expect(read.format).toBe("docx");
      expect(read.parsed.scenes.length).toBeGreaterThan(90);
      expect(read.bytes.byteLength).toBe(original.byteLength);
      expect(Buffer.from(read.bytes).equals(Buffer.from(original))).toBe(true);
      expect(read.sha256).toBe(sha256(original));
    },
    60_000,
  );
});
