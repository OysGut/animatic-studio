/**
 * M6 resten (DEC-0054 valg B, varighetsprognose, kontekstuell kobling): sceneeditor, manus, oversikt og
 * bibliotek, på norsk og engelsk. Alle serverfunksjoner er mocket (ingen AI, ingen betalte kall).
 *   bun tests/visual/make-fixture.ts /tmp/claude-0/visual-fixture.json
 *   ENV_FILE=… node tests/visual/m6-rest.mjs <baseUrl> /tmp/claude-0/visual-fixture.json [out]
 */
import { harness } from "./mts-harness.mjs";
if (!process.argv[3]) process.argv[3] = "/tmp/claude-0/visual-fixture.json";
const h = harness("/tmp/browser/m6");
const MAJA = "00000000-0000-7000-8000-0000000000a2";
const ACTION = "00000000-0000-7000-8000-000000000007";
const OCC = "00000000-0000-7000-8000-000000000006";

// Handlingslinjen endres etter at 2D-scenen ble laget (ny revisjon), så avviket gjelder bilder og shot
const NEW_ACTION = "Snøen ligger tung over tunet. Maja løper ut i snøen med vasen.";
const block = h.rows.script_blocks.find((b) => b.id === ACTION);
block.current_rev = 2;
block.text = NEW_ACTION;
h.rows.script_block_revisions.push({ ...h.rows.script_block_revisions.find((r) => r.block_id === ACTION), rev: 2, text: NEW_ACTION });

for (const lang of ["nb", "en"]) {
  const nb = lang === "nb";
  await h.scenario(`m6-update-${lang}`, OCC, lang, async (page) => {
    await page.getByRole("button", { name: nb ? "Vis og velg …" : "View and choose …" }).first().click();
    const sec = page.getByTestId("material-update").first();
    await sec.waitFor({ timeout: 8000 });
    await sec.scrollIntoViewIfNeeded();
    h.check(await sec.getByTestId("material-update-dialogue").isVisible(), "oppdatering: replikker sendes til DV7");
    h.check(!h.state.rpcs.some((r) => r.name === "generateText"), "oppdatering: ingen AI før bekreftelse");
    await sec.getByTestId("material-update-open").click();
    h.check(/\$|USD|inkludert|included/.test(await sec.getByTestId("material-update-cost").innerText()), "oppdatering: anslag i bekreftelsen");
    await sec.screenshot({ path: `${h.out}/update-confirm-${lang}.png` });
    await sec.getByTestId("material-update-run").click();
    await sec.getByTestId("material-update-result").waitFor({ timeout: 5000 });
    const call = h.state.rpcs.find((r) => r.name === "generateText")?.body;
    h.check(call?.task === "general" && /Maja/.test(call?.messages?.[0]?.content ?? ""), "oppdatering: prompten har den endrede linjen");
    h.check((await sec.getByTestId("material-update-image").count()) >= 1, "oppdatering: bildeforslag vises");
    h.check(h.state.commands.length === 0, "oppdatering: ingenting lagret før valg");
    await sec.getByTestId("material-update-shot").first().getByRole("button").click();
    h.check(await h.eventually(() => h.state.commands.some((c) => c.type === "AddAnnotations"), 5000), "oppdatering: shotforslag lagret som notat");
    h.check(!h.state.commands.some((c) => c.type === "EditBlockText"), "oppdatering: manuset endres ikke");
    const img = sec.getByTestId("material-update-image").first();
    await img.getByRole("button", { name: nb ? "Lag nytt bilde …" : "Make new image …" }).click();
    h.check(!h.state.rpcs.some((r) => r.name === "generateImage"), "oppdatering: ingen bildegenerering før bekreftelse");
    await img.getByRole("button", { name: nb ? "Ja, generer" : "Yes, generate" }).click();
    h.check(await h.eventually(() => h.state.commands.some((c) => c.type === "AddAssetVersion"), 5000), "oppdatering: nytt bilde blir ny versjon");
    const gi = h.state.rpcs.find((r) => r.name === "generateImage")?.body;
    h.check(gi?.approved === true && !!gi?.model, "oppdatering: bekreftet med valgt modell");
    h.check(!h.state.commands.some((c) => c.type === "UpdateLayers"), "oppdatering: ikke tatt i bruk automatisk");
    await img.getByTestId("material-update-use").click();
    h.check(await h.eventually(() => h.state.commands.some((c) => c.type === "UpdateLayers"), 5000), "oppdatering: «Bruk i scenen» med eget klikk");
    await sec.screenshot({ path: `${h.out}/update-result-${lang}.png` });
  });

  await h.scenario(`m6-forecast-${lang}`, OCC, lang, async (page) => {
    await page.goto(h.base + h.P, { waitUntil: "networkidle" });
    const f = page.getByTestId("duration-forecast");
    await f.waitFor({ timeout: 8000 });
    const t = await f.innerText();
    h.check(/\d+:\d\d–\d+:\d\d/.test(t), "prognose: spenn på oversikten");
    h.check(nb ? /standardantakelsene|basert på/.test(t) : /standard assumptions|based on/.test(t), "prognose: grunnlag eller tilbakefall vises");
    await f.screenshot({ path: `${h.out}/forecast-overview-${lang}.png` });
    await page.goto(h.base + h.P + "/manus", { waitUntil: "networkidle" });
    const n = page.getByTestId("nav-forecast").first();
    await n.waitFor({ timeout: 8000 });
    h.check(/\d+:\d\d/.test(await n.innerText()), "prognose: vises i scenenavigatoren");
    h.check(h.state.commands.length === 0, "prognose: ingenting lagres");
  });

  await h.scenario(`m6-links-${lang}`, OCC, lang, async (page) => {
    await page.goto(`${h.base}${h.P}/bibliotek?asset=${MAJA}`, { waitUntil: "networkidle" });
    const sec = page.getByTestId("context-link-suggestions");
    await sec.waitFor({ timeout: 8000 });
    await sec.scrollIntoViewIfNeeded();
    const ai = sec.getByTestId("context-link-ai");
    h.check(await ai.isVisible(), "kobling: AI tilbys for de usikre");
    await ai.click();
    h.check(!h.state.rpcs.some((r) => r.name === "generateText"), "kobling: ingen AI før bekreftelse");
    h.check(await sec.getByTestId("context-link-cost").isVisible(), "kobling: anslag i bekreftelsen");
    await sec.getByTestId("context-link-ai-run").click();
    h.check(await h.eventually(() => h.state.rpcs.some((r) => r.name === "generateText"), 5000), "kobling: AI kjørt etter «Ja»");
    await page.waitForTimeout(500);
    const rows = await sec.getByTestId("context-link-row").count();
    h.check(rows >= 1, "kobling: forslag vises til godkjenning");
    h.check(h.state.commands.length === 0, "kobling: ingenting koblet før godkjenning");
    await sec.screenshot({ path: `${h.out}/links-${lang}.png` });
    await sec.getByTestId("context-link-approve").click();
    h.check(await h.eventually(() => h.state.commands.some((c) => c.type === "SetContextNames"), 5000), "kobling: godkjent via kommando (kan angres)");
  });
}
await h.finish();
