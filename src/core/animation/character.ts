/**
 * CA7 (§45–§53, §68–§70): karakteratferd som arves, bruk på tvers av scener, «bare her» / «oppdater alle»,
 * versjonshistorikk med sammenligning og «gjenopprett som ny versjon». Ren logikk – ingenting skrives her,
 * alt blir vanlige kommandoer med invers.
 */
import { L } from "../i18n";
import type { ProjectState } from "../model";
import { sceneNumberOf } from "../views";
import type { Command } from "../commands/types";
import {
  DEFAULT_EXPORT_FLAGS,
  type AnimationRigVersion,
  type AnimationUse,
  type CharacterBehavior,
  type ExportFlags,
  type RigSpec,
  type UseBehavior,
} from "./rig";
import { t as tk } from "@/core/i18n/keyed";

/** Feltene i karakteratferden som kan arves fra oppsettet og overstyres lokalt per scene. */
export const INHERITED_KEYS = ["blinkEnabled", "leftEyePatternId", "rightEyePatternId", "overlayPatternIds", "breath"] as const;
export type InheritedKey = (typeof INHERITED_KEYS)[number];

export interface EffectiveBehavior {
  readonly behavior: UseBehavior;
  /** Felt der scenen har sin egen verdi (vises tydelig som lokal overstyring). */
  readonly overridden: readonly InheritedKey[];
  /** Felt som kommer fra karakterens standard. */
  readonly inherited: readonly InheritedKey[];
}

/** Karakterens standard (fra oppsettversjonen) med scenens lokale verdier over. */
export function effectiveBehavior(s: ProjectState, use: AnimationUse): EffectiveBehavior {
  const base: CharacterBehavior = s.animationRigVersions[use.rigVersionId]?.spec.behavior ?? {};
  const local: UseBehavior = use.behavior ?? {};
  const overridden: InheritedKey[] = [];
  const inherited: InheritedKey[] = [];
  const merged: Record<string, unknown> = { ...local };
  for (const k of INHERITED_KEYS) {
    if (local[k] !== undefined) overridden.push(k);
    else if (base[k] !== undefined) {
      inherited.push(k);
      merged[k] = base[k];
    }
  }
  return { behavior: merged as UseBehavior, overridden, inherited };
}

/** Fjerner den lokale overstyringen for ett felt, så karakterens standard gjelder igjen. */
export function clearOverride(use: AnimationUse, key: InheritedKey): UseBehavior {
  const next: Record<string, unknown> = { ...(use.behavior ?? {}) };
  delete next[key];
  return next as UseBehavior;
}

export function exportFlagsOf(use: { readonly behavior?: UseBehavior } | null | undefined): ExportFlags {
  return { ...DEFAULT_EXPORT_FLAGS, ...(use?.behavior?.export ?? {}) };
}

export interface RigUsage {
  readonly use: AnimationUse;
  readonly occurrenceId: string;
  readonly label: string;
  readonly versionNumber: number;
  readonly current: boolean;
}

/** Alle scener som bruker oppsettet (ikke fjernet), i fast rekkefølge. */
export function rigUsages(s: ProjectState, rigId: string): RigUsage[] {
  const rig = s.animationRigs[rigId];
  const out: RigUsage[] = [];
  for (const use of Object.values(s.animationUses)) {
    if (use.removed) continue;
    const v = s.animationRigVersions[use.rigVersionId];
    if (!v || v.rigId !== rigId) continue;
    const occ = s.occurrences[use.occurrenceId];
    if (!occ) continue;
    const number = sceneNumberOf(s, occ as never);
    const heading = s.variants[occ.variantId]?.heading;
    const where = heading ? `${heading.intExt} ${heading.location}`.trim() : "";
    out.push({
      use,
      occurrenceId: occ.id,
      label: tk("core-animation-character.label.label.21386e955bf8", { value1: String(number ?? "–"), value2: String(where ? ` · ${where}` : "") }),
      versionNumber: v.number,
      current: rig?.currentVersionId === v.id,
    });
  }
  return out.sort((a, b) => (a.occurrenceId < b.occurrenceId ? -1 : a.occurrenceId > b.occurrenceId ? 1 : a.use.id < b.use.id ? -1 : 1));
}

/** Andre scener enn denne som bruker oppsettet («brukes i N andre scener»). */
export function otherUsages(s: ProjectState, rigId: string, hereUseId: string | null): RigUsage[] {
  return rigUsages(s, rigId).filter((u) => u.use.id !== hereUseId);
}

/**
 * «Bare her» eller «oppdater alle» etter at en ny versjon er laget. Ingenting oppdateres automatisk:
 * uten et valg står alle scener på versjonen de hadde. Gir null når ingen bruk må flyttes.
 */
export function planAdopt(
  s: ProjectState,
  rigId: string,
  rigVersionId: string,
  scope: "here" | "all",
  hereUseId: string | null,
): Command | null {
  const ids = rigUsages(s, rigId)
    .filter((u) => (scope === "all" || u.use.id === hereUseId) && u.use.rigVersionId !== rigVersionId)
    .map((u) => u.use.id);
  if (!ids.length) return null;
  return { type: "AdoptRigVersion", useIds: ids, rigVersionId };
}

export interface RigDiff {
  readonly kind: "anchor" | "part" | "behavior" | "origin";
  readonly key: string;
  readonly change: "added" | "removed" | "changed";
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Forskjellene mellom to versjoner av oppsettet (for sammenligning i historikken). */
export function compareRigSpecs(a: RigSpec, b: RigSpec): RigDiff[] {
  const out: RigDiff[] = [];
  const diff = (kind: RigDiff["kind"], x: Readonly<Record<string, unknown>>, y: Readonly<Record<string, unknown>>) => {
    for (const k of [...new Set([...Object.keys(x), ...Object.keys(y)])].sort()) {
      if (x[k] === undefined && y[k] !== undefined) out.push({ kind, key: k, change: "added" });
      else if (x[k] !== undefined && y[k] === undefined) out.push({ kind, key: k, change: "removed" });
      else if (!same(x[k], y[k])) out.push({ kind, key: k, change: "changed" });
    }
  };
  diff("anchor", a.anchors ?? {}, b.anchors ?? {});
  diff("part", a.parts ?? {}, b.parts ?? {});
  diff("behavior", (a.behavior ?? {}) as Record<string, unknown>, (b.behavior ?? {}) as Record<string, unknown>);
  if (!same(a.origin, b.origin)) out.push({ kind: "origin", key: "origin", change: a.origin ? (b.origin ? "changed" : "removed") : "added" });
  return out;
}

/** Versjonene av oppsettet, nyeste først. Ingen slettes. */
export function rigHistory(s: ProjectState, rigId: string): AnimationRigVersion[] {
  return Object.values(s.animationRigVersions)
    .filter((v) => v.rigId === rigId)
    .sort((a, b) => b.number - a.number || (a.id < b.id ? -1 : 1));
}

/**
 * «Gjenopprett som ny versjon»: kopierer den gamle versjonen til en ny (den gamle og de nyere står urørt).
 * Kildebildet er det gamle når det fortsatt finnes, ellers det nåværende.
 */
export function restoreRigVersion(s: ProjectState, versionId: string, newVersionId: string): Command | null {
  const old = s.animationRigVersions[versionId];
  const rig = old ? s.animationRigs[old.rigId] : undefined;
  if (!old || !rig || rig.removed) return null;
  const current = rig.currentVersionId ? s.animationRigVersions[rig.currentVersionId] : undefined;
  const source = s.assetVersions[old.sourceVersionId]?.removed === false ? old.sourceVersionId : (current?.sourceVersionId ?? old.sourceVersionId);
  return { type: "SaveRigVersion", rigId: rig.id, versionId: newVersionId, sourceVersionId: source, spec: structuredClone(old.spec) };
}

/** Lagrer karakteratferden som standard på karakteren: en ny versjon av oppsettet (de gamle står). */
export function saveCharacterDefault(s: ProjectState, rigId: string, newVersionId: string, behavior: CharacterBehavior): Command | null {
  const rig = s.animationRigs[rigId];
  const current = rig?.currentVersionId ? s.animationRigVersions[rig.currentVersionId] : undefined;
  if (!rig || rig.removed || !current) return null;
  return { type: "SaveRigVersion", rigId, versionId: newVersionId, sourceVersionId: current.sourceVersionId, spec: { ...structuredClone(current.spec), behavior: structuredClone(behavior) } };
}

/** Pust som liten vertikal skalering (deterministisk, ingen tilfeldighet). 1 = ingen endring. */
export function breathScaleAt(breath: CharacterBehavior["breath"] | undefined, frame: number, fps: number): number {
  if (!breath || !breath.enabled || breath.amount <= 0 || fps <= 0) return 1;
  const t = (frame / fps) * 1000;
  return 1 + breath.amount * 0.5 * (1 - Math.cos((2 * Math.PI * t) / breath.periodMs));
}

/** CA8: finnes det karakterlag med eksportvalget «eget lag» i prosjektet? */
export function hasSeparateCharacterLayers(s: ProjectState): boolean {
  return Object.values(s.animationUses).some((u) => !u.removed && u.enabled && u.behavior?.export?.mode === "separate");
}
