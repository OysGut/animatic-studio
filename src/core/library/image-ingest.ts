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