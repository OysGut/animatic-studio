/**
 * ML3 (B-049): N manusspråk per prosjekt – språkversjoner (legg til, gi nytt navn, fjern), valg av
 * språkversjon i manuset, manusutforskeren, linjekoblingene og eksporten, og eksplisitt valg mellom norsk
 * reserve og stopp for ufullstendig oversettelse. Mockede serverfunksjoner; ingen AI; ingenting lagres.
 *   bun tests/visual/make-mts-fixture.ts /tmp/claude-0/mts-fixture.json
 *   ENV_FILE=.env [UI_LANG=en] node tests/visual/ml3-script-languages.mjs http://127.0.0.1:8080 /tmp/claude-0/mts-fixture.json
 */
import { harness } from "./mts-harness.mjs";
import { uiLang } from "./ui-lang.mjs";

const h = harness("/tmp/browser/c/ml3");
const pid = h.fx.project.id;
const occ = h.rows.scene_occurrences.find((o) => o.active && h.rows.script_blocks.filter((b) => b.variant_id === o.variant_id && b.kind !== "heading" && !b.removed).length >= 2);
if (!occ) throw new Error("Missing scene");
const blocks = h.rows.script_blocks.filter((b) => b.variant_id === occ.variant_id && b.kind !== "heading" && !b.removed);
const id = (n) => `00000000-0000-7000-8000-0000000066${String(n).padStart(2, "0")}`;
const DE = id(1), PT = id(2);
h.rows.language_versions = [
  { id: DE, project_id: pid, language: "de", source_language: "nb", name: "Deutsch", status: "active", removed: false, revision: 1 },
  { id: PT, project_id: pid, language: "pt-BR", source_language: "nb", name: "Português", status: "active", removed: false, revision: 1 },
];
// Bare én linje er oversatt til tysk: oversettelsen er ufullstendig.
h.rows.translations = [{ id: id(10), project_id: pid, revision: 1, block_id: blocks[0].id, variant_id: null, language: "de", text: "Deutscher Satz", based_on_rev: blocks[0].current_rev, status: "approved", removed: false, language_version_id: DE }];
h.rows.translation_lines = [];
h.rows.translation_line_links = [];
const norwegian = Object.fromEntries(blocks.map((b) => [b.id, b.text]));

/** Klikker et element i verktøylinjen; ligger det i «Flere»-menyen, åpnes menyen først. */
async function clickTool(page, testId) {
  const el = page.getByTestId(testId).first();
  if (!(await el.isVisible())) await page.getByRole("button", { name: /^(Mer|More|\[!! Mḿôôrëë)/ }).first().click();
  await page.getByTestId(testId).first().click();
}

const langs = process.env.UI_LANG ? [uiLang("nb")] : ["nb", "en"];
for (const lang of langs) {
  await h.scenario(`ml3-${lang}`, occ.id, lang, async (page) => {
    await page.goto(h.base + h.P + "/manus", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const select = page.getByTestId("script-language-select");
    const values = await select.locator("option").evaluateAll((os) => os.map((o) => o.value));
    h.check(values[0] === "nb" && values.includes("de") && values.includes("pt-BR"), `språkvelgeren viser norsk kilde og registrerte språkversjoner (${values.join(",")})`);

    // Språkversjoner: legg til (kanonisk kode), avvis norsk, gi nytt navn og fjern
    await clickTool(page, "language-versions-open");
    const dialog = page.getByTestId("language-versions-dialog");
    await dialog.waitFor();
    h.check(await dialog.getByTestId("language-version-de").count() === 1, "registrerte språkversjoner listes");
    await dialog.getByTestId("language-version-new-language").fill("nb");
    await dialog.getByTestId("language-version-add").click();
    h.check(await dialog.getByTestId("language-version-error").count() === 1 && !h.state.commands.some((c) => c.type === "AddLanguageVersion"), "norsk kan ikke legges til som målspråk");
    await dialog.getByTestId("language-version-new-language").fill("sr-latn");
    await dialog.getByTestId("language-version-new-name").fill("Srpski");
    await dialog.getByTestId("language-version-add").click();
    await h.eventually(() => h.state.commands.some((c) => c.type === "AddLanguageVersion"), 4000);
    const add = h.state.commands.find((c) => c.type === "AddLanguageVersion");
    h.check(add?.language === "sr-Latn" && add?.name === "Srpski", "ny språkversjon får kanonisk BCP-47-kode (sr-Latn)");
    await dialog.getByTestId("language-version-name-de").fill("Tysk");
    await dialog.getByTestId("language-version-rename-de").click();
    await h.eventually(() => h.state.commands.some((c) => c.type === "UpdateLanguageVersion"), 4000);
    h.check(h.state.commands.find((c) => c.type === "UpdateLanguageVersion")?.name === "Tysk", "nytt navn sendes som egen kommando");
    await dialog.getByTestId("language-version-remove-pt-BR").click();
    await h.eventually(() => h.state.commands.some((c) => c.type === "SetLanguageVersionRemoved"), 4000);
    h.check(h.state.commands.find((c) => c.type === "SetLanguageVersionRemoved")?.removed === true, "fjerning er en angrebar kommando");
    h.check(!h.state.commands.some((c) => c.type === "SetTranslationsRemoved"), "fjerning sletter ingen oversettelser");
    await dialog.screenshot({ path: `${h.out}/versions-${lang}.png` });
    await page.keyboard.press("Escape");

    // Velg tysk i manuset; eksporten krever eksplisitt valg
    await select.selectOption("de");
    await page.waitForTimeout(400);
    await clickTool(page, "script-export-open");
    const exportOpen = page.getByTestId("script-export-run");
    await exportOpen.waitFor({ timeout: 5000 });
    const incomplete = page.getByTestId("export-language-incomplete");
    h.check(await incomplete.count() === 1, "ufullstendig oversettelse vises i eksporten");
    h.check(await exportOpen.isDisabled(), "eksport er sperret uten valg");
    h.check(await page.getByTestId("export-language-select").inputValue() === "de", "eksporten viser valgt språkversjon");
    await page.getByTestId("export-language-stop").check();
    h.check(await page.getByTestId("export-language-stopped").count() === 1 && await exportOpen.isDisabled(), "«stopp» lager ingen fil");
    await page.getByTestId("export-language-fallback").check();
    h.check(!(await exportOpen.isDisabled()), "norsk reserve må velges eksplisitt før eksport");
    await page.screenshot({ path: `${h.out}/export-${lang}.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    h.check(overflow <= 0, `ingen vannrett rulling (${overflow} px)`);
    await page.keyboard.press("Escape");

    // Linjekoblinger: språkversjonen velges i dialogen
    await page.locator(`[data-block="${blocks[0].id}"]`).first().click();
    const linksOpen = page.getByTestId("line-links-open");
    if (await linksOpen.count()) {
      await linksOpen.click();
      const lsel = page.getByTestId("line-links-language");
      const lvals = await lsel.locator("option").evaluateAll((os) => os.map((o) => o.value));
      h.check(!lvals.includes("nb") && lvals.includes("de"), "linjekoblinger velger bare målspråk");
      await lsel.selectOption("sr-Latn");
      h.check(await lsel.inputValue() === "sr-Latn", "språkversjon kan byttes i linjekoblingene");
      await page.keyboard.press("Escape");
    } else h.check(false, "linjekoblinger tilgjengelig for valgt linje");

    // Manusutforskeren: eget språkvalg, bare lesing
    await page.goto(`${h.base}/manusutforsker/${pid}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const esel = page.getByTestId("script-explorer-language");
    await esel.waitFor({ timeout: 8000 });
    await esel.selectOption("de");
    h.check(await page.getByText("Deutscher Satz").count() > 0, "manusutforskeren viser valgt språkversjon");
    await page.screenshot({ path: `${h.out}/explorer-${lang}.png` });

    // Norsk kilde er aldri endret
    h.check(!h.state.commands.some((c) => ["EditBlockText", "UpdateBlocks", "RemoveBlock"].includes(c.type)), "ingen endring av norsk manus");
    h.check(blocks.every((b) => norwegian[b.id] === b.text), "norsk kilde uendret");
  });
}
await h.finish();
