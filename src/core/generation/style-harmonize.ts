/**
 * AI-stilharmonisering (REQ-0137–0145, REQ-0400–0402, P8): et bilde fra én kilde tegnes om til en felles
 * stil – fra en stilprofil eller et referansebilde – slik at bilder fra ulike kilder kan brukes sammen i en
 * scene eller på en plakat. Originalen endres aldri: resultatet er en ny versjon, og alt skrives via
 * kommandoer og kan angres.
 *
 * Prompten dekker alle seks dimensjonene (REQ-0138): tegnestil, fargepalett, lyssetting, tekstur,
 * detaljgrad og atmosfære, og har en tydelig instruks om å bevare karakterens identitet (REQ-0139).
 * Ren TypeScript (ADR-0003).
 */
import { L, localized } from "../i18n";
import type { ProjectState, StyleGuide } from "../model";
import { styleText } from "./style";
import { visualBriefFacts, MAX_ATTACHED_IMAGES, type AttachedImage } from "./image-prompt";
import { qualityProfileError, type QualityProfileSnapshot } from "./quality-profile";

/** Hva det harmoniserte bildet brukes til (bruksvalget etter godkjenning). */
export type HarmonizationUse = "local" | "variant" | "reference" | "published";
export const HARMONIZATION_USES: readonly HarmonizationUse[] = [
  "local",
  "variant",
  "reference",
  "published",
];
export const HARMONIZATION_USE_LABEL: Record<HarmonizationUse, string> = localized({
  local: ["Bare i denne plakaten eller scenen", "Only in this poster or scene"],
  variant: ["Alternativ variant av ressursen", "Alternative variant of the asset"],
  reference: ["Foretrukket referanse for en stilprofil", "Preferred reference for a style profile"],
  published: ["Publisert til det globale biblioteket", "Published to the global library"],
});

/** Metadata om en harmonisert versjon (krav 7): kilde, modell, kvalitetsprofil, stilprofil og bruksvalg. */
export interface StyleHarmonizationFields {
  /** Den harmoniserte versjonen (resultatet). */
  readonly versionId: string;
  /** Versjonen den ble harmonisert fra (originalen, som aldri endres). */
  readonly sourceVersionId: string;
  /** Modellen som laget bildet, f.eks. «google/gemini-3-pro-image». */
  readonly model: string;
  /** Kvalitetsprofilen bildet ble laget med (M8-øyeblikksbilde), eller null. */
  readonly qualityProfile: QualityProfileSnapshot | null;
  /** Stilprofilen stilen kom fra, eller null når et referansebilde var kilden. */
  readonly styleProfileId: string | null;
  /** Referansebildet stilen kom fra, eller null når en stilprofil var kilden. */
  readonly referenceVersionId: string | null;
  readonly use: HarmonizationUse;
  /** Kort notat, f.eks. «Harmonisert med «Filmens visuelle stil» (google/gemini-3-pro-image)». */
  readonly note: string;
}

export interface StyleHarmonization extends StyleHarmonizationFields {
  readonly id: string;
  readonly revision: number;
  readonly removed: boolean;
  readonly createdBy?: string | null;
  readonly createdAt?: string;
}

/** Foretrukket referanse per (karakter, stilprofil) (REQ-0144): nøyaktig én rad er aktiv om gangen. */
export interface StylePreferredReferenceFields {
  readonly assetId: string;
  readonly styleProfileId: string;
  /** Varianten som er den foretrukne referansen (et harmonisert bilde eller et annet). */
  readonly variantId: string;
}

export interface StylePreferredReference extends StylePreferredReferenceFields {
  readonly id: string;
  readonly revision: number;
  readonly removed: boolean;
  readonly createdBy?: string | null;
  readonly createdAt?: string;
}

export const HARMONIZATION_MAX_NOTE = 2000;
export const HARMONIZATION_MAX_MODEL = 200;

const isImageVersion = (s: ProjectState, id: string | null | undefined) =>
  !!id && !!s.assetVersions[id]?.mimeType.startsWith("image/");

/** Feilmelding (norsk/engelsk) eller null når metadataen er gyldig. */
export function harmonizationError(
  s: ProjectState,
  f: StyleHarmonizationFields,
): string | null {
  if (!isImageVersion(s, f.versionId))
    return L("Den harmoniserte versjonen finnes ikke", "The harmonized version was not found");
  if (!isImageVersion(s, f.sourceVersionId))
    return L("Kildeversjonen finnes ikke", "The source version was not found");
  if (f.versionId === f.sourceVersionId)
    return L("Resultatet kan ikke være sin egen kilde", "The result cannot be its own source");
  if (typeof f.model !== "string" || !f.model.trim() || f.model.length > HARMONIZATION_MAX_MODEL)
    return L("Ugyldig modell", "Invalid model");
  if (!HARMONIZATION_USES.includes(f.use)) return L("Ugyldig bruksvalg", "Invalid use");
  if (typeof f.note !== "string" || f.note.length > HARMONIZATION_MAX_NOTE)
    return L("Merknaden er for lang", "The annotation is too long");
  if (f.styleProfileId !== null) {
    const p = s.styleProfiles[f.styleProfileId];
    if (!p || p.removed) return L("Stilprofilen finnes ikke", "The style profile was not found");
  }
  if (f.referenceVersionId !== null && !isImageVersion(s, f.referenceVersionId))
    return L("Referansebildet finnes ikke", "The reference image was not found");
  if (f.styleProfileId === null && f.referenceVersionId === null)
    return L(
      "Velg en stilprofil eller et referansebilde",
      "Choose a style profile or a reference image",
    );
  if (f.qualityProfile !== null) {
    const q = f.qualityProfile;
    if (typeof q !== "object" || typeof q.id !== "string" || typeof q.name !== "string")
      return L("Ugyldig kvalitetsprofil", "Invalid quality profile");
    if (qualityProfileError(q.name, q.spec)) return L("Ugyldig kvalitetsprofil", "Invalid quality profile");
  }
  return null;
}

/** Feilmelding eller null når den foretrukne referansen er gyldig (REQ-0144). */
export function preferredReferenceError(
  s: ProjectState,
  f: StylePreferredReferenceFields,
): string | null {
  const a = s.assets[f.assetId];
  if (!a || a.removed) return L("Ressursen finnes ikke", "The asset was not found");
  const p = s.styleProfiles[f.styleProfileId];
  if (!p || p.removed) return L("Stilprofilen finnes ikke", "The style profile was not found");
  const va = s.assetVariants[f.variantId];
  if (!va || va.assetId !== a.id)
    return L("Varianten hører ikke til ressursen", "The variant does not belong to the asset");
  return null;
}

/** Den aktive foretrukne referansen for (karakter, stilprofil), eller null. */
export function preferredStyleReference(
  s: Pick<ProjectState, "stylePreferredReferences">,
  assetId: string,
  styleProfileId: string,
): StylePreferredReference | null {
  return (
    Object.values(s.stylePreferredReferences).find(
      (r) => !r.removed && r.assetId === assetId && r.styleProfileId === styleProfileId,
    ) ?? null
  );
}

/** Metadata om en harmonisert versjon, eller null. */
export function harmonizationOf(
  s: Pick<ProjectState, "styleHarmonizations">,
  versionId: string,
): StyleHarmonization | null {
  return (
    Object.values(s.styleHarmonizations).find((h) => !h.removed && h.versionId === versionId) ?? null
  );
}

/**
 * Stilen som tekst for hver av de seks dimensjonene (REQ-0138), fra stilprofilen. `null` når profilen
 * mangler (da må et referansebilde bære stilen).
 */
interface DimensionText {
  readonly drawingStyle: string;
  readonly colourPalette: string;
  readonly lighting: string;
  readonly texture: string;
  readonly detail: string;
  readonly atmosphere: string;
}

function dimensionText(g: StyleGuide | null | undefined): DimensionText | null {
  if (!g) return null;
  const t = (x: string) => x.trim().replace(/\s+/g, " ");
  const palette = [t(g.palette.description), g.palette.colors.join(", ")].filter(Boolean).join("; ");
  const d = {
    drawingStyle: [t(g.visualStyle), t(g.technique)].filter(Boolean).join("; "),
    colourPalette: palette,
    lighting: t(g.lighting),
    texture: t(g.technique),
    detail: [t(g.characterDesign), t(g.environmentDesign)].filter(Boolean).join("; "),
    atmosphere: [t(g.mood), t(g.world) ? `World: ${t(g.world)}` : ""].filter(Boolean).join("; "),
  };
  return Object.values(d).some((x) => x) ? d : null;
}

export interface HarmonizePromptInput {
  readonly assetId: string;
  /** Versjonen som harmoniseres (identiteten, bilde 1). */
  readonly versionId: string;
  /** Stilen kommer fra denne profilen, eller … */
  readonly styleProfileId: string | null;
  /** … fra dette referansebildet. */
  readonly referenceVersionId: string | null;
}

/**
 * Bestillingen til bildemodellen (engelsk, REQ-0015): tegn om det vedlagte bildet til målstilen, med alle
 * seks dimensjonene (REQ-0138) og en tydelig instruks om å bevare identiteten (REQ-0139). Null når verken
 * en utfylt stilprofil eller et referansebilde kan bære stilen.
 */
export function buildHarmonizePrompt(
  s: ProjectState,
  input: HarmonizePromptInput,
): string | null {
  const asset = s.assets[input.assetId];
  const source = s.assetVersions[input.versionId];
  if (!asset || !source || asset.removed) return null;
  const profile = input.styleProfileId ? (s.styleProfiles[input.styleProfileId] ?? null) : null;
  if (profile?.removed) return null;
  const g = profile?.guide ?? null;
  const dims = dimensionText(g);
  const hasReference = isImageVersion(s, input.referenceVersionId);
  if (!dims && !hasReference) return null;

  const lines: string[] = [];
  lines.push(
    `Redraw the attached image of ${asset.name} (image 1) in the target style below, so it can be used together with other images in that style.`,
  );
  if (hasReference)
    lines.push(
      "The later attached image(s) are style references: match their drawing style, line quality, texture, colour treatment and level of detail; do not copy their subjects, poses or compositions.",
    );
  if (dims) {
    lines.push("Target style – all six dimensions must change:");
    lines.push(`- Drawing style: ${dims.drawingStyle || "match the style reference image"}`);
    lines.push(`- Colour palette: ${dims.colourPalette || "match the style reference image"}`);
    lines.push(`- Lighting: ${dims.lighting || "match the style reference image"}`);
    lines.push(`- Texture: ${dims.texture || "match the style reference image"}`);
    lines.push(`- Level of detail: ${dims.detail || "match the style reference image"}`);
    lines.push(`- Atmosphere: ${dims.atmosphere || "match the style reference image"}`);
  } else {
    lines.push(
      "Target style: match the attached style reference image across all six dimensions – drawing style, colour palette, lighting, texture, level of detail and atmosphere.",
    );
  }
  lines.push(
    `Keep ${asset.name}'s identity: the same face, proportions, age, clothing and distinguishing features. Only the rendering style changes – never who the subject is.`,
  );
  const facts = visualBriefFacts(asset.visualBrief);
  if (facts.length) lines.push(`Known facts about ${asset.name}: ${facts.join("; ")}.`);
  else if (asset.description.trim())
    lines.push(`About ${asset.name}: ${asset.description.trim().replace(/\s+/g, " ").slice(0, 300)}.`);
  const avoid = (g?.avoid ?? "")
    .split(/[,;\n]/)
    .map((x) => x.trim().replace(/\.$/, ""))
    .filter(Boolean);
  if (avoid.length) lines.push(`Leave out: ${avoid.join(", ")}.`);
  if (g?.instructions.trim()) lines.push(g.instructions.trim());
  const prompt = lines.join("\n");
  return prompt.length <= 8000 ? prompt : prompt.slice(0, 8000);
}

/**
 * Bildene som sendes med (identiteten først, så referansebildet eller profilens forbildebilder som
 * stilforbilder), høyst MAX_ATTACHED_IMAGES, uten dubletter og bare bilder.
 */
export function harmonizeAttachments(
  s: ProjectState,
  input: HarmonizePromptInput,
): readonly AttachedImage[] {
  const asset = s.assets[input.assetId];
  if (!asset) return [];
  const label = (id: string): string | null => {
    const v = s.assetVersions[id];
    const va = v ? s.assetVariants[v.variantId] : undefined;
    const a = va ? s.assets[va.assetId] : undefined;
    if (!v || !va || !a) return null;
    return a.id === asset.id
      ? `${a.name} – ${va.name} v${v.number}`
      : `${a.name} – ${va.name} v${v.number}, an approved image from the film`;
  };
  const out: AttachedImage[] = [];
  const seen = new Set<string>();
  const add = (id: string | null | undefined, role: AttachedImage["role"]) => {
    if (!id || out.length >= MAX_ATTACHED_IMAGES || seen.has(id)) return;
    const v = s.assetVersions[id];
    if (!v || !v.mimeType.startsWith("image/")) return;
    const l = label(id);
    if (!l) return;
    seen.add(id);
    out.push({ versionId: id, path: v.mediaPath, mimeType: v.mimeType, role, label: l });
  };
  add(input.versionId, "identity");
  if (isImageVersion(s, input.referenceVersionId)) add(input.referenceVersionId, "style");
  else {
    const g = input.styleProfileId ? s.styleProfiles[input.styleProfileId]?.guide : null;
    for (const id of g?.referenceVersionIds ?? []) add(id, "style");
  }
  return out;
}

/** Variantnavnet for harmoniserte bilder (REQ-0142): egen variant, aldri i stedet for en eksisterende. */
export function harmonizedVariantName(profileName: string | null): string {
  return profileName
    ? L(`Harmonisert – ${profileName}`, `Harmonized – ${profileName}`).slice(0, 80)
    : L("Harmonisert", "Harmonized").slice(0, 80);
}

/** Notatet på den harmoniserte versjonen (krav 7: «Laget med profil X»). */
export function harmonizeNote(profileName: string | null, model: string): string {
  const m = model.slice(0, 120);
  return (profileName
    ? L(
        `Harmonisert med profilen «${profileName}» (${m}).`,
        `Harmonized with the profile "${profileName}" (${m}).`,
      )
    : L(`Harmonisert med et referansebilde (${m}).`, `Harmonized with a reference image (${m}).`)
  ).slice(0, HARMONIZATION_MAX_NOTE);
}

/** Advarselen som vises før generering (REQ-0139): identiteten kan endre seg. */
export const HARMONIZE_IDENTITY_WARNING = () =>
  L(
    "AI-en kan endre karakterens kjennetegn. Sammenlign alltid med originalen før du godkjenner.",
    "The AI may change the character's distinguishing features. Always compare with the original before approving.",
  );

/** Stilen som sendes, for forhåndsvisning i panelet (samme tekst som stilprofilen viser). */
export function harmonizeStylePreview(
  s: ProjectState,
  styleProfileId: string | null,
): string {
  const g = styleProfileId ? s.styleProfiles[styleProfileId]?.guide : null;
  return g ? styleText(g).slice(0, 2000) : "";
}

// ---------------------------------------------------------------- Masseharmonisering (krav 6)

/** Et element i en massejobb: forhåndstildelte ID-er, så et resultat bare kan legges inn én gang. */
export interface HarmonizeBatchItemPlan {
  readonly assetId: string;
  readonly sourceVersionId: string;
  readonly variantId: string;
  readonly versionId: string;
  readonly harmonizationId: string;
}

/** Høyst så mange bilder i én massejobb (samme grense som i databasen). */
export const HARMONIZE_BATCH_MAX = 200;

/**
 * Bildene som kan harmoniseres i én jobb: hver ressurs med et bilde (dagens godkjente eller siste), uten
 * dubletter og uten ressurser som er fjernet. Feilmelding når valget er ugyldig.
 */
export function harmonizeBatchSelectionError(
  s: ProjectState,
  items: readonly { readonly assetId: string; readonly sourceVersionId: string }[],
  styleProfileId: string | null,
  referenceVersionId: string | null,
): string | null {
  if (!items.length) return L("Velg minst ett bilde", "Choose at least one image");
  if (items.length > HARMONIZE_BATCH_MAX)
    return L(`Høyst ${HARMONIZE_BATCH_MAX} bilder i én jobb`, `At most ${HARMONIZE_BATCH_MAX} images in one job`);
  if (!styleProfileId && !referenceVersionId)
    return L("Velg en stilprofil eller et referansebilde", "Choose a style profile or a reference image");
  const seen = new Set<string>();
  for (const it of items) {
    const key = `${it.assetId}:${it.sourceVersionId}`;
    if (seen.has(key)) return L("Samme bilde to ganger", "The same image twice");
    seen.add(key);
    const a = s.assets[it.assetId];
    const v = s.assetVersions[it.sourceVersionId];
    if (!a || a.removed || !v || !v.mimeType.startsWith("image/") || s.assetVariants[v.variantId]?.assetId !== a.id)
      return L("Et av bildene finnes ikke lenger", "One of the images no longer exists");
    if (!buildHarmonizePrompt(s, { assetId: a.id, versionId: v.id, styleProfileId, referenceVersionId }))
      return L("Stilprofilen er tom – fyll den ut eller velg et referansebilde", "The style profile is empty – fill it in or choose a reference image");
  }
  return null;
}

/**
 * Kommandoen som legger inn ett ferdig resultat fra massejobben (alltid ny variant, aldri i stedet for en
 * eksisterende – REQ-0142). Samme ID-er hver gang, så et resultat som legges inn på nytt avvises som dublett.
 */
export function harmonizeBatchCommand(
  s: ProjectState,
  item: HarmonizeBatchItemPlan,
  result: { readonly media: import("../commands/types").AssetMedia; readonly model: string },
  batch: { readonly styleProfileId: string | null; readonly referenceVersionId: string | null; readonly qualityProfile: QualityProfileSnapshot | null },
) {
  const profileName = batch.styleProfileId ? (s.styleProfiles[batch.styleProfileId]?.name ?? null) : null;
  const note = harmonizeNote(profileName, result.model);
  return {
    type: "ApplyHarmonizedImage" as const,
    harmonizationId: item.harmonizationId,
    variantId: item.variantId as never,
    versionId: item.versionId as never,
    media: result.media,
    note,
    fields: {
      versionId: item.versionId,
      sourceVersionId: item.sourceVersionId,
      model: result.model.slice(0, HARMONIZATION_MAX_MODEL),
      qualityProfile: batch.qualityProfile,
      styleProfileId: batch.styleProfileId,
      referenceVersionId: batch.referenceVersionId,
      use: "variant" as const,
      note,
    },
    newVariant: {
      assetId: item.assetId as never,
      fields: { name: harmonizedVariantName(profileName), style: "other" as const, appearance: "" },
    },
  };
}
