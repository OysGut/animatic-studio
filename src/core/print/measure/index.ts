import { t } from '../../i18n/keyed';
import type { ContourResult } from '../contour';

/** Alle geometripunkter er i figurens millimeter, aldri skjermpiksler. */
export interface MeasurePoint { readonly x: number; readonly y: number }
export interface MeasureLine { readonly a: MeasurePoint; readonly b: MeasurePoint }
export interface RatioValue { readonly decimal: number; readonly percent: number }
export type Marker = { readonly id: string } & (
  | { readonly kind: 'point'; readonly point: MeasurePoint }
  | { readonly kind: 'distance' | 'line'; readonly line: MeasureLine }
  | { readonly kind: 'angle'; readonly lines: readonly [MeasureLine, MeasureLine] }
  | { readonly kind: 'angle'; readonly points: readonly [MeasurePoint, MeasurePoint, MeasurePoint] }
  | { readonly kind: 'ratio'; readonly distances: readonly [MeasureLine, MeasureLine] }
);
export interface MeasureSet {
  readonly id: string; readonly name: string; readonly layerId: string;
  readonly frame: number; readonly markers: readonly Marker[];
  /** ISO 8601-tidsstempel levert av kalleren. */
  readonly createdAt: string;
}
export type MarkerValue = MeasurePoint | number | RatioValue;
const finite = (n: number) => Number.isFinite(n);
const text = (s: string) => typeof s === 'string' && s.trim().length > 0;
export function measurePointError(p: MeasurePoint): string | null {
  return p && finite(p.x) && finite(p.y) ? null : t('print-measure.error-0');
}
function requirePoint(p: MeasurePoint): void {
  const error = measurePointError(p); if (error) throw new RangeError(error);
}
function requireLine(l: MeasureLine): void {
  if (!l) throw new RangeError(t('print-measure.error-1'));
  requirePoint(l.a); requirePoint(l.b);
}
export function distanceMm(a: MeasurePoint, b: MeasurePoint): number {
  requirePoint(a); requirePoint(b);
  return Math.hypot(b.x - a.x, b.y - a.y);
}
/** Rettede linjer gir 0–180°, avrundet til 0,1°. Nullengdelinjer avvises. */
export function angleDeg(l1: MeasureLine, l2: MeasureLine): number {
  requireLine(l1); requireLine(l2);
  const a = distanceMm(l1.a, l1.b), b = distanceMm(l2.a, l2.b);
  if (!a || !b) throw new RangeError(t('print-measure.error-2'));
  const dot = ((l1.b.x-l1.a.x)/a)*((l2.b.x-l2.a.x)/b)
    + ((l1.b.y-l1.a.y)/a)*((l2.b.y-l2.a.y)/b);
  return Math.round(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI * 10) / 10;
}
export function ratio(d1: number, d2: number): RatioValue {
  if (!finite(d1) || !finite(d2) || d1 < 0 || d2 <= 0 || !finite(d1/d2*100))
    throw new RangeError(t('print-measure.error-3'));
  return { decimal: d1/d2, percent: d1/d2*100 };
}
/** Returnerer enhetsmerket tekst med fast antall desimaler. */
export function formatMeasurement(valueMm: number, unit: 'mm' | 'in'): string {
  if (!finite(valueMm) || (unit !== 'mm' && unit !== 'in')) throw new RangeError(t('print-measure.error-4'));
  return unit === 'mm' ? `${valueMm.toFixed(1)} mm` : `${(valueMm/25.4).toFixed(2)} in`;
}
/** zoom er skjermpiksler per figur-mm; pan er i skjermpiksler.
 * Konverter én gang ved input: målefunksjonene kjenner aldri zoom eller pan. */
export function screenToFigureMm(px: MeasurePoint, zoom: number, pan: MeasurePoint): MeasurePoint {
  requirePoint(px); requirePoint(pan);
  if (!finite(zoom) || zoom <= 0) throw new RangeError(t('print-measure.error-5'));
  return { x: (px.x-pan.x)/zoom, y: (px.y-pan.y)/zoom };
}
/** Nærmeste punkt på polygonkantene (også hull og lukkekanten).
 * Ved lik avstand vinner første kant; uten treff returneres en kopi av input. */
export function snapToContour(point: MeasurePoint, contourPaths: Readonly<ContourResult['paths']>, toleranceMm: number): MeasurePoint {
  requirePoint(point);
  if (!finite(toleranceMm) || toleranceMm < 0) throw new RangeError(t('print-measure.error-6'));
  let best = toleranceMm, result = { ...point }, found = false;
  for (const path of contourPaths) {
    for (const p of path.points) requirePoint(p);
    for (let i = 0; i < path.points.length; i++) {
      const a = path.points[i]!, b = path.points[(i+1)%path.points.length]!;
      const dx = b.x-a.x, dy = b.y-a.y, length = Math.hypot(dx, dy);
      const ux = length ? dx/length : 0, uy = length ? dy/length : 0;
      const t = Math.max(0, Math.min(length, (point.x-a.x)*ux+(point.y-a.y)*uy));
      const candidate = { x: a.x+t*ux, y: a.y+t*uy };
      const d = distanceMm(point, candidate);
      if (d <= best && (!found || d < best)) { best = d; result = candidate; found = true; }
    }
  }
  return result;
}
export function markerValue(marker: Marker): MarkerValue {
  switch (marker.kind) {
    case 'point': requirePoint(marker.point); return { ...marker.point };
    case 'distance': case 'line': requireLine(marker.line); return distanceMm(marker.line.a, marker.line.b);
    case 'angle': {
      const lines = 'lines' in marker ? marker.lines : [
        { a: marker.points[1], b: marker.points[0] },
        { a: marker.points[1], b: marker.points[2] },
      ];
      return angleDeg(lines[0]!, lines[1]!);
    }
    case 'ratio': return ratio(...marker.distances.map(l => { requireLine(l); return distanceMm(l.a, l.b); }) as [number, number]);
    default: throw new RangeError(t('print-measure.error-7'));
  }
}
export function markerError(marker: Marker): string | null {
  if (!marker || !text(marker.id)) return t('print-measure.error-8');
  try { markerValue(marker); return null; } catch { return t('print-measure.error-9'); }
}
export function measureSetError(set: MeasureSet): string | null {
  if (!set || !text(set.id) || !text(set.name) || !text(set.layerId)) return t('print-measure.error-10');
  if (!Number.isInteger(set.frame) || set.frame < 0) return t('print-measure.error-11');
  if (typeof set.createdAt !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(set.createdAt) || !finite(Date.parse(set.createdAt))) return t('print-measure.error-12');
  if (!Array.isArray(set.markers)) return t('print-measure.error-13');
  const ids = new Set<string>();
  for (const m of set.markers) {
    const error = markerError(m); if (error) return error;
    if (ids.has(m.id)) return t('print-measure.error-14'); ids.add(m.id);
  }
  return null;
}

/** move erstatter geometrien med samme ID; støtter flytting av enkeltpunkter og hele markører. */
export type MarkerOperation =
  | { readonly type: 'add'; readonly marker: Marker; readonly index?: number }
  | { readonly type: 'move'; readonly marker: Marker }
  | { readonly type: 'delete'; readonly id: string };
export interface MarkerEdit { readonly markers: readonly Marker[]; readonly inverse: MarkerOperation }
/** Inverser bevarer også rekkefølgen etter sletting. Ingen input muteres. */
export function applyMarkerOperation(markers: readonly Marker[], operation: MarkerOperation): MarkerEdit {
  const next = markers.map(m => structuredClone(m));
  for (const m of next) { const e = markerError(m); if (e) throw new RangeError(e); }
  if (new Set(next.map(m => m.id)).size !== next.length) throw new RangeError(t('print-measure.error-15'));
  if (operation.type === 'add') {
    const error = markerError(operation.marker); if (error) throw new RangeError(error);
    const index = operation.index ?? next.length;
    if (next.some(m => m.id === operation.marker.id) || !Number.isInteger(index) || index < 0 || index > next.length) throw new RangeError(t('print-measure.error-16'));
    next.splice(index, 0, structuredClone(operation.marker));
    return { markers: next, inverse: { type: 'delete', id: operation.marker.id } };
  }
  const id = operation.type === 'delete' ? operation.id : operation.marker.id;
  const index = next.findIndex(m => m.id === id);
  if (index < 0) throw new RangeError(t('print-measure.error-17'));
  const previous = next[index]!;
  if (operation.type === 'delete') {
    next.splice(index, 1);
    return { markers: next, inverse: { type: 'add', marker: previous, index } };
  }
  const error = markerError(operation.marker); if (error) throw new RangeError(error);
  next[index] = structuredClone(operation.marker);
  return { markers: next, inverse: { type: 'move', marker: previous } };
}
export interface MarkerHistory {
  readonly markers: readonly Marker[];
  readonly undoStack: readonly MarkerOperation[];
  readonly redoStack: readonly MarkerOperation[];
}
export function createMarkerHistory(markers: readonly Marker[] = []): MarkerHistory {
  const ids = new Set<string>();
  for (const m of markers) { const e = markerError(m); if (e || ids.has(m.id)) throw new RangeError(e ?? t('print-measure.error-18')); ids.add(m.id); }
  return { markers: structuredClone(markers), undoStack: [], redoStack: [] };
}
export function editMarkers(state: MarkerHistory, operation: MarkerOperation): MarkerHistory {
  const edit = applyMarkerOperation(state.markers, operation);
  return { markers: edit.markers, undoStack: [...state.undoStack, edit.inverse], redoStack: [] };
}
export function undoMarkers(state: MarkerHistory): MarkerHistory {
  const op = state.undoStack.at(-1); if (!op) return state;
  const edit = applyMarkerOperation(state.markers, op);
  return { markers: edit.markers, undoStack: state.undoStack.slice(0,-1), redoStack: [...state.redoStack, edit.inverse] };
}
export function redoMarkers(state: MarkerHistory): MarkerHistory {
  const op = state.redoStack.at(-1); if (!op) return state;
  const edit = applyMarkerOperation(state.markers, op);
  return { markers: edit.markers, undoStack: [...state.undoStack, edit.inverse], redoStack: state.redoStack.slice(0,-1) };
}
