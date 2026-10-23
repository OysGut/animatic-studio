/** G-1b: språkforslag ved manusimport – metadata, skriftsystem, prosjektets kilde (aldri en påstand). */
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { scriptLanguageHint, suggestImportLanguage } from "@/core/screenplay/import-language";
import { docxLanguage } from "@/engine/import/docx-lines";

const enc = new TextEncoder();
function docx(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) entries[name] = enc.encode(content);
  return zipSync(entries);
}

describe("scriptLanguageHint", () => {
  it("gjenkjenner skriftsystemer med ett dominerende språk", () => {
    expect(scriptLanguageHint("こんにちは、世界")).toBe("ja");
    expect(scriptLanguageHint("你好世界")).toBe("zh");
    expect(scriptLanguageHint("안녕하세요")).toBe("ko");
    expect(scriptLanguageHint("Привет")).toBe("ru");
    expect(scriptLanguageHint("Γεια σου")).toBe("el");
    expect(scriptLanguageHint("مرحبا")).toBe("ar");
  });

  it("latinsk tekst gir ingen konklusjon", () => {
    expect(scriptLanguageHint("INT. KONTOR – DAG")).toBeNull();
    expect(scriptLanguageHint("INT. KONTOR – DAG. Åse går inn.")).toBeNull();
  });
});

describe("suggestImportLanguage", () => {
  it("gyldig metadata vinner over skriftsystemet", () => {
    expect(suggestImportLanguage("こんにちは", "en-US", "nb")).toEqual({ language: "en-US", basis: "metadata", uncertain: true });
  });

  it("skriftsystemet brukes uten metadata", () => {
    expect(suggestImportLanguage("こんにちは", null, "nb")).toEqual({ language: "ja", basis: "script", uncertain: true });
  });

  it("latinsk tekst faller tilbake på prosjektets kildespråk", () => {
    expect(suggestImportLanguage("INT. OFFICE – DAY", null, "ja")).toEqual({ language: "ja", basis: "project", uncertain: true });
  });

  it("ugyldig metadata ignoreres", () => {
    expect(suggestImportLanguage("Bonjour", "ikke en kode!!", "de")).toEqual({ language: "de", basis: "project", uncertain: true });
  });
});

describe("docxLanguage", () => {
  it("leser w:lang fra standardstilene", () => {
    const data = docx({
      "word/styles.xml": `<w:styles><w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="ja-JP"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`,
      "word/document.xml": `<w:document/>`,
    });
    expect(docxLanguage(data)).toBe("ja-JP");
  });

  it("faller tilbake på første w:lang i dokumentet", () => {
    const data = docx({
      "word/styles.xml": `<w:styles/>`,
      "word/document.xml": `<w:document><w:body><w:p><w:r><w:rPr><w:lang w:val="fr-FR"/></w:rPr><w:t>Bonjour</w:t></w:r></w:p></w:body></w:document>`,
    });
    expect(docxLanguage(data)).toBe("fr-FR");
  });

  it("gir null uten språkmerking", () => {
    const data = docx({ "word/document.xml": `<w:document><w:body><w:p/></w:body></w:document>` });
    expect(docxLanguage(data)).toBeNull();
  });
});
