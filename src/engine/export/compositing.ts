/** PTG7 media streaming only; all graph, geometry and timing policy lives in core/interchange. */
import type { InterchangeDoc } from '@/core/interchange/types';
import { compositingFiles } from '@/core/interchange/compositing';
import { interchangeReadme } from '@/core/interchange/readme';
import { t } from '@/core/i18n/keyed';
import { writeZip, type ZipSink } from './zip';

export async function exportCompositing(o: {
  doc: InterchangeDoc; sink: ZipSink; urls: Readonly<Record<string, string>>; signal: AbortSignal;
}): Promise<void> {
  const used = new Set(o.doc.shots.flatMap(s => s.layers.flatMap(l => [l.fileId, ...l.swaps.map(w => w.fileId)].filter((id): id is string => !!id))));
  const entries = o.doc.references.filter(r => used.has(r.id)).map(r => ({ path: r.path, mediaPath: r.mediaPath, byteSize: r.byteSize }));
  async function* files() {
    for (const file of compositingFiles(o.doc)) yield file;
    yield { path: 'LESMEG.txt', data: interchangeReadme([
      t('ptg7.readme', {}, 'nb'), t('ptg7.readme', {}, 'en'),
      ...o.doc.shots.filter(s => !s.camera).flatMap(s => [t('ptg7.no-rig', { shot: s.name }, 'nb'), t('ptg7.no-rig', { shot: s.name }, 'en')]),
    ].join('\n\n')) };
  }
  await writeZip(o.sink, entries, o.urls, { extra: files(), signal: o.signal });
}