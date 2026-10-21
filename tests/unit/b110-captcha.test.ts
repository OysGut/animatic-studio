/** B-110: kontroll av Cloudflare Turnstile på serveren, med mocket svar (aldri ekte kall). */
import { describe, expect, it, vi } from "vitest";
import { captchaKeys, clientIp, safeRedirect, SITEVERIFY_URL, verifyTurnstile } from "@/adapters/auth/turnstile.server";

// Cloudflares offisielle testnøkler (hemmelige nøkler som alltid godkjenner / alltid avviser)
const PASS_SECRET = "1x0000000000000000000000000000000AA";
const FAIL_SECRET = "2x0000000000000000000000000000000AA";
const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("B-110 verifyTurnstile", () => {
  it("gyldig token godkjennes, og secret, token og IP sendes til siteverify", async () => {
    const f = reply({ success: true, action: "" });
    const r = await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", { secret: PASS_SECRET, ip: "203.0.113.7", action: "signup", fetchImpl: f as never });
    expect(r).toEqual({ ok: true, skipped: false });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SITEVERIFY_URL);
    const body = new URLSearchParams(String(init.body));
    expect(body.get("secret")).toBe(PASS_SECRET);
    expect(body.get("response")).toBe("XXXX.DUMMY.TOKEN.XXXX");
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });
  it("ugyldig token avvises", async () => {
    const r = await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", { secret: FAIL_SECRET, fetchImpl: reply({ success: false, "error-codes": ["invalid-input-response"] }) as never });
    expect(r).toEqual({ ok: false, code: "invalid" });
  });
  it("token for et annet skjema avvises", async () => {
    const r = await verifyTurnstile("t", { secret: PASS_SECRET, action: "signup", fetchImpl: reply({ success: true, action: "login" }) as never });
    expect(r).toEqual({ ok: false, code: "invalid" });
  });
  it("nettverksfeil, HTTP-feil og uventet svar gir «unavailable», aldri godkjenning", async () => {
    const boom = vi.fn(async () => { throw new TypeError("network"); });
    expect(await verifyTurnstile("t", { secret: PASS_SECRET, fetchImpl: boom as never })).toEqual({ ok: false, code: "unavailable" });
    expect(await verifyTurnstile("t", { secret: PASS_SECRET, fetchImpl: reply({}, 500) as never })).toEqual({ ok: false, code: "unavailable" });
    expect(await verifyTurnstile("t", { secret: PASS_SECRET, fetchImpl: reply({ ok: 1 }) as never })).toEqual({ ok: false, code: "unavailable" });
  });
  it("manglende eller for langt token avvises uten kall", async () => {
    const f = reply({ success: true });
    expect(await verifyTurnstile(null, { secret: PASS_SECRET, fetchImpl: f as never })).toEqual({ ok: false, code: "missing-token" });
    expect(await verifyTurnstile("x".repeat(2049), { secret: PASS_SECRET, fetchImpl: f as never })).toEqual({ ok: false, code: "missing-token" });
    expect(f).not.toHaveBeenCalled();
  });
  it("uten nøkkel er CAPTCHA av og ingenting kalles", async () => {
    const f = reply({ success: false });
    expect(await verifyTurnstile(null, { secret: null, fetchImpl: f as never })).toEqual({ ok: true, skipped: true });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("B-110 nøkler, IP og lenkemål", () => {
  it("CAPTCHA er på bare når begge nøklene finnes", () => {
    expect(captchaKeys({}).secret).toBeNull();
    expect(captchaKeys({ TURNSTILE_SECRET_KEY: PASS_SECRET }).secret).toBeNull();
    expect(captchaKeys({ TURNSTILE_SITE_KEY: "1x00000000000000000000AA", TURNSTILE_SECRET_KEY: PASS_SECRET })).toEqual({ siteKey: "1x00000000000000000000AA", secret: PASS_SECRET });
  });
  it("IP fra Cloudflare først, ellers første x-forwarded-for", () => {
    const h = (m: Record<string, string>) => (n: string) => m[n];
    expect(clientIp(h({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" }))).toBe("1.2.3.4");
    expect(clientIp(h({ "x-forwarded-for": "5.6.7.8, 9.9.9.9" }))).toBe("5.6.7.8");
    expect(clientIp(h({}))).toBeNull();
  });
  it("lenkemål godtas bare på samme opphav", () => {
    expect(safeRedirect("https://pentoglass.com/konto", "https://pentoglass.com")).toBe("https://pentoglass.com/konto");
    expect(safeRedirect("https://evil.example/x", "https://pentoglass.com")).toBeNull();
    expect(safeRedirect("javascript:alert(1)", "https://pentoglass.com")).toBeNull();
    expect(safeRedirect("https://pentoglass.com/x", null)).toBeNull();
  });
});
