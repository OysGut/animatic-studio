/**
 * Fontkatalogen (MTS §61): de eneste fontene tekstlag kan bruke. Alle er OFL-lisensierte og selvhostet fra
 * @fontsource (latin og latin-ext, så æ, ø, å og vanlige spesialtegn er med). Nettleseren og eksporten
 * laster de samme filene (src/engine/typography/fonts.ts), så teksten tegnes likt.
 */
export type FontLicense = "OFL-1.1" | "Apache-2.0" | "UFL-1.0";
export type FontCategory = "serif" | "sans" | "display" | "handwriting" | "mono";

export interface FontEntry {
  readonly id: string;
  /** CSS-familienavnet fontene registreres med. */
  readonly family: string;
  readonly label: string;
  readonly weights: readonly number[];
  /** Vektene som har ekte kursivfiler (lastes lat). Andre vekter tegnes skråstilt av nettleseren. */
  readonly italics?: readonly number[];
  readonly category: FontCategory;
  readonly license: FontLicense;
  /** npm-pakken filene kommer fra. */
  readonly source: string;
  /** «css»: lastes allerede av appens stilark. «lazy»: lastes først når en tekst bruker den. */
  /** «asset»: prosjektets egen font (B-098), lastes fra prosjektets lagring med FontFace. */
  readonly loading: "css" | "lazy" | "asset";
  /** Prosjektfont: fontpakken i lagringen og filene i den. */
  readonly mediaPath?: string;
  readonly files?: readonly import("./project-fonts").FontFileRef[];
  /** Prosjektfonten er fjernet: navnet beholdes, teksten tegnes med reservefonten og et varsel vises. */
  readonly removed?: boolean;
}

export const FONT_CATALOG: readonly FontEntry[] = [
  { id: "inter", family: "Inter Variable", label: "Inter", weights: [300, 400, 700, 900], category: "sans", license: "OFL-1.1", source: "@fontsource-variable/inter", loading: "css" },
  { id: "jetbrains-mono", family: "JetBrains Mono", label: "JetBrains Mono", weights: [400], category: "mono", license: "OFL-1.1", source: "@fontsource/jetbrains-mono", loading: "css" },
  { id: "courier-prime", family: "Courier Prime", label: "Courier Prime", weights: [400, 700], category: "mono", license: "OFL-1.1", source: "@fontsource/courier-prime", loading: "css" },
  { id: "playfair-display", italics: [400, 700], family: "Playfair Display", label: "Playfair Display", weights: [400, 700, 900], category: "serif", license: "OFL-1.1", source: "@fontsource/playfair-display", loading: "lazy" },
  { id: "cormorant-garamond", italics: [400, 700], family: "Cormorant Garamond", label: "Cormorant Garamond", weights: [300, 400, 700], category: "serif", license: "OFL-1.1", source: "@fontsource/cormorant-garamond", loading: "lazy" },
  { id: "cinzel", family: "Cinzel", label: "Cinzel", weights: [400, 700, 900], category: "display", license: "OFL-1.1", source: "@fontsource/cinzel", loading: "lazy" },
  { id: "bebas-neue", family: "Bebas Neue", label: "Bebas Neue", weights: [400], category: "display", license: "OFL-1.1", source: "@fontsource/bebas-neue", loading: "lazy" },
  { id: "oswald", family: "Oswald", label: "Oswald", weights: [300, 400, 700], category: "sans", license: "OFL-1.1", source: "@fontsource/oswald", loading: "lazy" },
  { id: "montserrat", italics: [400, 700], family: "Montserrat", label: "Montserrat", weights: [300, 400, 700, 900], category: "sans", license: "OFL-1.1", source: "@fontsource/montserrat", loading: "lazy" },
  { id: "lora", italics: [400, 700], family: "Lora", label: "Lora", weights: [400, 700], category: "serif", license: "OFL-1.1", source: "@fontsource/lora", loading: "lazy" },
  { id: "source-serif-4", italics: [400, 700], family: "Source Serif 4", label: "Source Serif 4", weights: [300, 400, 700, 900], category: "serif", license: "OFL-1.1", source: "@fontsource/source-serif-4", loading: "lazy" },
  { id: "libre-baskerville", italics: [400, 700], family: "Libre Baskerville", label: "Libre Baskerville", weights: [400, 700], category: "serif", license: "OFL-1.1", source: "@fontsource/libre-baskerville", loading: "lazy" },
  { id: "raleway", italics: [400, 700], family: "Raleway", label: "Raleway", weights: [300, 400, 700, 900], category: "sans", license: "OFL-1.1", source: "@fontsource/raleway", loading: "lazy" },
];

export const DEFAULT_FONT_ID = "inter";
/** Reservefont når en font mangler (§61): tegnes, men advarsel vises. */
export const FALLBACK_FAMILY = "system-ui, sans-serif";

/** Prosjektets egne fonter (B-098). Settes av appen når prosjektet lastes; brukes av fontById. */
let projectFonts: readonly FontEntry[] = [];
export function setProjectFonts(list: readonly FontEntry[]): void {
  projectFonts = list;
}
export function projectFontList(): readonly FontEntry[] {
  return projectFonts;
}

export function fontById(id: string): FontEntry | undefined {
  return FONT_CATALOG.find((f) => f.id === id) ?? projectFonts.find((f) => f.id === id);
}

/** Nærmeste vekt fontene har. */
export function nearestWeight(font: FontEntry, weight: number): number {
  return [...font.weights].sort((a, b) => Math.abs(a - weight) - Math.abs(b - weight))[0] ?? 400;
}

/** CSS-fontstrengen som brukes ved måling og tegning (samme i editor og eksport). */
export function cssFont(spec: { fontId: string; size: number; weight: number; italic: boolean }): string {
  const f = fontById(spec.fontId);
  const family = f && !f.removed ? `"${f.family}", ${FALLBACK_FAMILY}` : FALLBACK_FAMILY;
  const w = f ? nearestWeight(f, spec.weight) : spec.weight;
  return `${spec.italic ? "italic " : ""}${w} ${spec.size}px ${family}`;
}

/** Fontene (id og vekt) en mengde tekstlag trenger, for lasting før forhåndsvisning og eksport. */
export function fontsNeeded(
  specs: Iterable<{ fontId: string; weight: number; italic?: boolean } | null | undefined>,
): { fontId: string; weight: number; italic?: boolean }[] {
  const out = new Map<string, { fontId: string; weight: number; italic?: boolean }>();
  for (const s of specs) {
    if (!s) continue;
    const f = fontById(s.fontId);
    if (!f) continue;
    const w = nearestWeight(f, s.weight);
    out.set(`${f.id}:${w}`, { fontId: f.id, weight: w });
    // Ekte kursiv lastes i tillegg når fonten har den for vekten (ellers skråstiller nettleseren)
    if (s.italic && f.italics?.includes(w)) out.set(`${f.id}:${w}:i`, { fontId: f.id, weight: w, italic: true });
  }
  return [...out.values()];
}
