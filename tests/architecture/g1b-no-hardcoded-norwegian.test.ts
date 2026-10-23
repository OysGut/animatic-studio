// @vitest-environment node
/**
 * G-1b: ingen fast norsk språkverdi i kode. «nb», «no», «nn» (og «-NO»-varianter) som strengverdi er bare lov i
 * i18n-katalogen (forfatterspråket og nettleseralias) og i en kort, begrunnet unntaksliste. Feiler testen,
 * er det koden som skal bruke sourceLanguageOf(state), brukerens grensesnittspråk eller SOURCE_TEXT_KEY.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "../..");
const SKIP_DIRS = ["src/core/i18n", "src/integrations"];
const LITERAL = /["'`](nb|no|nn|nb-NO|no-NO|nn-NO)["'`]/g;

/** Fil → tekst som må stå på linjen, med begrunnelse. */
const EXCEPTIONS: readonly { file: string; contains: string; why: string }[] = [
  { file: "src/core/screenplay/heading-keywords.ts", contains: 'language: "nb"', why: "G-3: nøkkelordsett for sceneoverskrifter per språk; norsk er ett av mange sett." },
  { file: "src/core/screenplay/heading-keywords.ts", contains: 'language: "nn"', why: "G-3: nøkkelordsett for nynorsk sceneoverskrift." },
  { file: "src/test/setup.ts", contains: "setLanguage('nb')", why: "Testoppsett: katalogens forfatterspråk i jsdom-tester." },
  { file: "src/core/storylab/line-check.ts", contains: '"no"', why: "Engelsk svarverdi (yes/partly/no), ikke et språk." },
  { file: "src/core/screenplay/export-fonts.ts", contains: 'language === "nb" ? "nb-NO"', why: "Word kjenner bokmål bare med region; andre språk skrives uendret." },
  { file: "src/core/demo/story.ts", contains: 'DEMO_LANGUAGES = ["en", "ja", "es", "nb"]', why: "G-9: eksempelprosjektet finnes på fire språk; norsk er ett av dem, engelsk er kilde og reserve." },
  { file: "src/core/demo/plan.ts", contains: 'base === "no" ? "nb"', why: "G-9: nettleserens «no» velger den norske eksempelversjonen." },
  { file: "src/core/generation/style-analysis.ts", contains: 'j["nb"]', why: "Leser eldre svarform fra modellen; nye svar bruker «local»." },
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    const rel = relative(ROOT, p).replace(/\\/g, "/");
    if (SKIP_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`))) return [];
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(n) && !/\.gen\.ts$/.test(n) ? [p] : [];
  });
}

describe("G-1b: ingen hardkodet norsk språkverdi", () => {
  it("bare begrunnede unntak bruker «nb»/«no»/«nn» som verdi", () => {
    const found: string[] = [];
    for (const f of walk(join(ROOT, "src"))) {
      const rel = relative(ROOT, f).replace(/\\/g, "/");
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (!LITERAL.test(line)) return;
          LITERAL.lastIndex = 0;
          if (EXCEPTIONS.some((e) => e.file === rel && line.includes(e.contains))) return;
          found.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
        });
    }
    expect(found).toEqual([]);
  });
  it("unntakene er fortsatt i bruk (lista holdes kort)", () => {
    for (const e of EXCEPTIONS) expect(readFileSync(join(ROOT, e.file), "utf8")).toContain(e.contains);
  });
});
