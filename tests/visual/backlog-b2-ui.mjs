/** B2: exact word notes, reversible resolved state and owner-confirmed source cleanup; no real services. */
import { harness } from "./mts-harness.mjs";
import { byLang } from "./ui-lang.mjs";
const h = harness("/tmp/claude-0/backlog-b2");
const occ = h.rows.scene_occurrences.find(o => h.rows.script_blocks.some(b => b.variant_id === o.variant_id && b.kind === "dialogue" && b.text.length > 5));
if (!occ) throw new Error("Missing scene");
for (const lang of ["nb", "en"]) await h.scenario(`b2-${lang}`, occ.id, lang, async page => {
  const line = h.rows.script_blocks.find(b => b.variant_id === occ.variant_id && b.kind === "dialogue" && b.text.length > 5);
  const el = page.locator(`[data-script-text="${line.id}"]`);
  await el.evaluate(element => {
    const text = element.firstChild;
    const selection = window.getSelection();
    if (!text || !selection) throw new Error("Missing text selection");
    const range = document.createRange(); range.setStart(text, 1); range.setEnd(text, 4);
    selection.removeAllRanges(); selection.addRange(range);
  });
  await page.getByTestId("scene-script").dispatchEvent("mouseup");
  const box = page.getByTestId("scene-word-note");
  await box.getByRole("button", { name: byLang(lang, "Legg til notat på markeringen", "Add note to selection") }).click();
  await box.getByRole("textbox").fill("B2 test");
  h.check(!h.state.commands.some(c => c.type === "AddAnnotations"), "selection alone never writes");
  await box.getByRole("button", { name: byLang(lang, "Lagre notat", "Save note") }).click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "AddAnnotations" && c.annotations?.some(a => a.blockId === line.id && a.start === 1 && a.end === 4 && a.quote === line.text.slice(1, 4)))), "word offsets and quote persist through UI command");
  await page.screenshot({ path: `${h.out}/word-note-${lang}.png` });
  h.check(!/Lovable/i.test(await page.locator("body").innerText()), "scene has no platform brand");
  // Read-only preview route returns deterministic unused files; deleting only occurs after explicit action.
  const calls = [];
  await page.route("**/_serverFn/**", async route => {
    const url = new URL(route.request().url());
    let name = "";
    try { name = JSON.parse(Buffer.from(decodeURIComponent(url.pathname.split("/_serverFn/")[1]), "base64url").toString()).export; } catch { return route.fallback(); }
    const result = /previewAiSourceCleanup/.test(name) ? [{ path: `${h.fx.project.id}/temp/ai-source/test-old.mp4`, bytes: 100 }]
      : /confirmAiSourceCleanup/.test(name) ? (calls.push("delete"), { deleted: 1 }) : undefined;
    if (result === undefined) return route.fallback();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, context: {} }) });
  });
  await page.goto(`${h.base}${h.P}/`, { waitUntil: "networkidle" });
  const cleanup = page.getByTestId("ai-source-cleanup");
  await cleanup.getByRole("button").click();
  await page.getByRole("alertdialog").waitFor();
  h.check(calls.length === 0, "preview does not delete");
  await page.getByRole("button", { name: byLang(lang, "Avbryt", "Cancel"), exact: true }).click();
  h.check(calls.length === 0, "cancel does not delete");
  await cleanup.getByRole("button").click();
  await page.getByRole("button", { name: byLang(lang, "Slett for godt", "Delete permanently") }).click();
  h.check(await h.eventually(() => calls.length === 1), "confirmation deletes once");
  await page.screenshot({ path: `${h.out}/source-cleanup-${lang}.png` });
});
await h.finish();