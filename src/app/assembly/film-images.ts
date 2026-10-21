/**
 * Bildene i filmen (M4 del 1): signerte lenker for alle lagbilder i scenenes 2D-scener, og en felles
 * bildebuffer for visningen og miniatyrene i monteringen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { layerVersions, layersOf, versionImagePath, type FilmClip, type ProjectState } from "@/core";
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
      // B-105a: avspilling og miniatyrer bruker proxyn når den finnes (fallback: originalen)
      for (const v of layerVersions(state, l)) out.add(versionImagePath(v, "playback"));
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
  // Bufferen deles av monteringen, sammenligningen og nabosceneene: hver visning holder sine egne bilder i
  // bruk, så en visning kan ikke kaste bilder en annen fortsatt tegner. Lukkes visningen, frigjøres de.
  const consumer = useRef<object>({});
  useEffect(() => {
    if (urls.data) filmImageCache.ensure(urls.data, consumer.current);
  }, [urls.data]);
  useEffect(() => {
    const c = consumer.current;
    return () => filmImageCache.release(c);
  }, []);
  return { urls: urls.data ?? null, loading: urls.isLoading, tick, paths };
}
