/**
 * SB-2: valgene i storyboardgalleriet (huskes per bruker via useUiPref: lokalt + profiles.ui_prefs).
 * Ren validering, så en ødelagt eller eldre lagret verdi aldri knekker galleriet.
 */
import { PRODUCTION_AREAS, PRODUCTION_STATUSES, type ProductionArea, type ProductionStatusValue } from "@/core";

export const GALLERY_SHOW_KEYS = ["name", "number", "dialogue", "script", "notes", "timing", "status"] as const;
export type GalleryShowKey = (typeof GALLERY_SHOW_KEYS)[number];

export interface GalleryPrefs {
  /** Kortbredde i piksler (glidebryter og zoom). */
  readonly size: number;
  readonly view: "grid" | "text";
  readonly show: Readonly<Record<GalleryShowKey, boolean>>;
  readonly filterArea: ProductionArea | null;
  readonly filterStatus: ProductionStatusValue | null;
  readonly showHidden: boolean;
}

export const MIN_SIZE = 96;
export const MAX_SIZE = 480;

export const DEFAULT_GALLERY_PREFS: GalleryPrefs = {
  size: 200,
  view: "grid",
  show: { name: true, number: true, dialogue: true, script: false, notes: true, timing: true, status: true },
  filterArea: null,
  filterStatus: null,
  showHidden: false,
};

export function isGalleryPrefs(v: unknown): v is GalleryPrefs {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  if (typeof p["size"] !== "number" || !Number.isFinite(p["size"]) || p["size"] < MIN_SIZE || p["size"] > MAX_SIZE) return false;
  if (p["view"] !== "grid" && p["view"] !== "text") return false;
  const show = p["show"];
  if (!show || typeof show !== "object") return false;
  for (const k of GALLERY_SHOW_KEYS) if (typeof (show as Record<string, unknown>)[k] !== "boolean") return false;
  if (p["filterArea"] !== null && !(PRODUCTION_AREAS as readonly unknown[]).includes(p["filterArea"])) return false;
  if (p["filterStatus"] !== null && !(PRODUCTION_STATUSES as readonly unknown[]).includes(p["filterStatus"])) return false;
  return typeof p["showHidden"] === "boolean";
}

/** Zoom med tastatur/knapper: ett trinn opp eller ned, innenfor grensene. */
export function zoomStep(size: number, dir: 1 | -1): number {
  const next = Math.round(dir > 0 ? size * 1.25 : size / 1.25);
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, next));
}

/** Antall kort per rad for en gitt bredde. */
export function columnsFor(width: number, size: number, gap = 12): number {
  return Math.max(1, Math.floor((width + gap) / (size + gap)));
}

export interface VirtualRow {
  readonly kind: "scene" | "panels" | "empty";
  readonly sceneIndex: number;
  /** Indekser i scenens panelliste. */
  readonly from: number;
  readonly to: number;
  readonly top: number;
  readonly height: number;
}

/** Radene i galleriet med faste høyder, til virtualisering (bare synlige rader tegnes). */
export function virtualRows(sceneSizes: readonly number[], columns: number, headerH: number, rowH: number): VirtualRow[] {
  const rows: VirtualRow[] = [];
  let top = 0;
  sceneSizes.forEach((n, i) => {
    rows.push({ kind: "scene", sceneIndex: i, from: 0, to: 0, top, height: headerH });
    top += headerH;
    if (n === 0) {
      rows.push({ kind: "empty", sceneIndex: i, from: 0, to: 0, top, height: headerH });
      top += headerH;
    }
    for (let k = 0; k < n; k += columns) {
      rows.push({ kind: "panels", sceneIndex: i, from: k, to: Math.min(n, k + columns), top, height: rowH });
      top += rowH;
    }
  });
  return rows;
}

/** Radene som ligger i (eller nær) det synlige vinduet. */
export function visibleRows(rows: readonly VirtualRow[], scrollTop: number, viewH: number, overscan = 600): VirtualRow[] {
  const lo = scrollTop - overscan, hi = scrollTop + viewH + overscan;
  return rows.filter((r) => r.top + r.height >= lo && r.top <= hi);
}
