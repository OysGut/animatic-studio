/** Lyd med AI (DEC-0069): hjelpere uten nettverk. */
import type { Asset, AssetVariant } from "../model";

/** Standardbeskrivelse av en lyd: navn, beskrivelse og tilstand for varianten (høyst 1000 tegn). */
export function defaultSoundPrompt(
  asset: Pick<Asset, "name" | "description">,
  variant: Pick<AssetVariant, "appearance"> | null,
): string {
  return [asset.name, asset.description, variant?.appearance]
    .map((x) => (x ?? "").trim().replace(/[.\s]+$/, ""))
    .filter(Boolean)
    .join(". ")
    .slice(0, 1000);
}
