/**
 * Enkle symboler for alle ressurser (Mars 2026-10-13, DEC-0079): «ikke med ansikt eller øyne, kun fyll uten
 * outline, ulik farge for f.eks. Rolf og Maja». Formen viser typen (figur, dyr, objekt, sted, miljø), fargen
 * skiller ressursene fra hverandre. Symbolet regnes ut (lagres ikke): det står i lister og tegnes i scenen
 * og animaticen for lag som ennå ikke har bilde.
 */
import type { AssetKind, ProjectState } from "../model";

export type SymbolShape =
  "figure" | "animal" | "object" | "place" | "environment" | "other" | "sound";

/** Formen per ressurstype. */
export const SYMBOL_SHAPE: Record<AssetKind, SymbolShape> = {
  character: "figure",
  animal: "animal",
  object: "object",
  location: "place",
  environment: "environment",
  other: "other",
  sound: "sound",
  template: "other",
  font: "other",
};

/**
 * Formene som SVG-stier i en boks på 100 × 100 (fylles, ingen omriss). Samme sti tegnes i lister (SVG) og på
 * lerretet (Path2D), så symbolet ser likt ut overalt.
 */
export const SYMBOL_PATH: Record<SymbolShape, string> = {
  // Hode og kropp, uten ansikt
  figure: "M50 6a15 15 0 1 1 -0.01 0Z M28 42Q50 34 72 42L82 96H18Z",
  // Kropp, hode og fire ben
  animal:
    "M14 56a34 19 0 1 0 68 0a34 19 0 1 0 -68 0Z M86 26a11 11 0 1 1 -0.01 0Z M76 34l14 6l-8 16Z M22 64h9v30h-9Z M66 64h9v30h-9Z M38 68h8v26h-8Z M53 68h8v26h-8Z",
  object: "M50 6L94 50L50 94L6 50Z",
  // Et hus
  place: "M50 6L95 46H85V94H15V46H5Z",
  // Fjell
  environment: "M2 94L34 28L52 60L68 38L98 94Z",
  other: "M27 8H73L96 50L73 92H27L4 50Z",
  sound: "M50 8a42 42 0 1 1 -0.01 0Z",
};

/** Gyllen vinkel: påfølgende ressurser får farger som ligger langt fra hverandre. */
const GOLDEN = 137.508;

/**
 * Farge per ressurs, i rekkefølgen ressursene ble laget (ID-ene er tidsordnet), så en ny ressurs ikke endrer
 * fargen til de andre. Bare ressurser som ikke er slettet teller.
 */
const colorCache = new WeakMap<object, ReadonlyMap<string, string>>();

export function assetSymbolColors(s: ProjectState): ReadonlyMap<string, string> {
  const hit = colorCache.get(s.assets);
  if (hit) return hit;
  const ids = Object.values(s.assets)
    .filter((a) => !a.removed && a.kind !== "sound")
    .map((a) => a.id as string)
    .sort();
  const out = new Map<string, string>();
  ids.forEach((id, i) => {
    const hue = Math.round((20 + i * GOLDEN) % 360);
    // Litt ulik lyshet annenhver gang, så nabofarger skilles også for fargesvake
    const light = i % 2 === 0 ? 62 : 52;
    out.set(id, `hsl(${hue} 62% ${light}%)`);
  });
  colorCache.set(s.assets, out);
  return out;
}

export interface AssetSymbol {
  readonly shape: SymbolShape;
  readonly color: string;
  readonly path: string;
}

/** Symbolet for en ressurs, eller null når den ikke finnes. */
export function assetSymbol(
  s: ProjectState,
  assetId: string | null | undefined,
  colors: ReadonlyMap<string, string> = assetSymbolColors(s),
): AssetSymbol | null {
  const a = assetId ? s.assets[assetId] : undefined;
  if (!a) return null;
  const shape = SYMBOL_SHAPE[a.kind];
  return { shape, color: colors.get(a.id) ?? "hsl(210 10% 60%)", path: SYMBOL_PATH[shape] };
}
