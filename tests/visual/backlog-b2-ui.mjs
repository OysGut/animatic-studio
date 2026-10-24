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
  // KI-226: utvalget inni et ord utvides til hele ordet før notatet lagres
  const wr = (text, s, e) => { const W = /[\p{L}\p{N}]/u; while (s > 0 && W.test(text[s - 1]) && W.test(text[s])) s--; while (e < text.length && W.test(text[e - 1]) && W.test(text[e])) e++; return [s, e]; };
  const [ws, we] = wr(line.text, 1, 4);
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "AddAnnotations" && c.annotations?.some(a => a.blockId === line.id && a.start === ws && a.end === we && a.quote === line.text.slice(ws, we)))), "word offsets expand to word boundaries and persist through UI command");
  await page.screenshot({ path: `${h.out}/word-note-${lang}.png` });
  h.check(!/Lovable/i.test(await page.locator("body").innerText()), "scene has no platform brand");
  // Read-only preview route returns deterministic unused files; deleting only occurs after explicit action.
  const calls = [];
  await page.route("**/_serverFn/**", async route => {
    const url = new URL(route.request().url());
    let name = "";
    try { name = JSON.parse(Buffer.from(decodeURIComponent(url.pathname.split("/_serverFn/")[1]), "base64url").toString()).export; } catch { return route.fallback(); }
    const result = /previewAiSourceCleanup/.test(name) ? [
        { path: `${h.fx.project.id}/temp/ai-source/test-old.mp4`, bytes: 100 },
        { path: `${h.fx.project.id}/temp/ai-source/test-big.mp4`, bytes: 3 * 1024 * 1024 },
      ]
      : /confirmAiSourceCleanup/.test(name) ? (calls.push(route.request().postData() ?? ""), { deleted: 1 }) : undefined;
    if (result === undefined) return route.fallback();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, context: {} }) });
  });
  await page.goto(`${h.base}${h.P}/`, { waitUntil: "networkidle" });
  const cleanup = page.getByTestId("ai-source-cleanup");
  await cleanup.getByRole("button").click();
  await page.getByRole("alertdialog").waitFor();
  h.check(calls.length === 0, "preview does not delete");
  // KI-207: hver fil vises med størrelse, og brukeren velger selv hvilke som ryddes
  const dialog = page.getByRole("alertdialog");
  h.check(await dialog.getByText("3 MB").count() >= 1, "file size is shown");
  h.check((await page.getByTestId("ai-cleanup-select").count()) === 2, "each file has its own checkbox");
  h.check((await page.getByTestId("ai-cleanup-total").innerText()).includes("3 MB"), "total size is shown");
  await dialog.getByRole("button", { name: byLang(lang, "Avbryt", "Cancel"), exact: true }).click();
  h.check(calls.length === 0, "cancel does not delete");
  await cleanup.getByRole("button").click();
  await page.getByRole("alertdialog").waitFor();
  // Fjern den lille filen fra utvalget: bare den store skal sendes til sletting
  await page.locator(`[data-testid="ai-cleanup-select"][data-path$="test-old.mp4"]`).click();
  h.check((await page.getByTestId("ai-cleanup-total").innerText()).includes("3 MB"), "total follows the selection");
  await page.getByRole("button", { name: byLang(lang, "Slett for godt", "Delete permanently") }).click();
  h.check(await h.eventually(() => calls.length === 1), "confirmation deletes once");
  h.check(!calls[0].includes("test-old.mp4") && calls[0].includes("test-big.mp4"), "only the selected file is deleted");
  await page.screenshot({ path: `${h.out}/source-cleanup-${lang}.png` });
});
await h.finish();