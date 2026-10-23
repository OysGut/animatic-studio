/**
 * Plassholder → bilde (feilretting 23.10, Øystein: «det eneste vi trenger å gjenbruke er senterposisjonen og
 * gjøre en insert med senterpunktet på det nye bildet»). Når bildet et lag viser, går fra ingen (plassholder)
 * til et ekte bilde, får laget samme størrelse som ved en vanlig innsetting, med bildets egne proporsjoner.
 * Senteret (x, y, ev. animert posisjon og bane) beholdes. Mellom to ekte bilder med ulike proporsjoner
 * beholdes senteret og den lengste synlige siden. Samme proporsjoner: uendret (som før).
 */
import type { AssetVersion, Composition, CompositionLayer, Keyframe, LayerKind, ProjectState } from "../model";
import type { LayerFields } from "../commands/types";
import { layerVersion } from "./render";

/** Samme andel som LAYER_FIT_SHARE i index.ts (egen konstant for å unngå sirkulær import; testen sjekker likheten). */
export const REFIT_FIT_SHARE = 0.5;

/** Skalering et bilde får ved vanlig innsetting (DEC-0092): bakgrunner dekker, andre får plass i 50 %. */
export function insertScale(
  comp: Pick<Composition, "width" | "height">,
  kind: LayerKind,
  w: number,
  h: number,
): number {
  const fit =
    kind === "background"
      ? Math.max(comp.width / w, comp.height / h)
      : Math.min((comp.height * REFIT_FIT_SHARE) / h, (comp.width * REFIT_FIT_SHARE) / w);
  return Number.isFinite(fit) && fit > 0 ? Math.round(fit * 1000) / 1000 : 1;
}

const hasSize = (v: AssetVersion | null): v is AssetVersion & { width: number; height: number } =>
  !!v && !!v.width && !!v.height && v.width > 0 && v.height > 0;

/** Samme proporsjoner innenfor 0,5 % (avrunding i proxyer). */
function sameAspect(aw: number, ah: number, bw: number, bh: number): boolean {
  return Math.abs(aw / ah / (bw / bh) - 1) < 0.005;
}

const sign = (n: number) => (n < 0 ? -1 : 1);

/**
 * Nye felter for laget når bildet det viser, endres fra `before` til `after`; null = ingen endring.
 * Rekkefølge, tidsrom, koblinger og posisjon (også nøkkelbilder og bane) beholdes. Speilvending beholdes.
 * Skalanøkkelbilder skaleres med samme faktor per akse, så bevegelsen beholdes relativt til senteret.
 */
export function refitLayerFields(
  l: CompositionLayer,
  fields: LayerFields,
  comp: Pick<Composition, "width" | "height">,
  before: AssetVersion | null,
  after: AssetVersion | null,
): LayerFields | null {
  if (!hasSize(after)) return null;
  const t = fields.transform;
  const sx = Math.abs(t.scaleX) || 1;
  const sy = Math.abs(t.scaleY) || 1;
  let k: number;
  if (!hasSize(before)) {
    k = insertScale(comp, l.kind, after.width, after.height);
  } else {
    if (sameAspect(before.width, before.height, after.width, after.height)) return null;
    const long = Math.max(before.width * sx, before.height * sy);
    k = Math.round((long / Math.max(after.width, after.height)) * 10000) / 10000;
    if (!(k > 0) || !Number.isFinite(k)) return null;
  }
  const fx = k / sx;
  const fy = k / sy;
  const keyframes: Keyframe[] = fields.keyframes.map((kf) =>
    kf.property === "scaleX" ? { ...kf, value: kf.value * fx } : kf.property === "scaleY" ? { ...kf, value: kf.value * fy } : kf,
  );
  return {
    ...fields,
    width: Math.min(16384, Math.max(1, Math.round(after.width))),
    height: Math.min(16384, Math.max(1, Math.round(after.height))),
    transform: { ...t, scaleX: sign(t.scaleX) * k, scaleY: sign(t.scaleY) * k },
    keyframes,
  };
}

/**
 * Lagene som må tilpasses etter en endring fra `before` til `after` (bildet laget viser er byttet).
 * Nye, fjernede, tekst-, fargeflate- og mallag tilpasses ikke.
 */
export function planLayerRefits(
  before: ProjectState,
  after: ProjectState,
  fieldsOf: (l: CompositionLayer) => LayerFields,
): { readonly layerId: CompositionLayer["id"]; readonly fields: LayerFields }[] {
  if (
    before.layers === after.layers &&
    before.assets === after.assets &&
    before.assetVariants === after.assetVariants &&
    before.assetVersions === after.assetVersions
  )
    return [];
  const out: { layerId: CompositionLayer["id"]; fields: LayerFields }[] = [];
  for (const l of Object.values(after.layers)) {
    const old = before.layers[l.id];
    if (!old || l.removed || l.assetId === null || l.kind === "text" || l.template) continue;
    const vb = layerVersion(before, old);
    const va = layerVersion(after, l);
    if (vb === va || (vb && va && vb.id === va.id)) continue;
    const comp = after.compositions[l.compositionId];
    if (!comp) continue;
    const f = refitLayerFields(l, fieldsOf(l), comp, vb, va);
    if (f) out.push({ layerId: l.id, fields: f });
  }
  return out;
}
