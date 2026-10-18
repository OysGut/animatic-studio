/**
 * Handlinger for tekst og maler i sceneeditoren (MTS MT2/MT4/MT5). Bygger på kjernens planleggere og
 * vanlige kommandoer; skriving går via runCommand (samme angrestabel).
 */
import {
  L,
  layersOf,
  lowerThirdStarter,
  mainProduction,
  newId,
  orderedOccurrences,
  planApplyTemplate,
  planTemplateVersionUpdate,
  planUpdateTemplateValues,
  renderFrame,
  sceneNumberOf,
  templateFromLayers,
  templateError,
  templateUses,
  textLayerFields,
  type Command,
  type Composition,
  type ProjectState,
  type TemplateCategory,
  type TemplateUse,
  type TemplateValues,
} from "@/core";
import { drawFrame } from "@/engine/compositor/canvas";
import { fontsReady, textSpecsOf } from "@/engine/typography/fonts";
import { uploadAssetImage } from "@/app/library/asset-images";

export type Run = (command: Command, label: string, group?: string) => string | null;
export type RunAndWait = (
  command: Command,
  label: string,
  group?: string,
) => Promise<{ error: string | null }>;

/** Scenenummer og produksjonsrekkefølge for en 2D-scene (for «Bruk samme design som i scene …»). */
export function sceneLabelFor(state: ProjectState) {
  const main = mainProduction(state);
  const occs = main ? orderedOccurrences(state, main.id) : [];
  return (compositionId: string) => {
    const comp = state.compositions[compositionId];
    const i = comp ? occs.findIndex((o) => o.variantId === comp.variantId) : -1;
    const occ = i >= 0 ? occs[i] : undefined;
    const num = occ ? sceneNumberOf(state, occ) : null;
    return {
      occurrenceId: occ?.id ?? null,
      label: num ? L(`scene ${num}`, `scene ${num}`) : (comp?.name ?? ""),
      order: i >= 0 ? String(i).padStart(6, "0") : "999999",
    };
  };
}

export function lowerThirdUses(state: ProjectState): TemplateUse[] {
  return templateUses(state, sceneLabelFor(state), "lower_third");
}

/** «Legg til tekst» (MT2): et nytt tekstlag midt i scenen, øverst. */
export function addTextLayer(run: Run, comp: Composition): { layerId: string; error: string | null } {
  const layerId = newId<"composition_layer">();
  const error = run(
    {
      type: "AddLayers",
      layers: [
        {
          layerId: layerId as never,
          compositionId: comp.id,
          fields: textLayerFields(comp, L("Tekst", "Text"), L("Tekst", "Text")),
        },
      ],
    },
    L("Legg til tekst", "Add text"),
  );
  return { layerId, error };
}

/** «Ny lower third» (MT5): gruppe med flate, navn og rolle. */
export function addLowerThird(run: Run, comp: Composition): { layerId: string; error: string | null } {
  const layers = lowerThirdStarter(comp, {
    newLayerId: () => newId<"composition_layer">(),
    groupName: L("Lower third", "Lower third"),
    nameLabel: L("Navn", "Name"),
    roleLabel: L("Rolle", "Role"),
    name: L("Navn Navnesen", "Jane Doe"),
    role: L("Rolle", "Role"),
  });
  const error = run({ type: "AddLayers", layers }, L("Ny lower third", "New lower third"));
  return { layerId: layers[0]!.layerId, error };
}

/** «Bruk samme design som i scene …» (§43, Z): ny forekomst med samme malversjon og eget innhold. */
export function applySameDesign(
  run: Run,
  state: ProjectState,
  comp: Composition,
  use: TemplateUse,
  values?: TemplateValues,
): { instanceId: string; error: string | null } {
  const src = state.templateInstances[use.instanceId];
  if (!src) return { instanceId: "", error: L("Malforekomsten finnes ikke", "The template instance does not exist") };
  return applyTemplateVersion(run, state, comp, src.templateVersionId, values, L(
    `Bruk samme design som i ${use.sceneLabel}`,
    `Use the same design as in ${use.sceneLabel}`,
  ));
}

export function applyTemplateVersion(
  run: Run,
  state: ProjectState,
  comp: Composition,
  versionId: string,
  values: TemplateValues | undefined,
  label: string,
): { instanceId: string; error: string | null } {
  const instanceId = newId<"template_instance">();
  const plan = planApplyTemplate(state, {
    instanceId,
    compositionId: comp.id,
    versionId,
    ...(values ? { values } : {}),
    newLayerId: () => newId<"composition_layer">(),
  });
  if (!plan.ok) return { instanceId, error: plan.reason };
  return { instanceId, error: run(plan.command, label) };
}

export function updateInstanceValues(run: Run, state: ProjectState, instanceId: string, values: TemplateValues) {
  const plan = planUpdateTemplateValues(state, instanceId, values);
  if (!plan.ok) return plan.reason;
  return run(plan.command, L("Endre innholdet", "Change the content"));
}

export function updateInstanceVersion(run: Run, state: ProjectState, instanceId: string, versionId: string) {
  const plan = planTemplateVersionUpdate(state, instanceId, versionId, () => newId<"composition_layer">());
  if (!plan.ok) return plan.reason;
  return run(plan.command, L("Oppdater til ny malversjon", "Update to the new template version"));
}

/** Miniatyr av utvalget som PNG (bare lagene i utvalget, på scenens format). */
export async function templateThumbnail(
  state: ProjectState,
  comp: Composition,
  layerIds: readonly string[],
  frame: number,
): Promise<File> {
  await fontsReady(textSpecsOf(state, comp.id));
  const only = new Set<string>();
  for (const id of layerIds) {
    only.add(id);
    for (const l of layersOf(state, comp.id)) if (l.groupId === id) only.add(l.id);
  }
  const out = renderFrame(state, comp.id, frame, { view: "scene", onlyLayers: only });
  const W = 480;
  const k = W / comp.width;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = Math.max(1, Math.round(comp.height * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(L("Kunne ikke lage miniatyren", "Could not make the thumbnail"));
  drawFrame(ctx, out, { view: [k, 0, 0, k, 0, 0], images: new Map(), placeholders: false });
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error(L("Kunne ikke lage miniatyren", "Could not make the thumbnail"));
  return new File([blob], "mal.png", { type: "image/png" }); // i18n-ignore – filnavn
}

/**
 * «Lagre som mal» (MT4, §E, §49): ny malressurs, eller ny versjon av en eksisterende mal. Miniatyren lastes
 * opp som filen; definisjonen lagres i versjonen. Ett angretrinn.
 */
export async function saveAsTemplate(
  runAndWait: RunAndWait,
  state: ProjectState,
  projectId: string,
  comp: Composition,
  layerIds: readonly string[],
  o: {
    readonly name: string;
    readonly category: TemplateCategory;
    readonly frame: number;
    /** Ny versjon av denne malen (variant), i stedet for ny mal. */
    readonly existingVariantId?: string;
  },
): Promise<{ versionId: string; assetId: string }> {
  const def = templateFromLayers(state, comp.id, layerIds, { category: o.category });
  const err = templateError(def);
  if (err) throw new Error(err);
  const group = newId<"command">();
  let assetId: string;
  let variantId: string;
  if (o.existingVariantId) {
    variantId = o.existingVariantId;
    assetId = state.assetVariants[variantId]?.assetId ?? "";
    if (!assetId) throw new Error(L("Malen finnes ikke", "The template does not exist"));
  } else {
    assetId = newId<"asset">();
    variantId = newId<"asset_variant">();
    const name = o.name.trim().slice(0, 200) || L("Mal", "Template");
    const r1 = await runAndWait(
      {
        type: "CreateAssets",
        assets: [
          {
            assetId: assetId as never,
            fields: { kind: "template", name, names: [], description: "", category: o.category, tags: [] },
          },
        ],
      },
      L("Lagre som mal", "Save as template"),
      group,
    );
    if (r1.error) throw new Error(r1.error);
    const r2 = await runAndWait(
      {
        type: "CreateAssetVariant",
        variantId: variantId as never,
        assetId: assetId as never,
        fields: { name: L("Standard", "Default"), style: "other", appearance: "" },
      },
      L("Lagre som mal", "Save as template"),
      group,
    );
    if (r2.error) throw new Error(r2.error);
  }
  const file = await templateThumbnail(state, comp, layerIds, o.frame);
  const up = await uploadAssetImage(projectId, assetId, file);
  const r3 = await runAndWait(
    {
      type: "AddAssetVersion",
      versionId: up.versionId as never,
      variantId: variantId as never,
      media: up.media,
      note: "",
      template: def,
    },
    L("Lagre som mal", "Save as template"),
    group,
  );
  if (r3.error) throw new Error(r3.error);
  return { versionId: up.versionId, assetId };
}
