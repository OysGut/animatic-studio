import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseQualityProfileMeta, isUuid, assetVoiceError, characterDialogueCoverage, estimateCostUsd, newId, languageTagError, type AssetVoice } from "@/core";
import type { AnyClient } from "../storage/project-rows";
import { t } from "@/core/i18n/keyed";

async function access(supabase: unknown, projectId: string, userId: string) {
  const { memberRole, ROLE_RANK } = await import("../ai/ai-gate.server");
  const role = await memberRole(supabase as AnyClient, projectId, userId);
  if ((ROLE_RANK[role ?? ""] ?? 0) < (ROLE_RANK["editor"] ?? 3)) throw new Error(t("adapters-storage-dialogue-batch-functions.access.message.159639c5c451"));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}
function projectInput(raw: unknown) {
  const x = (raw ?? {}) as Record<string, unknown>;
  if (typeof x["projectId"] !== "string" || !isUuid(x["projectId"])) throw new Error(t("adapters-storage-dialogue-batch-functions.project-input.message.85e61cb4e79a"));
  return { projectId: x["projectId"], raw: x };
}
export interface DialogueBatchView { id: string; status: string; pause_reason: string | null; access_blocked?: boolean; voice: AssetVoice; items: { id: string; block_id: string; occurrence_id: string; status: string; error: string | null; retryable: boolean; language: string }[] }
export const listDialogueBatches = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(projectInput).handler(async ({ data, context }): Promise<DialogueBatchView[]> => {
  const db = await access(context.supabase, data.projectId, context.userId);
  const { data: rows, error } = await db.from("dialogue_batches").select("*,items:dialogue_batch_items(id,block_id,occurrence_id,status,error,retryable,language)").eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(30);
  if (error) throw new Error(error.message);
  return (rows ?? []) as DialogueBatchView[];
});
export const createDialogueBatch = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((raw: unknown) => {
  const { projectId, raw: x } = projectInput(raw);
  const rawVoice = x["voice"] as AssetVoice & { qualityProfile?: unknown };
  const voice = rawVoice ? { ...rawVoice, qualityProfile: parseQualityProfileMeta(rawVoice.qualityProfile) } : rawVoice;
  if (x["approved"] !== true || !voice || assetVoiceError(voice) || typeof x["characterId"] !== "string" || !isUuid(x["characterId"]) || typeof x["requestId"] !== "string" || !isUuid(x["requestId"])) throw new Error(t("adapters-storage-dialogue-batch-functions.create-dialogue-batch.create-server-fn-method-post-middleware-require-supabase-auth-validator.35841b5fc8eb"));
  const lines = x["lines"] as { key: string; language: string; revision: number }[];
  if (!Array.isArray(lines) || !lines.length || lines.length > 1000 || new Set(lines.map(l => l.key)).size !== lines.length || lines.some(l => typeof l.key !== "string" || languageTagError(l.language) || !Number.isInteger(l.revision))) throw new Error(t("adapters-storage-dialogue-batch-functions.create-dialogue-batch.create-server-fn-method-post-middleware-require-supabase-auth-validator.f936859ed317"));
  return { projectId, characterId: x["characterId"], requestId: x["requestId"], voice, lines };
}).handler(async ({ data, context }) => {
  const db = await access(context.supabase, data.projectId, context.userId);
  const { loadProjectState } = await import("../storage/project-rows");
  const state = await loadProjectState(db, data.projectId);
  const character = state.assets[data.characterId];
  if (!character || character.removed || character.archived || !["character", "animal", "other"].includes(character.kind)) throw new Error(t("adapters-storage-dialogue-batch-functions.create-dialogue-batch.create-server-fn-method-post-middleware-require-supabase-auth-validator-raw-unknown-const-project-id-raw-x-project-input-raw-const-raw-voice-x-voice-as-asset-voice-quality-profile-unknown-const-voice-raw-voice-raw-voice-quality-profile-parse-quality-profile-meta-raw-voice-quality-profile-raw-voice-if-x-approved-true-voice-asset-voice-error-voice-typeof-x-character-id-string-is-uuid-x-character-id-typeof-x-request-id-string-is-uuid-x-request-id-throw-new-error-l-ugyldig-eller-ubekreftet-jobb-invalid-or-unapproved-job-const-lines-x-lines-as-key-string-language-string-revision-number-if-array-is-array-lines-lines-length-lines-length-1000-new-set-lines-map-l-l-key-size-lines-length-lines-some-l-typeof-l-key-string-language-tag-error-l-language-number-is-integer-l-revision-throw-new-error-l-ugyldig-replikkvalg-invalid-line-selection-return-project-id-character-id-x-character-id-request-id-x-request-id-voice-lines-handler.7c67a10a1fae"));
  const coverage = characterDialogueCoverage(state, data.characterId).flatMap(s => s.lines);
  const { projectKey, overAccountCap, overProjectBudget } = await import("../ai/ai-gate.server");
  const key = await projectKey(db, data.projectId, "elevenlabs", context.userId);
  if (!key) throw new Error(t("adapters-storage-dialogue-batch-functions.create-dialogue-batch.create-server-fn-method-post-middleware-require-supabase-auth-validator-raw-unknown-const-project-id-raw-x-project-input-raw-const-raw-voice-x-voice-as-asset-voice-quality-profile-unknown-const-voice-raw-voice-raw-voice-quality-profile-parse-quality-profile-meta-raw-voice-quality-profile-raw-voice-if-x-approved-true-voice-asset-voice-error-voice-typeof-x-character-id-string-is-uuid-x-character-id-typeof-x-request-id-string-is-uuid-x-request-id-throw-new-error-l-ugyldig-eller-ubekreftet-jobb-invalid-or-unapproved-job-const-lines-x-lines-as-key-string-language-string-revision-number-if-array-is-array-lines-lines-length-lines-length-1000-new-set-lines-map-l-l-key-size-lines-length-lines-some-l-typeof-l-key-string-language-tag-error-l-language-number-is-integer-l-revision-throw-new-error-l-ugyldig-replikkvalg-invalid-line-selection-return-project-id-character-id-x-character-id-request-id-x-request-id-voice-lines-handler.498fa23c4565"));
  const { modelGate } = await import("../account/ai-models.server");
  const allowed = await modelGate(db, "elevenlabs", data.voice.modelId ?? "eleven_v3");
  if (allowed.message) throw new Error(allowed.message);
  const selected = data.lines.map(l => {
    const line = coverage.find(c => c.key === l.key);
    if (!line || line.scriptRevision !== l.revision) throw new Error(t("adapters-storage-dialogue-batch-functions.selected.data-lines-map.365065181b53"));
    const cost = estimateCostUsd("elevenlabs", data.voice.modelId ?? "eleven_v3", { characters: line.text.replace(/\s+/g, " ").trim().length });
    if (cost === null) throw new Error(t("adapters-storage-dialogue-batch-functions.selected.data-lines-map.6509d29870a3"));
    return { id: newId<"command">(), job_id: newId<"generation_job">(), occurrence_id: line.occurrenceId, block_id: line.blockId, script_revision: l.revision, language: l.language, cost, variant_id: newId<"asset_variant">(), version_id: newId<"asset_version">(), clip_id: newId<"audio_clip">(), dialogue_version_id: newId<"dialogue_version">(), composition_id: newId<"composition">(), command_id: newId<"command">() };
  });
  const total = selected.reduce((n,item)=>n+item.cost,0);
  const cap = await overAccountCap(db,key.user_id,total,false);
  if (cap) throw new Error(cap);
  const budget = await overProjectBudget(db,data.projectId,state.project.aiMonthLimit,false);
  if (budget) throw new Error(budget);
  const { data: id, error } = await db.rpc("create_dialogue_batch", { p_project: data.projectId, p_actor: context.userId, p_request: data.requestId, p_character: data.characterId, p_voice: data.voice, p_items: selected, p_key: key.id, p_key_owner: key.user_id });
  if (error) throw new Error(error.message);
  return { id: String(id) };
});
export const advanceDialogueBatch = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(projectInput).handler(async ({ data, context }) => {
  const db = await access(context.supabase, data.projectId, context.userId);
  const id = data.raw["batchId"];
  if (typeof id !== "string" || !isUuid(id)) throw new Error(t("adapters-storage-dialogue-batch-functions.advance-dialogue-batch.create-server-fn-method-post-middleware-require-supabase-auth-validator-project-input-handler.e31c0c7270f8"));
  const { data: row } = await db.from("dialogue_batches").select("id").eq("id", id).eq("project_id", data.projectId).maybeSingle();
  if (!row) throw new Error(t("adapters-storage-dialogue-batch-functions.advance-dialogue-batch.create-server-fn-method-post-middleware-require-supabase-auth-validator-project-input-handler.a43dddaa2104"));
  const { processDialogueBatch } = await import("./dialogue-batch.server");
  return processDialogueBatch(db, id, context.supabase);
});
export const resumeDialogueBatch = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(projectInput).handler(async ({ data, context }) => {
  const db = await access(context.supabase, data.projectId, context.userId);
  const id = data.raw["batchId"];
  if (typeof id !== "string" || !isUuid(id)) throw new Error(t("adapters-storage-dialogue-batch-functions.resume-dialogue-batch.create-server-fn-method-post-middleware-require-supabase-auth-validator-project-input-handler.aa86435db903"));
  const { error } = await db.rpc("resume_dialogue_batch", { p_project: data.projectId, p_batch: id, p_actor: context.userId });
  if (error) throw new Error(error.message);
  return { ok: true };
});function batchInput(raw: unknown) {
  const { projectId, raw: x } = projectInput(raw);
  if (typeof x["batchId"] !== "string" || !isUuid(x["batchId"])) throw new Error(t("adapters-storage-dialogue-batch-functions.batch-input.message.946ff405832d"));
  return { projectId, batchId: x["batchId"], approved: x["approved"] === true };
}
/** DV5-rest: angre alle ferdige resultater i jobben med de lagrede inverse kommandoene. */
export const undoDialogueBatchJob = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(batchInput).handler(async ({ data, context }) => {
  const db = await access(context.supabase, data.projectId, context.userId);
  const { undoDialogueBatch } = await import("./dialogue-batch.server");
  return undoDialogueBatch(db, data.projectId, data.batchId, context.userId);
});
/** DV5-rest: gjenopptak etter leverandørblokk. Krever ny eksplisitt bekreftelse og en gyldig nøkkel. */
export const reconfirmDialogueBatch = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(batchInput).handler(async ({ data, context }) => {
  if (!data.approved) throw new Error(t("adapters-storage-dialogue-batch-functions.reconfirm-dialogue-batch.create-server-fn-method-post-middleware-require-supabase-auth-validator-batch-input-handler.4deb0ff8af48"));
  const db = await access(context.supabase, data.projectId, context.userId);
  const { data: batch } = await db.from("dialogue_batches").select("voice,access_blocked").eq("id", data.batchId).eq("project_id", data.projectId).maybeSingle();
  if (!batch) throw new Error(t("adapters-storage-dialogue-batch-functions.reconfirm-dialogue-batch.create-server-fn-method-post-middleware-require-supabase-auth-validator-batch-input-handler.2f7c45617533"));
  const { projectKey } = await import("../ai/ai-gate.server");
  const key = await projectKey(db, data.projectId, "elevenlabs", context.userId);
  if (!key) throw new Error(t("adapters-storage-dialogue-batch-functions.reconfirm-dialogue-batch.create-server-fn-method-post-middleware-require-supabase-auth-validator-batch-input-handler.f40c5e787e56"));
  const { modelGate } = await import("../account/ai-models.server");
  const allowed = await modelGate(db, "elevenlabs", (batch.voice as AssetVoice).modelId ?? "eleven_v3");
  if (allowed.message) throw new Error(allowed.message);
  const { error } = await db.rpc("reconfirm_dialogue_batch", { p_project: data.projectId, p_batch: data.batchId, p_actor: context.userId });
  if (error) throw new Error(error.message);
  return { ok: true };
});

/**
 * DV5-rest (N3): serverhistorikken for ferdige bakgrunnsresultater i jobben, så klienten kan legge dem på
 * brukerens angreliste. Bare egne resultater (actor = brukeren) med lagret invers; leser bare data, ingen
 * leverandørkall.
 */
export const dialogueBatchHistory = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(batchInput).handler(async ({ data, context }) => {
  const db = await access(context.supabase, data.projectId, context.userId);
  const { loadDialogueBatchHistory } = await import("./dialogue-batch.server");
  return loadDialogueBatchHistory(db, context.supabase as AnyClient, data.projectId, data.batchId, context.userId);
});
