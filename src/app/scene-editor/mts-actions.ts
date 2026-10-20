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
import { ASSET_BUCKET, createSignedUrls } from "@/adapters/browser/storage-files";
import type { ImageSource } from "@/engine/compositor/canvas";
import { t } from "@/core/i18n/keyed";

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
      label: num ? t("app-scene-editor-mts-actions.label.label.c25caff463b9", { num: String(num) }) : (comp?.name ?? ""),
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
          fields: textLayerFields(comp, t("app-scene-editor-mts-actions.fields.text-layer-fields.aca1bb1ddf04"), t("app-scene-editor-mts-actions.fields.text-layer-fields.aca1bb1ddf04.2")),
        },
      ],
    },
    t("app-scene-editor-mts-actions.error.run.aa7dcff09cf5"),
  );
  return { layerId, error };
}

/** «Ny lower third» (MT5): gruppe med flate, navn og rolle. */
export function addLowerThird(run: Run, comp: Composition): { layerId: string; error: string | null } {
  const layers = lowerThirdStarter(comp, {
    newLayerId: () => newId<"composition_layer">(),
    groupName: t("app-scene-editor-mts-actions.group-name.group-name.51eb12439656"),
    nameLabel: t("app-scene-editor-mts-actions.name-label.name-label.2d49b1d84a54"),
    roleLabel: t("app-scene-editor-mts-actions.role-label.role-label.5bf4368d9bdb"),
    name: t("app-scene-editor-mts-actions.name.name.33954feb5fdb"),
    role: t("app-scene-editor-mts-actions.role.role.3469d44e961d"),
  });
  const error = run({ type: "AddLayers", layers }, t("app-scene-editor-mts-actions.error.run.d06838e5866a"));
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
  if (!src) return { instanceId: "", error: t("app-scene-editor-mts-actions.error.error.916df2c3e532") };
  return applyTemplateVersion(run, state, comp, src.templateVersionId, values, t("app-scene-editor-mts-actions.apply-same-design.apply-template-version.f09aa0c420a0", { sceneLabel: String(use.sceneLabel) }));
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
  return run(plan.command, t("app-scene-editor-mts-actions.update-instance-values.run.03e541a772ca"));
}

export function updateInstanceVersion(run: Run, state: ProjectState, instanceId: string, versionId: string) {
  const plan = planTemplateVersionUpdate(state, instanceId, versionId, () => newId<"composition_layer">());
  if (!plan.ok) return plan.reason;
  return run(plan.command, t("app-scene-editor-mts-actions.update-instance-version.run.759c6025cae9"));
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
  const paths = [...new Set(out.items.flatMap(item => item.version ? [item.version.mediaPath] : []))];
  const images = new Map<string, ImageSource>();
  if (paths.length) {
    const urls = await createSignedUrls(ASSET_BUCKET, paths, 600);
    await Promise.all(urls.map(({ path, signedUrl }) => new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => { images.set(path, image); resolve(); };
      image.onerror = () => reject(new Error(t("app-scene-editor-mts-actions.template-thumbnail.reject.2c7a3b230c77")));
      image.src = signedUrl;
    })));
    if (images.size !== paths.length) throw new Error(t("app-scene-editor-mts-actions.template-thumbnail.message.2c7a3b230c77"));
  }
  const W = 480;
  const k = W / comp.width;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = Math.max(1, Math.round(comp.height * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("app-scene-editor-mts-actions.template-thumbnail.message.65545a7c3c05"));
  drawFrame(ctx, out, { view: [k, 0, 0, k, 0, 0], images, placeholders: false });
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error(t("app-scene-editor-mts-actions.template-thumbnail.message.65545a7c3c05.2"));
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
    if (!assetId) throw new Error(t("app-scene-editor-mts-actions.save-as-template.message.75b9a2a791af"));
  } else {
    assetId = newId<"asset">();
    variantId = newId<"asset_variant">();
    const name = o.name.trim().slice(0, 200) || t("app-scene-editor-mts-actions.name.message.eb5ac61b2cb5");
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
      t("app-scene-editor-mts-actions.r1.run-and-wait.0a9ef878e3ba"),
      group,
    );
    if (r1.error) throw new Error(r1.error);
    const r2 = await runAndWait(
      {
        type: "CreateAssetVariant",
        variantId: variantId as never,
        assetId: assetId as never,
        fields: { name: t("app-scene-editor-mts-actions.name.name.056953d7dfd9"), style: "other", appearance: "" },
      },
      t("app-scene-editor-mts-actions.r2.run-and-wait.b9090017aeed"),
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
    t("app-scene-editor-mts-actions.r3.run-and-wait.bf54ee7b842f"),
    group,
  );
  if (r3.error) throw new Error(r3.error);
  return { versionId: up.versionId, assetId };
}
