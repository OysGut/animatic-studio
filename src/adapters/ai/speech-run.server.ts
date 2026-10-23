/** Shared speech execution. Batch workers reuse the same authorization, quotas and provider contract. */
import { assetFilePath, type AssetMedia, SPEECH_MODEL, effortOf, estimateCostUsd, isUuid, newId, parseQualityProfileMeta, providerModel, type QualityProfileSnapshot, speechSettingsError, speechLanguageError, providerLanguageCode, type SpeechSettings, type SpeechModel } from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";
import type { SpeechResult } from "./speech.functions";
import { t } from "@/core/i18n/keyed";
const BUCKET = "assets";
const MAX_SPEECH_JOBS_PER_USER_PER_HOUR = 300;
export interface SpeechInput { projectId: string; blockId: string; voiceId: string; model: string; language: string; settings: SpeechSettings; expectedRevision?: unknown; jobId?: string; batch?: boolean; /** Kvalitetsprofilen talen lages med (M8, REQ-0859): øyeblikksbilde i jobbens metadata. */ qualityProfile?: QualityProfileSnapshot | null }
async function sha256(b: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", b as unknown as ArrayBuffer);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function editorAccess(supabase: unknown, projectId: string, userId: string) {
  const gate = await import("./ai-gate.server");
  const role = await gate.memberRole(supabase as AnyClient, projectId, userId);
  if ((gate.ROLE_RANK[role ?? ""] ?? 0) < (gate.ROLE_RANK["editor"] ?? 3)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { gate, db: supabaseAdmin as unknown as AnyClient };
}

export async function runSpeech(data: SpeechInput, context: { supabase: unknown; userId: string }): Promise<SpeechResult> {
    const a = await editorAccess(context.supabase, data.projectId, context.userId);
    if (!a)
      return {
        ok: false,
        message: t("adapters-ai-speech-run-server.message.message.98c52badc0fb"),
      };
    const { gate, db } = a;
    const schema = await checkSchema(db);
    if (schema.kind === "missing" || schema.version < 24)
      return {
        ok: false,
        message: t("adapters-ai-speech-run-server.message.message.6cd37d7dc0b9"),
      };
    const { data: proj } = await db
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj || (proj as { deleted_at?: string | null }).deleted_at)
      return { ok: false, message: t("adapters-ai-speech-run-server.message.message.ebc276719a87") };
    // Teksten fra manuset (ikke fra nettleseren)
    const { data: block } = await db
      .from("script_blocks")
      .select("id, kind, text, removed, current_rev")
      .eq("id", data.blockId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    const b = block as { kind: string; text: string; removed: boolean; current_rev: number } | null;
    if (!b || b.removed || b.kind !== "dialogue")
      return {
        ok: false,
        message: t("adapters-ai-speech-run-server.message.message.87fe8811cc21"),
      };
    if (data.expectedRevision !== undefined && b.current_rev !== data.expectedRevision)
      return { ok: false, message: t("adapters-ai-speech-run-server.message.message.c608bacd3c52") };
    const text = b.text.replace(/\s+/g, " ").trim();
    // Administrator kan ha slått av ElevenLabs eller talemodellen for alle (DEC-0088, migrasjon 0034)
    const aiGate = await (
      await import("@/adapters/account/ai-models.server")
    ).modelGate(db, "elevenlabs", data.model);
    if (aiGate.message) return { ok: false, message: aiGate.message };
    const m = providerModel("elevenlabs", data.model);
    if (!text) return { ok: false, message: t("adapters-ai-speech-run-server.message.message.e04a1278618d") };
    if (text.length > (m?.maxPromptChars ?? 5000))
      return {
        ok: false,
        message: t("adapters-ai-speech-run-server.message.message.d86e563ee690"),
      };
    const key = await gate.projectKey(db, data.projectId, "elevenlabs", context.userId);
    if (!key)
      return {
        ok: false,
        message: t("adapters-ai-speech-run-server.message.message.51afc4bc0808"),
      };
    const cost = estimateCostUsd("elevenlabs", data.model, { characters: text.length });
    if (cost === null) return { ok: false, message: t("adapters-ai-speech-run-server.message.message.01f39d6aacfc") };
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const limits = async (extra: number): Promise<string | null> => {
      const { count } = await db
        .from("generation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("created_by", context.userId)
        .eq("kind", "sound")
        .neq("status", "queued")
        .gte("created_at", hourAgo);
      if ((count ?? 0) - extra >= MAX_SPEECH_JOBS_PER_USER_PER_HOUR)
        return t("adapters-ai-speech-run-server.limits.message.3690f80a22b4", { MAX_SPEECH_JOBS_PER_USER_PER_HOUR: String(MAX_SPEECH_JOBS_PER_USER_PER_HOUR) });
      const budget = await gate.overProjectBudget(
        db,
        data.projectId,
        (proj as { ai_month_limit?: number | null }).ai_month_limit,
        extra === 1,
      );
      return budget ?? gate.overAccountCap(db, key.user_id, cost ?? Number.NaN, extra === 1);
    };
    const before = await limits(0);
    if (before) return { ok: false, message: before, status: data.batch ? 429 : null };
    const jobId = data.jobId ?? newId<"generation_job">();
    const jobRow = {
      id: jobId,
      project_id: data.projectId,
      kind: "sound",
      provider: "elevenlabs",
      model: data.model,
      prompt: "",
      status: "running",
      created_by: context.userId,
      provider_key_id: key.id,
      key_owner: key.user_id,
      cost_usd: cost,
      params: {
        ...(data.batch ? { kind: "dialogue_batch" } : {}),
        speech: true,
        language: data.language,
        settings: data.settings,
        scriptRevision: b.current_rev,
        // Innsatsnivået jobben ble kjørt med (mandat 19.3, REQ-0275)
        effort: effortOf(providerModel("elevenlabs", data.model)),
        // Kvalitetsprofilen talen ble laget med (M8, REQ-0859): et øyeblikksbilde
        ...(data.qualityProfile ? { qualityProfile: data.qualityProfile } : {}),
        voiceId: data.voiceId,
        blockId: data.blockId,
        // Sporbarhet (DEC-0072, REQ-0257)
        trace: await (
          await import("./trace.server")
        ).buildTrace(db, data.projectId, { modelParams: { voiceId: data.voiceId } }),
      },
    };
    const { error: logErr } = data.jobId
      ? await db.from("generation_jobs").update({ ...jobRow, started_at: new Date().toISOString() } as never).eq("id", jobId).eq("project_id", data.projectId)
      : await db.from("generation_jobs").insert(jobRow as never);
    if (logErr)
      return {
        ok: false,
        message: t("adapters-ai-speech-run-server.message.message.0b1c114fe124", { message: String(logErr.message) }),
      };
    const after = await limits(1);
    if (after) {
      if (data.jobId) await db.from("generation_jobs").update({ status: "failed", error: after }).eq("id", jobId);
      else await db.from("generation_jobs").delete().eq("id", jobId).eq("status", "running");
      return { ok: false, message: after, status: data.batch ? 429 : null };
    }
    const finish = async (patch: Record<string, unknown>) => {
      const { error } = await db
        .from("generation_jobs")
        .update({ ...patch, finished_at: new Date().toISOString() } as never)
        .eq("id", jobId);
      if (error) throw new Error(t("adapters-ai-speech-run-server.finish.message.03addc5b9d6e"));
    };
    let charged = false;
    let secret: string | null = null;
    const { ADAPTERS, ProviderError, scrubSecret } = await import("./providers.server");
    try {
      const { decryptKey } = await import("./key-vault.server");
      secret = await decryptKey(key, {
        userId: key.user_id,
        provider: key.provider,
        rowId: key.id,
      });
      const [models, voices] = await Promise.all([ADAPTERS.elevenlabs.speechModels(secret), ADAPTERS.elevenlabs.voices(secret)]);
      const liveModel = models.find(m => m.modelId === data.model);
      if (!liveModel || !voices.some(v => v.voiceId === data.voiceId))
        throw new Error(t("adapters-ai-speech-run-server.run-speech.message.53656dad2876"));
      const languageError = speechLanguageError(liveModel, data.language);
      if (languageError) throw new Error(languageError);
      if (liveModel.maxCharacters !== null && text.length > liveModel.maxCharacters)
        throw new Error(t("adapters-ai-speech-run-server.run-speech.message.fe329e5ae5f8"));
      charged = true;
      const out = await ADAPTERS.elevenlabs.speech({
        key: secret,
        model: data.model,
        voiceId: data.voiceId,
        text,
        language: providerLanguageCode(liveModel, data.language) ?? data.language,
        settings: data.settings,
      });
      if (!out.bytes.byteLength)
        throw new Error(t("adapters-ai-speech-run-server.run-speech.message.63fcc6eea6b2"));
      let durationMs: number | undefined;
      const assetId = newId<"asset">();
      const versionId = newId<"asset_version">();
      const path = assetFilePath(data.projectId, "generated", assetId, versionId, "ai-tale.mp3");
      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(path, new Blob([out.bytes as unknown as ArrayBuffer], { type: "audio/mpeg" }), {
          contentType: "audio/mpeg",
          upsert: false,
        });
      if (upErr)
        throw new Error(
          t("adapters-ai-speech-run-server.run-speech.message.46f5ce231421", { message: String(upErr.message) }),
        );
      if (data.batch) {
        await finish({ status: "running", result_path: path });
        const { Input, BufferSource, ALL_FORMATS } = await import("mediabunny");
        const input = new Input({ source: new BufferSource(out.bytes), formats: ALL_FORMATS });
        try { durationMs = Math.round(await input.computeDuration() * 1000); } finally { input.dispose(); }
        if (!durationMs || !Number.isFinite(durationMs)) throw new Error(t("adapters-ai-speech-run-server.run-speech.message.4ece117c72fb"));
      }
      const result: Extract<SpeechResult, { ok: true }> = {
        ok: true,
        assetId,
        versionId,
        text,
        costUsd: cost,
        scriptRevision: b.current_rev,
        media: {
          path,
          mimeType: "audio/mpeg",
          width: null,
          height: null,
          byteSize: out.bytes.byteLength,
          sha256: await sha256(out.bytes),
          ...(durationMs ? { durationMs } : {}),
        },
      };
      const { text: _text, ...receipt } = result;
      await finish({ status: "done", result_path: path, params: { ...jobRow.params, ...(data.batch ? { kind: "dialogue_batch", result: receipt } : {}) } });
      return result;
    } catch (e) {
      const message = scrubSecret(
        (e as Error).message || t("adapters-ai-speech-run-server.message.scrub-secret.98dedb5263c6"),
        secret,
      ).slice(0, 2000);
      const rejected = e instanceof ProviderError && e.status >= 400 && e.status < 500;
      await finish({ status: charged && !rejected ? "lost" : "failed", error: message });
      return {
        ok: false,
        status: e instanceof ProviderError ? e.status : null,
        ambiguous: charged && !rejected,
        message: t("adapters-ai-speech-run-server.message.message.38e3ca52be91", { message: String(message) }),
      };
    }
}
