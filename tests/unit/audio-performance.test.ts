/**
 * Fase 2, bolk E (DEC-0096, REQ-0712): ytelse. Bølgeformen for en lang replikk (2 minutter, 48 kHz) tegnes raskt
 * og hurtigbufres per opptak; romlydsøket i et langt opptak går raskt nok til å kjøres etter hver pauseendring.
 */
import { describe, expect, it } from "vitest";
import { findRoomTone } from "@/core";
import { peaks } from "@/engine/audio/mixer";

const RATE = 48000;
const SECONDS = 120;

function longRecording(): Float32Array {
  const x = new Float32Array(RATE * SECONDS);
  let seed = 7;
  for (let i = 0; i < x.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const noise = (seed / 0x7fffffff - 0.5) * 0.01;
    // Tale annethvert halve sekund
    const talk = Math.floor(i / (RATE / 2)) % 2 === 0;
    x[i] = noise + (talk ? 0.3 * Math.sin((2 * Math.PI * 180 * i) / RATE) : 0);
  }
  return x;
}

describe("ytelse for lange replikker", () => {
  const data = longRecording();
  const buf = {
    sampleRate: RATE,
    duration: SECONDS,
    length: data.length,
    numberOfChannels: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer;

  it("bølgeformen for 2 minutter tegnes på under 100 ms og hurtigbufres", () => {
    const t0 = performance.now();
    const p = peaks(buf, 0, SECONDS, 1200);
    const first = performance.now() - t0;
    expect(p.length).toBe(1200);
    expect(Math.max(...p)).toBeGreaterThan(0.25);
    expect(first).toBeLessThan(100);
    const t1 = performance.now();
    expect(peaks(buf, 0, SECONDS, 1200)).toBe(p);
    expect(performance.now() - t1).toBeLessThan(2);
  });

  it("romlydsøket i 2 minutter opptak tar under 500 ms", () => {
    const t0 = performance.now();
    const c = findRoomTone(data, RATE, []);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(c.length).toBeGreaterThan(50);
  });
});
