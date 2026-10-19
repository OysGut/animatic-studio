// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { compositionFromTake, manualAlignment, setWordTiming, setPause } from "@/core";
import { renderComposition } from "@/engine/audio/composition";
import { encodeWav } from "@/engine/export/audio-stem";
import { FakeAudioBuffer, FakeOfflineAudioContext, decodeWav } from "../helpers/fake-web-audio";
afterEach(() => vi.unstubAllGlobals());
it("SV1 method 4 prepares word gaps in memory; the same buffer encodes identically", async () => {
  vi.stubGlobal("OfflineAudioContext", FakeOfflineAudioContext);
  const source = new FakeAudioBuffer(1, 1000, 1000);
  source.getChannelData(0).fill(.5, 0, 400); source.getChannelData(0).fill(-.25, 600, 1000);
  const alignment = setWordTiming(setWordTiming(manualAlignment("b", "Hei du", "2026-10-19"), 0, 0, 400), 1, 600, 1000);
  let count = 0;
  const original = compositionFromTake({ versionId: "take", durationMs: 1000 }, () => `s${++count}`);
  const planned = setPause(original, alignment, { kind: "version", versionId: "take" }, 0, 300, () => `s${++count}`, { kind: "silence" });
  if (!planned) throw new Error("Missing pause plan");
  const buffer = await renderComposition(planned, () => source as unknown as AudioBuffer, { sampleRate: 1000, channels: 1 });
  expect(buffer.duration).toBe(1.3);
  expect(buffer.getChannelData(0)[200]).toBe(.5);
  expect(buffer.getChannelData(0)[750]).toBe(0);
  expect(buffer.getChannelData(0)[1000]).toBe(-.25);
  const wav = decodeWav(encodeWav([buffer.getChannelData(0)], buffer.sampleRate));
  expect(wav.duration).toBe(buffer.duration);
  expect(wav.getChannelData(0)[750]).toBe(0);
  expect(wav.getChannelData(0)[1000]).toBeCloseTo(buffer.getChannelData(0)[1000] ?? 0, 4);
  expect(original.segments).toHaveLength(1);
});
