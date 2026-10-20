/**
 * Vinkelen et bilde viser (Mars 2026-10-13, DEC-0080): front, tre kvart, side, bak, portrett … Merkes i
 * stor visning, og brukes når andre vinkler av samme karakter eller objekt lages med AI («turnaround»):
 * bildene som allerede finnes, sendes med som referanse, så vinklene henger sammen.
 */
import type { AssetVersion, ProjectState } from "../model";

import { compareVersionCreation } from "./index";
import { tLocalized } from "@/core/i18n/keyed";

export const VERSION_VIEWS = [
  "front",
  "three_quarter",
  "side",
  "three_quarter_back",
  "back",
  "portrait",
  "sheet",
] as const;
export type VersionView = (typeof VERSION_VIEWS)[number];

export const VERSION_VIEW_LABEL: Record<VersionView, string> = tLocalized({ front: "core-library-view.version-view-label.front.a850cfb7837c", three_quarter: "core-library-view.version-view-label.three-quarter.26c05825fa40", side: "core-library-view.version-view-label.side.68edfcd4bfb6", three_quarter_back: "core-library-view.version-view-label.three-quarter-back.a8c8fa47fc90", back: "core-library-view.version-view-label.back.b22e35c52b42", portrait: "core-library-view.version-view-label.portrait.0970fe4c1624", sheet: "core-library-view.version-view-label.sheet.cd5a4a9d5231" });

/** Vinklene som kan lages med AI (alle unntatt arket). */
export const TURNAROUND_VIEWS: readonly VersionView[] = [
  "front",
  "three_quarter",
  "side",
  "three_quarter_back",
  "back",
  "portrait",
];

/**
 * Hvordan vinkelen beskrives for bildemodellen (engelsk, presist: kameraets plassering og hvilken vei
 * figuren vender). Samme ord brukes i alle beskrivelser, så vinklene blir like fra gang til gang.
 */
export const VERSION_VIEW_PROMPT: Record<VersionView, string> = {
  front: "front view – facing the camera straight on, both eyes and both shoulders equally visible",
  three_quarter:
    "three-quarter front view – turned about 45 degrees to the viewer's left, the far eye still visible",
  side: "side view (true profile) – turned 90 degrees to the viewer's left, only one eye visible",
  three_quarter_back:
    "three-quarter back view – turned about 135 degrees away, the back and the side of the head visible, face hidden",
  back: "back view – facing directly away from the camera, no face visible",
  portrait: "portrait – head and shoulders, facing the camera, the face filling most of the frame",
  sheet: "character sheet with several views side by side",
};

export function isVersionView(v: unknown): v is VersionView {
  return typeof v === "string" && (VERSION_VIEWS as readonly string[]).includes(v);
}

/** Bildene av ressursen med merket vinkel (siste versjon per vinkel), uten slettede. */
export function labelledViews(
  s: ProjectState,
  assetId: string,
): { readonly view: VersionView; readonly version: AssetVersion }[] {
  const variants = new Set(
    Object.values(s.assetVariants)
      .filter((v) => v.assetId === assetId && !v.archived)
      .map((v) => v.id),
  );
  const best = new Map<VersionView, AssetVersion>();
  for (const v of Object.values(s.assetVersions)) {
    if (!variants.has(v.variantId) || v.removed || !v.view || !v.mimeType.startsWith("image/"))
      continue;
    const cur = best.get(v.view);
    if (!cur || compareVersionCreation(v, cur) > 0) best.set(v.view, v);
  }
  return VERSION_VIEWS.flatMap((view) => {
    const version = best.get(view);
    return version ? [{ view, version }] : [];
  });
}
