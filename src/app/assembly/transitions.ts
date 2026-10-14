/** Navn og utseende for overgangene i monteringen (DEC-0047, DEC-0051). */
import { localized, type TransitionKind } from "@/core";

export const TRANSITION_LABEL: Record<TransitionKind, string> = localized({
  cut: ["Kutt", "Cut"],
  dissolve: ["Overtoning", "Dissolve"],
  dip: ["Via svart", "Through black"],
  dipWhite: ["Via hvitt", "Through white"],
  wipe: ["Tørk", "Wipe"],
  push: ["Skyv", "Push"],
  iris: ["Iris", "Iris"],
});

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
