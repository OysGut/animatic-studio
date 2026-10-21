import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  distanceMm, angleDeg, ratio, formatMeasurement, screenToFigureMm, snapToContour,
  markerValue, markerError, measurePointError, measureSetError, createMarkerHistory,
  editMarkers, undoMarkers, redoMarkers, applyMarkerOperation,
  type Marker, type MeasureLine, type MeasureSet,
} from '../../src/core/print/measure';
import type { ContourResult } from '../../src/core/print/contour';
const origin = { x: 0, y: 0 };
const line: MeasureLine = { a: origin, b: { x: 3, y: 4 } };
const point: Marker = { id: 'p', kind: 'point', point: origin };
const paths: ContourResult['paths'] = [{ points: [origin, { x: 10, y: 0 }, { x: 10, y: 10 }], isHole: false, orientation: 'clockwise' }];
describe('målekjerne', () => {
  it('beregner kjente avstander, vinkler og forhold', () => {
    expect(distanceMm(line.a, line.b)).toBe(5);
    const horizontal = { a: origin, b: { x: 1, y: 0 } };
    expect(angleDeg(horizontal, horizontal)).toBe(0);
    expect(angleDeg(horizontal, { a: origin, b: { x: 0, y: 1 } })).toBe(90);
    expect(angleDeg(horizontal, { a: origin, b: { x: -1, y: 0 } })).toBe(180);
    expect(angleDeg(horizontal, line)).toBe(53.1);
    expect(ratio(3, 4)).toEqual({ decimal: .75, percent: 75 });
    expect(ratio(0, 4).decimal).toBe(0);
  });
  it('formaterer mm og tommer', () => {
    expect(formatMeasurement(12.34, 'mm')).toBe('12.3 mm');
    expect(formatMeasurement(25.4, 'in')).toBe('1.00 in');
    expect(formatMeasurement(1, 'in')).toBe('0.04 in');
  });
  it('snapper til nærmeste kant innen toleransen, inkludert lukkekant og hull', () => {
    expect(snapToContour({ x: 5, y: -.5 }, paths, .5)).toEqual({ x: 5, y: 0 });
    expect(snapToContour({ x: 5, y: -1 }, paths, .5)).toEqual({ x: 5, y: -1 });
    const closing = snapToContour({ x: 4, y: 5 }, paths, 1);
    expect(closing.x).toBeCloseTo(4.5, 12); expect(closing.y).toBeCloseTo(4.5, 12);
    expect(snapToContour(origin, [], 1)).toEqual(origin);
    expect(snapToContour({ x: 5, y: -.5 }, [{ ...paths[0]!, isHole: true }], 1)).toEqual({ x: 5, y: 0 });
  });
  it('er zoomuavhengig over 100 tilfeldige zoom/pan-kombinasjoner', () => {
    fc.assert(fc.property(
      fc.double({ min: .05, max: 100, noNaN: true }),
      fc.double({ min: -10000, max: 10000, noNaN: true }),
      fc.double({ min: -10000, max: 10000, noNaN: true }),
      (zoom, x, y) => {
        const pan = { x, y };
        const convert = (p: typeof origin) => screenToFigureMm({ x: p.x*zoom+x, y: p.y*zoom+y }, zoom, pan);
        expect(Math.abs(distanceMm(convert(line.a), convert(line.b))-5)).toBeLessThanOrEqual(1e-9);
        expect(angleDeg({ a: convert(origin), b: convert({ x: 1, y: 0 }) }, { a: convert(origin), b: convert({ x: 0, y: 1 }) })).toBe(90);
      }), { numRuns: 100 });
  });
  it('gir visningsverdier for alle markørvarianter', () => {
    expect(markerValue(point)).toEqual(origin);
    for (const kind of ['distance', 'line'] as const) expect(markerValue({ id: 'd', kind, line })).toBe(5);
    expect(markerValue({ id: 'a', kind: 'angle', lines: [line, line] })).toBe(0);
    expect(markerValue({ id: 'a', kind: 'angle', points: [{ x: 1, y: 0 }, origin, { x: 0, y: 1 }] })).toBe(90);
    expect(markerValue({ id: 'r', kind: 'ratio', distances: [line, line] })).toEqual({ decimal: 1, percent: 100 });
  });
  it('validerer sett, markører og ugyldig geometri', () => {
    const set: MeasureSet = { id: 's', name: 'Mål', layerId: 'l', frame: 0, markers: [point], createdAt: '2026-01-01T00:00:00Z' };
    expect(measureSetError(set)).toBeNull();
    expect(measureSetError({ ...set, markers: [point, point] })).not.toBeNull();
    expect(measureSetError({ ...set, frame: -.5 })).not.toBeNull();
    expect(measureSetError({ ...set, createdAt: 'feil' })).not.toBeNull();
    expect(measurePointError({ x: NaN, y: 0 })).not.toBeNull();
    expect(markerError({ ...point, id: '' })).not.toBeNull();
    expect(() => ratio(1, 0)).toThrow();
    expect(() => angleDeg({ a: origin, b: origin }, line)).toThrow();
    expect(() => screenToFigureMm(origin, 0, origin)).toThrow();
    expect(() => snapToContour(origin, paths, -1)).toThrow();
    expect(() => formatMeasurement(Infinity, 'mm')).toThrow();
  });
  it('angrer og gjentar legg til, flytt og slett med inverser', () => {
    const initial = createMarkerHistory();
    const added = editMarkers(initial, { type: 'add', marker: point });
    const movedPoint: Marker = { ...point, point: { x: 10, y: 20 } };
    const moved = editMarkers(added, { type: 'move', marker: movedPoint });
    const deleted = editMarkers(moved, { type: 'delete', id: 'p' });
    expect(deleted.markers).toEqual([]);
    const u1 = undoMarkers(deleted); expect(u1.markers).toEqual([movedPoint]);
    const u2 = undoMarkers(u1); expect(u2.markers).toEqual([point]);
    const u3 = undoMarkers(u2); expect(u3.markers).toEqual([]);
    expect(redoMarkers(redoMarkers(redoMarkers(u3))).markers).toEqual([]);
    expect(redoMarkers(redoMarkers(u3)).markers).toEqual([movedPoint]);
    expect(editMarkers(u2, { type: 'delete', id: 'p' }).redoStack).toEqual([]);
    expect(initial.markers).toEqual([]); expect(added.markers).toEqual([point]);
    expect(undoMarkers(initial)).toBe(initial); expect(redoMarkers(initial)).toBe(initial);
    const second: Marker = { ...point, id: 'q' };
    const edit = applyMarkerOperation([point, second], { type: 'delete', id: 'p' });
    expect(applyMarkerOperation(edit.markers, edit.inverse).markers).toEqual([point, second]);
    expect(() => editMarkers(added, { type: 'add', marker: point })).toThrow();
    expect(() => editMarkers(initial, { type: 'delete', id: 'missing' })).toThrow();
  });
});
