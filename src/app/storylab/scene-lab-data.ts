/** SL5: hovedproduksjonens scenetekst og talere; aldri skriving til manus. */
import { assetNames, blocksOfVariant, cleanSpeaker, formatHeading, mainProduction, nameKey, orderedOccurrences, type ProjectState } from "@/core";
import { storyCharacters } from "./storylab-data";

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

export function lineAndWordCount(lines: readonly { text: string }[]) {
  return { lines: lines.length, words: lines.reduce((n, l) => n + (l.text.trim().match(/\S+/g)?.length ?? 0), 0) };
}