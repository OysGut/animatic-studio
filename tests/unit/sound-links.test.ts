/** Koblinger for lyd og søk (mandat 13.2, REQ-0204, REQ-0205, DEC-0070). */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  assetSearchText,
  mainProduction,
  orderedOccurrences,
  soundCategories,
  soundLinkLabel,
  soundsLinkedTo,
  stateFromRows,
  toRow,
  type ProjectState,
} from "@/core";
import { mustApply } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const sound = Object.values(s0.assets).find((a) => a.kind === "sound")!;
const maja = Object.values(s0.assets).find((a) => a.kind === "character")!;
const main = mainProduction(s0)!;
const occ = orderedOccurrences(s0, main.id)[0]!;
const block = Object.values(s0.blocks).find(
  (b) => b.variantId === occ.variantId && b.kind === "dialogue",
)!;

function tryApply(s: ProjectState, command: unknown) {
  return applyCommand(s, {
    id: "00000000-0000-7000-8000-00000000f0f0" as never,
    actor: "00000000-0000-7000-8000-000000000001" as never,
    at: new Date().toISOString(),
    command: command as never,
  });
}

describe("lyd kobles til produksjonsobjekter", () => {
  it("karakter, scene, replikk og produksjon; kan angres; vises med navn", () => {
    const links = [
      { kind: "asset", id: maja.id },
      { kind: "scene", id: occ.sceneId },
      { kind: "block", id: block.id },
      { kind: "production", id: main.id },
    ] as const;
    const s = mustApply(s0, { type: "SetSoundLinks", assetId: sound.id, links } as never);
    expect(s.assets[sound.id]!.soundLinks).toEqual(links);
    expect(soundLinkLabel(s, links[0])).toBe(maja.name);
    expect(soundLinkLabel(s, links[2])).toContain("«");
    expect(soundsLinkedTo(s, maja.id).map((a) => a.id)).toEqual([sound.id]);
    // Søket treffer det lyden er koblet til
    expect(assetSearchText(s, s.assets[sound.id]!).some((t) => t.includes(maja.name))).toBe(true);
    // Angring gir tom liste tilbake
    const r = tryApply(s0, { type: "SetSoundLinks", assetId: sound.id, links });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const back = mustApply(r.state, r.inverse as never);
      expect(back.assets[sound.id]!.soundLinks ?? []).toEqual([]);
    }
  });

  it("avviser ukjente mål, dubletter og andre ressurstyper", () => {
    expect(
      tryApply(s0, {
        type: "SetSoundLinks",
        assetId: sound.id,
        links: [{ kind: "scene", id: "x" }],
      }).ok,
    ).toBe(false);
    expect(
      tryApply(s0, {
        type: "SetSoundLinks",
        assetId: sound.id,
        links: [
          { kind: "asset", id: maja.id },
          { kind: "asset", id: maja.id },
        ],
      }).ok,
    ).toBe(false);
    expect(
      tryApply(s0, {
        type: "SetSoundLinks",
        assetId: maja.id,
        links: [{ kind: "scene", id: occ.sceneId }],
      }).ok,
    ).toBe(false);
    // Kan ikke kobles til seg selv
    expect(
      tryApply(s0, {
        type: "SetSoundLinks",
        assetId: sound.id,
        links: [{ kind: "asset", id: sound.id }],
      }).ok,
    ).toBe(false);
  });

  it("koblingene lagres og leses tilbake (sound_links), og kategoriene kan filtreres", () => {
    const s = mustApply(s0, {
      type: "SetSoundLinks",
      assetId: sound.id,
      links: [{ kind: "scene", id: occ.sceneId }],
    } as never);
    const row = toRow("assets", s.assets[sound.id]!, s.project.id);
    expect(row["sound_links"]).toEqual([{ kind: "scene", id: occ.sceneId }]);
    const back = stateFromRows({
      project: { id: s.project.id, name: "x", fps_num: 25, fps_den: 1, revision: 1 },
      productions: [],
      scenes: [],
      scene_variants: [],
      script_blocks: [],
      script_block_revisions: [],
      scene_occurrences: [],
      production_segments: [],
      takes: [],
      assets: [row],
    } as never);
    expect(back.assets[sound.id]!.soundLinks).toEqual([{ kind: "scene", id: occ.sceneId }]);
    expect(soundCategories(s0)).toContain(sound.category);
  });

  it("en kobling til noe som siden er fjernet, kan stå og fjernes; angring virker", () => {
    // Simuler at målet forsvinner (f.eks. en delsekvens fra en ny inndeling)
    const ghost = { kind: "scene", id: "00000000-0000-7000-8000-0000000000aa" } as const;
    const withGhost = {
      ...s0,
      assets: {
        ...s0.assets,
        [sound.id]: { ...s0.assets[sound.id]!, soundLinks: [ghost] },
      },
    } as ProjectState;
    const added = tryApply(withGhost, {
      type: "SetSoundLinks",
      assetId: sound.id,
      links: [ghost, { kind: "asset", id: maja.id }],
    });
    expect(added.ok).toBe(true);
    const removed = tryApply(withGhost, { type: "SetSoundLinks", assetId: sound.id, links: [] });
    expect(removed.ok).toBe(true);
    if (removed.ok) expect(tryApply(removed.state, removed.inverse).ok).toBe(true);
  });
});
