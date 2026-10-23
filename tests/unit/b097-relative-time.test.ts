// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatUserDate, formatExactTime, formatRelativeTime, type TimeFormatOptions } from "@/core";

// Onsdag 21.10.2026 kl. 14:00 UTC
const NOW = new Date("2026-10-21T14:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;
const nb: TimeFormatOptions = { language: "nb", country: "NO", timeZone: "UTC" };
const en: TimeFormatOptions = { language: "en", country: "NO", timeZone: "UTC" };

describe("B-097 formatRelativeTime – grensene", () => {
  it("59 s er «nå nettopp»", () => {
    expect(formatRelativeTime(ago(59 * S), NOW, nb)).toBe("nå nettopp");
    expect(formatRelativeTime(ago(59 * S), NOW, en)).toBe("just now");
  });
  it("60 s er 1 min, 59 min er minutter", () => {
    expect(formatRelativeTime(ago(60 * S), NOW, nb)).toBe("1 min siden");
    expect(formatRelativeTime(ago(59 * M), NOW, nb)).toBe("59 min siden");
    expect(formatRelativeTime(ago(59 * M), NOW, en)).toBe("59 min ago");
  });
  it("60 min er 1 t, 23 t 59 min er 23 t", () => {
    expect(formatRelativeTime(ago(60 * M), NOW, nb)).toBe("1 t siden");
    expect(formatRelativeTime(ago(23 * H + 59 * M), NOW, nb)).toBe("23 t siden");
    expect(formatRelativeTime(ago(23 * H + 59 * M), NOW, en)).toBe("23 h ago");
  });
  it("6 dager er ukedag og klokkeslett (nb/en)", () => {
    // 15.10.2026 kl. 14:00 UTC = torsdag
    expect(formatRelativeTime(ago(6 * D), NOW, nb)).toBe("torsdag kl. 14:00");
    expect(formatRelativeTime(ago(6 * D), NOW, { ...en, clock: "24" })).toBe("Thursday at 14:00");
  });
  it("8 dager er dato uten årstall i år, med årstall i fjor", () => {
    expect(formatRelativeTime(ago(8 * D), NOW, nb)).toBe("13.10.");
    expect(formatRelativeTime(new Date("2025-12-31T10:00:00Z"), NOW, nb)).toBe("31.12.2025");
  });
  it("fremtidig tid (klokkeavvik) er «nå nettopp»", () => {
    expect(formatRelativeTime(new Date(NOW.getTime() + 5 * M), NOW, nb)).toBe("nå nettopp");
  });
});

describe("B-097 klokke", () => {
  const twoDays = ago(2 * D + 1.5 * H); // mandag 19.10 kl. 12:30 UTC
  it("24 t", () => expect(formatRelativeTime(twoDays, NOW, { ...nb, clock: "24" })).toBe("mandag kl. 12:30"));
  it("12 t", () => expect(formatRelativeTime(twoDays, NOW, { ...en, clock: "12" })).toMatch(/^Monday at 12:30\s?PM$/));
  it("som landet: NO og DE 24 t, US og GB etter landet", () => {
    expect(formatRelativeTime(twoDays, NOW, { ...en, country: "NO" })).toBe("Monday at 12:30");
    expect(formatRelativeTime(twoDays, NOW, { ...en, country: "DE" })).toBe("Monday at 12:30");
    expect(formatRelativeTime(twoDays, NOW, { ...en, country: "US" })).toMatch(/^Monday at 12:30\s?PM$/);
    // Storbritannia bruker 24 t i Intl (en-GB)
    expect(formatRelativeTime(twoDays, NOW, { ...en, country: "GB" })).toBe("Monday at 12:30");
  });
});

describe("B-097 datoformat", () => {
  const d = new Date("2025-12-31T10:00:00Z");
  it("de fire faste formatene", () => {
    expect(formatUserDate(d, { ...nb, dateFormat: "dmy-dot" })).toBe("31.12.2025");
    expect(formatUserDate(d, { ...nb, dateFormat: "ymd-iso" })).toBe("2025-12-31");
    expect(formatUserDate(d, { ...nb, dateFormat: "mdy-slash" })).toBe("12/31/2025");
    expect(formatUserDate(d, { ...nb, dateFormat: "dmy-slash" })).toBe("31/12/2025");
  });
  it("uten årstall", () => {
    expect(formatUserDate(d, { ...nb, dateFormat: "ymd-iso" }, false)).toBe("12-31");
    expect(formatUserDate(d, { ...nb, dateFormat: "mdy-slash" }, false)).toBe("12/31");
  });
  it("som landet: NO, US, GB og DE", () => {
    expect(formatUserDate(d, { ...nb, country: "NO" })).toBe("31.12.2025");
    expect(formatUserDate(d, { ...nb, country: "US" })).toBe("12/31/2025");
    expect(formatUserDate(d, { ...nb, country: "GB" })).toBe("31/12/2025");
    expect(formatUserDate(d, { ...nb, country: "DE" })).toBe("31.12.2025");
  });
  it("nøyaktig tidspunkt har ukedag, dato og klokke på valgt språk", () => {
    expect(formatExactTime(d, { ...nb, country: "NO" })).toBe("onsdag 31.12.2025 kl. 10:00");
    expect(formatExactTime(d, { ...en, country: "NO" })).toBe("Wednesday 31.12.2025 at 10:00");
  });
});
