/**
 * Dialog med AI-stemmer (DEC-0071): en replikk leses inn med karakterens stemme hos ElevenLabs (tekst til tale,
 * en prosjekteier har koblet til). Teksten hentes fra manuset på serveren – det som leses, er replikken slik
 * den står. Resultatet lagres i bøtta «assets» som en ny lydressurs; nettleseren lager ressursen og legger
 * lyden på dialogsporet (kommandoer som kan angres). Samme kostnadsport som bilder, video og lyd.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assetFilePath, type AssetMedia, SPEECH_MODEL, effortOf, estimateCostUsd, isUuid, newId, parseQualityProfileMeta, providerModel, speechSettingsError, speechLanguageError, type SpeechSettings, type SpeechModel, languageTagError } from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";
import { t } from "@/core/i18n/keyed";

const BUCKET = "assets";
const MAX_SPEECH_JOBS_PER_USER_PER_HOUR = 300;

const isId = (x: unknown): x is string => typeof x === "string" && isUuid(x);

async function sha256(b: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", b as unknown as ArrayBuffer);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function editorAccess(supabase: unknown, projectId: string, userId: string) {
  const gate = await import("./ai-gate.server");
  const role = await gate.memberRole(supabase as AnyClient, projectId, userId);
  if ((gate.ROLE_RANK[role ?? ""] ?? 0) < gate.ROLE_RANK["editor"]!) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { gate, db: supabaseAdmin as unknown as AnyClient };
}

export type VoicesResult =
  | {
      readonly ok: true;
      readonly voices: {
        voiceId: string;
        name: string;
        description: string;
        /** Lydprøve hos ElevenLabs (offentlig lenke), eller null. */
        previewUrl: string | null;
      }[];
    }
  | { readonly ok: false; readonly message: string };

/** Stemmene prosjektets ElevenLabs-konto har (navn og ID, aldri nøkkelen). */
export const listVoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (!isId(x["projectId"])) throw new Error(t("adapters-ai-speech-functions.list-voices.create-server-fn-method-post-middleware-require-supabase-auth-validator.4ae9c784e5de"));
    return { projectId: x["projectId"] };
  })
  .handler(async ({ data, context }): Promise<VoicesResult> => {
    const a = await editorAccess(context.supabase, data.projectId, context.userId);
    if (!a) return { ok: false, message: t("adapters-ai-speech-functions.message.message.105ac28bbaf2") };
    const key = await a.gate.projectKey(a.db, data.projectId, "elevenlabs", context.userId);
    if (!key)
      return {
        ok: false,
        message: t("adapters-ai-speech-functions.message.message.15eb962bbbb3"),
      };
    const { decryptKey } = await import("./key-vault.server");
    const { ADAPTERS, scrubSecret } = await import("./providers.server");
    let secret: string | null = null;
    try {
      secret = await decryptKey(key, {
        userId: key.user_id,
        provider: key.provider,
        rowId: key.id,
      });
      return { ok: true, voices: await ADAPTERS.elevenlabs.voices(secret) };
    } catch (e) {
      return {
        ok: false,
        message: t("adapters-ai-speech-functions.message.message.63e5dd244c40", { value1: String(scrubSecret((e as Error).message, secret).slice(0, 300)) }),
      };
    }
  });

export type SpeechResult =
  | {
      readonly ok: true;
      readonly assetId: string;
      readonly versionId: string;
      readonly media: AssetMedia;
      readonly text: string;
      readonly costUsd: number | null;
      readonly scriptRevision?: number;
    }
  | { readonly ok: false; readonly message: string; readonly status?: number | null; readonly ambiguous?: boolean };

export const generateSpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (!isId(x["projectId"]) || !isId(x["blockId"]))
      throw new Error(t("adapters-ai-speech-functions.generate-speech.create-server-fn-method-post-middleware-require-supabase-auth-validator.db41107c580e"));
    if (typeof x["voiceId"] !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(x["voiceId"]))
      throw new Error(t("adapters-ai-speech-functions.generate-speech.create-server-fn-method-post-middleware-require-supabase-auth-validator.2e090fde1da3"));
    if (x["approved"] !== true)
      throw new Error(t("adapters-ai-speech-functions.generate-speech.create-server-fn-method-post-middleware-require-supabase-auth-validator.4f4515f49dd9"));
    const model = x["modelId"] ?? SPEECH_MODEL;
    // G-1: språket er påkrevd – det kommer fra speechLanguageOf i appen, aldri en fast standard
    const language = x["language"];
    const settings = x["settings"] ?? {};
    if (typeof model !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(model) || typeof language !== "string" || languageTagError(language))
      throw new Error(t("adapters-ai-speech-functions.generate-speech.create-server-fn-method-post-middleware-require-supabase-auth-validator.70945565c22c"));
    const problem = speechSettingsError(settings);
    if (problem) throw new Error(problem);
    const expectedRevision = x["scriptRevision"];
    if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || Number(expectedRevision) < 1)) throw new Error(t("adapters-ai-speech-functions.generate-speech.create-server-fn-method-post-middleware-require-supabase-auth-validator.030a696f21c0"));
    return { projectId: x["projectId"], blockId: x["blockId"], voiceId: x["voiceId"], model, language, settings: settings as SpeechSettings, expectedRevision, qualityProfile: parseQualityProfileMeta(x["qualityProfile"]) };
  })
  .handler(async ({ data, context }): Promise<SpeechResult> => {
    const { runSpeech } = await import("./speech-run.server");
    return runSpeech(data, context);
  });

/** DV4: model/language choices come from the authorized account, not a fixed UI list. */
export const listSpeechModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (!isId(x["projectId"])) throw new Error(t("adapters-ai-speech-functions.list-speech-models.create-server-fn-method-post-middleware-require-supabase-auth-validator.3f32490d1e59"));
    return { projectId: x["projectId"] };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; models: SpeechModel[] } | { ok: false; message: string }> => {
    const a = await editorAccess(context.supabase, data.projectId, context.userId);
    if (!a) return { ok: false, message: t("adapters-ai-speech-functions.message.message.105ac28bbaf2.2") };
    const key = await a.gate.projectKey(a.db, data.projectId, "elevenlabs", context.userId);
    if (!key) return { ok: false, message: t("adapters-ai-speech-functions.message.message.a01ae69b27a7") };
    const { decryptKey } = await import("./key-vault.server");
    const { ADAPTERS, scrubSecret } = await import("./providers.server");
    let secret: string | null = null;
    try {
      secret = await decryptKey(key, { userId: key.user_id, provider: key.provider, rowId: key.id });
      return { ok: true, models: await ADAPTERS.elevenlabs.speechModels(secret) };
    } catch (e) { return { ok: false, message: scrubSecret((e as Error).message, secret).slice(0, 300) }; }
  });
