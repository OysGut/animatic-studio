/** Manusdekning for film (REQ-0237, DEC-0071). */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  blocksOfVariant,
  discrepancies,
  filmClips,
  mainProduction,
  orderedOccurrences,
  toRow,
  type ProjectState,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const occ = orderedOccurrences(s0, main.id).find((o) => o.active)!;
const blocks = blocksOfVariant(s0, occ.variantId).filter((b) => b.kind !== "heading");

function run(s: ProjectState, command: unknown) {
  return applyCommand(s, {
    id: "00000000-0000-7000-8000-00000000f0f3" as never,
    actor: "00000000-0000-7000-8000-000000000001" as never,
    at: new Date().toISOString(),
    command: command as never,
  });
}

function withFilm() {
  const takeId = tid<"take">();
  let s = mustApply(s0, {
    type: "AddTake",
    takeId,
    occurrenceId: occ.id,
    segmentId: null,
    kind: "imported_film",
    status: "in_progress",
    durationFrames: 100,
    mediaRef: `${s0.project.id}/films/${takeId}/f.mp4`,
    media: {
      fileName: "f.mp4",
      mimeType: "video/mp4",
      byteSize: 1,
      width: 1920,
      height: 1080,
      fps: 25,
      durationMs: 4000,
      videoCodec: null,
      hasAudio: true,
    },
  } as never);
  s = mustApply(s, { type: "SetActiveTake", occurrenceId: occ.id, takeId } as never);
  return { s, takeId };
}

describe("manusdekning", () => {
  it("avvik gjelder bare linjene filmen dekker", () => {
    if (blocks.length < 3) throw new Error("Fixturen har for få linjer");
    const { s, takeId } = withFilm();
    const covered = mustApply(s, {
      type: "SetTakeCoverage",
      takeId,
      coverage: { startBlockId: blocks[0]!.id, endBlockId: blocks[1]!.id },
    } as never);
    expect(toRow("takes", covered.takes[takeId]!, s.project.id)["coverage"]).toEqual({
      startBlockId: blocks[0]!.id,
      endBlockId: blocks[1]!.id,
    });
    const last = blocks[blocks.length - 1]!;
    const editLast = (st: ProjectState) =>
      mustApply(st, {
        type: "EditBlockText",
        productionId: main.id,
        blockId: last.id,
        text: `${last.text} (endret)`,
      } as never);
    const filmD = (st: ProjectState) =>
      discrepancies(
        st,
        filmClips(st, main.id).filter((c) => c.occurrenceId === occ.id),
      ).filter((d) => d.material.kind === "take" && d.material.id === takeId);
    // Uten dekning: endringen i siste linje gir avvik; med dekning av de to første: ikke
    expect(filmD(editLast(s)).length).toBe(1);
    expect(filmD(editLast(covered)).length).toBe(0);
    // En fjernet linje utenfor dekningen gir ikke avvik; innenfor gjør den det (KI-170, DEC-0072)
    const remove = (st: ProjectState, id: string) =>
      mustApply(st, { type: "RemoveBlock", productionId: main.id, blockId: id } as never);
    expect(filmD(remove(covered, last.id)).length).toBe(0);
    expect(filmD(remove(covered, blocks[1]!.id)).length).toBe(1);
  });

  it("linjene må være i scenen og i riktig rekkefølge; kan angres", () => {
    const { s, takeId } = withFilm();
    expect(
      run(s, {
        type: "SetTakeCoverage",
        takeId,
        coverage: { startBlockId: blocks[1]!.id, endBlockId: blocks[0]!.id },
      }).ok,
    ).toBe(false);
    expect(
      run(s, {
        type: "SetTakeCoverage",
        takeId,
        coverage: { startBlockId: "x", endBlockId: blocks[0]!.id },
      }).ok,
    ).toBe(false);
    const r = run(s, {
      type: "SetTakeCoverage",
      takeId,
      coverage: { startBlockId: blocks[0]!.id, endBlockId: blocks[1]!.id },
    });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(mustApply(r.state, r.inverse as never).takes[takeId]!.coverage ?? null).toBe(null);
  });
});
