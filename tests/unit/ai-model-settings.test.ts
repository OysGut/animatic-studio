/**
 * DEC-0088 (Mars 15.10.2026): administratorens av/på for AI-leverandører og -modeller, egne modeller hos
 * leverandører vi allerede støtter, og at valglistene (providersFor, effortChoice) og prisanslaget bruker
 * innstillingene. Ren logikk i src/core/generation.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  CUSTOM_MODEL_RULES,
  PROVIDERS,
  customKinds,
  customProviders,
  disabledReason,
  effortChoice,
  estimateCostUsd,
  isModelEnabled,
  isProviderEnabled,
  modelIdShapeOk,
  providerModel,
  providersFor,
  setCatalogSettings,
  settingFromRow,
  validateCustomModel,
  type ModelSetting,
} from "@/core";
import { builtInModel } from "@/core/generation/providers";
import { adminCatalog, modelAvailability, priceText } from "@/core/generation/ai-catalog";

const isBuiltIn = (p: string, m: string) => !!builtInModel(p, m);

function setting(
  over: Partial<ModelSetting> & Pick<ModelSetting, "provider" | "model">,
): ModelSetting {
  return {
    enabled: true,
    custom: false,
    kind: null,
    label: "",
    priceUsd: null,
    priceUnit: "",
    note: "",
    updatedAt: null,
    ...over,
  };
}

const SEEDREAM5 = setting({
  provider: "fal",
  model: "fal-ai/bytedance/seedream/v5",
  custom: true,
  kind: "image",
  label: "Seedream 5",
  priceUsd: 0.05,
  priceUnit: "image",
});

afterEach(() => setCatalogSettings([]));

describe("DEC-0088 – innstillingene leses forsiktig fra databasen", () => {
  it("gyldige rader tolkes, ødelagte og ukjente leverandører ignoreres", () => {
    const s = settingFromRow({
      provider: "fal",
      model: "fal-ai/bytedance/seedream/v5",
      enabled: false,
      custom: true,
      kind: "image",
      label: "Seedream 5",
      price_usd: "0.0500",
      price_unit: "image",
      note: "",
      updated_at: "2026-10-15T10:00:00Z",
    });
    expect(s).toMatchObject({ enabled: false, custom: true, priceUsd: 0.05, priceUnit: "image" });
    expect(settingFromRow({ provider: "midjourney", model: "x" })).toBeNull();
    expect(settingFromRow({ provider: "fal", model: "" })).toBeNull();
    expect(settingFromRow(null)).toBeNull();
    // Ukjent type og enhet blir tomme, negativ pris blir ukjent
    expect(
      settingFromRow({ provider: "fal", model: "a", kind: "3d", price_unit: "kg", price_usd: -1 }),
    ).toMatchObject({ kind: null, priceUnit: "", priceUsd: null, enabled: true });
  });
});

describe("DEC-0088 – av og på for leverandør og modell", () => {
  it("ingen rader: alt er på (katalogen som før)", () => {
    for (const p of PROVIDERS)
      for (const m of p.models) expect(isModelEnabled([], p.id, m.id)).toBe(true);
  });
  it("leverandøren av slår av alle modellene; modellen av slår bare av den", () => {
    const off = [setting({ provider: "google", model: "*", enabled: false })];
    expect(isProviderEnabled(off, "google")).toBe(false);
    expect(isModelEnabled(off, "google", "veo-3.1-generate-preview")).toBe(false);
    expect(disabledReason(off, "google", "veo-3.1-generate-preview")).toBe("provider");
    const one = [setting({ provider: "fal", model: "fal-ai/flux-pro/kontext", enabled: false })];
    expect(isModelEnabled(one, "fal", "fal-ai/flux-pro/kontext")).toBe(false);
    expect(disabledReason(one, "fal", "fal-ai/flux-pro/kontext")).toBe("model");
    expect(isModelEnabled(one, "fal", "fal-ai/bytedance/seedream/v4.5")).toBe(true);
  });
  it("valglistene (providersFor) skjuler avslåtte leverandører og modeller", () => {
    const connected = new Set(["fal", "google", "openai"]);
    const settings = [
      setting({ provider: "google", model: "*", enabled: false }),
      setting({ provider: "fal", model: "fal-ai/flux-pro/kontext", enabled: false }),
    ];
    const list = providersFor("image", connected, settings);
    expect(list.map((x) => x.provider.id)).not.toContain("google");
    const fal = list.find((x) => x.provider.id === "fal")!;
    expect(fal.models.map((m) => m.id)).not.toContain("fal-ai/flux-pro/kontext");
    expect(fal.models.map((m) => m.id)).toContain("fal-ai/bytedance/seedream/v4.5");
    // Uten innstillinger: som før
    expect(providersFor("image", connected).some((x) => x.provider.id === "google")).toBe(true);
  });
  it("innsatsnivået velger aldri en avslått modell", () => {
    const connected = new Set(["fal", "google"]);
    const before = effortChoice("image", "premium", connected)!;
    const off = [setting({ provider: before.provider.id, model: before.model.id, enabled: false })];
    const after = effortChoice("image", "premium", connected, off)!;
    expect(after.model.id).not.toBe(before.model.id);
  });
  it("innstillingene som gjelder i nettleseren (setCatalogSettings) brukes av valglistene", () => {
    setCatalogSettings([setting({ provider: "lovable", model: "*", enabled: false })]);
    expect(providersFor("image", new Set()).length).toBe(0);
    setCatalogSettings([]);
    expect(providersFor("image", new Set()).length).toBe(1);
  });
});

describe("DEC-0088 – egne modeller hos leverandører vi allerede støtter", () => {
  it("bare leverandører og typer der adapteren kan kalle en vilkårlig modell", () => {
    expect(customProviders().sort()).toEqual(["elevenlabs", "fal", "google", "openai", "runway"]);
    expect(customProviders()).not.toContain("lovable");
    expect(customKinds("fal").sort()).toEqual(["image", "video"]);
    expect(customKinds("elevenlabs")).toEqual(["sound"]);
    // Hver regel har en mal i den innebygde katalogen, og eksemplet passer med regelen
    for (const r of CUSTOM_MODEL_RULES) {
      expect(builtInModel(r.provider, r.template), r.template).toBeDefined();
      expect(r.pattern.test(r.example), r.example).toBe(true);
      // fal-ID-ene må passe med adapterens FAL_MODEL
      if (r.provider === "fal") expect(/^fal-ai\/[a-z0-9./-]+$/.test(r.example)).toBe(true);
    }
  });
  it("modell-ID-en kontrolleres strengt", () => {
    expect(modelIdShapeOk("fal-ai/bytedance/seedream/v5")).toBe(true);
    for (const bad of [
      "",
      "ab",
      "Fal-AI/x",
      "fal-ai/../secret",
      "fal-ai//x",
      "fal-ai/x/",
      "https://evil.example/x",
      "fal-ai/x?y=1",
      "fal ai/x",
      "x".repeat(121),
    ])
      expect(modelIdShapeOk(bad), bad).toBe(false);
  });
  const ok = {
    provider: "fal",
    kind: "image",
    model: "fal-ai/bytedance/seedream/v5",
    label: "Seedream 5",
    priceUsd: 0.05,
    priceUnit: "image",
    note: "",
  };
  it("en gyldig modell godtas og normaliseres", () => {
    const v = validateCustomModel({ ...ok, model: "  fal-ai/bytedance/seedream/v5 " }, isBuiltIn);
    expect(v).toEqual({
      ok: true,
      value: { ...ok, provider: "fal", kind: "image", model: "fal-ai/bytedance/seedream/v5" },
    });
  });
  it.each([
    [{ provider: "midjourney" }, /Ukjent leverandør/],
    [{ provider: "lovable" }, /uten ny kode/],
    [{ kind: "sound" }, /typen modell/],
    [{ kind: "text", provider: "openai" }, /typen modell/],
    [{ model: "fal-ai/../x" }, /små bokstaver/],
    [{ model: "fal-ai/some-new/model" }, /passer ikke/],
    [{ model: "fal-ai/flux-pro/kontext" }, /innebygde katalogen/],
    [{ label: "" }, /navn/],
    [{ priceUsd: -1 }, /prisen/],
    [{ priceUsd: Number.NaN }, /prisen/],
    [{ priceUsd: "0.05" }, /prisen/],
    [{ priceUnit: "second" }, /prisenhet/],
    [{ note: "x".repeat(501) }, /for lang/],
  ])("avvises: %o", (patch, msg) => {
    const v = validateCustomModel({ ...ok, ...patch }, isBuiltIn);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(msg);
  });
  it("Kling-video fra startbilde og fra 2D-scenen havner i riktig oppgave", () => {
    const i2v = setting({
      provider: "fal",
      model: "fal-ai/kling-video/v3/pro/image-to-video",
      custom: true,
      kind: "video",
      label: "Kling 3 Pro",
      priceUsd: 0.2,
      priceUnit: "second",
    });
    const v2v = setting({
      provider: "fal",
      model: "fal-ai/kling-video/o3/standard/video-to-video/edit",
      custom: true,
      kind: "video",
      label: "Kling O3 Standard",
      priceUsd: 0.1,
      priceUnit: "second",
    });
    const a = providerModel("fal", i2v.model, [i2v, v2v])!;
    const b = providerModel("fal", v2v.model, [i2v, v2v])!;
    expect(a.capability).toBe("video");
    expect(a.requiresImage).toBe(true);
    expect(a.durations).toEqual(
      builtInModel("fal", "fal-ai/kling-video/v3/4k/image-to-video")!.durations,
    );
    expect(b.capability).toBe("video_edit");
    expect(b.editSeconds).toEqual({ min: 3, max: 15 });
  });
  it("egne modeller vises i valglistene med oppgitt pris og merket «lagt til av administrator»", () => {
    const list = providersFor("image", new Set(["fal"]), [SEEDREAM5]);
    const m = list.find((x) => x.provider.id === "fal")!.models.at(-1)!;
    expect(m.id).toBe("fal-ai/bytedance/seedream/v5");
    expect(m.custom).toBe(true);
    expect(m.label).toBe("Seedream 5 (lagt til av administrator)");
    expect(m.priceUsd).toBe(0.05);
    expect(estimateCostUsd("fal", m.id, { images: 2 }, [SEEDREAM5])).toBe(0.1);
    // Uten innstillingene finnes den ikke
    expect(providerModel("fal", m.id)).toBeUndefined();
    expect(estimateCostUsd("fal", m.id, { images: 1 })).toBeNull();
    // Slått av: borte fra listen, men navnet finnes fortsatt (eldre jobber)
    const off = [{ ...SEEDREAM5, enabled: false }];
    expect(providersFor("image", new Set(["fal"]), off)[0]!.models.map((x) => x.id)).not.toContain(
      m.id,
    );
    expect(providerModel("fal", m.id, off)?.label).toMatch(/Seedream 5/);
  });
  it("en egen modell som ikke passer med reglene, brukes aldri", () => {
    const bad = { ...SEEDREAM5, model: "fal-ai/unknown/model" };
    expect(providerModel("fal", bad.model, [bad])).toBeUndefined();
    expect(
      adminCatalog([bad])
        .find((p) => p.id === "fal")!
        .models.at(-1),
    ).toMatchObject({
      id: "fal-ai/unknown/model",
      broken: true,
      usable: false,
    });
  });
});

describe("DEC-0088 – katalogen for adminsiden og serverens kontroll", () => {
  it("alle leverandører og modeller med pris og hva de kan", () => {
    const c = adminCatalog([
      SEEDREAM5,
      setting({ provider: "runway", model: "*", enabled: false }),
    ]);
    expect(c.map((p) => p.id)).toEqual(PROVIDERS.map((p) => p.id));
    const fal = c.find((p) => p.id === "fal")!;
    expect(fal.models.find((m) => m.id === "fal-ai/flux-pro/kontext")).toMatchObject({
      enabled: true,
      usable: true,
      custom: false,
      priceUsd: 0.04,
      priceUnit: "image",
    });
    expect(fal.models.find((m) => m.custom)!.features.length).toBeGreaterThan(0);
    const runway = c.find((p) => p.id === "runway")!;
    expect(runway.enabled).toBe(false);
    expect(runway.models.every((m) => m.enabled && !m.usable)).toBe(true);
    // Modeller som ikke tilbys lenger, vises ikke
    expect(c.find((p) => p.id === "elevenlabs")!.models.map((m) => m.id)).not.toContain(
      "eleven_multilingual_v2",
    );
  });
  it("serveren avviser avslåtte og ukjente modeller med forståelig melding", () => {
    const off = [setting({ provider: "openai", model: "sora-2", enabled: false })];
    const r = modelAvailability(off, "openai", "sora-2", ["video"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/slått av denne AI-modellen/);
    const p = modelAvailability(
      [setting({ provider: "openai", model: "*", enabled: false })],
      "openai",
      "gpt-image-2.5-flare",
    );
    if (!p.ok) expect(p.message).toMatch(/slått av denne AI-leverandøren/);
    expect(modelAvailability([], "openai", "gpt-image-9").ok).toBe(false);
    expect(modelAvailability([], "openai", "sora-2", ["image"]).ok).toBe(false);
    expect(modelAvailability([SEEDREAM5], "fal", SEEDREAM5.model, ["image"]).ok).toBe(true);
  });
  it("prisen vises med enhet", () => {
    expect(priceText(0.04, "image")).toMatch(/0,04 USD per bilde|0\.04 USD per bilde/);
    expect(priceText(null, null)).toBe("pris ikke oppgitt");
  });
});
