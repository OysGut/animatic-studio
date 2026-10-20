import { afterEach, describe, expect, it } from "vitest";
import { L, getLanguage, getUiLanguage, localized, locale, pseudoText, setLanguage, tm } from "@/core";
import { CodedError, SERVER_ERRORS, decodeServerError, serverError, serverErrorText } from "@/core/i18n/server-errors";
import { t } from "@/core/i18n/keyed";
import nbCatalog from "@/core/i18n/locales/nb.json";
import enCatalog from "@/core/i18n/locales/en.json";
import xaCatalog from "@/core/i18n/locales/en-XA.json";

afterEach(() => setLanguage("nb"));

describe("ML2a testspråk en-XA", () => {
  it("bygges fra engelsk, mens nb og en er uendret", () => {
    expect(L("Lagre", "Save")).toBe("Lagre");
    setLanguage("en");
    expect(L("Lagre", "Save")).toBe("Save");
    setLanguage("en-XA");
    expect(L("Lagre", "Save")).toBe(pseudoText("Save"));
    expect(getUiLanguage()).toBe("en-XA");
    expect(getLanguage()).toBe("en");
    expect(locale()).toBe("en-GB");
  });
  it("pseudoteksten er lik inventarets og beholder plassholdere", () => {
    const en = enCatalog as Record<string, { text: string | null }>;
    const xa = xaCatalog as Record<string, { text: string | null }>;
    const keys = Object.keys(en).filter((k) => en[k]?.text).slice(0, 500);
    expect(keys.length).toBe(500);
    for (const k of keys) expect(pseudoText(en[k]!.text!)).toBe(xa[k]!.text);
    expect(pseudoText("Hi {name}")).toContain("{name}");
  });
  it("faste oppslag og serverteksten følger testspråket", () => {
    const labels = localized({ a: ["Scene", "Scene"] as const });
    setLanguage("en-XA");
    expect(labels.a).toBe(pseudoText("Scene"));
    expect(tm("helt ukjent tekst")).toBe("helt ukjent tekst");
  });
  it("t() bruker visningsspråket", () => {
    const [key, msg] = Object.entries(nbCatalog as Record<string, { text: string | null; executable?: boolean; parameters?: unknown[] }>).find(
      ([, m]) => m.executable !== false && m.text && !/\{/.test(m.text) && !(m.parameters?.length),
    )!;
    expect(t(key)).toBe(msg.text);
    setLanguage("en-XA");
    expect(t(key)).toBe(t(key, {}, "en-XA"));
    expect(t(key)).not.toBe(msg.text);
  });
});

describe("ML2a stabile serverfeil", () => {
  it("serveren lager norsk melding med kode og parametere", () => {
    const e = serverError("text_too_long", { max: 500 });
    expect(e).toBeInstanceOf(CodedError);
    expect(e.message).toBe("Teksten er for lang (maks 500 tegn)");
    expect(e.code).toBe("text_too_long");
  });
  it("klienten viser koden på valgt språk", () => {
    const e = serverError("text_too_long", { max: 500 });
    expect(serverErrorText(e, "en")).toBe("The text is too long (max 500 characters)");
    expect(serverErrorText(e, "nb")).toBe("Teksten er for lang (maks 500 tegn)");
    expect(serverErrorText(e, "en-XA")).toBe(pseudoText("The text is too long (max 500 characters)"));
  });
  it("gamle rene norske meldinger kjennes igjen", () => {
    expect(decodeServerError("Ugyldig kommando")).toEqual({ code: "invalid_command", params: {} });
    expect(decodeServerError("Teksten er for lang (maks 12 tegn).")).toEqual({ code: "text_too_long", params: { max: "12" } });
    expect(serverErrorText({ message: "Ugyldige revisjoner" }, "en")).toBe("Invalid revisions");
  });
  it("ukjente meldinger går gjennom tm som før", () => {
    setLanguage("nb");
    expect(serverErrorText(new Error("Noe helt annet"), "nb")).toBe("Noe helt annet");
  });
  it("koder er unike og har begge språk", () => {
    for (const [code, [nb, en]] of Object.entries(SERVER_ERRORS)) {
      expect(code).toMatch(/^[a-z_]+$/);
      expect(nb && en).toBeTruthy();
    }
  });
});
