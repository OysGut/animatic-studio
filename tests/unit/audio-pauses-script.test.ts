// @vitest-environment node
/**
 * Fase 2, bolk E (DEC-0096, REQ-0707, P9, E4–E7): pauser og romlyd lagres i lydkomposisjonen. Manusteksten og
 * den eksporterte manusfilen er uendret etter pauseendringer, andre replikker og lydklipp beholder sine data og
 * tidsposisjoner, og originalopptakene endres ikke. Angre og gjør om virker for den nye versjonen.
 */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  compositionFromTake,
  exportPaginationInput,
  fillPauseGaps,
  pauseGaps,
  screenplayFountain,
  setPause,
  wholeFileCandidate,
  type AlignmentSource,
  type Command,
  type ProjectState,
  type WordAlignment,
} from "@/core";
import { envelope } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

let n = 0;
const id = () => `00000000-0000-7000-8000-${String(++n).padStart(12, "0").replace(/^0/, "c")}`;

function fountain(s: ProjectState): string {
  const main = Object.values(s.productions).find((p) => p.kind === "main")!;
  return screenplayFountain(
    exportPaginationInput(s, main.id, {
      method: "production",
      includeInactive: false,
      fillMissing: "none",
    }),
  );
}

describe("pauser endrer aldri manuset eller andre replikker", () => {
  it("manuseksporten, andre lydklipp og originalopptaket er uendret etter en pauseendring", () => {
    let s: ProjectState = fixture.state;
    const run = (c: Command) => {
      const r = applyCommand(s, envelope(c));
      if (!r.ok) throw new Error(r.error.message);
      s = r.state;
    };
    const take = Object.values(s.assetVersions).find(
      (v) =>
        v.durationMs !== null &&
        v.durationMs >= 2000 &&
        s.assets[s.assetVariants[v.variantId]!.assetId]?.kind === "sound",
    )!;
    expect(take).toBeTruthy();
    const d = take.durationMs!;
    const al: WordAlignment = {
      format: 1,
      blockId: "00000000-0000-7000-8000-0000000b10c1",
      text: "Jeg tror det",
      words: [
        { text: "Jeg", startMs: 100, endMs: 300, loss: null },
        { text: "tror", startMs: 500, endMs: 800, loss: null },
        { text: "det", startMs: 1000, endMs: 1300, loss: null },
      ],
      provider: "manual",
      model: "manual",
      loss: null,
      at: "2026-10-17T00:00:00Z",
    };
    const src: AlignmentSource = { kind: "version", versionId: take.id };
    const before = {
      script: fountain(s),
      blocks: JSON.stringify(s.blocks),
      clips: JSON.stringify(s.audioClips),
      take: JSON.stringify(s.assetVersions[take.id]),
    };
    // «Jeg … tror det»: 600 ms lengre pause, fylt med romlyd fra slutten av opptaket
    const paused = setPause(
      compositionFromTake({ versionId: take.id, durationMs: d }, id),
      al,
      src,
      0,
      600,
      id,
    )!;
    const filled = fillPauseGaps(
      paused,
      pauseGaps(paused, al, src),
      () => ({ versionId: take.id, candidates: [{ startMs: d - 900, endMs: d - 100, score: 1 }] }),
      id,
    ).composition;
    expect(filled.segments.some((x) => x.role === "room")).toBe(true);
    const versionId = "00000000-0000-7000-8000-0000000e0001";
    run({
      type: "AddAssetVersion",
      versionId: versionId as never,
      variantId: take.variantId,
      media: {
        path: `${fixture.project.id}/source/x/miks.wav`,
        mimeType: "audio/wav",
        width: null,
        height: null,
        byteSize: 100,
        sha256: "e".repeat(64),
        durationMs: d + 600,
      },
      note: "",
      composition: filled,
    });
    // Lagret med pausene (E5–E7: komposisjonen og originalene bevares)
    expect(s.assetVersions[versionId]!.composition).toEqual(filled);
    expect(JSON.stringify(s.assetVersions[take.id])).toBe(before.take);
    // REQ-0707: manusteksten og manuseksporten er uendret
    expect(fountain(s)).toBe(before.script);
    expect(JSON.stringify(s.blocks)).toBe(before.blocks);
    // P9: lydklippene i scenen beholder data og tidsposisjoner
    expect(JSON.stringify(s.audioClips)).toBe(before.clips);
    // Angre og gjør om
    const u = applyCommand(
      s,
      envelope({ type: "UndoAddAssetVersion", versionId: versionId as never }),
    );
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    const redo = applyCommand(u.state, envelope(u.inverse as Command));
    expect(redo.ok && redo.state.assetVersions[versionId]!.composition).toEqual(filled);
  });

  it("en romlydfil kan brukes som fyll", () => {
    expect(wholeFileCandidate(5000)[0]).toEqual({ startMs: 50, endMs: 4950, score: 1 });
  });
});
