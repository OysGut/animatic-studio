/** Shared speech execution. Batch workers reuse the same authorization, quotas and provider contract. */
import {
  assetFilePath,
  L,
  type AssetMedia,
  SPEECH_LANGUAGE,
  SPEECH_MODEL,
  effortOf,
  estimateCostUsd,
  isUuid,
  newId,
  providerModel,
  speechSettingsError,
  speechLanguageError,
  providerLanguageCode,
  type SpeechSettings,
  type SpeechModel,
} from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";

import type { SpeechResult } from "./speech.functions";
const BUCKET = "assets";
const MAX_SPEECH_JOBS_PER_USER_PER_HOUR = 300;
export interface SpeechInput { projectId: string; blockId: string; voiceId: string; model: string; language: string; settings: SpeechSettings; expectedRevision?: unknown; jobId?: string; batch?: boolean }
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
        message: L(
          "Du har ikke tilgang til å generere i dette prosjektet.",
          "You do not have access to generate in this project.",
        ),
      };
    const { gate, db } = a;
    const schema = await checkSchema(db);
    if (schema.kind === "missing" || schema.version < 24)
      return {
        ok: false,
        message: L(
          "Databasen er ikke oppdatert for AI-tale. Kontakt administratoren for å oppdatere Animatic Studio.",
          "The database is not updated for AI speech. Contact the administrator to update Animatic Studio.",
        ),
      };
    const { data: proj } = await db
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj || (proj as { deleted_at?: string | null }).deleted_at)
      return { ok: false, message: L("Prosjektet er slettet.", "The project has been deleted.") };
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
        message: L("Bare replikker kan leses inn.", "Only lines can be read aloud."),
      };
    if (data.expectedRevision !== undefined && b.current_rev !== data.expectedRevision)
      return { ok: false, message: L("Manuset er endret. Kontroller replikken og godkjenn kostnaden på nytt.", "The script has changed. Review the line and approve the cost again.") };
    const text = b.text.replace(/\s+/g, " ").trim();
    // Administrator kan ha slått av ElevenLabs eller talemodellen for alle (DEC-0088, migrasjon 0034)
    const aiGate = await (
      await import("@/adapters/account/ai-models.server")
    ).modelGate(db, "elevenlabs", data.model);
    if (aiGate.message) return { ok: false, message: aiGate.message };
    const m = providerModel("elevenlabs", data.model);
    if (!text) return { ok: false, message: L("Replikken er tom.", "The line is empty.") };
    if (text.length > (m?.maxPromptChars ?? 5000))
      return {
        ok: false,
        message: L(
          "Replikken er for lang til å leses inn i én del.",
          "The line is too long to be read aloud in one part.",
        ),
      };
    const key = await gate.projectKey(db, data.projectId, "elevenlabs", context.userId);
    if (!key)
      return {
        ok: false,
        message: L(
          "Ingen av prosjektets eiere har koblet til ElevenLabs (AI-leverandører).",
          "None of the project's owners has connected ElevenLabs (AI providers).",
        ),
      };
    const cost = estimateCostUsd("elevenlabs", data.model, { characters: text.length });
    if (cost === null) return { ok: false, message: L("Modellprisen er ukjent. Administratoren må registrere prisen før generering.", "The model price is unknown. An administrator must register the price before generation.") };
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
        return L(
          `Grensen på ${MAX_SPEECH_JOBS_PER_USER_PER_HOUR} lyder i timen er nådd.`,
          `The limit of ${MAX_SPEECH_JOBS_PER_USER_PER_HOUR} sounds per hour has been reached.`,
        );
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
        message: L(
          `Jobben kunne ikke logges: ${logErr.message}`,
          `The job could not be logged: ${logErr.message}`,
        ),
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
      if (error) throw new Error(L("Jobbresultatet kunne ikke lagres. Ikke generer på nytt før resultatet er avklart.", "The job result could not be saved. Do not regenerate until the result is reconciled."));
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
        throw new Error(L("Stemmen eller modellen er ikke tilgjengelig på kontoen.", "The voice or model is not available in the account."));
      const languageError = speechLanguageError(liveModel, data.language);
      if (languageError) throw new Error(languageError);
      if (liveModel.maxCharacters !== null && text.length > liveModel.maxCharacters)
        throw new Error(L("Replikken er for lang for modellen.", "The line is too long for the model."));
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
        throw new Error(L("Tjenesten svarte uten lyd.", "The service replied without sound."));
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
          L(
            `Lyden kunne ikke lagres: ${upErr.message}`,
            `The sound could not be saved: ${upErr.message}`,
          ),
        );
      if (data.batch) {
        await finish({ status: "running", result_path: path });
        const { Input, BufferSource, ALL_FORMATS } = await import("mediabunny");
        const input = new Input({ source: new BufferSource(out.bytes), formats: ALL_FORMATS });
        try { durationMs = Math.round(await input.computeDuration() * 1000); } finally { input.dispose(); }
        if (!durationMs || !Number.isFinite(durationMs)) throw new Error(L("Lydlengden kunne ikke måles. Filen er bevart; ikke generer på nytt.", "The audio duration could not be measured. The file is preserved; do not regenerate."));
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
        (e as Error).message || L("Ukjent feil", "Unknown error"),
        secret,
      ).slice(0, 2000);
      const rejected = e instanceof ProviderError && e.status >= 400 && e.status < 500;
      await finish({ status: charged && !rejected ? "lost" : "failed", error: message });
      return {
        ok: false,
        status: e instanceof ProviderError ? e.status : null,
        ambiguous: charged && !rejected,
        message: L(
          `Replikken ble ikke lest inn: ${message}`,
          `The line could not be read aloud: ${message}`,
        ),
      };
    }
}
