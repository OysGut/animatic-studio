/** Teknisk visning i monteringen (DEC-0072, REQ-0103). */
import { describe, expect, it } from "vitest";
import { filmClips, formatTimecode, mainProduction, technicalInfo } from "@/core";
import { fixture } from "../visual/fixture-state";

const s = fixture.state;
const fps = s.project.fps;
const clips = filmClips(s, mainProduction(s)!.id);

describe("teknisk informasjon", () => {
  it("tidskoder og bildenummer stemmer med klippet; hver del får egen liste", () => {
    const clip = clips[1]!;
    const info = technicalInfo(s, clip, fps);
    const get = (l: string) => info.scene.find((r) => r.label === l)?.value;
    expect(get("Inn (film)")).toBe(formatTimecode(clip.startFrame, fps));
    expect(get("Ut (film)")).toBe(formatTimecode(clip.startFrame + clip.durationFrames, fps));
    expect(get("Bildenummer")).toBe(
      `${clip.startFrame}–${clip.startFrame + clip.durationFrames - 1}`,
    );
    expect(get("Format")).toBe(`${s.project.frameWidth} × ${s.project.frameHeight}`);
    expect(info.parts).toHaveLength(clip.parts.length);
    expect(info.parts[0]!.rows[0]!.label).toBe("I scenen");
  });
});
