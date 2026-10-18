/** GP3 videreføring mellom scener, S1–S8. Mocket backend og runCommand; ingenting lagres.
 * ENV_FILE=… node tests/visual/global-continuity.mjs <baseUrl> <fixture.json> [out]
 */
import { setup } from "./global-harness.mjs";

const h = setup();
const { fx } = h;
const COMP = fx.rows.compositions[0];
const OCC = fx.rows.scene_occurrences.find((o) => o.variant_id === COMP.variant_id);
const LAYER = fx.rows.composition_layers.find((l) => l.composition_id === COMP.id && l.kind !== "group" && l.asset_id);
const main = fx.rows.productions.find((p) => p.id === OCC.production_id);
const order = fx.rows.scene_occurrences
  .filter((o) => o.production_id === main.id && o.active !== false)
  .sort((a, b) => a.order_key.localeCompare(b.order_key) || a.id.localeCompare(b.id));
const idx = order.findIndex((o) => o.id === OCC.id);
const NEXT = order.slice(idx + 1).find((o) => o.variant_id !== OCC.variant_id);
const others = order.filter((o) => o.variant_id !== OCC.variant_id);
const path = `$P/scene?scene=${OCC.id}`;

async function selectLayer(page) {
  await page.locator(`[data-layer-row="${LAYER.id}"]`).first().click();
  await page.getByTestId("carry-over-actions").waitFor({ timeout: 5000 });
}
const added = () => h.log.commands.filter((c) => c.type === "AddLayers").flatMap((c) => c.layers);

await h.run("s1-next", path, async (page) => {
  await selectLayer(page);
  await page.getByTestId("carry-next").click();
  await page.waitForTimeout(800);
  const dlg = await page.getByTestId("carry-over-dialog").count();
  if (dlg) {
    // Laget fantes i neste scene: duplikatvalget (S4)
    await page.getByTestId("carry-over-add-another").click();
    await page.getByTestId("carry-over-submit").click();
    await h.dialogsClosed(page);
    await page.waitForTimeout(500);
  }
  const l = added();
  h.check(l.length === 1, "S1 ett nytt lag");
  h.check(l[0]?.fields.assetId === LAYER.asset_id, "S1 samme ressurs");
  h.check(l[0]?.fields.assetVariantId === LAYER.asset_variant_id, "S1 samme variant");
  h.check(l[0]?.fields.transform.scaleX === LAYER.transform.scaleX && l[0]?.fields.transform.rotation === LAYER.transform.rotation, "S1 skala og rotasjon følger med");
  h.check((l[0]?.fields.keyframes ?? []).length === 0, "S3 nøkkelbildene er lokale og følger ikke med");
  h.check(!!NEXT, "S1 fixturen har en neste scene");
});

await h.run("s2-pick", path, async (page) => {
  await selectLayer(page);
  await page.getByTestId("carry-pick").click();
  const dialog = page.getByTestId("carry-over-dialog");
  await dialog.waitFor();
  const targets = others.slice(0, 2);
  for (const t of targets) await dialog.locator(`[data-carry-target="${t.id}"] input[type=checkbox]`).check();
  h.check(await dialog.locator(`[data-carry-target="${OCC.id}"]`).count() === 0, "S2 scenen selv er ikke et valg");
  // S4/S5: duplikater må velges eksplisitt
  for (const t of targets)
    if ((await dialog.locator(`[data-carry-target="${t.id}"]`).getAttribute("data-duplicate")) === "true")
      await dialog.locator(`[data-carry-target="${t.id}"]`).getByTestId("carry-over-add-another").check();
  await dialog.getByTestId("carry-over-submit").click();
  await h.dialogsClosed(page);
  await page.waitForTimeout(500);
  h.check(added().length === targets.length, "S2 én ny forekomst per valgt scene");
  const groups = new Set(h.log.serverFns.filter((f) => /runCommand/.test(f.name)).map((f) => f.data.groupId ?? f.data.envelope?.groupId ?? null));
  h.check(groups.size <= 1, "S6 alt er én angregruppe");
});

await h.run("s4-duplicate-existing", path, async (page) => {
  // Kildescenen sammen med en scene som har samme ressurs: «Bruk den som finnes» skriver ingenting
  await selectLayer(page);
  await page.getByTestId("carry-pick").click();
  const dialog = page.getByTestId("carry-over-dialog");
  await dialog.waitFor();
  const dup = dialog.locator('[data-duplicate="true"]').first();
  if (await dup.count()) {
    await dup.locator("input[type=checkbox]").check();
    await dup.getByTestId("carry-over-use-existing").check();
    await dialog.getByTestId("carry-over-submit").click();
    await h.dialogsClosed(page);
    h.check(added().length === 0, "S4 «bruk den som finnes» lager ingen ny forekomst");
  } else {
    h.check(true, "S4 fixturen har ingen duplikat (dekket i unit-test)");
    await page.keyboard.press("Escape");
    await h.dialogsClosed(page);
  }
});

await h.run("s7-asset-studio", path, async (page) => {
  // Fra Asset Studio: utkastet blandes ikke inn
  await page.locator(`[data-layer-row="${LAYER.id}"]`).first().click();
  await page.getByTestId("open-asset-studio").click();
  await page.getByTestId("asset-studio-carry").waitFor();
  await page.getByTestId("asset-studio-carry").click();
  const dialog = page.getByTestId("carry-over-dialog");
  await dialog.waitFor();
  const t = others[0];
  await dialog.locator(`[data-carry-target="${t.id}"] input[type=checkbox]`).check();
  if ((await dialog.locator(`[data-carry-target="${t.id}"]`).getAttribute("data-duplicate")) === "true")
    await dialog.locator(`[data-carry-target="${t.id}"]`).getByTestId("carry-over-add-another").check();
  await dialog.getByTestId("carry-over-submit").click();
  await page.getByTestId("asset-studio-carry-status").waitFor();
  h.check(added().length === 1, "S7 laget er lagt til i den andre scenen");
  h.check(!h.log.commands.some((c) => c.type === "UpdateSceneDraft"), "S7 utkastet for den åpne scenen sendes ikke");
  h.check(added().every((l) => l.compositionId !== COMP.id), "S7 den åpne 2D-scenen røres ikke");
});

await h.run("s8-english", path, async (page) => {
  await selectLayer(page);
  h.check(/Use in next scene/.test(await page.getByTestId("carry-next").innerText()), "S8 engelsk tekst");
}, { lang: "en" });

await h.done();
