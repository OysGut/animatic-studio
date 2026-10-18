/**
 * Handlingene i det globale biblioteket (GP2) som går gjennom serveren og kommandostakken.
 */
import {
  L,
  extensionOf,
  latestGlobalVersions,
  linkedProjectAsset,
  linkedProjectVersion,
  newId,
  planUseGlobal,
  type AssetId,
  type AssetVariantId,
  type AssetVersionId,
  type GlobalAssetBundle,
  type GlobalVersion,
  type ProjectState,
  type UseGlobalItem,
} from "@/core";
import {
  copyGlobalToProject,
  createGlobalUpload,
  registerGlobalVersion,
} from "@/adapters/global/global-library.functions";
import { uploadToSignedPath } from "@/adapters/browser/global-library";
import { sha256Hex } from "@/engine/import/browser";
import type { Commands } from "@/app/project/use-commands";
import { runGroup } from "@/app/storylab/canvas/run-group";

/**
 * «Bruk i prosjekt» (G3/G4): de valgte versjonene (standard: nyeste i hver variant som ikke er arkivert)
 * kopieres inn på serveren – bare de som ikke finnes i prosjektet fra før – og kobles inn som én angring.
 * Gir feilen (eller null) og prosjektressursen.
 */
export async function useGlobalInProject(
  state: ProjectState,
  cmds: Commands,
  bundle: GlobalAssetBundle,
  chosen?: readonly GlobalVersion[],
): Promise<{ error: string | null; assetId: string | null; reused: boolean }> {
  const latest = latestGlobalVersions(bundle.versions);
  const versions =
    chosen ??
    bundle.variants
      .filter((v) => !v.archived)
      .map((v) => latest.get(v.id))
      .filter((v): v is GlobalVersion => !!v);
  if (!versions.length)
    return {
      error: L("Ressursen har ingen filer ennå.", "The asset has no files yet."),
      assetId: null,
      reused: false,
    };
  const existing = linkedProjectAsset(state, bundle.asset.id);
  const assetId = (existing?.id ?? newId<"asset">()) as AssetId;
  const missing = versions.filter((v) => !linkedProjectVersion(state, v.id));
  const ids = new Map(missing.map((v) => [v.id, newId<"asset_version">()]));
  let media: Awaited<ReturnType<typeof copyGlobalToProject>> = {};
  if (missing.length)
    try {
      media = await copyGlobalToProject({
        data: {
          projectId: state.project.id,
          items: missing.map((v) => ({
            globalVersionId: v.id,
            projectAssetId: assetId,
            projectVersionId: ids.get(v.id)!,
          })),
        },
      });
    } catch (e) {
      return { error: (e as Error).message, assetId: null, reused: false };
    }
  const items: UseGlobalItem[] = [];
  for (const v of versions) {
    const variant = bundle.variants.find((x) => x.id === v.variantId);
    if (!variant) continue;
    const m = media[v.id];
    const vid = ids.get(v.id);
    items.push({
      version: v,
      variant,
      versionId: (vid ?? (linkedProjectVersion(state, v.id)?.id as AssetVersionId)) as AssetVersionId,
      media: m ?? { path: "", mimeType: v.mimeType, width: v.width, height: v.height, byteSize: v.byteSize, sha256: v.sha256 },
    });
  }
  const variantIds: Record<string, AssetVariantId> = {};
  for (const v of bundle.variants) variantIds[v.id] = newId<"asset_variant">();
  const plan = planUseGlobal(state, bundle.asset, items, { assetId, variantIds });
  if (!plan.commands.length) return { error: null, assetId: plan.assetId, reused: true };
  const error = await runGroup(
    cmds,
    plan.commands,
    L(`Bruk «${bundle.asset.name}» fra det globale biblioteket`, `Use “${bundle.asset.name}” from the global library`),
  );
  return { error, assetId: plan.assetId, reused: plan.reusedAsset };
}

async function imageSize(file: File): Promise<{ width: number | null; height: number | null }> {
  if (!file.type.startsWith("image/")) return { width: null, height: null };
  try {
    const bmp = await createImageBitmap(file);
    const r = { width: bmp.width, height: bmp.height };
    bmp.close();
    return r;
  } catch {
    return { width: null, height: null };
  }
}

async function audioMs(file: File): Promise<number | null> {
  if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) return null;
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
    const url = URL.createObjectURL(file);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration * 1000) : null);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    el.src = url;
  });
}

/** Ny global versjon (G1, G8): fila lastes opp til gruppens sti og registreres. Endrer ingen prosjekter. */
export async function uploadGlobalVersion(
  workspaceId: string,
  globalAssetId: string,
  variantId: string,
  file: File,
  note = "",
): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(bytes);
  const ext = extensionOf(file.name);
  const { path, token } = await createGlobalUpload({ data: { workspaceId, globalAssetId, sha256, ext } });
  await uploadToSignedPath(path, token, file);
  const size = await imageSize(file);
  await registerGlobalVersion({
    data: {
      variantId,
      path,
      mimeType: file.type || "application/octet-stream",
      width: size.width,
      height: size.height,
      byteSize: file.size,
      sha256,
      durationMs: await audioMs(file),
      note,
    },
  });
}
