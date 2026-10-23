/**
 * Story Lab: rene oppslag i prosjektet (karakterer, replikker og scenetekst i hovedfilmen). Brukes både
 * av arbeidsflaten og av serverfunksjonen som bygger promptene (B-105a), så begge ser det samme.
 */
import { mainProduction, type Asset, type ProjectState } from "../model";
import { blocksOfVariant, orderedOccurrences } from "../views";
import { cleanSpeaker } from "../library/suggest";
import { assetNames, nameKey } from "../library";
import { formatHeading } from "../screenplay/paginate";
import { canHaveStoryProfile } from "./profile";

/** Karakterer og dyr (de eneste som kan ha profil), sortert etter navn. */
export function storyCharacters(s: ProjectState): Asset[] {
  return Object.values(s.assets)
    .filter((a) => canHaveStoryProfile(a.kind) && !a.archived && !(a as { removed?: boolean }).removed)
    .sort((a, b) => a.name.localeCompare(b.name, collation()));
}

/** Karakterens replikker i hovedfilmen (talernavn mot ressursens navn og alternative navn). */
export function characterLines(s: ProjectState, asset: Asset, max = 200): string[] {
  const main = mainProduction(s);
  if (!main) return [];
  const keys = new Set(assetNames(asset).map(nameKey));
  const out: string[] = [];
  for (const o of orderedOccurrences(s, main.id)) {
    if (!o.active) continue;
    let speaking = false;
    for (const b of blocksOfVariant(s, o.variantId)) {
      if (b.kind === "character") speaking = cleanSpeaker(b.text).names.some((n) => keys.has(nameKey(n)));
      else if (b.kind === "dialogue" && speaking && b.text.trim()) out.push(b.text.trim());
      else if (b.kind !== "parenthetical") speaking = false;
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** Hovedproduksjonens scenetekst og talere; aldri skriving til manus. */
export function sceneLabData(state: ProjectState, sceneId: string) {
  const main = mainProduction(state);
  const occurrence = main ? orderedOccurrences(state, main.id).find((o) => o.sceneId === sceneId && o.active) : undefined;
  const variant = occurrence ? state.variants[occurrence.variantId] : undefined;
  const blocks = variant ? blocksOfVariant(state, variant.id) : [];
  const assets = storyCharacters(state);
  const speakers = new Map<string, string>();
  let current: string | undefined;
  for (const b of blocks) {
    if (b.kind === "character") {
      const keys = cleanSpeaker(b.text).names.map(nameKey);
      current = assets.find((a) => assetNames(a).some((n) => keys.includes(nameKey(n))))?.id;
    } else if (b.kind === "dialogue") {
      if (current) speakers.set(b.id, current);
    } else if (b.kind !== "parenthetical") current = undefined;
  }
  const participants = assets.filter((a) => [...speakers.values()].includes(a.id));
  const heading = variant ? formatHeading(variant.heading) : "";
  return { blocks, speakers, participants, heading, situation: [heading, ...blocks.filter((b) => b.kind === "action").map((b) => b.text)].join("\n") };
}
