// @vitest-environment node
/** GP5: hvilke filer som kan deles, status og lenke. */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHARE_DAYS,
  MAX_SHARE_BYTES,
  SHARE_DAYS,
  SHARE_TOKEN,
  shareEligibility,
  shareStatus,
  shareUrl,
} from "@/core";

const ok = { mimeType: "video/mp4", codec: "avc", audioCodec: "aac", bytes: 1000 };

describe("GP5 deling", () => {
  it("bare mp4 med H.264 og AAC (eller uten lyd) kan deles", () => {
    expect(shareEligibility(ok).ok).toBe(true);
    expect(shareEligibility({ ...ok, audioCodec: null }).ok).toBe(true);
    expect(shareEligibility({ ...ok, mimeType: "video/webm" })).toEqual({ ok: false, reason: "format" });
    expect(shareEligibility({ ...ok, codec: "vp9" })).toEqual({ ok: false, reason: "video_codec" });
    expect(shareEligibility({ ...ok, audioCodec: "opus" })).toEqual({ ok: false, reason: "audio_codec" });
  });
  it("grensen er 500 MB", () => {
    expect(MAX_SHARE_BYTES).toBe(524288000);
    expect(shareEligibility({ ...ok, bytes: MAX_SHARE_BYTES }).ok).toBe(true);
    expect(shareEligibility({ ...ok, bytes: MAX_SHARE_BYTES + 1 })).toEqual({ ok: false, reason: "too_large" });
  });
  it("varighetene er 7, 30 og til tilbaketrekking; standard 30", () => {
    expect([...SHARE_DAYS]).toEqual([7, 30, null]);
    expect(DEFAULT_SHARE_DAYS).toBe(30);
  });
  it("status: QR fungerer bare når delingen er klar og ikke utløpt", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    expect(shareStatus({ status: "uploading", expiresAt: null }, now)).toBe("uploading");
    expect(shareStatus({ status: "ready", expiresAt: null }, now)).toBe("available");
    expect(shareStatus({ status: "ready", expiresAt: "2026-10-20T11:59:59Z" }, now)).toBe("expired");
    expect(shareStatus({ status: "revoked", expiresAt: null }, now)).toBe("revoked");
  });
  it("lenken peker på /se/<nøkkel>", () => {
    const t = "a".repeat(64);
    expect(SHARE_TOKEN.test(t)).toBe(true);
    expect(SHARE_TOKEN.test("x")).toBe(false);
    expect(shareUrl("https://x.no/", t)).toBe(`https://x.no/se/${t}`);
  });
});
