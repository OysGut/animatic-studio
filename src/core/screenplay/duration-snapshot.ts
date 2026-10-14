/**
 * Lagrede varighetsestimater (mandat 7.4, REQ-0120, migrasjon 0028): et øyeblikksbilde av varighetsoversikten
 * slik den var da det ble lagret – bare manusestimat, 2D-scenenes lengder, planlagte lengder, bekreftet lengde
 * og antakelsene som ble brukt. Tidligere estimater regnes aldri på nytt med dagens antakelser; bare
 * manusversjoner uten lagret estimat regnes på nytt, og de merkes tydelig.
 */
import type { DurationSource, ProductionStatus } from "../assembly/status";
import {
  DEFAULT_DURATION_ASSUMPTIONS,
  normalizeDurationAssumptions,
  type DurationAssumptions,
  type DurationHistoryPoint,
} from "./duration";
import { L, localized } from "../i18n";

/** Én scene i et lagret estimat (sekunder). */
export interface DurationSnapshotScene {
  readonly occurrenceId: string;
  readonly number: string | null;
  readonly active: boolean;
  /** Estimat fra manusteksten med antakelsene i øyeblikksbildet. */
  readonly estimateSeconds: number;
  /** 2D-scenens satte lengde, eller null. */
  readonly animaticSeconds: number | null;
  /** Planlagt lengde, eller null. */
  readonly plannedSeconds: number | null;
  /** Filmens lengde (importert eller AI), eller null. */
  readonly filmSeconds: number | null;
  /** Det beste tallet da, og hvor det kom fra. */
  readonly seconds: number;
  readonly source: DurationSource;
}

/** Format 1 (lagres som jsonb i duration_estimates.estimate). */
export interface DurationSnapshot {
  readonly format: 1;
  readonly activeScenes: number;
  /** Bare manusestimat for de aktive scenene. */
  readonly estimatedSeconds: number;
  /** Aktive scener med lengde fra 2D-animatic eller film. */
  readonly confirmedSeconds: number;
  /** Estimat eller plan for resten. */
  readonly remainingEstimatedSeconds: number;
  /** Forventet lengde: bekreftet + gjenstående. */
  readonly expectedSeconds: number;
  /** Summen av planlagte lengder for aktive scener med plan. */
  readonly plannedSeconds: number;
  /** Summen av 2D-scenenes satte lengder for aktive scener. */
  readonly animaticSeconds: number;
  readonly scenes: readonly DurationSnapshotScene[];
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Øyeblikksbildet av oversikten nå (samme tall som vises). */
export function durationSnapshot(status: ProductionStatus): DurationSnapshot {
  const active = status.rows.filter((r) => r.active);
  return {
    format: 1,
    activeScenes: active.length,
    estimatedSeconds: r3(status.estimatedSeconds),
    confirmedSeconds: r3(status.confirmedSeconds),
    remainingEstimatedSeconds: r3(status.remainingEstimatedSeconds),
    expectedSeconds: r3(status.expectedSeconds),
    plannedSeconds: r3(active.reduce((t, r) => t + (r.plannedSeconds ?? 0), 0)),
    animaticSeconds: r3(active.reduce((t, r) => t + (r.animaticSeconds ?? 0), 0)),
    scenes: status.rows.map((r) => ({
      occurrenceId: r.occurrenceId,
      number: r.productionNumber,
      active: r.active,
      estimateSeconds: r3(r.estimateSeconds),
      animaticSeconds: r.animaticSeconds === null ? null : r3(r.animaticSeconds),
      plannedSeconds: r.plannedSeconds === null ? null : r3(r.plannedSeconds),
      filmSeconds: r.filmSeconds === null ? null : r3(r.filmSeconds),
      seconds: r3(r.seconds),
      source: r.source,
    })),
  };
}

const SOURCES: readonly DurationSource[] = ["film", "ai", "animatic", "planned", "estimate"];

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Leser et lagret øyeblikksbilde (tolerant: ukjente felt ignoreres). Null hvis formatet er ukjent. */
export function parseDurationSnapshot(x: unknown): DurationSnapshot | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o["format"] !== 1 || !Array.isArray(o["scenes"])) return null;
  const scenes = (o["scenes"] as unknown[])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s): DurationSnapshotScene => ({
      occurrenceId: String(s["occurrenceId"] ?? ""),
      number: typeof s["number"] === "string" ? s["number"] : null,
      active: s["active"] !== false,
      estimateSeconds: numOr(s["estimateSeconds"], 0),
      animaticSeconds: numOrNull(s["animaticSeconds"]),
      plannedSeconds: numOrNull(s["plannedSeconds"]),
      filmSeconds: numOrNull(s["filmSeconds"]),
      seconds: numOr(s["seconds"], 0),
      source: SOURCES.includes(s["source"] as DurationSource)
        ? (s["source"] as DurationSource)
        : "estimate",
    }));
  return {
    format: 1,
    activeScenes: numOr(o["activeScenes"], scenes.filter((s) => s.active).length),
    estimatedSeconds: numOr(o["estimatedSeconds"], 0),
    confirmedSeconds: numOr(o["confirmedSeconds"], 0),
    remainingEstimatedSeconds: numOr(o["remainingEstimatedSeconds"], 0),
    expectedSeconds: numOr(o["expectedSeconds"], 0),
    plannedSeconds: numOr(o["plannedSeconds"], 0),
    animaticSeconds: numOr(o["animaticSeconds"], 0),
    scenes,
  };
}

/** Et lagret estimat (rad i duration_estimates). */
export interface StoredDurationEstimate {
  readonly id: string;
  readonly productionId: string;
  readonly scriptVersionId: string | null;
  readonly assumptions: DurationAssumptions;
  readonly snapshot: DurationSnapshot;
  readonly createdAt: string;
  readonly createdBy: string | null;
}

/** Fra databaserad; null hvis raden ikke kan leses (vises da ikke). */
export function storedEstimateFromRow(
  row: Readonly<Record<string, unknown>>,
): StoredDurationEstimate | null {
  const snapshot = parseDurationSnapshot(row["estimate"]);
  if (!snapshot || typeof row["id"] !== "string") return null;
  return {
    id: row["id"],
    productionId: String(row["production_id"] ?? ""),
    scriptVersionId: typeof row["script_version_id"] === "string" ? row["script_version_id"] : null,
    // Lagret med grenser som var gyldige da; ugyldige (eldre) verdier vises som standard
    assumptions: normalizeDurationAssumptions(row["assumptions"]) ?? DEFAULT_DURATION_ASSUMPTIONS,
    snapshot,
    createdAt: String(row["created_at"] ?? ""),
    createdBy: typeof row["created_by"] === "string" ? row["created_by"] : null,
  };
}

/** Hvor et punkt i historikken kommer fra. */
export type DurationHistoryBasis = "stored" | "recomputed" | "now";

export const DURATION_BASIS_LABEL: Record<DurationHistoryBasis, string> = localized({
  stored: ["lagret estimat", "saved estimate"],
  recomputed: ["regnet på nytt med dagens antakelser", "recalculated with today's assumptions"],
  now: ["nå", "now"],
});

export interface DurationHistoryRow extends DurationHistoryPoint {
  readonly basis: DurationHistoryBasis;
  /** Antakelsene tallet bygger på (lagrede for lagrede estimater, dagens ellers). */
  readonly assumptions: DurationAssumptions;
  /** Bekreftet lengde (2D-animatic og film); ukjent (null) for versjoner som er regnet på nytt. */
  readonly confirmedSeconds: number | null;
  readonly scriptVersionId: string | null;
  /** ID for et lagret estimat. */
  readonly estimateId: string | null;
}

export interface HistoryVersion {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly createdAt: string;
}

/**
 * Historikken (mandat 7.4): lagrede estimater med sine egne antakelser, og manusversjoner uten lagret
 * estimat regnet på nytt (`recompute`, med dagens antakelser), sortert etter tid, med «Nå» til slutt.
 * Et lagret estimat for en versjon erstatter omregningen av den versjonen.
 */
export function durationHistory(input: {
  readonly versions: readonly HistoryVersion[];
  readonly stored: readonly StoredDurationEstimate[];
  /** Omregning av en versjon uten lagret estimat (snapshotDuration med dagens antakelser). */
  readonly recompute: (versionId: string) => DurationHistoryPoint | null;
  readonly todayAssumptions: DurationAssumptions;
  readonly now: {
    readonly at: string;
    readonly estimatedSeconds: number;
    readonly expectedSeconds: number;
    readonly confirmedSeconds: number;
    readonly scenes: number;
  };
}): DurationHistoryRow[] {
  const versionById = new Map(input.versions.map((v) => [v.id, v]));
  const label = (v: HistoryVersion) => `v${v.number} ${v.name}`;
  const withEstimate = new Set(
    input.stored.map((e) => e.scriptVersionId).filter((x): x is string => x !== null),
  );
  const rows: { row: DurationHistoryRow; order: number }[] = [];
  for (const e of input.stored) {
    const v = e.scriptVersionId ? versionById.get(e.scriptVersionId) : undefined;
    rows.push({
      order: rows.length,
      row: {
        label: v ? label(v) : L("Lagret estimat", "Saved estimate"),
        at: e.createdAt,
        estimatedSeconds: e.snapshot.estimatedSeconds,
        expectedSeconds: e.snapshot.expectedSeconds,
        scenes: e.snapshot.activeScenes,
        basis: "stored",
        assumptions: e.assumptions,
        confirmedSeconds: e.snapshot.confirmedSeconds,
        scriptVersionId: e.scriptVersionId,
        estimateId: e.id,
      },
    });
  }
  for (const v of input.versions) {
    if (withEstimate.has(v.id)) continue;
    const p = input.recompute(v.id);
    if (!p) continue;
    rows.push({
      order: rows.length,
      row: {
        ...p,
        label: label(v),
        at: v.createdAt,
        basis: "recomputed",
        assumptions: input.todayAssumptions,
        confirmedSeconds: null,
        scriptVersionId: v.id,
        estimateId: null,
      },
    });
  }
  // Tidspunkt fra databasen kan ha ulik skrivemåte (+00:00 eller Z): sammenlign som tid
  const time = (s: string) => {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  };
  rows.sort((a, b) => time(a.row.at) - time(b.row.at) || a.order - b.order);
  return [
    ...rows.map((x) => x.row),
    {
      label: L("Nå", "Now"),
      at: input.now.at,
      estimatedSeconds: input.now.estimatedSeconds,
      expectedSeconds: input.now.expectedSeconds,
      scenes: input.now.scenes,
      basis: "now",
      assumptions: input.todayAssumptions,
      confirmedSeconds: input.now.confirmedSeconds,
      scriptVersionId: null,
      estimateId: null,
    },
  ];
}
