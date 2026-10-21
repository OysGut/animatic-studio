/**
 * Mal, innhold og forekomst (MTS MT4, spes. §11–15). Tre adskilte nivåer:
 * 1. Maldefinisjon: en uforanderlig ressursversjon (`AssetVersion.template`) av en ressurs med kind «template».
 * 2. Innhold: `TemplateInstance.values` (feltnøkkel → tekst eller ressurs).
 * 3. Forekomst: `TemplateInstance` i én 2D-scene med låst malversjon, og vanlige lag bygget fra malen. Lokale
 *    justeringer ligger på lagene selv; malen endres aldri av dem.
 * Ren logikk. Lagene som bygges, er vanlige lag (ingen egen motor).
 */
import type { LayerFields, NewLayer } from "../commands/types";
import type { Command } from "../commands/types";
import type {
  AssetId,
  AssetVariantId,
  AssetVersionId,
  CompositionId,
  LayerId,
} from "../ids";
import type { CompositionLayer, Keyframe, ProjectState } from "../model";

import { t as tKey } from "@/core/i18n/keyed";

export type TemplateCategory = "lower_third" | "title" | "text_card" | "text_object" | "credits";

export const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = [
  "lower_third",
  "title",
  "text_card",
  "text_object",
  "credits",
];

export interface TemplateSlot {
  readonly key: string;
  readonly label: string;
  readonly kind: "text" | "image";
}

export interface TemplateElement {
  /** Stabil nøkkel for elementet (samme mellom malversjoner). */
  readonly key: string;
  /** Feltet elementet viser (tekst eller bilde), eller null for et fast element. */
  readonly slot: string | null;
  /** Gruppen elementet ligger i (nøkkelen til et gruppeelement), eller null. */
  readonly parentKey: string | null;
  /** Lagets felter uten gruppe og malkobling. */
  readonly fields: LayerFields;
}

export interface TemplateDefinition {
  readonly format: "animatic-template";
  readonly formatVersion: 1;
  readonly category: TemplateCategory;
  /** Formatet malen er laget i (elementene skaleres til scenen de brukes i). */
  readonly width: number;
  readonly height: number;
  readonly slots: readonly TemplateSlot[];
  /** Bakerst først. */
  readonly elements: readonly TemplateElement[];
}

export type TemplateValue =
  | { readonly text: string }
  | { readonly assetId: AssetId; readonly assetVariantId: AssetVariantId | null };

export type TemplateValues = Readonly<Record<string, TemplateValue>>;

export const MAX_TEMPLATE_ELEMENTS = 100;
export const MAX_TEMPLATE_JSON = 256 * 1024;

const KEY = /^[a-z0-9_-]{1,40}$/;

/** Kontroll av en maldefinisjon (null = gyldig). */
export function templateError(d: unknown): string | null {
  const t = d as TemplateDefinition;
  if (!t || typeof t !== "object" || t.format !== "animatic-template" || t.formatVersion !== 1)
    return tKey("core-typography-template.template-error.message.6b3faad5d8a3");
  if (!TEMPLATE_CATEGORIES.includes(t.category)) return tKey("core-typography-template.template-error.message.502a68da4d5b");
  if (!Number.isInteger(t.width) || !Number.isInteger(t.height) || t.width < 16 || t.height < 16 || t.width > 16384 || t.height > 16384)
    return tKey("core-typography-template.template-error.message.f221a3186b6a");
  if (!Array.isArray(t.slots) || !Array.isArray(t.elements)) return tKey("core-typography-template.template-error.message.6b3faad5d8a3.2");
  if (t.elements.length === 0) return tKey("core-typography-template.template-error.message.6da61b29594e");
  if (t.elements.length > MAX_TEMPLATE_ELEMENTS)
    return tKey("core-typography-template.template-error.message.6cdf135fe96a", { MAX_TEMPLATE_ELEMENTS: String(MAX_TEMPLATE_ELEMENTS) });
  const slotKeys = new Set<string>();
  for (const s of t.slots) {
    if (!s || !KEY.test(s.key) || slotKeys.has(s.key) || typeof s.label !== "string" || s.label.length > 80 || (s.kind !== "text" && s.kind !== "image"))
      return tKey("core-typography-template.template-error.message.d964f4b49407");
    slotKeys.add(s.key);
  }
  const keys = new Set<string>();
  for (const e of t.elements) {
    if (!e || !KEY.test(e.key) || keys.has(e.key)) return tKey("core-typography-template.template-error.message.4215898179ac");
    keys.add(e.key);
    if (e.slot !== null && !slotKeys.has(e.slot)) return tKey("core-typography-template.template-error.message.86c27d8a5f07");
    if (!e.fields || typeof e.fields !== "object") return tKey("core-typography-template.template-error.message.4215898179ac.2");
  }
  for (const e of t.elements)
    if (e.parentKey !== null && !t.elements.some((p) => p.key === e.parentKey && p.fields.kind === "group"))
      return tKey("core-typography-template.template-error.message.8ca489cafa21");
  if (JSON.stringify(t).length > MAX_TEMPLATE_JSON) return tKey("core-typography-template.template-error.message.2a7a1429bbe2");
  return null;
}

/** Lagene i et utvalg, med alle lagene i valgte grupper (bakerst først). */
function selectionLayers(s: ProjectState, layerIds: readonly string[]): CompositionLayer[] {
  const chosen = new Set(layerIds);
  for (const id of layerIds) {
    const l = s.layers[id];
    if (l?.kind === "group")
      for (const x of Object.values(s.layers)) if (x.groupId === l.id && !x.removed) chosen.add(x.id);
  }
  return Object.values(s.layers)
    .filter((l) => chosen.has(l.id) && !l.removed)
    .sort((a, b) => (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0));
}

function slotKeyOf(name: string, used: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/æ/g, "ae")
      .replace(/ø/g, "o")
      .replace(/å/g, "a")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "felt";
  let k = base;
  for (let i = 2; used.has(k); i++) k = `${base}_${i}`;
  used.add(k);
  return k;
}

/**
 * Maldefinisjon fra lag i en scene (§E, §49). Hvert tekstlag blir et tekstfelt (navngitt etter laget); bilder
 * blir bildefelt når `imageSlots` har laget. Alt annet er fast design. Animasjonen (nøkkelbilder, bane,
 * bokstavanimasjon) følger med.
 */
export function templateFromLayers(
  s: ProjectState,
  compositionId: string,
  layerIds: readonly string[],
  o: { readonly category: TemplateCategory; readonly imageSlots?: ReadonlySet<string> },
): TemplateDefinition {
  const comp = s.compositions[compositionId];
  const layers = selectionLayers(s, layerIds).filter((l) => l.compositionId === compositionId);
  const used = new Set<string>();
  const elKey = new Map<string, string>();
  layers.forEach((l, i) => elKey.set(l.id, `e${i + 1}`));
  const slots: TemplateSlot[] = [];
  const elements: TemplateElement[] = layers.map((l) => {
    let slot: string | null = null;
    if (l.kind === "text" || o.imageSlots?.has(l.id)) {
      slot = slotKeyOf(l.name, used);
      slots.push({ key: slot, label: l.name.slice(0, 80), kind: l.kind === "text" ? "text" : "image" });
    }
    const { template: _t, ...rest } = fieldsForTemplate(l);
    return {
      key: elKey.get(l.id)!,
      slot,
      parentKey: l.groupId && elKey.has(l.groupId) ? elKey.get(l.groupId)! : null,
      fields: { ...rest, groupId: null },
    };
  });
  return {
    format: "animatic-template",
    formatVersion: 1,
    category: o.category,
    width: comp?.width ?? 1920,
    height: comp?.height ?? 1080,
    slots,
    elements,
  };
}

function fieldsForTemplate(l: CompositionLayer): LayerFields {
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
    locked: false,
    groupId: l.groupId,
    swaps: l.swaps,
    path: l.path,
    anchor: l.anchor,
    ...(l.mask ? { mask: l.mask } : {}),
    ...(l.blend && l.blend !== "normal" ? { blend: l.blend } : {}),
    activeRange: l.activeRange ?? null,
    text: l.text ?? null,
    shape: l.shape ?? null,
    effects: l.effects ?? null,
    template: null,
  };
}

/** Innholdet malen har fra før (teksten og bildene i malen). */
export function defaultTemplateValues(d: TemplateDefinition): Record<string, TemplateValue> {
  const out: Record<string, TemplateValue> = {};
  for (const e of d.elements) {
    if (!e.slot || out[e.slot]) continue;
    if (e.fields.text) out[e.slot] = { text: e.fields.text.content };
    else if (e.fields.assetId)
      out[e.slot] = { assetId: e.fields.assetId, assetVariantId: e.fields.assetVariantId };
  }
  return out;
}

/** Skalerer et element fra malens format til scenens (posisjon følger formatet, størrelse det minste forholdet). */
function scaleFields(f: LayerFields, kx: number, ky: number): LayerFields {
  if (kx === 1 && ky === 1) return f;
  const k = Math.min(kx, ky);
  const t = f.transform;
  const kf = (x: Keyframe): Keyframe =>
    x.property === "x"
      ? { ...x, value: x.value * kx }
      : x.property === "y"
        ? { ...x, value: x.value * ky }
        : x.property === "scaleX" || x.property === "scaleY"
          ? { ...x, value: x.value * k }
          : x;
  return {
    ...f,
    transform: { ...t, x: t.x * kx, y: t.y * ky, scaleX: t.scaleX * k, scaleY: t.scaleY * k },
    keyframes: f.keyframes.map(kf),
    anchor: f.anchor ? { x: f.anchor.x * kx, y: f.anchor.y * ky } : null,
  };
}

/** Feltene ett element får i en forekomst: malens design med innholdet satt inn. */
export function elementFields(
  d: TemplateDefinition,
  e: TemplateElement,
  values: TemplateValues,
  o: { readonly instanceId: string; readonly width: number; readonly height: number; readonly groupIdOf: (key: string) => string | null },
): LayerFields {
  let f: LayerFields = scaleFields(e.fields, o.width / d.width, o.height / d.height);
  const v = e.slot ? values[e.slot] : undefined;
  if (v && "text" in v && f.text) f = { ...f, text: { ...f.text, content: v.text } };
  if (v && "assetId" in v && f.assetId !== null)
    f = { ...f, assetId: v.assetId, assetVariantId: v.assetVariantId, versionId: null, swaps: [] };
  return {
    ...f,
    groupId: e.parentKey ? o.groupIdOf(e.parentKey) : null,
    template: { instanceId: o.instanceId, key: e.key, slot: e.slot },
  };
}

export interface TemplateInstanceFields {
  readonly compositionId: CompositionId;
  readonly templateAssetId: AssetId;
  readonly templateVersionId: AssetVersionId;
  readonly values: TemplateValues;
}

/**
 * «Bruk mal» (MT4, §11, §14): én samlet kommando som lager forekomsten og lagene. Ett angretrinn, én
 * revisjon per rad.
 */
export function planApplyTemplate(
  s: ProjectState,
  a: {
    readonly instanceId: string;
    readonly compositionId: string;
    readonly versionId: string;
    readonly values?: TemplateValues;
    readonly newLayerId: () => string;
  },
): { ok: true; command: Command } | { ok: false; reason: string } {
  const ver = s.assetVersions[a.versionId];
  const def = ver?.template;
  const comp = s.compositions[a.compositionId];
  if (!ver || !def) return { ok: false, reason: tKey("core-typography-template.reason.reason.ad3919ae06e7") };
  if (!comp) return { ok: false, reason: tKey("core-typography-template.reason.reason.495b9541af70") };
  const variant = s.assetVariants[ver.variantId];
  if (!variant) return { ok: false, reason: tKey("core-typography-template.reason.reason.ad3919ae06e7.2") };
  const values = { ...defaultTemplateValues(def), ...(a.values ?? {}) };
  const ids = new Map<string, string>();
  for (const e of def.elements) ids.set(e.key, a.newLayerId());
  const layers: NewLayer[] = def.elements.map((e) => ({
    layerId: ids.get(e.key) as LayerId,
    compositionId: comp.id,
    fields: elementFields(def, e, values, {
      instanceId: a.instanceId,
      width: comp.width,
      height: comp.height,
      groupIdOf: (k) => ids.get(k) ?? null,
    }),
  }));
  return {
    ok: true,
    command: {
      type: "ApplyTemplate",
      steps: [
        {
          type: "AddTemplateInstance",
          instanceId: a.instanceId as never,
          fields: {
            compositionId: comp.id,
            templateAssetId: variant.assetId,
            templateVersionId: ver.id,
            values,
          },
        },
        { type: "AddLayers", layers },
      ],
    },
  };
}

/** Lagene i en forekomst (ikke slettet). */
export function instanceLayers(s: ProjectState, instanceId: string): CompositionLayer[] {
  return Object.values(s.layers).filter((l) => l.template?.instanceId === instanceId && !l.removed);
}

/**
 * Nytt innhold i en forekomst (§44, AA): teksten i feltlagene byttes; design og lokale justeringer beholdes.
 * Malen og andre forekomster endres ikke (AB).
 */
export function planUpdateTemplateValues(
  s: ProjectState,
  instanceId: string,
  values: TemplateValues,
): { ok: true; command: Command } | { ok: false; reason: string } {
  const inst = s.templateInstances[instanceId];
  if (!inst || inst.removed) return { ok: false, reason: tKey("core-typography-template.reason.reason.ff34111d10e1") };
  const merged = { ...inst.values, ...values };
  const updates: { layerId: LayerId; fields: LayerFields }[] = [];
  for (const l of instanceLayers(s, instanceId)) {
    const slot = l.template?.slot;
    const v = slot ? merged[slot] : undefined;
    if (!v) continue;
    const f = layerFieldsForUpdate(l);
    if ("text" in v && l.text && l.text.content !== v.text)
      updates.push({ layerId: l.id, fields: { ...f, text: { ...l.text, content: v.text } } });
    if ("assetId" in v && l.assetId !== null && (l.assetId !== v.assetId || l.assetVariantId !== v.assetVariantId))
      updates.push({
        layerId: l.id,
        fields: { ...f, assetId: v.assetId, assetVariantId: v.assetVariantId, versionId: null, swaps: [] },
      });
  }
  const steps: Command[] = [
    { type: "UpdateTemplateInstance", instanceId: inst.id, fields: { values: merged, templateVersionId: inst.templateVersionId } },
  ];
  if (updates.length) steps.push({ type: "UpdateLayers", layers: updates });
  return { ok: true, command: { type: "ApplyTemplate", steps } };
}

function layerFieldsForUpdate(l: CompositionLayer): LayerFields {
  const { template, ...f } = fieldsForTemplate(l);
  return { ...f, locked: l.locked, template: l.template ?? template ?? null };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Oppdater en forekomst til en nyere malversjon (§15, AI–AJ): bare når brukeren ber om det. Felter brukeren
 * har justert lokalt (forskjellig fra det den gamle malversjonen ga), beholdes; resten tar den nye malen.
 * Elementer som er nye i malen, legges til; elementer som er fjernet, fjernes fra scenen (kan angres).
 */
export function planTemplateVersionUpdate(
  s: ProjectState,
  instanceId: string,
  newVersionId: string,
  newLayerId: () => string,
): { ok: true; command: Command } | { ok: false; reason: string } {
  const inst = s.templateInstances[instanceId];
  if (!inst || inst.removed) return { ok: false, reason: tKey("core-typography-template.reason.reason.ff34111d10e1.2") };
  const oldDef = s.assetVersions[inst.templateVersionId]?.template;
  const newVer = s.assetVersions[newVersionId];
  const newDef = newVer?.template;
  const comp = s.compositions[inst.compositionId];
  if (!oldDef || !newDef || !comp || !newVer) return { ok: false, reason: tKey("core-typography-template.reason.reason.ec925d64190b") };
  if (s.assetVariants[newVer.variantId]?.assetId !== inst.templateAssetId)
    return { ok: false, reason: tKey("core-typography-template.reason.reason.7940f9c21fd9") };
  const current = new Map(instanceLayers(s, instanceId).map((l) => [l.template!.key, l]));
  const ids = new Map<string, string>();
  for (const e of newDef.elements) ids.set(e.key, current.get(e.key)?.id ?? newLayerId());
  const opts = (d: TemplateDefinition, map: (k: string) => string | null) => ({
    instanceId,
    width: comp.width,
    height: comp.height,
    groupIdOf: map,
  });
  const updates: { layerId: LayerId; fields: LayerFields }[] = [];
  const adds: NewLayer[] = [];
  for (const e of newDef.elements) {
    const fresh = elementFields(newDef, e, inst.values, opts(newDef, (k) => ids.get(k) ?? null));
    const l = current.get(e.key);
    if (!l) {
      adds.push({ layerId: ids.get(e.key) as LayerId, compositionId: comp.id, fields: fresh });
      continue;
    }
    const oldEl = oldDef.elements.find((x) => x.key === e.key);
    const was = oldEl
      ? elementFields(oldDef, oldEl, inst.values, opts(oldDef, (k) => current.get(k)?.id ?? null))
      : fresh;
    const cur = layerFieldsForUpdate(l);
    const out: Record<string, unknown> = { ...fresh };
    for (const k of Object.keys(cur) as (keyof LayerFields)[]) {
      if (k === "template" || k === "groupId") continue;
      // Lokal justering: forekomsten skiller seg fra det den gamle malen ga → behold den
      if (k === "text" && cur.text && was.text && fresh.text) {
        const t: Record<string, unknown> = { ...fresh.text };
        for (const tk of Object.keys(cur.text) as (keyof typeof cur.text)[])
          if (!sameJson(cur.text[tk], was.text[tk])) t[tk] = cur.text[tk];
        out["text"] = t;
      } else if (!sameJson(cur[k], was[k])) out[k] = cur[k];
    }
    if (!sameJson(out, cur)) updates.push({ layerId: l.id, fields: out as unknown as LayerFields });
  }
  const removed = [...current.values()].filter((l) => !newDef.elements.some((e) => e.key === l.template!.key));
  const steps: Command[] = [
    { type: "UpdateTemplateInstance", instanceId: inst.id, fields: { values: inst.values, templateVersionId: newVer.id as AssetVersionId } },
  ];
  if (adds.length) steps.push({ type: "AddLayers", layers: adds });
  if (updates.length) steps.push({ type: "UpdateLayers", layers: updates });
  if (removed.length) steps.push({ type: "SetLayersRemoved", layerIds: removed.map((l) => l.id), removed: true });
  return { ok: true, command: { type: "ApplyTemplate", steps } };
}

/** Nyeste versjon av malen (på tvers av variantene), og om forekomsten har en eldre. */
export function newerTemplateVersion(s: ProjectState, instanceId: string): string | null {
  const inst = s.templateInstances[instanceId];
  if (!inst) return null;
  const cur = s.assetVersions[inst.templateVersionId];
  if (!cur) return null;
  const latest = Object.values(s.assetVersions)
    .filter((v) => v.variantId === cur.variantId && v.template && !v.removed)
    .sort((a, b) => b.number - a.number)[0];
  return latest && latest.id !== cur.id ? latest.id : null;
}

export interface TemplateUse {
  readonly instanceId: string;
  readonly compositionId: string;
  readonly occurrenceId: string | null;
  readonly sceneLabel: string;
  readonly templateName: string;
  readonly versionNumber: number;
  readonly category: TemplateCategory;
}

/**
 * Forekomster av maler i prosjektet for «Bruk samme design som i scene …» (§14, §43, Z), sortert etter
 * produksjonsrekkefølge. `sceneLabel` er scenens nummer eller navnet på 2D-scenen.
 */
export function templateUses(
  s: ProjectState,
  sceneLabelOf: (compositionId: string) => { occurrenceId: string | null; label: string; order: string },
  category?: TemplateCategory,
): TemplateUse[] {
  const out: (TemplateUse & { order: string })[] = [];
  for (const i of Object.values(s.templateInstances)) {
    if (i.removed) continue;
    const ver = s.assetVersions[i.templateVersionId];
    const def = ver?.template;
    if (!ver || !def || (category && def.category !== category)) continue;
    if (!instanceLayers(s, i.id).length) continue;
    const sc = sceneLabelOf(i.compositionId);
    out.push({
      instanceId: i.id,
      compositionId: i.compositionId,
      occurrenceId: sc.occurrenceId,
      sceneLabel: sc.label,
      templateName: s.assets[i.templateAssetId]?.name ?? "",
      versionNumber: ver.number,
      category: def.category,
      order: sc.order,
    });
  }
  return out
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.instanceId.localeCompare(b.instanceId)))
    .map(({ order: _o, ...u }) => u);
}
