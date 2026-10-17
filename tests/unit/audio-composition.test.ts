/**
 * Fase 2, bolk C (DEC-0094, REQ-0691–0697): lydkomposisjoner. Nytt opptak før, etter, oppå, i stedet for alt
 * eller for et område; trim og toning; kontroll av komposisjonen i kjernen; andre replikker flyttes aldri
 * (konflikt vises); kildeopptak i bruk kan ikke angres bort; utsnitt for eksport.
 */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  compositionError,
  compositionFromTake,
  compositionLengthMs,
  cropComposition,
  insertTake,
  lineConflicts,
  removeSegment,
  sortedSegments,
  updateSegment,
  type AudioComposition,
  type Command,
  type ProjectState,
} from "@/core";
import { segmentGainAt } from "@/engine/audio/composition";
import { envelope } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

let n = 0;
const id = () => `00000000-0000-7000-8000-${String(++n).padStart(12, "0").replace(/^0/, "e")}`;
const A = { versionId: "00000000-0000-7000-8000-00000000a001", durationMs: 4000 };
const B = { versionId: "00000000-0000-7000-8000-00000000b001", durationMs: 2500 };
const main = (c: AudioComposition) =>
  sortedSegments(c)
    .filter((s) => s.track === 0)
    .map((s) => [s.versionId === A.versionId ? "A" : "B", s.atMs, s.sourceInMs, s.lengthMs]);

describe("komposisjonen", () => {
  it("før, etter, oppå og erstatt alt", () => {
    const c = compositionFromTake(A, id);
    expect(compositionLengthMs(c)).toBe(4000);
    expect(main(insertTake(c, B, "before", id))).toEqual([
      ["B", 0, 0, 2500],
      ["A", 2500, 0, 4000],
    ]);
    expect(main(insertTake(c, B, "after", id))).toEqual([
      ["A", 0, 0, 4000],
      ["B", 4000, 0, 2500],
    ]);
    const over = insertTake(c, B, "over", id, { atMs: 1000 });
    expect(main(over)).toEqual([["A", 0, 0, 4000]]);
    expect(over.segments.find((s) => s.track === 1)).toMatchObject({ atMs: 1000, lengthMs: 2500 });
    expect(compositionLengthMs(over)).toBe(4000);
    // To lag oppå samtidig får hvert sitt spor
    const over2 = insertTake(over, B, "over", id, { atMs: 1500 });
    expect(over2.segments.find((s) => s.track === 2)).toBeTruthy();
    expect(main(insertTake(c, B, "replace", id))).toEqual([["B", 0, 0, 2500]]);
  });

  it("erstatt et område: delene rundt beholdes, resten flyttes med forskjellen i lengde", () => {
    const c = compositionFromTake(A, id);
    // Erstatt 1,0–2,0 s med 0,5 s av B (fra 0,2 s inn i B)
    const r = insertTake(c, B, "range", id, {
      startMs: 1000,
      endMs: 2000,
      takeInMs: 200,
      takeLengthMs: 500,
    });
    expect(main(r)).toEqual([
      ["A", 0, 0, 1000],
      ["B", 1000, 200, 500],
      ["A", 1500, 2000, 2000],
    ]);
    expect(compositionLengthMs(r)).toBe(3500);
    // Et lengre opptak gjør lyden lengre (ikke tvunget inn i det gamle tidsrommet)
    const longer = insertTake(c, B, "range", id, { startMs: 1000, endMs: 2000 });
    expect(compositionLengthMs(longer)).toBe(4000 - 1000 + 2500);
  });

  it("trim, flytt, volum og toning holdes innenfor opptaket", () => {
    const c = compositionFromTake(A, id);
    const s = c.segments[0]!;
    const t = updateSegment(
      c,
      s.id,
      { sourceInMs: 3900, lengthMs: 5000, fadeInMs: 9999, gainDb: 40 },
      4000,
    );
    expect(t.segments[0]).toMatchObject({
      sourceInMs: 3900,
      lengthMs: 100,
      fadeInMs: 100,
      gainDb: 12,
    });
    expect(removeSegment(c, s.id).segments).toHaveLength(0);
    expect(segmentGainAt({ ...s, fadeInMs: 1000, fadeOutMs: 1000 }, 500)).toBeCloseTo(0.5);
    expect(segmentGainAt({ ...s, fadeInMs: 1000, fadeOutMs: 1000 }, 2000)).toBeCloseTo(1);
    expect(segmentGainAt({ ...s, gainDb: -6 }, 2000)).toBeCloseTo(0.501, 2);
  });

  it("utsnitt for eksport begynner på 0 og beholder bare det som er i området", () => {
    const c = insertTake(compositionFromTake(A, id), B, "after", id);
    const crop = cropComposition(c, 3000, 5000);
    expect(main(crop)).toEqual([
      ["A", 0, 3000, 1000],
      ["B", 1000, 0, 1000],
    ]);
  });

  it("kjernen godtar bare gyldige komposisjoner", () => {
    const ms = (v: string) => (v === A.versionId ? 4000 : v === B.versionId ? 2500 : null);
    const c = insertTake(compositionFromTake(A, id), B, "after", id);
    expect(compositionError(c, ms)).toBeNull();
    expect(compositionError({ ...c, segments: [] }, ms)).toMatch(/tom/);
    const past = updateSegment(c, c.segments[0]!.id, { lengthMs: 4000 });
    expect(
      compositionError({ ...past, segments: [{ ...past.segments[0]!, sourceInMs: 1000 }] }, ms),
    ).toMatch(/slutten/);
    expect(
      compositionError(
        {
          ...c,
          segments: [{ ...c.segments[0]!, versionId: "00000000-0000-7000-8000-00000000c001" }],
        },
        ms,
      ),
    ).toMatch(/ikke finnes/);
    expect(compositionError({ ...c, segments: [{ ...c.segments[0]!, extra: 1 }] }, ms)).toMatch(
      /Ugyldig/,
    );
  });
});

describe("komposisjoner i prosjektet", () => {
  function setup() {
    let s: ProjectState = fixture.state;
    const run = (c: Command) => {
      const r = applyCommand(s, envelope(c));
      if (!r.ok) throw new Error(r.error.message);
      s = r.state;
    };
    const take = Object.values(s.assetVersions).find(
      (v) =>
        v.durationMs !== null && s.assets[s.assetVariants[v.variantId]!.assetId]?.kind === "sound",
    )!;
    return { run, get: () => s, take };
  }
  const media = (ms: number) => ({
    path: `${fixture.project.id}/source/x/miks.wav`,
    mimeType: "audio/wav",
    width: null,
    height: null,
    byteSize: 100,
    sha256: "f".repeat(64),
    durationMs: ms,
  });

  it("lagres med versjonen; kildeopptaket kan ikke angres bort så lenge det brukes", () => {
    const { run, get, take } = setup();
    const comp = compositionFromTake({ versionId: take.id, durationMs: take.durationMs! }, id);
    const versionId = "00000000-0000-7000-8000-0000000f0001";
    run({
      type: "AddAssetVersion",
      versionId: versionId as never,
      variantId: take.variantId,
      media: media(take.durationMs!),
      note: "",
      composition: comp,
    });
    expect(get().assetVersions[versionId]!.composition).toEqual(comp);
    const undo = applyCommand(get(), envelope({ type: "UndoAddAssetVersion", versionId: take.id }));
    expect(undo.ok).toBe(false);
    // Angre selve komposisjonen og gjør om: komposisjonen og lengden følger med
    const u = applyCommand(
      get(),
      envelope({ type: "UndoAddAssetVersion", versionId: versionId as never }),
    );
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    const redo = applyCommand(u.state, envelope(u.inverse as Command));
    expect(redo.ok && redo.state.assetVersions[versionId]!.composition).toEqual(comp);
    expect(redo.ok && redo.state.assetVersions[versionId]!.durationMs).toBe(take.durationMs);
  });

  it("en komposisjon kan ikke bygge på en annen komposisjon, og bilder kan ikke ha komposisjon", () => {
    const { run, get, take } = setup();
    const comp = compositionFromTake({ versionId: take.id, durationMs: take.durationMs! }, id);
    const v1 = "00000000-0000-7000-8000-0000000f0002";
    run({
      type: "AddAssetVersion",
      versionId: v1 as never,
      variantId: take.variantId,
      media: media(take.durationMs!),
      note: "",
      composition: comp,
    });
    const nested = compositionFromTake({ versionId: v1, durationMs: take.durationMs! }, id);
    const r = applyCommand(
      get(),
      envelope({
        type: "AddAssetVersion",
        versionId: "00000000-0000-7000-8000-0000000f0003" as never,
        variantId: take.variantId,
        media: media(take.durationMs!),
        note: "",
        composition: nested,
      }),
    );
    expect(r.ok).toBe(false);
    const img = Object.values(get().assetVersions).find((v) => v.mimeType.startsWith("image/"))!;
    const r2 = applyCommand(
      get(),
      envelope({
        type: "AddAssetVersion",
        versionId: "00000000-0000-7000-8000-0000000f0004" as never,
        variantId: img.variantId,
        media: { ...media(1), mimeType: "image/png", width: 10, height: 10 },
        note: "",
        composition: comp,
      }),
    );
    expect(r2.ok).toBe(false);
  });

  it("andre replikker flyttes aldri; overlapp vises som konflikt", () => {
    const { get } = setup();
    const s = get();
    const dialog = Object.values(s.audioClips).filter((a) => !a.removed && a.kind === "dialogue");
    const clip = dialog[0]!;
    const others = Object.values(s.audioClips).filter(
      (a) =>
        a.id !== clip.id &&
        a.occurrenceId === clip.occurrenceId &&
        a.kind === "dialogue" &&
        !a.removed &&
        !a.muted &&
        (a.language ?? null) === (clip.language ?? null),
    );
    const far =
      others.reduce((m, a) => Math.max(m, a.offsetMs + a.lengthMs), 0) - clip.offsetMs + 1000;
    const c = lineConflicts(s, clip, Math.max(far, 1));
    expect(c.length).toBe(others.filter((a) => a.offsetMs + a.lengthMs > clip.offsetMs).length);
    expect(lineConflicts(s, clip, 1).every((x) => x.overlapMs > 0)).toBe(true);
  });
});
