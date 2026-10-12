/**
 * Dialog med AI-stemmer (DEC-0071): replikkene i en scene med hvem som sier dem, karakterens stemme, om
 * replikken allerede har dialoglyd, og når den skjer i scenen. Brukes til å lese inn replikkene og legge dem
 * på dialogsporet på riktig sted.
 */
import { blockSpans, type FilmClip } from "../assembly/film";
import { assetNames, nameKey } from "../library";
import type { Asset, ProjectState } from "../model";
import { framesToSeconds } from "../time";
import { blocksOfVariant } from "../views";
import { estimateCostUsd } from "./providers";

export interface DialogueLine {
  readonly blockId: string;
  readonly text: string;
  /** Navnet i manuset (karakterhodet). */
  readonly speaker: string;
  /** Karakteren i biblioteket, eller null når ingen ressurs har det navnet. */
  readonly character: Asset | null;
  /** Har allerede dialoglyd (et lydklipp koblet til replikken). */
  readonly hasAudio: boolean;
  /** Når replikken begynner, i ms fra scenens start. */
  readonly startMs: number;
}

export function sceneDialogueLines(s: ProjectState, clip: FilmClip): DialogueLine[] {
  const blocks = blocksOfVariant(s, clip.variantId);
  const spans = new Map(blockSpans(s, clip).map((b) => [b.blockId, b]));
  const withAudio = new Set(
    Object.values(s.audioClips)
      .filter((a) => !a.removed && a.occurrenceId === clip.occurrenceId && a.blockId)
      .map((a) => a.blockId as string),
  );
  const chars = Object.values(s.assets).filter(
    (a) => !a.archived && (a.kind === "character" || a.kind === "animal" || a.kind === "other"),
  );
  const find = (characterBlockId: string, name: string): Asset | null => {
    // Betegnelse i akkurat denne linjen (REQ-0127) går foran vanlige navn
    const ctx = chars.find((a) =>
      (a.contextNames ?? []).some((n) => n.blockIds.includes(characterBlockId)),
    );
    if (ctx) return ctx;
    const k = nameKey(name);
    return chars.find((a) => assetNames(a).some((n) => nameKey(n) === k)) ?? null;
  };
  const out: DialogueLine[] = [];
  let speaker = "";
  let character: Asset | null = null;
  for (const b of blocks) {
    if (b.kind === "character") {
      speaker = b.text.trim();
      character = find(b.id, speaker);
    } else if (b.kind === "dialogue" && b.text.trim()) {
      const sp = spans.get(b.id);
      out.push({
        blockId: b.id,
        text: b.text.replace(/\s+/g, " ").trim(),
        speaker,
        character,
        hasAudio: withAudio.has(b.id),
        startMs: sp
          ? Math.max(
              0,
              Math.round(framesToSeconds(sp.startFrame - clip.startFrame, s.project.fps) * 1000),
            )
          : 0,
      });
    }
  }
  return out;
}

/** Anslått pris for å lese inn replikkene (USD), eller null når prisen er ukjent. */
export function speechCostUsd(lines: readonly { readonly text: string }[]): number | null {
  const chars = lines.reduce((t, l) => t + l.text.length, 0);
  return estimateCostUsd("elevenlabs", "eleven_multilingual_v2", { characters: chars });
}
