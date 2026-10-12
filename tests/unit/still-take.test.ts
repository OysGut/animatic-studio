/** Stillbilder i monteringen (DEC-0072, REQ-0214/0418). */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  filmClips,
  filmTakeAudio,
  isFilmTake,
  mainProduction,
  materialsOf,
  sourceAt,
  stillCandidates,
  stillCommands,
  stillMediaPaths,
  takeLabel,
  type ProjectState,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const fps = s0.project.fps;

function run(s: ProjectState, command: unknown) {
  return applyCommand(s, {
    id: "00000000-0000-7000-8000-00000000f0f3" as never,
    actor: "00000000-0000-7000-8000-000000000001" as never,
    at: new Date().toISOString(),
    command: command as never,
  });
}

function withStill(mode: "replace" | "append", ms = 3000) {
  const clip = filmClips(s0, main.id)[0]!;
  const img = stillCandidates(s0)[0]!;
  const takeId = tid<"take">();
  const cmds = stillCommands(clip, { takeId, mediaRef: img.version.mediaPath, ms, mode, fps }, () =>
    tid<"clip_part">(),
  )!;
  let s = s0;
  for (const c of cmds) s = mustApply(s, c as never);
  return { s, takeId, img, before: clip };
}

describe("stillbilde i monteringen", () => {
  it("biblioteket har bilder å velge; hele scenen blir stillbildet i valgt tid", () => {
    expect(stillCandidates(s0).length).toBeGreaterThan(0);
    const { s, takeId, img } = withStill("replace", 2500);
    const clip = filmClips(s, main.id)[0]!;
    expect(clip.parts).toHaveLength(1);
    expect(clip.parts[0]!.take?.id).toBe(takeId);
    expect(isFilmTake(clip.parts[0]!.take)).toBe(true);
    expect(clip.durationFrames).toBe(Math.round(2.5 * (fps.num / fps.den)));
    const src = sourceAt(clip, 10, fps);
    expect(src.kind).toBe("take");
    expect(stillMediaPaths([clip]).has(img.version.mediaPath)).toBe(true);
    expect(takeLabel(s, s.takes[takeId]!)).toContain(img.asset.name);
    expect(materialsOf(s, clip.occurrenceId, clip).find((m) => m.id === takeId)?.label).toBe(
      "Stillbilde",
    );
  });

  it("som ny del kommer bildet etter animaticen; delen kan gjøres lengre enn en film", () => {
    const { s, takeId, before } = withStill("append", 1000);
    const clip = filmClips(s, main.id)[0]!;
    expect(clip.parts).toHaveLength(before.parts.length + 1);
    expect(clip.parts.at(-1)!.take?.id).toBe(takeId);
    const parts = clip.parts.map((p, i) => ({
      partId: p.id!,
      source: p.source === "take" ? "take" : "composition",
      takeId: p.take?.id ?? null,
      inMs: p.inMs,
      outMs: i === clip.parts.length - 1 ? 120_000 : p.outMs,
    }));
    expect(
      run(s, { type: "SetSceneEdit", occurrenceId: clip.occurrenceId, activeTakeId: null, parts })
        .ok,
    ).toBe(true);
  });

  it("bare bilder fra biblioteket, med varighet; ugyldig lengde gir ingen kommandoer", () => {
    const clip = filmClips(s0, main.id)[0]!;
    const base = {
      type: "AddTake",
      takeId: tid<"take">(),
      occurrenceId: clip.occurrenceId,
      segmentId: null,
      kind: "still",
      status: "approved",
      durationFrames: 50,
    };
    expect(run(s0, { ...base, mediaRef: `${s0.project.id}/x/y/bilde.png` }).ok).toBe(false);
    const img = stillCandidates(s0)[0]!;
    expect(run(s0, { ...base, mediaRef: img.version.mediaPath, durationFrames: null }).ok).toBe(
      false,
    );
    expect(run(s0, { ...base, mediaRef: img.version.mediaPath }).ok).toBe(true);
    expect(
      stillCommands(clip, { takeId: "x", mediaRef: "y", ms: 10, mode: "replace", fps }, () => "z"),
    ).toBe(null);
  });

  it("et stillbilde gir ingen lyd i filmen, og bildet kan ikke angres bort fra biblioteket", () => {
    const { s, img } = withStill("replace", 2000);
    const clips = filmClips(s, main.id);
    expect(
      filmTakeAudio(clips, fps).some((i) => i.clip.occurrenceId === clips[0]!.occurrenceId),
    ).toBe(false);
    const r = run(s, { type: "UndoAddAssetVersion", versionId: img.version.id });
    expect(r.ok).toBe(false);
  });
});
