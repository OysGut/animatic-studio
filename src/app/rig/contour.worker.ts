import { chooseContourSource, computeContour } from '@/core/print/contour';
import type { ContourRequest } from './contour-client';
let logged = false;
self.onmessage = ({ data }: MessageEvent<ContourRequest & { id: number }>) => {
  const { id, rgba, ...options } = data;
  try {
    const start = performance.now();
    const source = chooseContourSource({ ...options, rgba: new Uint8Array(rgba) });
    if (!source.coverage) throw new Error('Missing coverage');
    const result = computeContour(source.coverage, { ...options, source: source.kind });
    if (!logged && options.width === 4096 && options.height === 4096) {
      console.info('Contour 4096×4096:', performance.now() - start, 'ms');
      logged = true;
    }
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
