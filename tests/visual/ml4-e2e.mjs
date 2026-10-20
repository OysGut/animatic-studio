/**
 * ML4 (B-049) ende-til-ende: opprett prosjekt → legg til tre språkversjoner (de, pt-BR, sr-Latn) → koble
 * linjer → endre norsk kilde («må gjennomgås») → eksporter (norsk reserve, Fountain; fontkontroll for PDF)
 * → ta sikkerhetskopi → gjenopprett. Mocket backend: kommandoene lagres i de mockede radene, så
 * sikkerhetskopien inneholder det som ble gjort i økten. Ingen AI, ingen betalte kall.
 *   ENV_FILE=.env [UI_LANG=en] node tests/visual/ml4-e2e.mjs http://127.0.0.1:8080 /tmp/claude-0/mts-fixture.json [out]
 */
import { writeFileSync } from "node:fs";
import { harness } from "./mts-harness.mjs";
import { uiLang } from "./ui-lang.mjs";

const h = harness("/tmp/browser/c/ml4-e2e");
const pid = h.fx.project.id;
const NEW_PROJECT = "00000000-0000-7000-8000-0000000d0001";
const occ = h.rows.scene_occurrences.find((o) => o.active && h.rows.script_blocks.filter((b) => b.variant_id === o.variant_id && b.kind !== "heading" && !b.removed).length >= 3);
if (!occ) throw new Error("Missing scene");
const blocks = h.rows.script_blocks.filter((b) => b.variant_id === occ.variant_id && b.kind !== "heading" && !b.removed);
const LANGS = ["de", "pt-BR", "sr-Latn"];
const TEXT = { de: "Hörst du das?", "pt-BR": "Você ouviu?", "sr-Latn": "Čuješ li, Đorđe?" };
const id = (n) => `00000000-0000-7000-8000-0000000d${String(n).padStart(4, "0")}`;
const original = blocks.map((b) => ({ ...b }));
const baseRevisions = h.rows.script_block_revisions.map((r) => ({ ...r }));

function seed() {
  for (const [i, b] of blocks.entries()) Object.assign(b, original[i]);
  h.rows.script_block_revisions = baseRevisions.map((r) => ({ ...r }));
  let n = 100;
  h.rows.language_versions = [];
  h.rows.translations = [];
  h.rows.translation_lines = [];
  h.rows.translation_line_links = [];
  for (const lang of LANGS) {
    h.rows.translations.push({ id: id(n++), project_id: pid, revision: 1, block_id: blocks[0].id, variant_id: null, language: lang, text: TEXT[lang], based_on_rev: blocks[0].current_rev, status: "approved", removed: false });
    h.rows.translation_lines.push({ id: id(n++), project_id: pid, revision: 1, variant_id: occ.variant_id, language: lang, ord: 2, kind: "action", text: `${TEXT[lang]} (2)`, removed: false });
  }
}

/** Lagrer kommandoene i de mockede radene, slik backend ville gjort. */
function persist(cmd) {
  if (cmd?.type === "AddLanguageVersion")
    h.rows.language_versions.push({ id: cmd.versionId, project_id: pid, language: cmd.language, source_language: "nb", name: cmd.name, status: cmd.status ?? "active", removed: false, revision: 1 });
  if (cmd?.type === "SetLineLink") {
    const f = cmd.fields;
    const version = h.rows.language_versions.find((v) => v.language === f.language)?.id;
    h.rows.translation_line_links.push({ id: cmd.linkId, project_id: pid, revision: 1, variant_id: f.variantId, language: f.language, source_block_ids: f.sourceBlockIds, target_translation_ids: f.targetTranslationIds, origin: f.origin, confidence: f.confidence, reason: f.reason, removed: false, ...(version ? { language_version_id: version } : {}) });
  }
  if (cmd?.type === "EditBlockText") {
    const b = h.rows.script_blocks.find((x) => x.id === cmd.blockId);
    if (b) {
      Object.assign(b, { text: cmd.text, current_rev: (b.current_rev ?? 1) + 1 });
      h.rows.script_block_revisions.push({ project_id: pid, block_id: b.id, rev: b.current_rev, text: cmd.text, author: "00000000-0000-7000-8000-a11ce0000001", created_at: "2026-10-20T12:00:00.000Z" });
    }
  }
}

let seen = 0;
/** Tar med nye kommandoer fra den mockede runCommand i radene. */
function sync() {
  for (; seen < h.state.commands.length; seen++) persist(h.state.commands[seen]);
  return true;
}
const done = (cond, ms) => h.eventually(() => sync() && cond(), ms);

const langs = process.env.UI_LANG ? [uiLang("nb")] : ["nb", "en"];
for (const lang of langs) {
  seed();
  seen = 0;
  await h.scenario(`ml4-${lang}`, occ.id, lang, async (page) => {
    let restored = null;
    let created = 0;
    await page.route("**/_serverFn/**", async (route) => {
      let name = "";
      try { name = JSON.parse(Buffer.from(decodeURIComponent(new URL(route.request().url()).pathname.split("/_serverFn/")[1]), "base64url").toString()).export; } catch { /* ukjent */ }
      const body = route.request().postData() ?? "";
      if (/^restoreBackup/.test(name)) {
        restored = body;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { ok: true }, context: {} }) });
      }
      return route.fallback();
    });
    await page.route("**/rest/v1/rpc/create_project", (route) => { created++; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(NEW_PROJECT) }); });

    // 1. Opprett prosjekt
    await page.goto(h.base + "/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Nytt prosjekt|New project/ }).click();
    await page.locator("#new-project").fill("Dovre på fire språk");
    await page.getByTestId("new-project-create").click();
    h.check(await h.eventually(() => created === 1, 8000), "1 prosjektet opprettes");

    // 2. Tre språkversjoner
    await page.goto(h.base + h.P + "/manus", { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const tool = async (testId) => {
      if (!(await page.getByTestId(testId).first().isVisible())) await page.getByRole("button", { name: /^(Mer|More)/ }).first().click();
      await page.getByTestId(testId).first().click();
    };
    await tool("language-versions-open");
    const dialog = page.getByTestId("language-versions-dialog");
    for (const [i, tag] of ["de", "pt-br", "sr-latn"].entries()) {
      await dialog.getByTestId("language-version-new-language").fill(tag);
      await dialog.getByTestId("language-version-new-name").fill(`Versjon ${i + 1}`);
      await dialog.getByTestId("language-version-add").click();
      await page.waitForTimeout(300);
    }
    await done(() => h.rows.language_versions.length === 3, 5000);
    h.check(h.rows.language_versions.map((v) => v.language).join(",") === "de,pt-BR,sr-Latn", "2 tre språkversjoner med kanonisk kode (de, pt-BR, sr-Latn)");
    await page.keyboard.press("Escape");

    // 3. Endre norsk kilde (i inspektøren), så «må gjennomgås» vises for alle tre språkene
    await page.locator(`[data-block="${blocks[0].id}"]`).first().click();
    const tab = page.getByTestId("script-tab-inspector");
    if (await tab.count()) await tab.click();
    const editor = page.getByRole("textbox", { name: /^(Tekst|Text)$/ }).first();
    await editor.waitFor({ timeout: 5000 });
    await editor.fill(`${original[0].text} – endret`);
    await editor.press("Control+Enter");
    h.check(await done(() => h.state.commands.some((c) => c.type === "EditBlockText"), 5000), "3 norsk kilde er endret");
    const select = page.getByTestId("script-language-select");
    await select.selectOption({ index: 1 });
    await page.locator(`[data-block="${blocks[0].id}"]`).first().click();
    const review = page.getByTestId("translation-review-languages");
    h.check(await h.eventually(() => review.isVisible(), 5000), "3 «må gjennomgås» vises etter norsk revisjon");
    const reviewText = (await review.innerText().catch(() => "")) ?? "";
    h.check(LANGS.every((l) => reviewText.includes(l)), `3 alle tre språkene er merket (${reviewText.slice(0, 120)})`);
    h.check(!h.state.commands.some((c) => c.type === "SetTranslationText" || c.type === "UpdateTranslation"), "3 ingen oversettelse er overskrevet");

    // 4. Koble linjer (manuell 1:1 på tysk)
    await select.selectOption("de");
    await page.locator(`[data-block="${blocks[1].id}"]`).first().click();
    await page.getByTestId("line-links-open").click();
    const links = page.getByTestId("line-links-dialog");
    await links.getByTestId("line-links-language").selectOption("de");
    await links.getByTestId("line-links-sources").selectOption({ index: 0 });
    await links.getByTestId("line-links-targets").selectOption({ index: 0 });
    await links.getByTestId("line-links-manual-save").click();
    h.check(await done(() => h.rows.translation_line_links.length === 1, 5000), "4 manuell kobling lagres");
    const link = h.rows.translation_line_links[0];
    h.check(link?.language === "de" && link?.variant_id === occ.variant_id, "4 koblingen har riktig språk og scene");
    h.check(link?.language_version_id === h.rows.language_versions[0].id, "4 koblingen hører til språkversjonen");
    await page.keyboard.press("Escape");

    // 5. Eksport: ufullstendig tysk krever valg; norsk reserve + Fountain; PDF stoppes for latinsk serbisk
    await tool("script-export-open");
    const run = page.getByTestId("script-export-run");
    await run.waitFor({ timeout: 5000 });
    await page.getByTestId("export-language-select").selectOption("de");
    h.check(await run.isDisabled(), "5 eksport sperret til reserve eller stopp er valgt");
    await page.getByTestId("export-language-fallback").check();
    await page.getByLabel(/Fountain/).check();
    h.check(!(await run.isDisabled()), "5 Fountain med norsk reserve kan eksporteres");
    await run.click();
    h.check(await h.eventually(() => page.locator('a[download$=".fountain"]').count().then((n) => n > 0), 5000), "5 Fountain-filen er laget");
    await page.getByTestId("export-language-select").selectOption("sr-Latn");
    await page.getByLabel(/PDF/).first().check();
    const blocked = page.getByTestId("export-font-blocked");
    h.check(await h.eventually(() => blocked.isVisible(), 3000), "5 fontkontroll stopper PDF for latinsk serbisk");
    h.check(/Č|Đ|č|đ|ć/.test(await blocked.innerText()), "5 tegnene som mangler, vises");
    h.check(await run.isDisabled(), "5 PDF kan ikke lages med «?»");
    await page.getByLabel(/Word/).check();
    h.check(await h.eventually(() => blocked.count().then((n) => n === 0), 3000), "5 Word dekker latinsk serbisk");
    await page.screenshot({ path: `${h.out}/export-${lang}.png` });
    await page.keyboard.press("Escape");

    // 6. Sikkerhetskopi
    await page.goto(h.base + "/", { waitUntil: "networkidle" });
    await page.evaluate(() => {
      delete window.showSaveFilePicker;
      Object.defineProperty(StorageManager.prototype, "getDirectory", { value: undefined, configurable: true });
    });
    await page.getByTestId("project-menu").first().click();
    await page.getByTestId("project-menu-backup").click();
    await page.getByTestId("backup-download").click();
    await page.getByTestId("backup-link").waitFor({ timeout: 15000 });
    const url = await page.getByTestId("backup-link").getAttribute("href");
    const b64 = await page.evaluate(async (u) => {
      const buf = new Uint8Array(await (await fetch(u)).arrayBuffer());
      let s = ""; for (const x of buf) s += String.fromCharCode(x); return btoa(s);
    }, url);
    const zip = `${h.out}/backup-${lang}.zip`;
    writeFileSync(zip, Buffer.from(b64, "base64"));
    h.check(Buffer.from(b64, "base64").length > 1000, "6 sikkerhetskopien er laget");
    await page.keyboard.press("Escape");

    // 7. Gjenopprett
    await page.getByTestId("restore-backup-open").click();
    await page.setInputFiles('input[type=file][accept*="zip"]', zip);
    await page.getByTestId("restore-name").fill("Gjenopprettet");
    await page.getByTestId("restore-run").click();
    h.check(await h.eventually(() => restored !== null, 15000), "7 gjenopprettingen sendes");
    const sent = restored ?? "";
    h.check(h.rows.language_versions.every((v) => sent.includes(v.id)), "7 alle tre språkversjonene (med ID) er med");
    h.check(sent.includes(link?.id ?? "x") && h.rows.translations.every((t) => sent.includes(t.id)), "7 koblingen og alle oversettelsene er med");
    h.check(sent.includes("sr-Latn") && sent.includes("pt-BR"), "7 språkkodene er bevart");
    h.check(await h.eventually(() => page.getByTestId("restore-done").isVisible(), 8000), "7 gjenopprettingen er fullført");
    h.check(blocks.slice(1).every((b, i) => b.text === original[i + 1].text), "norsk kilde er bare endret der brukeren skrev");
  });
}
await h.finish();
