/**
 * Bildene i filmen (M4 del 1): signerte lenker for alle lagbilder i scenenes 2D-scener, og en felles
 * bildebuffer for visningen og miniatyrene i monteringen.
 */
import { useEffect, useMemo, useState } from "react";
import { layerVersion, layersOf, type FilmClip, type ProjectState } from "@/core";
import { ImageCache } from "@/engine/compositor/canvas";
import { useImageUrls } from "@/app/library/asset-images";

const listeners = new Set<() => void>();
export const filmImageCache = new ImageCache(() => {
  for (const l of listeners) l();
});

/** Mediestiene som klippene trenger. */
export function filmImagePaths(state: ProjectState, clips: readonly FilmClip[]): string[] {
  const out = new Set<string>();
  for (const c of clips) {
    if (!c.compositionId) continue;
    for (const l of layersOf(state, c.compositionId)) {
      const v = layerVersion(state, l);
      if (v) out.add(v.mediaPath);
    }
  }
  return [...out];
}

/**
 * Lenker til bildene (mediesti → lenke) og et tall som øker hver gang et bilde er lastet, så lerretene
 * kan tegnes på nytt.
 */
export function useFilmImages(state: ProjectState, clips: readonly FilmClip[]) {
  const paths = useMemo(() => filmImagePaths(state, clips), [state, clips]);
  const urls = useImageUrls(paths);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  useEffect(() => {
    if (urls.data) filmImageCache.ensure(urls.data);
  }, [urls.data]);
  return { urls: urls.data ?? null, loading: urls.isLoading, tick, paths };
}
