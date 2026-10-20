/**
 * ML2a: språkbytte nb → en → en-XA → nb med et åpent utkast som overlever (ingen remontering), lang
 * pseudotekst uten vannrett rulling, delvis katalog med reserve, aria og verktøytips, og ingen norsk
 * lekkasje ved første tegning. Mockede serverfunksjoner og lagring (mts-harness.mjs); ingen betalte kall.
 *   bun tests/visual/make-fixture.ts /tmp/visual-fixture.json
 *   node tests/visual/ml2-languages.mjs <baseUrl> /tmp/visual-fixture.json [out]
 */
import { harness } from "./mts-harness.mjs";
const h = harness("/tmp/browser/ml2-languages");
const clip = h.rows.audio_clips.find((c) => c.kind === "dialogue" && c.block_id && !c.removed);
if (!clip) throw new Error("fixture");

const pseudo = (t) => {
  const map = { a: "á", e: "ë", i: "ï", o: "ô", u: "ü", A: "Á", E: "Ë", I: "Ï", O: "Ô", U: "Ü" };
  return `[!! ${t.split(/(\{[^{}]+\})/g).map((p) => (p.startsWith("{") ? p : p.replace(/[aeiouAEIOU]/g, (c) => map[c]).replace(/([a-záëïôü])/gi, "$1$1"))).join("")} !!]`;
};
const EXPECT = {
  nb: { group: "Språk", tip: "Språk i tjenesten", cancel: "Avbryt" },
  en: { group: "Language", tip: "Language of the app", cancel: "Cancel" },
  "en-XA": { group: pseudo("Language"), tip: pseudo("Language of the app"), cancel: pseudo("Cancel") },
};
// Bytter med et programmatisk klikk, så fokus blir i utkastfeltet (ingen blur som lagrer det)
const switchTo = (page, tag) => page.evaluate((t) => document.querySelector(`[data-testid="language-${t}"]`)?.click(), tag);

await h.scenario("ml2-bytte", clip.occurrence_id, "nb", async (page) => {
  h.check((await page.getByTestId("language-en-XA").count()) > 0, "testspråket en-XA er valgbart i utviklingsmodus");
  await page.getByTestId("scene-script").locator(`[data-script-block="${clip.block_id}"] [data-script-text]`).dblclick();
  const dialog = page.getByTestId("record-audio-dialog");
  await dialog.waitFor({ timeout: 8000 });
  const field = page.getByTestId("project-script-language");
  await field.click();
  await field.fill("zh-Hant-TW");
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="project-script-language"]');
    if (el) el.dataset.ml2Mark = "same-node";
  });
  for (const tag of ["en", "en-XA", "nb"]) {
    await switchTo(page, tag);
    await page.waitForTimeout(500);
    const e = EXPECT[tag];
    h.check((await page.evaluate(() => document.documentElement.lang)) === tag, `${tag}: <html lang> følger valget`);
    h.check((await field.inputValue()) === "zh-Hant-TW", `${tag}: åpent utkast beholder teksten`);
    h.check(
      await page.evaluate(() => document.querySelector('[data-testid="project-script-language"]')?.dataset.ml2Mark === "same-node"),
      `${tag}: feltet er ikke montert på nytt`,
    );
    h.check(await dialog.isVisible(), `${tag}: dialogen er fortsatt åpen`);
    h.check(!h.state.commands.some((c) => c.type === "SetDialogueLanguage"), `${tag}: utkastet er ikke lagret i stillhet`);
    const sw = page.getByTestId("language-switch").first();
    h.check((await sw.getAttribute("aria-label")) === e.group, `${tag}: skjermlesertekst på språkvelgeren`);
    h.check((await sw.getAttribute("title")) === e.tip, `${tag}: verktøytips på språkvelgeren`);
    h.check(
      (await dialog.getByRole("button", { name: e.cancel, exact: true }).count()) > 0,
      `${tag}: knappene i den åpne dialogen er på valgt språk`,
    );
    if (tag === "en-XA") {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      h.check(overflow <= 1, `en-XA: lang pseudotekst gir ingen vannrett rulling (${overflow} px)`);
      await page.screenshot({ path: `${h.out}/en-XA.png` });
    }
  }
  await field.blur();
  h.check(
    await h.eventually(() => h.state.commands.some((c) => c.type === "SetDialogueLanguage" && c.language === "zh-Hant-TW")),
    "utkastet lagres først når brukeren forlater feltet",
  );
});

await h.scenario("ml2-reserve", clip.occurrence_id, "nb", async (page) => {
  const r = await page.evaluate(async () => {
    const m = await import("/src/core/i18n/messages.ts");
    const manifest = {
      version: 1, defaultLocale: "nb", maxFallbackDepth: 8,
      languages: [
        { tag: "nb", nativeName: "Norsk", formatLocale: "nb-NO", fallbacks: [], direction: "ltr", complete: true },
        { tag: "en", nativeName: "English", formatLocale: "en-GB", fallbacks: ["nb"], direction: "ltr", complete: true },
        { tag: "de", nativeName: "Deutsch", formatLocale: "de-DE", fallbacks: ["en"], direction: "ltr", complete: false },
      ],
    };
    const missing = [];
    const t = m.createTranslator(manifest, {
      nb: { a: { text: "Lagre" }, b: { text: "Åpne {n}" } },
      en: { a: { text: "Save" }, b: { text: "Open {n}" } },
      de: { a: { text: "Speichern" } },
    }, (e) => missing.push(e));
    return { a: t("a", {}, "de"), b: t("b", { n: 3 }, "de"), missing };
  });
  h.check(r.a === "Speichern", "delvis katalog: oversatt tekst brukes");
  h.check(r.b === "Open 3", "delvis katalog: manglende tekst faller tilbake til reservespråket");
  h.check(r.missing.length === 1 && r.missing[0].fallback === "en", "manglende tekst rapporteres med reservespråk");
});

// Første tegning: lagret engelsk skal aldri vise norsk først
{
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
  const page = await context.newPage();
  await page.goto(h.base + "/personvern", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("animatic:lang", "en"));
  await page.goto(h.base + "/personvern", { waitUntil: "commit" });
  await page.waitForSelector("body", { state: "attached" });
  const early = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    pending: document.documentElement.classList.contains("lang-pending"),
    hidden: getComputedStyle(document.body).visibility === "hidden",
  }));
  h.check(early.lang === "en" && early.pending && early.hidden, "første tegning er skjult til engelsk er satt");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  const late = await page.evaluate(() => ({
    pending: document.documentElement.classList.contains("lang-pending"),
    group: document.querySelector('[data-testid="language-switch"]')?.getAttribute("aria-label"),
  }));
  h.check(!late.pending && late.group === "Language", "siden vises på engelsk etter oppstart");
  await browser.close();
}

await h.finish();
