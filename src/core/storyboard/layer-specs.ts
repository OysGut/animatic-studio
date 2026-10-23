/**
 * SB-1 (migrasjon 0102): lagtyper og feltspesifikasjoner som bare er tillatt i
 * storyboardkomposisjoner. Ren logikk uten avhengigheter, slik at både
 * composition/fields (lagvalidering) og storyboard-kommandoene kan bruke dem.
 */
import type { LayerId } from "../ids";

/** Lapp: visuell lapp, reginotat eller kamerainstruksjon. */
export const PANEL_NOTE_KINDS = ["visual", "direction", "camera"] as const;
export type PanelNoteKind = (typeof PANEL_NOTE_KINDS)[number];

export const PANEL_NOTE_MAX_TEXT = 2000;

export interface PanelNoteSpec {
  readonly kind: PanelNoteKind;
  readonly text: string;
  /** Fri farge – ingen fast betydning (hex uten #). */
  readonly color: string;
  /** Størrelse 0–1 relativt til panelet. */
  readonly size: number;
  /** Valgfri forankring til et lag eller et område i panelet. */
  readonly layerId?: LayerId | null;
  readonly area?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
  /** «Behandlet» – notatet er lest og tatt stilling til. */
  readonly resolved: boolean;
}

/** Pil: karakter, kamera, objekt, blikk eller oppmerksomhet. */
export const ARROW_KINDS = ["character", "camera", "object", "gaze", "attention"] as const;
export type ArrowKind = (typeof ARROW_KINDS)[number];

export const ARROW_MAX_POINTS = 200;

export interface ArrowSpec {
  readonly kind: ArrowKind;
  /** Punktene i banen (0–1 relativt til panelet). */
  readonly points: readonly { readonly x: number; readonly y: number }[];
  /** Form: strek, kurve eller hake. */
  readonly shape: "line" | "curve" | "elbow";
  readonly thickness: number;
  /** Hex uten #. */
  readonly color: string;
  /** Valgfri kobling til laget pilen gjelder. */
  readonly layerId?: LayerId | null;
}

export const CAMERA_MARK_MAX_FRAME = 10000;

/** Kameramerke: ramme, zoom, pan og tilt som instruksjon. */
export interface CameraMarkSpec {
  /** Rammen i panelet (0–1 relativt). */
  readonly frame: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly zoom: number;
  readonly pan: number;
  readonly tilt: number;
  readonly color: string;
}

export type StoryboardLayerKind = "note" | "arrow" | "camera_mark";

export function isStoryboardLayerKind(kind: string): kind is StoryboardLayerKind {
  return kind === "note" || kind === "arrow" || kind === "camera_mark";
}

const HEX6 = /^[0-9a-f]{6}$/;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const unit = (n: unknown): n is number => finite(n) && n >= 0 && n <= 1;

function noteError(spec: PanelNoteSpec): string | null {
  if (!PANEL_NOTE_KINDS.includes(spec.kind)) return "note_kind";
  if (typeof spec.text !== "string" || spec.text.length > PANEL_NOTE_MAX_TEXT) return "note_text";
  if (!HEX6.test(spec.color)) return "note_color";
  if (!unit(spec.size)) return "note_size";
  if (spec.layerId !== undefined && spec.layerId !== null && typeof spec.layerId !== "string") return "note_layer";
  if (spec.area !== undefined && spec.area !== null) {
    const a = spec.area;
    if (!unit(a.x) || !unit(a.y) || !unit(a.width) || !unit(a.height) || a.width <= 0 || a.height <= 0) return "note_area";
  }
  if (typeof spec.resolved !== "boolean") return "note_resolved";
  return null;
}
/** null = gyldig. Spec er ukjent data (rad fra databasen eller kommando). */
export function panelNoteError(spec: unknown): string | null {
  if (typeof spec !== "object" || spec === null) return "note_spec";
  return noteError(spec as PanelNoteSpec);
}

function arrowError(spec: ArrowSpec): string | null {
  if (!ARROW_KINDS.includes(spec.kind)) return "arrow_kind";
  if (!Array.isArray(spec.points) || spec.points.length < 2 || spec.points.length > ARROW_MAX_POINTS) return "arrow_points";
  for (const p of spec.points) if (!unit(p.x) || !unit(p.y)) return "arrow_point";
  if (spec.shape !== "line" && spec.shape !== "curve" && spec.shape !== "elbow") return "arrow_shape";
  if (!finite(spec.thickness) || spec.thickness <= 0 || spec.thickness > 100) return "arrow_thickness";
  if (!HEX6.test(spec.color)) return "arrow_color";
  if (spec.layerId !== undefined && spec.layerId !== null && typeof spec.layerId !== "string") return "arrow_layer";
  return null;
}
/** null = gyldig. */
export function arrowSpecError(spec: unknown): string | null {
  if (typeof spec !== "object" || spec === null) return "arrow_spec";
  return arrowError(spec as ArrowSpec);
}

function cameraMarkCheck(spec: CameraMarkSpec): string | null {
  const f = spec.frame;
  if (typeof f !== "object" || f === null) return "camera_frame";
  if (!unit(f.x) || !unit(f.y) || !unit(f.width) || !unit(f.height) || f.width <= 0 || f.height <= 0) return "camera_frame";
  if (!finite(spec.zoom) || spec.zoom <= 0 || spec.zoom > CAMERA_MARK_MAX_FRAME) return "camera_zoom";
  if (!finite(spec.pan) || !finite(spec.tilt)) return "camera_pan_tilt";
  if (!HEX6.test(spec.color)) return "camera_color";
  return null;
}
/** null = gyldig. */
export function cameraMarkError(spec: unknown): string | null {
  if (typeof spec !== "object" || spec === null) return "camera_spec";
  return cameraMarkCheck(spec as CameraMarkSpec);
}
