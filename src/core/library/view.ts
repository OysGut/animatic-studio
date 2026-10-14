/**
 * Vinkelen et bilde viser (Mars 2026-10-13, DEC-0080): front, tre kvart, side, bak, portrett … Merkes i
 * stor visning, og brukes når andre vinkler av samme karakter eller objekt lages med AI («turnaround»):
 * bildene som allerede finnes, sendes med som referanse, så vinklene henger sammen.
 */
import type { AssetVersion, ProjectState } from "../model";
import { localized } from "../i18n";

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

export const VERSION_VIEW_LABEL: Record<VersionView, string> = localized({
  front: ["Forfra", "Front"],
  three_quarter: ["Tre kvart forfra", "Three-quarter front"],
  side: ["Fra siden (profil)", "Side (profile)"],
  three_quarter_back: ["Tre kvart bakfra", "Three-quarter back"],
  back: ["Bakfra", "Back"],
  portrait: ["Portrett (hode og skuldre)", "Portrait (head and shoulders)"],
  sheet: ["Karakterark (flere vinkler)", "Character sheet (several angles)"],
});

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
    if (!cur || v.createdAt > cur.createdAt) best.set(v.view, v);
  }
  return VERSION_VIEWS.flatMap((view) => {
    const version = best.get(view);
    return version ? [{ view, version }] : [];
  });
}
