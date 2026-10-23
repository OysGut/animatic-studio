/**
 * Vindusgeometri for manusutforskeren (Øystein 23.10, «stålkontroll»). Rene regler uten React og uten
 * nettleser-API: dra i alle kanter og hjørner, maksimer, fest til halvdel, lagret verdi og panelbredder.
 */

export interface WinRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export interface Viewport {
  readonly w: number;
  readonly h: number;
}
export type WinEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const WIN_EDGES: readonly WinEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
export type WinLayout = "free" | "max" | "left" | "right";
export interface WindowPref {
  readonly rect: WinRect;
  readonly layout: WinLayout;
}
/** Popup-vinduet (eget nettleservindu): ytre størrelse og plass på skjermen. */
export interface PopupPref {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export interface PanesPref {
  readonly hits: number;
  readonly side: number;
}
export interface NotesPref {
  readonly open: boolean;
  readonly marks: boolean;
}

export const WIN_MIN: Viewport = { w: 320, h: 240 };
export const WIN_KEY_STEP = 20;
export const PANE_LIMITS = { hits: { min: 160, max: 520, initial: 256 }, side: { min: 180, max: 480, initial: 224 } } as const;
export const DEFAULT_PANES: PanesPref = { hits: PANE_LIMITS.hits.initial, side: PANE_LIMITS.side.initial };
export const DEFAULT_NOTES: NotesPref = { open: true, marks: true };

const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(Math.max(lo, hi), Math.max(lo, v)));

export function defaultRect(vp: Viewport): WinRect {
  const w = Math.min(560, vp.w);
  const h = Math.min(760, Math.max(WIN_MIN.h, vp.h - 140));
  return clampRect({ x: vp.w - w - 16, y: 76, w, h }, vp);
}

/** Innenfor vinduet: aldri mindre enn minimum (med mindre vinduet er mindre), aldri utenfor kanten. */
export function clampRect(r: WinRect, vp: Viewport): WinRect {
  const w = clamp(r.w, Math.min(WIN_MIN.w, vp.w), vp.w);
  const h = clamp(r.h, Math.min(WIN_MIN.h, vp.h), vp.h);
  return { w, h, x: clamp(r.x, 0, vp.w - w), y: clamp(r.y, 0, vp.h - h) };
}

/** Ny plass når brukeren drar i en kant eller et hjørne; motsatt kant står stille. */
export function resizeRect(start: WinRect, edge: WinEdge, dx: number, dy: number, vp: Viewport): WinRect {
  let { x, y, w, h } = start;
  const minW = Math.min(WIN_MIN.w, vp.w), minH = Math.min(WIN_MIN.h, vp.h);
  if (edge.includes("e")) w = clamp(start.w + dx, minW, vp.w - start.x);
  if (edge.includes("w")) {
    const right = start.x + start.w;
    x = clamp(start.x + dx, 0, right - minW);
    w = right - x;
  }
  if (edge.includes("s")) h = clamp(start.h + dy, minH, vp.h - start.y);
  if (edge.includes("n")) {
    const bottom = start.y + start.h;
    y = clamp(start.y + dy, 0, bottom - minH);
    h = bottom - y;
  }
  return { x, y, w, h };
}

export function moveRect(start: WinRect, dx: number, dy: number, vp: Viewport): WinRect {
  return clampRect({ ...start, x: start.x + dx, y: start.y + dy }, vp);
}

/** Plassen som vises for et oppsett. Fritt oppsett bruker den lagrede plassen innenfor vinduet. */
export function layoutRect(layout: WinLayout, r: WinRect, vp: Viewport): WinRect {
  const half = Math.floor(vp.w / 2);
  if (layout === "max") return { x: 0, y: 0, w: vp.w, h: vp.h };
  if (layout === "left") return { x: 0, y: 0, w: half, h: vp.h };
  if (layout === "right") return { x: vp.w - half, y: 0, w: half, h: vp.h };
  return clampRect(r, vp);
}

/** Dobbeltklikk på tittellinjen: maksimer, eller gjenopprett fra maksimert/festet. */
export function toggleMaximized(layout: WinLayout): WinLayout {
  return layout === "free" ? "max" : "free";
}

/** Piltast på hjørnegrepet; null når tasten ikke endrer størrelsen. */
export function keyResizeRect(r: WinRect, key: string, vp: Viewport): WinRect | null {
  const d = key === "ArrowRight" || key === "ArrowDown" ? WIN_KEY_STEP : key === "ArrowLeft" || key === "ArrowUp" ? -WIN_KEY_STEP : 0;
  if (!d) return null;
  return key === "ArrowLeft" || key === "ArrowRight" ? resizeRect(r, "e", d, 0, vp) : resizeRect(r, "s", 0, d, vp);
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isRect = (v: unknown): v is WinRect => {
  const r = v as Record<string, unknown> | null;
  return !!r && typeof r === "object" && num(r["x"]) && num(r["y"]) && num(r["w"]) && num(r["h"]) && (r["w"] as number) > 0 && (r["h"] as number) > 0;
};
export function validWindowPref(v: unknown): v is WindowPref {
  const p = v as Record<string, unknown> | null;
  return !!p && typeof p === "object" && isRect(p["rect"]) && ["free", "max", "left", "right"].includes(p["layout"] as string);
}
export function validPopupPref(v: unknown): v is PopupPref {
  return isRect(v);
}
export function validPanesPref(v: unknown): v is PanesPref {
  const p = v as Record<string, unknown> | null;
  return !!p && typeof p === "object" && num(p["hits"]) && num(p["side"]);
}
export function validNotesPref(v: unknown): v is NotesPref {
  const p = v as Record<string, unknown> | null;
  return !!p && typeof p === "object" && typeof p["open"] === "boolean" && typeof p["marks"] === "boolean";
}

export function clampPane(which: keyof PanesPref, value: number): number {
  const l = PANE_LIMITS[which];
  return clamp(value, l.min, l.max);
}

/** window.open-egenskaper for popup-vinduet: lagret plass, ellers standard. */
export function popupFeatures(saved: PopupPref | null, fallback: { w: number; h: number }): string {
  const p = saved ?? { ...fallback, x: NaN, y: NaN };
  const parts = ["popup", `width=${Math.max(WIN_MIN.w, Math.round(p.w))}`, `height=${Math.max(WIN_MIN.h, Math.round(p.h))}`];
  if (num(p.x) && num(p.y)) parts.push(`left=${Math.round(p.x)}`, `top=${Math.round(p.y)}`);
  return parts.join(",");
}

export const PREF_KEYS = {
  window: "script-explorer.window",
  popup: "script-explorer.popup",
  panes: "script-explorer.panes",
  notes: "script-explorer.notes",
} as const;
