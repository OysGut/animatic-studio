// @vitest-environment node
/** Ressurs i bruk i materialet teller som brukt (UX-gjennomgang DEC-0076). */
import { describe, expect, it } from "vitest";
import { assetUsage, mainProduction, orderedOccurrences, type ProjectState } from "@/core";
import { fixture } from "../visual/fixture-state";

describe("assetUsage med lydklipp og lag", () => {
  it("en lyd som ikke nevnes i manuset, men ligger på et lydspor, er brukt i scenen", () => {
    const s0 = fixture.state;
    const main = mainProduction(s0)!;
    const occ = orderedOccurrences(s0, main.id)[1]!;
    const asset = {
      id: "lyd-test",
      kind: "sound",
      name: "Qzx vind",
      names: [],
      archived: false,
    } as unknown as ProjectState["assets"][string];
    const clip = {
      id: "klipp-test",
      occurrenceId: occ.id,
      assetId: asset.id,
      removed: false,
    } as unknown as ProjectState["audioClips"][string];
    const s = {
      ...s0,
      assets: { ...s0.assets, [asset.id]: asset },
      audioClips: { ...s0.audioClips, [clip.id]: clip },
    } as ProjectState;
    const u = assetUsage(s, main.id, asset);
    expect(u.map((x) => [x.occurrenceId, x.how])).toEqual([[occ.id, "audio"]]);
    const removed = {
      ...s,
      audioClips: { ...s.audioClips, [clip.id]: { ...clip, removed: true } },
    } as ProjectState;
    expect(assetUsage(removed, main.id, asset)).toEqual([]);
  });
});
