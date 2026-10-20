/** Navn og utseende for overgangene i monteringen (DEC-0047, DEC-0051). */
import { localized, type TransitionKind } from "@/core";
import { tLocalized } from "@/core/i18n/keyed";

export const TRANSITION_LABEL: Record<TransitionKind, string> = tLocalized({ cut: "app-assembly-transitions.transition-label.cut.02c9e255c40f", dissolve: "app-assembly-transitions.transition-label.dissolve.892244a519a9", dip: "app-assembly-transitions.transition-label.dip.375380414b74", dipWhite: "app-assembly-transitions.transition-label.dip-white.cb2cd1a023a9", wipe: "app-assembly-transitions.transition-label.wipe.8f2ef695b852", push: "app-assembly-transitions.transition-label.push.4a2511f60e24", iris: "app-assembly-transitions.transition-label.iris.8dc43917f29d" });

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
