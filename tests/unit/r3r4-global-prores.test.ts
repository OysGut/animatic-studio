/**
 * R4: ProRes med Apples målbitrate per profil og oppløsning, og de valgfrie profilene 422 LT og 422 Proxy.
 * ffprobe kontrollerer ekte filer: FourCC, bitrate nær målet, Rec.709, PCM-lyd og alfa bare i 4444.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { encodeProResFrame } from "@/engine/export/prores";
import { MovWriter, audioFramesFor, toSowt } from "@/engine/export/mov";
import {
  PRORES_FILM_KINDS, PRORES_FOURCC, formatBytes, isProResKind, proresBytesEstimate, proresFrameBudget, proresTargetBitrate,
  type ProResKind,
} from "@/core/prores-export";
import type { Rational } from "@/core";

const hasFfprobe = (() => {
  try { execFileSync("ffprobe", ["-version"], { stdio: "ignore" }); return true; } catch { return false; }
})();

/** Et detaljert bilde (gradient + støy fra en fast frøverdi), så koderen må bruke budsjettet. */
function busyFrame(w: number, h: number, seed: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  let r = seed * 2654435761 >>> 0;
  const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 2 ** 32; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4;
    px[p] = (x * 255) / w + rnd() * 60; px[p + 1] = (y * 255) / h + rnd() * 60; px[p + 2] = 128 + rnd() * 60;
    px[p + 3] = x < w / 2 ? 255 : Math.round((y * 255) / h);
  }
  return px;
}

async function makeMov(kind: ProResKind, fps: Rational, w: number, h: number, frames: number, audio: boolean) {
  const chunks: Uint8Array[] = [];
  const mov = new MovWriter({ write: async (c) => { chunks.push(c.slice()); } }, { width: w, height: h, fps, profile: kind, audioRate: audio ? 48000 : null });
  await mov.start();
  const budget = proresFrameBudget(w, h, fps, kind);
  for (let f = 0; f < frames; f++) {
    await mov.addVideo(encodeProResFrame({ width: w, height: h, rgba: busyFrame(w, h, f + 1), profile: kind, targetBytes: budget }));
    if (audio) { const n = audioFramesFor(f, fps, 48000); const s = new Float32Array(n).fill(0.1); await mov.addAudio(toSowt(s, s)); }
  }
  await mov.finish();
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0; for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

interface Stream { codec_type: string; codec_name: string; codec_tag_string: string; bit_rate?: string; color_primaries?: string; color_transfer?: string; color_space?: string; pix_fmt?: string; sample_rate?: string; channels?: number }
function probe(b: Uint8Array, name: string): Stream[] {
  const path = `/tmp/${name}.mov`;
  writeFileSync(path, b);
  return (JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries",
    "stream=codec_type,codec_name,codec_tag_string,bit_rate,color_primaries,color_transfer,color_space,pix_fmt,sample_rate,channels", "-of", "json", path], { encoding: "utf8" })) as { streams: Stream[] }).streams;
}

describe("R4 målbitrate", () => {
  it("følger Apples tabell for 1080p29,97 og skalerer med piksler og bildefrekvens", () => {
    const f2997 = { num: 30000, den: 1001 };
    expect(proresTargetBitrate(1920, 1080, f2997, "hq") / 1e6).toBeCloseTo(220, 5);
    expect(proresTargetBitrate(1920, 1080, f2997, "422") / 1e6).toBeCloseTo(147, 5);
    expect(proresTargetBitrate(1920, 1080, f2997, "lt") / 1e6).toBeCloseTo(102, 5);
    expect(proresTargetBitrate(1920, 1080, f2997, "proxy") / 1e6).toBeCloseTo(45, 5);
    expect(proresTargetBitrate(1920, 1080, f2997, "4444") / 1e6).toBeCloseTo(330, 5);
    // Apple: HQ 1080p23,976 = 176 Mbit/s, HQ 2160p29,97 = 884 Mbit/s
    expect(Math.abs(proresTargetBitrate(1920, 1080, { num: 24000, den: 1001 }, "hq") / 1e6 - 176)).toBeLessThan(1);
    expect(Math.abs(proresTargetBitrate(3840, 2160, f2997, "hq") / 1e6 - 884) / 884).toBeLessThan(0.01);
  });
  it("estimatet bygger på målbitraten og tar med lyd og alfa", () => {
    const fps = { num: 24, den: 1 };
    const hq = proresBytesEstimate(1920, 1080, 240, "hq", fps, false);
    const proxy = proresBytesEstimate(1920, 1080, 240, "proxy", fps, false);
    expect(hq).toBeGreaterThan(proxy * 4);
    expect(proresBytesEstimate(1920, 1080, 240, "hq", fps, true)).toBe(hq + 10 * 48000 * 4);
    expect(proresBytesEstimate(1920, 1080, 240, "4444", fps, false, true)).toBeGreaterThan(proresBytesEstimate(1920, 1080, 240, "4444", fps, false));
    expect(formatBytes(1.5 * 1024 ** 3)).toMatch(/GB$/);
    expect(formatBytes(5 * 1024 ** 2)).toMatch(/MB$/);
    expect(formatBytes(300 * 1024)).toMatch(/kB$/);
    expect(PRORES_FILM_KINDS).not.toContain("4444");
    expect(isProResKind("lt")).toBe(true);
    expect(isProResKind("xq")).toBe(false);
  });
  it("hvert bilde holder seg innenfor budsjettet", () => {
    const fps = { num: 25, den: 1 };
    for (const kind of ["proxy", "lt", "422", "hq", "4444"] as const) {
      const budget = proresFrameBudget(320, 180, fps, kind);
      const f = encodeProResFrame({ width: 320, height: 180, rgba: busyFrame(320, 180, 7), profile: kind, targetBytes: budget });
      const alpha = kind === "4444" ? 320 * 180 * 2 : 0; // alfa kommer i tillegg (tapsfri)
      expect(f.length).toBeLessThanOrEqual(budget * 1.1 + alpha);
    }
  });
});

describe.skipIf(!hasFfprobe)("R4 ffprobe", () => {
  const fps = { num: 24000, den: 1001 };
  for (const kind of [...PRORES_FILM_KINDS, "4444"] as ProResKind[])
    it(`${PRORES_FOURCC[kind]}: FourCC, bitrate nær målet, Rec.709${kind === "4444" ? " og alfa" : ", PCM-lyd og ingen alfa"}`, async () => {
      const w = 640, h = 360, frames = 6;
      const film = kind !== "4444";
      const streams = probe(await makeMov(kind, fps, w, h, frames, film), `r4-${kind}`);
      const v = streams.find((s) => s.codec_type === "video")!;
      expect(v.codec_name).toBe("prores");
      expect(v.codec_tag_string).toBe(PRORES_FOURCC[kind]);
      expect(v.color_primaries).toBe("bt709");
      expect(v.color_transfer).toBe("bt709");
      expect(v.color_space).toBe("bt709");
      const target = proresTargetBitrate(w, h, fps, kind);
      const rate = Number(v.bit_rate);
      if (kind === "4444") {
        expect(v.pix_fmt).toMatch(/^yuva444p/);
        // Alfa er tapsfri og kommer i tillegg; fargedelen holder seg likevel i nærheten av målet
        expect(rate).toBeGreaterThan(target * 0.8);
      } else {
        expect(v.pix_fmt).toMatch(/^yuv422p/);
        expect(rate / target).toBeGreaterThan(0.8);
        expect(rate / target).toBeLessThan(1.1);
        const a = streams.find((s) => s.codec_type === "audio")!;
        expect(a.codec_name).toBe("pcm_s16le");
        expect(a.sample_rate).toBe("48000");
        expect(a.channels).toBe(2);
      }
    }, 60000);

  it("dekodet bilde ligger nær kilden i alle profiler (også grove kvantiserere over 128)", async () => {
    const w = 320, h = 180;
    const src = busyFrame(w, h, 1);
    const errs: Record<string, number> = {};
    for (const kind of ["hq", "proxy"] as const) {
      const b = await makeMov(kind, fps, w, h, 1, false);
      writeFileSync(`/tmp/r4-dec-${kind}.mov`, b);
      const raw = execFileSync("ffmpeg", ["-v", "error", "-i", `/tmp/r4-dec-${kind}.mov`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
      let sum = 0;
      for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) sum += Math.abs(raw[i * 3 + c]! - src[i * 4 + c]!);
      errs[kind] = sum / (w * h * 3);
    }
    expect(errs["hq"]).toBeLessThan(12);
    expect(errs["proxy"]).toBeLessThan(30);
    expect(errs["proxy"]).toBeGreaterThan(errs["hq"]!);
  }, 60000);
});

import { isProresOfferDismissed, proresOfferKey, setProresOfferDismissed } from "@/app/projects/prores-offer-memory";

describe("R1 «Ikke nå» huskes per bruker og prosjekt", () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
  it("huskes for samme bruker og prosjekt, ikke for andre, og kan hentes fram igjen", () => {
    const s = mem();
    setProresOfferDismissed("u1", "p1", true, s);
    expect(isProresOfferDismissed("u1", "p1", s)).toBe(true);
    expect(isProresOfferDismissed("u2", "p1", s)).toBe(false);
    expect(isProresOfferDismissed("u1", "p2", s)).toBe(false);
    setProresOfferDismissed("u1", "p1", false, s);
    expect(isProresOfferDismissed("u1", "p1", s)).toBe(false);
    expect(proresOfferKey("u1", "p1")).not.toBe(proresOfferKey("p1", "u1"));
  });
  it("feil i lagringen gir ingen feil (try/catch)", () => {
    const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(() => setProresOfferDismissed("u", "p", true, broken)).not.toThrow();
    expect(isProresOfferDismissed("u", "p", broken)).toBe(false);
    expect(isProresOfferDismissed("u", "p", null)).toBe(false);
  });
});
