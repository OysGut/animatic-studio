import { describe, expect, it } from 'vitest';
import { planImageIngest, imageFileForUse } from '@/core/library/image-ingest';
import { LruCache } from '@/core/library/lru';

describe('B-105a image quality rules', () => {
  it('6000×4000 keeps original; working, proxy and thumbnail preserve ratio', () => {
    expect(planImageIngest({ width: 6000, height: 4000 }, { frameWidth: 1920, frameHeight: 1080 })).toEqual({
      original: { width: 6000, height: 4000 }, working: { width: 3840, height: 2560 },
      proxy: { width: 1920, height: 1280 }, thumbnail: { width: 256, height: 171 },
    });
  });
  it('proxy follows smaller film resolution', () => {
    expect(planImageIngest({ width: 6000, height: 4000 }, { frameWidth: 1280, frameHeight: 720 }).proxy).toEqual({ width: 1280, height: 853 });
  });
  it('never upscales a small image', () => {
    const plan = planImageIngest({ width: 100, height: 80 }, { frameWidth: 1920, frameHeight: 1080 });
    expect(plan.proxy).toEqual({ width: 100, height: 80 }); expect(plan.thumbnail).toEqual(plan.original);
  });
  const files = { original: 'original.tif', working: 'working.png', proxy: 'proxy.webp', thumbnail: 'thumbnail.webp' };
  it.each(['export', 'rig-pdf'] as const)('%s always selects original', use => { expect(imageFileForUse(files, use)).toBe('original.tif'); });
  it('strong zoom selects original', () => { expect(imageFileForUse(files, 'zoom', 1.01)).toBe('original.tif'); });
  it.each(['playback','preview'] as const)('%s selects proxy', use => { expect(imageFileForUse(files, use)).toBe('proxy.webp'); });
  it('lists select thumbnail and older versions fall back to original', () => {
    expect(imageFileForUse(files, 'thumbnail')).toBe('thumbnail.webp');
    expect(imageFileForUse({ original: 'old.png' }, 'preview')).toBe('old.png');
  });
  it('contour LRU retains at most 64 and preserves recently inspected entries', () => {
    const cache = new LruCache<number, string>(64);
    for (let n = 0; n < 64; n++) cache.set(n, String(n));
    expect(cache.get(0)).toBe('0'); cache.set(64, '64');
    expect(cache.size).toBe(64); expect(cache.get(1)).toBeUndefined(); expect(cache.get(0)).toBe('0');
  });
});