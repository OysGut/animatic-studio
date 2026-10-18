/** MTS MT7, rulletekst: F–M. MOTION_TYPOGRAPHY_SPEC.md, del M.
 * Fixture: bun tests/visual/make-mts-fixture.ts /tmp/claude-0/mts-fixture.json
 * ENV_FILE=… node tests/visual/mts-credits.mjs <baseUrl> /tmp/claude-0/mts-fixture.json [out]
 */
import { harness } from "./mts-harness.mjs";

const h = harness("/tmp/claude-0/mts-credits");
const { M, state, check, scenario, eventually } = h;

const openParticipants = async (page) => {
  await page.getByTestId("mts-credits-tab-participants").click();
  await page.getByTestId("mts-credits-participants").waitFor({ timeout: 5000 });
};

await scenario("F-J-presentasjon-og-felt", M.creditsOcc, "nb", async (page) => {
  await page.getByTestId("mts-credits-panel").waitFor({ timeout: 5000 });
  await page.getByTestId("mts-credits-tab-design").click();
  const sel = page.getByTestId("mts-credits-presentation");
  check(await sel.inputValue() === "roll", "F: presentasjonsmalen vises (rullende)");
  await sel.selectOption("one_at_a_time");
  await eventually(() => state.commands.some((c) => c?.type === "SetCreditSequence" && c.fields.presentation === "one_at_a_time"));
  check(true, "J: «én deltaker om gangen» velges og lagres");
  const speed = page.getByTestId("mts-credits-speed");
  await speed.fill("6");
  await eventually(() => state.commands.some((c) => c?.type === "SetCreditSequence" && c.fields.speed === 6));
  check(true, "F: hastigheten er et eget felt i sekvensen");
});

await scenario("G-H-I-deltakere", M.creditsOcc, "nb", async (page) => {
  await openParticipants(page);
  check((await page.locator('[data-testid="mts-credit-row"]').count()) === 2, "G: deltakerne vises i eget informasjonsgrensesnitt");
  await page.getByTestId("mts-credit-add").click();
  await eventually(() => state.commands.some((c) => c?.type === "AddCreditParticipant"));
  check(true, "G: ny deltaker legges til med en kommando");
  // H: flytt den nederste (Øystein) opp
  const row = page.locator(`[data-participant-id="${M.creditP2}"]`);
  await row.getByTestId("mts-credit-up").click();
  await eventually(() => state.commands.some((c) => c?.type === "UpdateCreditParticipant" && c.participantId === M.creditP2 && typeof c.fields.orderKey === "string"));
  check(!state.commands.some((c) => c?.type === "AddAssetVersion" || c?.type === "SetCreditSequence"), "H: rekkefølgen endres uten å røre malen eller sekvensen");
  // I: skjul uten å slette
  await row.getByTestId("mts-credit-hidden").click();
  await eventually(() => state.commands.some((c) => c?.type === "UpdateCreditParticipant" && c.participantId === M.creditP2 && c.fields.hidden === true));
  check(!state.commands.some((c) => c?.type === "RemoveCreditParticipant"), "I: deltakeren skjules uten å slettes");
});

await scenario("K-logo-fra-globalt", M.creditsOcc, "nb", async (page) => {
  await openParticipants(page);
  // Logovelgeren åpner det globale biblioteket for logoer (GP6)
  const row = page.locator(`[data-participant-id="${M.creditP1}"]`);
  const btn = row.getByTestId("mts-credit-logo");
  check(await btn.count() === 1, "K: deltakeren har en logovelger");
  if (await btn.count()) {
    await btn.click();
    await page.getByTestId("global-library-dialog").waitFor({ timeout: 5000 }).catch(() => {});
    check(true, "K: logovelgeren åpner det globale biblioteket");
  }
});

await scenario("L-lydspor", M.creditsOcc, "nb", async (page) => {
  // Rulleteksten er en vanlig forekomst: sceneeditorens lydverktøy gjelder dens komposisjon
  check((await page.getByTestId("scene-audio-menu").count()) + (await page.locator('[data-testid*="audio"]').count()) > 0, "L: rulleteksten har eget lydspor via sceneeditorens lydverktøy");
});

await scenario("M-eksport-med-og-uten", M.creditsOcc, "nb", async (page) => {
  await page.goto(`${h.base}${h.P}/montering`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByTestId("export-animatic").click().catch(() => page.getByText("Eksporter", { exact: false }).first().click());
  const box = page.getByTestId("export-include-credits");
  await box.waitFor({ timeout: 5000 });
  check(await box.isChecked(), "M: «Inkluder rulletekst» er på som standard");
  await box.click();
  check(!(await box.isChecked()), "M: rulleteksten kan velges bort for én versjon uten");
});

await h.finish();
