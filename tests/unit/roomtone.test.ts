/**
 * Fase 2, bolk E (DEC-0096, REQ-0708): romlyd i pauser. Syntetiske signaler: svak støy (romlyd) med «ord» (toner)
 * og et klikk. Søket finner stille partier og holder avstand til ord og klikk; lange pauser bygges av flere biter
 * uten at samme bit kommer to ganger på rad; ingen egnet romlyd gir en melding (P6).
 */
import { describe, expect, it } from "vitest";
import {
  buildRoomFill,
  compositionError,
  compositionFromTake,
  fillPauseGaps,
  findRoomTone,
  pauseGaps,
  setPause,
  setPauseFill,
  wholeFileCandidate,
  type AlignmentSource,
  type WordAlignment,
} from "@/core";

const RATE = 16000;
let seed = 42;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff - 0.5;
};

/** 4 s: støy på −50 dBFS, ord (toner) i `words`, et klikk ved `clickMs`. */
function signal(words: [number, number][], clickMs?: number): Float32Array {
  const x = new Float32Array(4 * RATE);
  for (let i = 0; i < x.length; i++) x[i] = rnd() * 0.01;
  for (const [s, e] of words)
    for (let i = (s * RATE) / 1000; i < (e * RATE) / 1000; i++)
      x[i] = x[i]! + 0.3 * Math.sin((2 * Math.PI * 220 * i) / RATE);
  if (clickMs !== undefined) {
    const i = Math.round((clickMs * RATE) / 1000);
    x[i] = 0.9;
    x[i + 1] = -0.8;
  }
  return x;
}

const WORDS: [number, number][] = [
  [100, 400],
  [600, 900],
  [1200, 1500],
  [2000, 2300],
];
const overlaps = (a: { startMs: number; endMs: number }, s: number, e: number) =>
  a.startMs < e && a.endMs > s;

let n = 0;
const id = () => `00000000-0000-7000-8000-${String(++n).padStart(12, "0").replace(/^0/, "f")}`;
const A = { versionId: "00000000-0000-7000-8000-00000000a001", durationMs: 4000 };
const srcA: AlignmentSource = { kind: "version", versionId: A.versionId };
const al: WordAlignment = {
  format: 1,
  blockId: "00000000-0000-7000-8000-0000000b10c1",
  text: "Hei der du ja",
  words: WORDS.map(([s, e], i) => ({
    text: ["Hei", "der", "du", "ja"][i]!,
    startMs: s,
    endMs: e,
    loss: null,
  })),
  provider: "manual",
  model: "manual",
  loss: null,
  at: "2026-10-17T00:00:00Z",
};

describe("romlydsøk", () => {
  it("finner stille partier og holder avstand til ord og klikk", () => {
    const words = WORDS.map(([s, e]) => ({ startMs: s, endMs: e }));
    const c = findRoomTone(signal(WORDS, 3000), RATE, words);
    expect(c.length).toBeGreaterThan(0);
    for (const k of c) {
      expect(k.endMs - k.startMs).toBeGreaterThanOrEqual(150);
      for (const [s, e] of WORDS) expect(overlaps(k, s - 80, e + 80)).toBe(false);
      expect(overlaps(k, 2990, 3010)).toBe(false); // klikket
    }
    // Det lengste stille partiet (etter siste ord) kommer først
    expect(c[0]!.startMs).toBeGreaterThanOrEqual(2380);
  });

  it("markerte hendelser unngås som ord", () => {
    const c = findRoomTone(signal(WORDS), RATE, [
      ...WORDS.map(([s, e]) => ({ startMs: s, endMs: e })),
      { startMs: 2500, endMs: 4000 },
    ]);
    for (const k of c) expect(overlaps(k, 2420, 4000)).toBe(false);
  });

  it("et opptak som bare er tale, gir ingen kandidater", () => {
    const x = new Float32Array(RATE);
    for (let i = 0; i < x.length; i++) x[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / RATE);
    expect(findRoomTone(x, RATE, [{ startMs: 0, endMs: 1000 }])).toEqual([]);
  });
});

describe("sammensetting", () => {
  it("en kort pause er én bit med korte toninger i kantene", () => {
    const p = buildRoomFill([{ startMs: 2400, endMs: 3900, score: 1 }], 300);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ atMs: 0, lengthMs: 300 });
    expect(p[0]!.sourceInMs).toBeGreaterThanOrEqual(2400);
  });

  it("en lang pause dekkes helt, med krysstoning og uten samme bit to ganger på rad", () => {
    const cands = [
      { startMs: 2400, endMs: 2700, score: 1 },
      { startMs: 1550, endMs: 1700, score: 0.5 },
    ];
    const p = buildRoomFill(cands, 2000, 40);
    const end = p.reduce((m, x) => Math.max(m, x.atMs + x.lengthMs), 0);
    expect(end).toBe(2000);
    for (let i = 1; i < p.length; i++) {
      expect(p[i]!.atMs).toBe(p[i - 1]!.atMs + p[i - 1]!.lengthMs - 40); // 40 ms overlapp
      expect(p[i]!.fadeInMs).toBe(40);
      expect(p[i - 1]!.fadeOutMs).toBe(40);
      expect(p[i]!.sourceInMs).not.toBe(p[i - 1]!.sourceInMs);
    }
    for (const x of p) {
      const c = cands.find(
        (k) => x.sourceInMs >= k.startMs && x.sourceInMs + x.lengthMs <= k.endMs,
      );
      expect(c, "biten ligger inne i en kandidat").toBeTruthy();
    }
  });

  it("med bare én kort kandidat hentes bitene fra ulike steder i den", () => {
    const p = buildRoomFill([{ startMs: 1000, endMs: 1400, score: 1 }], 1500, 40);
    expect(p.length).toBeGreaterThan(2);
    for (let i = 1; i < p.length; i++) expect(p[i]!.sourceInMs).not.toBe(p[i - 1]!.sourceInMs);
    for (const x of p) {
      expect(x.sourceInMs).toBeGreaterThanOrEqual(1000);
      expect(x.sourceInMs + x.lengthMs).toBeLessThanOrEqual(1400);
    }
  });

  it("ingen kandidater gir ingen biter", () => {
    expect(buildRoomFill([], 500)).toEqual([]);
    expect(buildRoomFill([{ startMs: 0, endMs: 30, score: 1 }], 500)).toEqual([]);
  });
});

describe("fylling av pauser (P6, P7)", () => {
  const base = compositionFromTake(A, id);
  const sourceMs = (v: string) => (v === A.versionId ? 4000 : null);

  it("nye pauser fylles som standard med romlyd fra samme opptak", () => {
    const c = setPause(base, al, srcA, 0, 600, id)!;
    const cands = findRoomTone(
      signal(WORDS),
      RATE,
      WORDS.map(([s, e]) => ({ startMs: s, endMs: e })),
    );
    const gaps = pauseGaps(c, al, srcA);
    const r = fillPauseGaps(c, gaps, () => ({ versionId: A.versionId, candidates: cands }), id);
    expect(r.unfilled).toEqual([]);
    const room = r.composition.segments.filter((s) => s.role === "room");
    expect(room.length).toBeGreaterThan(0);
    for (const s of room) {
      expect(s.atMs).toBeGreaterThanOrEqual(gaps[0]!.fromMs);
      expect(s.atMs + s.lengthMs).toBeLessThanOrEqual(gaps[0]!.toMs);
    }
    expect(compositionError(r.composition, sourceMs)).toBeNull();
    // Ny fylling erstatter den gamle (ingen dobbel romlyd)
    const again = fillPauseGaps(
      r.composition,
      gaps,
      () => ({ versionId: A.versionId, candidates: cands }),
      id,
    );
    expect(again.composition.segments.filter((s) => s.role === "room")).toHaveLength(room.length);
  });

  it("digital stillhet kan velges: pausen står tom", () => {
    const c = setPauseFill(setPause(base, al, srcA, 0, 600, id)!, al, 0, { kind: "silence" }, id);
    const r = fillPauseGaps(c, pauseGaps(c, al, srcA), () => null, id);
    expect(r.composition.segments.some((s) => s.role === "room")).toBe(false);
    expect(r.unfilled).toEqual([]);
  });

  it("ingen egnet romlyd gir en tydelig melding", () => {
    const c = setPause(base, al, srcA, 1, 400, id)!;
    const r = fillPauseGaps(
      c,
      pauseGaps(c, al, srcA),
      () => ({ versionId: A.versionId, candidates: [] }),
      id,
    );
    expect(r.unfilled).toEqual([
      { afterWord: 1, message: expect.stringMatching(/romlyd|room tone/i) },
    ]);
  });

  it("en hel romlydfil kan brukes (uten kantene)", () => {
    expect(wholeFileCandidate(2000)).toEqual([{ startMs: 50, endMs: 1950, score: 1 }]);
    expect(wholeFileCandidate(0)).toEqual([]);
  });
});
