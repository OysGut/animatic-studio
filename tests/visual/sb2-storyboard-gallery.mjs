/**
 * SB-2: storyboardgalleriet på nb og en. Forslag ved første åpning krever bekreftelse, dobbeltklikk åpner
 * sceneeditoren med riktig forekomst og panel, scenerekkefølge bruker MoveOccurrence, og vis/skjul huskes.
 * Ingen betalte kall. Bygger på mts-harness.mjs (samme mocking).
 */
import { harness } from "./mts-harness.mjs";
if (!process.argv[3]) process.argv[3] = "/tmp/claude-0/visual-fixture.json";
const h = harness("/tmp/claude-0/sb2-storyboard");
const OCC = "00000000-0000-7000-8000-000000000006";
const gallery = async (page) => {
  await page.goto(`${h.base}${h.P}/storyboard`, { waitUntil: "networkidle" });
  await page.getByTestId("sb-grid").waitFor({ timeout: 30000 });
};

for (const lang of ["nb", "en"]) {
  await h.scenario(`sb2-seed-${lang}`, OCC, lang, async (page) => {
    await gallery(page);
    h.check(await page.getByTestId("sb-seed-confirm").isVisible(), `${lang}: forslag om ett panel per scene vises`);
    h.check(!h.state.commands.length, `${lang}: ingenting opprettes før bekreftelse`);
    await page.getByTestId("sb-seed-confirm").click();
    h.check(await h.eventually(() => h.state.commands.some((c) => c?.type === "AddStoryboardPanel" || c?.steps?.some?.((s) => s.type === "AddStoryboardPanel"))), `${lang}: bekreftelse sender AddStoryboardPanel`);
    await page.screenshot({ path: `${h.out}/seed-${lang}.png` });
  });

  await h.scenario(`sb2-open-${lang}`, OCC, lang, async (page) => {
    await gallery(page);
    await page.getByTestId("sb-seed-confirm").click();
    const card = page.getByTestId("sb-panel").first();
    await card.waitFor({ timeout: 10000 });
    await card.click();
    h.check((await card.getAttribute("aria-selected")) === "true", `${lang}: enkeltklikk velger panelet`);
    const id = await card.getAttribute("data-panel-id");
    await card.dblclick();
    h.check(await h.eventually(() => page.url().includes("/scene") && page.url().includes(`panel=${id}`), 8000), `${lang}: dobbeltklikk åpner sceneeditoren med panelet`);
    h.check(await h.eventually(async () => page.getByTestId("sb-panel-mark").isVisible(), 8000), `${lang}: panelet er markert i sceneeditoren`);
  });

  await h.scenario(`sb2-order-${lang}`, OCC, lang, async (page) => {
    await gallery(page);
    await page.getByTestId("sb-seed-confirm").click();
    await page.getByTestId("sb-scene-down").first().click();
    h.check(await h.eventually(() => h.state.commands.some((c) => c?.type === "MoveOccurrence")), `${lang}: scenerekkefølge bruker MoveOccurrence (manus og montering følger)`);
    h.check(await page.getByTestId("sb-notice").isVisible(), `${lang}: tydelig merket at filmens scenerekkefølge endres`);
  });

  await h.scenario(`sb2-prefs-${lang}`, OCC, lang, async (page) => {
    await gallery(page);
    await page.getByTestId("sb-show-dialogue").click();
    await page.getByTestId("sb-text-view").click();
    await gallery(page);
    h.check(!(await page.getByTestId("sb-show-dialogue").isChecked()), `${lang}: vis/skjul huskes etter ny lasting`);
    h.check((await page.getByTestId("sb-grid").getAttribute("data-view")) === "text", `${lang}: tekstvisningen huskes`);
    await page.screenshot({ path: `${h.out}/prefs-${lang}.png` });
  });
}
await h.finish();
