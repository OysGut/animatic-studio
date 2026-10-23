/**
 * Brukerens valg av vedlegg til bildemodellen (Øystein 23.10), husket per ressurs i økten
 * (sessionStorage i nettleseren, aldri i databasen).
 */
import { EMPTY_ATTACHED_CHOICE, type AttachedChoice } from "@/core";

const KEY = (assetId: string) => `ptg.attachedChoice.${assetId}`;

function valid(x: unknown): x is AttachedChoice {
  if (!x || typeof x !== "object") return false;
  const c = x as Record<string, unknown>;
  return (
    Array.isArray(c["excluded"]) &&
    c["excluded"].every((e) => typeof e === "string") &&
    Array.isArray(c["added"]) &&
    c["added"].every(
      (a) =>
        !!a &&
        typeof a === "object" &&
        typeof (a as Record<string, unknown>)["versionId"] === "string" &&
        ((a as Record<string, unknown>)["role"] === "style" || (a as Record<string, unknown>)["role"] === "view"),
    )
  );
}

export function readAttachedChoice(assetId: string): AttachedChoice {
  try {
    const raw = globalThis.sessionStorage?.getItem(KEY(assetId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return valid(parsed) ? parsed : EMPTY_ATTACHED_CHOICE;
  } catch {
    return EMPTY_ATTACHED_CHOICE;
  }
}

export function writeAttachedChoice(assetId: string, c: AttachedChoice): void {
  try {
    globalThis.sessionStorage?.setItem(KEY(assetId), JSON.stringify(c));
  } catch {
    // Lagringen er bare en bekvemmelighet
  }
}
