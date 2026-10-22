/** GP2 globalt bibliotek, G1–G10. Mocket backend og serverfunksjoner; ingen betalte kall.
 * ENV_FILE=… node tests/visual/global-library.mjs <baseUrl> <fixture.json> [out]
 */
import { USER, setup } from "./global-harness.mjs";

const WS = "00000000-0000-4000-8000-00000000aaaa";
const GA = "00000000-0000-4000-8000-00000000a001";
const LOGO = "00000000-0000-4000-8000-00000000a002";
const GV1 = "00000000-0000-4000-8000-00000000b001";
const GV2 = "00000000-0000-4000-8000-00000000b002";
const LV = "00000000-0000-4000-8000-00000000b003";
const sha = "a".repeat(64);
const key = (a) => `global/${WS}/${a}/${sha}.png`;
const version = (id, variant, asset, number, mime = "image/png") => ({ id, workspace_id: WS, global_asset_id: asset, variant_id: variant, number, storage_key: key(asset), mime_type: mime, width: 10, height: 10, byte_size: 100, sha256: sha, duration_ms: null, note: "", created_at: "2026-10-18T00:00:00Z" });
const g = {
  assets: [
    { id: GA, workspace_id: WS, kind: "team_figure", name: "Teamfigur Maja", description: "Maskot", categories: ["Figurer"], tags: ["maskot"], archived_at: null, revision: 1 },
    { id: LOGO, workspace_id: WS, kind: "logo", name: "Trollfilm-logo", description: "", categories: [], tags: ["logo"], archived_at: null, revision: 1 },
  ],
  variants: [
    { id: GV1, workspace_id: WS, global_asset_id: GA, name: "Forfra", style: "illustrated", appearance: "", archived_at: null },
    { id: GV2, workspace_id: WS, global_asset_id: GA, name: "Fra siden", style: "illustrated", appearance: "", archived_at: null },
    { id: LV, workspace_id: WS, global_asset_id: LOGO, name: "Farge", style: "reference", appearance: "", archived_at: null },
  ],
  versions: [
    version("00000000-0000-4000-8000-00000000c001", GV1, GA, 1),
    version("00000000-0000-4000-8000-00000000c002", GV2, GA, 1),
    version("00000000-0000-4000-8000-00000000c003", LV, LOGO, 1),
  ],
};
let wsRole = "editor";
let linked = true;
let projectRows = null;

const h = setup({
  tables(table, url, method, body, single) {
    if (table === "projects" && url.searchParams.get("select") === "workspace_id")
      return single ? { workspace_id: linked ? WS : null } : [{ workspace_id: linked ? WS : null }];
    if (table === "workspace_members") return wsRole ? [{ workspace_id: WS, role: wsRole }] : [];
    if (table === "workspaces") return wsRole ? [{ id: WS, name: "Trollfilm" }] : [];
    if (table === "global_assets") return wsRole ? g.assets : [];
    if (table === "global_asset_variants") return wsRole ? g.variants : [];
    if (table === "global_asset_versions") return wsRole ? g.versions : [];
    if (projectRows && projectRows[table]) return projectRows[table];
    return undefined;
  },
  rpc(name) {
    if (name === "global_asset_projects") return [{ project_id: "p1", project_name: "Jula på Dovre" }, { project_id: "p2", project_name: "Reklamefilm" }];
    if (name === "global_create_asset") return "00000000-0000-4000-8000-00000000a099";
    if (name === "global_create_variant") return "00000000-0000-4000-8000-00000000b099";
    if (name === "global_set_asset_archived") return null;
    return undefined;
  },
  serverFn(name, d) {
    if (/getGlobalFileUrls/.test(name)) return Object.fromEntries((d.paths ?? []).map((p) => [p, `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>`]));
    if (/createGlobalUpload/.test(name)) return { path: key(d.globalAssetId), token: "t", reservationId: "00000000-0000-4000-8000-00000000d099" };
    if (/registerGlobalVersion/.test(name)) return "00000000-0000-4000-8000-00000000c099";
    if (/saveAssetToGlobal/.test(name)) return { globalAssetId: "00000000-0000-4000-8000-00000000a098", versions: 2 };
    if (/copyGlobalToProject/.test(name))
      return Object.fromEntries((d.items ?? []).map((i) => {
        const v = g.versions.find((x) => x.id === i.globalVersionId);
        return [i.globalVersionId, { path: `${h.fx.project.id}/source/${i.projectAssetId}/${i.projectVersionId}/${sha}.png`, mimeType: v.mime_type, width: 10, height: 10, byteSize: 100, sha256: sha }];
      }));
    return undefined;
  },
});

async function open(page) {
  await page.getByTestId("open-global-library").click();
  await page.getByTestId("global-library-dialog").waitFor();
  await page.locator(`[data-global-asset="${GA}"]`).waitFor();
}

await h.run("g1-g7", "$P/bibliotek", async (page) => {
  await open(page);
  const dialog = page.getByTestId("global-library-dialog");
  // G6: søk og filter
  await dialog.getByTestId("global-search").fill("maskot");
  h.check(await dialog.locator("[data-global-asset]").count() === 1, "G6 søk på merke gir ett treff");
  await dialog.getByTestId("global-search").fill("");
  await dialog.getByTestId("global-filter-kind").selectOption("logo");
  h.check(await dialog.locator(`[data-global-asset="${LOGO}"]`).count() === 1 && await dialog.locator(`[data-global-asset="${GA}"]`).count() === 0, "G6 filter på type");
  await dialog.getByTestId("global-filter-kind").selectOption("all");
  // G5 og G7: varianter og forhåndsvisning
  await dialog.locator(`[data-global-asset="${GA}"]`).click();
  await dialog.getByTestId("global-detail").waitFor();
  h.check(await dialog.locator("[data-global-variant]").count() === 2, "G5 to varianter på samme ressurs");
  h.check(await dialog.locator("[data-global-version] img").count() >= 2, "G7 bildene forhåndsvises");
  h.check(/Jula på Dovre/.test(await dialog.getByTestId("global-used-in").innerText()), "brukt i prosjekter vises");
  // G1: ny global ressurs
  await dialog.getByTestId("global-create-name").fill("Ny logo");
  await dialog.getByTestId("global-create-file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
  await dialog.getByTestId("global-create-submit").click();
  await page.waitForTimeout(800);
  h.check(h.log.rpcs.some((r) => r.name === "global_create_asset" && r.body.p_name === "Ny logo"), "G1 ny global ressurs opprettes");
  h.check(h.log.serverFns.some((f) => /registerGlobalVersion/.test(f.name)), "G1 filen registreres som versjon");
  h.check(h.log.serverFns.some((f) => /registerGlobalVersion/.test(f.name) && JSON.stringify(f.data ?? f).includes("00000000-0000-4000-8000-00000000d099")), "N1 registreringen bruker reservasjonen");
});

await h.run("g3-g4-use", "$P/bibliotek", async (page) => {
  await open(page);
  const dialog = page.getByTestId("global-library-dialog");
  await dialog.locator(`[data-global-asset="${GA}"]`).click();
  await dialog.getByTestId("global-use-in-project").click();
  await page.waitForTimeout(1200);
  const types = h.log.commands.map((c) => c.type);
  h.check(types.includes("CreateAssets") && types.filter((t) => t === "CreateAssetVariant").length === 2, "G4 teamfiguren med varianter legges inn i prosjektet");
  h.check(h.log.commands.some((c) => c.type === "CreateAssets" && c.assets[0].globalAssetId === GA), "G3 prosjektressursen husker den globale ressursen");
  h.check(h.log.commands.filter((c) => c.type === "AddAssetVersion").every((c) => c.globalSource?.assetId === GA), "versjonene husker den globale versjonen");
  h.check(h.log.serverFns.some((f) => /copyGlobalToProject/.test(f.name)), "filen kopieres på serveren (ingen ny opplasting)");
});

await h.run("g2-save", "$P/bibliotek", async (page) => {
  await page.locator("[data-asset-row]").first().click();
  const save = page.getByTestId("save-to-global");
  await save.waitFor({ timeout: 5000 });
  await save.click();
  await page.waitForTimeout(500);
  h.check(h.log.serverFns.some((f) => /saveAssetToGlobal/.test(f.name)), "G2 «Lagre i globalt bibliotek» er en eksplisitt handling");
  h.check(h.log.commands.length === 0, "G2 prosjektressursen endres ikke");
});

await h.run("g8-g9-update", "$P/bibliotek", async (page) => {
  // Prosjektet har v1 av «Forfra»; gruppen har publisert v2
  const pid = h.fx.project.id;
  const aid = "00000000-0000-4000-8000-0000000d0001", vid = "00000000-0000-4000-8000-0000000d0002", verId = "00000000-0000-4000-8000-0000000d0003";
  projectRows = {
    assets: [...(h.fx.rows.assets ?? []), { id: aid, project_id: pid, revision: 1, kind: "character", name: "Teamfigur Maja", names: [], description: "", category: "", tags: [], archived: false, source_global_asset_id: GA }],
    asset_variants: [...(h.fx.rows.asset_variants ?? []), { id: vid, project_id: pid, revision: 1, asset_id: aid, name: "Forfra", style: "illustrated", appearance: "", approved_version_id: verId, archived: false }],
    asset_versions: [...(h.fx.rows.asset_versions ?? []), { id: verId, project_id: pid, revision: 1, variant_id: vid, number: 1, media_path: `${pid}/source/${aid}/${verId}/${sha}.png`, mime_type: "image/png", width: 10, height: 10, byte_size_big: 100, sha256: sha, note: "", created_at: "2026-10-18T00:00:00Z", created_by: USER.id, source_global_asset_id: GA, source_global_variant_id: GV1, source_global_version_id: g.versions[0].id }],
  };
  g.versions.push(version("00000000-0000-4000-8000-00000000c004", GV1, GA, 2));
  await page.reload({ waitUntil: "networkidle" });
  await open(page);
  const dialog = page.getByTestId("global-library-dialog");
  await dialog.getByTestId("global-updates").waitFor();
  h.check(/v1 → v2/.test(await dialog.getByTestId("global-updates").innerText()), "G8 ny versjon varsles, prosjektet er uendret");
  h.check(h.log.commands.length === 0, "G8 ingenting endres automatisk");
  await dialog.getByTestId(`global-update-${GV1}`).click();
  await page.waitForTimeout(1000);
  const add = h.log.commands.filter((c) => c.type === "AddAssetVersion");
  h.check(add.length === 1 && add[0].variantId === vid, "G9 brukeren tar inn den nye versjonen i samme variant");
  h.check(!h.log.commands.some((c) => c.type === "ApproveAssetVersion"), "G9 godkjent versjon endres ikke automatisk");
  projectRows = null;
  g.versions.pop();
});

wsRole = null;
await h.run("g10-no-access", "$P/bibliotek", async (page) => {
  await page.getByTestId("open-global-library").click();
  await page.getByTestId("global-no-access").waitFor();
  h.check(await page.locator("[data-global-asset]").count() === 0, "G10 uautoriserte ser ingen globale ressurser");
});
wsRole = "editor";

linked = false;
await h.run("not-linked", "$P/bibliotek", async (page) => {
  await page.getByTestId("open-global-library").click();
  await page.getByTestId("global-no-workspace").waitFor();
  h.check(true, "prosjekt uten arbeidsgruppe viser forklaring");
});
linked = true;

await h.run("english", "$P/bibliotek", async (page) => {
  await page.getByTestId("open-global-library").click();
  await page.getByTestId("global-library-dialog").waitFor();
  h.check(/Global library/.test(await page.getByTestId("global-library-dialog").innerText()), "engelsk tittel");
  await page.keyboard.press("Escape");
  await h.dialogsClosed(page);
  h.check(true, "dialogen lukkes");
}, { lang: "en" });

await h.done();
