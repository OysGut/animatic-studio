/**
 * Fontkatalogen (MTS §61): de eneste fontene tekstlag kan bruke. Alle er OFL-lisensierte og selvhostet fra
 * @fontsource (latin og latin-ext, så æ, ø, å og vanlige spesialtegn er med). Nettleseren og eksporten
 * laster de samme filene (src/engine/typography/fonts.ts), så teksten tegnes likt.
 */
export interface FontEntry {
  readonly id: string;
  /** CSS-familienavnet fontene registreres med. */
  readonly family: string;
  readonly label: string;
  readonly weights: readonly number[];
  readonly category: "serif" | "sans" | "display" | "mono";
  readonly license: "OFL-1.1";
  /** npm-pakken filene kommer fra. */
  readonly source: string;
  /** «css»: lastes allerede av appens stilark. «lazy»: lastes først når en tekst bruker den. */
  readonly loading: "css" | "lazy";
}

export const FONT_CATALOG: readonly FontEntry[] = [
  { id: "inter", family: "Inter Variable", label: "Inter", weights: [300, 400, 700, 900], category: "sans", license: "OFL-1.1", source: "@fontsource-variable/inter", loading: "css" },
  { id: "jetbrains-mono", family: "JetBrains Mono", label: "JetBrains Mono", weights: [400], category: "mono", license: "OFL-1.1", source: "@fontsource/jetbrains-mono", loading: "css" },
  { id: "courier-prime", family: "Courier Prime", label: "Courier Prime", weights: [400, 700], category: "mono", license: "OFL-1.1", source: "@fontsource/courier-prime", loading: "css" },
  { id: "playfair-display", family: "Playfair Display", label: "Playfair Display", weights: [400, 700, 900], category: "serif", license: "OFL-1.1", source: "@fontsource/playfair-display", loading: "lazy" },
  { id: "cormorant-garamond", family: "Cormorant Garamond", label: "Cormorant Garamond", weights: [300, 400, 700], category: "serif", license: "OFL-1.1", source: "@fontsource/cormorant-garamond", loading: "lazy" },
  { id: "cinzel", family: "Cinzel", label: "Cinzel", weights: [400, 700, 900], category: "display", license: "OFL-1.1", source: "@fontsource/cinzel", loading: "lazy" },
  { id: "bebas-neue", family: "Bebas Neue", label: "Bebas Neue", weights: [400], category: "display", license: "OFL-1.1", source: "@fontsource/bebas-neue", loading: "lazy" },
  { id: "oswald", family: "Oswald", label: "Oswald", weights: [300, 400, 700], category: "sans", license: "OFL-1.1", source: "@fontsource/oswald", loading: "lazy" },
  { id: "montserrat", family: "Montserrat", label: "Montserrat", weights: [300, 400, 700, 900], category: "sans", license: "OFL-1.1", source: "@fontsource/montserrat", loading: "lazy" },
  { id: "lora", family: "Lora", label: "Lora", weights: [400, 700], category: "serif", license: "OFL-1.1", source: "@fontsource/lora", loading: "lazy" },
  { id: "source-serif-4", family: "Source Serif 4", label: "Source Serif 4", weights: [300, 400, 700, 900], category: "serif", license: "OFL-1.1", source: "@fontsource/source-serif-4", loading: "lazy" },
  { id: "libre-baskerville", family: "Libre Baskerville", label: "Libre Baskerville", weights: [400, 700], category: "serif", license: "OFL-1.1", source: "@fontsource/libre-baskerville", loading: "lazy" },
  { id: "raleway", family: "Raleway", label: "Raleway", weights: [300, 400, 700, 900], category: "sans", license: "OFL-1.1", source: "@fontsource/raleway", loading: "lazy" },
];

export const DEFAULT_FONT_ID = "inter";
/** Reservefont når en font mangler (§61): tegnes, men advarsel vises. */
export const FALLBACK_FAMILY = "system-ui, sans-serif";

export function fontById(id: string): FontEntry | undefined {
  return FONT_CATALOG.find((f) => f.id === id);
}

/** Nærmeste vekt fontene har. */
export function nearestWeight(font: FontEntry, weight: number): number {
  return [...font.weights].sort((a, b) => Math.abs(a - weight) - Math.abs(b - weight))[0] ?? 400;
}

/** CSS-fontstrengen som brukes ved måling og tegning (samme i editor og eksport). */
export function cssFont(spec: { fontId: string; size: number; weight: number; italic: boolean }): string {
  const f = fontById(spec.fontId);
  const family = f ? `"${f.family}", ${FALLBACK_FAMILY}` : FALLBACK_FAMILY;
  const w = f ? nearestWeight(f, spec.weight) : spec.weight;
  return `${spec.italic ? "italic " : ""}${w} ${spec.size}px ${family}`;
}

/** Fontene (id og vekt) en mengde tekstlag trenger, for lasting før forhåndsvisning og eksport. */
export function fontsNeeded(
  specs: Iterable<{ fontId: string; weight: number } | null | undefined>,
): { fontId: string; weight: number }[] {
  const out = new Map<string, { fontId: string; weight: number }>();
  for (const s of specs) {
    if (!s) continue;
    const f = fontById(s.fontId);
    if (!f) continue;
    const w = nearestWeight(f, s.weight);
    out.set(`${f.id}:${w}`, { fontId: f.id, weight: w });
  }
  return [...out.values()];
}
