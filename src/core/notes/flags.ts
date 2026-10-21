/**
 * DV8 (DIALOGUE_VOICE_SPEC §94–§117, H1–H14): gule huskelapper. Delte prosjektdata, skrevet via
 * kommandoer og apply_changes. Egne data og livsløp, adskilt fra avvik og bokmerker (§117).
 * Ren TypeScript (ADR-0003).
 */
import type { ProjectState } from "../model";

import { orderedOccurrences } from "../views";
import { t } from "@/core/i18n/keyed";

export type NoteFlagTargetKind = "dialogue_version" | "audio_clip" | "asset_version" | "asset_variant" | "occurrence";
export const NOTE_FLAG_TARGETS: readonly NoteFlagTargetKind[] = ["dialogue_version", "audio_clip", "asset_version", "asset_variant", "occurrence"];
export const NOTE_FLAG_MAX_TEXT = 4000;

export interface NoteFlag {
  readonly id: string;
  readonly revision: number;
  readonly targetKind: NoteFlagTargetKind;
  readonly targetId: string;
  readonly text: string;
  readonly enabled: boolean;
  readonly createdBy?: string | null;
  readonly createdAt?: string;
  readonly editedBy?: string | null;
  readonly editedAt?: string | null;
  readonly removed: boolean;
}

export const NOTE_FLAG_KIND_LABEL = (k: NoteFlagTargetKind) => ({
  dialogue_version: t("core-notes-flags.dialogue-version.dialogue-version.df9a620bc024"),
  audio_clip: t("core-notes-flags.audio-clip.audio-clip.7c0ddf071ac7"),
  asset_version: t("core-notes-flags.asset-version.asset-version.c5f2c69f2ebc"),
  asset_variant: t("core-notes-flags.asset-variant.asset-variant.cbd2482bdf3c"),
  occurrence: t("core-notes-flags.occurrence.occurrence.86a7792d8ec2"),
})[k];

export function flagsFor(s: ProjectState, kind: NoteFlagTargetKind, id: string): NoteFlag[] {
  return Object.values(s.noteFlags ?? {}).filter(f => !f.removed && f.targetKind === kind && f.targetId === id);
}

/** Elementets nåværende plassering (H12, H13): følger elementet om det er flyttet. */
export type NoteFlagLocation =
  | { readonly kind: "scene"; readonly occurrenceId: string; readonly blockId: string | null; readonly offsetMs: number | null }
  | { readonly kind: "library"; readonly assetId: string }
  | { readonly kind: "missing" };

export function noteFlagLocation(s: ProjectState, f: NoteFlag): NoteFlagLocation {
  const clipLoc = (clipId: string): NoteFlagLocation => {
    const c = s.audioClips[clipId];
    return c && !c.removed ? { kind: "scene", occurrenceId: c.occurrenceId, blockId: c.blockId ?? null, offsetMs: c.offsetMs } : { kind: "missing" };
  };
  switch (f.targetKind) {
    case "dialogue_version": { const v = s.dialogueVersions[f.targetId]; return v ? clipLoc(v.clipId) : { kind: "missing" }; }
    case "audio_clip": return clipLoc(f.targetId);
    case "asset_version": { const v = s.assetVersions[f.targetId]; const va = v ? s.assetVariants[v.variantId] : undefined; return va ? { kind: "library", assetId: va.assetId } : { kind: "missing" }; }
    case "asset_variant": { const va = s.assetVariants[f.targetId]; return va ? { kind: "library", assetId: va.assetId } : { kind: "missing" }; }
    case "occurrence": return s.occurrences[f.targetId] ? { kind: "scene", occurrenceId: f.targetId, blockId: null, offsetMs: null } : { kind: "missing" };
  }
}

export type NoteFlagSort = "date" | "script" | "scene";
export interface NoteFlagFilter { readonly creator?: string; readonly kind?: NoteFlagTargetKind; readonly active?: boolean }

/** Oversikten på prosjektsiden (H9–H11): sortering og filtre. Manusplassering følger hovedproduksjonens rekkefølge. */
export function noteFlagOverview(s: ProjectState, sort: NoteFlagSort, filter: NoteFlagFilter = {}): NoteFlag[] {
  const order = new Map<string, number>();
  let i = 0;
  for (const p of Object.values(s.productions).sort((a, b) => (a.kind === "main" ? -1 : 0) - (b.kind === "main" ? -1 : 0) || a.id.localeCompare(b.id)))
    for (const o of orderedOccurrences(s, p.id)) if (!order.has(o.id)) order.set(o.id, i++);
  const blockOrder = (blockId: string | null) => {
    const b = blockId ? s.blocks[blockId] : undefined;
    return b ? b.orderKey : "";
  };
  const pos = (f: NoteFlag) => { const l = noteFlagLocation(s, f); return l.kind === "scene" ? [order.get(l.occurrenceId) ?? 1e9, l.kind, blockOrder(l.blockId), l.offsetMs ?? 0] as const : [1e9 + 1, l.kind, "", 0] as const; };
  const list = Object.values(s.noteFlags ?? {}).filter(f => !f.removed
    && (filter.creator === undefined || f.createdBy === filter.creator)
    && (filter.kind === undefined || f.targetKind === filter.kind)
    && (filter.active === undefined || f.enabled === filter.active));
  const date = (f: NoteFlag) => f.editedAt ?? f.createdAt ?? "";
  return list.sort((a, b) => {
    if (sort === "date") return date(b).localeCompare(date(a)) || a.id.localeCompare(b.id);
    const pa = pos(a), pb = pos(b);
    if (pa[0] !== pb[0]) return pa[0] - pb[0];
    if (sort === "script" && pa[2] !== pb[2]) return pa[2] < pb[2] ? -1 : 1;
    if (pa[3] !== pb[3]) return pa[3] - pb[3];
    return a.id.localeCompare(b.id);
  });
}
