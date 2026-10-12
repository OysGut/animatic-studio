/**
 * Et lite programvarelerret for tester i Node (ende-til-ende-kontrollen, REQ-0004). Node og jsdom har ikke
 * Canvas 2D, og prosjektet har ikke pakken «canvas». Lerretet her tegner det kompositoren faktisk bruker for
 * fargeflater, bilder og overganger – fillRect og drawImage med vilkårlig affin transformasjon,
 * gjennomsiktighet (globalAlpha), «source-over», klipping til rektangel og hjelpelerreter – i ekte piksler,
 * slik at testen kan lese av fargene i bildet. Tekst tegnes ikke; den logges (tittelkort og undertekster).
 *
 * Andre blandingsmoduser enn «source-over» og «copy» tegnes ikke riktig; de logges i `unsupported`, og
 * testen kontrollerer at listen er tom (ellers ville resultatet vært misvisende).
 */

export type Rgba = readonly [number, number, number, number];
type M = [number, number, number, number, number, number];

const IDENT: M = [1, 0, 0, 1, 0, 0];

/** CSS-farge → RGBA (0–255, alfa 0–1). Godtar #rgb, #rrggbb, #rrggbbaa, rgb() og rgba(). */
export function parseColor(css: string): Rgba {
  const c = css.trim().toLowerCase();
  if (c.startsWith("#")) {
    const h = c.slice(1);
    const full =
      h.length === 3 || h.length === 4
        ? h
            .split("")
            .map((x) => x + x)
            .join("")
        : h;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), full.length >= 8 ? n(6) / 255 : 1];
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) {
    const p = m[1]!.split(",").map((x) => parseFloat(x));
    return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
  }
  if (c === "white") return [255, 255, 255, 1];
  if (c === "black") return [0, 0, 0, 1];
  return [128, 128, 128, 1];
}

function mul(a: M, b: M): M {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function inv(m: M): M | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return null;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

const apply = (m: M, x: number, y: number) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/** Et ensfarget «bilde» (står for en dekodet bildefil fra ressursbiblioteket). */
export class SoftImage {
  constructor(
    readonly width: number,
    readonly height: number,
    readonly color: string,
  ) {}
}

interface DrawState {
  m: M;
  globalAlpha: number;
  fillStyle: string;
  globalCompositeOperation: string;
  clip: [number, number, number, number] | null;
}

/** Lerretet: RGBA-piksler (0–255, ikke forhåndsmultiplisert). */
export class SoftCanvas {
  data: Float32Array;
  private ctx: SoftContext | null = null;
  constructor(
    private w: number,
    private h: number,
  ) {
    this.data = new Float32Array(w * h * 4);
  }
  get width() {
    return this.w;
  }
  set width(v: number) {
    this.w = v;
    this.data = new Float32Array(this.w * this.h * 4);
  }
  get height() {
    return this.h;
  }
  set height(v: number) {
    this.h = v;
    this.data = new Float32Array(this.w * this.h * 4);
  }
  getContext(): SoftContext {
    return (this.ctx ??= new SoftContext(this));
  }
  /** Fargen i pikselen (x, y), avrundet. */
  pixel(x: number, y: number): Rgba {
    const i = (Math.floor(y) * this.w + Math.floor(x)) * 4;
    const d = this.data;
    return [Math.round(d[i]!), Math.round(d[i + 1]!), Math.round(d[i + 2]!), d[i + 3]! / 255];
  }
  /** Antall ulike farger i bildet (grovt mål på at det er innhold). */
  distinctColors(): number {
    const set = new Set<string>();
    for (let i = 0; i < this.data.length; i += 4)
      set.add(
        `${Math.round(this.data[i]!)},${Math.round(this.data[i + 1]!)},${Math.round(this.data[i + 2]!)}`,
      );
    return set.size;
  }
}

/** Logg som deles av alle lerreter i en test: tekst som er «tegnet» og blandingsmoduser som ikke støttes. */
export const softLog = { texts: [] as string[], unsupported: [] as string[] };

export function resetSoftLog(): void {
  softLog.texts.length = 0;
  softLog.unsupported.length = 0;
}

type Source = SoftImage | SoftCanvas;

export class SoftContext {
  private st: DrawState = {
    m: [...IDENT],
    globalAlpha: 1,
    fillStyle: "#000",
    globalCompositeOperation: "source-over",
    clip: null,
  };
  private stack: DrawState[] = [];
  private path: [number, number, number, number][] = [];
  // Egenskaper kompositoren setter, men som ikke påvirker pikslene her
  strokeStyle = "#000";
  lineWidth = 1;
  lineJoin = "miter";
  font = "10px sans-serif";
  textAlign = "start";
  textBaseline = "alphabetic";
  shadowColor = "transparent";
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;

  constructor(readonly canvas: SoftCanvas) {}

  get fillStyle() {
    return this.st.fillStyle;
  }
  set fillStyle(v: string) {
    this.st.fillStyle = v;
  }
  get globalAlpha() {
    return this.st.globalAlpha;
  }
  set globalAlpha(v: number) {
    this.st.globalAlpha = v;
  }
  get globalCompositeOperation() {
    return this.st.globalCompositeOperation;
  }
  set globalCompositeOperation(v: string) {
    this.st.globalCompositeOperation = v;
  }

  save() {
    this.stack.push({ ...this.st, m: [...this.st.m] as M });
  }
  restore() {
    const s = this.stack.pop();
    if (s) this.st = s;
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.st.m = [a, b, c, d, e, f];
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.st.m = mul(this.st.m, [a, b, c, d, e, f]);
  }
  beginPath() {
    this.path = [];
  }
  /** Rektangel i banen, som omsluttende rektangel i lerretets piksler. */
  rect(x: number, y: number, w: number, h: number) {
    this.path.push(this.bbox(x, y, w, h));
  }
  arc(x: number, y: number, r: number) {
    this.path.push(this.bbox(x - r, y - r, 2 * r, 2 * r));
  }
  ellipse(x: number, y: number, rx: number, ry: number) {
    this.path.push(this.bbox(x - rx, y - ry, 2 * rx, 2 * ry));
  }
  clip() {
    if (!this.path.length) return;
    let r = this.path[0]!;
    for (const p of this.path.slice(1))
      r = [Math.min(r[0], p[0]), Math.min(r[1], p[1]), Math.max(r[2], p[2]), Math.max(r[3], p[3])];
    const c = this.st.clip;
    this.st.clip = c
      ? [Math.max(c[0], r[0]), Math.max(c[1], r[1]), Math.min(c[2], r[2]), Math.min(c[3], r[3])]
      : r;
  }
  fill() {}
  stroke() {}
  strokeRect() {}
  setLineDash() {}
  fillText(text: string) {
    softLog.texts.push(text);
  }
  strokeText() {}
  measureText(text: string) {
    return { width: text.length * 6 };
  }

  clearRect(x: number, y: number, w: number, h: number) {
    this.paint(x, y, w, h, () => [0, 0, 0, 0], "copy", 1);
  }
  fillRect(x: number, y: number, w: number, h: number) {
    const c = parseColor(this.st.fillStyle);
    this.paint(x, y, w, h, () => c, this.st.globalCompositeOperation, this.st.globalAlpha);
  }
  drawImage(img: Source, ...a: number[]) {
    const [dx, dy, dw, dh] = a.length >= 4 ? a : [a[0]!, a[1]!, img.width, img.height];
    if (img instanceof SoftImage) {
      const c = parseColor(img.color);
      this.paint(
        dx!,
        dy!,
        dw!,
        dh!,
        () => c,
        this.st.globalCompositeOperation,
        this.st.globalAlpha,
      );
      return;
    }
    const sx = img.width / dw!;
    const sy = img.height / dh!;
    this.paint(
      dx!,
      dy!,
      dw!,
      dh!,
      (u, v) =>
        img.pixel(
          Math.min(img.width - 1, (u - dx!) * sx),
          Math.min(img.height - 1, (v - dy!) * sy),
        ),
      this.st.globalCompositeOperation,
      this.st.globalAlpha,
    );
  }

  private bbox(x: number, y: number, w: number, h: number): [number, number, number, number] {
    const pts = [
      apply(this.st.m, x, y),
      apply(this.st.m, x + w, y),
      apply(this.st.m, x, y + h),
      apply(this.st.m, x + w, y + h),
    ];
    const xs = pts.map((p) => p[0]!);
    const ys = pts.map((p) => p[1]!);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  /** Fyller rektangelet (x, y, w, h) i gjeldende koordinater; `color(u, v)` gir fargen i det punktet. */
  private paint(
    x: number,
    y: number,
    w: number,
    h: number,
    color: (u: number, v: number) => Rgba,
    op: string,
    alpha: number,
  ) {
    if (op !== "source-over" && op !== "copy") {
      softLog.unsupported.push(op);
      return;
    }
    const im = inv(this.st.m);
    if (!im || w <= 0 || h <= 0) return;
    let [x0, y0, x1, y1] = this.bbox(x, y, w, h);
    const c = this.st.clip;
    if (c) {
      x0 = Math.max(x0, c[0]);
      y0 = Math.max(y0, c[1]);
      x1 = Math.min(x1, c[2]);
      y1 = Math.min(y1, c[3]);
    }
    const W = this.canvas.width;
    const H = this.canvas.height;
    const d = this.canvas.data;
    for (let py = Math.max(0, Math.floor(y0)); py < Math.min(H, Math.ceil(y1)); py++)
      for (let px = Math.max(0, Math.floor(x0)); px < Math.min(W, Math.ceil(x1)); px++) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        if (c && (cx < c[0] || cx > c[2] || cy < c[1] || cy > c[3])) continue;
        const [u, v] = apply(im, cx, cy) as [number, number];
        if (u < x || u >= x + w || v < y || v >= y + h) continue;
        const src = color(u, v);
        const i = (py * W + px) * 4;
        if (op === "copy") {
          d[i] = src[0];
          d[i + 1] = src[1];
          d[i + 2] = src[2];
          d[i + 3] = src[3] * 255;
          continue;
        }
        const sa = src[3] * alpha;
        const da = d[i + 3]! / 255;
        const oa = sa + da * (1 - sa);
        for (let k = 0; k < 3; k++)
          d[i + k] = oa > 0 ? (src[k]! * sa + d[i + k]! * da * (1 - sa)) / oa : 0;
        d[i + 3] = oa * 255;
      }
  }
}

/** OffscreenCanvas-erstatning (kompositoren lager hjelpelerreter for overganger med `new OffscreenCanvas`). */
export class SoftOffscreenCanvas extends SoftCanvas {}
