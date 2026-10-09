/**
 * Prosjektets bildeformat og bildefrekvens (DEC-0039): alle 2D-scener følger prosjektet.
 * Når formatet eller frekvensen endres, tilpasses alle 2D-scener: plassering skaleres slik at høyden i
 * bildet beholdes og midten står fast (ved nytt sideforhold blir det mer eller mindre plass på sidene),
 * og tider (nøkkelbilder, kamerautsnitt, varighet) regnes om til den nye frekvensen.
 */
import type { CameraFrame, Composition, CompositionLayer, Keyframe } from "../model";
import type { Rational } from "../time";

/** Vanlige bildefrekvenser (mandat 6.4, ADR-0006). */
export const FRAME_RATES: readonly { readonly label: string; readonly fps: Rational }[] = [
  { label: "23,976", fps: { num: 24000, den: 1001 } },
  { label: "24", fps: { num: 24, den: 1 } },
  { label: "25", fps: { num: 25, den: 1 } },
  { label: "29,97", fps: { num: 30000, den: 1001 } },
  { label: "30", fps: { num: 30, den: 1 } },
  { label: "48", fps: { num: 48, den: 1 } },
  { label: "50", fps: { num: 50, den: 1 } },
  { label: "60", fps: { num: 60, den: 1 } },
];

export interface ProjectFormat {
  readonly width: number;
  readonly height: number;
  readonly fps: Rational;
}

export function sameFps(a: Rational, b: Rational): boolean {
  return a.num * b.den === b.num * a.den;
}

export function isAllowedFps(fps: Rational): boolean {
  return FRAME_RATES.some((r) => r.fps.num === fps.num && r.fps.den === fps.den);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Omregning av plassering og tid fra ett format til et annet. */
export function formatMapping(from: ProjectFormat, to: ProjectFormat) {
  const k = to.height / from.height;
  const dx = to.width / 2 - (from.width / 2) * k;
  const r = (to.fps.num * from.fps.den) / (to.fps.den * from.fps.num);
  return {
    k,
    x: (x: number) => round1(x * k + dx),
    y: (y: number) => round1(y * k),
    scale: (s: number) => round3(s * k),
    frame: (f: number) => Math.max(0, Math.round(f * r)),
    size: (n: number) => Math.min(16384, Math.max(1, Math.round(n * k))),
  };
}

type Mapping = ReturnType<typeof formatMapping>;

function mapCamera(m: Mapping, f: CameraFrame): CameraFrame {
  return { ...f, x: m.x(f.x), y: m.y(f.y) };
}

/** 2D-scenen tilpasset nytt format. */
export function rescaleComposition(c: Composition, m: Mapping, to: ProjectFormat): Composition {
  return {
    ...c,
    width: to.width,
    height: to.height,
    durationFrames: c.durationFrames > 0 ? Math.max(1, m.frame(c.durationFrames)) : 0,
    camera: {
      shots: c.camera.shots.map((sh) => {
        const start = m.frame(sh.startFrame);
        return {
          ...sh,
          startFrame: start,
          endFrame: Math.max(start, m.frame(sh.endFrame)),
          from: mapCamera(m, sh.from),
          to: mapCamera(m, sh.to),
          curve: sh.curve
            ? {
                c1x: m.x(sh.curve.c1x),
                c1y: m.y(sh.curve.c1y),
                c2x: m.x(sh.curve.c2x),
                c2y: m.y(sh.curve.c2y),
              }
            : null,
        };
      }),
    },
  };
}

function mapKeyframe(m: Mapping, k: Keyframe): Keyframe {
  const v =
    k.property === "x"
      ? m.x(k.value)
      : k.property === "y"
        ? m.y(k.value)
        : k.property === "scaleX" || k.property === "scaleY"
          ? m.scale(k.value)
          : k.value;
  return { ...k, frame: m.frame(k.frame), value: v };
}

/** Laget tilpasset nytt format. Nøkkelbilder som havner på samme bilde, slås sammen (det siste vinner). */
export function rescaleLayer(l: CompositionLayer, m: Mapping): CompositionLayer {
  const keys = new Map<string, Keyframe>();
  for (const k of l.keyframes) {
    const n = mapKeyframe(m, k);
    keys.set(`${n.property}@${n.frame}`, n);
  }
  return {
    ...l,
    width: l.fill !== null ? m.size(l.width) : l.width,
    height: l.fill !== null ? m.size(l.height) : l.height,
    transform: {
      ...l.transform,
      x: m.x(l.transform.x),
      y: m.y(l.transform.y),
      scaleX: m.scale(l.transform.scaleX),
      scaleY: m.scale(l.transform.scaleY),
    },
    keyframes: [...keys.values()].sort(
      (a, b) => a.property.localeCompare(b.property) || a.frame - b.frame,
    ),
  };
}
