/**
 * Fase 2, bolk E (DEC-0096, REQ-0709/0710): overganger mellom takes (toning og romlyd under skjøten, kan
 * justeres og forhåndshøres) og området som spilles automatisk etter en endring (E1–E3, P8).
 */
import { describe, expect, it } from "vitest";
import {
  autoPlayRange,
  changedSpan,
  compositionError,
  compositionFromTake,
  insertTake,
  setPause,
  setTransition,
  takeJoints,
  transitionAt,
  updateSegment,
  type AlignmentSource,
  type WordAlignment,
} from "@/core";

let n = 0;
const id = () => `00000000-0000-7000-8000-${String(++n).padStart(12, "0").replace(/^0/, "d")}`;
const A = { versionId: "00000000-0000-7000-8000-00000000a001", durationMs: 4000 };
const B = { versionId: "00000000-0000-7000-8000-00000000b001", durationMs: 2500 };
const sourceMs = (v: string) => (v === A.versionId ? 4000 : v === B.versionId ? 2500 : null);

describe("overganger mellom takes", () => {
  const c = insertTake(compositionFromTake(A, id), B, "after", id); // A 0–4000, B 4000–6500

  it("finner skjøten mellom to ulike opptak, ikke innenfor samme opptak", () => {
    expect(takeJoints(c)).toEqual([
      expect.objectContaining({
        atMs: 4000,
        beforeVersionId: A.versionId,
        afterVersionId: B.versionId,
      }),
    ]);
    const al: WordAlignment = {
      format: 1,
      blockId: "00000000-0000-7000-8000-0000000b10c1",
      text: "a b",
      words: [
        { text: "a", startMs: 100, endMs: 400, loss: null },
        { text: "b", startMs: 600, endMs: 900, loss: null },
      ],
      provider: "manual",
      model: "manual",
      loss: null,
      at: "2026-10-17T00:00:00Z",
    };
    const src: AlignmentSource = { kind: "version", versionId: A.versionId };
    // En pause deler A i to, men det er ingen skjøt mellom ulike opptak der
    const p = setPause(c, al, src, 0, 300, id)!;
    expect(takeJoints(p).map((j) => j.atMs)).toEqual([4300]);
  });

  it("toning og romlyd under skjøten kan settes, justeres og fjernes", () => {
    const j = takeJoints(c)[0]!;
    expect(transitionAt(c, j)).toEqual({ fadeMs: 0, room: null });
    const t = setTransition(
      c,
      j,
      { fadeMs: 30, room: { versionId: B.versionId, sourceInMs: 2000, lengthMs: 200 } },
      id,
    );
    expect(transitionAt(t, j)).toEqual({
      fadeMs: 30,
      room: { versionId: B.versionId, sourceInMs: 2000, lengthMs: 200 },
    });
    const room = t.segments.filter((s) => s.role === "transition");
    expect(room).toHaveLength(1);
    expect(room[0]).toMatchObject({ atMs: 3900, lengthMs: 200, fadeInMs: 100, fadeOutMs: 100 });
    expect(compositionError(t, sourceMs)).toBeNull();
    // Talen flyttes ikke
    expect(t.segments.filter((s) => !s.role).map((s) => [s.atMs, s.lengthMs])).toEqual(
      c.segments.map((s) => [s.atMs, s.lengthMs]),
    );
    // Justering bytter ut romlyden (ingen dobbel)
    const t2 = setTransition(
      t,
      j,
      { fadeMs: 60, room: { versionId: A.versionId, sourceInMs: 3000, lengthMs: 300 } },
      id,
    );
    expect(t2.segments.filter((s) => s.role === "transition")).toHaveLength(1);
    expect(transitionAt(t2, j).room?.versionId).toBe(A.versionId);
    // Av igjen
    const t3 = setTransition(t2, j, { fadeMs: 0, room: null }, id);
    expect(t3.segments.some((s) => s.role === "transition")).toBe(false);
    expect(transitionAt(t3, j)).toEqual({ fadeMs: 0, room: null });
  });
});

describe("automatisk avspilling etter endring", () => {
  const c = compositionFromTake(A, id);

  it("området er det som er endret, med kontekst før og etter", () => {
    const seg = c.segments[0]!;
    const after = updateSegment(c, seg.id, { fadeOutMs: 500 }, 4000);
    const span = changedSpan(c, after)!;
    expect(span).toEqual({ fromMs: 0, toMs: 4000 });
    expect(autoPlayRange({ fromMs: 1000, toMs: 1200 }, 500, 4000)).toEqual({
      fromMs: 500,
      toMs: 1700,
    });
    expect(autoPlayRange({ fromMs: 100, toMs: 3900 }, 500, 4000)).toEqual({
      fromMs: 0,
      toMs: 4000,
    });
  });

  it("innsetting: området dekker det nye opptaket", () => {
    const after = insertTake(c, B, "after", id);
    expect(changedSpan(c, after)).toEqual({ fromMs: 4000, toMs: 6500 });
  });

  it("ingen endring gir ingen avspilling", () => {
    expect(changedSpan(c, c)).toBeNull();
  });
});
