/**
 * Lyd med AI (DEC-0069; Mars: «og lyder?»): lydeffekter fra en beskrivelse via en leverandør prosjektets
 * eiere har koblet til (ElevenLabs). Resultatet lagres som ny versjon av en lydressurs i biblioteket;
 * nettleseren lager versjonen (AddAssetVersion), som kan angres. Samme kostnadsport som bilder og video.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assetFilePath, type AssetMedia, effortOf, estimateCostUsd, isUuid, locale, newId, parseQualityProfileMeta, providerModel } from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";
import { t } from "@/core/i18n/keyed";

const BUCKET = "assets";
const MAX_SOUND_JOBS_PER_USER_PER_HOUR = 60;

export type GenerateSoundResult =
  | {
      readonly ok: true;
      readonly versionId: string;
      readonly media: AssetMedia;
      readonly model: string;
    }
  | { readonly ok: false; readonly message: string };

async function sha256(b: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", b as unknown as ArrayBuffer);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const generateSound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (typeof x["projectId"] !== "string" || !isUuid(x["projectId"]))
      throw new Error(t("adapters-ai-sound-functions.generate-sound.create-server-fn-method-post-middleware-require-supabase-auth-validator.677b6fd17e19"));
    if (typeof x["assetId"] !== "string" || !isUuid(x["assetId"]))
      throw new Error(t("adapters-ai-sound-functions.generate-sound.create-server-fn-method-post-middleware-require-supabase-auth-validator.d27ca144e070"));
    const prompt = x["prompt"];
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 1000)
      throw new Error(
        t("adapters-ai-sound-functions.generate-sound.create-server-fn-method-post-middleware-require-supabase-auth-validator.fb5151321588"),
      );
    if (x["provider"] !== "elevenlabs") throw new Error(t("adapters-ai-sound-functions.generate-sound.create-server-fn-method-post-middleware-require-supabase-auth-validator.d4fae74b846e"));
    if (typeof x["model"] !== "string" || x["model"].length > 120)
      throw new Error(t("adapters-ai-sound-functions.generate-sound.create-server-fn-method-post-middleware-require-supabase-auth-validator.19e21ec70c97"));
    const seconds = x["seconds"];
    // Tidsbegrensningen står i leverandørkatalogen (REQ-0273)
    const lim = providerModel("elevenlabs", x["model"])?.soundSeconds ?? { min: 0.5, max: 30 };
    if (
      seconds !== null &&
      (typeof seconds !== "number" ||
        !Number.isFinite(seconds) ||
        seconds < lim.min ||
        seconds > lim.max)
    )
      throw new Error(
        t("adapters-ai-sound-functions.generate-sound.create-server-fn-method-post-middleware-require-supabase-auth-validator.c9a3b5dee21e", { value1: String(lim.min.toLocaleString(locale())), value2: String(lim.max.toLocaleString(locale())) }),
      );
    if (x["approved"] !== true)
      throw new Error(t("adapters-ai-sound-functions.generate-sound.create-server-fn-method-post-middleware-require-supabase-auth-validator.bfe8a6bd0111"));
    return {
      projectId: x["projectId"],
      assetId: x["assetId"],
      prompt: prompt.trim(),
      provider: "elevenlabs" as const,
      model: x["model"],
      seconds: (seconds as number | null) ?? null,
      loop: x["loop"] === true,
      // Kvalitetsprofilen lyden lages med (M8, REQ-0859): øyeblikksbilde i jobbens metadata
      qualityProfile: parseQualityProfileMeta(x["qualityProfile"]),
    };
  })
  .handler(async ({ data, context }): Promise<GenerateSoundResult> => {
    const gate = await import("./ai-gate.server");
    const role = await gate.memberRole(
      context.supabase as unknown as AnyClient,
      data.projectId,
      context.userId,
    );
    if ((gate.ROLE_RANK[role ?? ""] ?? 0) < gate.ROLE_RANK["editor"]!)
      return {
        ok: false,
        message: t("adapters-ai-sound-functions.message.message.57f75abedae7"),
      };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as AnyClient;
    const schema = await checkSchema(db);
    if (schema.kind === "missing" || schema.version < 24)
      return {
        ok: false,
        message: t("adapters-ai-sound-functions.message.message.56b18dcfbf18"),
      };
    const { data: proj } = await db
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj || (proj as { deleted_at?: string | null }).deleted_at)
      return { ok: false, message: t("adapters-ai-sound-functions.message.message.689cdbb252b9") };
    const { data: asset } = await db
      .from("assets")
      .select("id, kind")
      .eq("id", data.assetId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (!asset || (asset as { kind: string }).kind !== "sound")
      return {
        ok: false,
        message: t("adapters-ai-sound-functions.message.message.c8c639c1adfd"),
      };
    // Administrator kan ha slått av leverandøren eller modellen for alle (DEC-0088, migrasjon 0034)
    const aiGate = await (
      await import("@/adapters/account/ai-models.server")
    ).modelGate(db, data.provider, data.model);
    if (aiGate.message) return { ok: false, message: aiGate.message };
    const m = providerModel(data.provider, data.model, aiGate.settings);
    if (!m || m.capability !== "sound")
      return { ok: false, message: t("adapters-ai-sound-functions.message.message.4a55af584a5b") };
    const key = await gate.projectKey(db, data.projectId, data.provider, context.userId);
    if (!key)
      return {
        ok: false,
        message: t("adapters-ai-sound-functions.message.message.c7855965836f"),
      };
    // Ukjent lengde: anslaget regner med det lengste modellen kan lage (katalogen, REQ-0273)
    const longest = m.soundSeconds?.max ?? 30;
    const cost = estimateCostUsd(
      data.provider,
      data.model,
      { seconds: data.seconds ?? longest },
      aiGate.settings,
    );
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const limits = async (extra: number): Promise<string | null> => {
      const { count } = await db
        .from("generation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("created_by", context.userId)
        .eq("kind", "sound")
        .gte("created_at", hourAgo);
      if ((count ?? 0) - extra >= MAX_SOUND_JOBS_PER_USER_PER_HOUR)
        return t("adapters-ai-sound-functions.limits.create-server-fn-method-post-middleware-require-supabase-auth-validator-d-unknown-const-x-d-as-record-string-unknown-if-typeof-x-project-id-string-is-uuid-x-project-id-throw-new-error-l-ugyldig-prosjekt-invalid-project-if-typeof-x-asset-id-string-is-uuid-x-asset-id-throw-new-error-l-ugyldig-ressurs-invalid-asset-const-prompt-x-prompt-if-typeof-prompt-string-prompt-trim-prompt-length-1000-throw-new-error-l-beskrivelsen-mangler-eller-er-for-lang-h-yst-1000-tegn-the-description-is-missing-or-too-long-1000-characters-at-most-if-x-provider-elevenlabs-throw-new-error-l-ukjent-leverand-r-unknown-provider-if-typeof-x-model-string-x-model-length-120-throw-new-error-l-ugyldig-modell-invalid-model-const-seconds-x-seconds-tidsbegrensningen-st-r-i-leverand-rkatalogen-req-0273-const-lim-provider-model-elevenlabs-x-model-sound-seconds-min-0-5-max-30-if-seconds-null-typeof-seconds-number-number-is-finite-seconds-seconds-lim-min-seconds-lim-max-throw-new-error-l-lengden-m-v-re-lim-min-to-locale-string-locale-lim-max-to-locale-string-locale-sekunder-the-length-must-be-lim-min-to-locale-string-locale-lim-max-to-locale-string-locale-seconds-if-x-approved-true-throw-new-error-l-genereringen-m-bekreftes-the-generation-must-be-confirmed-return-project-id-x-project-id-asset-id-x-asset-id-prompt-prompt-trim-provider-elevenlabs-as-const-model-x-model-seconds-seconds-as-number-null-null-loop-x-loop-true-kvalitetsprofilen-lyden-lages-med-m8-req-0859-yeblikksbilde-i-jobbens-metadata-quality-profile-parse-quality-profile-meta-x-quality-profile-handler.67c5c6977365", { MAX_SOUND_JOBS_PER_USER_PER_HOUR: String(MAX_SOUND_JOBS_PER_USER_PER_HOUR) });
      const budget = await gate.overProjectBudget(
        db,
        data.projectId,
        (proj as { ai_month_limit?: number | null }).ai_month_limit,
        extra === 1,
      );
      return budget ?? gate.overAccountCap(db, key.user_id, cost ?? 0, extra === 1);
    };
    const before = await limits(0);
    if (before) return { ok: false, message: before };
    const jobId = newId<"generation_job">();
    const { error: logErr } = await db.from("generation_jobs").insert({
      id: jobId,
      project_id: data.projectId,
      kind: "sound",
      provider: data.provider,
      model: data.model,
      prompt: data.prompt,
      asset_id: data.assetId,
      status: "running",
      created_by: context.userId,
      provider_key_id: key.id,
      key_owner: key.user_id,
      cost_usd: cost,
      params: {
        seconds: data.seconds,
        loop: data.loop,
        // Innsatsnivået jobben ble kjørt med (mandat 19.3, REQ-0275)
        effort: effortOf(m),
        // Kvalitetsprofilen lyden ble laget med (M8, REQ-0859): et øyeblikksbilde
        ...(data.qualityProfile ? { qualityProfile: data.qualityProfile } : {}),
        // Sporbarhet (DEC-0072, REQ-0257)
        trace: await (
          await import("./trace.server")
        ).buildTrace(db, data.projectId, {
          modelParams: { seconds: data.seconds, loop: data.loop },
        }),
      },
    } as never);
    if (logErr)
      return {
        ok: false,
        message: t("adapters-ai-sound-functions.message.message.918ff4a13809", { message: String(logErr.message) }),
      };
    const after = await limits(1);
    if (after) {
      await db.from("generation_jobs").delete().eq("id", jobId);
      return { ok: false, message: after };
    }
    const finish = (patch: Record<string, unknown>) =>
      db
        .from("generation_jobs")
        .update({ ...patch, finished_at: new Date().toISOString() } as never)
        .eq("id", jobId);
    let charged = false;
    let secret: string | null = null;
    const { ADAPTERS, scrubSecret } = await import("./providers.server");
    try {
      const { decryptKey } = await import("./key-vault.server");
      secret = await decryptKey(key, {
        userId: key.user_id,
        provider: key.provider,
        rowId: key.id,
      });
      const out = await ADAPTERS.elevenlabs.sound({
        key: secret,
        model: data.model,
        prompt: data.prompt,
        seconds: data.seconds,
        loop: data.loop,
      });
      charged = true;
      if (!out.bytes.byteLength)
        throw new Error(t("adapters-ai-sound-functions.generate-sound.create-server-fn-method-post-middleware-require-supabase-auth-validator-d-unknown-const-x-d-as-record-string-unknown-if-typeof-x-project-id-string-is-uuid-x-project-id-throw-new-error-l-ugyldig-prosjekt-invalid-project-if-typeof-x-asset-id-string-is-uuid-x-asset-id-throw-new-error-l-ugyldig-ressurs-invalid-asset-const-prompt-x-prompt-if-typeof-prompt-string-prompt-trim-prompt-length-1000-throw-new-error-l-beskrivelsen-mangler-eller-er-for-lang-h-yst-1000-tegn-the-description-is-missing-or-too-long-1000-characters-at-most-if-x-provider-elevenlabs-throw-new-error-l-ukjent-leverand-r-unknown-provider-if-typeof-x-model-string-x-model-length-120-throw-new-error-l-ugyldig-modell-invalid-model-const-seconds-x-seconds-tidsbegrensningen-st-r-i-leverand-rkatalogen-req-0273-const-lim-provider-model-elevenlabs-x-model-sound-seconds-min-0-5-max-30-if-seconds-null-typeof-seconds-number-number-is-finite-seconds-seconds-lim-min-seconds-lim-max-throw-new-error-l-lengden-m-v-re-lim-min-to-locale-string-locale-lim-max-to-locale-string-locale-sekunder-the-length-must-be-lim-min-to-locale-string-locale-lim-max-to-locale-string-locale-seconds-if-x-approved-true-throw-new-error-l-genereringen-m-bekreftes-the-generation-must-be-confirmed-return-project-id-x-project-id-asset-id-x-asset-id-prompt-prompt-trim-provider-elevenlabs-as-const-model-x-model-seconds-seconds-as-number-null-null-loop-x-loop-true-kvalitetsprofilen-lyden-lages-med-m8-req-0859-yeblikksbilde-i-jobbens-metadata-quality-profile-parse-quality-profile-meta-x-quality-profile-handler.a6043a0238b1"));
      const versionId = newId<"asset_version">();
      // i18n-ignore: lagringssti i bøtta, ikke vist
      const path = assetFilePath(
        data.projectId,
        "generated",
        data.assetId,
        versionId,
        // i18n-ignore: filnavn i lagringen
        `ai-lyd-${new Date().toISOString().slice(0, 10)}.mp3`,
      );
      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(path, new Blob([out.bytes as unknown as ArrayBuffer], { type: "audio/mpeg" }), {
          contentType: "audio/mpeg",
          upsert: false,
        });
      if (upErr)
        throw new Error(
          t("adapters-ai-sound-functions.generate-sound.create-server-fn-method-post-middleware-require-supabase-auth-validator-d-unknown-const-x-d-as-record-string-unknown-if-typeof-x-project-id-string-is-uuid-x-project-id-throw-new-error-l-ugyldig-prosjekt-invalid-project-if-typeof-x-asset-id-string-is-uuid-x-asset-id-throw-new-error-l-ugyldig-ressurs-invalid-asset-const-prompt-x-prompt-if-typeof-prompt-string-prompt-trim-prompt-length-1000-throw-new-error-l-beskrivelsen-mangler-eller-er-for-lang-h-yst-1000-tegn-the-description-is-missing-or-too-long-1000-characters-at-most-if-x-provider-elevenlabs-throw-new-error-l-ukjent-leverand-r-unknown-provider-if-typeof-x-model-string-x-model-length-120-throw-new-error-l-ugyldig-modell-invalid-model-const-seconds-x-seconds-tidsbegrensningen-st-r-i-leverand-rkatalogen-req-0273-const-lim-provider-model-elevenlabs-x-model-sound-seconds-min-0-5-max-30-if-seconds-null-typeof-seconds-number-number-is-finite-seconds-seconds-lim-min-seconds-lim-max-throw-new-error-l-lengden-m-v-re-lim-min-to-locale-string-locale-lim-max-to-locale-string-locale-sekunder-the-length-must-be-lim-min-to-locale-string-locale-lim-max-to-locale-string-locale-seconds-if-x-approved-true-throw-new-error-l-genereringen-m-bekreftes-the-generation-must-be-confirmed-return-project-id-x-project-id-asset-id-x-asset-id-prompt-prompt-trim-provider-elevenlabs-as-const-model-x-model-seconds-seconds-as-number-null-null-loop-x-loop-true-kvalitetsprofilen-lyden-lages-med-m8-req-0859-yeblikksbilde-i-jobbens-metadata-quality-profile-parse-quality-profile-meta-x-quality-profile-handler.fc04e6acceee", { message: String(upErr.message) }),
        );
      await finish({ status: "done", result_path: path });
      return {
        ok: true,
        versionId,
        model: `${data.provider}/${data.model}`,
        media: {
          path,
          mimeType: "audio/mpeg",
          width: null,
          height: null,
          byteSize: out.bytes.byteLength,
          sha256: await sha256(out.bytes),
        },
      };
    } catch (e) {
      const message = scrubSecret(
        (e as Error).message || t("adapters-ai-sound-functions.message.scrub-secret.e9bbcae98ca2"),
        secret,
      ).slice(0, 2000);
      await finish({ status: charged ? "lost" : "failed", error: message });
      return {
        ok: false,
        message: t("adapters-ai-sound-functions.message.message.5a72168e1838", { message: String(message) }),
      };
    }
  });
