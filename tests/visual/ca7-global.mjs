/** CA7: arvet karakteratferd, «brukes i N andre scener», bare her / oppdater alle, historikk og globalt bibliotek. Ingen betalte kall. */
import { harness } from "./mts-harness.mjs";
import { byLang } from "./ui-lang.mjs";
if (!process.argv[3]) process.argv[3] = "/tmp/claude-0/visual-fixture.json";
const h = harness("/tmp/claude-0/ca7-global");
const ID = n => `01900000-0000-7000-8000-0057${String(n).padStart(8, "0")}`;
const layer = h.rows.composition_layers.find(l => !l.removed && l.asset_id && h.rows.asset_versions.some(v => h.rows.asset_variants.some(a => a.id === v.variant_id && a.asset_id === l.asset_id) && v.mime_type.startsWith("image/")));
const comp = h.rows.compositions.find(c => c.id === layer?.composition_id), occ = h.rows.scene_occurrences.find(o => o.variant_id === comp?.variant_id && o.active);
const other = h.rows.scene_occurrences.find(o => o.active && o.id !== occ?.id);
const source = h.rows.asset_versions.find(v => v.id === layer?.version_id) ?? h.rows.asset_versions.find(v => h.rows.asset_variants.some(a => a.id === v.variant_id && a.asset_id === layer?.asset_id));
if (!layer || !comp || !occ || !other || !source) throw new Error("Missing fixture");
const pid = h.fx.project.id;
const WS = ID(40), GA = ID(41), GV = ID(42), GVER = ID(43);
const anchors1 = { mouth: { x: .5, y: .6 }, leftEye: { x: .4, y: .3 }, rightEye: { x: .6, y: .3 } };
const anchors2 = { ...anchors1, mouth: { x: .45, y: .65 } };
h.rows.animation_rigs = [{ id: ID(1), project_id: pid, revision: 1, variant_id: source.variant_id, current_version_id: ID(5), removed: false }];
h.rows.animation_rig_versions = [
  { id: ID(2), project_id: pid, revision: 1, rig_id: ID(1), source_version_id: source.id, number: 1, spec: { format: 1, anchors: anchors1 }, algorithm_version: 1, removed: false },
  { id: ID(5), project_id: pid, revision: 1, rig_id: ID(1), source_version_id: source.id, number: 2, spec: { format: 1, anchors: anchors2, behavior: { blinkEnabled: false }, origin: { globalSpecId: ID(60), globalNumber: 1, globalVariantId: GV } }, algorithm_version: 1, removed: false },
];
h.rows.animation_uses = [
  { id: ID(3), project_id: pid, revision: 1, layer_id: layer.id, occurrence_id: occ.id, rig_version_id: ID(5), enabled: true, removed: false, behavior: null },
  { id: ID(4), project_id: pid, revision: 1, layer_id: layer.id, occurrence_id: other.id, rig_version_id: ID(5), enabled: true, removed: false, behavior: null },
];
// Globalt bibliotek: prosjektet er koblet til en arbeidsgruppe der jeg er redaktør
h.fx.project.workspace_id = WS;
h.rows.workspaces = [{ id: WS, name: "Trollfilm" }];
h.rows.workspace_members = [{ workspace_id: WS, user_id: "00000000-0000-7000-8000-a11ce0000001", role: "editor", removed_at: null }];
h.rows.global_assets = [{ id: GA, workspace_id: WS, kind: "character", name: "Figur", description: "", categories: [], tags: [], archived_at: null, revision: 1 }];
h.rows.global_asset_variants = [{ id: GV, workspace_id: WS, global_asset_id: GA, name: "Standard", style: "reference", appearance: "", archived_at: null }];
h.rows.global_asset_versions = [{ id: GVER, workspace_id: WS, global_asset_id: GA, variant_id: GV, number: 1, storage_key: `global/${WS}/${GA}/${source.sha256}.png`, mime_type: source.mime_type, width: 10, height: 10, byte_size: 10, sha256: source.sha256, duration_ms: null, note: "", created_at: "2026-10-19T10:00:00Z", template_spec: null }];
const globalRig = { format: 1, anchors: { ...anchors2, nose: { x: .5, y: .45 } }, parts: {}, behavior: { blinkEnabled: true }, sourceGlobalVersionId: GVER };
h.rows.global_animation_specs = [
  { id: ID(60), workspace_id: WS, global_asset_id: GA, variant_id: GV, number: 1, rig_spec: { format: 1, anchors: anchors2, sourceGlobalVersionId: GVER }, patterns: [], note: "", created_at: "2026-10-19T10:00:00Z" },
  { id: ID(61), workspace_id: WS, global_asset_id: GA, variant_id: GV, number: 2, rig_spec: globalRig, patterns: [], note: "", created_at: "2026-10-19T11:00:00Z" },
];

async function openCharacter(page) {
  await (async () => { const g = page.getByTestId("scene-track-groups"); await g.waitFor(); if ((await g.getAttribute("data-open")) !== "true") await page.getByTestId("scene-track-groups-toggle").click(); await page.getByTestId("animation-workspace").waitFor(); })();
  await page.locator(`[data-anim-track="${layer.id}"]`).getByTestId("anim-segment").first().click();
  await page.getByTestId("ca7-character-open").click();
  await page.getByTestId("ca7-character-dialog").waitFor();
}
await h.scenario("ca7-inherit-adopt", occ.id, "nb", async page => {
  await openCharacter(page);
  h.check((await page.getByTestId("ca7-other-count").textContent())?.includes(byLang("nb", "1 annen scene", "1 other scene")), "«brukes i 1 annen scene» vises");
  h.check(await page.getByTestId(`ca7-jump-${other.id}`).isVisible(), "listen har hopp til den andre scenen");
  h.check(await page.getByTestId("ca7-behavior-blinkEnabled").getAttribute("data-source") === "character", "blink arves fra karakteren");
  await page.getByTestId("ca7-breath").check();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SetAnimationBehavior" && c.behavior?.breath?.enabled === true)), "pust settes som lokal verdi");
  h.check(await h.eventually(async () => await page.getByTestId("ca7-behavior-breath").getAttribute("data-source") === "local"), "lokal overstyring vises tydelig");
  await page.getByTestId("ca7-save-default").click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SaveRigVersion" && c.spec?.behavior?.breath?.enabled === true)), "ny standard lagres som ny versjon av oppsettet");
  await page.getByTestId("ca7-adopt-dialog").waitFor();
  h.check(!h.state.commands.some(c => c.type === "AdoptRigVersion"), "ingenting oppdateres automatisk");
  await page.getByTestId("ca7-adopt-all").click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "AdoptRigVersion" && c.useIds?.length === 2)), "«oppdater alle» flytter begge scenene i én kommando");
  await page.screenshot({ path: `${h.out}/inherit.png` });
});
await h.scenario("ca7-history", occ.id, "nb", async page => {
  await openCharacter(page);
  await page.getByTestId("ca7-history-open").click();
  await page.getByTestId("ca7-history-dialog").waitFor();
  await page.getByTestId("ca7-history-1").click();
  h.check(await page.getByTestId("ca7-compare").isVisible(), "sammenligning med denne scenens versjon");
  h.check((await page.getByTestId("ca7-compare").textContent())?.includes("mouth"), "forskjellen i munnankeret vises");
  await page.getByTestId("ca7-restore-1").click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SaveRigVersion" && c.spec?.anchors?.mouth?.x === .5 && !c.spec?.behavior)), "gjenopprett lager en ny versjon fra versjon 1");
  await page.getByTestId("ca7-adopt-here").click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "AdoptRigVersion" && c.useIds?.length === 1 && c.useIds[0] === ID(3))), "«bare her» flytter bare denne scenen");
  h.check(!h.state.commands.some(c => c.type === "RemoveAnimationPattern"), "ingenting slettes");
});
await h.scenario("ca7-jump", occ.id, "nb", async page => {
  await openCharacter(page);
  await page.getByTestId(`ca7-jump-${other.id}`).click();
  h.check(await h.eventually(async () => !(await page.getByTestId("ca7-character-dialog").isVisible())), "hopp til scenen lukker dialogen");
});
await h.scenario("ca7-global", occ.id, "nb", async page => {
  await openCharacter(page);
  await page.getByTestId("ca7-publish").waitFor({ timeout: 8000 });
  await page.getByTestId("ca7-publish").click();
  h.check(await h.eventually(() => h.state.rpcs.some(r => r.name === "global_publish_animation" && r.body?.p_variant === GV && r.body?.p_rig_spec?.sourceGlobalVersionId === GVER)), "publisering lager en låst global versjon med globale bilde-ID-er");
  h.check(!h.state.commands.some(c => c.type === "SaveRigVersion"), "publisering endrer ikke prosjektet");
  await page.getByTestId("ca7-global-update").waitFor({ timeout: 8000 });
  await page.getByTestId("ca7-global-update").click();
  await page.getByTestId("ca7-update-confirm").waitFor();
  h.check(!h.state.commands.some(c => c.type === "SaveRigVersion"), "oppdatering venter på bekreftelse");
  await page.getByTestId("ca7-update-yes").click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SaveRigVersion" && c.spec?.origin?.globalNumber === 2 && c.spec?.anchors?.nose)), "global versjon 2 tas inn som ny prosjektversjon");
  await page.getByTestId("ca7-adopt-dialog").waitFor();
  h.check(!h.state.commands.some(c => c.type === "AdoptRigVersion"), "scenene beholder sin versjon til brukeren velger");
  await page.screenshot({ path: `${h.out}/global.png` });
});
await h.scenario("ca7-en", occ.id, "en", async page => {
  await openCharacter(page);
  h.check((await page.getByTestId("ca7-other-count").textContent())?.includes("Used in 1 other scene"), "engelsk «used in 1 other scene»");
  h.check(await page.getByText("Inherited from the character").first().isVisible(), "engelsk arvemerking");
});
await h.finish();
