import { scaledToFit, workingImageMaxSide } from '../composition';

export interface ImageIngestContext {
  readonly frameWidth: number;
  readonly frameHeight: number;
}
export interface ImageDimensions { readonly width: number; readonly height: number }
export type ImageUse = 'playback' | 'preview' | 'thumbnail' | 'export' | 'rig-pdf' | 'zoom';
export interface ImageFiles {
  readonly original: string;
  readonly working?: string;
  readonly proxy?: string;
  readonly thumbnail?: string;
}
/** Pure size plan: original pixels never change; derivatives never upscale. */
export function planImageIngest(source: ImageDimensions, context: ImageIngestContext) {
  const fit = (maxSide: number) => scaledToFit(source.width, source.height, maxSide) ?? source;
  const frameSide = Math.max(context.frameWidth, context.frameHeight);
  return {
    original: source,
    working: fit(workingImageMaxSide(context.frameWidth, context.frameHeight)),
    proxy: fit(Math.min(1920, frameSide > 0 ? frameSide : 1920)),
    thumbnail: fit(256),
  };
}
/** Original for export/physical printing and zoom above 100%; safe original fallback for old images. */
export function imageFileForUse(files: ImageFiles, use: ImageUse, zoom = 1): string {
  if (use === 'export' || use === 'rig-pdf' || (use === 'zoom' && zoom > 1)) return files.original;
  if (use === 'thumbnail') return files.thumbnail ?? files.proxy ?? files.original;
  return files.proxy ?? files.working ?? files.original;
}

/** En avledet fil knyttet til en ressursversjon (arbeidskopi, avspillingsproxy, miniatyr, rå TIFF). */
export interface DerivedImageFile {
  readonly path: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly byteSize: number;
  readonly sha256: string;
}
/**
 * De avledede filene til en bildeversjon (B-105a, migrasjon 0078). Originalen er selve versjonen;
 * `originalRaw` er den uendrede råfila når versjonen er en renderbar konvertering (TIFF → PNG).
 */
export interface DerivedImageFiles {
  readonly working?: DerivedImageFile;
  readonly proxy?: DerivedImageFile;
  readonly thumbnail?: DerivedImageFile;
  readonly originalRaw?: DerivedImageFile;
}
const DERIVED_KEYS = ['working', 'proxy', 'thumbnail', 'originalRaw'] as const;

/** Det lille versjonsutsnittet stivalget trenger (unngår import av hele modellen). */
export interface VersionImageRef {
  readonly mediaPath: string;
  readonly derivedFiles?: DerivedImageFiles;
}
/** Filene til en versjon: originalen er mediestien; avledede filer kommer fra derivedFiles. */
export function versionImageFiles(v: VersionImageRef): ImageFiles {
  return {
    original: v.mediaPath,
    ...(v.derivedFiles?.working ? { working: v.derivedFiles.working.path } : {}),
    ...(v.derivedFiles?.proxy ? { proxy: v.derivedFiles.proxy.path } : {}),
    ...(v.derivedFiles?.thumbnail ? { thumbnail: v.derivedFiles.thumbnail.path } : {}),
  };
}
/** Stien som skal brukes til et formål (for gamle versjoner uten avledede filer: alltid mediestien). */
export function versionImagePath(v: VersionImageRef, use: ImageUse, zoom = 1): string {
  return imageFileForUse(versionImageFiles(v), use, zoom);
}

/**
 * Validerer avledede filer før lagring. Returnerer en eksisterende i18n-nøkkel ved feil, ellers null
 * (gjenbruker meldingene for versjonsmedia, så ingen nye tekster trengs).
 */
export function derivedFilesError(d: unknown): string | null {
  if (d === null || typeof d !== 'object' || Array.isArray(d)) return 'core-commands-apply.run.fail.bf6e905ff6b8.2';
  for (const [key, value] of Object.entries(d as Record<string, unknown>)) {
    if (!(DERIVED_KEYS as readonly string[]).includes(key)) return 'core-commands-apply.run.fail.bf6e905ff6b8.2';
    if (value === undefined) continue;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return 'core-commands-apply.run.fail.bf6e905ff6b8.2';
    const f = value as Record<string, unknown>;
    if (typeof f['path'] !== 'string' || f['path'].length < 1 || f['path'].length > 500) return 'core-commands-apply.run.fail.bf6e905ff6b8.2';
    if (typeof f['sha256'] !== 'string' || !/^[0-9a-f]{64}$/.test(f['sha256'])) return 'core-commands-apply.run.fail.bacfc2e4bb12.2';
    if (typeof f['byteSize'] !== 'number' || !Number.isInteger(f['byteSize']) || f['byteSize'] <= 0) return 'core-commands-apply.run.fail.f79f89233d6b.2';
    for (const dim of [f['width'], f['height']])
      if (dim !== null && (typeof dim !== 'number' || !Number.isInteger(dim) || dim <= 0 || dim > 100_000))
        return 'core-commands-apply.run.fail.ab33cacf5990.2';
  }
  return null;
}