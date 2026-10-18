// @vitest-environment node
/** MT9: prosjektmal → global versjon → annet prosjekt → redigerbare lag. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../helpers/fake-supabase";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";
import {
  globalKindOf, projectKindOf, lowerThirdStarter, templateFromLayers,
  toRow, planUseGlobal, planApplyTemplate, instanceLayers, globalUpdates,
  type GlobalAsset, type GlobalVariant, type GlobalVersion,
} from "@/core";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@tanstack/react-start", async () => {
  const { serverFnStub } = await import("../helpers/verifisering3-db");
  return { createServerFn: serverFnStub() };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ get supabaseAdmin() { return h.db; } }));
vi.mock("@/adapters/browser/client", () => ({ get db() { return h.db; }, browserClient: {} }));
import { saveAssetToGlobal } from "@/adapters/global/global-library.functions";
import { listGlobalBundles } from "@/adapters/browser/global-library";

const WS = "00000000-0000-4000-8000-00000000aaaa";
const GA = "00000000-0000-4000-8000-00000000a010";
const GV = "00000000-0000-4000-8000-00000000b010";
const GVER = "00000000-0000-4000-8000-00000000c010";
const USER = "00000000-0000-4000-8000-000000001111";

function setup() {
  let s = fixture.state;
  const comp = Object.values(s.compositions).find((c) => !c.removed);
  if (!comp) throw new Error("Fixture mangler komposisjon");
  const layers = lowerThirdStarter(comp, { newLayerId: () => tid(), groupName: "LT", nameLabel: "Navn", roleLabel: "Rolle", name: "Æ Ø Å", role: "Regi" });
  s = mustApply(s, { type: "AddLayers", layers });
  const first = layers[0];
  if (!first) throw new Error("Fixture mangler lag");
  const def = templateFromLayers(s, comp.id, [first.layerId], { category: "lower_third" });
  const assetId = tid<"asset">(), variantId = tid<"asset_variant">(), versionId = tid<"asset_version">();
  s = mustApply(s, { type: "CreateAssets", assets: [{ assetId, fields: { kind: "template", name: "LT", names: [], description: "", category: "", tags: [] } }] });
  s = mustApply(s, { type: "CreateAssetVariant", variantId, assetId, fields: { name: "Standard", style: "other", appearance: "" } });
  s = mustApply(s, { type: "AddAssetVersion", variantId, versionId, template: def, note: "", media: { path: `${s.project.id}/${assetId}/${versionId}/mal.png`, mimeType: "image/png", width: 480, height: 270, byteSize: 100, sha256: "a".repeat(64) } });
  const tables: Record<string, Record<string, unknown>[]> = {
    workspace_members: [{ workspace_id: WS, user_id: USER, role: "editor" }],
    project_members: [{ project_id: s.project.id, user_id: USER, role: "owner" }],
    assets: [toRow("assets", s.assets[assetId], s.project.id)],
    asset_variants: [toRow("assetVariants", s.assetVariants[variantId], s.project.id)],
    asset_versions: [toRow("assetVersions", s.assetVersions[versionId], s.project.id)],
    global_assets: [], global_asset_variants: [], global_asset_versions: [],
  };
  const db = fakeDb(tables);
  const copy = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "global_create_asset") tables.global_assets.push({ id: GA, workspace_id: WS, kind: args.p_kind, name: "LT", revision: 1 });
    if (name === "global_create_variant") tables.global_asset_variants.push({ id: GV, workspace_id: WS, global_asset_id: GA, name: "Standard", style: "other" });
    if (name === "global_add_version") tables.global_asset_versions.push({ id: GVER, workspace_id: WS, global_asset_id: GA, variant_id: GV, number: 1, storage_key: args.p_storage_key, mime_type: args.p_mime, width: args.p_width, height: args.p_height, byte_size: args.p_bytes, sha256: args.p_sha256, template_spec: args.p_template_spec });
    return { data: name === "global_create_asset" ? GA : name === "global_create_variant" ? GV : GVER, error: null };
  });
  h.db = { ...db, rpc, storage: { from: () => ({ copy }) } };
  return { s, comp, def, assetId, rpc, copy };
}

beforeEach(() => { h.db = null; });
describe("MT9 globale maler", () => {
  it("beholder ressurstypen template i begge retninger", () => {
    expect(globalKindOf("template")).toBe("template");
    expect(projectKindOf("template")).toBe("template");
  });

  it("lagrer definisjonen globalt, leser den tilbake og bygger lag i et annet prosjekt", async () => {
    const x = setup();
    await saveAssetToGlobal({ data: { projectId: x.s.project.id, assetId: x.assetId, workspaceId: WS }, context: { supabase: h.db, userId: USER } } as never);
    expect(x.rpc).toHaveBeenCalledWith("global_add_version", expect.objectContaining({ p_template_spec: x.def }));
    expect(x.copy).toHaveBeenCalledTimes(1);
    const [bundle] = await listGlobalBundles(WS);
    if (!bundle) throw new Error("Global mal mangler");
    const version = bundle.versions[0], variant = bundle.variants[0];
    if (!version || !variant) throw new Error("Global versjon mangler");
    expect(version.template).toEqual(x.def);
    let target = { ...fixture.state, project: { ...fixture.state.project, id: tid<"project">() } };
    expect(target.project.id).not.toBe(x.s.project.id);
    const assetId = tid<"asset">(), versionId = tid<"asset_version">();
    const plan = planUseGlobal(target, bundle.asset, [{ version, variant, versionId, media: { path: `${target.project.id}/mal.png`, mimeType: "image/png", width: 480, height: 270, byteSize: 100, sha256: "a".repeat(64) } }], { assetId, variantIds: { [GV]: tid() } });
    expect(plan.commands.find((c) => c.type === "AddAssetVersion")).toMatchObject({ template: x.def });
    for (const c of plan.commands) target = mustApply(target, c);
    const instanceId = tid<"template_instance">();
    const apply = planApplyTemplate(target, { instanceId, compositionId: x.comp.id, versionId, newLayerId: () => tid() });
    if (!apply.ok) throw new Error(apply.reason);
    target = mustApply(target, apply.command);
    expect(instanceLayers(target, instanceId)).toHaveLength(x.def.elements.length);
    expect(instanceLayers(target, instanceId).filter((l) => l.text).map((l) => l.text?.content)).toEqual(["Æ Ø Å", "Regi"]);
  });

  it("varsler om ny global malversjon uten å endre godkjent versjon eller eksisterende lag", () => {
    const x = setup();
    const asset: GlobalAsset = { id: GA, workspaceId: WS, kind: "template", name: "LT", description: "", categories: [], tags: [], archived: false, revision: 1 };
    const variant: GlobalVariant = { id: GV, assetId: GA, name: "Standard", style: "other", appearance: "", archived: false };
    const version: GlobalVersion = { id: GVER, assetId: GA, variantId: GV, number: 1, storageKey: "mal.png", mimeType: "image/png", width: 480, height: 270, byteSize: 100, sha256: "a".repeat(64), durationMs: null, note: "", createdAt: "", template: x.def };
    const plan = planUseGlobal(x.s, asset, [{ version, variant, versionId: tid(), media: { path: `${x.s.project.id}/mal.png`, mimeType: "image/png", width: 480, height: 270, byteSize: 100, sha256: "a".repeat(64) } }], { assetId: tid(), variantIds: { [GV]: tid() } });
    let s = x.s;
    for (const c of plan.commands) s = mustApply(s, c);
    const before = structuredClone(s);
    expect(globalUpdates(s, [{ asset, variants: [variant], versions: [version, { ...version, id: tid(), number: 2 }] }])).toHaveLength(1);
    expect(s).toEqual(before);
  });
});