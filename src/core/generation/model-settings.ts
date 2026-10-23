/**
 * Administratorens innstillinger for AI-modellene (Mars 15.10.2026, DEC-0088, migrasjon 0034): hver leverandør
 * og hver modell i den innebygde katalogen kan slås av og på for alle brukere, og administrator kan legge til
 * nye modeller hos leverandører vi allerede støtter – men bare der adapteren faktisk kan kalle en vilkårlig
 * modell uten ny kode (se CUSTOM_MODEL_RULES).
 *
 * Ren logikk uten avhengighet til katalogen (unngår sirkulær import): katalogen (providers.ts) bruker
 * funksjonene her, og sammenstillingen for adminsiden ligger i ai-catalog.ts.
 */

import type { Capability, ProviderId, ProviderModel } from "./providers";
import { t } from "@/core/i18n/keyed";

/** Typen administrator velger for en egen modell (tabellens `kind`). */
export type ModelKind = "image" | "video" | "sound" | "text";
/** Prisenheten i tabellen (`price_unit`); tom = ikke oppgitt. */
export type SettingPriceUnit = "" | "image" | "second" | "call" | "character";

/** '*' = hele leverandøren. */
export const ALL_MODELS = "*";

export const MODEL_KINDS: readonly ModelKind[] = ["image", "video", "sound", "text"];
const PROVIDER_IDS: readonly ProviderId[] = [
  "lovable",
  "openai",
  "google",
  "fal",
  "runway",
  "elevenlabs",
  "anthropic",
  "xai",
];
const PRICE_UNITS: readonly SettingPriceUnit[] = ["", "image", "second", "call", "character"];

/** Én rad i ai_model_settings, slik programmet bruker den. */
export interface ModelSetting {
  readonly provider: ProviderId;
  readonly model: string;
  readonly enabled: boolean;
  readonly custom: boolean;
  readonly kind: ModelKind | null;
  readonly label: string;
  readonly priceUsd: number | null;
  readonly priceUnit: SettingPriceUnit;
  readonly note: string;
  readonly updatedAt: string | null;
}

/** Leser en rad fra databasen forsiktig; ukjente eller ødelagte rader gir null (og ignoreres). */
export function settingFromRow(row: unknown): ModelSetting | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const provider = r["provider"];
  const model = r["model"];
  if (typeof provider !== "string" || !PROVIDER_IDS.includes(provider as ProviderId)) return null;
  if (typeof model !== "string" || !model || model.length > 200) return null;
  const kind = r["kind"];
  const unit = r["price_unit"] ?? r["priceUnit"] ?? "";
  const price = r["price_usd"] ?? r["priceUsd"] ?? null;
  const priceNum = price === null || price === undefined || price === "" ? null : Number(price);
  return {
    provider: provider as ProviderId,
    model,
    enabled: r["enabled"] !== false,
    custom: r["custom"] === true,
    kind: MODEL_KINDS.includes(kind as ModelKind) ? (kind as ModelKind) : null,
    label: typeof r["label"] === "string" ? r["label"].slice(0, 120) : "",
    priceUsd: priceNum !== null && Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : null,
    priceUnit: PRICE_UNITS.includes(unit as SettingPriceUnit) ? (unit as SettingPriceUnit) : "",
    note: typeof r["note"] === "string" ? r["note"].slice(0, 500) : "",
    updatedAt:
      typeof r["updated_at"] === "string"
        ? r["updated_at"]
        : typeof r["updatedAt"] === "string"
          ? r["updatedAt"]
          : null,
  };
}

/** Raden for (leverandør, modell), eller undefined. */
export function findSetting(
  settings: readonly ModelSetting[],
  provider: string,
  model: string,
): ModelSetting | undefined {
  return settings.find((s) => s.provider === provider && s.model === model);
}

/** Er leverandøren slått på? (Ingen rad = på, som før administrator rørte noe.) */
export function isProviderEnabled(settings: readonly ModelSetting[], provider: string): boolean {
  return findSetting(settings, provider, ALL_MODELS)?.enabled !== false;
}

/** Er modellen slått på – både leverandøren og selve modellen? */
export function isModelEnabled(
  settings: readonly ModelSetting[],
  provider: string,
  model: string,
): boolean {
  return (
    isProviderEnabled(settings, provider) &&
    findSetting(settings, provider, model)?.enabled !== false
  );
}

/** Hvorfor en modell ikke kan brukes, eller null når den kan. */
export function disabledReason(
  settings: readonly ModelSetting[],
  provider: string,
  model: string,
): "provider" | "model" | null {
  if (!isProviderEnabled(settings, provider)) return "provider";
  if (findSetting(settings, provider, model)?.enabled === false) return "model";
  return null;
}

/** Forståelig melding (begge språk) når en avslått modell likevel bestilles. */
export function disabledMessage(reason: "provider" | "model"): string {
  return reason === "provider"
    ? t("core-generation-model-settings.disabled-message.message.b704c2a7edea")
    : t("core-generation-model-settings.disabled-message.message.4cb258ded509");
}

// ---------------------------------------------------------------- egne modeller

/**
 * Familiene en egen modell kan høre til. Hver regel peker på den innebygde modellen («mal») som bruker samme
 * vei gjennom adapteren (src/adapters/ai/providers.server.ts): den egne modellen arver malens tekniske
 * egenskaper (lengder, startbilde, forbildebilder, lengste beskrivelse), mens navn og pris er administratorens.
 * Bare det adapteren faktisk sender videre er tatt med:
 * - fal.ai: modell-ID-en går rett inn i adressen (FAL_MODEL = /^fal-ai\/[a-z0-9./-]+$/), men feltene som sendes
 *   er bygd for Seedream, Qwen-Image-Edit, FLUX Kontext og Kling – derfor bare disse familiene.
 * - OpenAI og Google: modellnavnet sendes videre uendret (bilder og video).
 * - Runway: modellnavnet sendes videre for video fra startbilde.
 * - ElevenLabs: model_id sendes videre for lydeffekter.
 * Lovable (innebygd) velger modell selv, og tekstmodeller velges ikke i appen: ingen egne modeller der.
 */
export interface CustomModelRule {
  readonly provider: ProviderId;
  readonly kind: ModelKind;
  readonly pattern: RegExp;
  /** Den innebygde modellen som gir de tekniske egenskapene. */
  readonly template: string;
  /** Eksempel som vises i skjemaet. */
  readonly example: string;
}

export const CUSTOM_MODEL_RULES: readonly CustomModelRule[] = [
  {
    provider: "fal",
    kind: "image",
    pattern: /^fal-ai\/bytedance\/seedream\/[a-z0-9.-]+$/,
    template: "fal-ai/bytedance/seedream/v4.5",
    example: "fal-ai/bytedance/seedream/v5",
  },
  {
    provider: "fal",
    kind: "image",
    pattern: /^fal-ai\/qwen-image-edit[a-z0-9.-]*$/,
    template: "fal-ai/qwen-image-edit-plus",
    example: "fal-ai/qwen-image-edit-2509",
  },
  {
    provider: "fal",
    kind: "image",
    pattern: /^fal-ai\/flux-pro\/kontext\/[a-z0-9.-]+$/,
    template: "fal-ai/flux-pro/kontext",
    example: "fal-ai/flux-pro/kontext/max",
  },
  {
    provider: "fal",
    kind: "video",
    pattern: /^fal-ai\/kling-video\/[a-z0-9.-]+(\/[a-z0-9.-]+)*\/video-to-video\/edit$/,
    template: "fal-ai/kling-video/o3/pro/video-to-video/edit",
    example: "fal-ai/kling-video/o3/standard/video-to-video/edit",
  },
  {
    provider: "fal",
    kind: "video",
    pattern: /^fal-ai\/kling-video\/[a-z0-9.-]+(\/[a-z0-9.-]+)*\/image-to-video$/,
    template: "fal-ai/kling-video/v3/4k/image-to-video",
    example: "fal-ai/kling-video/v3/pro/image-to-video",
  },
  {
    provider: "openai",
    kind: "image",
    pattern: /^gpt-image-[a-z0-9.-]+$/,
    template: "gpt-image-2.5-flare",
    example: "gpt-image-2.5",
  },
  {
    provider: "openai",
    kind: "video",
    pattern: /^sora-[a-z0-9.-]+$/,
    template: "sora-2",
    example: "sora-2-pro",
  },
  {
    provider: "google",
    kind: "image",
    pattern: /^gemini-[a-z0-9.-]+$/,
    template: "gemini-nano-banana-2.1",
    example: "gemini-2.5-flash-image",
  },
  {
    provider: "google",
    kind: "video",
    pattern: /^veo-[a-z0-9.-]+$/,
    template: "veo-3.1-generate-preview",
    example: "veo-3.1-fast-generate-preview",
  },
  {
    provider: "runway",
    kind: "video",
    pattern: /^gen[0-9][a-z0-9_.]*$/,
    template: "gen4_turbo",
    example: "gen4.5",
  },
  {
    provider: "elevenlabs",
    kind: "sound",
    pattern: /^eleven_[a-z0-9_]*sound[a-z0-9_]*$/,
    template: "eleven_text_to_sound_v2",
    example: "eleven_text_to_sound_v3",
  },
];

/** Leverandørene som kan få egne modeller. */
export function customProviders(): ProviderId[] {
  return [...new Set(CUSTOM_MODEL_RULES.map((r) => r.provider))];
}

/** Typene en leverandør kan få egne modeller for. */
export function customKinds(provider: string): ModelKind[] {
  return [...new Set(CUSTOM_MODEL_RULES.filter((r) => r.provider === provider).map((r) => r.kind))];
}

/** Prisenheten som gjelder for typen (anslaget regnes ut med denne). */
export function priceUnitFor(kind: ModelKind): Exclude<SettingPriceUnit, ""> {
  return kind === "image" ? "image" : kind === "text" ? "call" : "second";
}

/** Regelen modell-ID-en hører til, eller undefined. */
export function customRuleFor(
  provider: string,
  kind: string,
  model: string,
): CustomModelRule | undefined {
  return CUSTOM_MODEL_RULES.find(
    (r) => r.provider === provider && r.kind === kind && r.pattern.test(model),
  );
}

export const MAX_MODEL_ID = 120;

/** Grunnkontroll av en modell-ID: små bokstaver, tall og . _ / -, 3–120 tegn, ingen tomme ledd. */
export function modelIdShapeOk(model: string): boolean {
  return (
    model.length >= 3 &&
    model.length <= MAX_MODEL_ID &&
    /^[a-z0-9][a-z0-9._/-]*[a-z0-9]$/.test(model) &&
    !model.includes("..") &&
    !model.includes("//")
  );
}

export interface CustomModelInput {
  readonly provider: ProviderId;
  readonly model: string;
  readonly kind: ModelKind;
  readonly label: string;
  readonly priceUsd: number;
  readonly priceUnit: Exclude<SettingPriceUnit, "">;
  readonly note: string;
}

/**
 * Streng kontroll av en ny modell (brukes både i skjemaet og på serveren). `isBuiltIn` sier om modellen
 * allerede står i den innebygde katalogen.
 */
export function validateCustomModel(
  raw: unknown,
  isBuiltIn: (provider: string, model: string) => boolean,
): { ok: true; value: CustomModelInput } | { ok: false; error: string } {
  const x = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const provider = x["provider"];
  if (typeof provider !== "string" || !PROVIDER_IDS.includes(provider as ProviderId))
    return { ok: false, error: t("core-generation-model-settings.error.error.315cfe58e815") };
  if (!customProviders().includes(provider as ProviderId))
    return {
      ok: false,
      error: t("core-generation-model-settings.error.error.c786766a47f3"),
    };
  const kind = x["kind"];
  if (typeof kind !== "string" || !MODEL_KINDS.includes(kind as ModelKind))
    return { ok: false, error: t("core-generation-model-settings.error.error.0bf8ecd783b4") };
  if (!customKinds(provider).includes(kind as ModelKind))
    return {
      ok: false,
      error: t("core-generation-model-settings.error.error.20edf9496074"),
    };
  const model = typeof x["model"] === "string" ? x["model"].trim() : "";
  if (!modelIdShapeOk(model))
    return {
      ok: false,
      error: t("core-generation-model-settings.error.error.0a26b7ee6e8f", { MAX_MODEL_ID: String(MAX_MODEL_ID) }),
    };
  if (isBuiltIn(provider, model))
    return {
      ok: false,
      error: t("core-generation-model-settings.error.error.b10ecc9fd6bf"),
    };
  const rule = customRuleFor(provider, kind, model);
  if (!rule) {
    const examples = CUSTOM_MODEL_RULES.filter((r) => r.provider === provider && r.kind === kind)
      .map((r) => r.example)
      .join(", ");
    return {
      ok: false,
      error: t("core-generation-model-settings.error.error.abe635a53f77", { examples: String(examples) }),
    };
  }
  const label = typeof x["label"] === "string" ? x["label"].trim() : "";
  if (!label || label.length > 120)
    return {
      ok: false,
      error: t("core-generation-model-settings.error.error.aeca493671a4"),
    };
  const price = typeof x["priceUsd"] === "number" ? x["priceUsd"] : Number.NaN;
  if (!Number.isFinite(price) || price < 0 || price > 1000)
    return {
      ok: false,
      error: t("core-generation-model-settings.error.error.3772d693926e"),
    };
  const unit = x["priceUnit"];
  if (unit !== priceUnitFor(kind as ModelKind))
    return { ok: false, error: t("core-generation-model-settings.error.error.96e8a66d2b02") };
  const note = typeof x["note"] === "string" ? x["note"].trim() : "";
  if (note.length > 500)
    return { ok: false, error: t("core-generation-model-settings.error.error.d3d54a9e9919") };
  return {
    ok: true,
    value: {
      provider: provider as ProviderId,
      model,
      kind: kind as ModelKind,
      label,
      priceUsd: Math.round(price * 10_000) / 10_000,
      priceUnit: unit as Exclude<SettingPriceUnit, "">,
      note,
    },
  };
}

/**
 * Den egne modellen som en katalogmodell: malens tekniske egenskaper, administratorens navn og pris, merket
 * «lagt til av administrator». Null når raden ikke er en gyldig egen modell (eller malen mangler).
 */
export function customModelFrom(
  s: ModelSetting,
  template: ProviderModel | undefined,
): ProviderModel | null {
  if (!s.custom || !s.kind || !template) return null;
  const rule = customRuleFor(s.provider, s.kind, s.model);
  if (!rule || rule.template !== template.id) return null;
  const unit: Exclude<SettingPriceUnit, ""> = s.priceUnit || priceUnitFor(s.kind);
  const name = s.label || s.model;
  const capability: Capability = template.capability;
  return {
    id: s.model,
    get label() {
      return t("core-generation-model-settings.custom-model-from.message.b5f43fc4ccf2", { name: String(name) });
    },
    capability,
    priceUsd: s.priceUsd ?? 0,
    priceUnit: unit,
    custom: true,
    tier: "balanced",
    ...(template.durations ? { durations: template.durations } : {}),
    ...(template.acceptsImage !== undefined ? { acceptsImage: template.acceptsImage } : {}),
    ...(template.requiresImage !== undefined ? { requiresImage: template.requiresImage } : {}),
    ...(template.maxInputImages !== undefined ? { maxInputImages: template.maxInputImages } : {}),
    ...(template.maxPromptChars !== undefined ? { maxPromptChars: template.maxPromptChars } : {}),
    ...(template.soundSeconds ? { soundSeconds: template.soundSeconds } : {}),
    ...(template.editSeconds ? { editSeconds: template.editSeconds } : {}),
    ...(template.maxElements !== undefined ? { maxElements: template.maxElements } : {}),
    get limits() {
      return template.limits;
    },
  } as ProviderModel;
}
