/**
 * Fontlasting for tekstlag (MTS §61, MT1). Fontene lastes først når et tekstlag eller MTS tas i bruk, og
 * både forhåndsvisningen og eksporten venter på `fontsReady`. En font som ikke lar seg laste, meldes som
 * manglende; teksten tegnes da med reservefonten og det vises en advarsel.
 */
import { useEffect, useSyncExternalStore } from "react";
import {
  browserFilesFor,
  cssFont,
  decodeFontPack,
  fontById,
  setProjectFonts,
  type FontEntry,
  fontsNeeded,
  layersOf,
  type ProjectState,
  type TextSpec,
} from "@/core";
import { resetTextMeasure } from "@/engine/compositor/canvas";
import { FONT_ITALIC_LOADERS, FONT_LOADERS } from "./font-loaders";

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

const keyOf = (fontId: string, weight: number, italic?: boolean) => `${fontId}:${weight}${italic ? ":i" : ""}`;

/** Test-krok: gjør at en font regnes som manglende (brukes av nettlesertestene via window). */
const forcedMissing = new Set<string>();

async function loadOne(fontId: string, weight: number, italic = false): Promise<void> {
  const key = keyOf(fontId, weight, italic);
  const f = fontById(fontId);
  if (!f) return;
  try {
    if (forcedMissing.has(fontId)) throw new Error("missing");
    if (f.loading === "asset") await loadProjectFont(f, weight, italic);
    else if (f.loading === "lazy") {
      const loader = (italic ? FONT_ITALIC_LOADERS : FONT_LOADERS)[fontId]?.[weight];
      if (!loader) throw new Error("no loader");
      await loader();
    }
    if (typeof document !== "undefined" && document.fonts) {
      // Æ, ø og å er med i prøveteksten, så latin-ext-delen lastes også
      const css = cssFont({ fontId, size: 32, weight, italic });
      const faces = await document.fonts.load(css, "AÆØÅaæøå"); // i18n-ignore – prøvetegn
      if (f.loading !== "css" && faces.length === 0) throw new Error("not loaded");
    }
    status.set(key, "ready");
  } catch {
    status.set(key, "missing");
  }
  bump();
}

// ---------- Prosjektfonter (B-098) ----------

/** Henter fontpakken fra prosjektets lagring. Settes av appen (motoren kjenner ikke lagringen). */
let fetchPack: ((mediaPath: string) => Promise<Uint8Array>) | null = null;
export function setProjectFontFetcher(fn: (mediaPath: string) => Promise<Uint8Array>): void {
  fetchPack = fn;
}
const packs = new Map<string, Promise<ReturnType<typeof decodeFontPack>>>();

async function loadProjectFont(f: FontEntry, weight: number, italic: boolean): Promise<void> {
  if (f.removed || !f.mediaPath || !fetchPack) throw new Error("missing");
  if (typeof document === "undefined" || typeof FontFace === "undefined") return;
  let p = packs.get(f.mediaPath);
  if (!p) {
    p = fetchPack(f.mediaPath).then((b) => decodeFontPack(b));
    packs.set(f.mediaPath, p);
    p.catch(() => packs.delete(f.mediaPath!));
  }
  const pack = await p;
  if (!pack) throw new Error("bad pack");
  const files = browserFilesFor(pack.spec.files, weight, italic);
  if (!files.length) throw new Error("no file");
  for (const ref of files) {
    const data = pack.files.get(ref.name);
    if (!data) continue;
    const face = new FontFace(f.family, data.slice().buffer, {
      weight: String(weight),
      style: italic ? "italic" : "normal",
      ...(ref.unicodeRange ? { unicodeRange: ref.unicodeRange } : {}),
    });
    await face.load();
    document.fonts.add(face);
  }
}

/** Registrerer prosjektets fonter (fra prosjekttilstanden). Endrede fonter lastes på nytt ved behov. */
let lastSignature = "";
export function syncProjectFonts(entries: readonly FontEntry[]): void {
  const sig = entries.map((e) => `${e.id}|${e.mediaPath ?? ""}|${e.removed ? 1 : 0}`).join(",");
  if (sig === lastSignature) return;
  lastSignature = sig;
  setProjectFonts(entries);
  for (const k of [...status.keys()])
    if (k.startsWith("asset:")) {
      status.delete(k);
      pending.delete(k);
    }
  bump();
}

/** Last fontene (id + vekt). Gir løftet som er ferdig når alle er lastet eller meldt som manglende. */
export function ensureFonts(
  list: readonly { fontId: string; weight: number; italic?: boolean }[],
): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const { fontId, weight, italic } of list) {
    const key = keyOf(fontId, weight, italic);
    const st = status.get(key);
    if (st === "ready" || st === "missing") continue;
    let p = pending.get(key);
    if (!p) {
      status.set(key, "loading");
      p = loadOne(fontId, weight, italic === true);
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
      if (status.get(keyOf(n.fontId, n.weight, n.italic)) === "missing") out.add(f.label);
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
    .map((n) => keyOf(n.fontId, n.weight, n.italic))
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
