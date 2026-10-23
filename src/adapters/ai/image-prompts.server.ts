/**
 * B-105a: bildeprompter bygges på serveren. BARE PÅ SERVEREN.
 *
 * Klienten sender brukerens egen prompttekst (det brukeren ser og redigerer) og innstillingene. Malene,
 * stilreglene og avsnittet om vedlagte bilder legges til her, fra prosjektdata lest med brukerens tilgang.
 * Vedleggene (stier og roller) beregnes også her, så klienten ikke kan styre teksten om dem.
 */
import { z } from "zod";
import {
  attachedImages,
  foreignAttachedChoice,
  MAX_ATTACHED_IMAGES_ANY,
  buildContextImagePrompt,
  stripAttachedSection,
  styleGuideError,
  type StyleGuide,
  briefSummaryNb,
  buildContextImageBrief,
  buildHarmonizePrompt,
  buildImagePrompt,
  buildPartPrompt,
  buildVariationPrompt,
  fullSizeOriginal,
  harmonizeAttachments,
  mainProduction,
  renderBrief,
  turnaroundAttachments,
  VERSION_VIEWS,
  VERSION_VIEW_LABEL,
  withAttachedLegend,
  type AttachedImage,
  type ProjectState,
  type VersionView,
} from "@/core";
import { t as tk } from "@/core/i18n/keyed";

const uuid = z.string().uuid();
const view = z.enum(VERSION_VIEWS as unknown as [VersionView, ...VersionView[]]);
const family = z.enum(["narrative", "compact"]);
const name = z.string().max(200);

export const imagePromptRequest = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("asset"),
    assetId: uuid,
    variantId: uuid.nullable(),
    /** Dagens bilde som beholdes (identitet), eller null. */
    referenceVersionId: uuid.nullable(),
    /** Produksjon og scene (DEC-0065); null: enkel beskrivelse uten filmens kontekst. */
    productionId: uuid.nullable(),
    occurrenceId: uuid.nullable(),
    style: z.boolean(),
    /** Brukerens valg av vedlegg (Øystein 23.10): bortvalg og tillegg med rolle. */
    excluded: z.array(uuid).max(64).optional(),
    added: z
      .array(z.object({ versionId: uuid, role: z.enum(["style", "view"]) }))
      .max(MAX_ATTACHED_IMAGES_ANY)
      .optional(),
    /** Grensen for den valgte modellen (serveren bruker den minste av denne og modellens egen). */
    maxImages: z.number().int().min(1).max(MAX_ATTACHED_IMAGES_ANY).optional(),
    fullSize: z.boolean(),
    family,
    transparent: z.boolean(),
  }),
  z.object({
    kind: z.literal("turnaround"),
    assetId: uuid,
    versionId: uuid,
    view: view.nullable(),
    views: z.array(view).max(VERSION_VIEWS.length),
    extraViews: z.array(z.object({ versionId: uuid, view })).max(12),
    style: z.boolean(),
    family,
    transparent: z.boolean(),
  }),
  z.object({
    kind: z.literal("variation"),
    assetId: uuid,
    versionId: uuid,
    change: z.string().max(2000),
    index: z.number().int().min(0).max(20),
    count: z.number().int().min(1).max(20),
    style: z.boolean(),
    family,
    transparent: z.boolean(),
  }),
  z.object({
    kind: z.literal("part"),
    assetId: uuid,
    versionId: uuid,
    part: name.min(1),
    others: z.array(name).max(30),
    style: z.boolean(),
    family,
    transparent: z.boolean(),
  }),
  z.object({
    /** Filmens visuelle stil: eksempel på en beskrivelse med et ulagret utkast (DEC-0065). */
    kind: z.literal("styleDraft"),
    assetId: uuid,
    profileId: uuid.nullable(),
    guide: z.record(z.string(), z.unknown()),
  }),
  z.object({
    kind: z.literal("harmonize"),
    assetId: uuid,
    versionId: uuid,
    styleProfileId: uuid.nullable(),
    referenceVersionId: uuid.nullable(),
  }),
]);
export type ImagePromptRequest = z.infer<typeof imagePromptRequest>;

export interface ComposedImagePrompt {
  /** Beskrivelsen uten avsnittet om vedlagte bilder (det brukeren ser og kan redigere). */
  readonly body: string;
  readonly negative: string | null;
  /** Kort oppsummering av beskrivelsen (DEC-0080), når den bygges fra filmens kontekst. */
  readonly summary: readonly string[] | null;
  readonly attached: readonly AttachedImage[];
  readonly referencePaths: readonly string[];
  readonly identityFirst: boolean;
  readonly assetName: string;
}

/** Bygger beskrivelsen og vedleggene. Returnerer null når ressursen/versjonen ikke finnes. */
export function composeImagePrompt(
  s: ProjectState,
  r: ImagePromptRequest,
  opts: { readonly maxImages?: number } = {},
): ComposedImagePrompt | null {
  const asset = s.assets[r.assetId];
  if (!asset || asset.removed) return null;
  const out = (
    body: string,
    negative: string | null,
    attached: readonly AttachedImage[],
    summary: readonly string[] | null = null,
    paths?: readonly string[],
  ): ComposedImagePrompt => ({
    body,
    negative,
    summary,
    attached,
    referencePaths: paths ?? attached.map((a) => a.path),
    identityFirst: attached[0]?.role === "identity",
    assetName: asset.name,
  });
  if (r.kind === "styleDraft") {
    const main = mainProduction(s);
    const guide = r.guide as unknown as StyleGuide;
    let bad: string | null;
    try {
      bad = styleGuideError(guide);
    } catch {
      bad = "invalid";
    }
    if (!main || bad) return null;
    const pid = r.profileId ?? "preview";
    const sim: ProjectState = {
      ...s,
      // Bare utkastet, så forhåndsvisningen viser akkurat denne profilen
      styleProfiles: {
        [pid]: {
          id: pid as never,
          revision: 1,
          name: tk("app-projects-style-guide-section.name.name.814846ecf119"),
          isDefault: true,
          guide,
          removed: false,
        },
      },
    };
    const va = Object.values(s.assetVariants).find((v) => v.assetId === asset.id && !v.archived);
    const body = buildContextImagePrompt(sim, {
      assetId: asset.id,
      variantId: va?.id ?? null,
      productionId: main.id,
      occurrenceId: null,
      withReference: false,
    });
    return out(stripAttachedSection(body), null, []);
  }
  if (r.kind === "harmonize") {
    const body = buildHarmonizePrompt(s, r);
    return body ? out(body, null, harmonizeAttachments(s, r)) : null;
  }
  const version = "versionId" in r ? s.assetVersions[r.versionId] : undefined;
  if (r.kind !== "asset") {
    const main = mainProduction(s);
    if (!main || !version) return null;
    const base = {
      assetId: asset.id,
      productionId: main.id,
      identityVersionId: version.id,
      style: r.style,
    };
    const attached =
      r.kind === "turnaround"
        ? turnaroundAttachments(s, { ...base, extraViews: r.extraViews })
        : turnaroundAttachments(s, base).filter((a) => a.role !== "view");
    const brief = buildContextImageBrief(s, {
      assetId: asset.id,
      variantId: version.variantId,
      productionId: main.id,
      occurrenceId: null,
      withReference: true,
      attached,
      family: r.family,
      transparent: r.transparent,
      ...(r.kind === "turnaround"
        ? { task: r.view ? ("view" as const) : ("sheet" as const), views: r.view ? [r.view] : r.views }
        : {}),
    });
    if (!brief) return null;
    const rendered =
      r.kind === "turnaround"
        ? renderBrief(brief, r.family)
        : r.kind === "variation"
          ? buildVariationPrompt(brief, r.change.trim() || "…", { index: r.index, count: r.count, family: r.family })
          : buildPartPrompt(brief, r.part, r.others, r.family);
    return out(rendered.prompt, rendered.negative, attached);
  }
  // «asset»: bildepanelet i biblioteket og sceneeditoren
  const ref = r.referenceVersionId ? s.assetVersions[r.referenceVersionId] : undefined;
  const identity = ref && ref.mimeType.startsWith("image/") ? ref : null;
  const variant = r.variantId ? (s.assetVariants[r.variantId] ?? null) : null;
  // Bare bildeversjoner fra dette prosjektet kan legges til (som referenceImages)
  const choice = { excluded: r.excluded ?? [], added: r.added ?? [] };
  if (foreignAttachedChoice(s, choice).length) return null;
  if (r.productionId && s.productions[r.productionId]) {
    const max = Math.min(r.maxImages ?? MAX_ATTACHED_IMAGES_ANY, opts.maxImages ?? MAX_ATTACHED_IMAGES_ANY);
    const attached = attachedImages(s, {
      assetId: asset.id,
      productionId: r.productionId,
      occurrenceId: r.occurrenceId,
      identityVersionId: identity?.id ?? null,
      style: r.style,
      choice,
      ...(r.maxImages !== undefined || opts.maxImages !== undefined ? { max } : {}),
    });
    const input = {
      assetId: asset.id,
      variantId: variant?.id ?? null,
      productionId: r.productionId,
      occurrenceId: r.occurrenceId,
      withReference: identity !== null,
      attached,
      family: r.family,
      transparent: r.transparent,
    };
    const brief = buildContextImageBrief(s, input);
    if (!brief) return null;
    const rendered = renderBrief(brief, r.family);
    const paths = attached.map((a) =>
      r.fullSize ? (fullSizeOriginal(s, a.versionId)?.mediaPath ?? a.path) : a.path,
    );
    return out(
      rendered.prompt,
      r.family === "compact" ? rendered.negative : null,
      attached,
      briefSummaryNb(brief, r.family, (v) => VERSION_VIEW_LABEL[v]),
      paths,
    );
  }
  const attached: AttachedImage[] = identity
    ? [
        {
          versionId: identity.id,
          path: identity.mediaPath,
          mimeType: identity.mimeType,
          role: "identity",
          label: `the current design of ${asset.name} (v${identity.number})`,
        },
      ]
    : [];
  return out(
    buildImagePrompt({ asset, variant, filmTitle: s.project.name, withReference: identity !== null }),
    null,
    attached,
  );
}

/** Den endelige prompten: brukerens tekst (eller den automatiske) med en fersk liste over vedleggene. */
export function finalImagePrompt(c: ComposedImagePrompt, userPrompt: string | null): string {
  const body = userPrompt?.trim() ? userPrompt : c.body;
  return withAttachedLegend(body, c.assetName, c.attached);
}
