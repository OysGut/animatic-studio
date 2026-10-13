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

export type ProviderId = "lovable" | "openai" | "google" | "fal" | "runway" | "elevenlabs";

export type Capability = "image" | "video" | "sound" | "speech" | "text";

export const CAPABILITY_LABEL: Record<Capability, string> = {
  image: "Bilder",
  video: "Video",
  sound: "Lyd",
  speech: "Tale",
  text: "Tekst",
};

/**
 * Bildestørrelse (Mars 2026-10-13: «størrelsen på bildet bør være et eget valg»). Sendes som tjenestens egen
 * parameter der den finnes (Google: image_size), ellers som tjenestens nærmeste faste størrelse.
 */
export type ImageSize = "1K" | "2K" | "4K";
export const IMAGE_SIZE_LABEL: Record<ImageSize, string> = {
  "1K": "Liten (ca. 1000 px)",
  "2K": "Middels (ca. 2000 px)",
  "4K": "Stor (ca. 4000 px)",
};

export interface ProviderModel {
  readonly id: string;
  readonly label: string;
  readonly capability: Capability;
  /** Anslått pris i USD: per bilde, per sekund video/lyd, per tegn (tale) eller per kall (tekst). */
  readonly priceUsd: number;
  readonly priceUnit: "image" | "second" | "call" | "character";
  /** Videolengder modellen tar imot (sekunder). */
  readonly durations?: readonly number[];
  /** Tar imot forbildebilder (bilde) eller startbilde (video). */
  readonly acceptsImage?: boolean;
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
}

/** Innsatsnivå per oppgave (mandat 19.3): rask/økonomisk, balansert, høy/premium. */
export type EffortLevel = "fast" | "balanced" | "premium";

export const EFFORT_LABEL: Record<EffortLevel, string> = {
  fast: "Rask / Økonomisk",
  balanced: "Balansert",
  premium: "Høy / Premium",
};

export const EFFORT_HELP: Record<EffortLevel, string> = {
  fast: "Lavere kostnad og raske skisser.",
  balanced: "En fornuftig kombinasjon av kvalitet, pris og tid.",
  premium: "Den mest omfattende modellen, med forbildebilder og flere kandidater der det støttes.",
};

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

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: "lovable",
    name: "Lovable AI (innebygd)",
    description:
      "Bruker kredittene i Lovable-arbeidsområdet. Ingen egen nøkkel – slått på for prosjektet i Lovable.",
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
        label: "GPT Image 2.5 Sunburst (frilagt)",
        capability: "image",
        priceUsd: 0.08,
        priceUnit: "image",
        acceptsImage: true,
        transparent: true,
        tier: "premium",
        extras: ["Gjennomsiktig bakgrunn"],
        maxPromptChars: 32000,
        resolution: "1024–1536 px",
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    description:
      "Bilder med GPT Image og video med Sora. Betaling forhåndsbetales i OpenAI Platform.",
    capabilities: ["image", "video", "text"],
    builtIn: false,
    links: {
      signup: "https://platform.openai.com/signup",
      billing: "https://platform.openai.com/settings/organization/billing/overview",
      apiKeys: "https://platform.openai.com/api-keys",
      pricing: "https://openai.com/api/pricing/",
      docs: "https://developers.openai.com/docs/guides/image-generation",
    },
    keySteps: [
      "Opprett konto eller logg inn på platform.openai.com.",
      "Legg inn betalingskort og kjøp kreditt under Billing (OpenAI tar ikke betalt uten forhåndsbetaling).",
      "Verifiser organisasjonen hvis OpenAI ber om det (kreves for bildemodellene).",
      "Gå til API keys → «Create new secret key», gi den navnet «Animatic Studio» og kopier den (begynner med sk-).",
    ],
    keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/,
    models: [
      {
        id: "gpt-image-2.5-flare",
        label: "GPT Image 2.5 Flare (rask)",
        capability: "image",
        priceUsd: 0.05,
        priceUnit: "image",
        acceptsImage: true,
        tier: "fast",
        maxPromptChars: 32000,
        resolution: "1024–1536 px",
      },
      {
        id: "gpt-image-2.5-sunburst",
        label: "GPT Image 2.5 Sunburst (presis, frilagt)",
        capability: "image",
        priceUsd: 0.08,
        priceUnit: "image",
        acceptsImage: true,
        transparent: true,
        tier: "premium",
        extras: ["Gjennomsiktig bakgrunn", "Kvalitetsvalg hos leverandøren (høy)"],
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
        extras: ["Lyd i videoen"],
        maxPromptChars: 4000,
        resolution: "1280×720",
        audio: ["Lyd i videoen"],
      },
    ],
  },
  {
    id: "google",
    name: "Google Gemini",
    description: "Bilder med Nano Banana og video med Veo 3.1. Nøkkel fra Google AI Studio.",
    capabilities: ["image", "video", "text"],
    builtIn: false,
    links: {
      signup: "https://aistudio.google.com/",
      billing: "https://aistudio.google.com/usage",
      apiKeys: "https://aistudio.google.com/apikey",
      pricing: "https://ai.google.dev/gemini-api/docs/pricing",
      docs: "https://ai.google.dev/gemini-api/docs/veo",
    },
    keySteps: [
      "Logg inn på aistudio.google.com med en Google-konto.",
      "Slå på betaling (et Google Cloud-faktureringskonto) – video og de beste bildemodellene krever det.",
      "Gå til «Get API key» → «Create API key» og kopier nøkkelen (begynner med AIza).",
    ],
    keyPattern: /^AIza[A-Za-z0-9_-]{30,}$/,
    models: [
      {
        id: "gemini-nano-banana-2.1",
        label: "Nano Banana 2.1",
        capability: "image",
        priceUsd: 0.04,
        priceUnit: "image",
        acceptsImage: true,
        tier: "fast",
        extras: ["Opptil 14 forbildebilder"],
        maxPromptChars: 8000,
        resolution: "1024 px",
        sizes: ["1K"],
      },
      {
        id: "gemini-3-pro-image",
        label: "Nano Banana Pro",
        capability: "image",
        priceUsd: 0.14,
        priceUnit: "image",
        acceptsImage: true,
        tier: "premium",
        extras: ["Opptil 14 forbildebilder", "Tenker gjennom bildet før det lages"],
        maxPromptChars: 8000,
        resolution: "opptil 4K",
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
        extras: ["Lyd i videoen", "Negativ beskrivelse"],
        maxPromptChars: 3500,
        resolution: "720p/1080p",
        audio: ["Lyd i videoen"],
      },
    ],
  },
  {
    id: "fal",
    name: "fal.ai",
    description:
      "Én konto for mange modeller (Kling, Flux m.fl.). Betal per bruk; godt valg for video fra et startbilde.",
    capabilities: ["image", "video"],
    builtIn: false,
    links: {
      signup: "https://fal.ai/login",
      billing: "https://fal.ai/dashboard/billing",
      apiKeys: "https://fal.ai/dashboard/keys",
      pricing: "https://fal.ai/pricing",
      docs: "https://fal.ai/docs/model-endpoints/queue",
    },
    keySteps: [
      "Opprett konto på fal.ai (logg inn med GitHub eller Google).",
      "Legg inn betalingskort og kjøp kreditt under Billing.",
      "Gå til Dashboard → Keys → «Add key», velg rollen «API» og kopier nøkkelen (id:hemmelighet).",
    ],
    keyPattern: /^[A-Za-z0-9-]{8,}:[A-Za-z0-9]{16,}$/,
    models: [
      {
        id: "fal-ai/flux-pro/kontext",
        label: "FLUX Kontext Pro",
        capability: "image",
        priceUsd: 0.04,
        priceUnit: "image",
        acceptsImage: true,
        tier: "balanced",
        maxPromptChars: 2000,
        resolution: "opptil 1440 px",
      },
      {
        id: "fal-ai/kling-video/v3/4k/image-to-video",
        label: "Kling 3 (fra startbilde)",
        capability: "video",
        priceUsd: 0.42,
        priceUnit: "second",
        durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        acceptsImage: true,
        tier: "premium",
        maxPromptChars: 2500,
        resolution: "4K",
        requiresImage: true,
        limits: ["Må ha startbilde"],
      },
    ],
  },
  {
    id: "runway",
    name: "Runway",
    description: "Video fra et startbilde med Gen-4 Turbo. Kreditter kjøpes i utviklerportalen.",
    capabilities: ["video"],
    builtIn: false,
    links: {
      signup: "https://dev.runwayml.com/",
      billing: "https://dev.runwayml.com/",
      apiKeys: "https://dev.runwayml.com/",
      pricing: "https://docs.dev.runwayml.com/guides/pricing/",
      docs: "https://docs.dev.runwayml.com/",
    },
    keySteps: [
      "Logg inn på dev.runwayml.com (utviklerportalen, egen fra vanlig Runway-abonnement).",
      "Opprett en organisasjon og kjøp kreditter under Billing.",
      "Gå til API Keys → «Create new key» og kopier nøkkelen (begynner med key_).",
    ],
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
        limits: ["Må ha startbilde"],
      },
    ],
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    description: "Lydeffekter og stemmer fra tekst. Abonnement med månedlige tegn/kreditter.",
    capabilities: ["sound", "speech"],
    builtIn: false,
    links: {
      signup: "https://elevenlabs.io/app/sign-up",
      billing: "https://elevenlabs.io/app/subscription",
      apiKeys: "https://elevenlabs.io/app/settings/api-keys",
      pricing: "https://elevenlabs.io/pricing/api",
      docs: "https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert",
    },
    keySteps: [
      "Opprett konto på elevenlabs.io og velg et abonnement (gratisnivået har få kreditter).",
      "Gå til Settings → API Keys → «Create API key».",
      "Gi nøkkelen tilgang til «Sound Effects» (og «Text to Speech» om dere vil bruke stemmer), og kopier den.",
    ],
    keyPattern: /^(sk_)?[A-Za-z0-9]{32,}$/,
    models: [
      {
        id: "eleven_text_to_sound_v2",
        label: "Lydeffekter v2",
        capability: "sound",
        priceUsd: 0.012,
        priceUnit: "second",
        tier: "balanced",
        extras: ["Sømløs løkke"],
        maxPromptChars: 1000,
        soundSeconds: { min: 0.5, max: 30 },
        audio: ["Lydeffekter fra beskrivelse", "Sømløs løkke"],
      },
      {
        id: "eleven_v3",
        label: "Eleven v3 (norsk)",
        capability: "speech",
        priceUsd: 0.0003,
        priceUnit: "character",
        tier: "premium",
        maxPromptChars: 5000,
        extras: ["Egen stemme per karakter", "Norsk satt eksplisitt"],
        audio: ["Tale fra tekst", "Egen stemme per karakter", "Norsk og 70+ språk"],
      },
      {
        // Brukes ikke lenger (kan ikke norsk); står for å vise opphavet til eldre opptak
        id: "eleven_multilingual_v2",
        label: "Flerspråklig tale v2 (uten norsk)",
        retired: true,
        capability: "speech",
        priceUsd: 0.0003,
        priceUnit: "character",
        tier: "balanced",
        maxPromptChars: 5000,
        extras: ["Egen stemme per karakter", "Norsk og engelsk"],
        audio: ["Tale fra tekst", "Egen stemme per karakter", "Norsk og engelsk"],
      },
    ],
  },
];

export function providerInfo(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function isProviderId(id: unknown): id is ProviderId {
  return typeof id === "string" && PROVIDERS.some((p) => p.id === id);
}

/** Modellen hos leverandøren, eller undefined. */
export function providerModel(provider: string, model: string): ProviderModel | undefined {
  return providerInfo(provider)?.models.find((m) => m.id === model);
}

/** Leverandører (med modeller) som kan lage dette, blant de tilkoblede. */
export function providersFor(
  capability: Capability,
  connected: ReadonlySet<string>,
): { provider: ProviderInfo; models: ProviderModel[] }[] {
  return PROVIDERS.filter((p) => p.builtIn || connected.has(p.id))
    .map((p) => ({
      provider: p,
      models: p.models.filter((m) => m.capability === capability && !m.retired),
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
  } = {},
): number | null {
  const m = providerModel(provider, model);
  if (!m) return null;
  // Ugyldige tall gir ukjent pris, aldri NaN (som ville sluppet gjennom kostnadstaket)
  for (const v of [opts.seconds, opts.images, opts.characters])
    if (v !== undefined && !Number.isFinite(v)) return null;
  const n =
    m.priceUnit === "second"
      ? Math.max(0, opts.seconds ?? 0)
      : m.priceUnit === "character"
        ? Math.max(0, opts.characters ?? 0)
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
  if (!k) return { error: "Lim inn nøkkelen.", warning: null };
  if (/\s/.test(k))
    return { error: "Nøkkelen kan ikke inneholde mellomrom eller linjeskift.", warning: null };
  if (k.length < 16 || k.length > 512) return { error: "Nøkkelen har feil lengde.", warning: null };
  const p = providerInfo(provider);
  if (!p) return { error: "Ukjent leverandør.", warning: null };
  if (p.builtIn) return { error: "Denne leverandøren trenger ingen nøkkel.", warning: null };
  if (p.keyPattern && !p.keyPattern.test(k))
    return {
      error: null,
      warning: `Nøkkelen ser ikke ut som en ${p.name}-nøkkel. Sjekk at du kopierte hele nøkkelen.`,
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
  if (!Number.isFinite(n)) return "ukjent beløp";
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
): ModelChoice | null {
  // Den innebygde leverandøren velger selv modell etter formålet: regnes som én modell
  const all = providersFor(capability, connected).flatMap((o) =>
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

/** Kvalitetsmekanismene modellen faktisk har (mandat 19.4), som korte tekster på norsk. */
export function qualityMechanisms(model: ProviderModel): string[] {
  const out: string[] = [];
  if (model.resolution) out.push(`Oppløsning ${model.resolution}`);
  if (model.durations?.length) {
    const d = model.durations;
    out.push(
      d.length > 3
        ? `Lengde ${d[0]}–${d[d.length - 1]} s`
        : `Lengde ${d.slice(0, -1).join(", ")}${d.length > 1 ? " eller " : ""}${d[d.length - 1]} s`,
    );
  }
  if (model.acceptsImage)
    out.push(model.capability === "video" ? "Startbilde" : "Forbildebilder (referansestyring)");
  if (model.capability === "image") out.push("Flere kandidater (hver koster som ett bilde)");
  if (model.transparent) out.push("Gjennomsiktig bakgrunn");
  for (const e of model.extras ?? []) if (!out.includes(e)) out.push(e);
  return out;
}

/** Programmet lover ikke at dyrere gir bedre (mandat 19.3, REQ-0277). */
export const EFFORT_DISCLAIMER =
  "Høyere innsats koster mer, men er ingen garanti for et bedre resultat. Se på resultatet og velg selv.";

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
  const fmt = (n: number) => n.toLocaleString("nb-NO", { maximumFractionDigits: 1 });
  const cand = Math.max(1, opts.candidates ?? 1);
  const targets = Math.max(1, opts.targets ?? 1);
  const out: CostLine[] = [
    { label: "Modell", value: `${provider.name} – ${model.label}` },
    { label: "Innsatsnivå", value: EFFORT_LABEL[effortOf(model)] },
  ];
  if (model.resolution) out.push({ label: "Oppløsning", value: model.resolution });
  out.push({
    label: "Antall",
    value:
      targets > 1 || cand > 1
        ? `${cand * targets} genereringer` +
          (targets > 1 ? ` (${targets} ${opts.targetsLabel ?? "mål"}` : " (") +
          (cand > 1 ? `${targets > 1 ? " × " : ""}${cand} kandidater)` : ")")
        : "1 generering",
  });
  const secs = (opts.seconds ?? []).filter((s) => s > 0);
  if (secs.length) {
    const lo = Math.min(...secs);
    const hi = Math.max(...secs);
    out.push({
      label: "Lengde",
      value: lo === hi ? `${fmt(lo)} s hver` : `${fmt(lo)}–${fmt(hi)} s`,
    });
  } else if (opts.assumedMaxSeconds)
    out.push({
      label: "Lengde",
      value: `ikke valgt – regnet med lengste, ${fmt(opts.assumedMaxSeconds)} s`,
    });
  out.push({
    label: "Ekstrarunder",
    value: "ingen automatiske – nye forsøk startes bare av deg",
  });
  out.push({ label: "Samlet anslag", value: opts.total ?? "ukjent pris" });
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
  if (d.length) time.push(`Videolengde ${d[0]}–${d[d.length - 1]} s`);
  if (model.soundSeconds)
    time.push(
      `Lydlengde ${model.soundSeconds.min.toLocaleString("nb-NO")}–${model.soundSeconds.max} s`,
    );
  const limits = [...(model.limits ?? [])];
  if (model.maxPromptChars)
    limits.push(`Beskrivelsen kortes ned til ${model.maxPromptChars.toLocaleString("nb-NO")} tegn`);
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
