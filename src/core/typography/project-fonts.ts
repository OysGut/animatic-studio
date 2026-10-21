/**
 * B-098: fonter prosjektet selv har lagt til (ressurser med kind «font», migrasjon 0074). Ren TypeScript.
 *
 * - Fontfilene ligger i én «fontpakke» per ressursversjon (`FONT_PACK_MIME`): woff2 per skriftsystem for
 *   visning i nettleseren og ttf (hele fonten) for PDF-innbygging. Én fil per versjon gjør at sikkerhetskopi,
 *   global publisering og opprydding behandler fonten som enhver annen ressursfil.
 * - Metadata (familie, vekter, stiler, skriftsystemer, lisens, kilde og versjon) ligger i
 *   `asset_versions.font_spec` og i pakkehodet.
 * - Tekstlag peker på fonten med `fontId = "asset:<ressurs-ID>"`. En fjernet font beholder navnet; teksten
 *   tegnes med reservefonten og et varsel vises. Lagret data skrives aldri om.
 */
import type { AssetVersion, ProjectState } from "../model";
import type { FontCategory, FontEntry, FontLicense } from "./fonts";

export const FONT_PACK_MIME = "application/x-ptg-fontpack";
export const FONT_PACK_EXT = "ptgfont";
const MAGIC = "PTGFONT1";

/** Grenser (også i serverfunksjonen): per fil, per pakke og antall vekter/stiler per gang. */
export const FONT_FILE_MAX_BYTES = 4 * 1024 * 1024;
export const FONT_PACK_MAX_BYTES = 24 * 1024 * 1024;
export const FONT_MAX_VARIANTS = 8;

export const FONT_LICENSES: readonly FontLicense[] = ["OFL-1.1", "Apache-2.0", "UFL-1.0"];

export interface FontFileRef {
  /** Navnet på filen i pakken. */
  readonly name: string;
  readonly weight: number;
  readonly italic: boolean;
  readonly format: "woff2" | "ttf";
  /** Skriftsystemet filen dekker (bare woff2; ttf er hele fonten). */
  readonly subset?: string;
  /** CSS unicode-range for filen (bare woff2). */
  readonly unicodeRange?: string;
  readonly bytes: number;
}

export interface FontSpec {
  readonly family: string;
  readonly category: FontCategory;
  readonly weights: readonly number[];
  /** Vektene som har ekte kursiv. */
  readonly italics: readonly number[];
  readonly subsets: readonly string[];
  readonly license: FontLicense;
  /** Hvor fonten er hentet fra (fonts.google.com/specimen/…). */
  readonly sourceUrl: string;
  /** Versjonen hos kilden (dato eller versjonsnummer; tom hvis ukjent). */
  readonly version: string;
  readonly files: readonly FontFileRef[];
}

const CATEGORIES: readonly FontCategory[] = ["serif", "sans", "display", "handwriting", "mono"];
const isInt = (n: unknown, lo: number, hi: number) => Number.isInteger(n) && (n as number) >= lo && (n as number) <= hi;
const str = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;

/** Feil i fontmetadataen (null = gyldig). Tekniske meldinger; brukeren ser dem ikke i vanlig bruk. */
export function fontSpecError(spec: unknown): string | null {
  if (!spec || typeof spec !== "object") return "font_spec: not an object";
  const s = spec as Record<string, unknown>;
  if (!str(s["family"], 120) || /["\\<>;{}]/.test(s["family"] as string)) return "font_spec: family";
  if (!CATEGORIES.includes(s["category"] as FontCategory)) return "font_spec: category";
  if (!FONT_LICENSES.includes(s["license"] as FontLicense)) return "font_spec: license";
  const weights = s["weights"], italics = s["italics"], subsets = s["subsets"], files = s["files"];
  if (!Array.isArray(weights) || weights.length === 0 || weights.length > FONT_MAX_VARIANTS || !weights.every((w) => isInt(w, 1, 1000)))
    return "font_spec: weights";
  if (!Array.isArray(italics) || italics.length > FONT_MAX_VARIANTS || !italics.every((w) => isInt(w, 1, 1000)))
    return "font_spec: italics";
  if (!Array.isArray(subsets) || subsets.length > 40 || !subsets.every((x) => str(x, 40))) return "font_spec: subsets";
  if (typeof s["sourceUrl"] !== "string" || (s["sourceUrl"] as string).length > 300) return "font_spec: sourceUrl";
  if (typeof s["version"] !== "string" || (s["version"] as string).length > 60) return "font_spec: version";
  if (!Array.isArray(files) || files.length === 0 || files.length > 400) return "font_spec: files";
  for (const f of files as Record<string, unknown>[]) {
    if (!f || !str(f["name"], 120) || !isInt(f["weight"], 1, 1000) || typeof f["italic"] !== "boolean") return "font_spec: file";
    if (f["format"] !== "woff2" && f["format"] !== "ttf") return "font_spec: file format";
    if (!isInt(f["bytes"], 1, FONT_FILE_MAX_BYTES)) return "font_spec: file size";
  }
  return null;
}

export const PROJECT_FONT_PREFIX = "asset:";

export function projectFontId(assetId: string): string {
  return `${PROJECT_FONT_PREFIX}${assetId}`;
}

export function isProjectFontId(id: string): boolean {
  return /^asset:[0-9a-f-]{36}$/i.test(id);
}

/** CSS-familienavnet en prosjektfont registreres med (unikt per ressurs, så to prosjektfonter ikke kolliderer). */
export function projectFontFamily(assetId: string, family: string): string {
  return `${family} PTG-${assetId.slice(0, 8)}`;
}

/** Nyeste brukbare versjon med fontdata for en fontressurs. */
export function latestFontVersion(state: ProjectState, assetId: string): AssetVersion | null {
  const variants = new Set(
    Object.values(state.assetVariants)
      .filter((v) => v.assetId === assetId)
      .map((v) => v.id as string),
  );
  const versions = Object.values(state.assetVersions)
    .filter((v) => variants.has(v.variantId) && !v.removed && v.font)
    .sort((a, b) => b.number - a.number);
  return versions[0] ?? null;
}

/**
 * Fontene prosjektet har lagt til, som katalogoppføringer. Fjernede eller arkiverte fonter er med (merket
 * `removed`), så tekstlag som bruker dem beholder navnet og får reserve med varsel.
 */
export function projectFontEntries(state: ProjectState | null | undefined): FontEntry[] {
  if (!state) return [];
  const out: FontEntry[] = [];
  for (const a of Object.values(state.assets)) {
    if (a.kind !== "font") continue;
    const v = latestFontVersion(state, a.id);
    const spec = v?.font;
    const gone = a.removed === true || a.archived || !spec || !v;
    out.push({
      id: projectFontId(a.id),
      family: projectFontFamily(a.id, spec?.family ?? a.name),
      label: spec?.family ?? a.name,
      weights: spec?.weights.length ? [...spec.weights].sort((x, y) => x - y) : [400],
      italics: spec?.italics ?? [],
      category: spec?.category ?? "sans",
      license: spec?.license ?? "OFL-1.1",
      source: spec?.sourceUrl || "Google Fonts",
      loading: "asset",
      ...(v ? { mediaPath: v.mediaPath, files: spec?.files ?? [] } : {}),
      ...(gone ? { removed: true } : {}),
    });
  }
  return out.sort((x, y) => x.label.localeCompare(y.label));
}

// ---------- Fontpakken ----------

interface PackHeader {
  readonly spec: FontSpec;
  readonly entries: readonly { name: string; offset: number; length: number }[];
}

/** Lager fontpakken: «PTGFONT1», 4 byte hodelengde (big-endian), JSON-hode og filene etter hverandre. */
export function encodeFontPack(spec: FontSpec, files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const entries: { name: string; offset: number; length: number }[] = [];
  let offset = 0;
  for (const f of spec.files) {
    const data = files.get(f.name);
    if (!data) throw new Error(`font pack: missing ${f.name}`);
    entries.push({ name: f.name, offset, length: data.length });
    offset += data.length;
  }
  const head = new TextEncoder().encode(JSON.stringify({ spec, entries } satisfies PackHeader));
  const magic = new TextEncoder().encode(MAGIC);
  const out = new Uint8Array(magic.length + 4 + head.length + offset);
  out.set(magic, 0);
  new DataView(out.buffer).setUint32(magic.length, head.length);
  out.set(head, magic.length + 4);
  let at = magic.length + 4 + head.length;
  for (const e of entries) {
    out.set(files.get(e.name)!, at);
    at += e.length;
  }
  return out;
}

/** Leser fontpakken. Gir null hvis filen ikke er en gyldig pakke. */
export function decodeFontPack(bytes: Uint8Array): { spec: FontSpec; files: Map<string, Uint8Array> } | null {
  const ml = MAGIC.length;
  if (bytes.length < ml + 4 || new TextDecoder().decode(bytes.subarray(0, ml)) !== MAGIC) return null;
  const hl = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(ml);
  if (ml + 4 + hl > bytes.length) return null;
  let head: PackHeader;
  try {
    head = JSON.parse(new TextDecoder().decode(bytes.subarray(ml + 4, ml + 4 + hl))) as PackHeader;
  } catch {
    return null;
  }
  if (fontSpecError(head.spec) || !Array.isArray(head.entries)) return null;
  const base = ml + 4 + hl;
  const files = new Map<string, Uint8Array>();
  for (const e of head.entries) {
    if (!Number.isInteger(e.offset) || !Number.isInteger(e.length) || base + e.offset + e.length > bytes.length) return null;
    files.set(e.name, bytes.subarray(base + e.offset, base + e.offset + e.length));
  }
  return { spec: head.spec, files };
}

/** Filene som skal registreres i nettleseren for én vekt/stil: woff2 per skriftsystem, ellers ttf. */
export function browserFilesFor(files: readonly FontFileRef[], weight: number, italic: boolean): FontFileRef[] {
  const own = files.filter((f) => f.weight === weight && f.italic === italic);
  const woff2 = own.filter((f) => f.format === "woff2");
  return woff2.length ? woff2 : own.filter((f) => f.format === "ttf");
}
