/**
 * Deler av et bilde lagt inn i scenen (DEC-0088, Mars 15.10.2026: dørramme og dørblad som egne objekter
 * «slik at en kan animere at den åpner seg (gjør dørbladet sakte smalere, med et ankerpunkt på den siden om
 * døren henger på)»). Hver del legges der den lå i originalbildet, i samme størrelse som originallaget. En del
 * med ankerpunkt til venstre eller høyre legges i en egen gruppe med ankerpunktet på den kanten, så skalering
 * i bredden skjer rundt hengselen. Er «resten» av originalen med (ny versjon av samme objekt), skjules
 * originallaget. Ren funksjon: gir lagene og endringen; kalleren kjører kommandoene.
 */
import type { CompositionLayer, ProjectState } from "../model";
import type { LayerFields, NewLayer } from "../commands/types";
import type { PartAnchor, PixelBox } from "../cutout";
import { IDENTITY_TRANSFORM } from "./fields";
import { defaultLayerFields, layerFieldsOf } from "./index";

export interface PlacedPart {
  readonly assetId: string;
  readonly versionId: string;
  readonly box: PixelBox;
  readonly anchor: PartAnchor;
}

export interface PartPlacement {
  readonly layers: NewLayer[];
  /** Originallaget skjult (når resten av originalen er med som egen del), ellers null. */
  readonly hideOriginal: { readonly layerId: string; readonly fields: LayerFields } | null;
}

export function partLayers(
  s: ProjectState,
  original: CompositionLayer,
  parts: readonly PlacedPart[],
  source: { readonly width: number; readonly height: number },
  newLayerId: () => string,
): PartPlacement {
  const comp = s.compositions[original.compositionId];
  if (!comp || source.width <= 0 || source.height <= 0) return { layers: [], hideOriginal: null };
  const t = original.transform;
  // Én pikselbredde i originalbildet, i scenens målestokk
  const kx = (t.scaleX * original.width) / source.width;
  const ky = (t.scaleY * original.height) / source.height;
  const layers: NewLayer[] = [];
  let rest = false;
  for (const p of parts) {
    const version = s.assetVersions[p.versionId];
    if (!version) continue;
    if (p.assetId === original.assetId) rest = true;
    const base = defaultLayerFields(s, comp, {
      assetId: p.assetId,
      assetVariantId: version.variantId,
    });
    const w = version.width ?? p.box.w;
    const h = version.height ?? p.box.h;
    const cx = t.x + (p.box.x + p.box.w / 2 - source.width / 2) * kx;
    const cy = t.y + (p.box.y + p.box.h / 2 - source.height / 2) * ky;
    const scaleX = Math.round(((kx * p.box.w) / Math.max(1, w)) * 1000) / 1000;
    const scaleY = Math.round(((ky * p.box.h) / Math.max(1, h)) * 1000) / 1000;
    const layerId = newLayerId();
    let groupId: string | null = original.groupId;
    if (p.anchor !== "center") {
      // Gruppen står i ro; ankerpunktet er midt på hengselkanten
      const ax = Math.round(
        p.anchor === "left" ? cx - (kx * p.box.w) / 2 : cx + (kx * p.box.w) / 2,
      );
      const anchor = { x: ax, y: Math.round(cy) };
      groupId = newLayerId();
      layers.push({
        layerId: groupId as never,
        compositionId: comp.id,
        fields: {
          kind: "group",
          name: `${s.assets[p.assetId]?.name ?? base.name} – ${p.anchor === "left" ? "hengsel v." : "hengsel h."}`, // i18n-ignore – lagret lagnavn
          assetId: null,
          assetVariantId: null,
          versionId: null,
          fill: null,
          width: 1,
          height: 1,
          parallax: original.parallax,
          transform: { ...IDENTITY_TRANSFORM, ...anchor },
          keyframes: [],
          visible: true,
          locked: false,
          groupId: original.groupId,
          swaps: [],
          path: null,
          anchor,
        },
      });
    }
    layers.push({
      layerId: layerId as never,
      compositionId: comp.id,
      fields: {
        ...base,
        versionId: p.versionId as never,
        width: Math.max(1, Math.round(w)),
        height: Math.max(1, Math.round(h)),
        parallax: original.parallax,
        transform: { ...t, x: Math.round(cx), y: Math.round(cy), scaleX, scaleY },
        groupId: groupId as never,
      },
    });
  }
  return {
    layers,
    hideOriginal: rest
      ? { layerId: original.id, fields: { ...layerFieldsOf(original), visible: false } }
      : null,
  };
}
