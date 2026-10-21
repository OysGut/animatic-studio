import { autoMask } from '../../cutout';
import { maskAt } from '../../composition/render';
import type { CompositionLayer } from '../../model';

export interface CoverageGrid { data: Uint8Array; width: number; height: number }
export type ContourSource = 'mask' | 'alpha' | 'suggestion' | 'rectangle' | 'none';
export type ContourLabel = `app-rig.contour-source-${ContourSource}`;
export interface SourceResult { kind: ContourSource; label: ContourLabel; coverage: CoverageGrid | null }
function size(w: number, h: number) {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 0 || h < 0) throw new RangeError('Invalid grid size');
}
export function coverageFromMask(mask: ArrayLike<number>, width: number, height: number): CoverageGrid {
  size(width, height);
  if (mask.length !== width * height) throw new RangeError('Mask length');
  return { data: Uint8Array.from(mask, v => Math.round(Math.max(0, Math.min(255, v)))), width, height };
}
export function coverageFromAlpha(rgba: ArrayLike<number>, width: number, height: number): CoverageGrid {
  size(width, height);
  if (rgba.length !== width * height * 4) throw new RangeError('RGBA length');
  return { data: Uint8Array.from({ length: width * height }, (_, i) => rgba[i * 4 + 3]!), width, height };
}
function multiply(a: CoverageGrid, b: CoverageGrid): CoverageGrid {
  return { ...a, data: a.data.map((v, i) => Math.round(v * b.data[i]! / 255)) };
}
export function suggestCoverage(rgba: ArrayLike<number>, w: number, h: number): CoverageGrid {
  const alpha = coverageFromAlpha(rgba, w, h);
  return multiply(alpha, coverageFromMask(autoMask(rgba, w, h), w, h));
}
/** Klippelag må ha samme pikselkoordinater/størrelse. Alfa kan leveres av kalleren.
 * Scenetransformer, grupper, manglende bilde-alfa og sykliske referanser løses ikke her:
 * ukjent dekning returneres som null, aldri som en oppdiktet figur.
 * Banemasker finnes ikke i LayerMask-modellen (bare rect/ellipse/layer).
 */
export interface CoverageLayer { layer: CompositionLayer; coverage?: CoverageGrid }
export function coverageFromLayerMask(
  layer: CompositionLayer, frame: number, imageW: number, imageH: number,
  layers: readonly CoverageLayer[] = [],
): CoverageGrid | null {
  size(imageW, imageH);
  const seen = new Set<string>();
  const evaluate = (l: CompositionLayer): CoverageGrid | null => {
    if (seen.has(l.id)) return null;
    seen.add(l.id);
    const m = maskAt(l, frame);
    if (!m) return null;
    if (m.kind === 'layer') {
      const target = layers.find(e => e.layer.id === m.layerId);
      if (!target || target.layer.removed || target.layer.kind === 'group') return null;
      const base = target.coverage;
      // Bare egen maske er ikke nok til å vite alfaen til et bildebærende lag.
      if (!base || base.width !== imageW || base.height !== imageH) return null;
      const own = evaluate(target.layer);
      if (target.layer.mask && !own) return null;
      const grid = own ? multiply(base, own) : { ...base, data: base.data.slice() };
      if (m.invert) grid.data = grid.data.map(v => 255 - v);
      return grid;
    }
    const data = new Uint8Array(imageW * imageH);
    for (let y = 0; y < imageH; y++) for (let x = 0; x < imageW; x++) {
      const dx = Math.abs(x + .5 - m.x - m.width / 2);
      const dy = Math.abs(y + .5 - m.y - m.height / 2);
      const distance = m.kind === 'rect'
        ? Math.min(m.width / 2 - dx, m.height / 2 - dy)
        : (1 - Math.hypot(dx / (m.width / 2 || 1e-12), dy / (m.height / 2 || 1e-12))) * Math.min(m.width, m.height) / 2;
      let v = m.width <= 0 || m.height <= 0 ? 0 : m.feather > 0
        ? Math.max(0, Math.min(1, .5 + distance / m.feather)) : +(distance >= 0);
      if (m.invert) v = 1 - v;
      data[y * imageW + x] = Math.round(v * 255);
    }
    return { data, width: imageW, height: imageH };
  };
  return evaluate(layer);
}
export interface SourceOptions {
  rgba?: ArrayLike<number>; width: number; height: number;
  layer?: CompositionLayer; frame?: number; layers?: readonly CoverageLayer[];
  suggestionEnabled?: boolean;
}
export function chooseContourSource(o: SourceOptions): SourceResult {
  const result = (kind: ContourSource, coverage: CoverageGrid | null): SourceResult => ({ kind, label: `app-rig.contour-source-${kind}`, coverage });
  if (!o.rgba || !o.width || !o.height) return result('none', null);
  const alpha = coverageFromAlpha(o.rgba, o.width, o.height);
  const mask = o.layer && coverageFromLayerMask(o.layer, o.frame ?? 0, o.width, o.height, o.layers);
  if (mask) return result('mask', multiply(mask, alpha));
  if (alpha.data.some(v => v < 255)) return result('alpha', alpha);
  if (o.suggestionEnabled !== false) return result('suggestion', suggestCoverage(o.rgba, o.width, o.height));
  return result('rectangle', alpha);
}
export interface Point { x: number; y: number }
export interface ContourPath { points: Point[]; isHole: boolean; orientation: 'clockwise' | 'counterclockwise' }
export interface ContourOptions {
  mmPerPixel: number; toleranceMm?: number; strokeWidthMm?: number; cutHoles?: boolean; source?: ContourSource;
}
export interface ContourResult { source: ContourSource; paths: ContourPath[]; widthMm: number; heightMm: number; pointCount: number }
function area(p: Point[]) { let a = 0; for (let i = 1; i < p.length; i++) a += p[i-1]!.x * p[i]!.y - p[i]!.x * p[i-1]!.y; return a / 2; }
function inside(p: Point, ring: Point[]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) hit = !hit;
  }
  return hit;
}
function rdp(p: Point[], tolerance: number): Point[] {
  const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1;
  const stack = [[0, p.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!; const u = p[a!]!, v = p[b!]!;
    const dx = v.x-u.x, dy = v.y-u.y, len = dx*dx+dy*dy;
    let best = tolerance*tolerance, index = -1;
    for (let i = a!+1; i < b!; i++) {
      const q = p[i]!, t = len ? Math.max(0, Math.min(1, ((q.x-u.x)*dx+(q.y-u.y)*dy)/len)) : 0;
      const d = (q.x-u.x-t*dx)**2+(q.y-u.y-t*dy)**2;
      if (d > best) { best = d; index = i; }
    }
    if (index >= 0) { keep[index] = 1; stack.push([a!, index], [index, b!]); }
  }
  return p.filter((_, i) => keep[i]);
}
/** Samples at pixel centres, zero padding outside the image; 50% = 127.5.
 * Positive signed area is clockwise in image coordinates (y down).
 * mmPerPixel comes from the rig's physicalLayerSizeMm / image dimensions;
 * camera magnification/plateDistanceMm must not be applied a second time.
 * Stroke width is presentation-only and never expands measured geometry.
 */
export function computeContour(grid: CoverageGrid, opts: ContourOptions): ContourResult {
  const { width: w, height: h, data } = grid;
  size(w, h);
  if (data.length !== w*h || !Number.isFinite(opts.mmPerPixel) || opts.mmPerPixel <= 0) throw new RangeError('Invalid contour input');
  const points = new Map<number, Point>(), links = new Map<number, number[]>();
  const stride = w+2;
  const sample = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h ? 0 : data[y*w+x]!;
  const pairs: number[][] = [[],[3,0],[0,1],[3,1],[1,2],[3,2,0,1],[0,2],[3,2],[2,3],[0,2],[0,3,1,2],[1,2],[1,3],[0,1],[3,0],[]];
  for (let y = -1; y < h; y++) for (let x = -1; x < w; x++) {
    const a = sample(x,y), b = sample(x+1,y), c = sample(x+1,y+1), d = sample(x,y+1);
    const code = +(a >= 127.5) | (+ (b >= 127.5)<<1) | (+ (c >= 127.5)<<2) | (+ (d >= 127.5)<<3);
    if (!code || code === 15) continue;
    const ids = [2*((y+1)*stride+x+1), 2*((y+1)*stride+x+2)+1, 2*((y+2)*stride+x+1), 2*((y+1)*stride+x+1)+1];
    const values = [[a,b],[b,c],[d,c],[a,d]];
    const edge = (e: number) => {
      const id = ids[e]!;
      if (!points.has(id)) {
        const [u,v] = values[e]!, t = (127.5-u!)/(v!-u!);
        points.set(id, { x: x+.5+(e===1 ? 1 : e===3 ? 0 : t), y: y+.5+(e===2 ? 1 : e===0 ? 0 : t) });
      }
      return id;
    };
    // Saddle ties keep diagonally touching islands separate, deterministically.
    const table = pairs[code]!;
    for (let i = 0; i < table.length; i+=2) {
      const u = edge(table[i]!), v = edge(table[i+1]!);
      if (!links.has(u)) links.set(u, []); if (!links.has(v)) links.set(v, []);
      links.get(u)!.push(v); links.get(v)!.push(u);
    }
  }
  const rings: Point[][] = [], visited = new Set<number>();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const start of links.keys()) {
    if (visited.has(start)) continue;
    const ring: Point[] = []; let previous = -1, current = start;
    do {
      visited.add(current); const p = points.get(current)!; ring.push(p);
      minX = Math.min(minX,p.x); maxX = Math.max(maxX,p.x); minY = Math.min(minY,p.y); maxY = Math.max(maxY,p.y);
      const next = links.get(current)!.find(n => n !== previous)!;
      previous = current; current = next;
    } while (current !== start);
    ring.push(ring[0]!); rings.push(ring);
  }
  const scale = opts.mmPerPixel, tolerance = Math.max(0, Math.min(.05, opts.toleranceMm ?? .05))/scale;
  const paths: ContourPath[] = [];
  for (const ring of rings) {
    const isHole = rings.filter(other => other !== ring && inside(ring[0]!, other)).length % 2 === 1;
    if (isHole && opts.cutHoles === false) continue;
    // Split the closed ring at a distant vertex so RDP never collapses the closing seam.
    let split = 1;
    for (let i = 2; i < ring.length-1; i++) if (Math.hypot(ring[i]!.x-ring[0]!.x,ring[i]!.y-ring[0]!.y) > Math.hypot(ring[split]!.x-ring[0]!.x,ring[split]!.y-ring[0]!.y)) split=i;
    let simplified = [...rdp(ring.slice(0,split+1),tolerance).slice(0,-1), ...rdp(ring.slice(split),tolerance)];
    if (simplified.length < 4) simplified = ring;
    if ((area(simplified) > 0) === isHole) simplified.reverse();
    paths.push({ points: simplified.map(p => ({ x:p.x*scale, y:p.y*scale })), isHole, orientation: isHole ? 'counterclockwise' : 'clockwise' });
  }
  return { source: opts.source ?? 'mask', paths, widthMm: rings.length ? (maxX-minX)*scale : 0, heightMm: rings.length ? (maxY-minY)*scale : 0, pointCount: paths.reduce((n,p)=>n+p.points.length,0) };
}
