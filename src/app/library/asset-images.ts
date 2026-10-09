/**
 * Bilder i ressursbiblioteket: opplasting til den private bøtten «assets» og midlertidige visningslenker.
 * Filen lastes opp først; deretter lagres versjonen som en kommando (AddAssetVersion). Feiler opplastingen,
 * lagres ingenting.
 */
import { useQuery } from "@tanstack/react-query";
import { ASSET_MAX_BYTES, ASSET_MIME_TYPES, newId, type AssetMedia } from "@/core";
import { sha256Hex } from "@/engine/import/browser";
import { supabase } from "@/integrations/supabase/client";

export const ASSET_BUCKET = "assets";

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

export function checkImageFile(file: File): string | null {
  if (!ASSET_MIME_TYPES.includes(file.type)) return "Bildet må være PNG, JPEG, WebP eller GIF.";
  if (file.size > ASSET_MAX_BYTES) return "Bildet er større enn 2 GB.";
  if (file.size === 0) return "Filen er tom.";
  return null;
}

/** Last opp et bilde og returner data til AddAssetVersion. Kaster med norsk feilmelding. */
export async function uploadAssetImage(
  projectId: string,
  assetId: string,
  file: File,
): Promise<{ versionId: string; media: AssetMedia }> {
  const problem = checkImageFile(file);
  if (problem) throw new Error(problem);
  const versionId = newId<"asset_version">();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const [sha256, size] = await Promise.all([sha256Hex(bytes), imageSize(file)]);
  const path = `${projectId}/${assetId}/${versionId}/${safeFileName(file.name)}`;
  const { error } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message))
      throw new Error(
        "Lagringsbøtten for bilder mangler. Kjør migrasjon 0004 i Lovable (se LOVABLE_SYNC.md).",
      );
    throw new Error(`Bildet ble ikke lastet opp: ${error.message}`);
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
      const { data, error } = await supabase.storage
        .from(ASSET_BUCKET)
        .createSignedUrls(sorted, 60 * 60);
      if (error) throw new Error(error.message);
      const out: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
      return out;
    },
  });
}
