/**
 * Fase 5, SB-1: storyboardgrunnmur (Øystein 23.10, godkjent). Ren TypeScript (ADR-0003).
 *
 * Et storyboardpanel er en vanlig komposisjon med `kind: "storyboard"`, knyttet til en sceneforekomst
 * (og dermed variant) med egen panelrekkefølge (`orderKey`) innen scenen. Lagene er vanlige lag;
 * lagtypene note/arrow/camera_mark er bare tillatt i storyboardkomposisjoner. Panelets forankring i
 * manuset er koblingsrader (én rad per blokk, som time_links) – ikke et felt – slik at hver kobling
 * kan opprettes, flyttes og angres for seg i synkroniseringen.
 */
import type { BlockId, CompositionId, LayerId, OccurrenceId, VariantId } from "../ids";
import type { Composition, CompositionLayer, LayerKind, PathPoint, ProjectState } from "../model";

/** Komposisjonstype (migrasjon 0102). «scene» er dagens 2D-scene; «storyboard» er et panel. */
export type CompositionKind = "scene" | "storyboard";

/** Lagtyper som bare er tillatt i storyboardkomposisjoner (SB-1). shape og text finnes fra før. */
export const STORYBOARD_LAYER_KINDS = ["note", "arrow", "camera_mark"] as const;
export type StoryboardLayerKind = (typeof STORYBOARD_LAYER_KINDS)[number];

export function isStoryboardLayerKind(kind: LayerKind): kind is StoryboardLayerKind {
  return (STORYBOARD_LAYER_KINDS as readonly string[]).includes(kind);
}

/** Lapp på et panel (SB-1): fri tekst og farge (fargen har ingen fast betydning). */
export type PanelNoteType = "visual" | "direction" | "camera";

export interface PanelNoteSpec {
  readonly noteType: PanelNoteType;
  readonly text: string;
  /** #rrggbb – fri farge, ingen fast betydning. */
  readonly color: string;
  /** Behandlet: noen har tatt stilling til lappen. */
  readonly handled: boolean;
  /** Valgfri forankring: et lag i samme panel, eller et område i panelets piksler. */
  readonly anchor:
    | { readonly layerId: LayerId }
    | { readonly region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } }
    | null;
}

/** Pil på et panel (SB-1): bevegelse eller oppmerksomhet, med valgfri kobling til et lag. */
export type ArrowCategory = "character" | "camera" | "object" | "gaze" | "attention";

export interface ArrowSpec {
  /** Punktene pilen går gjennom (to eller flere; smooth = kurve). */
  readonly points: readonly PathPoint[];
  readonly form: "straight" | "curved";
  /** Tykkelse i piksler (1–64). */
  readonly thickness: number;
  /** #rrggbb. */
  readonly color: string;
  readonly category: ArrowCategory;
  /** Valgfri kobling til et lag i samme panel (pilene følger laget), eller null. */
  readonly layerId: LayerId | null;
}

/** Kameramerke på et panel (SB-1): en instruksjon, ikke et animert kamera. */
export interface CameraMarkSpec {
  /** Rammen kameraet skal vise, i panelets piksler. */
  readonly frame: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** Zoom (1 = hele formatet), pan i piksler og tilt i grader. */
  readonly zoom: number;
  readonly pan: { readonly x: number; readonly y: number };
  readonly tilt: number;
}

/** Forankring av et panel i manuset: én rad per blokk (migrasjon 0102). */
export interface PanelBlockLink {
  readonly id: string;
  readonly revision: number;
  readonly panelId: CompositionId;
  readonly blockId: BlockId;
  /** Rekkefølgen blokkene leses i innen panelet. */
  readonly orderKey: string;
  readonly removed: boolean;
}

/** Fagområdene statussporet dekker (SB-1). Flere kan legges til senere. */
export const PRODUCTION_AREAS = ["script", "storyboard", "animation", "sound", "film"] as const;
export type ProductionArea = (typeof PRODUCTION_AREAS)[number];

/** Statusene i sporet (SB-1). Listen kan utvides i en senere migrasjon. */
export const PRODUCTION_STATUSES = ["not_started", "in_progress", "review", "changes_requested", "done"] as const;
export type ProductionStatusValue = (typeof PRODUCTION_STATUSES)[number];

/** Gjeldende status for ett fagområde på én forekomst eller ett panel (migrasjon 0102). */
export interface ProductionStatusRow {
  readonly id: string;
  readonly revision: number;
  readonly area: ProductionArea;
  /** Nøyaktig én av forekomst og panel er satt. */
  readonly occurrenceId: OccurrenceId | null;
  readonly compositionId: CompositionId | null;
  readonly status: ProductionStatusValue;
  readonly removed: boolean;
}

/** Historikk: én rad per statusendring (migrasjon 0102). Tidligere godkjenninger bevares. */
export interface ProductionStatusEvent {
  readonly id: string;
  readonly revision: number;
  readonly statusId: string;
  readonly area: ProductionArea;
  readonly occurrenceId: OccurrenceId | null;
  readonly compositionId: CompositionId | null;
  readonly status: ProductionStatusValue;
  readonly removed: boolean;
}

/**
 * Bevart revisjon av et panel (SB-1): øyeblikksbilde av komposisjonen, lagene og blokkoblingene,
 * tatt før et godkjent panel redigeres. Valget er snapshot framfor komposisjonsversjoner:
 * komposisjoner har ingen versjonskjede, og en dublett av komposisjon + lag ville blandet seg inn
 * i synk, rekkefølge og sletting. Et snapshot er uforanderlig og kan gjenopprettes senere.
 */
export interface PanelSnapshot {
  readonly id: string;
  readonly revision: number;
  readonly panelId: CompositionId;
  /** Panelets revisjon da øyeblikksbildet ble tatt. */
  readonly panelRevision: number;
  readonly snapshot: PanelSnapshotContent;
  readonly removed: boolean;
}

export interface PanelSnapshotContent {
  readonly composition: Omit<Composition, "removed">;
  readonly layers: readonly Omit<CompositionLayer, "removed">[];
  readonly blockIds: readonly BlockId[];
}

// ---------- Validering (samme mønster som andre *Error-funksjoner i kjernen) ----------

export type StoryboardError =
  | "note_spec_invalid"
  | "arrow_spec_invalid"
  | "camera_mark_spec_invalid"
  | "storyboard_kind_only"
  | "status_target_invalid"
  | "status_invalid"
  | "anchor_block_invalid";

const HEX = /^#[0-9a-f]{6}$/;

function numIn(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

export function panelNoteError(spec: PanelNoteSpec): StoryboardError | null {
  if (spec.noteType !== "visual" && spec.noteType !== "direction" && spec.noteType !== "camera") return "note_spec_invalid";
  if (typeof spec.text !== "string" || spec.text.length > 4000) return "note_spec_invalid";
  if (!HEX.test(spec.color)) return "note_spec_invalid";
  const a = spec.anchor;
  if (a !== null && a !== undefined) {
    if ("layerId" in a) { if (typeof a.layerId !== "string" || !a.layerId) return "note_spec_invalid"; }
    else if ("region" in a) {
      const r = a.region;
      if (!numIn(r.x, -1e6, 1e6) || !numIn(r.y, -1e6, 1e6) || !numIn(r.width, 1, 16384) || !numIn(r.height, 1, 16384)) return "note_spec_invalid";
    } else return "note_spec_invalid";
  }
  return null;
}

export function arrowSpecError(spec: ArrowSpec): StoryboardError | null {
  if (!Array.isArray(spec.points) || spec.points.length < 2 || spec.points.length > 64) return "arrow_spec_invalid";
  for (const p of spec.points) if (!numIn(p.x, -1e6, 1e6) || !numIn(p.y, -1e6, 1e6)) return "arrow_spec_invalid";
  if (spec.form !== "straight" && spec.form !== "curved") return "arrow_spec_invalid";
  if (!numIn(spec.thickness, 1, 64)) return "arrow_spec_invalid";
  if (!HEX.test(spec.color)) return "arrow_spec_invalid";
  if (!["character", "camera", "object", "gaze", "attention"].includes(spec.category)) return "arrow_spec_invalid";
  return null;
}

export function cameraMarkError(spec: CameraMarkSpec): StoryboardError | null {
  const f = spec.frame;
  if (!numIn(f.x, -1e6, 1e6) || !numIn(f.y, -1e6, 1e6) || !numIn(f.width, 1, 16384) || !numIn(f.height, 1, 16384)) return "camera_mark_spec_invalid";
  if (!numIn(spec.zoom, 0.01, 100)) return "camera_mark_spec_invalid";
  if (!numIn(spec.pan.x, -1e6, 1e6) || !numIn(spec.pan.y, -1e6, 1e6)) return "camera_mark_spec_invalid";
  if (!numIn(spec.tilt, -360, 360)) return "camera_mark_spec_invalid";
  return null;
}

/** Lagtypen må samsvare med komposisjonstypen: note/arrow/camera_mark bare i storyboard. */
export function layerKindInCompositionError(kind: LayerKind, compKind: CompositionKind): StoryboardError | null {
  if (isStoryboardLayerKind(kind) && compKind !== "storyboard") return "storyboard_kind_only";
  return null;
}

/** Nøyaktig ett mål (forekomst eller panel), og gyldig status. */
export function productionStatusError(
  area: ProductionArea,
  occurrenceId: OccurrenceId | null,
  compositionId: CompositionId | null,
  status: ProductionStatusValue,
): StoryboardError | null {
  if (!(PRODUCTION_AREAS as readonly string[]).includes(area)) return "status_invalid";
  if (!(PRODUCTION_STATUSES as readonly string[]).includes(status)) return "status_invalid";
  if ((occurrenceId === null) === (compositionId === null)) return "status_target_invalid";
  return null;
}

// ---------- Oppslag ----------

/** Panelene i en sceneforekomst, i panelrekkefølge. */
export function storyboardPanelsOf(s: ProjectState, occurrenceId: OccurrenceId): Composition[] {
  return Object.values(s.compositions)
    .filter((c) => !c.removed && c.kind === "storyboard" && c.occurrenceId === occurrenceId)
    .sort((a, b) => (a.orderKey ?? "").localeCompare(b.orderKey ?? "") || a.id.localeCompare(b.id));
}

/** Blokkene et panel er forankret i, i leserrekkefølge. */
export function panelBlockIds(s: ProjectState, panelId: CompositionId): BlockId[] {
  return Object.values(s.panelBlocks)
    .filter((l) => !l.removed && l.panelId === panelId)
    .sort((a, b) => a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id))
    .map((l) => l.blockId);
}

/** Panelets varighet i bilder: egen timing, ellers arvet fra scenens 2D-scene (SB-2 utvider arven). */
export function panelTimingFrames(s: ProjectState, panel: Composition): number {
  if (panel.durationFrames > 0) return panel.durationFrames;
  const sceneComp = Object.values(s.compositions).find(
    (c) => !c.removed && (c.kind ?? "scene") === "scene" && c.variantId === panel.variantId,
  );
  return sceneComp?.durationFrames ?? 0;
}

/** Gjeldende status for ett fagområde på ett mål, eller undefined (aldri satt). */
export function productionStatusOf(
  s: ProjectState,
  area: ProductionArea,
  target: { readonly occurrenceId: OccurrenceId } | { readonly compositionId: CompositionId },
): ProductionStatusRow | undefined {
  return Object.values(s.productionStatuses).find(
    (p) =>
      !p.removed &&
      p.area === area &&
      ("occurrenceId" in target ? p.occurrenceId === target.occurrenceId : p.compositionId === target.compositionId),
  );
}

/** Historikken for ett fagområde på ett mål, eldst først. */
export function productionStatusHistoryOf(
  s: ProjectState,
  area: ProductionArea,
  target: { readonly occurrenceId: OccurrenceId } | { readonly compositionId: CompositionId },
): ProductionStatusEvent[] {
  return Object.values(s.productionStatusEvents)
    .filter(
      (e) =>
        !e.removed &&
        e.area === area &&
        ("occurrenceId" in target ? e.occurrenceId === target.occurrenceId : e.compositionId === target.compositionId),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Øyeblikksbildet som bevares før et godkjent panel redigeres. */
export function panelSnapshotContentOf(s: ProjectState, panelId: CompositionId): PanelSnapshotContent | null {
  const comp = s.compositions[panelId];
  if (!comp || comp.kind !== "storyboard") return null;
  const { removed: _c, ...composition } = comp;
  const layers = Object.values(s.layers)
    .filter((l) => !l.removed && l.compositionId === panelId)
    .sort((a, b) => a.orderKey.localeCompare(b.orderKey))
    .map(({ removed: _l, ...l }) => l);
  return { composition, layers, blockIds: panelBlockIds(s, panelId) };
}

/**
 * Forslag når storyboardet åpnes første gang (SB-1): ett tomt panel per aktiv forekomst som ikke har
 * paneler fra før. Ingenting opprettes før brukeren bekrefter – planen brukes av kommandoen.
 */
export interface StoryboardSeedPlan {
  readonly occurrenceId: OccurrenceId;
  readonly variantId: VariantId;
}

export function planStoryboardSeed(s: ProjectState, productionId: string): StoryboardSeedPlan[] {
  return Object.values(s.occurrences)
    .filter((o) => o.active !== false && o.productionId === productionId)
    .sort((a, b) => a.orderKey.localeCompare(b.orderKey))
    .filter((o) => storyboardPanelsOf(s, o.id).length === 0)
    .map((o) => ({ occurrenceId: o.id, variantId: o.variantId }));
}
export * from "./gallery";
