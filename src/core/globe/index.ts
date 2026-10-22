/**
 * B-117: ren matematikk for globusen ved innloggingen – oppsett, ortografisk projeksjon, puls,
 * stabil forskyvning og dra-fysikk. Ingen nettleser-API-er (plattformnøytral kjerne).
 */

export interface GlobeLayout {
  readonly R: number;
  readonly CX: number;
  readonly CY: number;
}

/** Sentrum nede til høyre, nesten utenfor skjermen; bare øvre venstre kvadrant synes. */
export function globeLayout(W: number, H: number): GlobeLayout {
  const R = Math.min(W * 0.62, H * 0.95);
  return { R, CX: W - R * 0.04, CY: H + R * 0.02 };
}

export const DEG = Math.PI / 180;
/** Startvisning: Europa i synlig del. */
export const START_YAW = -62 * DEG;
export const START_PITCH = 18 * DEG;
export const PITCH_LIMIT = 1.2;

export interface Projected {
  /** Enhetskoordinater: x mot høyre, y opp, z mot betrakteren (z > 0 = forsiden). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Ortografisk projeksjon av (lat, lon) i grader med rotasjon yaw (om polaksen) og pitch (om x-aksen). */
export function project(latDeg: number, lonDeg: number, yaw: number, pitch: number): Projected {
  const phi = latDeg * DEG;
  const lam = lonDeg * DEG + yaw;
  const cp = Math.cos(phi);
  const x = cp * Math.sin(lam);
  const y0 = Math.sin(phi);
  const z0 = cp * Math.cos(lam);
  const cs = Math.cos(pitch), sn = Math.sin(pitch);
  return { x, y: y0 * cs - z0 * sn, z: y0 * sn + z0 * cs };
}

export function toScreen(p: Projected, l: GlobeLayout): { sx: number; sy: number } {
  return { sx: l.CX + l.R * p.x, sy: l.CY - l.R * p.y };
}

/** Svakere mot kanten av globusen. */
export const edgeFade = (z: number): number => Math.max(0, Math.min(1, z * 3));

// ---------- Stabil forskyvning (samme formel som public.globe_points i 0085) ----------
export const EARTH_KM = 6371;

/** Forskyver et punkt 2–12 km i en stabil retning. u1, u2 i [0, 1) kommer fra en hash per bruker. */
export function offsetPoint(lat: number, lon: number, u1: number, u2: number): { lat: number; lon: number; km: number } {
  const km = 2 + 10 * u1;
  const d = km / EARTH_KM;
  const b = 2 * Math.PI * u2;
  const nlat = Math.max(-89.9, Math.min(89.9, lat + (d * Math.cos(b)) / DEG));
  let nlon = lon + (d * Math.sin(b)) / Math.cos(lat * DEG) / DEG;
  if (nlon > 180) nlon -= 360;
  if (nlon < -180) nlon += 360;
  return { lat: nlat, lon: nlon, km };
}

/** Avstand i km langs storsirkelen. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a.lat) * DEG, dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---------- Puls ----------
/** Deterministisk tilfeldig tall i [0, 1) (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash av et punkt til et frø (stabil per prikk). */
export function pointSeed(lat: number, lon: number, i = 0): number {
  let h = 2166136261 ^ i;
  for (const v of [Math.round(lat * 1e4), Math.round(lon * 1e4)]) {
    h = Math.imul(h ^ (v & 0xffff), 16777619);
    h = Math.imul(h ^ (v >>> 16), 16777619);
  }
  return h >>> 0;
}

export interface PulseParams {
  readonly period: number;
  readonly phase0: number;
  readonly w: number;
  readonly A: number;
  readonly p: number;
}

/** Aktive 4,2–8,7 s, sovende 12–24 s; w 0,03–0,10; A 0,25–0,55. */
export function pulseParams(seed: number, active: boolean): PulseParams {
  const r = seededRandom(seed);
  const period = active ? 4.2 + r() * 4.5 : 12 + r() * 12;
  return { period, phase0: r() * 2 * Math.PI, w: 0.03 + r() * 0.07, A: 0.25 + r() * 0.3, p: r() * 2 * Math.PI };
}

/** phase = (t − (A/w)·cos(w·t + p)) / periode · 2π + fase0 (t i sekunder). */
export function pulsePhase(t: number, q: PulseParams): number {
  return ((t - (q.A / q.w) * Math.cos(q.w * t + q.p)) / q.period) * 2 * Math.PI + q.phase0;
}

/** 0..1 fra fasen. */
export const pulseLevel = (phase: number): number => 0.5 + 0.5 * Math.sin(phase);

export interface DotStyle {
  readonly coreRadius: number;
  readonly coreAlpha: number;
  readonly glowRadius: number;
  readonly glowAlpha: number;
}

/** Utseende for én prikk ved pulsnivå k (0..1) og kantfaktor edge (0..1). */
export function dotStyle(active: boolean, k: number, edge: number): DotStyle {
  if (active) {
    return { coreRadius: 2.4, coreAlpha: (0.6 + 0.4 * k) * edge, glowRadius: 12 + 12 * k, glowAlpha: (0.2 + 0.3 * k) * edge };
  }
  return { coreRadius: 1.7, coreAlpha: (0.04 + 0.2 * k) * edge, glowRadius: 5 + 4 * k, glowAlpha: (0.02 + 0.07 * k) * edge };
}

// ---------- Dra-fysikk ----------
export interface ViewState {
  yaw: number;
  pitch: number;
  tYaw: number;
  tPitch: number;
  vYaw: number;
  vPitch: number;
  dragging: boolean;
  /** Tid (ms) for siste berøring; selvrotasjon starter 3 s etter. */
  lastTouch: number;
  /** Myk inn for selvrotasjon, 0..1. */
  spin: number;
}

export const FOLLOW = 0.07;
export const DAMPING = 0.975;
export const IDLE_MS = 3000;
export const SPIN_RAD_PER_S = 0.012;
export const STILL_MS = 120;

export function initialView(now = 0): ViewState {
  return { yaw: START_YAW, pitch: START_PITCH, tYaw: START_YAW, tPitch: START_PITCH, vYaw: 0, vPitch: 0, dragging: false, lastTouch: now, spin: 0 };
}

const clampPitch = (p: number) => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));

/** Dra dx, dy css-px: flytter målet og jevner ut hastigheten (0,6/0,4). */
export function dragBy(s: ViewState, dx: number, dy: number, R: number, now: number): void {
  const ddy = dx / R, ddp = dy / R;
  s.tYaw += ddy;
  s.tPitch = clampPitch(s.tPitch + ddp);
  s.vYaw = 0.6 * s.vYaw + 0.4 * ddy;
  s.vPitch = 0.6 * s.vPitch + 0.4 * ddp;
  s.lastTouch = now;
  s.spin = 0;
}

/** Slipp: ingen fart hvis pekeren sto stille over 120 ms. */
export function release(s: ViewState, lastMove: number, now: number): void {
  s.dragging = false;
  if (now - lastMove > STILL_MS) { s.vYaw = 0; s.vPitch = 0; }
  s.lastTouch = now;
}

/** Ett bilde. dt i sekunder; motion = false betyr redusert bevegelse (ingen selvrotasjon). */
export function stepView(s: ViewState, now: number, dt: number, motion = true): void {
  if (!s.dragging) {
    s.tYaw += s.vYaw;
    s.tPitch = clampPitch(s.tPitch + s.vPitch);
    s.vYaw *= DAMPING;
    s.vPitch *= DAMPING;
    if (Math.abs(s.vYaw) < 1e-6) s.vYaw = 0;
    if (Math.abs(s.vPitch) < 1e-6) s.vPitch = 0;
    if (motion && now - s.lastTouch > IDLE_MS) {
      s.spin = Math.min(1, s.spin + dt / 2);
      s.tYaw += SPIN_RAD_PER_S * dt * s.spin;
    }
  }
  s.yaw += (s.tYaw - s.yaw) * FOLLOW;
  s.pitch += (s.tPitch - s.pitch) * FOLLOW;
}
