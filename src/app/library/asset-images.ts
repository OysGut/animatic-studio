/**
 * Bilder i ressursbiblioteket: opplasting til den private bøtten «assets» og midlertidige visningslenker.
 * Filen lastes opp først; deretter lagres versjonen som en kommando (AddAssetVersion). Feiler opplastingen,
 * lagres ingenting.
 */
import { useQuery } from "@tanstack/react-query";
import { assetFilePath, ASSET_MAX_BYTES, ASSET_MIME_TYPES, newId, type AssetMedia, type AssetVariantId, type Command } from "@/core";
import { isTiff, prepareImage } from "./image-prep";
import { sha256Hex } from "@/engine/import/browser";
import {
  ASSET_BUCKET,
  createSignedUrls,
  downloadFile,
  uploadFile,
} from "@/adapters/browser/storage-files";
import { t } from "@/core/i18n/keyed";

export { ASSET_BUCKET };

/** Filnavn som lagringstjenesten godtar (bare ASCII; æ/ø/å gjøres om), uten «..». */
export function safeFileName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[æÆ]/g, "ae")
      .replace(/[øØ]/g, "o")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/\.{2,}/g, ".")
      .replace(/^[_.]+|_+$/g, "")
      .slice(-120) || "bilde"
  );
}

async function imageSize(file: File): Promise<{ width: number | null; height: number | null }> {
  try {
    const bmp = await createImageBitmap(file);
    const out = { width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  } catch {
    return { width: null, height: null };
  }
}

/** Filtypene bildevelgerne godtar: bildeformatene + TIFF (gjøres om til PNG ved opplasting). */
export const IMAGE_ACCEPT = [...ASSET_MIME_TYPES, "image/tiff", ".tif", ".tiff"].join(",");

export function checkImageFile(file: File): string | null {
  if (file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name))
    return t("app-library-asset-images.check-image-file.message.8c338d328c16");
  if (!ASSET_MIME_TYPES.includes(file.type) && !isTiff(file))
    return t("app-library-asset-images.check-image-file.message.ebded7c85066");
  if (file.size > ASSET_MAX_BYTES)
    return t("app-library-asset-images.check-image-file.message.578b4a2c9f82");
  if (file.size === 0) return t("app-library-asset-images.check-image-file.message.c12865f50004");
  return null;
}

export interface UploadedImage {
  readonly versionId: string;
  readonly media: AssetMedia;
  /** Merknad til versjonen (TIFF gjort om, skalert ned …), eller tom. */
  readonly note: string;
  /** Originalen i full størrelse når bildet er skalert ned (lagres som versjonen før). */
  readonly original: {
    readonly versionId: string;
    readonly media: AssetMedia;
    readonly note: string;
  } | null;
}

/**
 * Last opp et bilde og returner data til AddAssetVersion. TIFF gjøres om til PNG, og bilder større enn
 * `maxSide` får en nedskalert arbeidskopi i tillegg til originalen (Mars 2026-10-13). `maxSide` null: ingen
 * nedskalering. Kaster med norsk feilmelding.
 */
export async function uploadAssetImage(
  projectId: string,
  assetId: string,
  file: File,
  maxSide: number | null = null,
): Promise<UploadedImage> {
  const problem = checkImageFile(file);
  if (problem) throw new Error(problem);
  const prepared = await prepareImage(file, maxSide);
  const original = prepared.original
    ? {
        ...(await uploadOne(projectId, assetId, prepared.original.file)),
        note: prepared.original.note,
      }
    : null;
  const working = await uploadOne(projectId, assetId, prepared.working);
  return { ...working, note: prepared.workingNote, original };
}

/**
 * Legg den opplastede filen inn som versjon(er) i varianten: originalen først (hvis bildet ble skalert ned),
 * så arbeidskopien – som ett angresteg. Returnerer feilmelding eller null.
 */
export async function addUploadedImage(
  runAndWait: (c: Command, label: string, group?: string) => Promise<{ error: string | null }>,
  variantId: string,
  up: UploadedImage,
  label: string,
  note = "",
): Promise<string | null> {
  const group = `opplasting-${up.versionId}`;
  const join = (...xs: string[]) => xs.filter(Boolean).join(" ");
  if (up.original) {
    const r = await runAndWait(
      {
        type: "AddAssetVersion",
        versionId: up.original.versionId as never,
        variantId: variantId as AssetVariantId,
        media: up.original.media,
        note: join(note, up.original.note).slice(0, 2000),
      },
      label,
      group,
    );
    if (r.error) return r.error;
  }
  const r = await runAndWait(
    {
      type: "AddAssetVersion",
      versionId: up.versionId as never,
      variantId: variantId as AssetVariantId,
      media: up.media,
      note: join(note, up.note).slice(0, 2000),
    },
    label,
    group,
  );
  return r.error;
}

async function uploadOne(
  projectId: string,
  assetId: string,
  file: File,
): Promise<{ versionId: string; media: AssetMedia }> {
  const versionId = newId<"asset_version">();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const [sha256, size] = await Promise.all([sha256Hex(bytes), imageSize(file)]);
  const path = assetFilePath(projectId, "source", assetId, versionId, safeFileName(file.name));
  const error = await uploadFile(ASSET_BUCKET, path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    if (/bucket not found/i.test(error.message))
      throw new Error(
        t("app-library-asset-images.upload-one.message.0cb14e697856"),
      );
    throw new Error(
      t("app-library-asset-images.upload-one.message.de961140f8b0", { message: String(error.message) }),
    );
  }
  return {
    versionId,
    media: {
      path,
      mimeType: file.type,
      width: size.width,
      height: size.height,
      byteSize: file.size,
      sha256,
    },
  };
}

/** Midlertidige lenker (1 time) til bildene, hentet samlet. */
export function useImageUrls(paths: readonly string[]) {
  const sorted = [...new Set(paths)].sort();
  return useQuery({
    queryKey: ["asset-image-urls", sorted.join("|")],
    enabled: sorted.length > 0,
    staleTime: 50 * 60 * 1000,
    // Lenkene varer en time: hent nye før de går ut
    refetchInterval: 50 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const out: Record<string, string> = {};
      for (const d of await createSignedUrls(ASSET_BUCKET, sorted, 60 * 60))
        out[d.path] = d.signedUrl;
      return out;
    },
  });
}

/** Midlertidige lenker for mange filer (zip-nedlasting), hentet i porsjoner. */
export async function signedUrls(
  paths: readonly string[],
  seconds = 6 * 60 * 60,
): Promise<Record<string, string>> {
  const list = [...new Set(paths)];
  const out: Record<string, string> = {};
  for (let i = 0; i < list.length; i += 200) {
    for (const d of await createSignedUrls(ASSET_BUCKET, list.slice(i, i + 200), seconds))
      out[d.path] = d.signedUrl;
  }
  return out;
}

/**
 * Bildedata til AddAssetVersion for en fil som allerede ligger i lagringen (et AI-bilde som ikke ble lagt
 * inn i biblioteket fordi siden ble lukket). Kaster med norsk feilmelding.
 */
export async function mediaFromStoredFile(path: string): Promise<AssetMedia> {
  const { data, error } = await downloadFile(ASSET_BUCKET, path);
  if (error || !data)
    throw new Error(
      error?.message ? t("app-library-asset-images.image-fetch-failed", { error: error.message }) : t("app-library-asset-images.image-fetch-failed-unknown"),
    );
  const mimeType = ASSET_MIME_TYPES.includes(data.type) ? data.type : "image/png";
  const file = new File([data], path.split("/").pop() ?? "bilde.png", { type: mimeType });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const [sha256, size] = await Promise.all([sha256Hex(bytes), imageSize(file)]);
  return {
    path,
    mimeType,
    width: size.width,
    height: size.height,
    byteSize: file.size,
    sha256,
  };
}
