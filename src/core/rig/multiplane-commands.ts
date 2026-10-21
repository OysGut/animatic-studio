/**
 * Rigg & 2D-utskrift (B-087/DEC-0100, runde 1): alle riggskrivingene går gjennom den vanlige
 * kommando-/patch-transaksjonen, med angre og gjør om. Inversen er et øyeblikksbilde av radene før
 * endringen (`UndoMultiplaneRigChange`), samme mønster som animasjonsriggen.
 */

import { isUuid } from "../ids";
import type { CompositionLayer, ProjectState } from "../model";
import {
  defaultRig,
  multiplaneRigSpecError,
  rigForLayer,
  withCalibrationChecked,
  type MultiplaneRigSpec,
  type RigSetup,
  type RigTemplate,
} from "./multiplane";
import { t } from "@/core/i18n/keyed";

interface LayerRigLink {
  readonly rigPlateId: string | null;
  readonly rigPlateDepthMm: number;
}

export type MultiplaneRigCommand =
  | { type: "AddRigTemplate"; templateId: string; name: string; spec: MultiplaneRigSpec }
  | { type: "UpdateRigTemplate"; templateId: string; name?: string; spec?: MultiplaneRigSpec }
  | { type: "SetRigTemplateRemoved"; templateId: string; removed: boolean }
  | { type: "AddRigSetup"; setupId: string; sceneId: string | null; templateId: string | null; name: string; spec: MultiplaneRigSpec }
  | { type: "UpdateRigSetup"; setupId: string; name?: string; spec?: MultiplaneRigSpec }
  | { type: "SetRigSetupRemoved"; setupId: string; removed: boolean }
  /**
   * Setter eller endrer riggen i en scene (B-090 pkt 4): prosjektets standardrigg oppdateres til en
   * kopi i samme steg, så nye scener får det sist satte oppsettet. Hele endringen angres samlet.
   * `setupId` brukes bare når scenen ikke har en rigg fra før, og `defaultSetupId` bare når
   * prosjektet ikke har en standardrigg fra før.
   */
  | { type: "ApplySceneRig"; setupId: string; defaultSetupId: string; sceneId: string; name: string; spec: MultiplaneRigSpec }
  /** Kobler et lag til en plate i scenens rigg (null = ingen kobling), med dybde/tykkelse i mm (B-090 pkt 6). */
  | { type: "SetLayerRigPlate"; layerId: string; plateId: string | null; depthMm?: number }
  | {
      type: "UndoMultiplaneRigChange";
      templates: Readonly<Record<string, RigTemplate | null>>;
      setups: Readonly<Record<string, RigSetup | null>>;
      layers: Readonly<Record<string, LayerRigLink | null>>;
    };

const nameError = (name: string) =>
  typeof name !== "string" || name.trim().length < 1 || name.length > 80;

const linkOf = (layer: CompositionLayer): LayerRigLink => ({
  rigPlateId: layer.rigPlateId ?? null,
  rigPlateDepthMm: layer.rigPlateDepthMm ?? 0,
});

export function applyMultiplaneRigCommand(s: ProjectState, c: MultiplaneRigCommand) {
  const templates: Record<string, RigTemplate> = { ...s.rigTemplates };
  const setups: Record<string, RigSetup> = { ...s.rigSetups };
  const layers: Record<string, CompositionLayer> = { ...s.layers };
  const oldTemplates: Record<string, RigTemplate | null> = {};
  const oldSetups: Record<string, RigSetup | null> = {};
  const oldLayers: Record<string, LayerRigLink | null> = {};
  const invalid = (message: string): never => {
    throw new Error(message);
  };
  const fresh = (id: string) => {
    if (!isUuid(id) || templates[id] || setups[id] || Object.prototype.hasOwnProperty.call(s.layers, id))
      invalid(t("core-rig-multiplane-commands.fresh.invalid"));
  };
  const validSpec = (spec: MultiplaneRigSpec): MultiplaneRigSpec => {
    const error = multiplaneRigSpecError(spec);
    if (error) invalid(error);
    return withCalibrationChecked(structuredClone(spec));
  };
  const rememberSetup = (id: string) => {
    if (!(id in oldSetups)) oldSetups[id] = setups[id] ?? null;
  };

  if (c.type === "AddRigTemplate") {
    fresh(c.templateId);
    if (nameError(c.name)) invalid(t("core-rig-multiplane-commands.name.invalid"));
    oldTemplates[c.templateId] = null;
    templates[c.templateId] = {
      id: c.templateId as RigTemplate["id"],
      revision: 1,
      name: c.name.trim(),
      spec: validSpec(c.spec),
      removed: false,
    };
  } else if (c.type === "UpdateRigTemplate") {
    const row = templates[c.templateId] ?? invalid(t("core-rig-multiplane-commands.missing.invalid"));
    if (row.removed) invalid(t("core-rig-multiplane-commands.missing.invalid"));
    if (c.name !== undefined && nameError(c.name)) invalid(t("core-rig-multiplane-commands.name.invalid"));
    oldTemplates[row.id] = row;
    templates[row.id] = {
      id: row.id,
      revision: row.revision + 1,
      name: c.name !== undefined ? c.name.trim() : row.name,
      spec: c.spec !== undefined ? validSpec(c.spec) : row.spec,
      removed: row.removed,
    };
  } else if (c.type === "SetRigTemplateRemoved") {
    const row = templates[c.templateId] ?? invalid(t("core-rig-multiplane-commands.missing.invalid"));
    oldTemplates[row.id] = row;
    templates[row.id] = { id: row.id, revision: row.revision + 1, name: row.name, spec: row.spec, removed: c.removed };
  } else if (c.type === "AddRigSetup") {
    fresh(c.setupId);
    if (nameError(c.name)) invalid(t("core-rig-multiplane-commands.name.invalid"));
    if (c.sceneId !== null && !s.scenes[c.sceneId]) invalid(t("core-rig-multiplane-commands.scene.invalid"));
    const template = c.templateId !== null ? (templates[c.templateId] ?? null) : null;
    if (c.templateId !== null && (!template || template.removed))
      invalid(t("core-rig-multiplane-commands.template.invalid"));
    // Én aktiv standardrigg per prosjekt og én aktiv rigg per scene
    if (Object.values(setups).some((r) => !r.removed && r.sceneId === c.sceneId))
      invalid(t("core-rig-multiplane-commands.duplicate.invalid"));
    rememberSetup(c.setupId);
    setups[c.setupId] = {
      id: c.setupId as RigSetup["id"],
      revision: 1,
      sceneId: c.sceneId as RigSetup["sceneId"],
      templateId: c.templateId as RigSetup["templateId"],
      name: c.name.trim(),
      spec: validSpec(c.spec),
      removed: false,
    };
  } else if (c.type === "UpdateRigSetup") {
    const row = setups[c.setupId] ?? invalid(t("core-rig-multiplane-commands.missing.invalid"));
    if (row.removed) invalid(t("core-rig-multiplane-commands.missing.invalid"));
    if (c.name !== undefined && nameError(c.name)) invalid(t("core-rig-multiplane-commands.name.invalid"));
    rememberSetup(row.id);
    setups[row.id] = {
      id: row.id,
      revision: row.revision + 1,
      sceneId: row.sceneId,
      templateId: row.templateId,
      name: c.name !== undefined ? c.name.trim() : row.name,
      spec: c.spec !== undefined ? validSpec(c.spec) : row.spec,
      removed: row.removed,
    };
  } else if (c.type === "SetRigSetupRemoved") {
    const row = setups[c.setupId] ?? invalid(t("core-rig-multiplane-commands.missing.invalid"));
    rememberSetup(row.id);
    setups[row.id] = { ...row, removed: c.removed, revision: row.revision + 1 };
  } else if (c.type === "ApplySceneRig") {
    if (!s.scenes[c.sceneId]) invalid(t("core-rig-multiplane-commands.scene.invalid"));
    if (nameError(c.name)) invalid(t("core-rig-multiplane-commands.name.invalid"));
    const spec = validSpec(c.spec);
    const own = Object.values(setups).find((r) => !r.removed && r.sceneId === c.sceneId);
    if (own) {
      rememberSetup(own.id);
      setups[own.id] = { ...own, spec, revision: own.revision + 1 };
    } else {
      fresh(c.setupId);
      rememberSetup(c.setupId);
      setups[c.setupId] = {
        id: c.setupId as RigSetup["id"],
        revision: 1,
        sceneId: c.sceneId as RigSetup["sceneId"],
        templateId: null,
        name: c.name.trim(),
        spec,
        removed: false,
      };
    }
    const standard = defaultRig({ ...s, rigSetups: setups });
    if (standard) {
      rememberSetup(standard.id);
      setups[standard.id] = { ...standard, spec, revision: standard.revision + 1 };
    } else {
      fresh(c.defaultSetupId);
      rememberSetup(c.defaultSetupId);
      setups[c.defaultSetupId] = {
        id: c.defaultSetupId as RigSetup["id"],
        revision: 1,
        sceneId: null,
        templateId: null,
        name: c.name.trim(),
        spec,
        removed: false,
      };
    }
  } else if (c.type === "SetLayerRigPlate") {
    const layer = layers[c.layerId] ?? invalid(t("core-rig-multiplane-commands.layer.invalid"));
    if (layer.removed) invalid(t("core-rig-multiplane-commands.layer.invalid"));
    const depth = c.depthMm ?? 0;
    if (typeof depth !== "number" || !Number.isFinite(depth) || depth < 0 || depth > 50)
      invalid(t("core-rig-multiplane-commands.depth.invalid"));
    if (c.plateId !== null) {
      const rig = rigForLayer({ ...s, rigSetups: setups }, layer);
      if (!rig || !rig.spec.plates.some((p) => p.id === c.plateId))
        invalid(t("core-rig-multiplane-commands.plate.invalid"));
    }
    oldLayers[layer.id] = linkOf(layer);
    layers[layer.id] = {
      ...layer,
      rigPlateId: c.plateId,
      rigPlateDepthMm: c.plateId === null ? 0 : depth,
      revision: layer.revision + 1,
    };
  } else {
    for (const [id, row] of Object.entries(c.templates)) {
      if (!(id in oldTemplates)) oldTemplates[id] = templates[id] ?? null;
      if (row) templates[id] = { ...row, revision: (templates[id]?.revision ?? 0) + 1 };
      else delete templates[id];
    }
    for (const [id, row] of Object.entries(c.setups)) {
      rememberSetup(id);
      if (row) setups[id] = { ...row, revision: (setups[id]?.revision ?? 0) + 1 };
      else delete setups[id];
    }
    for (const [id, link] of Object.entries(c.layers)) {
      const layer = layers[id];
      if (!layer) continue;
      oldLayers[id] = linkOf(layer);
      layers[id] = link
        ? { ...layer, rigPlateId: link.rigPlateId, rigPlateDepthMm: link.rigPlateDepthMm, revision: layer.revision + 1 }
        : { ...layer, rigPlateId: null, rigPlateDepthMm: 0, revision: layer.revision + 1 };
    }
    // Platenkoblingene må peke på en plate i scenens rigg
    for (const layer of Object.values(layers)) {
      if (!layer.rigPlateId || layer.removed) continue;
      const rig = rigForLayer({ ...s, rigSetups: setups }, layer);
      if (!rig || !rig.spec.plates.some((p) => p.id === layer.rigPlateId))
        invalid(t("core-rig-multiplane-commands.plate.invalid"));
    }
  }
  const inverse: MultiplaneRigCommand = {
    type: "UndoMultiplaneRigChange",
    templates: oldTemplates,
    setups: oldSetups,
    layers: oldLayers,
  };
  return {
    state: { ...s, rigTemplates: templates, rigSetups: setups, layers },
    inverse,
    affected: [...Object.keys(oldTemplates), ...Object.keys(oldSetups), ...Object.keys(oldLayers)],
  };
}
