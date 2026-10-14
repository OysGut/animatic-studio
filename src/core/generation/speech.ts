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
  /**
   * Lydklippet replikken har (det første), og om det er lest inn med AI (DEC-0079: «visuelt veldig tydelig
   * hva som har lyd»). null når replikken mangler lyd.
   */
  readonly audio: { readonly clipId: string; readonly ai: boolean } | null;
  /** Når replikken begynner, i ms fra scenens start. */
  readonly startMs: number;
}

export function sceneDialogueLines(s: ProjectState, clip: FilmClip): DialogueLine[] {
  const blocks = blocksOfVariant(s, clip.variantId);
  const spans = new Map(blockSpans(s, clip).map((b) => [b.blockId, b]));
  const audioOf = new Map<string, { clipId: string; ai: boolean }>();
  for (const a of Object.values(s.audioClips)) {
    if (a.removed || a.occurrenceId !== clip.occurrenceId || !a.blockId || audioOf.has(a.blockId))
      continue;
    const asset = s.assets[a.assetId];
    const ai = !!asset && (asset.tags.includes("AI-stemme") || asset.category === "Dialog (AI)"); // i18n-ignore – sammenlignes med lagret kategori
    audioOf.set(a.blockId, { clipId: a.id, ai });
  }
  const chars = Object.values(s.assets).filter(
    (a) =>
      !a.archived &&
      !a.removed &&
      (a.kind === "character" || a.kind === "animal" || a.kind === "other"),
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
        hasAudio: audioOf.has(b.id),
        audio: audioOf.get(b.id) ?? null,
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

/**
 * Talemodellen. «Flerspråklig v2» kan ikke norsk og leste norsk som dansk (funnet av Mars 2026-10-13);
 * Eleven v3 har norsk, og språket settes eksplisitt med `SPEECH_LANGUAGE`.
 */
export const SPEECH_MODEL = "eleven_v3";
/** Hovedmanuset er alltid norsk bokmål (ISO 639-1). */
export const SPEECH_LANGUAGE = "no";

/** Anslått pris for å lese inn replikkene (USD), eller null når prisen er ukjent. */
export function speechCostUsd(lines: readonly { readonly text: string }[]): number | null {
  const chars = lines.reduce((t, l) => t + l.text.length, 0);
  return estimateCostUsd("elevenlabs", SPEECH_MODEL, { characters: chars });
}

/**
 * Hvilke karakterer som bruker hver stemme (DEC-0079): vises i stemmevalget, så man ser om en stemme alt er
 * i bruk – men den kan likevel velges.
 */
export function voiceUsers(s: ProjectState): ReadonlyMap<string, readonly string[]> {
  const out = new Map<string, string[]>();
  for (const a of Object.values(s.assets)) {
    if (a.removed || !a.voice) continue;
    const list = out.get(a.voice.voiceId) ?? [];
    list.push(a.name);
    out.set(a.voice.voiceId, list);
  }
  for (const l of out.values()) l.sort((x, y) => x.localeCompare(y, "nb"));
  return out;
}
