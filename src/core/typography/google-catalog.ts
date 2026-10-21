/**
 * B-098: Google Fonts-katalogen som ren data. Tolker begge kildene (uten nøkkel: fonts.google.com/metadata/fonts;
 * med nøkkel: Developer API v1), filtrerer og bestemmer lisensen. Ingen nettverk her – serverfunksjonen henter.
 */
import type { FontCategory, FontLicense } from "./fonts";

export interface CatalogVariant {
  readonly weight: number;
  readonly italic: boolean;
}

export interface CatalogFont {
  readonly family: string;
  readonly category: FontCategory;
  readonly subsets: readonly string[];
  readonly variants: readonly CatalogVariant[];
  readonly license: FontLicense;
  readonly version: string;
  /** Høyere = mer brukt (brukes til sortering når søket er tomt). */
  readonly popularity: number;
}

export const CATALOG_CATEGORIES: readonly FontCategory[] = ["serif", "sans", "display", "handwriting", "mono"];

/** Vanlige skriftsystemer i filteret (Google-navn). */
export const CATALOG_SUBSETS: readonly string[] = [
  "latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "vietnamese", "arabic", "hebrew",
  "devanagari", "thai", "japanese", "korean", "chinese-simplified",
];

/** Kjente Google-fonter med Apache- eller UFL-lisens (resten er OFL). Brukes når kilden ikke oppgir lisens. */
const APACHE = /^(roboto( (condensed|flex|mono|serif|slab))?|arimo|tinos|cousine|droid (sans|serif)( mono)?|permanent marker|rancho|special elite|walter turncoat|calligraffitti|cherry cream soda|chewy|coming soon|crafty girls|crushed|fontdiner swanky|homemade apple|irish grover|just another hand|kranky|luckiest guy|mountains of christmas|rock salt|schoolbell|slackey|sunshiney|syncopate|unkempt|yellowtail|aclonica|smokum|maiden orange|satisfy|montez|redressed|nokora|opensans hebrew)$/i;
const UFL = /^ubuntu( (mono|condensed|sans mono))?$/i;

/** Lisensen: fra kilden hvis den oppgis, ellers fra listene over. */
export function licenseOf(raw: unknown, family: string): FontLicense {
  const r = typeof raw === "string" ? raw.toLowerCase() : "";
  if (r.includes("apache")) return "Apache-2.0";
  if (r.includes("ufl") || r.includes("ubuntu")) return "UFL-1.0";
  if (r.includes("ofl") || r.includes("open font")) return "OFL-1.1";
  if (UFL.test(family.trim())) return "UFL-1.0";
  if (APACHE.test(family.trim())) return "Apache-2.0";
  return "OFL-1.1";
}

/** UFL er ikke OFL eller Apache: fonten kan legges til, men brukeren får et varsel. */
export function licenseNeedsNotice(l: FontLicense): boolean {
  return l === "UFL-1.0";
}

export function categoryOf(raw: unknown): FontCategory | null {
  const r = typeof raw === "string" ? raw.toLowerCase().replace(/[\s_-]+/g, "") : "";
  if (r === "serif") return "serif";
  if (r === "sansserif" || r === "sans") return "sans";
  if (r === "display") return "display";
  if (r === "handwriting") return "handwriting";
  if (r === "monospace" || r === "mono") return "mono";
  return null;
}

const FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 \-']{0,99}$/;
export function isFamilyName(v: unknown): v is string {
  return typeof v === "string" && FAMILY_RE.test(v);
}

function variantsFromKeys(keys: readonly string[]): CatalogVariant[] {
  const out: CatalogVariant[] = [];
  for (const k of keys) {
    // «400», «400i», «regular», «italic», «700italic»
    const m = /^(\d{3})?(i|italic)?$|^(regular)$/.exec(k);
    if (!m) continue;
    const weight = m[1] ? Number(m[1]) : 400;
    out.push({ weight, italic: !!m[2] });
  }
  return out.sort((a, b) => a.weight - b.weight || Number(a.italic) - Number(b.italic));
}

/** Tolker kilden uten nøkkel. Gir null hvis formen ikke er som ventet (kilden er udokumentert). */
export function parseGoogleMetadata(text: string): CatalogFont[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\)\]\}'\s*/, ""));
  } catch {
    return null;
  }
  const list = (raw as { familyMetadataList?: unknown } | null)?.familyMetadataList;
  if (!Array.isArray(list) || list.length === 0) return null;
  const out: CatalogFont[] = [];
  for (const x of list as Record<string, unknown>[]) {
    const family = x?.["family"];
    const category = categoryOf(x?.["category"]);
    const fonts = x?.["fonts"];
    if (!isFamilyName(family) || !category || !fonts || typeof fonts !== "object") continue;
    const variants = variantsFromKeys(Object.keys(fonts as object));
    if (!variants.length) continue;
    out.push({
      family,
      category,
      subsets: (Array.isArray(x["subsets"]) ? (x["subsets"] as unknown[]) : []).filter((s): s is string => typeof s === "string" && s !== "menu"),
      variants,
      license: licenseOf(x["license"], family),
      version: typeof x["lastModified"] === "string" ? (x["lastModified"] as string).slice(0, 40) : "",
      popularity: typeof x["popularity"] === "number" ? -(x["popularity"] as number) : 0,
    });
  }
  // Under halvparten gjenkjent = kilden har endret form
  return out.length >= Math.max(1, list.length / 2) ? out : null;
}

/** Tolker Developer API v1 (`items`). */
export function parseGoogleDeveloperApi(text: string): CatalogFont[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const items = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const out: CatalogFont[] = [];
  items.forEach((x: Record<string, unknown>, i) => {
    const family = x?.["family"];
    const category = categoryOf(x?.["category"]);
    if (!isFamilyName(family) || !category || !Array.isArray(x["variants"])) return;
    const variants = variantsFromKeys((x["variants"] as unknown[]).filter((v): v is string => typeof v === "string"));
    if (!variants.length) return;
    out.push({
      family,
      category,
      subsets: (Array.isArray(x["subsets"]) ? (x["subsets"] as unknown[]) : []).filter((s): s is string => typeof s === "string"),
      variants,
      license: licenseOf(x["license"], family),
      version: typeof x["version"] === "string" ? (x["version"] as string).slice(0, 40) : "",
      popularity: -i,
    });
  });
  return out.length >= Math.max(1, items.length / 2) ? out : null;
}

export interface CatalogFilter {
  readonly query?: string;
  readonly category?: FontCategory | "";
  readonly subset?: string;
}

/** Søk etter navn (også innlimt fra fonts.google.com, med «+» eller lenke), kategori og skriftsystem. */
export function normalizeFontQuery(q: string): string {
  let s = q.trim();
  const m = /specimen\/([^/?#]+)/.exec(s) ?? /family=([^:&]+)/.exec(s);
  if (m) s = decodeURIComponent(m[1]!);
  return s.replace(/\+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

export function filterCatalog(list: readonly CatalogFont[], f: CatalogFilter, limit = 60): CatalogFont[] {
  const q = normalizeFontQuery(f.query ?? "");
  const hits = list.filter(
    (x) =>
      (!f.category || x.category === f.category) &&
      (!f.subset || x.subsets.includes(f.subset)) &&
      (!q || x.family.toLowerCase().includes(q)),
  );
  const rank = (x: CatalogFont) => (!q ? 0 : x.family.toLowerCase() === q ? 0 : x.family.toLowerCase().startsWith(q) ? 1 : 2);
  return hits
    .sort((a, b) => rank(a) - rank(b) || b.popularity - a.popularity || a.family.localeCompare(b.family))
    .slice(0, limit);
}
