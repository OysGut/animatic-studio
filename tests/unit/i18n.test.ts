/**
 * Norsk og engelsk (DEC-0081, REQ-0629/0630): språkvalget, tekstpar, faste oppslag, meldinger fra serveren –
 * og at all brukervendt tekst i src/ har engelsk (kontrollen i scripts/i18n/check.mjs).
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  L,
  LANGUAGE_LABEL,
  PRODUCTION_KIND_LABEL,
  collation,
  getLanguage,
  languageWord,
  locale,
  localized,
  onLanguageChange,
  setLanguage,
  tm,
} from "@/core";

afterEach(() => setLanguage("nb"));

describe("språkvalg", () => {
  it("starter på norsk og bytter til engelsk", () => {
    expect(getLanguage()).toBe("nb");
    expect(L("Lagre", "Save")).toBe("Lagre");
    setLanguage("en");
    expect(L("Lagre", "Save")).toBe("Save");
    expect(locale()).toBe("en-GB");
    expect(collation()).toBe("en");
  });

  it("varsler ved bytte, og ignorerer ukjente språk", () => {
    let n = 0;
    const off = onLanguageChange(() => n++);
    setLanguage("en");
    setLanguage("en");
    setLanguage("xx" as never);
    off();
    setLanguage("nb");
    expect(n).toBe(1);
  });

  it("faste oppslag svarer på gjeldende språk, også via Object.entries", () => {
    const m = localized({ a: ["Eier", "Owner"], b: ["Leser", "Viewer"] });
    expect(m.a).toBe("Eier");
    setLanguage("en");
    expect(m.a).toBe("Owner");
    expect(Object.entries(m)).toEqual([
      ["a", "Owner"],
      ["b", "Viewer"],
    ]);
    expect(PRODUCTION_KIND_LABEL.main).toBe("Main film");
    expect(LANGUAGE_LABEL["nb"]).toBe("Norwegian");
    expect(languageWord("nb")).toBe("Norwegian");
    setLanguage("nb");
    expect(languageWord("en")).toBe("engelsk");
  });
});

describe("meldinger fra serveren (tm)", () => {
  it("er uendret på norsk", () => {
    expect(tm("Ugyldig notat")).toBe("Ugyldig notat");
  });
  it("oversettes på engelsk, også med tall og flere setninger", () => {
    setLanguage("en");
    expect(tm("Ugyldig notat")).toBe("Invalid note");
    expect(tm("Notatet er for langt (høyst 2000 tegn)")).toBe(
      "The note is too long (at most 2,000 characters)",
    );
    expect(tm("Ugyldig notat. Uendret")).toBe("Invalid note. Unchanged");
    expect(tm("Helt ukjent tekst")).toBe("Helt ukjent tekst");
  });
});

describe("kontrollen av brukervendt tekst", () => {
  it("finner ingen norsk tekst uten engelsk i src/", () => {
    const out = execFileSync("node", ["scripts/i18n/check.mjs"], { encoding: "utf8" });
    expect(out.trim().split("\n").pop()).toBe("0 tekster uten engelsk i 0 filer");
  }, 60_000);
});
