/** Navn og utseende for overgangene i monteringen (DEC-0047, DEC-0051). */
import type { TransitionKind } from "@/core";

export const TRANSITION_LABEL: Record<TransitionKind, string> = {
  cut: "Kutt",
  dissolve: "Overtoning",
  dip: "Via svart",
  dipWhite: "Via hvitt",
  wipe: "Tørk",
  push: "Skyv",
  iris: "Iris",
};

/** Merket i starten av klippet i tidslinjen. */
export function transitionMarkBackground(kind: TransitionKind): string {
  switch (kind) {
    case "dip":
      return "linear-gradient(90deg, rgba(0,0,0,0.85), transparent)";
    case "dipWhite":
      return "linear-gradient(90deg, rgba(255,255,255,0.75), transparent)";
    default:
      return "linear-gradient(90deg, color-mix(in oklab, var(--accent-brand) 45%, transparent), transparent)";
  }
}
