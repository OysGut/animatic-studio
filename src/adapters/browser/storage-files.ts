/**
 * Filer i lagringen (Supabase Storage) for nettleseren (KI-181): opplasting, nedlasting og midlertidige
 * lenker. Bøttene er private; lenkene er signerte og tidsbegrensede.
 */
import { browserClient, plainError, type BackendError, type BackendResult } from "./client";

/** Bøtta for ressurser, filmer og AI-resultater. */
export const ASSET_BUCKET = "assets";
/** Bøtta for originalfilene ved manusimport. */
export const SOURCE_BUCKET = "sources";

export interface UploadOptions {
  readonly contentType?: string;
  readonly upsert: boolean;
}

/** Last opp en fil. Gir feilen (null = lastet opp). */
export async function uploadFile(
  bucket: string,
  path: string,
  body: Blob,
  options: UploadOptions,
): Promise<BackendError | null> {
  const { error } = await browserClient.storage.from(bucket).upload(path, body, options);
  return plainError(error);
}

/** Last ned en fil. */
export async function downloadFile(
  bucket: string,
  path: string,
): Promise<BackendResult<Blob | null>> {
  const { data, error } = await browserClient.storage.from(bucket).download(path);
  return { data, error: plainError(error) };
}

export interface SignedUrl {
  readonly path: string;
  readonly signedUrl: string;
}

/** Midlertidige lenker for én porsjon stier (de som fikk lenke). Kaster med feilmeldingen fra lagringen. */
export async function createSignedUrls(
  bucket: string,
  paths: string[],
  seconds: number,
): Promise<SignedUrl[]> {
  const { data, error } = await browserClient.storage.from(bucket).createSignedUrls(paths, seconds);
  if (error) throw new Error(error.message);
  const out: SignedUrl[] = [];
  for (const d of data ?? [])
    if (d.path && d.signedUrl) out.push({ path: d.path, signedUrl: d.signedUrl });
  return out;
}
