import { planImageIngest, type ImageIngestContext } from '@/core/library/image-ingest';
import { imageDims, isTiff, prepareImage, tiffToPng } from './image-prep';
import { t } from '@/core/i18n/keyed';

/** Browser-only decoding/encoding. The original File is returned byte-for-byte unchanged. */
export async function ingestImage(
  file: File,
  context: ImageIngestContext,
  maxSide?: number | null,
) {
  const decoded = isTiff(file) ? await tiffToPng(file) : file;
  const dimensions = await imageDims(decoded);
  if (!dimensions) throw new Error(t('app-library-image-prep.tiff-to-png.message.07b6500cee95'));
  const plan = planImageIngest(dimensions, context);
  const prepared =
    maxSide === null
      ? { working: decoded, workingNote: '', original: null }
      : await prepareImage(decoded, maxSide ?? Math.max(plan.working.width, plan.working.height));
  const bitmap = await createImageBitmap(decoded);
  try {
    const encode = async (size: { width: number; height: number }, suffix: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = size.width; canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(t('app-library-image-prep.downscale.message.db490d24b154'));
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => {
        if (value) resolve(value);
        else reject(new Error(t('app-library-image-prep.blob.fail.750a8616edfc')));
      }, 'image/webp', 0.92));
      return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-${suffix}.webp`, { type: blob.type });
    };
    // Sequential encoding keeps peak memory lower for large sources.
    const proxy = await encode(plan.proxy, 'proxy');
    const thumbnail = await encode(plan.thumbnail, 'thumbnail');
    return {
      original: file,
      /** Renderbar original i full størrelse (TIFF dekodet til PNG, ellers filen selv). */
      decoded,
      working: prepared.working,
      workingNote: prepared.workingNote,
      proxy,
      thumbnail,
      dimensions,
      plan,
    };
  } finally { bitmap.close(); }
}