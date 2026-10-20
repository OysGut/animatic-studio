/**
 * Det globale biblioteket (GP2, migrasjon 0046) for nettleseren: lesing via RLS og skriving av metadata via
 * databasefunksjonene (rollen sjekkes der). Filer går gjennom serverfunksjonene i
 * `src/adapters/global/global-library.functions.ts`.
 */
import { isGlobalKind, type GlobalAsset, type GlobalAssetBundle, type GlobalKind, type GlobalVariant, type GlobalVersion, type VisualStyle, type TemplateDefinition } from "@/core";
import type { GlobalAnimationSpec } from "@/core/animation/global-rig";
import { browserClient, db } from "./client";
import { t } from "@/core/i18n/keyed";

function fail(e: { message: string } | null): void {
  if (e) throw new Error(e.message);
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const optNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Arbeidsgruppen prosjektet er koblet til (null = ingen). */
export async function getProjectWorkspace(projectId: string): Promise<string | null> {
  const { data, error } = await db.from("projects").select("workspace_id").eq("id", projectId).maybeSingle();
  fail(error);
  return ((data as { workspace_id?: string | null } | null)?.workspace_id ?? null) || null;
}

/** Alle globale ressurser i gruppen med varianter og versjoner. */
export async function listGlobalBundles(workspaceId: string): Promise<GlobalAssetBundle[]> {
  const [a, v, ver] = await Promise.all([
    db.from("global_assets").select("*").eq("workspace_id", workspaceId),
    db.from("global_asset_variants").select("*").eq("workspace_id", workspaceId),
    db.from("global_asset_versions").select("*").eq("workspace_id", workspaceId),
  ]);
  fail(a.error);
  fail(v.error);
  fail(ver.error);
  const assets: GlobalAsset[] = ((a.data ?? []) as Row[])
    .filter((r) => isGlobalKind(r["kind"]))
    .map((r) => ({
      id: str(r["id"]),
      workspaceId: str(r["workspace_id"]),
      kind: r["kind"] as GlobalKind,
      name: str(r["name"]),
      description: str(r["description"]),
      categories: strs(r["categories"]),
      tags: strs(r["tags"]),
      archived: r["archived_at"] !== null && r["archived_at"] !== undefined,
      revision: num(r["revision"]),
    }));
  const variants: GlobalVariant[] = ((v.data ?? []) as Row[]).map((r) => ({
    id: str(r["id"]),
    assetId: str(r["global_asset_id"]),
    name: str(r["name"]),
    style: str(r["style"]) as VisualStyle,
    appearance: str(r["appearance"]),
    archived: r["archived_at"] !== null && r["archived_at"] !== undefined,
  }));
  const versions: GlobalVersion[] = ((ver.data ?? []) as Row[]).map((r) => ({
    id: str(r["id"]),
    variantId: str(r["variant_id"]),
    assetId: str(r["global_asset_id"]),
    number: num(r["number"]),
    storageKey: str(r["storage_key"]),
    mimeType: str(r["mime_type"]),
    width: optNum(r["width"]),
    height: optNum(r["height"]),
    byteSize: num(r["byte_size"]),
    sha256: str(r["sha256"]),
    durationMs: optNum(r["duration_ms"]),
    note: str(r["note"]),
    createdAt: str(r["created_at"]),
    template: (r["template_spec"] ?? null) as TemplateDefinition | null,
  }));
  return assets.map((asset) => ({
    asset,
    variants: variants.filter((x) => x.assetId === asset.id),
    versions: versions.filter((x) => x.assetId === asset.id).sort((x, y) => y.number - x.number),
  }));
}

export async function globalAssetProjects(
  globalAssetId: string,
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db.rpc("global_asset_projects", { p_asset: globalAssetId });
  fail(error);
  return ((data ?? []) as { project_id: string; project_name: string }[]).map((r) => ({
    id: r.project_id,
    name: r.project_name,
  }));
}

export async function createGlobalAsset(
  workspaceId: string,
  f: { kind: GlobalKind; name: string; description: string; categories: string[]; tags: string[] },
): Promise<string> {
  const { data, error } = await db.rpc("global_create_asset", {
    p_workspace: workspaceId,
    p_kind: f.kind,
    p_name: f.name,
    p_description: f.description,
    p_categories: f.categories,
    p_tags: f.tags,
  });
  fail(error);
  return data as string;
}

export async function updateGlobalAsset(
  id: string,
  revision: number,
  f: { name: string; description: string; categories: string[]; tags: string[] },
): Promise<void> {
  const { error } = await db.rpc("global_update_asset", {
    p_asset: id,
    p_revision: revision,
    p_name: f.name,
    p_description: f.description,
    p_categories: f.categories,
    p_tags: f.tags,
  });
  fail(error);
}

export async function setGlobalAssetArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await db.rpc("global_set_asset_archived", { p_asset: id, p_archived: archived });
  fail(error);
}

export async function createGlobalVariant(
  assetId: string,
  f: { name: string; style: VisualStyle; appearance: string },
): Promise<string> {
  const { data, error } = await db.rpc("global_create_variant", {
    p_asset: assetId,
    p_name: f.name,
    p_style: f.style,
    p_appearance: f.appearance,
  });
  fail(error);
  return data as string;
}

/** Laster opp til en signert opplastingslenke fra serveren. */
export async function uploadToSignedPath(path: string, token: string, file: Blob): Promise<void> {
  try {
    const { data, error } = await browserClient.storage
      .from("assets")
      .uploadToSignedUrl(path, token, file, { ...(file.type ? { contentType: file.type } : {}), upsert: true });
    // Storage SDK parses JSON internally. Treat malformed/non-JSON responses as upload failures too.
    if (error || !data || typeof data.fullPath !== "string" || !data.fullPath)
      throw new Error("Invalid upload response");
  } catch {
    throw new Error(t("adapters-browser-global-library.upload-to-signed-path.message.465d07c915dc"));
  }
}

/** CA7 (migrasjon 0057): publiserte animasjonsoppsett i gruppen, nyeste først per variant. */
export async function listGlobalAnimationSpecs(workspaceId: string): Promise<GlobalAnimationSpec[]> {
  const { data, error } = await db.from("global_animation_specs").select("*").eq("workspace_id", workspaceId);
  fail(error);
  return ((data ?? []) as Row[])
    .map((r) => ({
      id: str(r["id"]),
      workspaceId: str(r["workspace_id"]),
      globalAssetId: str(r["global_asset_id"]),
      variantId: str(r["variant_id"]),
      number: num(r["number"]),
      rig: r["rig_spec"] as GlobalAnimationSpec["rig"],
      patterns: (Array.isArray(r["patterns"]) ? r["patterns"] : []) as GlobalAnimationSpec["patterns"],
      note: str(r["note"]),
      createdAt: str(r["created_at"]),
    }))
    .sort((a, b) => b.number - a.number);
}

/** Publiserer en ny, låst versjon av oppsettet (rollen sjekkes i databasen). */
export async function publishGlobalAnimation(
  variantId: string,
  rig: GlobalAnimationSpec["rig"],
  patterns: GlobalAnimationSpec["patterns"],
  note: string,
): Promise<string> {
  const { data, error } = await db.rpc("global_publish_animation", {
    p_variant: variantId,
    p_rig_spec: rig as never,
    p_patterns: patterns as never,
    p_note: note,
  });
  fail(error);
  return data as string;
}
