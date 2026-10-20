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
    const dialogText = await dialog.innerText();
    if (tag !== "nb") h.check(/\((nb|en|[a-z]{2}(-[A-Z]{2})?)\)/.test(dialogText) && !/\(nnbb\)/.test(dialogText) && !/norsk bokmål/.test(dialogText), `${tag}: språknavn på engelsk og koden urørt i dialogen`);
    h.check(!h.state.commands.some((c) => c.type === "SetDialogueLanguage"), `${tag}: utkastet er ikke lagret i stillhet`);
    const sw = page.getByTestId("language-switch").first();
    h.check((await sw.getAttribute("aria-label")) === e.group, `${tag}: skjermlesertekst på språkvelgeren`);
    h.check((await sw.getAttribute("title")) === e.tip, `${tag}: verktøytips på språkvelgeren`);
    h.check(
      (await dialog.getByRole("button", { name: e.cancel, exact: true }).count()) > 0,
      `${tag}: knappene i den åpne dialogen er på valgt språk`,
    );
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    // ML2d: ingen vannrett rulling i sceneeditoren med åpen opptaksdialog, heller ikke på en-XA
    h.check(overflow <= 1, `${tag}: ingen vannrett rulling med åpen opptaksdialog (${overflow} px)`);
    if (tag === "en-XA") await page.screenshot({ path: `${h.out}/en-XA.png` });
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


// ML2b: skall og konto er flyttet til nøkler. Samme tekst på nb og en, og ingen vannrett rulling på en-XA.
const SHELL = [
  { name: "prosjektliste", path: "/" },
  { name: "konto", path: "/konto" },
  { name: "prosjektside", path: h.P },
  { name: "personvern", path: "/personvern" },
  { name: "invitasjon", path: "/invitasjon" },
  // ML2c: manusflatene
  { name: "manus", path: `${h.P}/manus` },
  { name: "story-lab", path: `${h.P}/storylab` },
  { name: "manusutforsker", path: `/manusutforsker/${h.P.split("/").pop()}` },
  { name: "sceneeditor-manus", path: `${h.P}/scene?scene=${clip.occurrence_id}` },
  // ML2d: sceneeditoren med animasjonsfanen
  { name: "sceneeditor-animasjon", path: `${h.P}/scene?scene=${clip.occurrence_id}&fane=animation` },
  // ML2e: montering, lyd og eksport (plakat ligger under utgivelse, lydbiblioteket under bibliotek)
  { name: "montering", path: `${h.P}/montering` },
  { name: "utgivelse", path: `${h.P}/utgivelse` },
  { name: "bibliotek", path: `${h.P}/bibliotek` },
];
await h.scenario("ml2b-skall", clip.occurrence_id, "nb", async (page) => {
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).split("\n")[0].slice(0, 90)));
  for (const tag of ["nb", "en", "en-XA"]) {
    for (const s of SHELL) {
      errs.length = 0;
      await page.evaluate((l) => localStorage.setItem("animatic:lang", l), tag);
      await page.goto(h.base + s.path, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      const r = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        text: document.body.innerText,
        wide: [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && el.children.length === 0).slice(0, 5).map((el) => el.getAttribute("data-testid") || el.tagName.toLowerCase()),
      }));
      h.check(r.lang === tag, `${s.name} ${tag}: <html lang> stemmer`);
      h.check(errs.length === 0, `${s.name} ${tag}: ingen kjørefeil eller hydreringsavvik (${errs.join(" | ")})`);
      h.check(r.overflow <= 1, `${s.name} ${tag}: ingen vannrett rulling (${r.overflow} px${r.wide.length ? `: ${r.wide.join(", ")}` : ""})`);
      h.check(!/Unknown translation key|Invalid parameters for key|Legacy expression/.test(r.text), `${s.name} ${tag}: ingen nøkkelfeil i teksten`);
      if (tag === "en-XA") {
        h.check(r.text.includes("[!! "), `${s.name} en-XA: pseudotekst vises`);
        h.check(!/\((nnbb|ëënn|nnnn|ffrr)(-[A-Z]+)?\)/.test(r.text), `${s.name} en-XA: språkkoder er ikke pseudo-oversatt`);
        h.check(!/Har replikk i manuset|Står i sceneoverskriften|Legg til|Ingen lag|Opptak|Forhåndsvisning|Nabo-scener/.test(r.text), `${s.name} en-XA: ingen norske tekster fra sceneeditoren`);
        await page.screenshot({ path: `${h.out}/ml2b-${s.name}-en-XA.png` });
      }
      if (tag === "en") h.check(!/\b(Avbryt|Lagre|Logg ut|Min konto|Prosjekter)\b/.test(r.text), `${s.name} en: ingen norske skallord`);
    }
  }
});

// ML2e: eksportdialogene og lydvinduet på en-XA uten vannrett rulling og uten norsk
await h.scenario("ml2e-eksport", clip.occurrence_id, "en-XA", async (page) => {
  const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const dialogs = [
    { name: "alfaeksport", path: `${h.P}/scene?scene=${clip.occurrence_id}`, open: "alpha-export-open", dialog: "alpha-export-dialog" },
    { name: "filmeksport", path: `${h.P}/montering`, open: "assembly-export-open", dialog: null },
  ];
  for (const d of dialogs) {
    await page.goto(h.base + d.path, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const btn = page.getByTestId(d.open).first();
    if (!(await btn.isEnabled().catch(() => false))) { console.log(`  MERK ${d.name}: knappen er ikke tilgjengelig i fixturen`); continue; }
    await btn.click();
    await page.waitForTimeout(700);
    const box = d.dialog ? page.getByTestId(d.dialog) : page.getByRole("dialog").first();
    h.check(await box.isVisible(), `${d.name} en-XA: dialogen åpnes`);
    const text = await box.innerText();
    h.check(text.includes("[!! "), `${d.name} en-XA: pseudotekst i dialogen`);
    h.check(!/\b(Avbryt|Eksporter|Lagre|Velg|Start)\b/.test(text), `${d.name} en-XA: ingen norske ord i dialogen`);
    const o = await noScroll();
    h.check(o <= 1, `${d.name} en-XA: ingen vannrett rulling (${o} px)`);
    await page.screenshot({ path: `${h.out}/ml2e-${d.name}-en-XA.png` });
  }
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
