// @vitest-environment node
/**
 * ML4 (B-049): manuseksport (PDF, Word og Fountain) med fire språkversjoner (de, pt-BR, sr-Latn og sr-Cyrl),
 * ufullstendig eksport (norsk reserve eller stopp) og fontkontroll for latinsk og kyrillisk serbisk.
 */
import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import {
  docxLanguageTag,
  exportLanguageDecision,
  exportPaginationInput,
  paginate,
  screenplayFountain,
  scriptExportFontCheck,
  scriptExportTexts,
  scriptView,
  translatedState,
  translationStatus,
  type ProjectState,
  type Translation,
} from "@/core";
import { screenplayDocx } from "@/engine/export/screenplay-docx";
import { screenplayPdf, toWinAnsi } from "@/engine/export/screenplay-pdf";
import { fixture } from "../visual/fixture-state";

const base = fixture.state;
const main = Object.values(base.productions).find((p) => p.kind === "main")!.id;
const view = scriptView(base, main);
const lines = view.flatMap((sc) => sc.blocks).filter((b) => b.kind !== "heading" && b.text.trim());
const [first, second] = [lines[0]!, lines[1]!];
const TEXT: Record<string, [string, string]> = {
  de: ["Hörst du das? Draußen ist jemand.", "Schließ die Tür, Maja."],
  "pt-BR": ["Você ouviu? Há alguém lá fora.", "Feche a porta, Maja — já."],
  "sr-Latn": ["Čuješ li? Neko je napolju, Đorđe.", "Zatvori vrata, Maja, ćuti."],
  "sr-Cyrl": ["Чујеш ли? Неко је напољу, Ђорђе.", "Затвори врата, Маја."],
};

function withTranslations(): ProjectState {
  const translations: Record<string, Translation> = { ...base.translations };
  let n = 0;
  for (const [language, [a, b]] of Object.entries(TEXT))
    for (const [blk, text] of [[first, a], [second, b]] as const) {
      const id = `00000000-0000-7000-8000-0000000e${String(n++).padStart(4, "0")}`;
      translations[id] = { id, revision: 1, blockId: blk.id, variantId: null, language, text, basedOnRev: base.blocks[blk.id]!.currentRev, status: "approved", removed: false } as Translation;
    }
  return { ...base, translations };
}

const OPTS = { method: "production", includeInactive: false, fillMissing: "new" } as const;
function exportsFor(s: ProjectState, language: string) {
  const input = exportPaginationInput(translatedState(s, language), main, OPTS);
  const pdf = screenplayPdf(paginate(input).pages, { title: "Jula på Dovre" });
  const docx = unzipSync(screenplayDocx(input, { title: "Jula på Dovre", language: docxLanguageTag(language) }));
  return { input, pdf: String.fromCharCode(...pdf), docx: strFromU8(docx["word/document.xml"]!), styles: strFromU8(docx["word/styles.xml"]!), fountain: screenplayFountain(input) };
}

/** Samme koding som pdfString i screenplay-pdf.ts (WinAnsi, oktal over 0x7e). */
const pdfHas = (pdf: string, text: string) =>
  pdf.includes(toWinAnsi(text).map((b) => (b === 0x28 || b === 0x29 || b === 0x5c ? "\\" + String.fromCharCode(b) : b < 0x20 || b > 0x7e ? "\\" + b.toString(8).padStart(3, "0") : String.fromCharCode(b))).join(""));

describe("ML4 – eksport med tre eller flere språkversjoner", () => {
  const s = withTranslations();

  it("Fountain og Word har den oversatte teksten for hvert språk, og norsk kilde er uendret", () => {
    for (const [language, [a, b]] of Object.entries(TEXT)) {
      const out = exportsFor(s, language);
      expect(out.fountain).toContain(a);
      expect(out.fountain).toContain(b);
      expect(out.docx).toContain(a.replace(/&/g, "&amp;"));
      expect(out.styles).toContain(`<w:lang w:val="${language}"/>`);
    }
    expect(s.blocks[first.id]!.text).toBe(base.blocks[first.id]!.text);
    expect(exportsFor(s, "nb").styles).toContain('<w:lang w:val="nb-NO"/>');
  });

  it("PDF har teksten for språk fonten dekker (de, pt-BR)", () => {
    for (const language of ["de", "pt-BR"]) {
      const out = exportsFor(s, language);
      expect(scriptExportFontCheck(scriptExportTexts(out.input), "pdf").blocking).toBe(false);
      expect(pdfHas(out.pdf, TEXT[language]![0].slice(0, 12))).toBe(true);
    }
  });

  it("fontkontrollen stopper PDF for latinsk og kyrillisk serbisk, i stedet for å skrive «?»", () => {
    const latn = scriptExportFontCheck(scriptExportTexts(exportsFor(s, "sr-Latn").input), "pdf");
    expect(latn.blocking).toBe(true);
    expect(latn.font).toBe("Courier");
    expect([...latn.unsupported].sort()).toEqual(["Č", "Đ", "ć", "đ"].sort());
    const cyrl = scriptExportFontCheck(scriptExportTexts(exportsFor(s, "sr-Cyrl").input), "pdf");
    expect(cyrl.blocking).toBe(true);
    expect(cyrl.unsupported.slice(0, 2)).toEqual(["Ч", "у"]);
    expect(cyrl.unsupported.length).toBeLessThanOrEqual(12);
    expect(cyrl.unsupportedCount).toBeGreaterThan(12);
  });

  it("Word (Courier New) og Fountain dekker begge serbiske skriftene", () => {
    for (const language of ["sr-Latn", "sr-Cyrl"]) {
      const texts = scriptExportTexts(exportsFor(s, language).input);
      expect(scriptExportFontCheck(texts, "docx")).toMatchObject({ blocking: false, unsupportedCount: 0 });
      expect(scriptExportFontCheck(texts, "fountain")).toMatchObject({ blocking: false, font: null });
    }
  });

  it("Word varsler (men stopper ikke) for tegn utenfor Courier New", () => {
    const r = scriptExportFontCheck(["Maja 日本"], "docx");
    expect(r).toMatchObject({ blocking: false, unsupported: ["日", "本"], unsupportedCount: 2 });
  });

  it("ufullstendig oversettelse: eksport krever valg; stopp gir ingen fil, reserve gir norsk der det mangler", () => {
    const status = translationStatus(s, main, "de");
    expect(status.missingIds.size).toBeGreaterThan(0);
    expect(exportLanguageDecision(status, undefined).kind).toBe("needs-choice");
    expect(exportLanguageDecision(status, "stop").kind).toBe("stopped");
    expect(exportLanguageDecision(status, "fallback").kind).toBe("fallback");
    const norwegian = lines[2]!.text;
    expect(exportsFor(s, "de").fountain).toContain(norwegian);
  });
});
