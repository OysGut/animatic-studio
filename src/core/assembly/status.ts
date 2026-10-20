/**
 * Produksjonsstatus og varighet per scene (mandat 7.2–7.3 og 27.1–27.2; REQ-0112–0114, REQ-0118, REQ-0405,
 * REQ-0406, REQ-0494). Bygd natt til 12.10.2026 (Teknisk anbefaling, ingen produktendring).
 *
 * Hver scene telles én gang (REQ-0114), med den beste varigheten som finnes nå:
 * importert/ferdig film → AI-video → 2D-animatic med satt lengde → estimat fra manuset. Estimatet tas fra
 * oversiktens varighetsestimat (med brukerens antakelser), så tallene henger sammen. Deaktiverte scener er
 * med i listen, men ikke i summene (mandat 7.2).
 */
import type { ProjectState } from "../model";
import { framesToSeconds } from "../time";
import { assetsInScene } from "../library";
import { outdatedLayers } from "../library/impact";
import { translationStatus } from "../translation";
import { blocksOfVariant, isScriptOccurrence, orderedOccurrences, sceneNumberOf } from "../views";
import { estimateProduction, type ProductionEstimate } from "../screenplay/duration";
import { matchingOccurrences, type SceneFilter } from "../screenplay/filter";
import { filmClips } from "./film";
import { discrepancies } from "./discrepancy";
import { collation, localized } from "../i18n";
import { tLocalized } from "@/core/i18n/keyed";

/** Hvor tallet for scenen kommer fra (mandat 7.2). */
export type DurationSource = "film" | "ai" | "animatic" | "planned" | "estimate";

/** Produksjonsstatus for en scene. */
export type SceneStatus = "done" | "film" | "animatic" | "missing" | "inactive";

export const SCENE_STATUS_LABEL: Record<SceneStatus, string> = tLocalized({ done: "core-assembly-status.scene-status-label.done.bc68a82f9b2f", film: "core-assembly-status.scene-status-label.film.5d25ca00d7fd", animatic: "core-assembly-status.scene-status-label.animatic.26e6a9884a5e", missing: "core-assembly-status.scene-status-label.missing.b14468c5587e", inactive: "core-assembly-status.scene-status-label.inactive.69a20aae2490" });

export const DURATION_SOURCE_LABEL: Record<DurationSource, string> = tLocalized({ film: "core-assembly-status.duration-source-label.film.a21a8b43b949", ai: "core-assembly-status.duration-source-label.ai.563c92714034", animatic: "core-assembly-status.duration-source-label.animatic.47e96a8b8bd5", planned: "core-assembly-status.duration-source-label.planned.6117e90d61f7", estimate: "core-assembly-status.duration-source-label.estimate.6bbfeb651821" });

export interface SceneStatusRow {
  readonly occurrenceId: string;
  readonly active: boolean;
  readonly productionNumber: string | null;
  readonly status: SceneStatus;
  /** Estimat fra manuset (sekunder). */
  readonly estimateSeconds: number;
  /** 2D-scenens satte lengde, eller null (ingen 2D-scene, eller lengden følger estimatet). */
  readonly animaticSeconds: number | null;
  /** Lengden på filmen (importert eller AI) som brukes i scenen, eller null. */
  readonly filmSeconds: number | null;
  /** Det beste tallet nå, og hvor det kommer fra. */
  readonly seconds: number;
  readonly source: DurationSource;
  /** Brukerens planlagte lengde (sekunder), eller null. */
  readonly plannedSeconds: number | null;
  /** Manusendringer etter at 2D-scene eller film ble laget (DEC-0054). */
  readonly discrepancy: boolean;
  /** Ressursene som er med i scenen (for filtrering). */
  readonly assetIds: readonly string[];
  /**
   * Lag i scenens 2D-scene som viser en eldre versjon enn den som nå er godkjent (ressursendring,
   * mandat 27.2).
   */
  readonly outdatedLayers: number;
}

export interface ProductionStatus {
  readonly rows: readonly SceneStatusRow[];
  /** Summen av manusestimatene for aktive scener. */
  readonly estimatedSeconds: number;
  /** Aktive scener med lengde fra 2D-animatic eller film. */
  readonly confirmedSeconds: number;
  /** Estimat eller plan for aktive scener uten bekreftet lengde. */
  readonly remainingEstimatedSeconds: number;
  /** Forventet lengde nå: bekreftet + gjenstående estimat. */
  readonly expectedSeconds: number;
  /** Andel av forventet lengde som er ferdig film (godkjent), 0–1. */
  readonly doneShare: number;
  /** Andel av forventet lengde som fortsatt bare er estimert, 0–1. */
  readonly estimatedShare: number;
  readonly counts: Readonly<Record<SceneStatus, number>>;
  readonly discrepancies: number;
}

export function productionStatus(
  s: ProjectState,
  productionId: string,
  estimate: ProductionEstimate,
): ProductionStatus {
  const fps = s.project.fps;
  const clips = new Map(filmClips(s, productionId).map((c) => [c.occurrenceId, c]));
  const flagged = new Set(
    discrepancies(s, [...clips.values()], { spans: false }).map((d) => d.occurrenceId),
  );
  const estimates = new Map(estimate.scenes.map((e) => [e.occurrenceId, e.seconds]));
  // Samme 2D-scene som monteringen bruker (filmClips); for deaktiverte scener den med lavest id
  const compByVariant = new Map<string, { id: string; frames: number }>();
  for (const c of Object.values(s.compositions)) {
    if (c.removed) continue;
    const prev = compByVariant.get(c.variantId);
    if (!prev || c.id.localeCompare(prev.id) < 0)
      compByVariant.set(c.variantId, { id: c.id, frames: c.durationFrames });
  }

  const outdatedByComp = new Map<string, number>();
  for (const l of outdatedLayers(s))
    outdatedByComp.set(l.compositionId, (outdatedByComp.get(l.compositionId) ?? 0) + 1);

  const rows: SceneStatusRow[] = orderedOccurrences(s, productionId).filter(isScriptOccurrence).map((o) => {
    const clip = clips.get(o.id);
    const est = estimates.get(o.id) ?? 0;
    const compFrames = compByVariant.get(o.variantId)?.frames;
    const compId = compByVariant.get(o.variantId)?.id ?? null;
    const animaticSeconds =
      compFrames !== undefined && compFrames > 0 ? framesToSeconds(compFrames, fps) : null;
    const take = clip?.take ?? null;
    const filmSeconds = clip && take ? framesToSeconds(clip.durationFrames, fps) : null;
    const source: DurationSource = take
      ? take.kind === "ai_video"
        ? "ai"
        : "film"
      : clip && clip.durationKind === "set"
        ? "animatic"
        : clip && clip.durationKind === "planned"
          ? "planned"
          : "estimate";
    const seconds = clip && source !== "estimate" ? framesToSeconds(clip.durationFrames, fps) : est;
    const status: SceneStatus = !o.active
      ? "inactive"
      : take
        ? take.status === "approved"
          ? "done"
          : "film"
        : compFrames !== undefined
          ? "animatic"
          : "missing";
    return {
      occurrenceId: o.id,
      active: o.active,
      productionNumber: sceneNumberOf(s, o),
      status,
      estimateSeconds: est,
      animaticSeconds,
      filmSeconds,
      seconds,
      source,
      plannedSeconds: o.plannedMs !== undefined ? o.plannedMs / 1000 : null,
      discrepancy: flagged.has(o.id),
      assetIds: o.active ? assetsInScene(s, productionId, o.id).map((x) => x.asset.id) : [],
      outdatedLayers: compId ? (outdatedByComp.get(compId) ?? 0) : 0,
    };
  });

  const active = rows.filter((r) => r.active);
  const sum = (xs: readonly SceneStatusRow[], f: (r: SceneStatusRow) => number) =>
    xs.reduce((t, r) => t + f(r), 0);
  // Bekreftet: lengden kommer fra laget materiale (2D-animatic eller film), ikke fra plan eller estimat
  const confirmed = active.filter((r) => r.source !== "estimate" && r.source !== "planned");
  const confirmedSeconds = sum(confirmed, (r) => r.seconds);
  const remainingEstimatedSeconds = sum(
    active.filter((r) => r.source === "estimate" || r.source === "planned"),
    (r) => r.seconds,
  );
  const expectedSeconds = confirmedSeconds + remainingEstimatedSeconds;
  const doneSeconds = sum(
    active.filter((r) => r.status === "done"),
    (r) => r.seconds,
  );
  const counts: Record<SceneStatus, number> = {
    done: 0,
    film: 0,
    animatic: 0,
    missing: 0,
    inactive: 0,
  };
  for (const r of rows) counts[r.status]++;
  return {
    rows,
    estimatedSeconds: sum(active, (r) => r.estimateSeconds),
    confirmedSeconds,
    remainingEstimatedSeconds,
    expectedSeconds,
    doneShare: expectedSeconds > 0 ? doneSeconds / expectedSeconds : 0,
    estimatedShare: expectedSeconds > 0 ? remainingEstimatedSeconds / expectedSeconds : 0,
    counts,
    discrepancies: active.filter((r) => r.discrepancy).length,
  };
}

/** Filter for oversikten (mandat 27.2). Tomme felt = alle. */
export interface StatusFilter {
  readonly status?: SceneStatus | "";
  readonly assetId?: string;
  readonly onlyDiscrepancies?: boolean;
  /** Bare scener der ressurser er endret siden 2D-scenen ble laget (eldre bilder enn godkjent). */
  readonly onlyResourceChanges?: boolean;
  /** Bare scener der oversettelsen til dette språket mangler, er usikker eller må gjennomgås. */
  readonly language?: string;
  readonly text?: string;
}

export function filterStatusRows(
  s: ProjectState,
  rows: readonly SceneStatusRow[],
  f: StatusFilter,
): SceneStatusRow[] {
  const q = (f.text ?? "").trim().toLocaleLowerCase(collation());
  // Oversettelsesstatus per produksjon (beregnes én gang)
  const open = new Map<string, Set<string>>();
  const openBlocks = (productionId: string): Set<string> => {
    let hit = open.get(productionId);
    if (!hit) {
      const t = translationStatus(s, productionId, f.language!);
      hit = new Set([...t.missingIds, ...t.uncertainIds, ...t.reviewIds]);
      open.set(productionId, hit);
    }
    return hit;
  };
  return rows.filter((r) => {
    if (f.status && r.status !== f.status) return false;
    if (f.assetId && !r.assetIds.includes(f.assetId)) return false;
    if (f.onlyDiscrepancies && !r.discrepancy) return false;
    if (f.onlyResourceChanges && r.outdatedLayers === 0) return false;
    if (f.language) {
      const o = s.occurrences[r.occurrenceId];
      if (!o || !r.active) return false;
      const pending = openBlocks(o.productionId);
      if (!blocksOfVariant(s, o.variantId).some((b) => pending.has(b.id))) return false;
    }
    if (q) {
      const o = s.occurrences[r.occurrenceId];
      const h = o ? s.variants[o.variantId]?.heading : undefined;
      const hay =
        `${r.productionNumber ?? ""} ${h?.intExt ?? ""} ${h?.location ?? ""} ${h?.time ?? ""}`.toLocaleLowerCase(
          collation(),
        );
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Planlagt lengde skrevet av brukeren: «1:02:03» (timer), «1:30» (minutter:sekunder), «90» eller «1,5» (sekunder) →
 * millisekunder. Tomt = ingen plan (null); ugyldig eller utenfor 1 s–10 t = undefined.
 */
export function parsePlannedDuration(text: string): number | null | undefined {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const h = /^(\d+):([0-5]\d):([0-5]\d(?:\.\d+)?)$/.exec(t);
  const m = /^(\d+):([0-5]?\d(?:\.\d+)?)$/.exec(t);
  const sec = h
    ? Number(h[1]) * 3600 + Number(h[2]) * 60 + Number(h[3])
    : m
      ? Number(m[1]) * 60 + Number(m[2])
      : /^\d+(?:\.\d+)?$/.test(t)
        ? Number(t)
        : Number.NaN;
  if (!Number.isFinite(sec) || sec < 1 || sec > 36000) return undefined;
  return Math.round(sec * 1000);
}

/**
 * Manusfilteret med alle kriteriene (REQ-0073): tekst og karakter (`matchingOccurrences`), og i tillegg
 * ressurs fra biblioteket, produksjonsstatus og manusendringer.
 */
export function matchingScenes(
  s: ProjectState,
  productionId: string,
  f: SceneFilter,
  /** Statusradene (kan regnes ut én gang og gjenbrukes mens brukeren skriver). */
  rows?: readonly SceneStatusRow[],
): Set<string> {
  const base = matchingOccurrences(s, productionId, f);
  if (!f.assetId && !f.status && !f.discrepancy) return base;
  const list = rows ?? productionStatus(s, productionId, estimateProduction(s, productionId)).rows;
  const out = new Set<string>();
  for (const r of list) {
    if (!base.has(r.occurrenceId)) continue;
    if (f.status && r.status !== f.status) continue;
    if (f.discrepancy && !r.discrepancy) continue;
    if (f.assetId) {
      // Aktive rader har ressursene; deaktiverte regnes ut her
      const ids = r.active
        ? r.assetIds
        : assetsInScene(s, productionId, r.occurrenceId).map((x) => x.asset.id);
      if (!ids.includes(f.assetId)) continue;
    }
    out.add(r.occurrenceId);
  }
  return out;
}
