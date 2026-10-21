/**
 * B-098: henting fra Google Fonts, bare på serveren. Nettleseren snakker aldri med Google (IP-adresse til
 * tredjepart, GDPR). Bare kjente Google-verter tillates, så funksjonen ikke kan hente vilkårlige adresser.
 * Nøkkelen (GOOGLE_FONTS_API_KEY) brukes automatisk hvis den finnes, og logges aldri.
 */
import {
  FONT_FILE_MAX_BYTES,
  FONT_MAX_VARIANTS,
  FONT_PACK_MAX_BYTES,
  isFamilyName,
  parseGoogleDeveloperApi,
  parseGoogleMetadata,
  type CatalogFont,
  type CatalogVariant,
} from "@/core/typography";

export const ALLOWED_FONT_HOSTS: readonly string[] = [
  "fonts.google.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  // Developer API (bare katalogen, bare når nøkkelen finnes)
  "www.googleapis.com",
];

export function isAllowedFontUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_FONT_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

/** Nettleserprofiler: moderne gir woff2 per skriftsystem, ukjent gir hele fonten som ttf. */
const UA_WOFF2 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const UA_TTF = "Mozilla/4.0";

async function get(url: string, ua?: string, maxBytes = 8 * 1024 * 1024): Promise<Uint8Array> {
  if (!isAllowedFontUrl(url)) throw new Error("font host not allowed");
  const res = await fetch(url, { headers: ua ? { "User-Agent": ua } : {}, redirect: "error" });
  if (!res.ok) throw new Error(`font source status ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new Error("font file too large");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error("font file too large");
  return buf;
}

// ---------- Katalogen (bufret i 24 timer) ----------

const CATALOG_TTL_MS = 24 * 3_600_000;
let cache: { at: number; list: CatalogFont[] } | null = null;

export async function googleCatalog(now = Date.now()): Promise<CatalogFont[] | null> {
  if (cache && now - cache.at < CATALOG_TTL_MS) return cache.list;
  const key = process.env["GOOGLE_FONTS_API_KEY"];
  let list: CatalogFont[] | null = null;
  try {
    if (key) {
      const text = new TextDecoder().decode(
        await get(`https://www.googleapis.com/webfonts/v1/webfonts?sort=popularity&key=${encodeURIComponent(key)}`, undefined, 16 * 1024 * 1024),
      );
      list = parseGoogleDeveloperApi(text);
    }
    if (!list) {
      const text = new TextDecoder().decode(await get("https://fonts.google.com/metadata/fonts", undefined, 32 * 1024 * 1024));
      list = parseGoogleMetadata(text);
    }
  } catch (e) {
    // Bare feiltypen logges – aldri nøkkel, adresse med nøkkel eller brukerdata
    console.warn("[b098] Google Fonts catalogue fetch failed:", e instanceof Error ? e.message.slice(0, 80) : "unknown");
    list = null;
  }
  if (!list) {
    console.warn("[b098] Google Fonts catalogue had an unexpected shape or was empty");
    return cache?.list ?? null;
  }
  cache = { at: now, list };
  return list;
}

// ---------- CSS og filer ----------

export interface CssFace {
  readonly weight: number;
  readonly italic: boolean;
  readonly url: string;
  readonly format: "woff2" | "ttf";
  readonly subset?: string;
  readonly unicodeRange?: string;
}

/** Tolker css2-svaret. Kommentaren før hver blokk navngir skriftsystemet (woff2). */
export function parseFontCss(css: string): CssFace[] {
  const out: CssFace[] = [];
  const re = /(?:\/\*\s*([a-z0-9-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/gi;
  for (const m of css.matchAll(re)) {
    const body = m[2]!;
    const style = /font-style:\s*(\w+)/.exec(body)?.[1];
    const weight = Number(/font-weight:\s*(\d+)/.exec(body)?.[1]);
    const src = /src:\s*url\(([^)]+)\)\s*format\(['"]?(\w+)['"]?\)/.exec(body);
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim();
    if (!src || !Number.isInteger(weight)) continue;
    const format = src[2] === "woff2" ? "woff2" : src[2] === "truetype" ? "ttf" : null;
    if (!format || !isAllowedFontUrl(src[1]!)) continue;
    out.push({
      weight,
      italic: style === "italic",
      url: src[1]!,
      format,
      ...(m[1] ? { subset: m[1] } : {}),
      ...(range && format === "woff2" ? { unicodeRange: range.slice(0, 2000) } : {}),
    });
  }
  return out;
}

function css2Url(family: string, variants: readonly CatalogVariant[], text?: string): string {
  const v = [...variants]
    .sort((a, b) => Number(a.italic) - Number(b.italic) || a.weight - b.weight)
    .map((x) => `${x.italic ? 1 : 0},${x.weight}`)
    .join(";");
  const q = `family=${encodeURIComponent(family).replace(/%20/g, "+")}:ital,wght@${v}&display=swap`;
  return `https://fonts.googleapis.com/css2?${q}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
}

function checkFamily(family: string, variants: readonly CatalogVariant[]) {
  if (!isFamilyName(family)) throw new Error("bad family");
  if (variants.length === 0 || variants.length > FONT_MAX_VARIANTS) throw new Error("bad variants");
  for (const v of variants) if (!Number.isInteger(v.weight) || v.weight < 1 || v.weight > 1000) throw new Error("bad variants");
}

/** Forhåndsvisning: en liten woff2 med bare tegnene i prøveteksten. */
export async function previewFontFile(family: string, variant: CatalogVariant, text: string): Promise<Uint8Array> {
  checkFamily(family, [variant]);
  const sample = [...new Set([...text.slice(0, 200)])].join("") || "Aa";
  const css = new TextDecoder().decode(await get(css2Url(family, [variant], sample), UA_WOFF2, 256 * 1024));
  const face = parseFontCss(css).find((f) => f.format === "woff2") ?? parseFontCss(css)[0];
  if (!face) throw new Error("no preview face");
  return get(face.url, UA_WOFF2, FONT_FILE_MAX_BYTES);
}

export interface PackageFile extends CssFace {
  readonly bytes: Uint8Array;
}

/** Hele fonten for valgte vekter/stiler: woff2 for valgte skriftsystemer og ttf. */
export async function packageFontFiles(
  family: string,
  variants: readonly CatalogVariant[],
  subsets: readonly string[],
): Promise<PackageFile[]> {
  checkFamily(family, variants);
  const [cssW, cssT] = await Promise.all([
    get(css2Url(family, variants), UA_WOFF2, 1024 * 1024).then((b) => new TextDecoder().decode(b)),
    get(css2Url(family, variants), UA_TTF, 1024 * 1024).then((b) => new TextDecoder().decode(b)),
  ]);
  const woff2 = parseFontCss(cssW).filter((f) => f.format === "woff2" && (!f.subset || subsets.length === 0 || subsets.includes(f.subset)));
  const ttf = parseFontCss(cssT).filter((f) => f.format === "ttf");
  const faces = [...woff2, ...ttf];
  if (!faces.length) throw new Error("no faces");
  let total = 0;
  const out: PackageFile[] = [];
  for (const f of faces) {
    const bytes = await get(f.url, undefined, FONT_FILE_MAX_BYTES);
    total += bytes.length;
    if (total > FONT_PACK_MAX_BYTES) throw new Error("font package too large");
    out.push({ ...f, bytes });
  }
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
