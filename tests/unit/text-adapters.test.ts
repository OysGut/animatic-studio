// @vitest-environment node
/** Tekstadapterne (T1) med mocket fetch: URL, headere, body, svartolking og feil. */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANTHROPIC_VERSION,
  checkJson,
  ProviderError,
  TEXT_ADAPTERS,
  generateProviderText,
  testProviderKey,
} from "@/adapters/ai/providers.server";

const KEY = "sk-test-SECRET-1234567890abcdef";

function mockFetch(status: number, body: unknown) {
  const f = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", f);
  return f;
}
const sent = (f: ReturnType<typeof mockFetch>) => {
  const [url, init] = f.mock.calls[0]!;
  return {
    url,
    headers: (init?.headers ?? {}) as Record<string, string>,
    body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
  };
};

const base = {
  key: KEY,
  system: "You are a script editor.",
  messages: [{ role: "user" as const, content: "Hei" }],
  maxTokens: 500,
  temperature: 0.7,
};

afterEach(() => vi.unstubAllGlobals());

describe("Anthropic", () => {
  it("Messages API med x-api-key og anthropic-version", async () => {
    const f = mockFetch(200, {
      model: "claude-sonnet-4-5-20250929",
      stop_reason: "end_turn",
      content: [
        { type: "text", text: "Hei " },
        { type: "text", text: "der" },
      ],
      usage: { input_tokens: 12, output_tokens: 3 },
    });
    const r = await generateProviderText("anthropic", { ...base, model: "claude-sonnet-4-5" });
    const s = sent(f);
    expect(s.url).toBe("https://api.anthropic.com/v1/messages");
    expect(s.headers["x-api-key"]).toBe(KEY);
    expect(s.headers["anthropic-version"]).toBe(ANTHROPIC_VERSION);
    expect(s.body).toMatchObject({
      model: "claude-sonnet-4-5",
      max_tokens: 500,
      system: "You are a script editor.",
      messages: [{ role: "user", content: "Hei" }],
      temperature: 0.7,
    });
    expect(r).toEqual({
      stopReason: "end_turn",
      text: "Hei der",
      usage: { inputTokens: 12, outputTokens: 3 },
      model: "claude-sonnet-4-5-20250929",
    });
  });

  it("avslag (refusal) er en feil", async () => {
    mockFetch(200, { stop_reason: "refusal", content: [], usage: {} });
    await expect(
      generateProviderText("anthropic", { ...base, model: "claude-haiku-4-5" }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("JSON-modus kontrollerer svaret", async () => {
    mockFetch(200, { content: [{ type: "text", text: '```json\n{"a":1}\n```' }], usage: {} });
    const r = await generateProviderText("anthropic", { ...base, model: "m", json: true });
    expect(JSON.parse(r.text)).toEqual({ a: 1 });
    mockFetch(200, { content: [{ type: "text", text: "ikke json" }], usage: {} });
    await expect(
      generateProviderText("anthropic", { ...base, model: "m", json: true }),
    ).rejects.toThrow();
  });
});

describe("OpenAI og xAI (Chat Completions)", () => {
  it("OpenAI: Bearer, max_completion_tokens, ingen temperature for resonneringsmodeller", async () => {
    const f = mockFetch(200, {
      model: "gpt-5-2025",
      choices: [{ message: { content: '{"svar":true}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 20, completion_tokens: 5 },
    });
    const r = await generateProviderText("openai", { ...base, model: "gpt-5", json: true });
    const s = sent(f);
    expect(s.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(s.headers["Authorization"]).toBe(`Bearer ${KEY}`);
    expect(s.body!["max_completion_tokens"]).toBe(500);
    expect(s.body).not.toHaveProperty("temperature");
    expect(s.body!["response_format"]).toEqual({ type: "json_object" });
    expect((s.body!["messages"] as { role: string }[])[0]!.role).toBe("system");
    expect(r.usage).toEqual({ inputTokens: 20, outputTokens: 5 });
  });

  it("xAI: egen adresse, max_tokens og temperature", async () => {
    const f = mockFetch(200, {
      choices: [{ message: { content: "Grok svarer" } }],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    });
    const r = await generateProviderText("xai", { ...base, model: "grok-4" });
    const s = sent(f);
    expect(s.url).toBe("https://api.x.ai/v1/chat/completions");
    expect(s.body).toMatchObject({ model: "grok-4", max_tokens: 500, temperature: 0.7 });
    expect(r.text).toBe("Grok svarer");
    expect(r.model).toBe("grok-4");
  });

  it("tomt svar er en feil", async () => {
    mockFetch(200, { choices: [{ message: { content: "" } }] });
    await expect(generateProviderText("xai", { ...base, model: "grok-4" })).rejects.toThrow();
  });
});

describe("Google", () => {
  it("generateContent med x-goog-api-key, systemInstruction og rollen model", async () => {
    const f = mockFetch(200, {
      modelVersion: "gemini-2.5-pro",
      candidates: [{ content: { parts: [{ text: '"Hallo"' }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2 },
    });
    const r = await generateProviderText("google", {
      ...base,
      model: "gemini-2.5-pro",
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ],
      json: true,
    });
    const s = sent(f);
    expect(s.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
    );
    expect(s.headers["x-goog-api-key"]).toBe(KEY);
    expect((s.body!["contents"] as { role: string }[]).map((c) => c.role)).toEqual([
      "user",
      "model",
      "user",
    ]);
    expect(s.body!["generationConfig"]).toMatchObject({
      maxOutputTokens: 500,
      temperature: 0.7,
      responseMimeType: "application/json",
    });
    expect(s.body!["systemInstruction"]).toBeDefined();
    expect(r).toMatchObject({ text: '"Hallo"', usage: { inputTokens: 7, outputTokens: 2 } });
  });

  it("svar uten kandidater er en feil", async () => {
    mockFetch(200, { candidates: [] });
    await expect(
      generateProviderText("google", { ...base, model: "gemini-2.5-flash" }),
    ).rejects.toThrow();
  });
});

describe("feil og modellister", () => {
  it("401 og 429 gir tydelige resultater uten nøkkelen", async () => {
    mockFetch(401, { error: { message: `Invalid key ${KEY}` } });
    const a = await testProviderKey("anthropic", KEY);
    expect(a.result).toBe("rejected");
    expect(JSON.stringify(a)).not.toContain(KEY);
    mockFetch(429, { error: { message: "rate" } });
    expect((await testProviderKey("xai", KEY)).result).toBe("limited");
  });

  it("feil fra tekstkallet har status", async () => {
    mockFetch(500, { error: { message: "nede" } });
    await expect(generateProviderText("openai", { ...base, model: "gpt-5" })).rejects.toMatchObject(
      { status: 500 },
    );
  });

  it("henter og filtrerer leverandørenes modellister", async () => {
    const f = mockFetch(200, { data: [{ id: "claude-opus-4-1" }, { id: "claude-haiku-4-5" }] });
    expect(await TEXT_ADAPTERS.anthropic.listTextModels(KEY)).toEqual([
      "claude-haiku-4-5",
      "claude-opus-4-1",
    ]);
    expect(sent(f).url).toBe("https://api.anthropic.com/v1/models?limit=1000");
    mockFetch(200, { data: [{ id: "gpt-5" }, { id: "whisper-1" }] });
    expect(await TEXT_ADAPTERS.openai.listTextModels(KEY)).toEqual(["gpt-5"]);
    mockFetch(200, {
      models: [
        { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
      ],
    });
    expect(await TEXT_ADAPTERS.google.listTextModels(KEY)).toEqual(["gemini-2.5-pro"]);
    mockFetch(200, { data: [{ id: "grok-4" }, { id: "grok-2-image" }] });
    expect(await TEXT_ADAPTERS.xai.listTextModels(KEY)).toEqual(["grok-4"]);
  });
});


describe("B-094: avkorting og JSON-uttrekk", () => {
  it.each([
    ["anthropic", { stop_reason: "max_tokens", content: [], usage: { output_tokens: 500 } }, "max_tokens"],
    ["openai", { choices: [{ finish_reason: "length", message: { content: '{' } }], usage: { completion_tokens: 500 } }, "length"],
    ["xai", { choices: [{ finish_reason: "length", message: { content: '{}' } }], usage: { completion_tokens: 500 } }, "length"],
    ["google", { candidates: [{ finishReason: "MAX_TOKENS" }], usageMetadata: { candidatesTokenCount: 500 } }, "MAX_TOKENS"],
  ] as const)("%s avviser avkorting før JSON-tolking", async (provider, body, stopReason) => {
    const f = mockFetch(200, body);
    await expect(generateProviderText(provider, { ...base, model: "m", json: true })).rejects.toMatchObject({
      code: "truncated",
      message: "Svaret ble avkortet fordi det ble for langt. Prøv igjen med kortere utvalg.",
      details: { stopReason, outputTokens: 500 },
    });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Her er svaret: {"a":1} Ferdig.', { a: 1 }],
    ['Forklaring før. ```json\n{"a":1}\n``` Etterpå.', { a: 1 }],
    ['Svar: [{"a":{"b":"{tekst} og \\"sitat\\""}}] Slutt', [{ a: { b: '{tekst} og "sitat"' } }]],
  ])("henter komplett JSON fra %s", (text, expected) => {
    expect(JSON.parse(checkJson(text as string))).toEqual(expected);
  });

  it.each(['Svar: {"a":', '{"a":[1,2}', '{"a":1,}'])('reparerer ikke ugyldig JSON: %s', (text) => {
    expect(() => checkJson(text)).toThrow(ProviderError);
  });

  it("Anthropic bruker verktøyinput og godtar tool_use som stoppårsak", async () => {
    const f = mockFetch(200, { stop_reason: "tool_use", content: [{ type: "tool_use", input: { svar: "norsk" } }], usage: {} });
    const r = await generateProviderText("anthropic", { ...base, model: "m", json: true });
    expect(r.text).toBe('{"svar":"norsk"}');
    expect(r.stopReason).toBe("tool_use");
    expect(sent(f).body).toMatchObject({ tools: [{ name: "json_response", input_schema: { type: "object" } }], tool_choice: { type: "auto" } });
  });
});
