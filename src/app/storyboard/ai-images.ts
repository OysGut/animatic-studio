/** Browser-only raster adapter: shared composition rendering, no prompts or provider calls. */
import { newId, type Command, type Composition, type ProjectState } from "@/core";
import { panelStructureFrame, containGeometry } from "@/core/storyboard/ai-output";
import { drawFrame, type ImageSource } from "@/engine/compositor/canvas";
import { uploadAssetImage, mediaFromStoredFile } from "@/app/library/asset-images";
import { claimMobileImport, linkMobileImport, type MobileImportRow } from "@/adapters/browser/mobile-import";
import { createSignedUrls } from "@/adapters/browser/storage-files";
import type { Commands } from "@/app/project/use-commands";
import { t } from "@/core/i18n/keyed";

async function blobOf(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/png"));
  if (!blob) throw Error(t("sb7.unavailable"));
  return blob;
}
async function saveImage(s: ProjectState, panel: Composition, blob: Blob, cmds: Commands, note: object) {
  const assetId = newId<"asset">(), variantId = newId<"asset_variant">(), group = newId();
  const commands: Command[] = [
    { type: "CreateAssets", assets: [{ assetId, fields: { kind: "other", name: t("sb7.sketch"), names: [], description: "", category: "", tags: [] } }] },
    { type: "CreateAssetVariant", assetId, variantId, fields: { name: t("sb7.sketch"), style: "other", appearance: "" } },
  ];
  for (const command of commands) { const r = await cmds.runAndWait(command, t("sb7.sketch"), group); if (r.error) throw Error(r.error); }
  const up = await uploadAssetImage(s.project.id, assetId, new File([blob], "panel-input.png", { type: "image/png" }));
  const result = await cmds.runAndWait({ type: "AddAssetVersion", versionId: up.versionId as never, variantId, media: up.media, note: JSON.stringify({ ...note, panelId: panel.id }) }, t("sb7.sketch"), group);
  if (result.error) throw Error(result.error);
  return up.versionId;
}

export async function rasterPanelInput(s: ProjectState, panel: Composition, basis: "composition" | "sketch", layerId: string | null, cmds: Commands) {
  const frame = panelStructureFrame(s, panel, basis, layerId);
  const paths = [...new Set(frame.items.flatMap(it => it.version ? [it.version.mediaPath] : []))];
  const urls = Object.fromEntries((await createSignedUrls("assets", paths, 600)).map(r => [r.path, r.signedUrl]));
  const images = new Map<string, ImageSource>();
  await Promise.all(paths.map(async path => {
    const url = urls[path]; if (!url) throw Error(t("sb7.unavailable"));
    const response = await fetch(url); if (!response.ok) throw Error(t("sb7.unavailable"));
    images.set(path, await createImageBitmap(await response.blob()));
  }));
  try {
    const canvas = document.createElement("canvas"); canvas.width = panel.width; canvas.height = panel.height;
    const ctx = canvas.getContext("2d"); if (!ctx) throw Error(t("sb7.unavailable"));
    drawFrame(ctx, frame, { images, placeholders: false, view: [1, 0, 0, 1, panel.width / 2, panel.height / 2] });
    return await saveImage(s, panel, await blobOf(canvas), cmds, { kind: "storyboard-structure", basis, layerId, panelRevision: panel.revision, layers: Object.values(s.layers).filter(l => l.compositionId === panel.id && !l.removed).map(l => [l.id, l.revision]) });
  } finally { for (const image of images.values()) if ("close" in image) (image as ImageBitmap).close(); }
}

/** Immutable padded derivative; source remains in the candidate and receipt. */
export async function fitCandidateImage(s: ProjectState, panel: Composition, path: string, ratio: number, cmds: Commands, sourceVersionId: string) {
  const urls = Object.fromEntries((await createSignedUrls("assets", [path], 600)).map(r => [r.path, r.signedUrl])); const url = urls[path];
  if (!url) throw Error(t("sb7.unavailable"));
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  try {
    const box = containGeometry(bmp.width, bmp.height, ratio);
    const c = document.createElement("canvas"); c.width = box.width; c.height = box.height;
    const ctx = c.getContext("2d"); if (!ctx) throw Error(t("sb7.unavailable"));
    ctx.drawImage(bmp, box.x, box.y);
    return await saveImage(s, panel, await blobOf(c), cmds, { kind: "storyboard-mask-fit", sourceVersionId, ratio, adaptation: "contain" });
  } finally { bmp.close(); }
}

/** Same claim/link lifecycle as mobile-import; source bytes stay immutable. */
export async function useMobilePanelSketch(s: ProjectState, panel: Composition, row: MobileImportRow, cmds: Commands) {
  if (row.project_id !== s.project.id || row.kind !== "image" || !row.mime_type.startsWith("image/") || !(await claimMobileImport(row.id))) throw Error(t("sb7.unavailable"));
  const media = await mediaFromStoredFile(row.path);
  const assetId = newId<"asset">(), variantId = newId<"asset_variant">(), versionId = newId<"asset_version">(), group = newId();
  const commands: Command[] = [
    { type: "CreateAssets", assets: [{ assetId, fields: { kind: "other", name: t("sb7.sketch"), names: [], description: "", category: "", tags: [] } }] },
    { type: "CreateAssetVariant", assetId, variantId, fields: { name: t("sb7.sketch"), style: "other", appearance: "" } },
    { type: "AddAssetVersion", versionId, variantId, media, note: JSON.stringify({ kind: "sketch", panelId: panel.id, mobileImportId: row.id }) },
  ];
  for (const command of commands) { const r = await cmds.runAndWait(command, t("sb7.sketch"), group); if (r.error) throw Error(r.error); }
  const error = await linkMobileImport(row.id, { assetId, versionId }); if (error) throw Error(t("sb7.unavailable"));
  return versionId;
}