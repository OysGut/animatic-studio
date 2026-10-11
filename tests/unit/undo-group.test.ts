// @vitest-environment node
/** Samlet angring (DEC-0049): flere endringer, f.eks. «Importer lang film», angres og gjøres om som ett steg. */
import { describe, expect, it } from "vitest";
import { applyCommand, filmClips, scriptView, type Command, type ProjectState } from "@/core";
import { pushEntry, replayEntry, withoutStep, type HistoryEntry } from "@/app/project/use-commands";
import { envelope, seedProject, tid } from "../helpers/fixtures";

const MEDIA = {
  fileName: "lang.mp4",
  mimeType: "video/mp4",
  byteSize: 1000,
  width: 1920,
  height: 1080,
  fps: 25,
  durationMs: 20_000,
  videoCodec: "avc",
  hasAudio: false,
};

describe("samlet angring", () => {
  it("en lang film over to scener angres og gjøres om som ett steg", () => {
    const seed = seedProject(3);
    const view = scriptView(seed.state, seed.mainId);
    let state: ProjectState = seed.state;
    const exec = (c: Command): HistoryEntry | null => {
      const r = applyCommand(state, envelope(c));
      if (!r.ok) return null;
      state = r.state;
      return { id: tid(), label: c.type, inverse: r.inverse, affected: r.affected };
    };
    const group = "import-1";
    // En tidligere endring uten gruppe blir stående som eget steg
    let undo: HistoryEntry[] = [
      { id: "tidligere", label: "Tidligere", inverse: { type: "Noe" } as never, affected: [] },
    ];
    const before = state;
    const takeId = tid<"take">();
    for (const [i, occ] of [view[0]!.occurrenceId, view[1]!.occurrenceId].entries()) {
      const tk = i === 0 ? takeId : tid<"take">();
      undo = pushEntry(
        undo,
        exec({
          type: "AddTake",
          takeId: tk,
          occurrenceId: occ,
          segmentId: null,
          kind: "imported_film",
          status: "approved",
          durationFrames: 500,
          mediaRef: `${state.project.id}/films/${takeId}/lang.mp4`,
          media: MEDIA,
        })!,
        group,
      );
      undo = pushEntry(
        undo,
        exec({
          type: "SetSceneEdit",
          occurrenceId: occ,
          activeTakeId: tk,
          parts: [
            {
              partId: tid(),
              source: "take",
              takeId: tk,
              inMs: i * 10_000,
              outMs: (i + 1) * 10_000,
            },
          ],
        })!,
        group,
      );
    }
    // Fire endringer i gruppen, men ett steg på angrelisten
    expect(undo).toHaveLength(2);
    expect(undo[1]!.steps).toHaveLength(4);
    const after = state;
    expect(filmClips(after, seed.mainId).filter((c) => c.source === "film")).toHaveLength(2);

    const { back, rest } = replayEntry(undo[1]!, exec);
    expect(rest).toBeNull();
    expect(filmClips(state, seed.mainId).filter((c) => c.source === "film")).toHaveLength(0);
    expect(filmClips(state, seed.mainId).map((c) => c.durationFrames)).toEqual(
      filmClips(before, seed.mainId).map((c) => c.durationFrames),
    );
    // Gjør om: samme resultat som etter importen
    expect(back!.steps).toHaveLength(4);
    const again = replayEntry(back!, exec);
    expect(again.rest).toBeNull();
    expect(filmClips(state, seed.mainId).map((c) => [c.source, c.durationFrames])).toEqual(
      filmClips(after, seed.mainId).map((c) => [c.source, c.durationFrames]),
    );
  });

  it("stopper ved første avvisning og lar resten stå på listen", () => {
    const ok = (id: string): HistoryEntry => ({
      id,
      label: "x",
      inverse: { type: id } as never,
      affected: [id],
    });
    let list: HistoryEntry[] = [];
    for (const id of ["a", "b", "c"]) list = pushEntry(list, ok(id), "g");
    // «c» angres først; «b» avvises
    const r = replayEntry(list[0]!, (c) =>
      (c as { type: string }).type === "b" ? null : ok(`u-${(c as { type: string }).type}`),
    );
    expect(r.back!.steps!.map((x) => x.id)).toEqual(["u-c"]);
    expect(r.rest!.steps!.map((x) => x.id)).toEqual(["a", "b"]);
    // En annen gruppe eller ingen gruppe gir eget steg
    expect(pushEntry(list, ok("d"), "h")).toHaveLength(2);
    expect(pushEntry(list, ok("d"))).toHaveLength(2);
  });

  it("en endring som ikke ble lagret, fjernes uten at resten av gruppen forsvinner", () => {
    const e = (id: string): HistoryEntry => ({
      id,
      label: "x",
      inverse: { type: id } as never,
      affected: [id],
    });
    let list: HistoryEntry[] = [e("før")];
    for (const id of ["a", "b", "c"]) list = pushEntry(list, e(id), "g");
    const after = withoutStep(list, "b");
    expect(after).toHaveLength(2);
    expect(after[1]!.steps!.map((x) => x.id)).toEqual(["a", "c"]);
    expect(after[1]!.affected).toEqual(["a", "c"]);
    expect(withoutStep(after, "før")).toHaveLength(1);
    expect(withoutStep(withoutStep(withoutStep(list, "a"), "b"), "c")).toHaveLength(1);
  });
});
