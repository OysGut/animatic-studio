/** PTG7 media streaming only; all graph, geometry and timing policy lives in core/interchange. */
import type { InterchangeDoc } from '@/core/interchange/types';
import { compositingFiles } from '@/core/interchange/compositing';
import { interchangeReadme } from '@/core/interchange/readme';
import { t } from '@/core/i18n/keyed';
import { writeZip, type ZipSink } from './zip';
import { assertAeSafePaths, planPackageMedia } from '@/core/interchange/media-formats';
import { convertedMediaFiles, type MediaConverter } from './media-convert';

export async function exportCompositing(o: {
  doc: InterchangeDoc; sink: ZipSink; urls: Readonly<Record<string, string>>; signal: AbortSignal;
  converter?: MediaConverter;
}): Promise<{ missing: string[] }> {
  // Samme hviteliste og konvertering som After Effects-pakken (Nuke/Fusion leser heller ikke WebM)
  const plan = planPackageMedia(o.doc, { audio: false });
  const doc = plan.doc;
  assertAeSafePaths([...plan.keep.map(r => r.path), ...plan.convert.map(c => c.path)]);
  const entries = plan.keep.map(r => ({ path: r.path, mediaPath: r.mediaPath, byteSize: r.byteSize }));
  const failed: string[] = [];
  async function* files() {
    for (const file of compositingFiles(doc)) yield { path: file.path, data: new TextEncoder().encode(file.data) };
    yield { path: 'LESMEG.txt', data: interchangeReadme([
      t('ptg7.readme', {}, 'nb'), t('ptg7.readme', {}, 'en'),
      ...doc.shots.filter(s => !s.camera).flatMap(s => [t('ptg7.no-rig', { shot: s.name }, 'nb'), t('ptg7.no-rig', { shot: s.name }, 'en')]),
    ].join('\n\n')) };
  }
    yield* convertedMediaFiles({ convert: plan.convert, urls: o.urls, fps: doc.fps, signal: o.signal, failed, ...(o.converter ? { converter: o.converter } : {}) });
  }
  const r = await writeZip(o.sink, entries, o.urls, { extra: files(), signal: o.signal });
  return { missing: [...failed, ...r.missing] };
}