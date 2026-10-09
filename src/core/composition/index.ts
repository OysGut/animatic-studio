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
};

/**
 * Felter for et nytt lag midt i scenen. Bakgrunner fyller hele formatet; andre bilder får plass innenfor
 * 60 % av høyden. Fargeflater dekker hele formatet.
 */
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
      name: src.name ?? "Fargeflate",
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
      : Math.min((comp.height * 0.6) / h, (comp.width * 0.6) / w);
  const k = Number.isFinite(fit) && fit > 0 ? Math.round(fit * 1000) / 1000 : 1;
  return {
    kind,
    name: asset?.name ?? "Bilde",
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
  };
}
