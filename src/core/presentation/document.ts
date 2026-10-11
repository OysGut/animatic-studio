/**
 * Kontroll av lagrede plakatdokumenter (DEC-0061). Egen modul uten tunge avhengigheter, slik at
 * kommandoene kan bruke den uten sirkulære importer.
 */
import type { LocalizedText, PosterDocument, PosterElement, PosterOptions } from "../model";

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
  if (!d || typeof d !== "object" || d.version !== 1) return "Ugyldig plakat";
  const lt = (t: LocalizedText | undefined) =>
    !!t &&
    typeof t.nb === "string" &&
    typeof t.en === "string" &&
    t.nb.length <= 4000 &&
    t.en.length <= 4000;
  if (!lt(d.title) || !lt(d.logline) || !lt(d.genre) || !lt(d.tagline))
    return "Ugyldig tekst på plakaten";
  const pal = d.palette;
  if (
    !pal ||
    ![pal.background, pal.text, pal.accent, pal.muted].every(
      (c) => typeof c === "string" && HEX.test(c),
    )
  )
    return "Ugyldige farger";
  if (typeof pal.name !== "string" || pal.name.length > 60) return "Ugyldig stil";
  for (const k of POSTER_OPTION_KEYS)
    if (typeof d.options?.[k] !== "boolean") return "Ugyldige innholdsvalg";
  for (const list of [d.characters, d.places, d.objects])
    if (!Array.isArray(list) || list.length > 60 || list.some((x) => typeof x !== "string"))
      return "Ugyldig utvalg";
  if (!Array.isArray(d.elements) || d.elements.length > 600)
    return "For mange elementer (maks 600)";
  const ids = new Set<string>();
  for (const e of d.elements) {
    if (!e || typeof e.id !== "string" || !e.id || e.id.length > 120 || ids.has(e.id))
      return "Ugyldig element";
    ids.add(e.id);
    if (!["text", "image", "rect", "line", "relation"].includes(e.kind))
      return "Ukjent elementtype";
    if (![e.x, e.y, e.w, e.h, e.rotation].every(finite)) return "Ugyldige mål";
    if ([e.x, e.y, e.w, e.h].some((v) => Math.abs(v) > 20000))
      return "Elementet er utenfor plakaten";
    if (e.kind !== "line" && e.kind !== "relation" && (e.w < 0 || e.h < 0))
      return "Ugyldig størrelse";
    if (typeof e.visible !== "boolean" || typeof e.auto !== "boolean") return "Ugyldig element";
    if (e.size !== undefined && (!finite(e.size) || e.size < 1 || e.size > 2000))
      return "Ugyldig skriftstørrelse";
    for (const c of [e.color, e.fill, e.stroke])
      if (c !== undefined && c !== null && !(typeof c === "string" && HEX.test(c)))
        return "Ugyldig farge";
    if (e.opacity !== undefined && (!finite(e.opacity) || e.opacity < 0 || e.opacity > 1))
      return "Ugyldig gjennomsiktighet";
    if (e.text !== undefined && !lt(e.text)) return "Teksten er for lang (maks 4000 tegn)";
    if (e.kind === "image" && typeof e.assetId !== "string") return "Bildet mangler ressurs";
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
    if (!ELEMENT_KEYS.has(k)) return `Ukjent felt i elementet (${k.slice(0, 30)})`;
  if (!shortString(40)(e.role) || !e.role) return "Ugyldig rolle";
  if (!finite(e.rotation) || Math.abs(e.rotation) > 3600) return "Ugyldig rotasjon";
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
  for (const [v, ok] of checks) if (!optional(v, ok)) return "Ugyldig verdi i elementet";
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
