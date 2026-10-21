// @vitest-environment node
/** B-098: Google Fonts-katalogen, lisens, fontpakke, fontressurser og reserve for fjernede fonter. */
import { afterEach, describe, expect, it } from "vitest";
import {
  applyCommand,
  cssFont,
  decodeFontPack,
  encodeFontPack,
  filterCatalog,
  FALLBACK_FAMILY,
  FONT_PACK_MIME,
  fontSpecError,
  licenseNeedsNotice,
  licenseOf,
  normalizeFontQuery,
  normalizeTextSpec,
  parseGoogleDeveloperApi,
  parseGoogleMetadata,
  projectFontEntries,
  projectFontId,
  setProjectFonts,
  defaultTextSpec,
  type CatalogFont,
  type FontSpec,
  type ProjectState,
} from "@/core";
import { collectProjectPaths } from "@/core/generation/orphan-files";
import { ORPHAN_REFERENCE_TABLES } from "@/adapters/storage/orphan-cleanup.server";
import { isAllowedFontUrl, parseFontCss } from "@/adapters/fonts/google-fonts.server";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const CATALOG: CatalogFont[] = [
  { family: "Lato", category: "sans", subsets: ["latin", "latin-ext"], variants: [{ weight: 400, italic: false }], license: "OFL-1.1", version: "", popularity: 10 },
  { family: "Lora", category: "serif", subsets: ["latin", "cyrillic"], variants: [{ weight: 400, italic: false }], license: "OFL-1.1", version: "", popularity: 5 },
  { family: "Ubuntu", category: "sans", subsets: ["latin", "greek"], variants: [{ weight: 400, italic: false }], license: "UFL-1.0", version: "", popularity: 8 },
  { family: "Caveat", category: "handwriting", subsets: ["latin"], variants: [{ weight: 400, italic: false }], license: "OFL-1.1", version: "", popularity: 3 },
];

describe("katalogfilteret", () => {
  it("søker på navn, også innlimt lenke eller med plusstegn", () => {
    expect(filterCatalog(CATALOG, { query: "l" }).map((f) => f.family)).toEqual(["Lato", "Lora"]);
    expect(filterCatalog(CATALOG, { query: "https://fonts.google.com/specimen/Caveat" }).map((f) => f.family)).toEqual(["Caveat"]);
    expect(normalizeFontQuery("Open+Sans")).toBe("open sans");
  });
  it("filtrerer på kategori og skriftsystem", () => {
    expect(filterCatalog(CATALOG, { category: "handwriting" }).map((f) => f.family)).toEqual(["Caveat"]);
    expect(filterCatalog(CATALOG, { subset: "cyrillic" }).map((f) => f.family)).toEqual(["Lora"]);
    expect(filterCatalog(CATALOG, { category: "sans", subset: "greek" }).map((f) => f.family)).toEqual(["Ubuntu"]);
  });
  it("sorterer etter popularitet når søket er tomt", () => {
    expect(filterCatalog(CATALOG, {}).map((f) => f.family)).toEqual(["Lato", "Ubuntu", "Lora", "Caveat"]);
  });
});

describe("lisensfeltet", () => {
  it("bruker kildens lisens når den finnes", () => {
    expect(licenseOf("APACHE2", "X")).toBe("Apache-2.0");
    expect(licenseOf("ufl", "X")).toBe("UFL-1.0");
    expect(licenseOf("OFL", "Roboto")).toBe("OFL-1.1");
  });
  it("faller tilbake på kjente lister, ellers OFL", () => {
    expect(licenseOf(undefined, "Roboto")).toBe("Apache-2.0");
    expect(licenseOf(undefined, "Ubuntu Mono")).toBe("UFL-1.0");
    expect(licenseOf(undefined, "Lato")).toBe("OFL-1.1");
  });
  it("bare UFL gir varsel", () => {
    expect(licenseNeedsNotice("UFL-1.0")).toBe(true);
    expect(licenseNeedsNotice("OFL-1.1")).toBe(false);
    expect(licenseNeedsNotice("Apache-2.0")).toBe(false);
  });
});

describe("kildene", () => {
  it("tolker katalogen uten nøkkel", () => {
    const text = `)]}'\n${JSON.stringify({ familyMetadataList: [{ family: "Lato", category: "Sans Serif", subsets: ["menu", "latin"], fonts: { "400": {}, "700i": {} }, popularity: 3 }] })}`;
    const list = parseGoogleMetadata(text)!;
    expect(list[0]).toMatchObject({ family: "Lato", category: "sans", subsets: ["latin"], license: "OFL-1.1" });
    expect(list[0]!.variants).toEqual([{ weight: 400, italic: false }, { weight: 700, italic: true }]);
  });
  it("gir null når formen er endret", () => {
    expect(parseGoogleMetadata("<html>")).toBeNull();
    expect(parseGoogleMetadata(JSON.stringify({ families: [] }))).toBeNull();
    expect(parseGoogleMetadata(JSON.stringify({ familyMetadataList: [{ name: "x" }, { name: "y" }] }))).toBeNull();
  });
  it("tolker Developer API", () => {
    const list = parseGoogleDeveloperApi(JSON.stringify({ items: [{ family: "Lora", category: "serif", variants: ["regular", "italic", "700"], subsets: ["latin"], version: "v35" }] }))!;
    expect(list[0]!.variants).toEqual([{ weight: 400, italic: false }, { weight: 400, italic: true }, { weight: 700, italic: false }]);
    expect(list[0]!.version).toBe("v35");
  });
  it("tillater bare kjente Google-verter", () => {
    expect(isAllowedFontUrl("https://fonts.gstatic.com/s/lato/v24/a.woff2")).toBe(true);
    expect(isAllowedFontUrl("https://fonts.googleapis.com/css2?family=Lato")).toBe(true);
    expect(isAllowedFontUrl("http://fonts.gstatic.com/a.woff2")).toBe(false);
    expect(isAllowedFontUrl("https://evil.example/a.woff2")).toBe(false);
    expect(isAllowedFontUrl("https://fonts.gstatic.com.evil.example/a")).toBe(false);
    expect(isAllowedFontUrl("http://169.254.169.254/")).toBe(false);
  });
  it("tolker css2 og hopper over fremmede adresser", () => {
    const css = `/* latin-ext */\n@font-face { font-family: 'Lato'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/a.woff2) format('woff2'); unicode-range: U+0100-024F; }\n/* latin */\n@font-face { font-family: 'Lato'; font-style: italic; font-weight: 700; src: url(https://evil.example/b.woff2) format('woff2'); }`;
    expect(parseFontCss(css)).toEqual([{ weight: 400, italic: false, url: "https://fonts.gstatic.com/a.woff2", format: "woff2", subset: "latin-ext", unicodeRange: "U+0100-024F" }]);
  });
});

const SPEC: FontSpec = {
  family: "Lato",
  category: "sans",
  weights: [400],
  italics: [],
  subsets: ["latin"],
  license: "OFL-1.1",
  sourceUrl: "https://fonts.google.com/specimen/Lato",
  version: "v24",
  files: [
    { name: "400-latin-0.woff2", weight: 400, italic: false, format: "woff2", subset: "latin", unicodeRange: "U+0000-00FF", bytes: 3 },
    { name: "400-all-1.ttf", weight: 400, italic: false, format: "ttf", bytes: 2 },
  ],
};

describe("fontpakken", () => {
  it("leses tilbake uendret", () => {
    const bytes = encodeFontPack(SPEC, new Map([["400-latin-0.woff2", new Uint8Array([1, 2, 3])], ["400-all-1.ttf", new Uint8Array([9, 8])]]));
    const back = decodeFontPack(bytes)!;
    expect(back.spec).toEqual(SPEC);
    expect([...back.files.get("400-all-1.ttf")!]).toEqual([9, 8]);
    expect(decodeFontPack(new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it("metadata valideres", () => {
    expect(fontSpecError(SPEC)).toBeNull();
    expect(fontSpecError({ ...SPEC, license: "GPL" })).not.toBeNull();
    expect(fontSpecError({ ...SPEC, family: 'x"; }' })).not.toBeNull();
    expect(fontSpecError({ ...SPEC, weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] })).not.toBeNull();
  });
});

function withFont(): { s: ProjectState; assetId: string } {
  let s = seedProject(1).state;
  const assetId = tid<"asset">();
  const variantId = tid<"asset_variant">();
  s = mustApply(s, { type: "CreateAssets", assets: [{ assetId: assetId as never, fields: { kind: "font", name: "Lato", names: [], description: "", category: "sans", tags: [] } }] });
  s = mustApply(s, { type: "CreateAssetVariant", variantId: variantId as never, assetId: assetId as never, fields: { name: "Standard", style: "other", appearance: "" } });
  s = mustApply(s, {
    type: "AddAssetVersion",
    versionId: tid<"asset_version">() as never,
    variantId: variantId as never,
    media: { path: `${s.project.id}/source/${assetId}/v/Lato.ptgfont`, mimeType: FONT_PACK_MIME, width: null, height: null, byteSize: 100, sha256: "a".repeat(64), durationMs: null },
    note: "",
    font: SPEC,
  });
  return { s, assetId };
}

describe("fontressurser", () => {
  afterEach(() => setProjectFonts([]));
  it("en font legges til som ressurs med metadata og kan angres", () => {
    const { s, assetId } = withFont();
    const entries = projectFontEntries(s);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: projectFontId(assetId), label: "Lato", loading: "asset", license: "OFL-1.1" });
    expect(entries[0]!.removed).toBeUndefined();
    const v = Object.values(s.assetVersions).find((x) => x.font)!;
    const r = applyCommand(s, envelope({ type: "UndoAddAssetVersion", versionId: v.id }));
    expect(r.ok).toBe(true);
  });
  it("fontdata godtas bare for fontressurser, og en fontressurs krever fontdata", () => {
    const { s } = withFont();
    const variant = Object.values(s.assetVariants)[0]!;
    const bad = applyCommand(s, envelope({ type: "AddAssetVersion", versionId: tid<"asset_version">() as never, variantId: variant.id, media: { path: `${s.project.id}/x/y.png`, mimeType: "image/png", width: 1, height: 1, byteSize: 1, sha256: "b".repeat(64), durationMs: null }, note: "" }));
    expect(bad.ok).toBe(false);
  });
  it("en fjernet font beholder navnet og gir reserve", () => {
    const { s, assetId } = withFont();
    const removed: ProjectState = { ...s, assets: { ...s.assets, [assetId]: { ...s.assets[assetId as never]!, removed: true } } };
    const entries = projectFontEntries(removed);
    expect(entries[0]).toMatchObject({ label: "Lato", removed: true });
    setProjectFonts(entries);
    const spec = { fontId: projectFontId(assetId), size: 40, weight: 400, italic: false };
    expect(cssFont(spec)).toBe(`400 40px ${FALLBACK_FAMILY}`);
    // Lagret tekst skrives ikke om: fonten beholdes i tekstlaget selv om den mangler
    const n = normalizeTextSpec({ ...defaultTextSpec("Tekst"), fontId: projectFontId(assetId) });
    expect(n.ok && n.value.fontId).toBe(projectFontId(assetId));
    setProjectFonts([]);
    const gone = normalizeTextSpec({ ...defaultTextSpec("Tekst"), fontId: projectFontId(assetId) });
    expect(gone.ok && gone.value.fontId).toBe(projectFontId(assetId));
  });
  it("tegnes med fonten mens den finnes", () => {
    const { s, assetId } = withFont();
    setProjectFonts(projectFontEntries(s));
    expect(cssFont({ fontId: projectFontId(assetId), size: 40, weight: 400, italic: false })).toContain("Lato PTG-");
  });
});

describe("opprydding og referanser", () => {
  it("fontpakken er en ressursfil i en tabell oppryddingen leser", () => {
    expect(ORPHAN_REFERENCE_TABLES).toContain("asset_versions");
    const { s } = withFont();
    const v = Object.values(s.assetVersions).find((x) => x.font)!;
    const found = new Set<string>();
    collectProjectPaths(s.project.id, [{ media_path: v.mediaPath, font_spec: v.font }], found);
    expect(found.has(v.mediaPath)).toBe(true);
  });
});
