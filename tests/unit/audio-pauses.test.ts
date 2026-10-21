/**
 * Fase 2, bolk E (DEC-0096, REQ-0705–0707): pauser mellom ord. P1 pausen økes, P2 ordenes lyd er uendret,
 * P3/P4 flere ord trekkes fra hverandre og tiden fordeles likt, P5 hver pause justeres for seg, P9 endringen er
 * lokal for komposisjonen. Format 1 leses fortsatt; format 2 kontrolleres.
 */
import { describe, expect, it } from "vitest";
import {
  adjustPause,
  compositionError,
  compositionFromTake,
  compositionLengthMs,
  cropComposition,
  insertTake,
  isAudioComposition,
  pauseGaps,
  sameComposition,
  setPause,
  setPauseFill,
  spreadPause,
  wordSpansInComposition,
  type AlignmentSource,
  type AudioComposition,
  type WordAlignment,
} from "@/core";

let n = 0;
const id = () => `00000000-0000-7000-8000-${String(++n).padStart(12, "0").replace(/^0/, "e")}`;
const A = { versionId: "00000000-0000-7000-8000-00000000a001", durationMs: 4000 };
const B = { versionId: "00000000-0000-7000-8000-00000000b001", durationMs: 2500 };
const srcA: AlignmentSource = { kind: "version", versionId: A.versionId };
const sourceMs = (v: string) => (v === A.versionId ? 4000 : v === B.versionId ? 2500 : null);

/** «Hei der du ja»: 100–400, 600–900, 1200–1500, 2000–2300 i opptak A. */
const al: WordAlignment = {
  format: 1,
  blockId: "00000000-0000-7000-8000-0000000b10c1",
  text: "Hei der du ja",
  words: [
    { text: "Hei", startMs: 100, endMs: 400, loss: null },
    { text: "der", startMs: 600, endMs: 900, loss: null },
    { text: "du", startMs: 1200, endMs: 1500, loss: null },
    { text: "ja", startMs: 2000, endMs: 2300, loss: null },
  ],
  provider: "manual",
  model: "manual",
  loss: null,
  at: "2026-10-17T00:00:00Z",
};

const spans = (c: AudioComposition, src: AlignmentSource = srcA) =>
  wordSpansInComposition(c, al, src).map((s) => (s ? [s.startMs, s.endMs] : null));

/** Hvert ord spilles av én del, fra samme sted i opptaket, med samme lengde (P2). */
function wordsIntact(c: AudioComposition, versionId = A.versionId, shift = 0) {
  for (const w of al.words) {
    const part = c.segments.find(
      (s) =>
        s.track === 0 &&
        s.versionId === versionId &&
        s.sourceInMs <= w.startMs! + shift &&
        s.sourceInMs + s.lengthMs >= w.endMs! + shift,
    );
    expect(part, `ordet «${w.text}» er delt eller borte`).toBeTruthy();
    expect(part!.gainDb).toBe(0);
  }
}

describe("pauser mellom ord", () => {
  const base = compositionFromTake(A, id);

  it("P1/P2: pausen økes, ordene flyttes uendret og resten av replikken følger med", () => {
    const c = setPause(base, al, srcA, 0, 300, id)!;
    expect(c).toBeTruthy();
    expect(spans(c)).toEqual([
      [100, 400],
      [900, 1200],
      [1500, 1800],
      [2300, 2600],
    ]);
    expect(compositionLengthMs(c)).toBe(4300);
    wordsIntact(c);
    expect(c.format).toBe(2);
    expect(c.pauses).toEqual([
      { id: expect.any(String), afterWord: 0, afterWordId: expect.any(String), deltaMs: 300, fill: { kind: "room" } },
    ]);
    // Hullet ligger inne i mellomrommet, aldri i et ord
    expect(pauseGaps(c, al, srcA).map((g) => [g.fromMs, g.toMs])).toEqual([[500, 800]]);
    expect(compositionError(c, sourceMs)).toBeNull();
  });

  it("pausen gjøres kortere, men aldri under 0, og ord kuttes aldri", () => {
    const shorter = setPause(base, al, srcA, 0, -150, id)!;
    expect(spans(shorter)![1]).toEqual([450, 750]);
    wordsIntact(shorter);
    const zero = setPause(base, al, srcA, 1, -5000, id)!;
    expect(zero.pauses![0]!.deltaMs).toBe(-300);
    expect(spans(zero)).toEqual([
      [100, 400],
      [600, 900],
      [900, 1200],
      [1700, 2000],
    ]);
    wordsIntact(zero);
    expect(compositionError(zero, sourceMs)).toBeNull();
  });

  it("samme pause endres flere ganger: verdien er alltid i forhold til opptaket", () => {
    const a = setPause(base, al, srcA, 0, 300, id)!;
    const b = setPause(a, al, srcA, 0, 100, id)!;
    expect(spans(b)![1]).toEqual([700, 1000]);
    expect(b.pauses).toHaveLength(1);
    expect(b.pauses![0]!.deltaMs).toBe(100);
    const c = setPause(b, al, srcA, 0, -100, id)!;
    expect(spans(c)![1]).toEqual([500, 800]);
    wordsIntact(c);
    // Tilbake til 0 med standard fyll: ingen pauseendring igjen, samme lyd som opptaket
    const d = setPause(c, al, srcA, 0, 0, id)!;
    expect(d.pauses).toEqual([]);
    expect(spans(d)).toEqual(spans(base));
    expect(compositionLengthMs(d)).toBe(4000);
    const e = adjustPause(a, al, srcA, 0, 50, id)!;
    expect(e.pauses![0]!.deltaMs).toBe(350);
  });

  it("P3/P4: flere ord trekkes fra hverandre og tiden fordeles likt (600 ms over tre ord = 300 + 300)", () => {
    const c = spreadPause(base, al, srcA, 0, 2, 600, id)!;
    expect(c.pauses!.map((p) => [p.afterWord, p.deltaMs])).toEqual([
      [0, 300],
      [1, 300],
    ]);
    expect(spans(c)).toEqual([
      [100, 400],
      [900, 1200],
      [1800, 2100],
      [2600, 2900],
    ]);
    wordsIntact(c);
    // Ujevn deling: resten går til de første mellomrommene
    const odd = spreadPause(base, al, srcA, 3, 0, 701, id)!;
    expect(odd.pauses!.map((p) => p.deltaMs)).toEqual([234, 234, 233]);
    // Ett ord har ingen indre mellomrom
    expect(spreadPause(base, al, srcA, 1, 1, 600, id)).toBeNull();
  });

  it("P5: hver pause kan justeres for seg etterpå", () => {
    const c = spreadPause(base, al, srcA, 0, 2, 600, id)!;
    const d = setPause(c, al, srcA, 1, 100, id)!;
    expect(d.pauses!.map((p) => [p.afterWord, p.deltaMs])).toEqual([
      [0, 300],
      [1, 100],
    ]);
    expect(spans(d)).toEqual([
      [100, 400],
      [900, 1200],
      [1600, 1900],
      [2400, 2700],
    ]);
    wordsIntact(d);
  });

  it("ord som ligger kant i kant kan trekkes fra hverandre uten å deles", () => {
    const tight: WordAlignment = {
      ...al,
      words: al.words.map((w, i) => (i === 1 ? { ...w, startMs: 400, endMs: 900 } : w)),
    };
    const c = setPause(base, tight, srcA, 0, 200, id)!;
    const sp = wordSpansInComposition(c, tight, srcA);
    expect(sp[0]).toEqual({ startMs: 100, endMs: 400 });
    expect(sp[1]).toEqual({ startMs: 600, endMs: 1100 });
  });

  it("ord uten tid eller utenfor komposisjonen gir ingen pause", () => {
    const missing: WordAlignment = {
      ...al,
      words: al.words.map((w, i) => (i === 2 ? { ...w, startMs: null, endMs: null } : w)),
    };
    expect(setPause(base, missing, srcA, 1, 200, id)).toBeNull();
    expect(setPause(base, al, srcA, 3, 200, id)).toBeNull(); // siste ord
    expect(setPause(base, al, { kind: "version", versionId: B.versionId }, 0, 200, id)).toBeNull();
  });

  it("tider fra komposisjonen editoren startet med følges gjennom (opptak satt inn før)", () => {
    const initial = insertTake(base, B, "before", id); // A starter på 2500
    const shifted: WordAlignment = {
      ...al,
      words: al.words.map((w) => ({ ...w, startMs: w.startMs! + 2500, endMs: w.endMs! + 2500 })),
    };
    const src: AlignmentSource = { kind: "composition", composition: initial };
    const c = setPause(initial, shifted, src, 1, 400, id)!;
    expect(wordSpansInComposition(c, shifted, src).map((s) => s && s.startMs)).toEqual([
      2600, 3100, 4100, 4900,
    ]);
    wordsIntact(c);
  });

  it("lag oppå som starter etter pausen, flyttes med; romlyd i pausen byttes ut når pausen endres", () => {
    const over = insertTake(base, B, "over", id, { atMs: 1000 });
    const c = setPause(over, al, srcA, 0, 300, id)!;
    expect(c.segments.find((s) => s.track === 1)!.atMs).toBe(1300);
    const withRoom: AudioComposition = {
      ...c,
      segments: [
        ...c.segments,
        {
          id: id(),
          versionId: A.versionId,
          track: 0,
          atMs: 500,
          sourceInMs: 3500,
          lengthMs: 300,
          gainDb: 0,
          fadeInMs: 40,
          fadeOutMs: 40,
          role: "room",
        },
      ],
    };
    expect(compositionError(withRoom, sourceMs)).toBeNull();
    const d = setPause(withRoom, al, srcA, 0, 500, id)!;
    expect(d.segments.some((s) => s.role === "room")).toBe(false);
    expect(spans(d)![1]).toEqual([1100, 1400]);
  });

  it("fyll: romlyd er standard; stillhet og manuell står tomme; valgt romlydfil fylles", () => {
    const c = setPause(base, al, srcA, 0, 300, id)!;
    expect(pauseGaps(c, al, srcA)).toHaveLength(1);
    const silent = setPauseFill(c, al, 0, { kind: "silence" }, id);
    expect(silent.pauses![0]!.fill).toEqual({ kind: "silence" });
    expect(pauseGaps(silent, al, srcA)).toEqual([]);
    expect(silent.pauses![0]!.id).toBe(c.pauses![0]!.id);
    const asset = setPauseFill(c, al, 0, { kind: "asset", versionId: B.versionId }, id);
    expect(pauseGaps(asset, al, srcA)).toHaveLength(1);
    expect(compositionError(asset, sourceMs)).toBeNull();
    // Fyllet beholdes når lengden endres
    expect(setPause(silent, al, srcA, 0, 500, id)!.pauses![0]!.fill).toEqual({ kind: "silence" });
    // Stillhet uten forlengelse beholdes som valg
    expect(setPauseFill(base, al, 2, { kind: "silence" }, id).pauses).toHaveLength(1);
    expect(sameComposition(c, silent)).toBe(false);
  });

  it("P9: endringen er lokal – den opprinnelige komposisjonen er uendret", () => {
    const before = JSON.stringify(base);
    setPause(base, al, srcA, 0, 300, id);
    spreadPause(base, al, srcA, 0, 3, 900, id);
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe("kontroll av format 1 og 2", () => {
  const seg = {
    id: "00000000-0000-7000-8000-00000000c001",
    versionId: A.versionId,
    track: 0,
    atMs: 0,
    sourceInMs: 0,
    lengthMs: 4000,
    gainDb: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
  };
  const pause = {
    id: "00000000-0000-7000-8000-00000000d001",
    afterWord: 0,
    deltaMs: 300,
    fill: { kind: "room" },
  };

  it("format 1 leses fortsatt, uten pauser og roller", () => {
    expect(compositionError({ format: 1, segments: [seg] }, sourceMs)).toBeNull();
    expect(isAudioComposition({ format: 1, segments: [seg] })).toBe(true);
    expect(
      compositionError({ format: 1, segments: [seg], pauses: [pause] }, sourceMs),
    ).not.toBeNull();
    expect(
      compositionError({ format: 1, segments: [{ ...seg, role: "room" }] }, sourceMs),
    ).not.toBeNull();
  });

  it("format 2 med roller og pauser", () => {
    expect(
      compositionError(
        { format: 2, segments: [{ ...seg, role: "room" }], pauses: [pause] },
        sourceMs,
      ),
    ).toBeNull();
    expect(compositionError({ format: 2, segments: [seg] }, sourceMs)).toBeNull();
    expect(isAudioComposition({ format: 2, segments: [] })).toBe(true);
    expect(isAudioComposition({ format: 3, segments: [] })).toBe(false);
  });

  it("ugyldige pauser og roller avvises", () => {
    const bad = (extra: Record<string, unknown>) =>
      compositionError({ format: 2, segments: [seg], ...extra }, sourceMs);
    expect(bad({ pauses: [{ ...pause, fill: { kind: "noise" } }] })).not.toBeNull();
    expect(bad({ pauses: [{ ...pause, deltaMs: 1.5 }] })).not.toBeNull();
    expect(bad({ pauses: [{ ...pause, deltaMs: 70_000 }] })).not.toBeNull();
    expect(
      bad({ pauses: [pause, { ...pause, id: "00000000-0000-7000-8000-00000000d002" }] }),
    ).not.toBeNull();
    expect(bad({ pauses: [{ ...pause, extra: 1 }] })).not.toBeNull();
    expect(
      bad({
        pauses: [
          { ...pause, fill: { kind: "asset", versionId: "00000000-0000-7000-8000-00000000f001" } },
        ],
      }),
    ).not.toBeNull();
    expect(bad({ pauses: "x" })).not.toBeNull();
    expect(bad({ other: 1 })).not.toBeNull();
    expect(
      compositionError({ format: 2, segments: [{ ...seg, role: "music" }] }, sourceMs),
    ).not.toBeNull();
  });
});

describe("utsnitt for eksport", () => {
  it("et utsnitt tar med romlyd og pauser som lyd, men ikke pauselisten", () => {
    const c = setPause(compositionFromTake(A, id), al, srcA, 0, 300, id)!;
    const crop = cropComposition(c, 0, 1500);
    expect(crop.pauses).toBeUndefined();
    expect(crop.format).toBe(2);
    expect(compositionError(crop, sourceMs)).toBeNull();
  });
});
