/**
 * Importert film i monteringen (DEC-0047): ett videoelement per fil, som følger avspillingshodet. Bildet
 * tegnes inn i filmvisningen med drawFilmFrame; lyden spilles av lydmotoren (videoen er dempet), så film,
 * lydklipp og eksport bruker samme klokke. Bare på klienten.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Take } from "@/core";
import type { ImageSource } from "@/engine/compositor/canvas";

/** Egne elementer for plass 1–3 (overgang og myk overgang mellom deler, DEC-0051/0071): samme fil kan vises
 * flere steder samtidig, og hver plass må søke uavhengig. */
const slotKey = (path: string, slot: number) => (slot === 0 ? path : `${path}#s${slot}`);
const basePath = (key: string) => key.replace(/#s\d$/, "");

export function useFilmVideo(urls: Readonly<Record<string, string>> | null, playing: boolean) {
  const els = useRef(new Map<string, HTMLVideoElement>());
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  const used = useRef(new Set<string>());
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  // Elementer for nye filer; fjern dem som ikke brukes lenger
  useEffect(() => {
    if (!urls) return;
    const map = els.current;
    for (const [path, url] of Object.entries(urls)) {
      const have = map.get(path);
      for (const v of [1, 2, 3].map((n) => map.get(slotKey(path, n))).concat(have)) {
        // Nye midlertidige lenker (de gamle går ut etter en time): bytt kilde, behold plassen
        if (v && v.dataset["url"] !== url) {
          const t = v.currentTime;
          v.dataset["url"] = url;
          v.src = url;
          v.currentTime = t;
        }
      }
      if (have) continue;
      map.set(path, makeVideo(url, bump));
    }
    for (const [path, v] of map)
      if (!(basePath(path) in urls)) {
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
    (take: Take, seconds: number, held: boolean, slot = 0): ImageSource | null => {
      if (!take.mediaRef) return null;
      const key = slotKey(take.mediaRef, slot);
      let v = els.current.get(key);
      if (!v && slot !== 0) {
        const url = urlsRef.current?.[take.mediaRef];
        if (url) {
          v = makeVideo(url, bump);
          els.current.set(key, v);
        }
      }
      if (!v) return null;
      used.current.add(key);
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
    [playing, bump],
  );

  /** Kalles etter hver tegning: filmer som ikke var med i bildet, settes på pause. */
  const settle = useCallback(() => {
    for (const [path, v] of els.current) if (!used.current.has(path) && !v.paused) v.pause();
    used.current = new Set();
  }, []);

  return { provider, settle, tick };
}

function makeVideo(url: string, onFrame: () => void): HTMLVideoElement {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.crossOrigin = "anonymous";
  v.onloadedmetadata = () => {
    v.width = v.videoWidth;
    v.height = v.videoHeight;
  };
  v.onloadeddata = onFrame;
  v.onseeked = onFrame;
  v.dataset["url"] = url;
  v.src = url;
  return v;
}
