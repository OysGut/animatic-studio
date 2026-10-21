/**
 * B-098: prosjektets egne fonter i nettleseren. Registrerer fontene fra prosjekttilstanden, og legger en
 * font fra Google Fonts inn i biblioteket som én ressurs (kind «font») med fontpakken som fil – ett angresteg.
 */
import { useEffect } from "react";
import {
  assetFilePath,
  encodeFontPack,
  FONT_PACK_EXT,
  FONT_PACK_MIME,
  newId,
  projectFontEntries,
  type CatalogFont,
  type Command,
  type FontFileRef,
  type FontSpec,
  type ProjectState,
} from "@/core";
import { t } from "@/core/i18n/keyed";
import { downloadFile, uploadFile } from "@/adapters/browser/storage-files";
import { ASSET_BUCKET } from "@/app/library/asset-images";
import { sha256Hex } from "@/engine/import/browser";
import { setProjectFontFetcher, syncProjectFonts } from "@/engine/typography/fonts";
import type { PackagedFontFile } from "@/adapters/fonts/google-fonts.functions";

setProjectFontFetcher(async (path) => {
  const r = await downloadFile(ASSET_BUCKET, path);
  if (r.error || !r.data) throw new Error("font download failed");
  return new Uint8Array(await r.data.arrayBuffer());
});

export function useSyncProjectFonts(state: ProjectState | undefined): void {
  useEffect(() => {
    if (state) syncProjectFonts(projectFontEntries(state));
  }, [state]);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Lager fontmetadata og pakke fra filene serveren hentet. Ren hjelper (testes). */
export function buildFontPack(
  font: CatalogFont,
  files: readonly PackagedFontFile[],
  subsets: readonly string[],
): { spec: FontSpec; bytes: Uint8Array } {
  const refs: FontFileRef[] = [];
  const data = new Map<string, Uint8Array>();
  files.forEach((f, i) => {
    const bytes = fromBase64(f.base64);
    const name = `${f.weight}${f.italic ? "i" : ""}-${f.subset ?? "all"}-${i}.${f.format}`;
    data.set(name, bytes);
    refs.push({
      name,
      weight: f.weight,
      italic: f.italic,
      format: f.format,
      ...(f.subset ? { subset: f.subset } : {}),
      ...(f.unicodeRange ? { unicodeRange: f.unicodeRange } : {}),
      bytes: bytes.length,
    });
  });
  const weights = [...new Set(files.map((f) => f.weight))].sort((a, b) => a - b);
  const italics = [...new Set(files.filter((f) => f.italic).map((f) => f.weight))].sort((a, b) => a - b);
  const spec: FontSpec = {
    family: font.family,
    category: font.category,
    weights,
    italics,
    subsets: subsets.length ? [...subsets] : [...font.subsets],
    license: font.license,
    sourceUrl: `https://fonts.google.com/specimen/${font.family.replace(/ /g, "+")}`,
    version: font.version,
    files: refs,
  };
  return { spec, bytes: encodeFontPack(spec, data) };
}

type RunAndWait = (c: Command, label: string, group?: string) => Promise<{ error: string | null }>;

/** Legger fonten inn i prosjektets bibliotek. Gir ressurs-ID-en (fontId er «asset:<id>»). */
export async function addFontToProject(
  runAndWait: RunAndWait,
  projectId: string,
  font: CatalogFont,
  files: readonly PackagedFontFile[],
  subsets: readonly string[],
): Promise<string> {
  const { spec, bytes } = buildFontPack(font, files, subsets);
  const assetId = newId<"asset">();
  const variantId = newId<"asset_variant">();
  const versionId = newId<"asset_version">();
  const safe = font.family.replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 80) || "font"; // i18n-ignore – filnavn
  const path = assetFilePath(projectId, "source", assetId, versionId, `${safe}.${FONT_PACK_EXT}`);
  const up = await uploadFile(ASSET_BUCKET, path, new Blob([bytes.slice().buffer], { type: "application/octet-stream" }), {
    contentType: "application/octet-stream",
    upsert: false,
  });
  if (up) throw new Error(t("b098.add.error.upload"));
  const sha256 = await sha256Hex(bytes);
  const group = `font-${assetId}`;
  const label = t("b098.add.undo-label", { family: font.family });
  const steps: Command[] = [
    {
      type: "CreateAssets",
      assets: [
        {
          assetId: assetId as never,
          fields: { kind: "font", name: font.family, names: [], description: "", category: font.category, tags: [] },
        },
      ],
    },
    {
      type: "CreateAssetVariant",
      variantId: variantId as never,
      assetId: assetId as never,
      fields: { name: t("b098.add.variant-name"), style: "other", appearance: "" },
    },
    {
      type: "AddAssetVersion",
      versionId: versionId as never,
      variantId: variantId as never,
      media: { path, mimeType: FONT_PACK_MIME, width: null, height: null, byteSize: bytes.length, sha256, durationMs: null },
      note: "",
      font: spec,
    },
  ];
  for (const c of steps) {
    const r = await runAndWait(c, label, group);
    if (r.error) throw new Error(r.error);
  }
  return assetId;
}
