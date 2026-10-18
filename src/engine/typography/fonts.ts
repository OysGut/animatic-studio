/**
 * Fontlasting for tekstlag (MTS §61, MT1). Fontene lastes først når et tekstlag eller MTS tas i bruk, og
 * både forhåndsvisningen og eksporten venter på `fontsReady`. En font som ikke lar seg laste, meldes som
 * manglende; teksten tegnes da med reservefonten og det vises en advarsel.
 */
import { useEffect, useSyncExternalStore } from "react";
import {
  cssFont,
  fontById,
  fontsNeeded,
  layersOf,
  type ProjectState,
  type TextSpec,
} from "@/core";
import { resetTextMeasure } from "@/engine/compositor/canvas";
import { FONT_LOADERS } from "./font-loaders";

type Status = "loading" | "ready" | "missing";
const status = new Map<string, Status>();
const pending = new Map<string, Promise<void>>();
let version = 0;
const listeners = new Set<() => void>();
function bump() {
  version++;
  resetTextMeasure();
  for (const l of listeners) l();
}

const keyOf = (fontId: string, weight: number) => `${fontId}:${weight}`;

/** Test-krok: gjør at en font regnes som manglende (brukes av nettlesertestene via window). */
const forcedMissing = new Set<string>();

async function loadOne(fontId: string, weight: number): Promise<void> {
  const key = keyOf(fontId, weight);
  const f = fontById(fontId);
  if (!f) return;
  try {
    if (forcedMissing.has(fontId)) throw new Error("missing");
    if (f.loading === "lazy") {
      const loader = FONT_LOADERS[fontId]?.[weight];
      if (!loader) throw new Error("no loader");
      await loader();
    }
    if (typeof document !== "undefined" && document.fonts) {
      // Æ, ø og å er med i prøveteksten, så latin-ext-delen lastes også
      const css = cssFont({ fontId, size: 32, weight, italic: false });
      const faces = await document.fonts.load(css, "AÆØÅaæøå"); // i18n-ignore – prøvetegn
      if (f.loading === "lazy" && faces.length === 0) throw new Error("not loaded");
    }
    status.set(key, "ready");
  } catch {
    status.set(key, "missing");
  }
  bump();
}

/** Last fontene (id + vekt). Gir løftet som er ferdig når alle er lastet eller meldt som manglende. */
export function ensureFonts(list: readonly { fontId: string; weight: number }[]): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const { fontId, weight } of list) {
    const key = keyOf(fontId, weight);
    const st = status.get(key);
    if (st === "ready" || st === "missing") continue;
    let p = pending.get(key);
    if (!p) {
      status.set(key, "loading");
      p = loadOne(fontId, weight);
      pending.set(key, p);
    }
    jobs.push(p);
  }
  return Promise.all(jobs).then(() => undefined);
}

/** Tekstspesifikasjonene i hele prosjektet (eller én 2D-scene). */
export function textSpecsOf(state: ProjectState, compositionId?: string): TextSpec[] {
  const layers = compositionId
    ? layersOf(state, compositionId)
    : Object.values(state.layers).filter((l) => !l.removed);
  return layers.flatMap((l) => (l.kind === "text" && l.text ? [l.text] : []));
}

/** Fontene som mangler (etter lasting) for tekstene. */
export function missingFonts(specs: Iterable<TextSpec>): string[] {
  const out = new Set<string>();
  for (const s of specs) {
    const f = fontById(s.fontId);
    if (!f) {
      out.add(s.fontId);
      continue;
    }
    for (const n of fontsNeeded([s]))
      if (status.get(keyOf(n.fontId, n.weight)) === "missing") out.add(f.label);
  }
  return [...out];
}

/** Venter til fontene tekstene trenger er lastet (eksporten kaller denne før første bilde). */
export async function fontsReady(specs: Iterable<TextSpec>): Promise<{ missing: string[] }> {
  const list = [...specs];
  await ensureFonts(fontsNeeded(list));
  return { missing: missingFonts(list) };
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Øker når en font er lastet; brukes som avhengighet så teksten måles og tegnes på nytt. */
export function useFontsVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}

/** Laster fontene tekstene trenger (lat) og gir manglende fonter. */
export function useTextFonts(specs: readonly TextSpec[]): { missing: string[]; version: number } {
  const v = useFontsVersion();
  const key = fontsNeeded(specs)
    .map((n) => keyOf(n.fontId, n.weight))
    .join(",");
  useEffect(() => {
    if (key) void ensureFonts(fontsNeeded(specs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { missing: missingFonts(specs), version: v };
}

if (typeof window !== "undefined")
  (window as unknown as { __mtsForceMissingFont?: (id: string) => void }).__mtsForceMissingFont = (id) => {
    forcedMissing.add(id);
    for (const k of [...status.keys()]) if (k.startsWith(`${id}:`)) status.delete(k), pending.delete(k);
    bump();
  };
