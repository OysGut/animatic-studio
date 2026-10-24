/**
 * C-0 konflikter og kandidater. En mottatt fil blir alltid en ny versjon (kandidat) som ikke godkjennes.
 * Hvis revisjonsgrunnlaget (versjonen klienten startet fra) ikke lenger er den godkjente versjonen, lages
 * en konflikt. Alle tre valg bevarer begge versjonene; bare «velg innkommende» endrer godkjent versjon,
 * og det skjer via den vanlige, angrebare ApproveAssetVersion-kommandoen.
 */
import type { Command } from "../commands/types";

export type ConflictChoice = "keep_both" | "choose_current" | "choose_incoming" | "reject";
export const CONFLICT_CHOICES: readonly ConflictChoice[] = ["keep_both", "choose_current", "choose_incoming", "reject"];

export function needsConflict(baseVersionId: string | null, approvedVersionId: string | null): boolean {
  return (baseVersionId ?? null) !== (approvedVersionId ?? null);
}

export interface CandidatePlan {
  readonly commands: readonly Command[];
  readonly conflict: boolean;
}
/** Kandidaten legges inn med AddAssetVersion alene; ApproveAssetVersion er aldri med. */
export function planCandidate(i: {
  versionId: string; variantId: string; approvedVersionId: string | null; baseVersionId: string | null;
  media: { path: string; mimeType: string; byteSize: number; sha256: string; width: number | null; height: number | null };
  note: string;
}): CandidatePlan {
  const add: Command = { type: "AddAssetVersion", versionId: i.versionId as never, variantId: i.variantId as never, media: i.media, note: i.note };
  return { commands: [add], conflict: needsConflict(i.baseVersionId, i.approvedVersionId) };
}

export interface ConflictResolution {
  /** Kommandoen brukeren kjører i appen (runCommand), eller null når godkjent versjon ikke endres. */
  readonly command: Command | null;
  readonly status: "resolved" | "rejected";
  /** Ingenting slettes i noen av valgene. */
  readonly deletes: readonly never[];
}
export function resolveConflict(choice: ConflictChoice, c: { variantId: string; incomingVersionId: string }): ConflictResolution {
  switch (choice) {
    case "choose_incoming":
      return { command: { type: "ApproveAssetVersion", variantId: c.variantId as never, versionId: c.incomingVersionId as never }, status: "resolved", deletes: [] };
    case "reject":
      return { command: null, status: "rejected", deletes: [] };
    default:
      return { command: null, status: "resolved", deletes: [] };
  }
}
