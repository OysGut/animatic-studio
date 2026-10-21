import type { SourceOptions, ContourResult } from '@/core/print/contour';
export interface ContourRequest extends Omit<SourceOptions, 'rgba'> {
  rgba: ArrayBuffer;
  mmPerPixel: number;
  cutHoles: boolean;
  strokeWidthMm: number;
}
const cache = new Map<string, ContourResult>();
/** Each preview owns its worker; changing input terminates obsolete computation. */
export class ContourClient {
  private worker?: Worker;
  private id = 0;
  private reject?: (reason: Error) => void;
  cancel() {
    this.id++;
    this.worker?.terminate();
    this.worker = undefined;
    this.reject?.(new DOMException('Cancelled', 'AbortError'));
    this.reject = undefined;
  }
  compute(key: string, request: ContourRequest): Promise<ContourResult> {
    this.cancel();
    const cached = cache.get(key);
    if (cached) return Promise.resolve(cached);
    const id = ++this.id;
    const worker = new Worker(new URL('./contour.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    return new Promise((resolve, reject) => {
      this.reject = reject;
      worker.onmessage = ({ data }) => {
        if (data.id !== this.id) return;
        this.reject = undefined;
        worker.terminate();
        this.worker = undefined;
        if (data.error) reject(new Error(data.error));
        else {
          if (cache.size >= 64) cache.delete(cache.keys().next().value!);
          cache.set(key, data.result);
          resolve(data.result);
        }
      };
      worker.onerror = () => { this.cancel(); reject(new Error('Worker failed')); };
      worker.postMessage({ ...request, id }, [request.rgba]);
    });
  }
}
