/**
 * Importert film i monteringen (DEC-0047): ett videoelement per fil, som følger avspillingshodet. Bildet
 * tegnes inn i filmvisningen med drawFilmFrame; lyden spilles av lydmotoren (videoen er dempet), så film,
 * lydklipp og eksport bruker samme klokke. Bare på klienten.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Take } from "@/core";
import type { ImageSource } from "@/engine/compositor/canvas";

export function useFilmVideo(urls: Readonly<Record<string, string>> | null, playing: boolean) {
  const els = useRef(new Map<string, HTMLVideoElement>());
  const used = useRef(new Set<string>());
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  // Elementer for nye filer; fjern dem som ikke brukes lenger
  useEffect(() => {
    if (!urls) return;
    const map = els.current;
    for (const [path, url] of Object.entries(urls)) {
      const have = map.get(path);
      if (have) {
        // Nye midlertidige lenker (de gamle går ut etter en time): bytt kilde, behold plassen
        if (have.dataset["url"] !== url) {
          const t = have.currentTime;
          have.dataset["url"] = url;
          have.src = url;
          have.currentTime = t;
        }
        continue;
      }
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.crossOrigin = "anonymous";
      v.onloadedmetadata = () => {
        v.width = v.videoWidth;
        v.height = v.videoHeight;
      };
      v.onloadeddata = bump;
      v.onseeked = bump;
      v.dataset["url"] = url;
      v.src = url;
      map.set(path, v);
    }
    for (const [path, v] of map)
      if (!(path in urls)) {
        v.pause();
        v.removeAttribute("src");
        v.load();
        map.delete(path);
      }
  }, [urls, bump]);

  useEffect(
    () => () => {
      for (const v of els.current.values()) {
        v.pause();
        v.removeAttribute("src");
      }
      els.current.clear();
    },
    [],
  );

  // Under avspilling tegnes visningen hvert bilde uansett; i ro trengs ny tegning etter søk (onseeked)
  const provider = useCallback(
    (take: Take, seconds: number, held: boolean): ImageSource | null => {
      const v = take.mediaRef ? els.current.get(take.mediaRef) : undefined;
      if (!v) return null;
      used.current.add(take.mediaRef!);
      if (playing && !held) {
        if (v.paused) {
          v.currentTime = seconds;
          void v.play().catch(() => undefined);
        } else if (Math.abs(v.currentTime - seconds) > 0.25) v.currentTime = seconds;
      } else {
        if (!v.paused) v.pause();
        if (!v.seeking && Math.abs(v.currentTime - seconds) > 0.02) v.currentTime = seconds;
      }
      return v.readyState >= 2 && v.videoWidth > 0 ? (v as unknown as ImageSource) : null;
    },
    [playing],
  );

  /** Kalles etter hver tegning: filmer som ikke var med i bildet, settes på pause. */
  const settle = useCallback(() => {
    for (const [path, v] of els.current) if (!used.current.has(path) && !v.paused) v.pause();
    used.current = new Set();
  }, []);

  return { provider, settle, tick };
}
