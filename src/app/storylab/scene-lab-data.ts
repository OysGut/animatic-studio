/** SL5: hovedproduksjonens scenetekst og talere; aldri skriving til manus. */
export { sceneLabData } from "@/core";

export function lineAndWordCount(lines: readonly { text: string }[]) {
  return { lines: lines.length, words: lines.reduce((n, l) => n + (l.text.trim().match(/\S+/g)?.length ?? 0), 0) };
}