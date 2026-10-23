import { sourceLanguageOf } from "../dialogue/languages";
/**
 * DV1 (DIALOGUE_VOICE_SPEC §3–§7, M1–M5): manuset som navigasjonsflate. Finner tidspunktet i scenen for et
 * klikk i manuset, i fast rekkefølge:
 *   1. ordkobling (ordet brukeren klikket på, i aktiv lydversjon),
 *   2. tidskobling satt av brukeren (time_links),
 *   3. starten av replikkens lydklipp,
 *   4. sceneanker (beregnet fra teksten – merkes «estimert»).
 * Uten plass i filmen eller i 2D-scenen er tiden «mangler»; da velges aldri en tilfeldig posisjon.
 * Ren TypeScript (ADR-0003).
 */
import type { ProjectState } from "../model";
import type { FilmClip } from "../assembly/film";
import { blockSpans, clipFrameToComposition } from "../assembly/film";
import { MAIN_LANGUAGE, audioVersion, playsIn } from "../audio";
import { tokenizeLine } from "../audio/alignment";
import { msToFramesCeil } from "../time";
import { blocksOfVariant } from "../views";
import { clipEditOf } from "./versions";

export type SeekSource = "word" | "time_link" | "clip" | "anchor" | "none";
/** «exact»: kjent tid. «estimated»: beregnet fra teksten. «missing»: ukjent – avspillingshodet flyttes ikke. */
export type SeekQuality = "exact" | "estimated" | "missing";

export interface ScriptSeek {
  readonly blockId: string;
  /** Bildet i 2D-scenen (sceneeditorens avspillingshode), eller null når tiden mangler. */
  readonly compFrame: number | null;
  readonly quality: SeekQuality;
  readonly source: SeekSource;
}

const MISSING = (blockId: string): ScriptSeek => ({ blockId, compFrame: null, quality: "missing", source: "none" });

/** Replikken et karakternavn eller en parentes hører til (samme tid som replikken). */
export function dialogueOwnerOf(s: ProjectState, variantId: string, blockId: string): string {
  const blocks = blocksOfVariant(s, variantId);
  const i = blocks.findIndex((b) => b.id === blockId);
  const b = blocks[i];
  if (!b || (b.kind !== "character" && b.kind !== "parenthetical")) return blockId;
  for (let j = i + 1; j < blocks.length; j++) {
    const x = blocks[j]!;
    if (x.kind === "dialogue") return x.id;
    if (x.kind !== "parenthetical") break;
  }
  return blockId;
}

/** Tidspunktet (ms fra scenens start) for ordet ved `charOffset` i replikken, fra aktiv lydversjons ordkobling. */
export function wordSceneMs(
  s: ProjectState,
  occurrenceId: string,
  blockId: string,
  charOffset: number,
): number | null {
  const block = s.blocks[blockId];
  if (!block || block.kind !== "dialogue") return null;
  const clips = Object.values(s.audioClips)
    .filter((a) => !a.removed && a.occurrenceId === occurrenceId && a.blockId === blockId && playsIn(a, sourceLanguageOf(s), s))
    .sort((a, b) => a.offsetMs - b.offsetMs || a.id.localeCompare(b.id));
  for (const a of clips) {
    const al = audioVersion(s, a)?.alignment;
    // Ordkoblingen gjelder bare teksten den ble laget for (endret tekst = ikke presis)
    if (!al || al.blockId !== blockId || al.text !== block.text) continue;
    const tokens = tokenizeLine(al.text);
    const i = tokens.findIndex((t) => charOffset >= t.start && charOffset <= t.end);
    const w = i >= 0 ? al.words[i] : undefined;
    if (!w || w.startMs === null) continue;
    const e = clipEditOf(s, a);
    const span = e.lengthMs * e.speed;
    if (w.startMs < e.sourceInMs || w.startMs > e.sourceInMs + span) continue;
    return a.offsetMs + Math.round((w.startMs - e.sourceInMs) / e.speed);
  }
  return null;
}

/** Hvor avspillingshodet skal stå for et klikk i manuset (M1, M5). */
export function scriptSeekTarget(
  s: ProjectState,
  clip: FilmClip | null,
  blockId: string,
  charOffset?: number,
): ScriptSeek {
  if (!clip) return MISSING(blockId);
  const owner = dialogueOwnerOf(s, clip.variantId, blockId);
  const toComp = (filmFrame: number) => clipFrameToComposition(clip, filmFrame - clip.startFrame);
  if (charOffset !== undefined && owner === blockId) {
    const ms = wordSceneMs(s, clip.occurrenceId, blockId, charOffset);
    if (ms !== null) {
      const f = toComp(clip.startFrame + msToFramesCeil(ms, s.project.fps));
      if (f !== null) return { blockId, compFrame: f, quality: "exact", source: "word" };
    }
  }
  const span = blockSpans(s, clip).find((x) => x.blockId === blockId);
  if (!span || span.uncovered) return MISSING(blockId);
  const f = toComp(span.startFrame);
  if (f === null) return MISSING(blockId);
  if (span.kind === "time") return { blockId, compFrame: f, quality: "exact", source: "time_link" };
  if (span.kind === "linked") return { blockId, compFrame: f, quality: "exact", source: "clip" };
  return { blockId, compFrame: f, quality: "estimated", source: "anchor" };
}

/** Skiller enkeltklikk fra dobbeltklikk: enkeltklikket venter så lenge, og avlyses av et dobbeltklikk (§7). */
export const SCRIPT_CLICK_DELAY_MS = 250;
