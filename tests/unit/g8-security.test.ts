import { describe, expect, it } from "vitest";
import { redactSecrets, describeError } from "@/lib/error-capture";
import { needsNoStore, withNoStore } from "@/lib/no-store";

describe("G-8 hemmeligheter i logger", () => {
  it("maskerer Bearer-tokens, JWT-er og leverandørnøkler", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop";
    const out = redactSecrets(`Authorization: Bearer abcdefghijklmnop ${jwt} sk-proj-ABCDEFGH12345678 sb_secret_abcdefghij`);
    expect(out).not.toContain("abcdefghijklmnop ");
    expect(out).not.toContain(jwt);
    expect(out).not.toContain("ABCDEFGH12345678");
    expect(out).not.toContain("sb_secret_abcdefghij");
  });
  it("maskerer nøkler og tokens i adresser og JSON", () => {
    const out = redactSecrets('GET https://x.example/a?key=AIzaSECRET123&sort=1 {"password":"hemmelig","token":"t0k3n"}');
    expect(out).not.toContain("AIzaSECRET123");
    expect(out).not.toContain("hemmelig");
    expect(out).not.toContain("t0k3n");
    expect(out).toContain("sort=1");
  });
  it("feilbeskrivelser maskeres også", () => {
    expect(describeError(new Error("failed with Bearer abcdefghijklmnop"))).not.toContain("abcdefghijklmnop");
  });
});

describe("G-8 no-store", () => {
  it("gjelder serverfunksjoner, API og tokensider, ikke statiske filer", () => {
    expect(needsNoStore("/_serverFn/abc")).toBe(true);
    expect(needsNoStore("/api/public/cron/x")).toBe(true);
    expect(needsNoStore("/se/abc")).toBe(true);
    expect(needsNoStore("/m/abc")).toBe(true);
    expect(needsNoStore("/assets/app.js")).toBe(false);
  });
  it("setter private, no-store og bevarer status og innhold", async () => {
    const r = withNoStore(new Request("https://x.example/_serverFn/f"), new Response("hei", { status: 201, headers: { "cache-control": "public, max-age=60" } }));
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.status).toBe(201);
    expect(await r.text()).toBe("hei");
  });
});
