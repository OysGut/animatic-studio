// @vitest-environment node
/** Egne AI-leverandører: katalog, nøkkelkontroll, kryptering og adaptere (DEC-0069, REQ-0566, REQ-0413). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROVIDERS,
  capRemaining,
  checkKeyFormat,
  estimateCostUsd,
  keyHint,
  providersFor,
} from "@/core";
import { decryptKey, encryptKey } from "@/adapters/ai/key-vault.server";
import {
  ADAPTERS,
  findBase64Image,
  safeDownloadUrl,
  scrubSecret,
  testProviderKey,
} from "@/adapters/ai/providers.server";

describe("leverandørkatalogen", () => {
  it("hver leverandør med nøkkel har lenker til konto, betaling og nøkkel, og steg på norsk", () => {
    for (const p of PROVIDERS.filter((x) => !x.builtIn)) {
      expect(p.links.apiKeys, p.id).toMatch(/^https:\/\//);
      expect(p.links.signup ?? p.links.billing, p.id).toMatch(/^https:\/\//);
      expect(p.keySteps.length, p.id).toBeGreaterThan(1);
      expect(p.models.length, p.id).toBeGreaterThan(0);
    }
    expect(new Set(PROVIDERS.map((p) => p.id)).size).toBe(PROVIDERS.length);
  });

  it("bare innebygde og tilkoblede leverandører tilbys, per type", () => {
    const none = providersFor("video", new Set());
    expect(none).toEqual([]);
    const img = providersFor("image", new Set());
    expect(img.map((x) => x.provider.id)).toEqual(["lovable"]);
    const vid = providersFor("video", new Set(["runway", "google"]));
    expect(vid.map((x) => x.provider.id).sort()).toEqual(["google", "runway"]);
    expect(vid.every((x) => x.models.every((m) => m.capability === "video"))).toBe(true);
  });

  it("kostnadsanslag per sekund og per bilde; ukjent modell gir null", () => {
    expect(estimateCostUsd("runway", "gen4_turbo", { seconds: 10 })).toBeCloseTo(0.5);
    expect(estimateCostUsd("openai", "gpt-image-2.5-flare")).toBeCloseTo(0.05);
    expect(estimateCostUsd("openai", "finnes-ikke")).toBe(null);
    expect(capRemaining(null, 5)).toBe(null);
    expect(capRemaining(10, 12.5)).toBe(0);
    expect(capRemaining(10, 2.25)).toBe(7.75);
  });

  it("nøkkelen kontrolleres vennlig; bare de fire siste tegnene vises", () => {
    expect(checkKeyFormat("openai", "").error).not.toBe(null);
    expect(checkKeyFormat("openai", "sk-abc def ghi jkl mno pqr").error).not.toBe(null);
    expect(checkKeyFormat("openai", "sk-" + "a".repeat(40))).toEqual({
      error: null,
      warning: null,
    });
    expect(checkKeyFormat("openai", "x".repeat(40)).warning).toMatch(/OpenAI/);
    expect(checkKeyFormat("lovable", "x".repeat(40)).error).not.toBe(null);
    expect(keyHint("sk-proj-abcdefghijklmnop1234")).toBe("…1234");
    expect(keyHint("kort")).toBe("…");
  });
});

describe("kryptering av nøkler", () => {
  const ctx = { userId: "u1", provider: "openai", rowId: "r1" };
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-secret");
    vi.stubEnv("ANIMATIC_KEY_ENCRYPTION_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("kan låses opp igjen bare for samme bruker, leverandør og rad", async () => {
    const sealed = await encryptKey("sk-hemmelig-123456789", ctx);
    expect(sealed.ciphertext).not.toContain("hemmelig");
    expect(sealed.version).toBe(1);
    const row = { ciphertext: sealed.ciphertext, iv: sealed.iv, key_version: sealed.version };
    expect(await decryptKey(row, ctx)).toBe("sk-hemmelig-123456789");
    await expect(decryptKey(row, { ...ctx, userId: "u2" })).rejects.toThrow(/låses opp/);
    await expect(decryptKey(row, { ...ctx, provider: "google" })).rejects.toThrow(/låses opp/);
    // Samme nøkkel to ganger gir ulikt chiffer (tilfeldig IV)
    const again = await encryptKey("sk-hemmelig-123456789", ctx);
    expect(again.ciphertext).not.toBe(sealed.ciphertext);
  });

  it("egen hovednøkkel (versjon 2) brukes når den finnes; feil hovednøkkel kan ikke låse opp", async () => {
    vi.stubEnv("ANIMATIC_KEY_ENCRYPTION_KEY", btoa("k".repeat(32)));
    const sealed = await encryptKey("sk-x-123456789012345", ctx);
    expect(sealed.version).toBe(2);
    const row = { ciphertext: sealed.ciphertext, iv: sealed.iv, key_version: 2 };
    expect(await decryptKey(row, ctx)).toBe("sk-x-123456789012345");
    vi.stubEnv("ANIMATIC_KEY_ENCRYPTION_KEY", btoa("z".repeat(32)));
    await expect(decryptKey(row, ctx)).rejects.toThrow(/låses opp/);
  });
});

describe("adaptere (med falsk nettverk)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("nøkkeltest: godtatt, avvist, uten kreditt og ukjent", async () => {
    const reply = (status: number) =>
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ error: { message: "x" } }), { status })),
      );
    reply(200);
    expect((await testProviderKey("openai", "sk-1")).result).toBe("ok");
    reply(401);
    expect((await testProviderKey("google", "k")).result).toBe("rejected");
    reply(402);
    expect((await testProviderKey("runway", "k")).result).toBe("limited");
    reply(500);
    expect((await testProviderKey("elevenlabs", "k")).result).toBe("unknown");
  });

  it("Google svarer 400 på ugyldig nøkkel: regnes som avvist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { message: "API key not valid. Please pass a valid API key." },
            }),
            { status: 400 },
          ),
      ),
    );
    expect((await testProviderKey("google", "AIzaFeil")).result).toBe("rejected");
  });

  it("filer hentes bare fra vanlige https-adresser; videresending til interne adresser stoppes", async () => {
    expect(safeDownloadUrl("https://v3.fal.media/files/x.mp4")).not.toBe(null);
    for (const bad of [
      "http://v3.fal.media/x.mp4",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      "https://[::1]/x",
      "https://metadata.google.internal/x",
      "https://user:pw@cdn.example.com/x",
      "file:///etc/passwd",
    ])
      expect(safeDownloadUrl(bad), bad).toBe(null);
    const seen: { url: string; key: string | undefined }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        seen.push({ url, key: (init?.headers as Record<string, string>)?.["x-goog-api-key"] });
        if (url.includes("/operations/"))
          return new Response(
            JSON.stringify({
              done: true,
              response: {
                generateVideoResponse: {
                  generatedSamples: [
                    { video: { uri: "https://generativelanguage.googleapis.com/v1beta/files/x" } },
                  ],
                },
              },
            }),
          );
        if (url.includes("/files/x"))
          return new Response(null, {
            status: 302,
            headers: { location: "https://cdn.example.com/v.mp4" },
          });
        if (url.includes("/tasks/"))
          return new Response(
            JSON.stringify({ status: "SUCCEEDED", output: ["https://cdn.example.com/r.mp4"] }),
          );
        if (url.endsWith("/r.mp4"))
          return new Response(null, { status: 302, headers: { location: "https://10.0.0.1/x" } });
        return new Response(new Uint8Array([7]), { headers: { "content-type": "video/mp4" } });
      }),
    );
    const g = await ADAPTERS.google.pollVideo("AIzaKEY", "veo", "models/veo/operations/abc");
    expect(g.state).toBe("done");
    expect(seen.find((x) => x.url.includes("/files/x"))?.key).toBe("AIzaKEY");
    // Nøkkelen følger ikke med til en annen vert
    expect(seen.find((x) => x.url.includes("cdn.example.com/v.mp4"))?.key).toBeUndefined();
    await expect(ADAPTERS.runway.pollVideo("key_x", "gen4_turbo", "t1")).rejects.toThrow(
      /videresending/,
    );
    expect(seen.some((x) => x.url.includes("10.0.0.1"))).toBe(false);
  });

  it("nøkler fjernes fra feiltekster", () => {
    expect(scrubSecret("401: bad key sk-proj-abcdefghij1234 used", null)).toBe(
      "401: bad key … used",
    );
    expect(scrubSecret("feil med hemmelig123", "hemmelig123")).toBe("feil med …");
    expect(scrubSecret("AIza" + "x".repeat(30) + " ugyldig")).toBe("… ugyldig");
  });

  it("finner bildet i ulike svarformater", () => {
    expect(findBase64Image({ data: [{ b64_json: "QUJD" }] })?.data).toBe("QUJD");
    expect(
      findBase64Image({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: "RA==" } }] } },
        ],
      }),
    ).toEqual({ data: "RA==", mimeType: "image/jpeg" });
    expect(
      findBase64Image({
        steps: [{ content: [{ type: "image", mime_type: "image/png", data: "RQ==" }] }],
      })?.data,
    ).toBe("RQ==");
    expect(findBase64Image({ text: "ingen" })).toBe(null);
  });

  it("Google: bare kjente operasjonsnavn følges, og videoen hentes med nøkkelen", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(url);
        if (url.includes("/operations/"))
          return new Response(
            JSON.stringify({
              done: true,
              response: {
                generateVideoResponse: {
                  generatedSamples: [
                    {
                      video: {
                        uri: "https://generativelanguage.googleapis.com/v1beta/files/x:download",
                      },
                    },
                  ],
                },
              },
            }),
          );
        expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIzaKEY");
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "video/mp4" },
        });
      }),
    );
    expect(
      (await ADAPTERS.google.pollVideo("AIzaKEY", "veo", "https://evil.example/x")).state,
    ).toBe("failed");
    const r = await ADAPTERS.google.pollVideo(
      "AIzaKEY",
      "veo",
      "models/veo-3.1-generate-preview/operations/abc",
    );
    expect(r.state).toBe("done");
    if (r.state === "done") expect([...r.bytes]).toEqual([1, 2, 3]);
    expect(calls.some((c) => c.includes("evil"))).toBe(false);
  });

  it("Runway: jobb startes med startbilde, status følges til ferdig", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/image_to_video")) {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          expect(body["promptImage"]).toBe("https://signed/url");
          expect(body["duration"]).toBe(5);
          return new Response(JSON.stringify({ id: "task-1" }));
        }
        if (url.includes("/tasks/"))
          return new Response(
            JSON.stringify(
              ++n < 2
                ? { status: "RUNNING" }
                : { status: "SUCCEEDED", output: ["https://cdn.example.com/v.mp4"] },
            ),
          );
        return new Response(new Uint8Array([9]), { headers: { "content-type": "video/mp4" } });
      }),
    );
    const id = await ADAPTERS.runway.startVideo({
      key: "key_x",
      model: "gen4_turbo",
      prompt: "A fox",
      image: {
        blob: new Blob([new Uint8Array([1])], { type: "image/png" }),
        url: "https://signed/url",
      },
      seconds: 5,
      aspect: "16:9",
    });
    expect(id).toBe("task-1");
    expect((await ADAPTERS.runway.pollVideo("key_x", "gen4_turbo", id)).state).toBe("running");
    expect((await ADAPTERS.runway.pollVideo("key_x", "gen4_turbo", id)).state).toBe("done");
  });
});
