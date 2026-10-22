import { describe, expect, it } from "vitest";
import {
  DEG,
  distanceKm,
  dragBy,
  dotStyle,
  edgeFade,
  globeLayout,
  initialView,
  offsetPoint,
  PITCH_LIMIT,
  project,
  pulseParams,
  pulsePhase,
  release,
  START_PITCH,
  START_YAW,
  stepView,
} from "@/core/globe";
import cities from "@/core/geo/cities.json";

describe("B-117 globus: oppsett og projeksjon", () => {
  it("R, CX og CY følger prototypen", () => {
    expect(globeLayout(1000, 800)).toEqual({ R: 620, CX: 1000 - 620 * 0.04, CY: 800 + 620 * 0.02 });
    expect(globeLayout(2000, 600).R).toBeCloseTo(570);
  });
  it("ortografisk projeksjon gir enhetsvektor; startvisningen viser Europa i øvre venstre kvadrant", () => {
    const p = project(50, 10, START_YAW, START_PITCH);
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(1, 10);
    expect(p.x).toBeLessThan(0);
    expect(p.y).toBeGreaterThan(0);
    expect(p.z).toBeGreaterThan(0);
    expect(project(0, 0, 0, 0)).toEqual({ x: 0, y: 0, z: 1 });
    expect(project(90, 0, 0, 0).y).toBeCloseTo(1);
    // Baksiden
    expect(project(0, 180, 0, 0).z).toBeLessThan(0);
  });
  it("kanten dempes: edge = min(1, z·3)", () => {
    expect(edgeFade(0.1)).toBeCloseTo(0.3);
    expect(edgeFade(0.5)).toBe(1);
    expect(edgeFade(-0.2)).toBe(0);
  });
});

describe("B-117 puls", () => {
  it("perioder og variasjon innen grensene, stabilt per frø", () => {
    for (let s = 1; s < 200; s++) {
      const a = pulseParams(s, true), b = pulseParams(s, false);
      expect(a.period).toBeGreaterThanOrEqual(4.2);
      expect(a.period).toBeLessThanOrEqual(8.7);
      expect(b.period).toBeGreaterThanOrEqual(12);
      expect(b.period).toBeLessThanOrEqual(24);
      expect(a.w).toBeGreaterThanOrEqual(0.03);
      expect(a.w).toBeLessThanOrEqual(0.1);
      expect(a.A).toBeGreaterThanOrEqual(0.25);
      expect(a.A).toBeLessThanOrEqual(0.55);
    }
    expect(pulseParams(42, true)).toEqual(pulseParams(42, true));
    expect(pulseParams(42, true)).not.toEqual(pulseParams(43, true));
  });
  it("fasen følger formelen", () => {
    const q = { period: 6, phase0: 0.3, w: 0.05, A: 0.4, p: 1 };
    const t = 17;
    expect(pulsePhase(t, q)).toBeCloseTo(((t - (0.4 / 0.05) * Math.cos(0.05 * t + 1)) / 6) * 2 * Math.PI + 0.3, 12);
  });
  it("utseende for aktive og sovende prikker", () => {
    expect(dotStyle(true, 0, 1)).toMatchObject({ coreRadius: 2.4, glowRadius: 12, glowAlpha: 0.2 });
    expect(dotStyle(true, 1, 1).glowRadius).toBe(24);
    expect(dotStyle(true, 1, 1).glowAlpha).toBeCloseTo(0.5);
    expect(dotStyle(false, 0, 1)).toMatchObject({ coreRadius: 1.7, coreAlpha: 0.04, glowRadius: 5, glowAlpha: 0.02 });
    expect(dotStyle(false, 1, 1).coreAlpha).toBeCloseTo(0.24);
    expect(dotStyle(false, 1, 1).glowRadius).toBe(9);
    expect(dotStyle(false, 1, 1).glowAlpha).toBeCloseTo(0.09);
  });
});

describe("B-117 stabil forskyvning", () => {
  it("2–12 km, samme inn gir samme ut", () => {
    for (const [u1, u2] of [[0, 0], [0.5, 0.25], [0.999, 0.75], [0.2, 0.9]] as const) {
      const o = offsetPoint(59.91, 10.75, u1, u2);
      const d = distanceKm({ lat: 59.91, lon: 10.75 }, o);
      expect(d).toBeGreaterThan(1.95);
      expect(d).toBeLessThan(12.05);
      expect(d).toBeCloseTo(o.km, 1);
      expect(offsetPoint(59.91, 10.75, u1, u2)).toEqual(o);
    }
  });
  it("lengdegrad brettes rundt datolinjen", () => {
    const o = offsetPoint(0, 179.99, 0.99, 0.25);
    expect(o.lon).toBeLessThan(-179);
  });
});

describe("B-117 dra-fysikk", () => {
  it("dra flytter målet med dx/R, globusen glir med 0,07 og pitch begrenses", () => {
    const s = initialView(0);
    s.dragging = true;
    dragBy(s, 100, 0, 500, 10);
    expect(s.tYaw).toBeCloseTo(START_YAW + 0.2);
    stepView(s, 20, 1 / 60);
    expect(s.yaw).toBeCloseTo(START_YAW + 0.2 * 0.07);
    dragBy(s, 0, 100000, 500, 30);
    expect(s.tPitch).toBe(PITCH_LIMIT);
  });
  it("fart etter slipp dempes; stille over 120 ms gir ingen fart", () => {
    const s = initialView(0);
    s.dragging = true;
    dragBy(s, 50, 0, 500, 100);
    release(s, 100, 150);
    expect(s.vYaw).toBeGreaterThan(0);
    const v = s.vYaw;
    stepView(s, 160, 1 / 60);
    expect(s.vYaw).toBeCloseTo(v * 0.975);
    const q = initialView(0);
    q.dragging = true;
    dragBy(q, 50, 0, 500, 100);
    release(q, 100, 300);
    expect(q.vYaw).toBe(0);
  });
  it("selvrotasjon starter etter 3 s, ikke ved redusert bevegelse", () => {
    const s = initialView(0);
    stepView(s, 2000, 0.5);
    expect(s.tYaw).toBe(START_YAW);
    for (let i = 0; i < 10; i++) stepView(s, 3100 + i * 500, 0.5);
    expect(s.tYaw).toBeGreaterThan(START_YAW);
    const r = initialView(0);
    for (let i = 0; i < 10; i++) stepView(r, 4000 + i * 500, 0.5, false);
    expect(r.tYaw).toBe(START_YAW);
    expect(DEG).toBeCloseTo(Math.PI / 180);
  });
});

describe("B-117 bydata", () => {
  it("hovedstad per land finnes blant byene, høyst 26 byer per land", () => {
    const d = cities as unknown as { cities: Record<string, [number, string, number, number][]>; capitals: Record<string, number> };
    expect(d.capitals["NO"]).toBe(3143244); // Oslo
    for (const [cc, id] of Object.entries(d.capitals)) {
      expect(d.cities[cc]!.some((c) => c[0] === id)).toBe(true);
      expect(d.cities[cc]!.length).toBeLessThanOrEqual(26);
    }
  });
});
