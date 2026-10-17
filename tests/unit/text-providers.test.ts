// @vitest-environment node
/** Tekst-AI med egne nøkler (T1): katalog, nøkkelmønstre, valg av leverandør og modell, kostnad, filter. */
import { describe, expect, it } from "vitest";
import {
  PROVIDERS,
  TASK_GROUP,
  TEXT_PROVIDERS,
  checkKeyFormat,
  chooseTextModel,
  estimateTextCostUsd,
  filterTextModels,
  isTextPrefs,
  providerInfo,
} from "@/core";

const allOn = () => true;
const LOV = "google/gemini-3.1-pro-preview";

describe("tekstleverandørene i katalogen", () => {
  it("har Anthropic og xAI med lenker, steg og nøkkelmønster", () => {
    for (const id of ["anthropic", "xai"]) {
      const p = providerInfo(id)!;
      expect(p, id).toBeDefined();
      expect(p.builtIn).toBe(false);
      expect(p.links.apiKeys).toMatch(/^https:\/\//);
      expect(p.keySteps.length).toBeGreaterThan(1);
      expect(p.keyPattern).not.toBeNull();
    }
  });

  it("gir de fire tekstleverandørene egenskapen text og 2–3 tekstmodeller med tokenpris", () => {
    expect([...TEXT_PROVIDERS].sort()).toEqual(["anthropic", "google", "openai", "xai"]);
    for (const id of TEXT_PROVIDERS) {
      const p = PROVIDERS.find((x) => x.id === id)!;
      expect(p.capabilities).toContain("text");
      const text = p.models.filter((m) => m.capability === "text");
      expect(text.length, id).toBeGreaterThanOrEqual(2);
      expect(text.length, id).toBeLessThanOrEqual(3);
      for (const m of text) expect(m.usdPerMTokOut, m.id).toBeGreaterThan(0);
    }
  });

  it("kjenner igjen nøkkelmønstrene", () => {
    expect(checkKeyFormat("anthropic", "sk-ant-api03-" + "a".repeat(40)).warning).toBeNull();
    expect(checkKeyFormat("anthropic", "sk-" + "a".repeat(40)).warning).not.toBeNull();
    expect(checkKeyFormat("xai", "xai-" + "b".repeat(40)).warning).toBeNull();
    expect(checkKeyFormat("xai", "sk-" + "b".repeat(40)).warning).not.toBeNull();
    expect(checkKeyFormat("openai", "sk-" + "c".repeat(40)).warning).toBeNull();
    expect(checkKeyFormat("google", "AIza" + "d".repeat(35)).warning).toBeNull();
  });
});

describe("valg av leverandør og modell", () => {
  const available = [
    { provider: "openai" as const, models: ["gpt-5", "gpt-5-mini"] },
    { provider: "xai" as const, models: [] },
  ];

  it("1: eksplisitt valg vinner", () => {
    const r = chooseTextModel({
      explicit: { provider: "xai", model: "grok-4" },
      task: "script",
      prefs: { script: { provider: "openai", model: "gpt-5" } },
      available,
      isEnabled: allOn,
      lovableModel: LOV,
    });
    expect(r.choice).toEqual({ provider: "xai", model: "grok-4" });
    expect(r.reason).toBe("explicit");
  });

  it("eksplisitt valg uten nøkkel gir feil, ikke stille reserve", () => {
    const r = chooseTextModel({
      explicit: { provider: "anthropic", model: "claude-sonnet-4-5" },
      task: "script",
      prefs: null,
      available,
      isEnabled: allOn,
      lovableModel: LOV,
    });
    expect(r.error).toBeTruthy();
  });

  it("2: brukerens valg for oppgavegruppen", () => {
    expect(TASK_GROUP.storylab_interview).toBe("storylab_talk");
    const r = chooseTextModel({
      task: "storylab_interview",
      prefs: { storylab_talk: { provider: "openai", model: "gpt-5-mini" } },
      available,
      isEnabled: allOn,
      lovableModel: LOV,
    });
    expect(r.choice).toEqual({ provider: "openai", model: "gpt-5-mini" });
    expect(r.reason).toBe("pref");
  });

  it("utdatert valg (modellen finnes ikke lenger) hoppes over", () => {
    const r = chooseTextModel({
      task: "script",
      prefs: { script: { provider: "openai", model: "gpt-3" } },
      available,
      isEnabled: allOn,
      lovableModel: LOV,
    });
    expect(r.reason).toBe("first_key");
    expect(r.choice).toEqual({ provider: "openai", model: "gpt-5" });
  });

  it("3: første leverandør med gyldig nøkkel, og avslåtte modeller hoppes over", () => {
    const r = chooseTextModel({
      task: "general",
      prefs: null,
      available,
      isEnabled: (p, m) => !(p === "openai" && m === "gpt-5"),
      lovableModel: LOV,
    });
    expect(r.choice).toEqual({ provider: "openai", model: "gpt-5-mini" });
    expect(r.reason).toBe("first_key");
  });

  it("tom modelliste bruker katalogens modeller", () => {
    const r = chooseTextModel({
      task: "general",
      prefs: null,
      available: [{ provider: "xai", models: [] }],
      isEnabled: allOn,
      lovableModel: LOV,
    });
    expect(r.choice).toEqual({ provider: "xai", model: "grok-4" });
  });

  it("4: Lovable som reserve uten nøkler", () => {
    const r = chooseTextModel({
      task: "script",
      prefs: null,
      available: [],
      isEnabled: allOn,
      lovableModel: LOV,
    });
    expect(r.choice).toEqual({ provider: "lovable", model: LOV });
    expect(r.reason).toBe("fallback");
  });

  it("ingenting tilgjengelig gir feil", () => {
    const r = chooseTextModel({
      task: "script",
      prefs: null,
      available: [],
      isEnabled: (p) => p !== "lovable",
      lovableModel: LOV,
    });
    expect(r.error).toBeTruthy();
  });

  it("validerer lagrede valg", () => {
    expect(isTextPrefs({ script: { provider: "anthropic", model: "claude-haiku-4-5" } })).toBe(
      true,
    );
    expect(isTextPrefs({ ukjent: { provider: "openai", model: "gpt-5" } })).toBe(false);
    expect(isTextPrefs({ script: { provider: "fal", model: "x" } })).toBe(false);
    expect(isTextPrefs([])).toBe(false);
  });
});

describe("kostnadsanslag", () => {
  it("bruker katalogens tokenpris", () => {
    // Claude Sonnet 4.5: 3 USD inn og 15 USD ut per million tokens
    expect(estimateTextCostUsd("anthropic", "claude-sonnet-4-5", 1_000_000, 1_000_000)).toBe(18);
    expect(estimateTextCostUsd("openai", "gpt-5-mini", 2000, 1000)).toBeCloseTo(0.0025, 6);
  });

  it("ukjente modeller får leverandørens høyeste kjente pris", () => {
    expect(estimateTextCostUsd("anthropic", "claude-ny-modell", 1_000_000, 0)).toBe(15);
  });

  it("Lovable koster 0 for nøkkeltaket, ugyldige tall gir NaN", () => {
    expect(estimateTextCostUsd("lovable", LOV, 1000, 1000)).toBe(0);
    expect(estimateTextCostUsd("openai", "gpt-5", Number.NaN, 1)).toBeNaN();
  });
});

describe("filtrering av leverandørens modelliste", () => {
  it("OpenAI: bare chatmodeller", () => {
    expect(
      filterTextModels("openai", [
        "gpt-5",
        "o3-mini",
        "text-embedding-3-large",
        "whisper-1",
        "gpt-image-1",
        "gpt-4o-realtime-preview",
        "dall-e-3",
        "gpt-5",
      ]),
    ).toEqual(["gpt-5", "o3-mini"]);
  });

  it("xAI, Anthropic og Google", () => {
    expect(filterTextModels("xai", ["grok-4", "grok-2-image", "grok-imagine"])).toEqual(["grok-4"]);
    expect(filterTextModels("anthropic", ["claude-opus-4-1", "x"])).toEqual(["claude-opus-4-1"]);
    expect(
      filterTextModels("google", [
        "gemini-2.5-pro",
        "gemini-embedding-001",
        "imagen-4",
        "gemini-2.5-flash-image",
      ]),
    ).toEqual(["gemini-2.5-pro"]);
  });

  it("kutter lange lister", () => {
    const many = Array.from({ length: 500 }, (_, i) => `grok-${String(i).padStart(3, "0")}`);
    expect(filterTextModels("xai", many)).toHaveLength(200);
  });
});
