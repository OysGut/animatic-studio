// @vitest-environment node
/**
 * G-1b punkt 6: komplett rundtur for et japansk, et engelsk og et norsk manus, hver med to språkversjoner:
 * sikkerhetskopi → gjenoppretting (nye ID-er), genererte avvik etter endret kildetekst, PTG-modellen og en
 * faktisk manus-PDF (med innebygd Noto for japansk). Ingen nettverk og ingen betalte kall.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyCommand,
  backupIdMap,
  blocksOfVariant,
  buildInterchange,
  diffStates,
  emptyProjectState,
  exportPaginationInput,
  makeBackup,
  paginate,
  parseBackup,
  restoredState,
  scriptExportFontCheck,
  scriptExportTexts,
  scriptView,
  sourceLanguageOf,
  translatedState,
  translationStatus,
  FPS_25,
  type Command,
  type ProjectRows,
  type ProjectState,
  type Translation,
} from "@/core";
import { screenplayPdf, screenplayPdfUnicode } from "@/engine/export/screenplay-pdf";
import type { NotoFonts } from "@/engine/export/pdf-fonts";
import { envelope } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const NEW_PROJECT = "01900000-0000-7000-8000-0000000g1b01";
const NEW_MAIN = "01900000-0000-7000-8000-0000000g1b02";
const ACTOR = "01900000-0000-7000-8000-0000000g1b03";

const CASES = {
  ja: { targets: ["nb", "en"], line: "外に誰かいるの？", t: { nb: "Er det noen der ute?", en: "Is someone out there?" } },
  en: { targets: ["nb", "ja"], line: "Is someone out there?", t: { nb: "Er det noen der ute?", ja: "外に誰かいるの？" } },
  nb: { targets: ["en", "ja"], line: "Er det noen der ute?", t: { en: "Is someone out there?", ja: "外に誰かいるの？" } },
} as const;

function run(s: ProjectState, c: Command): ProjectState {
  const r = applyCommand(s, envelope(c));
  if (!r.ok) throw new Error(r.error.message);
  return r.state;
}
const mainOf = (s: ProjectState) => Object.values(s.productions).find((p) => p.kind === "main")!.id;

/** Fixturen med kildespråket, én endret replikk i kildespråket og oversettelser til to mål. */
function project(src: keyof typeof CASES): ProjectState {
  const c = CASES[src];
  // Testdata: fixturens egne oversettelser fjernes, så kildespråket kan byttes uten konflikt
  const clean = { ...fixture.state, translations: {} };
  let s = sourceLanguageOf(clean) === src
    ? clean
    : run(clean, { type: "SetDialogueLanguage", target: "project", targetId: clean.project.id, language: src });
  const main = mainOf(s);
  const block = scriptView(s, main).flatMap((sc) => sc.blocks).find((b) => b.kind === "dialogue")!;
  s = run(s, { type: "EditBlockText", productionId: main as never, blockId: block.id as never, text: c.line });
  const translations: Record<string, Translation> = { ...s.translations };
  let n = 0;
  for (const language of c.targets) {
    const id = `00000000-0000-7000-8000-0000000f${String(n++).padStart(4, "0")}`;
    translations[id] = { id, revision: 1, blockId: block.id, variantId: null, language, text: (c.t as Record<string, string>)[language]!, basedOnRev: s.blocks[block.id]!.currentRev, status: "approved", removed: false } as Translation;
  }
  return { ...s, translations };
}

function backupOf(s: ProjectState) {
  const patch = diffStates(emptyProjectState(s.project), s);
  const rows = { ...patch.inserts, script_block_revisions: patch.blockRevisions, project: { ...fixture.project, source_language: sourceLanguageOf(s) } } as unknown as ProjectRows;
  const b = makeBackup({ rows, scriptVersions: [], importedDocuments: [], changeLog: [], generationJobs: [], schemaVersion: 91, createdAt: "2026-10-23T12:00:00Z", include: new Set() });
  return JSON.parse(JSON.stringify(b));
}

async function restore(s: ProjectState): Promise<ProjectState> {
  const parsed = parseBackup(backupOf(s), 91);
  const map = await backupIdMap(parsed, NEW_PROJECT, NEW_MAIN);
  const base = emptyProjectState({ id: NEW_PROJECT as never, revision: 1, name: "Gjenopprettet", fps: FPS_25, frameWidth: 1920, frameHeight: 1080, sourceLanguage: "und" } as never);
  const withMain = { ...base, productions: { [NEW_MAIN]: { id: NEW_MAIN as never, revision: 1, kind: "main" as const, name: "Main", parentProductionId: null, fps: FPS_25 } } };
  return restoredState(parsed, map, withMain as ProjectState, ACTOR);
}

const font = (f: string) => readFileSync(`public/fonts/pdf/${f}`).toString("base64");

describe.each(Object.keys(CASES) as (keyof typeof CASES)[])("G-1b rundtur – %s-manus", (src) => {
  const c = CASES[src];
  it("sikkerhetskopi og gjenoppretting beholder kildespråk, kildetekst og begge oversettelser", async () => {
    const s = project(src);
    const r = await restore(s);
    expect(sourceLanguageOf(r)).toBe(src);
    expect(Object.values(r.blocks).some((b) => b.text === c.line)).toBe(true);
    const tr = Object.values(r.translations);
    expect([...new Set(tr.map((t) => t.language))].sort()).toEqual([...c.targets].sort());
    for (const t of tr) expect(t.text).toBe((c.t as Record<string, string>)[t.language]);
    // Kildespråket er aldri et mål
    expect(Object.values(r.translations).some((t) => t.language === src)).toBe(false);
  });

  it("endret kildetekst gir avvik (gjennomgang) for begge målspråkene, og kildeteksten endres ikke av målene", async () => {
    let r = await restore(project(src));
    const main = mainOf(r);
    const block = Object.values(r.blocks).find((b) => b.text === c.line)!;
    for (const l of c.targets) expect(translationStatus(r, main, l).reviewIds.has(block.id)).toBe(false);
    r = run(r, { type: "EditBlockText", productionId: main as never, blockId: block.id as never, text: `${c.line}!` });
    for (const l of c.targets) expect(translationStatus(r, main, l).reviewIds.has(block.id)).toBe(true);
    for (const l of c.targets) expect(blocksOfVariant(translatedState(r, l), block.variantId).length).toBeGreaterThan(0);
    expect(r.blocks[block.id]!.text).toBe(`${c.line}!`);
  });

  it("PTG-modellen og en faktisk manus-PDF lages for kilden og hvert mål", async () => {
    const r = await restore(project(src));
    const main = mainOf(r);
    for (const lang of [src, ...c.targets]) {
      expect(buildInterchange(r, { productionId: main, language: lang }).language.dialogue).toBe(lang);
      const input = exportPaginationInput(translatedState(r, lang), main, { method: "production", includeInactive: false, fillMissing: "new" });
      const check = scriptExportFontCheck(scriptExportTexts(input), "pdf");
      expect(check.blocking).toBe(false);
      const pages = paginate(input).pages;
      const fonts: NotoFonts = {};
      for (const s of check.embedded ?? []) fonts[s] = font(s === "latin" ? "NotoSans-Regular.ttf" : s === "jp" ? "NotoSansJP.ttf" : "NotoSansKR.ttf");
      const bytes = check.embedded?.length ? await screenplayPdfUnicode(pages, { title: "x", language: lang, fonts }) : screenplayPdf(pages, { title: "x" });
      const pdf = new TextDecoder("latin1").decode(bytes);
      expect(pdf.startsWith("%PDF-")).toBe(true);
      if (lang === "ja") {
        expect(check.embedded).toContain("jp");
        expect(pdf).toMatch(/FontFile2/);
      }
    }
  }, 60000);
});
