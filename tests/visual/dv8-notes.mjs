/** DV8: bokmerker, huskelapper og merknadsoversikt (B1–B4, H1–H14). Alle tjenestekall er mocket. */
import { harness } from "./mts-harness.mjs";
const h = harness("/tmp/browser/dv8");
const occ = h.M.driftOcc ?? h.rows.scene_occurrences[0].id;
h.rows.user_bookmarks = [{ target: { view: "scene", occurrenceId: occ, frame: 24, tab: "scene" }, updated_at: "2026-10-20T10:00:00.123456Z" }];
for (const lang of ["nb", "en"]) await h.scenario(`dv8-${lang}`, occ, lang, async page => {
  // Bokmerke: sett i toppmenyen
  h.check(await page.getByTestId("bookmark-set").isVisible(), "set bookmark in the top menu");
  await page.getByTestId("bookmark-set").click();
  h.check(await h.eventually(() => h.state.rpcs.some(r => r.name === "set_my_bookmark" && r.body?.p_target?.view === "scene" && r.body?.p_target?.occurrenceId === occ), 4000), "bookmark stores scene and view");
  h.check(!h.state.commands.some(c => /Bookmark/.test(c.type ?? "")), "bookmark is not shared project data");
  // Huskelapp på sceneforekomsten
  const flag = page.locator('[data-testid="note-flag-button"][data-note-kind="occurrence"]').first();
  h.check(await h.eventually(() => flag.count().then(n => n > 0), 4000), "note flag control on the scene");
  await flag.click();
  h.state.commands = [];
  await page.getByTestId("note-flag-add").click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "AddNoteFlag" && c.targetKind === "occurrence" && c.targetId === occ), 4000), "flag is written as a command");
  await page.getByTestId("note-flag-popover").screenshot({ path: `${h.out}/${lang}-flag.png` }).catch(() => {});
  await page.keyboard.press("Escape");
  // Prosjektsiden: «Merknader og huskelapper»
  await page.goto(`${h.base}${h.P}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const box = page.getByTestId("note-flags-overview");
  h.check(await box.isVisible(), "notes and flags box on the project page");
  for (const id of ["note-flags-sort", "note-flags-creator", "note-flags-kind", "note-flags-active"]) h.check(await box.getByTestId(id).isVisible(), `${id} visible`);
  await box.screenshot({ path: `${h.out}/${lang}-overview.png` });
  // Fortsett ved bokmerke: navigerer først, fjerner etterpå (B3)
  h.state.rpcs = [];
  await page.getByTestId("bookmark-resume").click();
  h.check(await h.eventually(() => page.url().includes(`scene=${occ}`) && page.url().includes("at=24"), 5000), "resume opens the right scene and time");
  h.check(await h.eventually(() => h.state.rpcs.some(r => r.name === "consume_my_bookmark" && r.body?.p_updated_at === "2026-10-20T10:00:00.123456Z"), 4000), "bookmark consumed after successful navigation");
});
await h.finish();
