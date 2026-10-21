import { describe, expect, it } from "vitest";
import { RAW_AUDIO_DEFAULT, RECORDING_BITRATE, mediaKindsFor, microphoneConstraints, parseUploadContext, pickRecordingFormat } from "@/core";
import { saveSceneSound } from "@/app/audio/takes";

const OCC = "00000000-0000-7000-8000-000000000006";

describe("B-099: kontekst for lyd i scenen", () => {
  it("godtar scene, tidspunkt og lydtype, og tar bare imot lyd", () => {
    const c = parseUploadContext({ type: "scene_sound", occurrenceId: OCC, atMs: 4200, kind: "sfx" });
    expect(c).toEqual({ type: "scene_sound", occurrenceId: OCC, atMs: 4200, kind: "sfx" });
    expect(mediaKindsFor(c!)).toEqual(["audio"]);
  });
  it("avviser ugyldig tid, lydtype og scene-ID", () => {
    expect(parseUploadContext({ type: "scene_sound", occurrenceId: OCC, atMs: -1, kind: "sfx" })).toBeNull();
    expect(parseUploadContext({ type: "scene_sound", occurrenceId: OCC, atMs: 1.5, kind: "sfx" })).toBeNull();
    expect(parseUploadContext({ type: "scene_sound", occurrenceId: OCC, atMs: 0, kind: "noise" })).toBeNull();
    expect(parseUploadContext({ type: "scene_sound", occurrenceId: "x", atMs: 0, kind: "sfx" })).toBeNull();
  });
});

describe("B-099: lydkvalitet", () => {
  it("velger Opus med høy bitrate når nettleseren kan", () => {
    const f = pickRecordingFormat((m) => m.startsWith("audio/webm"));
    expect(f).toEqual({ mime: "audio/webm;codecs=opus", ext: "webm", bitsPerSecond: RECORDING_BITRATE });
    expect(RECORDING_BITRATE).toBeGreaterThanOrEqual(256_000);
  });
  it("Safari: AAC i MP4 med høy bitrate", () => {
    expect(pickRecordingFormat((m) => m.startsWith("audio/mp4"))?.mime).toBe("audio/mp4;codecs=mp4a.40.2");
  });
  it("ingen støttede formater gir null", () => {
    expect(pickRecordingFormat(() => false)).toBeNull();
  });
  it("rå lyd skrur av ekko- og støydemping og automatisk nivå, og er standard", () => {
    expect(RAW_AUDIO_DEFAULT).toBe(true);
    expect(microphoneConstraints(true)).toEqual({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
    expect(microphoneConstraints(false)).toEqual({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
  });
});

describe("B-099: lyd fra mobilen blir ny lyd i scenen", () => {
  it("ny ressurs, ny versjon og et klipp der avspillingshodet stod, i én angregruppe", async () => {
    const sent: { c: { type: string; clips?: { fields: { offsetMs: number; kind: string; occurrenceId: string } }[] }; group: string }[] = [];
    const cmds = {
      runAndWait: async (c: unknown, _label: string, group?: string) => {
        sent.push({ c: c as never, group: group ?? "" });
        return { error: null };
      },
    };
    const media = { path: "p/a.webm", mimeType: "audio/webm", width: null, height: null, byteSize: 10, sha256: "0".repeat(64), durationMs: 1500 };
    await saveSceneSound(cmds as never, { occurrenceId: OCC, atMs: 4200, kind: "sfx" }, media as never, "Dør", "");
    expect(sent.map((x) => x.c.type)).toEqual(["CreateAssets", "CreateAssetVariant", "AddAssetVersion", "AddAudioClips"]);
    expect(new Set(sent.map((x) => x.group)).size).toBe(1);
    const clip = sent[3]!.c.clips![0]!.fields;
    expect(clip.offsetMs).toBe(4200);
    expect(clip.kind).toBe("sfx");
    expect(clip.occurrenceId).toBe(OCC);
    expect(sent.some((x) => /Update|Remove|SetActive/.test(x.c.type))).toBe(false);
  });
});
