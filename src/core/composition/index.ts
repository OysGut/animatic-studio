/**
 * 2D-sceneeditoren (M3 del 2, mandat kap. 11–12, DEC-0035): felter, rendring og hjelpere for nye lag.
 */
import type { AssetKind, Composition, CompositionLayer, LayerKind, ProjectState } from "../model";
import type { LayerFields } from "../commands/types";
import { coverVersion } from "../library";
import { DEFAULT_PARALLAX, IDENTITY_TRANSFORM } from "./fields";

export * from "./fields";
export * from "./render";
export * from "./animate";
export * from "./format";
export * from "./path";
export * from "./group";
export * from "./camera-handoff";
export * from "./shape";
export * from "./parts";
export * from "./timing";
export * from "./retime";

/** Lagtypen et bilde fra biblioteket får som standard. */
export const LAYER_KIND_FOR_ASSET: Record<AssetKind, LayerKind> = {
  character: "character",
  animal: "character",
  object: "object",
  location: "background",
  environment: "background",
  other: "other",
  // Lyd vises aldri som lag (filtreres bort i lagvalget)
  sound: "other",
  // Maler brukes gjennom «Bruk mal», aldri som bilde
  template: "other",
  font: "other",
};

/**
 * Felter for et nytt lag midt i scenen. Bakgrunner fyller hele formatet; andre bilder får plass innenfor
 * 60 % av høyden. Fargeflater dekker hele formatet.
 */
/**
 * Hvor stor en ressurs blir når den legges inn i en scene (DEC-0092, REQ-0714): 50 % av lerretets høyde eller
 * bredde – det som nås først – så hele figuren synes og er lett å flytte. Bakgrunner fyller lerretet.
 */
export const LAYER_FIT_SHARE = 0.5;

export function defaultLayerFields(
  s: ProjectState,
  comp: Pick<Composition, "width" | "height">,
  src:
    | { readonly assetId: string; readonly assetVariantId?: string | null }
    | { readonly fill: string; readonly name?: string },
): LayerFields {
  const center = { ...IDENTITY_TRANSFORM, x: comp.width / 2, y: comp.height / 2 };
  if ("fill" in src) {
    return {
      kind: "background",
      name: src.name ?? "Fargeflate", // i18n-ignore – lagret standardnavn på laget
      assetId: null,
      assetVariantId: null,
      versionId: null,
      fill: src.fill,
      width: comp.width,
      height: comp.height,
      parallax: DEFAULT_PARALLAX.background,
      transform: center,
      keyframes: [],
      visible: true,
      locked: false,
      groupId: null,
      swaps: [],
      path: null,
      anchor: null,
    };
  }
  const asset = s.assets[src.assetId];
  const kind = asset ? LAYER_KIND_FOR_ASSET[asset.kind] : "other";
  const variantId = src.assetVariantId ?? null;
  const va = variantId ? s.assetVariants[variantId] : undefined;
  const version = va?.approvedVersionId
    ? s.assetVersions[va.approvedVersionId]
    : asset
      ? coverVersion(s, asset.id)
      : null;
  const w = version?.width ?? 512;
  const h = version?.height ?? 512;
  const fit =
    kind === "background"
      ? Math.max(comp.width / w, comp.height / h)
      : Math.min((comp.height * LAYER_FIT_SHARE) / h, (comp.width * LAYER_FIT_SHARE) / w);
  const k = Number.isFinite(fit) && fit > 0 ? Math.round(fit * 1000) / 1000 : 1;
  return {
    kind,
    name: asset?.name ?? "Bilde", // i18n-ignore – lagret standardnavn på laget
    assetId: src.assetId as never,
    assetVariantId: variantId as never,
    versionId: null,
    fill: null,
    width: Math.min(16384, Math.max(1, Math.round(w))),
    height: Math.min(16384, Math.max(1, Math.round(h))),
    parallax: DEFAULT_PARALLAX[kind],
    transform: { ...center, scaleX: k, scaleY: k },
    keyframes: [],
    visible: true,
    locked: false,
    groupId: null,
    swaps: [],
    path: null,
    anchor: null,
  };
}

/** Alle redigerbare felter for et lag (UpdateLayers erstatter alle feltene samlet). */
export function layerFieldsOf(l: CompositionLayer): LayerFields {
  return {
    kind: l.kind,
    name: l.name,
    assetId: l.assetId,
    assetVariantId: l.assetVariantId,
    versionId: l.versionId,
    fill: l.fill,
    width: l.width,
    height: l.height,
    parallax: l.parallax,
    transform: l.transform,
    keyframes: l.keyframes,
    visible: l.visible,
    locked: l.locked,
    groupId: l.groupId,
    swaps: l.swaps,
    path: l.path,
    anchor: l.anchor,
    note: l.note ?? null,
    arrow: l.arrow ?? null,
    cameraMark: l.cameraMark ?? null,
    ...(l.languageImages?.length ? { languageImages: l.languageImages } : {}),
    // Maske og blandingsmodus (REQ-0175): bare når de er satt (utelatt = uendret ved endring)
    ...(l.mask ? { mask: l.mask } : {}),
    ...(l.blend && l.blend !== "normal" ? { blend: l.blend } : {}),
    // Aktivt tidsområde (AS2): null = hele scenen (UpdateLayers skal kunne fjerne det)
    activeRange: l.activeRange ?? null,
    // Tekst, form, effekter og malfelt (MTS): null = ingen (UpdateLayers skal kunne fjerne dem)
    text: l.text ?? null,
    shape: l.shape ?? null,
    effects: l.effects ?? null,
    template: l.template ?? null,
  };
}

/**
 * Største side en arbeidskopi av et opplastet bilde får (Mars 2026-10-13: «systemet bør kunne skalere seg
 * selv i px til sånn ca det som er maks versjonen for scenen»). To ganger filmformatets lengste side gir rom
 * for innzooming med kameraet; aldri under 2048 px. Større bilder lagres i tillegg som original.
 */
export function workingImageMaxSide(projectWidth: number, projectHeight: number): number {
  const long = Math.max(projectWidth || 0, projectHeight || 0);
  return Math.max(2048, Math.round(long * 2));
}

/** Ny størrelse innenfor `maxSide` (samme forhold), eller null når bildet allerede er lite nok. */
export function scaledToFit(
  width: number,
  height: number,
  maxSide: number,
): { readonly width: number; readonly height: number } | null {
  const long = Math.max(width, height);
  if (!(long > maxSide) || width <= 0 || height <= 0) return null;
  const k = maxSide / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/**
 * Speilvend et lag i scenen (DEC-0079: «speilvende det for denne scenen»): skaleringen snus, også i
 * nøkkelbildene, så bevegelsen beholdes. Bildet i biblioteket endres ikke.
 */
export function flippedTransformPatch(
  l: Pick<CompositionLayer, "transform" | "keyframes">,
  axis: "x" | "y",
): Pick<CompositionLayer, "transform" | "keyframes"> {
  const prop = axis === "x" ? "scaleX" : "scaleY";
  return {
    transform: { ...l.transform, [prop]: -l.transform[prop] },
    keyframes: l.keyframes.map((k) => (k.property === prop ? { ...k, value: -k.value } : k)),
  };
}
export * from "./segments";
export * from "./carry-over";
