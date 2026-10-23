// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  countGraphemes,
  countWords,
  speechRateFor,
  speechSeconds,
} from "@/core/language/text-metrics";
import { parseFountain } from "@/core/screenplay/fountain";
import { parseHeading } from "@/core/screenplay/parse";
import { headingWords } from "@/core/screenplay/heading-keywords";
import { wrapPosterText } from "@/core/presentation/metrics";
import { filterGlobalAssets } from "@/core/library/global";
import { paperForCountry, resolveSettings, scriptFormatForCountry } from "@/core/settings/resolve";

describe("G-3.1 ordtelling med Intl.Segmenter", () => {
  it("japansk uten mellomrom gir flere ord", () => {
    expect(countWords("今日はいい天気ですね", "ja")).toBeGreaterThan(2);
  });
  it("kinesisk uten mellomrom gir flere ord", () => {
    expect(countWords("我们明天去北京", "zh")).toBeGreaterThan(2);
  });
  it("thai uten mellomrom gir flere ord", () => {
    expect(countWords("สวัสดีครับวันนี้อากาศดี", "th")).toBeGreaterThan(2);
  });
  it("arabisk med mellomrom teller ordene", () => {
    expect(countWords("مرحبا كيف حالك اليوم", "ar")).toBe(4);
  });
  it("engelsk teller som før og ignorerer tegnsetting", () => {
    expect(countWords("Hello, world — again!", "en")).toBe(3);
  });
  it("grafemer: emoji og aksenter er ett tegn, mellomrom telles ikke", () => {
    expect(countGraphemes("e\u0301 ab")).toBe(3);
  });
});

describe("G-3.1 talehastighet per språk", () => {
  it("ja, zh og ko måles i tegn per sekund, andre i ord per minutt", () => {
    expect(speechRateFor("ja").unit).toBe("cps");
    expect(speechRateFor("zh-Hant").unit).toBe("cps");
    expect(speechRateFor("ko").unit).toBe("cps");
    expect(speechRateFor("en").unit).toBe("wpm");
    expect(speechRateFor("ar").unit).toBe("wpm");
  });
  it("japansk: 14 tegn ved 7 tegn/s er 2 sekunder", () => {
    expect(speechSeconds("今日はいい天気ですね本当に良", "ja")).toBeCloseTo(2, 5);
  });
  it("engelsk: 150 ord/min gir 2 sekunder for 5 ord", () => {
    expect(speechSeconds("one two three four five", "en")).toBeCloseTo(2, 5);
  });
  it("prosjektets overstyring vinner", () => {
    expect(speechSeconds("一二三四", "ja", { ja: { unit: "cps", value: 4 } })).toBeCloseTo(1, 5);
  });
});

describe("G-3.1 plakattekst og søk", () => {
  it("japansk plakattekst brytes i flere linjer uten mellomrom", () => {
    const lines = wrapPosterText("今日はいい天気ですね今日はいい天気ですね", "sans", 40, 60);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe("今日はいい天気ですね今日はいい天気ですね");
  });
  it("søk i det globale biblioteket finner japanske ord", () => {
    const a = { id: "1", name: "東京タワー", description: "", kind: "location", categories: [], tags: [], archived: false };
    const hit = filterGlobalAssets([a as never], { query: "東京", kind: "all", category: null, tag: null, includeArchived: false } as never);
    expect(hit.length).toBe(1);
  });
});

describe("G-3.2 sceneoverskrifter per språk", () => {
  it("tvungen overskrift med punktum virker alltid", () => {
    const r = parseFountain(".KJØKKENET – NATT\n\nHun går.\n", { sourceLanguage: "ja" });
    expect(r.parsed.scenes.length).toBe(1);
  });
  it("fransk, spansk, italiensk, svensk og russisk innledning gjenkjennes", () => {
    for (const h of ["INTÉRIEUR. CUISINE - NUIT", "EXTERIOR. CALLE - DÍA", "ESTERNO. PIAZZA - GIORNO", "INTERIÖR. KÖK - NATT", "ИНТ. КУХНЯ - НОЧЬ"]) {
      expect(parseHeading(h).intExt).not.toBe("");
    }
  });
  it("Fountain tolker dansk og tysk uten tvang", () => {
    const r = parseFountain("UDE. GADE - DAG\n\nHan løber.\n\nINNEN. KÜCHE - NACHT\n\nSie sitzt.\n", { sourceLanguage: "da" });
    expect(r.parsed.scenes.length).toBe(2);
  });
  it("kildespråket kommer først, prosjektets egne ord deretter", () => {
    const w = headingWords("ja", ["SET."]);
    expect(w[0]).toBe("○");
    expect(w.indexOf("SET.")).toBeLessThan(w.indexOf("INT./EXT."));
  });
  it("prosjektets egne ord gjenkjennes i Fountain", () => {
    const r = parseFountain("STUDIO. SCENE A\n\nTekst.\n", { headingWords: ["STUDIO."] });
    expect(r.parsed.scenes.length).toBe(1);
  });
});

describe("G-3.3/4/7 innstillingshierarki og landstandard", () => {
  it("Letter for USA og Canada, A4 for Norge og Japan", () => {
    expect(paperForCountry("US")).toBe("Letter");
    expect(paperForCountry("CA")).toBe("Letter");
    expect(paperForCountry("NO")).toBe("A4");
    expect(paperForCountry("JP")).toBe("A4");
    expect(scriptFormatForCountry("US").kind).toBe("us_letter_courier12");
    expect(scriptFormatForCountry("DE").kind).toBe("a4_europe");
  });
  it("prosjekt over arbeidsgruppe over bruker over land, med kilde", () => {
    const r = resolveSettings({
      user: { currency: "NOK", timeZone: "Europe/Oslo" },
      workspace: { currency: "EUR", paper: "Letter" },
      project: { currency: "JPY" },
      country: "NO",
    });
    expect(r.currency).toEqual({ value: "JPY", source: "project" });
    expect(r.paper).toEqual({ value: "Letter", source: "workspace" });
    expect(r.timeZone).toEqual({ value: "Europe/Oslo", source: "user" });
    expect(r.units).toEqual({ value: "metric", source: "country" });
    expect(r.projectCode.source).toBe("default");
  });
});
