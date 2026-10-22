/** MTS MT9 (GP6), globale maler og logoer: M1–M5 og AC. MOTION_TYPOGRAPHY_SPEC.md, del M.
 * Mocket backend og serverfunksjoner; ingen betalte kall.
 * Fixture: bun tests/visual/make-mts-fixture.ts /tmp/claude-0/mts-fixture.json
 * ENV_FILE=… node tests/visual/mts-global.mjs <baseUrl> /tmp/claude-0/mts-fixture.json [out]
 */
import { setup } from "./global-harness.mjs";
import { uiLang } from "./ui-lang.mjs";
import { revealInToolbar } from "./toolbar.mjs";

const WS = "00000000-0000-4000-8000-00000000aaaa";
const GT = "00000000-0000-4000-8000-00000000a010"; // global lower third-mal
const GL = "00000000-0000-4000-8000-00000000a011"; // global produksjonslogo
const GTV = "00000000-0000-4000-8000-00000000b010";
const GLV = "00000000-0000-4000-8000-00000000b011";
const sha = "a".repeat(64);
const key = (a) => `global/${WS}/${a}/${sha}.png`;
const g = {
  assets: [
    { id: GT, workspace_id: WS, kind: "template", name: "Global lower third", description: "", categories: [], tags: [], archived_at: null, revision: 1 },
    { id: GL, workspace_id: WS, kind: "logo", name: "Trollfilm-logo", description: "", categories: [], tags: [], archived_at: null, revision: 1 },
  ],
  variants: [
    { id: GTV, workspace_id: WS, global_asset_id: GT, name: "Standard", style: "other", appearance: "", archived_at: null },
    { id: GLV, workspace_id: WS, global_asset_id: GL, name: "Farge", style: "reference", appearance: "", archived_at: null },
  ],
  versions: [
    { id: "00000000-0000-4000-8000-00000000c010", workspace_id: WS, global_asset_id: GT, variant_id: GTV, number: 1, storage_key: key(GT), mime_type: "image/png", width: 10, height: 10, byte_size: 100, sha256: sha, duration_ms: null, note: "", template_spec: null, created_at: "2026-10-18T00:00:00Z" },
    { id: "00000000-0000-4000-8000-00000000c011", workspace_id: WS, global_asset_id: GL, variant_id: GLV, number: 1, storage_key: key(GL), mime_type: "image/png", width: 10, height: 10, byte_size: 100, sha256: sha, duration_ms: null, note: "", created_at: "2026-10-18T00:00:00Z" },
  ],
};

const h = setup({
  tables(table, url, _method, _body, single) {
    if (table === "projects" && url.searchParams.get("select") === "workspace_id")
      return single ? { workspace_id: WS } : [{ workspace_id: WS }];
    if (table === "workspace_members") return [{ workspace_id: WS, role: "editor" }];
    if (table === "workspaces") return [{ id: WS, name: "Trollfilm" }];
    if (table === "global_assets") return g.assets;
    if (table === "global_asset_variants") return g.variants;
    if (table === "global_asset_versions") return g.versions;
    return undefined;
  },
  rpc(name) {
    if (name === "global_asset_projects") return [{ project_id: "p1", project_name: "Jula på Dovre" }, { project_id: "p2", project_name: "Reklamefilm" }];
    return undefined;
  },
  serverFn(name, d) {
    if (/getGlobalFileUrls/.test(name)) return Object.fromEntries((d.paths ?? []).map((p) => [p, `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>`]));
    if (/copyGlobalToProject/.test(name))
      return Object.fromEntries((d.items ?? []).map((i) => {
        const v = g.versions.find((x) => x.id === i.globalVersionId);
        return [i.globalVersionId, { path: `${h.fx.project.id}/source/${i.projectAssetId}/${i.projectVersionId}/${sha}.png`, mimeType: v.mime_type, width: 10, height: 10, byteSize: 100, sha256: sha }];
      }));
    return undefined;
  },
});

const M = h.fx.mts;
// Bruk en gyldig mal fra den felles fixturen, med format, stabile nøkler og komplette lagfelter.
g.versions[0].template_spec = h.fx.rows.asset_versions.find((v) => v.id === M.v1)?.template_spec;
if (!g.versions[0].template_spec) throw new Error("Fixture mangler maldefinisjon");

// V1: UI_LANG=en overstyrer scenarioets språk (kontrollene bruker ID-er og loggede kall, ikke tekst)
const run = (label, path, fn, opts = {}) => h.run(label, path, fn, { ...opts, lang: uiLang(opts.lang) });
await run("M1-AC-global-mal-i-bruk", `$P/scene?scene=${M.occB}`, async (page) => {
  // AC/M1: den globale malen nås fra Tekst-menyen og brukes i prosjektet
  await revealInToolbar(page, page.getByTestId("mts-text-menu"));
  await page.getByTestId("mts-text-menu").click();
  await page.getByTestId("mts-global-templates").click();
  const dialog = page.getByTestId("global-library-dialog");
  await dialog.waitFor();
  await dialog.locator(`[data-global-asset="${GT}"]`).waitFor();
  h.check(await dialog.locator(`[data-global-asset="${GL}"]`).count() === 0, "M1: malvisningen viser bare maler (ikke logoer)");
  await dialog.locator(`[data-global-asset="${GT}"]`).click();
  await dialog.getByTestId("global-use-in-project").click();
  await page.waitForTimeout(1500);
  h.check(h.log.serverFns.some((f) => /copyGlobalToProject/.test(f.name)), "M2/AC: malen kopieres inn i prosjektet på serveren");
  h.check(h.log.commands.some((c) => c?.type === "AddAssetVersion" && c.template), "M1: maldefinisjonen kommer med som prosjektversjon");
  h.check(h.log.commands.some((c) => c?.type === "ApplyTemplate"), "M2: malen brukes i scenen etter kopieringen");
});

await run("M3-lokalt-innhold-endrer-ikke-malen", `$P/scene?scene=${M.occA}`, async (page) => {
  // Forekomsten fra fixturen: endre navnet lokalt
  const row = page.locator(`[data-layer-row="${M.instanceName}"]`).first();
  await row.locator("button[aria-pressed]").first().click();
  const field = page.getByTestId("mts-template-field-navn");
  await field.waitFor({ timeout: 5000 });
  await field.fill("Lokal regissør");
  await field.blur();
  await page.waitForTimeout(1200);
  h.check(h.log.commands.some((c) => c?.type === "ApplyTemplate"), "M3: innholdet endres i forekomsten");
  h.check(!h.log.commands.some((c) => c?.type === "AddAssetVersion"), "M3: malen endres ikke");
  h.check(!h.log.rpcs.some((r) => r.name.startsWith("global_")), "M3: den globale malen røres ikke");
});

await run("M4-global-logo-i-tittel", `$P/scene?scene=${M.titleOcc}`, async (page) => {
  await page.getByTestId("mts-pages-panel").waitFor({ timeout: 5000 });
  await revealInToolbar(page, page.getByTestId("mts-text-menu"));
  await page.getByTestId("mts-text-menu").click();
  h.check(await page.getByTestId("mts-global-templates").isVisible(), "M4: globale ressurser nås også fra tittelen");
  await page.keyboard.press("Escape");
});

await run("M5-global-oppdatering-overskriver-ikke", `$P/scene?scene=${M.occA}`, async (page) => {
  // Den globale malen finnes i en nyere versjon i biblioteket; å åpne scenen endrer ingenting
  await page.waitForTimeout(1500);
  h.check(h.log.commands.length === 0, "M5: en nyere global malversjon endrer aldri godkjente forekomster stille");
});

await h.done();
