// @vitest-environment node
/** Film og klipping følger med til spinoffen for delte scener (DEC-0072, KI-109). */
import { describe, expect, it } from "vitest";
import {
  deriveProductionCommands,
  editableParts,
  filmClips,
  mainProduction,
  orderedOccurrences,
  assetWorklist,
  filmTakeAudio,
  materialsOf,
  exportNumbering,
  sceneNumberOf,
  type Command,
  type ProjectState,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const order = orderedOccurrences(s0, main.id);
const applyAll = (s: ProjectState, cs: readonly Command[]) =>
  cs.reduce((acc: ProjectState, c) => mustApply(acc, c), s);

function withFilmAndSpinoff() {
  const occ = order[0]!;
  const takeId = tid<"take">();
  let s = mustApply(s0, {
    type: "AddTake",
    takeId,
    occurrenceId: occ.id,
    segmentId: null,
    kind: "imported_film",
    status: "approved",
    durationFrames: 75,
    mediaRef: `${s0.project.id}/films/${takeId}/f.mp4`,
    media: {
      fileName: "f.mp4",
      mimeType: "video/mp4",
      byteSize: 1,
      width: 1920,
      height: 1080,
      fps: 25,
      durationMs: 3000,
      videoCodec: null,
      hasAudio: false,
    },
  } as never);
  s = mustApply(s, { type: "SetActiveTake", occurrenceId: occ.id, takeId } as never);
  const pid = tid<"production">();
  s = applyAll(
    s,
    deriveProductionCommands(s, {
      productionId: pid,
      name: "Trailer",
      kind: "spinoff",
      parentProductionId: main.id,
      occurrenceIds: [occ.id, order[1]!.id],
    }),
  );
  return { s, pid, takeId, occ };
}

describe("film i spinoffen", () => {
  it("en delt scene uten eget valg viser hovedfilmens film", () => {
    const { s, pid, takeId, occ } = withFilmAndSpinoff();
    const clip = filmClips(s, pid)[0]!;
    expect(clip.take?.id).toBe(takeId);
    expect(clip.source).toBe("film");
    expect(clip.inheritedFrom).toBe(occ.id);
    expect(filmClips(s, main.id)[0]!.inheritedFrom).toBeUndefined();
  });

  it("klipping i spinoffen gir egne deler; hovedfilmen er uendret", () => {
    const { s, pid, takeId } = withFilmAndSpinoff();
    const clip = filmClips(s, pid)[0]!;
    const parts = editableParts(clip, () => tid<"clip_part">())!;
    const t = mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId: clip.occurrenceId,
      activeTakeId: null,
      parts: parts.map((p) => ({ ...p, outMs: 2000 })),
    } as never);
    const own = filmClips(t, pid)[0]!;
    expect(own.inheritedFrom).toBeUndefined();
    expect(own.parts[0]!.take?.id).toBe(takeId);
    expect(own.durationFrames).toBe(50);
    expect(filmClips(t, main.id)[0]!.durationFrames).toBe(75);
  });

  it("animatic som eget valg i spinoffen; avvik i hovedfilmens film vises også i spinoffen", () => {
    const { s, pid, takeId } = withFilmAndSpinoff();
    const clip = filmClips(s, pid)[0]!;
    // Eget valg: én del med 2D-scenen (slik monteringen lagrer «Bruk animatic» i en spinoff)
    const own = mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId: clip.occurrenceId,
      activeTakeId: null,
      parts: [
        { partId: tid<"clip_part">(), source: "composition", takeId: null, inMs: 0, outMs: 2000 },
      ],
    } as never);
    const c2 = filmClips(own, pid)[0]!;
    expect(c2.inheritedFrom).toBeUndefined();
    expect(c2.parts[0]!.source).toBe("composition");
    expect(filmClips(own, main.id)[0]!.take?.id).toBe(takeId);
    // Materialet i spinoffen inkluderer hovedfilmens film
    const mats = materialsOf(s, clip.occurrenceId, clip);
    expect(mats.some((m) => m.kind === "take" && m.id === takeId && m.inUse)).toBe(true);
  });

  it("arbeidslisten i spinoffen tar ikke med arvet materiale; stillbilder gir ingen lyd", () => {
    const { s, pid } = withFilmAndSpinoff();
    const clips = filmClips(s, pid);
    expect(assetWorklist(s, pid).every((x) => x.kind === "layer")).toBe(true);
    const items = filmTakeAudio(clips, s.project.fps);
    expect(items.every((i) => s.takes[i.clip.assetId]?.kind !== "still")).toBe(true);
  });

  it("gjenbrukte scener viser hovedfilmens scenenummer (KI-108)", () => {
    const { s, pid, occ } = withFilmAndSpinoff();
    const own = s.occurrences[filmClips(s, pid)[0]!.occurrenceId]!;
    expect(own.productionNumber).toBe(null);
    expect(filmClips(s, pid)[0]!.productionNumber).toBe(occ.productionNumber);
    expect(sceneNumberOf(s, own)).toBe(occ.productionNumber);
  });

  it("manuseksporten av spinoffen beholder hovedfilmens nummer for gjenbrukte scener (KI-108)", () => {
    const { s, pid, occ } = withFilmAndSpinoff();
    const n = exportNumbering(s, pid, { method: "production" } as never);
    expect(n[0]!.exportNumber).toBe(occ.productionNumber);
  });
});
