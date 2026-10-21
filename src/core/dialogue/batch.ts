/** DV5: coverage is measured per permanent line occurrence, not per scene clip. */
import type { ProjectState } from "../model";
import { filmClips } from "../assembly/film";
import { sceneDialogueLines } from "../generation/speech";
import { activeDialogueVersion } from "./versions";
import { scriptLanguageOf, speechLanguageOf, detectDialogueLanguage } from "./languages";
import { sceneNumberOf } from "../views";
import { lineDrift } from "./drift";

export function characterDialogueCoverage(s: ProjectState, characterId: string) {
  const seen = new Set<string>();
  // DV5-rest: main production first, then spinoffs; each scene is shown with its own production.
  const productions = Object.values(s.productions).sort((a, b) => (a.kind === "main" ? 0 : 1) - (b.kind === "main" ? 0 : 1) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return productions.flatMap(p => filmClips(s, p.id).map(film => ({ film, production: p }))).flatMap(({ film, production }) => {
    if (seen.has(film.occurrenceId)) return [];
    seen.add(film.occurrenceId);
    const lines = sceneDialogueLines(s, film).filter(line => {
      const linked = Object.values(s.audioClips).find(c => !c.removed && c.occurrenceId === film.occurrenceId && c.blockId === line.blockId && c.characterAssetId);
      return linked ? linked.characterAssetId === characterId : line.character?.id === characterId;
    }).map(line => {
      const clip = Object.values(s.audioClips).find(c => !c.removed && c.kind === "dialogue" && c.occurrenceId === film.occurrenceId && c.blockId === line.blockId);
      const version = clip ? activeDialogueVersion(s, clip) : null;
      const hasAudio = !!clip || line.hasAudio;
      const scriptLanguage = scriptLanguageOf(s, line.blockId);
      return { ...line, occurrenceId: film.occurrenceId, key: `${film.occurrenceId}:${line.blockId}`, hasAudio,
        drift: hasAudio && !!version && lineDrift(s, film.occurrenceId, line.blockId).status === "drift",
        scriptRevision: s.blocks[line.blockId]?.currentRev ?? 1, scriptLanguage,
        speechLanguage: speechLanguageOf(s, film.occurrenceId, line.blockId, characterId),
        detection: detectDialogueLanguage(line.text, scriptLanguage) };
    });
    const occurrence = s.occurrences[film.occurrenceId];
    return lines.length && occurrence ? [{ occurrenceId: film.occurrenceId, productionId: production.id, productionName: production.name, productionKind: production.kind, title: s.variants[film.variantId]?.heading.location ?? "", number: sceneNumberOf(s, occurrence), lines,
      total: lines.length, withAudio: lines.filter(l => l.hasAudio).length, missing: lines.filter(l => !l.hasAudio).length, drift: lines.filter(l => l.drift).length }] : [];
  });
}
export type BatchLine = ReturnType<typeof characterDialogueCoverage>[number]["lines"][number];
export const selectedDialogueCounts = (lines: readonly BatchLine[]) => ({ scenes: new Set(lines.map(l => l.occurrenceId)).size, lines: lines.length, missing: lines.filter(l => !l.hasAudio).length, withAudio: lines.filter(l => l.hasAudio).length, drift: lines.filter(l => l.drift).length });