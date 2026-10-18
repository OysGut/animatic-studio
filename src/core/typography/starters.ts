/**
 * Utgangspunkter for nye tekstlag og lower thirds (MTS MT2/MT5). Ren logikk: gir vanlige lag (AddLayers),
 * som kan redigeres og lagres som mal etterpå. Ingen egen motor.
 */
import type { LayerFields, NewLayer } from "../commands/types";
import type { Composition } from "../model";
import { DEFAULT_PARALLAX, IDENTITY_TRANSFORM } from "../composition/fields";
import { defaultTextSpec } from "./validate";
import type { TextSpec } from "./types";

/** Feltene for et nytt tekstlag midt i scenen. */
export function textLayerFields(
  comp: Pick<Composition, "width" | "height">,
  content: string,
  name: string,
  patch: Partial<TextSpec> = {},
): LayerFields {
  const text = { ...defaultTextSpec(content), ...patch };
  return {
    kind: "text",
    name: name.slice(0, 200),
    assetId: null,
    assetVariantId: null,
    versionId: null,
    fill: null,
    width: Math.round(comp.width * 0.8),
    height: Math.round(text.size * text.lineHeight * 2),
    parallax: DEFAULT_PARALLAX.text,
    transform: { ...IDENTITY_TRANSFORM, x: comp.width / 2, y: comp.height / 2 },
    keyframes: [],
    visible: true,
    locked: false,
    groupId: null,
    swaps: [],
    path: null,
    anchor: null,
    activeRange: null,
    text,
    shape: null,
    effects: null,
    template: null,
  };
}

/**
 * En enkel lower third (§39–41): gruppe med en flate, navn og rolle nederst til venstre. Lagnavnene blir
 * feltnavnene når den lagres som mal («Navn», «Rolle»).
 */
export function lowerThirdStarter(
  comp: Pick<Composition, "id" | "width" | "height">,
  o: {
    readonly newLayerId: () => string;
    readonly groupName: string;
    readonly nameLabel: string;
    readonly roleLabel: string;
    readonly name: string;
    readonly role: string;
  },
): NewLayer[] {
  const k = comp.height / 1080;
  const x0 = Math.round(comp.width * 0.06);
  const y0 = Math.round(comp.height * 0.78);
  const w = Math.round(comp.width * 0.36);
  const groupId = o.newLayerId();
  const base = {
    assetId: null,
    assetVariantId: null,
    versionId: null,
    keyframes: [],
    visible: true,
    locked: false,
    swaps: [],
    path: null,
    anchor: null,
    activeRange: null,
    effects: null,
    template: null,
  } as const;
  const group: LayerFields = {
    ...base,
    kind: "group",
    name: o.groupName.slice(0, 200),
    fill: null,
    width: 1,
    height: 1,
    parallax: DEFAULT_PARALLAX.text,
    transform: { ...IDENTITY_TRANSFORM, x: 0, y: 0 },
    groupId: null,
    text: null,
    shape: null,
  };
  const barH = Math.round(150 * k);
  const bar: LayerFields = {
    ...base,
    kind: "background",
    name: o.groupName.slice(0, 180) + " – bg", // i18n-ignore – lagret lagnavn
    fill: "#101820",
    width: w,
    height: barH,
    parallax: DEFAULT_PARALLAX.text,
    transform: { ...IDENTITY_TRANSFORM, x: x0 + w / 2, y: y0 + barH / 2, opacity: 0.85 },
    groupId,
    text: null,
    shape: { type: "rect", radius: Math.round(6 * k), stroke: null },
  };
  const line = (label: string, content: string, y: number, size: number, weight: number, color: string): LayerFields => ({
    ...base,
    kind: "text",
    name: label.slice(0, 200),
    fill: null,
    width: w - Math.round(48 * k),
    height: Math.round(size * 1.3),
    parallax: DEFAULT_PARALLAX.text,
    transform: { ...IDENTITY_TRANSFORM, x: x0 + w / 2, y },
    groupId,
    shape: null,
    text: {
      ...defaultTextSpec(content),
      size: Math.round(size),
      weight,
      color,
      align: "left",
      wrap: false,
    },
  });
  return [
    { layerId: groupId as never, compositionId: comp.id as never, fields: group },
    { layerId: o.newLayerId() as never, compositionId: comp.id as never, fields: bar },
    {
      layerId: o.newLayerId() as never,
      compositionId: comp.id as never,
      fields: line(o.nameLabel, o.name, y0 + barH * 0.36, 56 * k, 700, "#ffffff"),
    },
    {
      layerId: o.newLayerId() as never,
      compositionId: comp.id as never,
      fields: line(o.roleLabel, o.role, y0 + barH * 0.72, 36 * k, 400, "#d6dde6"),
    },
  ];
}
