/**
 * Kontroll av lagrede plakatdokumenter (DEC-0061). Egen modul uten tunge avhengigheter, slik at
 * kommandoene kan bruke den uten sirkulære importer.
 */

import type { LocalizedText, PosterDocument, PosterElement, PosterOptions } from "../model";
import { t as tk } from "@/core/i18n/keyed";
import { canonicalLanguageTag } from "../translation/language-tags";

export const POSTER_OPTION_KEYS: readonly (keyof PosterOptions)[] = [
  "imagesAndNamesOnly",
  "shortDescriptions",
  "longDescriptions",
  "relationLines",
  "namedRelations",
  "relationTexts",
  "objectImages",
  "objectDescriptions",
  "placeImages",
  "placeDescriptions",
  "logline",
  "genreMood",
  "projectData",
];

// ---------- Kontroll av lagret plakat (kommandoene) ----------

const HEX = /^#[0-9a-f]{6}$/i;
const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);

/** Gyldig plakatdokument? Feilmelding eller null. Kontrollerer form og grenser, ikke ressursene. */
export function posterDocumentError(d: PosterDocument): string | null {
  if (!d || typeof d !== "object" || d.version !== 1) return tk("core-presentation-document.poster-document-error.message.888b7a1f0354");
  // G-1b: tekst per språkmerke; høyst 40 språk og 4000 tegn per tekst
  const lt = (t: LocalizedText | undefined) =>
    !!t &&
    typeof t === "object" &&
    !Array.isArray(t) &&
    Object.keys(t).length <= 40 &&
    Object.entries(t).every(([k, v]) => canonicalLanguageTag(k) !== null && typeof v === "string" && v.length <= 4000);
  if (!lt(d.title) || !lt(d.logline) || !lt(d.genre) || !lt(d.tagline))
    return tk("core-presentation-document.poster-document-error.message.0a9c01bd87b8");
  const pal = d.palette;
  if (
    !pal ||
    ![pal.background, pal.text, pal.accent, pal.muted].every(
      (c) => typeof c === "string" && HEX.test(c),
    )
  )
    return tk("core-presentation-document.poster-document-error.message.e112634a5f40");
  if (typeof pal.name !== "string" || pal.name.length > 60)
    return tk("core-presentation-document.poster-document-error.message.7b80bf89b38b");
  for (const k of POSTER_OPTION_KEYS)
    if (typeof d.options?.[k] !== "boolean")
      return tk("core-presentation-document.poster-document-error.message.5b260f89dd6e");
  for (const list of [d.characters, d.places, d.objects])
    if (!Array.isArray(list) || list.length > 60 || list.some((x) => typeof x !== "string"))
      return tk("core-presentation-document.poster-document-error.message.5790cbaa1304");
  if (!Array.isArray(d.elements) || d.elements.length > 600)
    return tk("core-presentation-document.poster-document-error.message.071ba3bcd1ed");
  const ids = new Set<string>();
  for (const e of d.elements) {
    if (!e || typeof e.id !== "string" || !e.id || e.id.length > 120 || ids.has(e.id))
      return tk("core-presentation-document.poster-document-error.message.df524c85209f");
    ids.add(e.id);
    if (!["text", "image", "rect", "line", "relation"].includes(e.kind))
      return tk("core-presentation-document.poster-document-error.message.85f01921bc9e");
    if (![e.x, e.y, e.w, e.h, e.rotation].every(finite))
      return tk("core-presentation-document.poster-document-error.message.aefcbbc9090d");
    if ([e.x, e.y, e.w, e.h].some((v) => Math.abs(v) > 20000))
      return tk("core-presentation-document.poster-document-error.message.d53e5bd1afec");
    if (e.kind !== "line" && e.kind !== "relation" && (e.w < 0 || e.h < 0))
      return tk("core-presentation-document.poster-document-error.message.5c5245b4d5e0");
    if (typeof e.visible !== "boolean" || typeof e.auto !== "boolean")
      return tk("core-presentation-document.poster-document-error.message.df524c85209f.2");
    if (e.size !== undefined && (!finite(e.size) || e.size < 1 || e.size > 2000))
      return tk("core-presentation-document.poster-document-error.message.ba74918272a6");
    for (const c of [e.color, e.fill, e.stroke])
      if (c !== undefined && c !== null && !(typeof c === "string" && HEX.test(c)))
        return tk("core-presentation-document.poster-document-error.message.24294fe4019d");
    if (e.opacity !== undefined && (!finite(e.opacity) || e.opacity < 0 || e.opacity > 1))
      return tk("core-presentation-document.poster-document-error.message.b64214dea2c6");
    if (e.text !== undefined && !lt(e.text))
      return tk("core-presentation-document.poster-document-error.message.19751bdc8fe9");
    if (e.kind === "image" && typeof e.assetId !== "string")
      return tk("core-presentation-document.poster-document-error.message.2cb8b2e1de80");
    const err = elementFieldError(e);
    if (err) return err;
  }
  return null;
}

const ELEMENT_KEYS = new Set([
  "id",
  "kind",
  "role",
  "x",
  "y",
  "w",
  "h",
  "rotation",
  "visible",
  "auto",
  "text",
  "font",
  "bold",
  "italic",
  "size",
  "color",
  "align",
  "uppercase",
  "tracking",
  "lineHeight",
  "assetId",
  "assetVariantId",
  "versionId",
  "fit",
  "opacity",
  "fill",
  "stroke",
  "strokeWidth",
  "dashed",
  "radius",
  "relationId",
  "fromElementId",
  "toElementId",
  "overrides",
]);

const optional = (v: unknown, ok: (v: unknown) => boolean) => v === undefined || ok(v);
const inRange = (lo: number, hi: number) => (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const bool = (v: unknown) => typeof v === "boolean";
const shortString = (max: number) => (v: unknown) => typeof v === "string" && v.length <= max;
const idOrNull = (v: unknown) => v === null || shortString(64)(v);

/** Felt for felt: typer, lovlige verdier og grenser (en klient kan ikke lagre noe som ødelegger visningen). */
function elementFieldError(e: PosterElement): string | null {
  const r = e as unknown as Record<string, unknown>;
  for (const k of Object.keys(r))
    if (!ELEMENT_KEYS.has(k))
      return tk("core-presentation-document.element-field-error.message.bfff72cabc22", { value1: String(k.slice(0, 30)) });
  if (!shortString(40)(e.role) || !e.role) return tk("core-presentation-document.element-field-error.message.922cf5d8c10c");
  if (!finite(e.rotation) || Math.abs(e.rotation) > 3600)
    return tk("core-presentation-document.element-field-error.message.cd54581e8a52");
  const checks: [unknown, (v: unknown) => boolean][] = [
    [e.font, (v) => v === "serif" || v === "sans"],
    [e.align, (v) => v === "left" || v === "center" || v === "right"],
    [e.fit, (v) => v === "cover" || v === "contain"],
    [e.bold, bool],
    [e.italic, bool],
    [e.uppercase, bool],
    [e.dashed, bool],
    [e.tracking, inRange(-500, 2000)],
    [e.lineHeight, inRange(0.5, 5)],
    [e.strokeWidth, inRange(0, 100)],
    [e.radius, inRange(0, 1000)],
    [e.assetId, shortString(64)],
    [e.assetVariantId, idOrNull],
    [e.versionId, idOrNull],
    [e.relationId, shortString(64)],
    [e.fromElementId, shortString(120)],
    [e.toElementId, shortString(120)],
    [
      e.overrides,
      (v) =>
        Array.isArray(v) &&
        v.length <= 40 &&
        v.every((k) => typeof k === "string" && (ELEMENT_KEYS.has(k) || k === "z")),
    ],
  ];
  for (const [v, ok] of checks)
    if (!optional(v, ok)) return tk("core-presentation-document.element-field-error.message.a90cde8e91d5");
  return null;
}

/** Ressursene plakaten viser (bilder og utvalg) – brukes av kontrollen av angring og sikkerhetskopi. */
export function posterAssetRefs(d: PosterDocument): {
  assets: Set<string>;
  variants: Set<string>;
  versions: Set<string>;
  relations: Set<string>;
} {
  const assets = new Set<string>([...d.characters, ...d.places, ...d.objects]);
  const variants = new Set<string>();
  const versions = new Set<string>();
  const relations = new Set<string>();
  for (const e of d.elements) {
    if (e.assetId) assets.add(e.assetId);
    if (e.assetVariantId) variants.add(e.assetVariantId);
    if (e.versionId) versions.add(e.versionId);
    if (e.relationId) relations.add(e.relationId);
  }
  return { assets, variants, versions, relations };
}
