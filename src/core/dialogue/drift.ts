/**
 * DV7 (DIALOGUE_VOICE_SPEC §70–§93, A1–A12): avvik mellom manus og lyd.
 *
 * Statusen lagres aldri. Den beregnes her, ett sted, og brukes av alle flater:
 * aktiv lydversjons manusrevisjon sammenlignes med blokkens gjeldende revisjon. En gyldig gjennomgang
 * (`DialogueReview`) for nøyaktig den versjonen og den revisjonen fjerner merkingen. En ny manusendring
 * eller en eldre aktiv versjon gir derfor avvik igjen (A11, A12). Gjennomganger slettes aldri (A10).
 * Ren TypeScript (ADR-0003).
 */
import type { AudioClip, ProjectState } from "../model";
import { activeDialogueVersion } from "./versions";
import { L } from "../i18n";
import { textAtRevision } from "../assembly/discrepancy";

export type DialogueReviewBasis = "manual" | "generated";
export interface DialogueReview {
  readonly id: string;
  readonly revision: number;
  readonly dialogueVersionId: string;
  readonly blockId: string;
  readonly blockRevision: number;
  readonly basis: DialogueReviewBasis;
  readonly createdBy?: string | null;
  readonly createdAt?: string;
  readonly removed: boolean;
}

/** none: ingen lyd · ok: samme revisjon · reviewed: gjennomgått · drift: rødt · unknown: revisjonen er ukjent. */
export type DriftStatus = "none" | "ok" | "reviewed" | "drift" | "unknown";

export interface LineDrift {
  readonly status: DriftStatus;
  readonly clipId: string | null;
  readonly versionId: string | null;
  readonly blockId: string;
  readonly occurrenceId: string;
  readonly audioRevision: number | null;
  readonly currentRevision: number;
}

export function reviewFor(s: ProjectState, versionId: string, blockRevision: number): DialogueReview | undefined {
  return Object.values(s.dialogueReviews ?? {}).find(r => !r.removed && r.dialogueVersionId === versionId && r.blockRevision === blockRevision);
}

export function clipDrift(s: ProjectState, clip: AudioClip): LineDrift {
  const blockId = clip.blockId ?? "";
  const block = s.blocks[blockId];
  const current = block?.currentRev ?? 1;
  const version = activeDialogueVersion(s, clip);
  const base = { clipId: clip.id, versionId: version?.id ?? null, blockId, occurrenceId: clip.occurrenceId, currentRevision: current, audioRevision: version?.scriptRevision ?? null };
  if (!version || !block) return { ...base, status: "unknown" };
  if (version.scriptRevision === current) return { ...base, status: "ok" };
  if (reviewFor(s, version.id, current)) return { ...base, status: "reviewed" };
  return { ...base, status: version.scriptRevision === null ? "unknown" : "drift" };
}

/** Dialogklippet for en replikk i en sceneforekomst (det første, stabilt sortert). */
export function dialogueClipOf(s: ProjectState, occurrenceId: string, blockId: string): AudioClip | undefined {
  return Object.values(s.audioClips)
    .filter(c => !c.removed && c.kind === "dialogue" && c.occurrenceId === occurrenceId && c.blockId === blockId)
    .sort((a, b) => a.offsetMs - b.offsetMs || a.id.localeCompare(b.id))[0];
}

export function lineDrift(s: ProjectState, occurrenceId: string, blockId: string): LineDrift {
  const clip = dialogueClipOf(s, occurrenceId, blockId);
  if (!clip) return { status: "none", clipId: null, versionId: null, blockId, occurrenceId, audioRevision: null, currentRevision: s.blocks[blockId]?.currentRev ?? 1 };
  return clipDrift(s, clip);
}

/** Alle røde replikker i aktive sceneforekomster (valgfritt for én karakter). */
export function driftLines(s: ProjectState, characterId?: string): LineDrift[] {
  const seen = new Set<string>();
  const out: LineDrift[] = [];
  for (const clip of Object.values(s.audioClips)) {
    if (clip.removed || clip.kind !== "dialogue" || !clip.blockId) continue;
    if (!s.occurrences[clip.occurrenceId]?.active) continue;
    if (characterId && clip.characterAssetId && clip.characterAssetId !== characterId) continue;
    const key = `${clip.occurrenceId}:${clip.blockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const d = lineDrift(s, clip.occurrenceId, clip.blockId);
    if (d.status === "drift") out.push(d);
  }
  return out.sort((a, b) => a.occurrenceId.localeCompare(b.occurrenceId) || a.blockId.localeCompare(b.blockId));
}

export const DRIFT_LABEL = (status: DriftStatus): string => ({
  none: L("Ingen lyd for replikken ennå", "No audio for the line yet"),
  ok: L("Lyden følger gjeldende manus", "The audio follows the current script"),
  reviewed: L("Manuset er endret, men avviket er gjennomgått", "The script has changed, but the difference has been reviewed"),
  drift: L("Manuset er endret etter at lyden ble laget", "The script changed after the audio was made"),
  unknown: L("Ukjent hvilken manusversjon lyden ble laget fra", "Unknown which script version the audio was made from"),
})[status];

export type DiffPart = { readonly kind: "same" | "added" | "removed"; readonly text: string };

/** Ordvis sammenligning som tåler Unicode (NFC, `Intl.Segmenter`), også skrift uten mellomrom. */
export function unicodeWordDiff(before: string, after: string, language = "und"): DiffPart[] {
  const split = (t: string) => [...new Intl.Segmenter(language, { granularity: "word" }).segment(t.normalize("NFC"))].map(x => x.segment);
  const a = split(before), b = split(after);
  const n = a.length, m = b.length;
  if (n * m > 250_000) return [{ kind: "removed", text: before }, { kind: "added", text: after }];
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: DiffPart[] = [];
  const push = (kind: DiffPart["kind"], text: string) => {
    const last = out.at(-1);
    if (last && last.kind === kind) out[out.length - 1] = { kind, text: last.text + text };
    else out.push({ kind, text });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push("same", a[i]!); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) { push("removed", a[i]!); i++; }
    else { push("added", b[j]!); j++; }
  }
  while (i < n) push("removed", a[i++]!);
  while (j < m) push("added", b[j++]!);
  return out;
}

/** Hva som er endret for en rød replikk (A3), eller null når grunnlaget mangler. */
export function driftDiff(s: ProjectState, d: LineDrift, language = "und"): DiffPart[] | null {
  if (d.audioRevision === null) return null;
  const before = textAtRevision(s, d.blockId, d.audioRevision);
  const after = s.blocks[d.blockId]?.text;
  if (before === null || after === undefined) return null;
  return unicodeWordDiff(before, after, language);
}
