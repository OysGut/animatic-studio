/**
 * Beskrivelser (prompter) for AI-generering av bilder (M5 del 1, mandat 17–19, DEC-0045).
 * Beskrivelsen bygges fra ressursen (navn, beskrivelse, variant, stil) og er synlig og redigerbar før noe
 * sendes (REQ om synlige prompter). Systemteksten er på engelsk (REQ-0015); brukerens egne beskrivelser
 * tas med som de er.
 */
import type { Asset, AssetKind, AssetVariant, VisualStyle } from "../model";

/** Hvordan bildet skal brukes i 2D-scenen: frilagt figur (lag) eller hel bakgrunn. */
export type ImagePurpose = "cutout" | "background";

export const IMAGE_PURPOSE_FOR_KIND: Record<AssetKind, ImagePurpose> = {
  character: "cutout",
  animal: "cutout",
  object: "cutout",
  location: "background",
  environment: "background",
  other: "cutout",
  sound: "cutout",
};

const STYLE_TEXT: Record<VisualStyle, string> = {
  reference: "clean reference image",
  illustrated: "hand-drawn illustrated look, painterly textures",
  realistic: "cinematic, photorealistic look",
  animatic: "simple, readable animatic style: clear silhouette, flat colours, minimal detail",
  poster: "polished cinematic poster quality",
  other: "consistent with the rest of the film",
};

const KIND_TEXT: Record<AssetKind, string> = {
  character: "a character",
  animal: "an animal character",
  object: "a prop / object",
  location: "a location",
  environment: "an environment",
  other: "an element",
  sound: "an element",
};

export interface ImagePromptInput {
  readonly asset: Pick<Asset, "kind" | "name" | "description" | "category" | "tags">;
  readonly variant: Pick<AssetVariant, "name" | "style" | "appearance"> | null;
  /** Filmens tittel (for sammenheng). */
  readonly filmTitle?: string;
  /** Sendes et eksisterende bilde med som forbilde? */
  readonly withReference: boolean;
}

/** Standardbeskrivelsen for et nytt bilde av ressursen. Brukeren kan endre den før den sendes. */
export function buildImagePrompt(i: ImagePromptInput): string {
  const purpose = IMAGE_PURPOSE_FOR_KIND[i.asset.kind];
  const style = STYLE_TEXT[i.variant?.style ?? "animatic"];
  const lines = [
    `Design ${KIND_TEXT[i.asset.kind]} for a 2D animated film${i.filmTitle ? ` ("${i.filmTitle}")` : ""}.`,
    `Name: ${i.asset.name}.`,
  ];
  if (i.asset.description.trim()) lines.push(`Description: ${i.asset.description.trim()}`);
  if (i.variant?.appearance.trim())
    lines.push(`Appearance in this version: ${i.variant.appearance.trim()}.`);
  if (i.asset.category.trim()) lines.push(`Category: ${i.asset.category.trim()}.`);
  if (i.asset.tags.length) lines.push(`Keywords: ${i.asset.tags.join(", ")}.`);
  lines.push(`Style: ${style}.`);
  if (purpose === "cutout")
    lines.push(
      "Full figure, centred, facing slightly towards the camera, on a transparent background with no shadow, no text, no frame — it will be used as a separate layer in a multiplane scene.",
    );
  else
    lines.push(
      "Wide establishing view filling the whole frame, no characters, no text — it will be used as the background layer of a scene.",
    );
  if (i.withReference)
    lines.push(
      "Keep the identity, proportions, colours and clothing of the reference image; change only what is described above.",
    );
  return lines.join("\n");
}

/** Bildestørrelse og bakgrunn for gatewayen ut fra bruken. */
export function imageRequestShape(purpose: ImagePurpose): {
  readonly size: "1024x1536" | "1536x1024";
  readonly background: "transparent" | "opaque";
} {
  return purpose === "cutout"
    ? { size: "1024x1536", background: "transparent" }
    : { size: "1536x1024", background: "opaque" };
}

/** Lengste beskrivelse som kan sendes. */
export const MAX_PROMPT_CHARS = 8000;
