/**
 * REQ-0210 (N2): bildet følger lydklokken. Avspillingen startes mange ganger etter hverandre, mens
 * lydklokken får en ny startforsinkelse hver gang og går litt fortere eller saktere enn performance.now.
 * Det viste bildet skal aldri ligge mer enn ett bilde fra lydklokken, og avviket skal ikke vokse over tid.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayback } from "@/app/scene-editor/use-playback";

const FPS = { num: 25, den: 1 };
let now = 0;
let queue: FrameRequestCallback[] = [];

beforeEach(() => {
  now = 0;
  queue = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => (queue.push(cb), queue.length));
  vi.stubGlobal("cancelAnimationFrame", () => { queue = []; });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function advance(ms: number) {
  now += ms;
  const q = queue;
  queue = [];
  act(() => q.forEach((cb) => cb(now)));
}

describe("REQ-0210: bilde mot lydklokke over mange avspillinger", () => {
  it("avviket holder seg under ett bilde i 50 avspillinger med ulik startforsinkelse og klokkefart", () => {
    let audio: { startPerf: number; rate: number; from: number } | null = null;
    const clock = {
      current: () => (audio ? audio.from + Math.max(0, ((now - audio.startPerf) / 1000) * audio.rate) : null),
    };
    const { result } = renderHook(() => usePlayback(25 * 60, FPS, false, null, clock));
    const drifts: number[] = [];
    for (let run = 0; run < 50; run++) {
      act(() => result.current.setFrame(0));
      act(() => result.current.play());
      // Lyden starter 40–290 ms etter bildet (som en treg AudioContext), og klokken går ±0,5 % feil
      audio = { startPerf: now + 40 + (run % 6) * 50, rate: 1 + ((run % 5) - 2) * 0.0025, from: 0 };
      for (let i = 0; i < 120; i++) {
        advance(16 + (i % 7 === 0 ? 150 : 0)); // av og til en lang oppgave på hovedtråden
        const a = clock.current();
        if (a !== null && a > 0) drifts.push(Math.abs(result.current.frame / 25 - a));
      }
      act(() => result.current.pause());
      audio = null;
    }
    expect(drifts.length).toBeGreaterThan(1000);
    expect(Math.max(...drifts)).toBeLessThan(1 / 25 + 1e-6);
    // Ingen akkumulert drift: siste runde er ikke dårligere enn første
    const per = drifts.length / 50;
    const first = Math.max(...drifts.slice(0, per));
    const last = Math.max(...drifts.slice(-per));
    expect(last).toBeLessThanOrEqual(first + 1e-6);
  });

  it("uten lyd brukes performance.now som før", () => {
    const { result } = renderHook(() => usePlayback(250, FPS, false, null, { current: () => null }));
    act(() => result.current.play());
    advance(16);
    advance(1000);
    expect(result.current.frame).toBe(25);
  });
});
