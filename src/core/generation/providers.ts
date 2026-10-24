/**
 * AI-leverandører brukerne kan koble til med egne nøkler (DEC-0069, REQ-0566, REQ-0269/0270/0273).
 *
 * Mars 12.10.2026: løsningen viser de mest brukte AI-leverandørene; brukeren velger én eller flere, får
 * lenker til tjenesten (abonnement, API-nøkkel) og legger inn nøkkelen i en dialog. Nøkkelen sikres «etter
 * alle kunstens regler» (kryptert på serveren, vises aldri igjen) og det finnes et overordnet kostnadstak.
 *
 * Katalogen er ren data: hva hver leverandør kan (bilde, video, lyd, tekst), hvilke modeller som brukes,
 * lenkene og et anslag for prisen (i USD, fra leverandørenes prislister oktober 2026 – alltid merket som
 * anslag, REQ-0281). Selve kallene ligger i `src/adapters/ai/providers/`.
 */
import { locale } from "../i18n";
import {
  customModelFrom,
  customRuleFor,
  isModelEnabled,
  isProviderEnabled,
  type ModelSetting,
} from "./model-settings";
import { t, tLocalized } from "@/core/i18n/keyed";

// Administratorens innstillinger (av/på og egne modeller) er en del av katalogens offentlige grensesnitt
export * from "./model-settings";

export type ProviderId =
  "lovable" | "openai" | "google" | "fal" | "runway" | "elevenlabs" | "anthropic" | "xai";

export type Capability =
  "image" | "video" | "video_edit" | "sound" | "speech" | "text" | "upscale" | "alignment";

export const CAPABILITY_LABEL: Record<Capability, string> = tLocalized({ upscale: "core-generation-providers.capability-label.upscale.9094c341367a", image: "core-generation-providers.capability-label.image.0b8183d2bc3f", video: "core-generation-providers.capability-label.video.1599c4fe017d", video_edit: "core-generation-providers.capability-label.video-edit.ec4b5af08091", sound: "core-generation-providers.capability-label.sound.9069d5bcf965", speech: "core-generation-providers.capability-label.speech.a4141d40b4d4", text: "core-generation-providers.capability-label.text.67d66f855964", alignment: "core-generation-providers.capability-label.alignment.315505b5841b" });

/**
 * Bildestørrelse (Mars 2026-10-13: «størrelsen på bildet bør være et eget valg»). Sendes som tjenestens egen
 * parameter der den finnes (Google: image_size), ellers som tjenestens nærmeste faste størrelse.
 */
export type ImageSize = "1K" | "2K" | "4K";
export const IMAGE_SIZE_LABEL: Record<ImageSize, string> = tLocalized({ "1K": "core-generation-providers.image-size-label.1k.77e63d3513b7", "2K": "core-generation-providers.image-size-label.2k.c6bbff2a5487", "4K": "core-generation-providers.image-size-label.4k.cbc35023da20" });

export interface ProviderModel {
  readonly id: string;
  readonly label: string;
  readonly capability: Capability;
  /** Anslått pris i USD: per bilde, per sekund video/lyd, per tegn (tale) eller per kall (tekst). */
  readonly priceUsd: number;
  readonly priceUnit: "image" | "second" | "call" | "character" | "megapixel";
  /** Videolengder modellen tar imot (sekunder). */
  readonly durations?: readonly number[];
  /** Tar imot forbildebilder (bilde) eller startbilde (video). */
  readonly acceptsImage?: boolean;
  /**
   * Leverandørens dokumenterte grense for antall inndatabilder (bilde). Utelatt: ukjent, løsningen bruker
   * `MAX_ATTACHED_IMAGES` (Øystein 23.10).
   */
  readonly maxInputImages?: number;
  /** Explicit storyboard controls; absent capabilities are never advertised as native support. */
  readonly panelAi?: { readonly mask?: boolean; readonly sketch?: boolean; readonly customSize?: boolean; readonly aspects?: readonly string[] };
  /** Kan lage gjennomsiktig bakgrunn (frilagte figurer). */
  readonly transparent?: boolean;
  /** Innsatsnivået modellen passer best til (mandat 19.3, DEC-0070). */
  readonly tier?: EffortLevel;
  /** Andre kvalitetsmekanismer modellen faktisk har (mandat 19.4), på norsk. */
  readonly extras?: readonly string[];
  /** Lengste beskrivelse modellen tar imot (tegn); lengre tekst kortes ned før sending (mandat 19.2). */
  readonly maxPromptChars?: number;
  /** Oppløsning modellen leverer (vises bare som informasjon). */
  readonly resolution?: string;
  /** Video: krever et startbilde (bilde-til-video uten tekst-til-video) – REQ-0273. */
  readonly requiresImage?: boolean;
  /** Tidsbegrensning for lyd: korteste og lengste lengde i sekunder (REQ-0273). */
  readonly soundSeconds?: { readonly min: number; readonly max: number };
  /** Lydfunksjoner modellen har (REQ-0273), på norsk. */
  readonly audio?: readonly string[];
  /** Andre begrensninger brukeren bør kjenne (REQ-0273), på norsk. */
  readonly limits?: readonly string[];
  /** Størrelsene modellen kan lage (bilder); første er standard med mindre `defaultSize` er satt. */
  readonly sizes?: readonly ImageSize[];
  readonly defaultSize?: ImageSize;
  /** Pris per størrelse når den avviker fra `priceUsd`. */
  readonly priceBySize?: Partial<Record<ImageSize, number>>;
  /** Tilbys ikke lenger (står for å vise opphavet til eldre jobber). */
  readonly retired?: boolean;
  /**
   * Video fra 2D-scenen (DEC-0083): korteste og lengste innsendte video (sekunder). Resultatet er like langt
   * som det som sendes.
   */
  readonly editSeconds?: { readonly min: number; readonly max: number };
  /** Hvor mange figurer (med referansebilde) modellen kan følge gjennom klippet; 0 = bare tekst. */
  readonly maxElements?: number;
  /** Lagt til av administrator (ai_model_settings, Mars 15.10.2026) – ikke i den innebygde katalogen. */
  readonly custom?: boolean;
  /** Tekst (T1): anslått pris i USD per million tokens inn og ut (anslag, REQ-0281). */
  readonly usdPerMTokIn?: number;
  readonly usdPerMTokOut?: number;
}

/** Innsatsnivå per oppgave (mandat 19.3): rask/økonomisk, balansert, høy/premium. */
export type EffortLevel = "fast" | "balanced" | "premium";

export const EFFORT_LABEL: Record<EffortLevel, string> = tLocalized({ fast: "core-generation-providers.effort-label.fast.4e975a2b43b7", balanced: "core-generation-providers.effort-label.balanced.934d3da03e98", premium: "core-generation-providers.effort-label.premium.bae890684174" });

export const EFFORT_HELP: Record<EffortLevel, string> = tLocalized({ fast: "core-generation-providers.effort-help.fast.1acbf692ad79", balanced: "core-generation-providers.effort-help.balanced.ae4d0b0e8a3a", premium: "core-generation-providers.effort-help.premium.eb97211de851" });

export interface ProviderInfo {
  readonly id: ProviderId;
  readonly name: string;
  /** Kort forklaring på norsk. */
  readonly description: string;
  readonly capabilities: readonly Capability[];
  /** Innebygd (ingen egen nøkkel, Lovable-arbeidsområdets kreditter). */
  readonly builtIn: boolean;
  readonly links: {
    readonly signup?: string;
    readonly billing?: string;
    readonly apiKeys?: string;
    readonly pricing?: string;
    readonly docs?: string;
  };
  /** Hjelp til å finne nøkkelen, steg for steg. */
  readonly keySteps: readonly string[];
  /** Hvordan nøkkelen ser ut (for en vennlig kontroll før lagring), eller null. */
  readonly keyPattern: RegExp | null;
  readonly models: readonly ProviderModel[];
}

/** Innebygd bildegenerering (Lovable AI Gateway): bakgrunner og andre hele bilder. */
export const LOVABLE_IMAGE_MODEL = "openai/gpt-image-2";
/**
 * Frilagte figurer (lag): GPT Image 2 kan ikke lage gjennomsiktig bakgrunn (Lovable 2026-10-10:
 * «Transparent background is not supported for this model»); GPT Image 2.5 Sunburst kan (KI-71).
 */
export const LOVABLE_CUTOUT_MODEL = "openai/gpt-image-2.5-sunburst";

/**
 * Den innebygde bildemodellen som faktisk brukes (P8-avvik 1): modellen brukeren valgte, når den finnes i den
 * innebygde katalogen, ellers standardmodellen for formålet. Slik er modellen som vises i valget, alltid den
 * samme som lagres i metadataen.
 */
export function builtInImageModel(
  requested: string | null | undefined,
  purpose: string | null | undefined,
  defaults: { readonly image?: string | undefined; readonly cutout?: string | undefined } = {},
): string {
  const catalog = PROVIDERS.find((p) => p.id === "lovable")?.models ?? [];
  if (requested && catalog.some((m) => m.id === requested && m.capability === "image")) return requested;
  return purpose === "cutout"
    ? defaults.cutout || LOVABLE_CUTOUT_MODEL
    : defaults.image || LOVABLE_IMAGE_MODEL;
}

// Tekstfeltene under er getters: teksten velges når den leses, så språkbytte virker også for katalogen.
export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: "lovable",
    get name() {
      return t("core-generation-providers.providers.message.fae659820e31");
    },
    get description() {
      return t("r6-brand.builtin-provider");
    },
    capabilities: ["image", "text"],
    builtIn: true,
    links: { pricing: "https://docs.lovable.dev/features/ai" },
    keySteps: [],
    keyPattern: null,
    models: [
      {
        id: "openai/gpt-image-2",
        label: "GPT Image 2",
        capability: "image",
        priceUsd: 0.06,
        priceUnit: "image",
        acceptsImage: true,
        tier: "balanced",
        maxPromptChars: 32000,
        resolution: "1024–1536 px",
      },
      {
        id: "openai/gpt-image-2.5-sunburst",
        get label() {
          return t("core-generation-providers.models.models.441f815ed440");
        },
        capability: "image",
        priceUsd: 0.08,
        priceUnit: "image",
        acceptsImage: true,
        transparent: true,
        tier: "premium",
        get extras() {
          return [t("core-generation-providers.models.models.639cd27f30a9")];
        },
        maxPromptChars: 32000,
        resolution: "1024–1536 px",
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    get description() {
      return t("core-generation-providers.providers.message.87223e1b609a");
    },
    capabilities: ["image", "video", "text"],
    builtIn: false,
    links: {
      signup: "https://platform.openai.com/signup",
      billing: "https://platform.openai.com/settings/organization/billing/overview",
      apiKeys: "https://platform.openai.com/api-keys",
      pricing: "https://openai.com/api/pricing/",
      docs: "https://developers.openai.com/docs/guides/image-generation",
    },
    get keySteps() {
      return [
        t("core-generation-providers.providers.message.5644cb6e0181"),
        t("core-generation-providers.providers.message.395cf2ebad03"),
        t("core-generation-providers.providers.message.953b4308cdb7"),
        t("core-generation-providers.providers.message.478247762189"),
      ];
    },
    keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/,
    models: [
      textModel("gpt-5", "GPT-5", "premium", 1.25, 10, 400_000),
      textModel("gpt-5-mini", "GPT-5 mini", "fast", 0.25, 2, 400_000),
      {
        id: "gpt-image-2.5-flare",
        panelAi: { customSize: true, mask: true },
        get label() {
          return t("core-generation-providers.models.models.2786815b0be6");
        },
        capability: "image",
        priceUsd: 0.05,
        priceUnit: "image",
        acceptsImage: true,
        maxInputImages: 16,
        tier: "fast",
        maxPromptChars: 32000,
        resolution: "1024–1536 px",
      },
      {
        id: "gpt-image-2.5-sunburst",
        panelAi: { customSize: true, mask: true },
        get label() {
          return t("core-generation-providers.models.models.c3cbe6d08b4f");
        },
        capability: "image",
        priceUsd: 0.08,
        priceUnit: "image",
        acceptsImage: true,
        maxInputImages: 16,
        transparent: true,
        tier: "premium",
        get extras() {
          return [
            t("core-generation-providers.models.models.639cd27f30a9.2"),
            t("core-generation-providers.models.models.85b91cec5695"),
          ];
        },
        maxPromptChars: 32000,
        resolution: "1024–1536 px",
      },
      {
        id: "sora-2",
        label: "Sora 2",
        capability: "video",
        priceUsd: 0.1,
        priceUnit: "second",
        durations: [4, 8, 12],
        acceptsImage: true,
        tier: "balanced",
        get extras() {
          return [t("core-generation-providers.models.models.63ef8d72cc54")];
        },
        maxPromptChars: 4000,
        resolution: "1280×720",
        get audio() {
          return [t("core-generation-providers.models.models.63ef8d72cc54.2")];
        },
      },
    ],
  },
  {
    id: "google",
    name: "Google Gemini",
    get description() {
      return t("core-generation-providers.providers.message.fbf31e640415");
    },
    capabilities: ["image", "video", "text"],
    builtIn: false,
    links: {
      signup: "https://aistudio.google.com/",
      billing: "https://aistudio.google.com/usage",
      apiKeys: "https://aistudio.google.com/apikey",
      pricing: "https://ai.google.dev/gemini-api/docs/pricing",
      docs: "https://ai.google.dev/gemini-api/docs/veo",
    },
    get keySteps() {
      return [
        t("core-generation-providers.providers.message.35b34a9d4c48"),
        t("core-generation-providers.providers.message.c15528e8ebee"),
        t("core-generation-providers.providers.message.ba9a3debdc93"),
      ];
    },
    keyPattern: /^AIza[A-Za-z0-9_-]{30,}$/,
    models: [
      textModel("gemini-2.5-pro", "Gemini 2.5 Pro", "premium", 1.25, 10, 1_000_000),
      textModel("gemini-2.5-flash", "Gemini 2.5 Flash", "fast", 0.3, 2.5, 1_000_000),
      {
        id: "gemini-nano-banana-2.1",
        panelAi: { aspects: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"] },
        label: "Nano Banana 2.1",
        capability: "image",
        priceUsd: 0.04,
        priceUnit: "image",
        acceptsImage: true,
        maxInputImages: 14,
        tier: "fast",
        get extras() {
          return [t("core-generation-providers.models.models.ef3f6478e1f6")];
        },
        maxPromptChars: 8000,
        resolution: "1024 px",
        sizes: ["1K"],
      },
      {
        id: "gemini-3-pro-image",
        panelAi: { aspects: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"] },
        label: "Nano Banana Pro",
        capability: "image",
        priceUsd: 0.14,
        priceUnit: "image",
        acceptsImage: true,
        maxInputImages: 14,
        tier: "premium",
        get extras() {
          return [
            t("core-generation-providers.models.models.ef3f6478e1f6.2"),
            t("core-generation-providers.models.models.02de0748689f"),
          ];
        },
        maxPromptChars: 8000,
        get resolution() {
          return t("core-generation-providers.models.models.a946c5ce40ba");
        },
        sizes: ["1K", "2K", "4K"],
        defaultSize: "2K",
        priceBySize: { "4K": 0.24 },
      },
      {
        id: "veo-3.1-generate-preview",
        label: "Veo 3.1",
        capability: "video",
        priceUsd: 0.4,
        priceUnit: "second",
        durations: [4, 6, 8],
        acceptsImage: true,
        tier: "premium",
        get extras() {
          return [
            t("core-generation-providers.models.models.63ef8d72cc54.3"),
            t("core-generation-providers.models.models.cc7927f1f52f"),
          ];
        },
        maxPromptChars: 3500,
        resolution: "720p/1080p",
        get audio() {
          return [t("core-generation-providers.models.models.63ef8d72cc54.4")];
        },
      },
    ],
  },
  {
    id: "fal",
    name: "fal.ai",
    get description() {
      return t("core-generation-providers.providers.message.492b50a8376f");
    },
    capabilities: ["image", "video", "video_edit", "upscale"],
    builtIn: false,
    links: {
      signup: "https://fal.ai/login",
      billing: "https://fal.ai/dashboard/billing",
      apiKeys: "https://fal.ai/dashboard/keys",
      pricing: "https://fal.ai/pricing",
      docs: "https://fal.ai/docs/model-endpoints/queue",
    },
    get keySteps() {
      return [
        t("core-generation-providers.providers.message.2a67473eaff3"),
        t("core-generation-providers.providers.message.0f15e81eb929"),
        t("core-generation-providers.providers.message.9db345317264"),
      ];
    },
    keyPattern: /^[A-Za-z0-9-]{8,}:[A-Za-z0-9]{16,}$/,
    models: [
      {
        id: "fal-ai/flux-pro/kontext",
        label: "FLUX Kontext Pro",
        panelAi: { aspects: ["1:1", "2:3", "3:2", "16:9", "9:16"] },
        capability: "image",
        priceUsd: 0.04,
        priceUnit: "image",
        acceptsImage: true,
        maxInputImages: 1,
        tier: "balanced",
        maxPromptChars: 2000,
        get resolution() {
          return t("core-generation-providers.models.models.7f92abf8a5bc");
        },
      },
      // DEC-0080 (Mars 14.10.2026: «billige kinesiske modeller»). Priser fra fal.ai oktober 2026.
      {
        id: "fal-ai/bytedance/seedream/v4.5",
        label: "Seedream 4.5 (ByteDance)",
        panelAi: { aspects: ["1:1", "3:4", "4:3", "16:9"] },
        capability: "image",
        priceUsd: 0.04,
        priceUnit: "image",
        acceptsImage: true,
        maxInputImages: 10,
        tier: "balanced",
        get extras() {
          return [
            t("core-generation-providers.models.models.0c16daca9ba0"),
            t("core-generation-providers.models.models.685f5eeb64ba"),
          ];
        },
        maxPromptChars: 4000,
        get resolution() {
          return t("core-generation-providers.models.models.0263845aa8dd");
        },
      },
      {
        id: "fal-ai/qwen-image-edit-plus",
        label: "Qwen-Image-Edit (Alibaba)",
        panelAi: { aspects: ["1:1", "3:4", "4:3", "16:9"] },
        capability: "image",
        // $0,03 per megapiksel; bildene er ca. 1 megapiksel
        priceUsd: 0.03,
        priceUnit: "image",
        acceptsImage: true,
        maxInputImages: 3,
        requiresImage: true,
        tier: "fast",
        get extras() {
          return [
            t("core-generation-providers.models.models.54b8f2f9331f"),
            t("core-generation-providers.models.models.cc7927f1f52f.2"),
          ];
        },
        get limits() {
          return [
            t("core-generation-providers.models.models.140be2bf55a9"),
          ];
        },
        maxPromptChars: 2000,
        get resolution() {
          return t("core-generation-providers.models.models.4a43fccf3184");
        },
      },
      {
        id: "fal-ai/seedvr/upscale/image",
        get label() {
          return t("core-generation-providers.models.models.558fec70e3d3");
        },
        capability: "upscale",
        priceUsd: 0.001,
        priceUnit: "megapixel",
        tier: "fast",
        get extras() {
          return [
            t("core-generation-providers.models.models.8ef474ee374b"),
          ];
        },
        // Ingen beskrivelse sendes; grensen gjelder bare teksten i loggen
        maxPromptChars: 2000,
        get resolution() {
          return t("core-generation-providers.models.models.3f2a3533893c");
        },
      },
      {
        id: "fal-ai/clarity-upscaler",
        get label() {
          return t("core-generation-providers.models.models.12328e5217d6");
        },
        capability: "upscale",
        priceUsd: 0.03,
        priceUnit: "megapixel",
        tier: "premium",
        get extras() {
          return [
            t("core-generation-providers.models.models.e43597156ef3"),
          ];
        },
        maxPromptChars: 2000,
        get resolution() {
          return t("core-generation-providers.models.models.3f2a3533893c.2");
        },
      },
      {
        id: "fal-ai/kling-video/v3/4k/image-to-video",
        get label() {
          return t("core-generation-providers.models.models.6ae94317288c");
        },
        capability: "video",
        priceUsd: 0.42,
        priceUnit: "second",
        durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        acceptsImage: true,
        tier: "premium",
        maxPromptChars: 2500,
        resolution: "4K",
        requiresImage: true,
        get limits() {
          return [t("core-generation-providers.models.models.0120272a3729")];
        },
      },
      {
        // DEC-0083: tegner 2D-scenen om til ferdig film; bevegelse, timing og kamera følger videoen
        id: "fal-ai/kling-video/o3/pro/video-to-video/edit",
        get label() {
          return t("core-generation-providers.models.models.d406bfcf6278");
        },
        capability: "video_edit",
        priceUsd: 0.168,
        priceUnit: "second",
        editSeconds: { min: 3, max: 15 },
        maxElements: 4,
        acceptsImage: true,
        tier: "premium",
        maxPromptChars: 2500,
        get resolution() {
          return t("core-generation-providers.models.models.7f5e13cfb0f4");
        },
        get limits() {
          return [
            t("core-generation-providers.models.models.e72a15589197"),
            t("core-generation-providers.models.models.76872f5ba94f"),
          ];
        },
      },
    ],
  },
  {
    id: "runway",
    name: "Runway",
    get description() {
      return t("core-generation-providers.providers.message.15e28b63ca2f");
    },
    capabilities: ["video", "video_edit"],
    builtIn: false,
    links: {
      signup: "https://dev.runwayml.com/",
      billing: "https://dev.runwayml.com/",
      apiKeys: "https://dev.runwayml.com/",
      pricing: "https://docs.dev.runwayml.com/guides/pricing/",
      docs: "https://docs.dev.runwayml.com/",
    },
    get keySteps() {
      return [
        t("core-generation-providers.providers.message.3f6a75c4e842"),
        t("core-generation-providers.providers.message.e4624ce04071"),
        t("core-generation-providers.providers.message.f37a0bd9791d"),
      ];
    },
    keyPattern: /^key_[A-Za-z0-9]{20,}$/,
    models: [
      {
        id: "gen4_turbo",
        label: "Gen-4 Turbo",
        capability: "video",
        priceUsd: 0.05,
        priceUnit: "second",
        durations: [5, 10],
        acceptsImage: true,
        tier: "fast",
        maxPromptChars: 1000,
        resolution: "1280×720",
        requiresImage: true,
        get limits() {
          return [t("core-generation-providers.models.models.0120272a3729.2")];
        },
      },
      {
        // DEC-0083: Aleph 2 tegner om en video etter en tekst; tar ikke referansebilder av figurene
        id: "aleph2",
        get label() {
          return t("core-generation-providers.models.models.9797a7daa22c");
        },
        capability: "video_edit",
        priceUsd: 0.28,
        priceUnit: "second",
        editSeconds: { min: 2, max: 30 },
        maxElements: 0,
        tier: "premium",
        maxPromptChars: 1000,
        get resolution() {
          return t("core-generation-providers.models.models.a65a6abd888a");
        },
        get limits() {
          return [
            t("core-generation-providers.models.models.7aa51f0bba63"),
            t("core-generation-providers.models.models.b86c4402093a"),
          ];
        },
      },
    ],
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    get description() {
      return t("core-generation-providers.providers.message.e0ee4a58ed79");
    },
    capabilities: ["sound", "speech"],
    builtIn: false,
    links: {
      signup: "https://elevenlabs.io/app/sign-up",
      billing: "https://elevenlabs.io/app/subscription",
      apiKeys: "https://elevenlabs.io/app/settings/api-keys",
      pricing: "https://elevenlabs.io/pricing/api",
      docs: "https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert",
    },
    get keySteps() {
      return [
        t("core-generation-providers.providers.message.cb382fe23ea5"),
        t("core-generation-providers.providers.message.58305044d7e4"),
        t("core-generation-providers.providers.message.8c8224966290"),
      ];
    },
    keyPattern: /^(sk_)?[A-Za-z0-9]{32,}$/,
    models: [
      {
        id: "eleven_text_to_sound_v2",
        get label() {
          return t("core-generation-providers.models.models.54a213b395a1");
        },
        capability: "sound",
        priceUsd: 0.012,
        priceUnit: "second",
        tier: "balanced",
        get extras() {
          return [t("core-generation-providers.models.models.533d357f2dd8")];
        },
        maxPromptChars: 1000,
        soundSeconds: { min: 0.5, max: 30 },
        get audio() {
          return [
            t("core-generation-providers.models.models.d65ac0de7bcb"),
            t("core-generation-providers.models.models.533d357f2dd8.2"),
          ];
        },
      },
      {
        id: "eleven_v3",
        get label() {
          return t("core-generation-providers.models.models.09e58f8380ff");
        },
        capability: "speech",
        priceUsd: 0.0003,
        priceUnit: "character",
        tier: "premium",
        maxPromptChars: 5000,
        get extras() {
          return [
            t("core-generation-providers.models.models.7e6a0484f813"),
            t("core-generation-providers.models.models.8a0825594c8c"),
          ];
        },
        get audio() {
          return [
            t("core-generation-providers.models.models.d9137a4dadc8"),
            t("core-generation-providers.models.models.7e6a0484f813.2"),
            t("core-generation-providers.models.models.0b47ec937e8c"),
          ];
        },
      },
      {
        // Ord-til-lyd (DEC-0095): samme pris som tale-til-tekst, 0,22 USD per time lyd (oktober 2026)
        id: "forced-alignment",
        get label() {
          return t("core-generation-providers.models.models.93c7648e5047");
        },
        capability: "alignment",
        priceUsd: 0.22 / 3600,
        priceUnit: "second",
        tier: "balanced",
        // Manusteksten som kobles (replikken)
        maxPromptChars: 20_000,
        get limits() {
          return [
            t("core-generation-providers.models.models.5803710a68c5"),
          ];
        },
      },
      {
        // Brukes ikke lenger (kan ikke norsk); står for å vise opphavet til eldre opptak
        id: "eleven_multilingual_v2",
        get label() {
          return t("core-generation-providers.models.models.d1aaedac4f6d");
        },
        retired: true,
        capability: "speech",
        priceUsd: 0.0003,
        priceUnit: "character",
        tier: "balanced",
        maxPromptChars: 5000,
        get extras() {
          return [
            t("core-generation-providers.models.models.7e6a0484f813.3"),
            t("core-generation-providers.models.models.18ddb38254de"),
          ];
        },
        get audio() {
          return [
            t("core-generation-providers.models.models.d9137a4dadc8.2"),
            t("core-generation-providers.models.models.7e6a0484f813.4"),
            t("core-generation-providers.models.models.18ddb38254de.2"),
          ];
        },
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    get description() {
      return t("core-generation-providers.providers.message.8e79364fc993");
    },
    capabilities: ["text"],
    builtIn: false,
    links: {
      signup: "https://console.anthropic.com/",
      billing: "https://console.anthropic.com/settings/billing",
      apiKeys: "https://console.anthropic.com/settings/keys",
      pricing: "https://www.anthropic.com/pricing#api",
      docs: "https://docs.anthropic.com/en/api/messages",
    },
    get keySteps() {
      return [
        t("core-generation-providers.providers.message.340d37018508"),
        t("core-generation-providers.providers.message.cc6a980aa945"),
        t("core-generation-providers.providers.message.5c712e78bf84"),
      ];
    },
    keyPattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    models: [
      textModel("claude-sonnet-4-5", "Claude Sonnet 4.5", "balanced", 3, 15, 200_000),
      textModel("claude-haiku-4-5", "Claude Haiku 4.5", "fast", 1, 5, 200_000),
      textModel("claude-opus-4-1", "Claude Opus 4.1", "premium", 15, 75, 200_000),
    ],
  },
  {
    id: "xai",
    name: "xAI Grok",
    get description() {
      return t("core-generation-providers.providers.message.d6c8579aceb7");
    },
    capabilities: ["text"],
    builtIn: false,
    links: {
      signup: "https://console.x.ai/",
      billing: "https://console.x.ai/",
      apiKeys: "https://console.x.ai/",
      pricing: "https://docs.x.ai/docs/models",
      docs: "https://docs.x.ai/docs/api-reference",
    },
    get keySteps() {
      return [
        t("core-generation-providers.providers.message.b3569009e306"),
        t("core-generation-providers.providers.message.423e80cdaf9a"),
        t("core-generation-providers.providers.message.e3bf20933260"),
      ];
    },
    keyPattern: /^xai-[A-Za-z0-9_-]{20,}$/,
    models: [
      textModel("grok-4", "Grok 4", "premium", 3, 15, 256_000),
      textModel("grok-3-mini", "Grok 3 mini", "fast", 0.3, 0.5, 131_072),
    ],
  },
];

export function providerInfo(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function isProviderId(id: unknown): id is ProviderId {
  return typeof id === "string" && PROVIDERS.some((p) => p.id === id);
}

// ---------------------------------------------------------------- administratorens innstillinger

/**
 * Innstillingene fra adminsiden (ai_model_settings) som gjelder i nettleseren nå. Settes av
 * `useAiModelSettings` (React Query, hentes én gang og bufres), så alle valglister som bruker katalogen
 * (providersFor, effortChoice, providerModel) skjuler avslåtte modeller og viser egne modeller uten at hver
 * liste må hente innstillingene selv. Tom liste = katalogen som før. Serveren sender alltid innstillingene
 * eksplisitt (parameteren `settings`) og bruker aldri denne verdien.
 */
let activeSettings: readonly ModelSetting[] = [];

export function setCatalogSettings(settings: readonly ModelSetting[]): void {
  activeSettings = settings;
}

export function catalogSettings(): readonly ModelSetting[] {
  return activeSettings;
}

/** Den innebygde modellen (uten egne modeller). */
export function builtInModel(provider: string, model: string): ProviderModel | undefined {
  return providerInfo(provider)?.models.find((m) => m.id === model);
}

/** Egne modeller hos leverandøren (av og på), som katalogmodeller. */
export function customModelsOf(
  provider: string,
  settings: readonly ModelSetting[] = activeSettings,
): ProviderModel[] {
  const out: ProviderModel[] = [];
  for (const s of settings) {
    if (s.provider !== provider || !s.custom || builtInModel(provider, s.model)) continue;
    // Malen (den innebygde modellen i samme familie) gir de tekniske egenskapene
    const rule = s.kind ? customRuleFor(provider, s.kind, s.model) : undefined;
    const m = customModelFrom(s, rule ? builtInModel(provider, rule.template) : undefined);
    if (m) out.push(m);
  }
  return out;
}

/** Modellen hos leverandøren (innebygd eller lagt til av administrator), eller undefined. */
export function providerModel(
  provider: string,
  model: string,
  settings: readonly ModelSetting[] = activeSettings,
): ProviderModel | undefined {
  return (
    builtInModel(provider, model) ?? customModelsOf(provider, settings).find((m) => m.id === model)
  );
}

/**
 * Leverandører (med modeller) som kan lage dette, blant de tilkoblede. Avslåtte leverandører og modeller
 * er tatt bort; egne modeller (lagt til av administrator) står etter de innebygde.
 */
export function providersFor(
  capability: Capability,
  connected: ReadonlySet<string>,
  settings: readonly ModelSetting[] = activeSettings,
): { provider: ProviderInfo; models: ProviderModel[] }[] {
  return PROVIDERS.filter(
    (p) => (p.builtIn || connected.has(p.id)) && isProviderEnabled(settings, p.id),
  )
    .map((p) => ({
      provider: p,
      models: [...p.models, ...customModelsOf(p.id, settings)].filter(
        (m) => m.capability === capability && !m.retired && isModelEnabled(settings, p.id, m.id),
      ),
    }))
    .filter((x) => x.models.length > 0);
}

/**
 * Anslått kostnad i USD for en jobb (REQ-0281: alltid et anslag). Video og lyd: pris per sekund × lengde;
 * bilder: per bilde. Ukjent modell: null.
 */
export function estimateCostUsd(
  provider: string,
  model: string,
  opts: {
    readonly seconds?: number;
    readonly images?: number;
    readonly characters?: number;
    readonly size?: ImageSize;
    /** Megapiksler i resultatet (oppskalering). */
    readonly megapixels?: number;
  } = {},
  settings: readonly ModelSetting[] = activeSettings,
): number | null {
  const m = providerModel(provider, model, settings);
  if (!m) return null;
  // Ugyldige tall gir ukjent pris, aldri NaN (som ville sluppet gjennom kostnadstaket)
  for (const v of [opts.seconds, opts.images, opts.characters, opts.megapixels])
    if (v !== undefined && !Number.isFinite(v)) return null;
  const n =
    m.priceUnit === "second"
      ? Math.max(0, opts.seconds ?? 0)
      : m.priceUnit === "character"
        ? Math.max(0, opts.characters ?? 0)
        : m.priceUnit === "megapixel"
          ? Math.max(0.1, opts.megapixels ?? 1)
          : Math.max(1, opts.images ?? 1);
  const unit = (opts.size && m.priceBySize?.[opts.size]) ?? m.priceUsd;
  return Math.round(unit * n * 1000) / 1000;
}

/** Størrelsene en bildemodell kan lage, og standardvalget. */
export function imageSizesOf(m: ProviderModel | undefined): {
  readonly sizes: readonly ImageSize[];
  readonly standard: ImageSize | null;
} {
  const sizes = m?.sizes ?? [];
  return { sizes, standard: m?.defaultSize ?? sizes[0] ?? null };
}

/** «…abcd»: bare de fire siste tegnene lagres og vises (nøkkelen vises aldri igjen). */
export function keyHint(key: string): string {
  const k = key.trim();
  return k.length < 12 ? "…" : `…${k.slice(-4)}`;
}

/**
 * En vennlig kontroll av nøkkelen før lagring: ikke tom, ingen mellomrom eller linjeskift, rimelig lengde,
 * og (advarsel) om den ikke ser ut som leverandørens nøkler. Gir feilmelding, advarsel eller ingenting.
 */
export function checkKeyFormat(
  provider: string,
  key: string,
): { readonly error: string | null; readonly warning: string | null } {
  const k = key.trim();
  if (!k) return { error: t("core-generation-providers.error.error.8bcda4f149e6"), warning: null };
  if (/\s/.test(k))
    return {
      error: t("core-generation-providers.error.error.1b3204ff58f8"),
      warning: null,
    };
  if (k.length < 16 || k.length > 512)
    return {
      error: t("core-generation-providers.error.error.267611fb2469"),
      warning: null,
    };
  const p = providerInfo(provider);
  if (!p) return { error: t("core-generation-providers.error.error.2280b978f1da"), warning: null };
  if (p.builtIn)
    return {
      error: t("core-generation-providers.error.error.22895e764383"),
      warning: null,
    };
  if (p.keyPattern && !p.keyPattern.test(k))
    return {
      error: null,
      warning: t("core-generation-providers.warning.warning.114a04890e58", { name: String(p.name) }),
    };
  return { error: null, warning: null };
}

/** Overordnet kostnadstak (DEC-0069): månedlig tak i USD for alle prosjekter som bruker brukerens nøkler. */
export const MAX_ACCOUNT_CAP_USD = 100_000;

/** Bruk denne måneden mot taket (null = ingen tak). */
export function capRemaining(capUsd: number | null, usedUsd: number): number | null {
  return capUsd === null ? null : Math.max(0, Math.round((capUsd - usedUsd) * 100) / 100);
}

/** «$12.40» – leverandørene tar betalt i USD. */
export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return t("core-generation-providers.format-usd.message.846590d9f5fb");
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------- Innsatsnivå og kvalitetsmekanismer

export interface ModelChoice {
  readonly provider: ProviderInfo;
  readonly model: ProviderModel;
}

const TIER_RANK: Record<EffortLevel, number> = { fast: 0, balanced: 1, premium: 2 };

/**
 * Modellen som passer innsatsnivået best blant de tilgjengelige (mandat 19.3): samme nivå først (billigste
 * ved rask, dyreste ved premium), ellers nærmeste nivå. Null når ingen modell kan oppgaven.
 */
export function effortChoice(
  capability: Capability,
  level: EffortLevel,
  connected: ReadonlySet<string>,
  settings: readonly ModelSetting[] = activeSettings,
): ModelChoice | null {
  // Den innebygde leverandøren velger selv modell etter formålet: regnes som én modell
  const all = providersFor(capability, connected, settings).flatMap((o) =>
    (o.provider.builtIn ? o.models.slice(0, 1) : o.models).map((m) => ({
      provider: o.provider,
      model: m,
    })),
  );
  if (!all.length) return null;
  const want = TIER_RANK[level];
  const dist = (c: ModelChoice) => Math.abs(TIER_RANK[c.model.tier ?? "balanced"] - want);
  return [...all].sort(
    (a, b) =>
      dist(a) - dist(b) ||
      (level === "premium"
        ? b.model.priceUsd - a.model.priceUsd
        : a.model.priceUsd - b.model.priceUsd) ||
      a.model.id.localeCompare(b.model.id),
  )[0]!;
}

/** Innsatsnivået en valgt modell hører til. */
export function effortOf(model: ProviderModel | undefined): EffortLevel {
  return model?.tier ?? "balanced";
}

// ---------------------------------------------------------------- M8 kvalitetsprofiler (REQ-0854–0862)

/** AI-typen i kvalitetsprofilen som svarer til en oppgave (null: profilen styrer ikke denne oppgaven). */
export function profileKindOf(
  capability: Capability,
): import("./quality-profile").QualityProfileModelKind | null {
  switch (capability) {
    case "image":
    case "upscale":
      return "image";
    case "video":
    case "video_edit":
      return "video";
    case "speech":
      return "speech";
    case "sound":
      return "sound";
    default:
      return null;
  }
}

/**
 * Modellvalget en kvalitetsprofil gir for en oppgave (REQ-0856): en uttrykkelig modell i profilen brukes
 * når den er tilgjengelig (leverandøren er koblet til, eller innebygd); ellers velger profilens
 * innsatsnivå som i effortChoice. Uten profil (eller uten treff) er svaret null – oppførselen er da
 * nøyaktig som før profilene fantes.
 */
export function profileChoice(
  capability: Capability,
  profile: Pick<import("./quality-profile").QualityProfile, "spec"> | null,
  connected: ReadonlySet<string>,
  settings: readonly ModelSetting[] = activeSettings,
): ModelChoice | null {
  if (!profile) return null;
  const kind = profileKindOf(capability);
  if (!kind) return null;
  const modelId = profile.spec.models?.[kind];
  if (modelId) {
    for (const o of providersFor(capability, connected, settings)) {
      const m = o.models.find((x) => x.id === modelId);
      if (m) return { provider: o.provider, model: m };
    }
    // Modellen i profilen er ikke tilgjengelig lenger: fall tilbake på innsatsnivået
  }
  return effortChoice(capability, profile.spec.effort ?? "balanced", connected, settings);
}

/** Kvalitetsmekanismene modellen faktisk har (mandat 19.4), som korte tekster på norsk. */
export function qualityMechanisms(model: ProviderModel): string[] {
  const out: string[] = [];
  if (model.resolution)
    out.push(t("core-generation-providers.quality-mechanisms.out-push.e66f441770d7", { resolution: String(model.resolution) }));
  if (model.durations?.length) {
    const d = model.durations;
    out.push(
      d.length > 3
        ? t("core-generation-providers.quality-mechanisms.out-push.af05c6a3b81a", { value1: String(d[0]), value2: String(d[d.length - 1]) })
        : d.length > 1 ? t("core-generation-providers.lengths", { list: d.slice(0, -1).join(", "), last: d[d.length - 1]! }) : t("core-generation-providers.length", { last: d[d.length - 1]! }),
    );
  }
  if (model.acceptsImage)
    out.push(
      model.capability === "video"
        ? t("core-generation-providers.quality-mechanisms.out-push.872fedcca32c")
        : t("core-generation-providers.quality-mechanisms.out-push.5a32879d280c"),
    );
  if (model.capability === "image")
    out.push(
      t("core-generation-providers.quality-mechanisms.out-push.b0f78cf604ad"),
    );
  if (model.transparent) out.push(t("core-generation-providers.quality-mechanisms.out-push.fd17baccd39f"));
  for (const e of model.extras ?? []) if (!out.includes(e)) out.push(e);
  return out;
}

/** Programmet lover ikke at dyrere gir bedre (mandat 19.3, REQ-0277). */
export function effortDisclaimer(): string {
  return t("core-generation-providers.effort-disclaimer.message.ad77f3fea910");
}

/** En linje i kostnadsanslaget før bekreftelse (mandat 19.5, REQ-0280). */
export interface CostLine {
  readonly label: string;
  readonly value: string;
}

/**
 * Alt kostnadsanslaget bygger på, vist i bekreftelsen (REQ-0280, DEC-0075): modell, innsatsnivå, oppløsning,
 * antall genereringer (kandidater × segmenter), lengde, ekstrarunder og samlet anslag. Felt modellen ikke har,
 * utelates (kravet sier «så langt mulig»).
 */
export function costBreakdown(
  provider: Pick<ProviderInfo, "name">,
  model: ProviderModel,
  opts: {
    /** Antall genereringer per mål (kandidater). */
    readonly candidates?: number;
    /** Antall mål (segmenter, bilder …); standard 1. */
    readonly targets?: number;
    /** Hva målene heter i flertall («segmenter»). */
    readonly targetsLabel?: string;
    /** Lengde per generering i sekunder (video/lyd); flere verdier vises som spenn. */
    readonly seconds?: readonly number[];
    /** Lengden er ikke valgt (lyd): anslaget er regnet med denne lengste lengden. */
    readonly assumedMaxSeconds?: number;
    /** Samlet anslag ferdig formatert («ca. 1,20 USD» / «12 kreditter»), eller null = ukjent. */
    readonly total: string | null;
  },
): CostLine[] {
  const fmt = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 1 });
  const cand = Math.max(1, opts.candidates ?? 1);
  const targets = Math.max(1, opts.targets ?? 1);
  const targetsWord = opts.targetsLabel ?? t("core-generation-providers.targets-word.message.8006c8a2ee35");
  const out: CostLine[] = [
    { label: t("core-generation-providers.label.label.1590da4c130f"), value: `${provider.name} – ${model.label}` },
    { label: t("core-generation-providers.label.label.feda3b15e97d"), value: EFFORT_LABEL[effortOf(model)] },
  ];
  if (model.resolution) out.push({ label: t("core-generation-providers.label.label.c2f177847629"), value: model.resolution });
  const generations = cand * targets;
  out.push({
    label: t("core-generation-providers.label.label.81c02fd12e52"),
    value:
      targets > 1 || cand > 1
        ? t("core-generation-providers.generations", {
  generations,
  detail: (targets > 1 ? ` (${targets} ${targetsWord}` : " (") + (cand > 1 ? t("core-generation-providers.generations-candidates", { times: targets > 1 ? " × " : "", count: cand }) : ")"),
})
        : t("core-generation-providers.value.value.a8927c6f3176"),
  });
  const secs = (opts.seconds ?? []).filter((s) => s > 0);
  if (secs.length) {
    const lo = Math.min(...secs);
    const hi = Math.max(...secs);
    out.push({
      label: t("core-generation-providers.label.label.a6dbd4fe6028"),
      value: lo === hi ? t("core-generation-providers.value.value.8d18db3db6f5", { value1: String(fmt(lo)) }) : `${fmt(lo)}–${fmt(hi)} s`,
    });
  } else if (opts.assumedMaxSeconds)
    out.push({
      label: t("core-generation-providers.label.label.a6dbd4fe6028.2"),
      value: t("core-generation-providers.value.value.ce0bbea6908b", { value1: String(fmt(opts.assumedMaxSeconds)) }),
    });
  out.push({
    label: t("core-generation-providers.label.label.52938752bbdd"),
    value: t("core-generation-providers.value.value.27cda8eca4c9"),
  });
  out.push({
    label: t("core-generation-providers.label.label.dafb278acd09"),
    value: opts.total ?? t("core-generation-providers.value.value.b7021620a041"),
  });
  return out;
}

/** Det mandatet krever at en leverandørintegrasjon beskriver (mandat 19.2, REQ-0273, DEC-0075). */
export interface ModelCapabilities {
  readonly task: Capability;
  readonly maxVideoSeconds: number | null;
  readonly durations: readonly number[];
  readonly resolution: string | null;
  readonly referenceImages: boolean;
  readonly imageToVideo: boolean;
  readonly textToVideo: boolean;
  /** Tidsbegrensninger på norsk (lengder, lengste beskrivelse). */
  readonly timeLimits: readonly string[];
  readonly quality: { readonly effort: EffortLevel; readonly mechanisms: readonly string[] };
  readonly audio: readonly string[];
  readonly costModel: { readonly priceUsd: number; readonly unit: ProviderModel["priceUnit"] };
  readonly limits: readonly string[];
}

export function modelCapabilities(model: ProviderModel): ModelCapabilities {
  const d = model.durations ?? [];
  const video = model.capability === "video";
  const time: string[] = [];
  if (d.length)
    time.push(
      t("core-generation-providers.model-capabilities.time-push.e581a157b1cb", { value1: String(d[0]), value2: String(d[d.length - 1]) }),
    );
  if (model.soundSeconds)
    time.push(
      t("core-generation-providers.model-capabilities.time-push.3088c3c141e0", { value1: String(model.soundSeconds.min.toLocaleString(locale())), max: String(model.soundSeconds.max) }),
    );
  const limits = [...(model.limits ?? [])];
  if (model.maxPromptChars)
    limits.push(
      t("core-generation-providers.model-capabilities.limits-push.66a8a9509c75", { value1: String(model.maxPromptChars.toLocaleString(locale())) }),
    );
  return {
    task: model.capability,
    maxVideoSeconds: d.length ? d[d.length - 1]! : null,
    durations: d,
    resolution: model.resolution ?? null,
    referenceImages: !video && !!model.acceptsImage,
    imageToVideo: video && !!model.acceptsImage,
    textToVideo: video && !model.requiresImage,
    timeLimits: time,
    quality: { effort: effortOf(model), mechanisms: qualityMechanisms(model) },
    audio: model.audio ?? [],
    costModel: { priceUsd: model.priceUsd, unit: model.priceUnit },
    limits,
  };
}

// ---------------------------------------------------------------- tekst-AI med egne nøkler (T1)

/** En tekstmodell i katalogen. Prisene er anslag (per million tokens) og kan være utdaterte. */
function textModel(
  id: string,
  label: string,
  tier: EffortLevel,
  usdPerMTokIn: number,
  usdPerMTokOut: number,
  contextTokens: number,
): ProviderModel {
  return {
    id,
    label,
    capability: "text",
    // Konservativt: halve kontekstvinduet til prompten, regnet som 4 tegn per token
    maxPromptChars: Math.floor(contextTokens / 2) * 4,
    // Per kall: et typisk kall med 2 000 tokens inn og 1 000 ut (bare til visning)
    priceUsd: Math.round(((2000 * usdPerMTokIn + 1000 * usdPerMTokOut) / 1e6) * 10000) / 10000,
    priceUnit: "call",
    tier,
    usdPerMTokIn,
    usdPerMTokOut,
  };
}

export type TextProviderId = "anthropic" | "openai" | "google" | "xai";
/** Leverandørene med egne tekstnøkler, i den rekkefølgen «første gyldige nøkkel» prøver dem. */
export const TEXT_PROVIDERS: readonly TextProviderId[] = ["anthropic", "openai", "google", "xai"];

export function isTextProviderId(v: unknown): v is TextProviderId {
  return typeof v === "string" && (TEXT_PROVIDERS as readonly string[]).includes(v);
}

export type TextTask =
  | "script"
  | "storylab_character"
  | "storylab_group"
  | "storylab_analysis"
  | "storylab_interview"
  | "storylab_profile"
  | "general";
export const TEXT_TASKS: readonly TextTask[] = [
  "script",
  "storylab_character",
  "storylab_group",
  "storylab_analysis",
  "storylab_interview",
  "storylab_profile",
  "general",
];
export function isTextTask(v: unknown): v is TextTask {
  return typeof v === "string" && (TEXT_TASKS as readonly string[]).includes(v);
}

/** Oppgavegruppene brukeren velger modell for. */
export type TextTaskGroup = "script" | "storylab_talk" | "storylab_analysis" | "general";
export const TEXT_TASK_GROUPS: readonly TextTaskGroup[] = [
  "script",
  "storylab_talk",
  "storylab_analysis",
  "general",
];
export const TASK_GROUP: Record<TextTask, TextTaskGroup> = {
  script: "script",
  storylab_character: "storylab_talk",
  storylab_group: "storylab_talk",
  storylab_interview: "storylab_talk",
  storylab_analysis: "storylab_analysis",
  storylab_profile: "storylab_analysis",
  general: "general",
};
export const TEXT_TASK_GROUP_LABEL: Record<TextTaskGroup, string> = tLocalized({ script: "core-generation-providers.text-task-group-label.script.cddea2355733", storylab_talk: "core-generation-providers.text-task-group-label.storylab-talk.c09215cfaa29", storylab_analysis: "core-generation-providers.text-task-group-label.storylab-analysis.011a03c061a7", general: "core-generation-providers.text-task-group-label.general.95b26a644ca6" });

/** Brukerens valg for én oppgavegruppe. */
export interface TextChoice {
  readonly provider: TextProviderId | "lovable";
  readonly model: string;
}
export type TextPrefs = Partial<Record<TextTaskGroup, TextChoice>>;
/** Nøkkelen i profiles.ui_prefs. */
export const TEXT_PREFS_KEY = "aiText";

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/;
export function isTextModelId(v: unknown): v is string {
  return typeof v === "string" && MODEL_ID.test(v);
}

export function isTextPrefs(v: unknown): v is TextPrefs {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  for (const [k, c] of Object.entries(v as Record<string, unknown>)) {
    if (!(TEXT_TASK_GROUPS as readonly string[]).includes(k)) return false;
    if (!c || typeof c !== "object") return false;
    const x = c as Record<string, unknown>;
    if (!(x["provider"] === "lovable" || isTextProviderId(x["provider"]))) return false;
    if (!isTextModelId(x["model"])) return false;
  }
  return true;
}

/** En leverandør med gyldig tekstnøkkel og modellene som er hentet (tom = katalogens). */
export interface AvailableTextProvider {
  readonly provider: TextProviderId;
  readonly models: readonly string[];
}

/** Modellene som kan velges hos leverandøren: den hentede listen, ellers katalogens. */
export function textModelsOf(a: AvailableTextProvider): string[] {
  if (a.models.length) return [...a.models];
  return (providerInfo(a.provider)?.models ?? [])
    .filter((m) => m.capability === "text" && !m.retired)
    .map((m) => m.id);
}

export type TextChoiceReason = "explicit" | "pref" | "first_key" | "fallback";

/**
 * Leverandør og modell for et tekstkall (T1): eksplisitt valg, så brukerens valg for oppgavegruppen, så
 * første leverandør med gyldig nøkkel, så Lovable AI som reserve. Avslåtte modeller (administrator) og
 * leverandører uten nøkkel hoppes over. `lovableModel` er reservens modell.
 * Eksplisitt valg som ikke kan brukes gir `error` (faller ikke stille tilbake).
 */
export function chooseTextModel(input: {
  readonly explicit?:
    { readonly provider?: string | undefined; readonly model?: string | undefined } | undefined;
  readonly task: TextTask;
  readonly prefs: TextPrefs | null;
  readonly available: readonly AvailableTextProvider[];
  readonly isEnabled: (provider: string, model: string) => boolean;
  readonly lovableModel: string;
}):
  | { readonly choice: TextChoice; readonly reason: TextChoiceReason; readonly error?: undefined }
  | { readonly error: string; readonly choice?: undefined; readonly reason?: undefined } {
  const avail = new Map(input.available.map((a) => [a.provider, a]));
  const usable = (provider: string, model: string): boolean => {
    if (!input.isEnabled(provider, model)) return false;
    if (provider === "lovable") return true;
    const a = avail.get(provider as TextProviderId);
    return !!a && textModelsOf(a).includes(model);
  };
  const firstModel = (provider: string): string | null => {
    if (provider === "lovable")
      return input.isEnabled("lovable", input.lovableModel) ? input.lovableModel : null;
    const a = avail.get(provider as TextProviderId);
    if (!a) return null;
    return textModelsOf(a).find((m) => input.isEnabled(provider, m)) ?? null;
  };
  const ex = input.explicit;
  if (ex && (ex.provider || ex.model)) {
    const provider = ex.provider ?? "";
    if (provider !== "lovable" && !isTextProviderId(provider))
      return { error: t("core-generation-providers.error.error.11758911bc46") };
    const model = ex.model ?? firstModel(provider);
    if (!model || !usable(provider, model))
      return {
        error: t("core-generation-providers.error.error.d30b0da81464"),
      };
    return { choice: { provider: provider as TextChoice["provider"], model }, reason: "explicit" };
  }
  const pref = input.prefs?.[TASK_GROUP[input.task]];
  // Innebygd AI som valg: modellen velges av serveren
  if (pref?.provider === "lovable" && input.isEnabled("lovable", input.lovableModel))
    return { choice: { provider: "lovable", model: input.lovableModel }, reason: "pref" };
  if (pref && pref.provider !== "lovable" && usable(pref.provider, pref.model))
    return { choice: pref, reason: "pref" };
  for (const p of TEXT_PROVIDERS) {
    const m = firstModel(p);
    if (m) return { choice: { provider: p, model: m }, reason: "first_key" };
  }
  if (input.isEnabled("lovable", input.lovableModel))
    return { choice: { provider: "lovable", model: input.lovableModel }, reason: "fallback" };
  return {
    error: t("core-generation-providers.error.error.943436f0735d"),
  };
}

/** Grovt anslag: ett token per fire tegn. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Høyeste kjente tokenpris hos leverandøren (brukes for modeller som ikke står i katalogen). */
function maxTextPrice(provider: string): { inp: number; out: number } {
  const ms = (providerInfo(provider)?.models ?? []).filter(
    (m) => m.capability === "text" && m.usdPerMTokIn !== undefined,
  );
  if (!ms.length) return { inp: 15, out: 75 };
  return {
    inp: Math.max(...ms.map((m) => m.usdPerMTokIn ?? 0)),
    out: Math.max(...ms.map((m) => m.usdPerMTokOut ?? 0)),
  };
}

/**
 * Anslått kostnad (USD) for et tekstkall. Ukjente modeller får leverandørens høyeste kjente pris, så
 * anslaget heller blir for høyt enn for lavt. Lovable (innebygd) koster 0 for nøkkeltaket.
 */
export function estimateTextCostUsd(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  if (provider === "lovable") return 0;
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return Number.NaN;
  const m = builtInModel(provider, model);
  const price =
    m && m.capability === "text" && m.usdPerMTokIn !== undefined
      ? { inp: m.usdPerMTokIn, out: m.usdPerMTokOut ?? m.usdPerMTokIn }
      : maxTextPrice(provider);
  const usd = (Math.max(0, inputTokens) * price.inp + Math.max(0, outputTokens) * price.out) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}

/** Største antall modeller som lagres per nøkkel. */
export const MAX_STORED_TEXT_MODELS = 200;

const OPENAI_SKIP =
  /embedding|whisper|tts|dall-e|image|audio|realtime|transcribe|moderation|search|instruct|codex/i;
const XAI_SKIP = /image|imagine|vision-only|embed/i;
const GOOGLE_SKIP = /embedding|aqa|imagen|veo|tts|image/i;

/**
 * Tekst- og chatmodellene i leverandørens egen modelliste (ID-ene), sortert, uten duplikater og høyst
 * MAX_STORED_TEXT_MODELS. Google: `ids` er navnene uten «models/», og bare de med generateContent.
 */
export function filterTextModels(provider: TextProviderId, ids: readonly string[]): string[] {
  const ok = ids.filter((id) => {
    if (!isTextModelId(id)) return false;
    switch (provider) {
      case "anthropic":
        return id.startsWith("claude");
      case "openai":
        return /^(gpt-|o\d|chatgpt-)/.test(id) && !OPENAI_SKIP.test(id);
      case "xai":
        return id.startsWith("grok") && !XAI_SKIP.test(id);
      case "google":
        return id.startsWith("gemini") && !GOOGLE_SKIP.test(id);
    }
  });
  return [...new Set(ok)].sort().slice(0, MAX_STORED_TEXT_MODELS);
}
