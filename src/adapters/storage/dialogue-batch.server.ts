/** DV5: durable sequential work, leased per batch; no browser or page-load orchestration. */
import { applyCommand, diffStates, newId, L, type Command, type AssetVoice } from "@/core";
import { loadProjectState, checkSchema, type AnyClient } from "../storage/project-rows";
import { runSpeech } from "../ai/speech-run.server";
import { memberRole, ROLE_RANK } from "../ai/ai-gate.server";

export async function processDialogueBatch(db: AnyClient, batchId: string, userDb: unknown = db) {
  const lease = newId<"command">();
  const { data: claimed, error } = await db.rpc("claim_dialogue_batch", { p_batch: batchId, p_lease: lease });
  if (error) throw new Error(error.message);
  if (!claimed) return { processed: 0 };
  const batch = claimed as { id: string; project_id: string; created_by: string; character_id: string; voice: AssetVoice };
  let processed = 0;
  const schema = await checkSchema(db);
  const reviews = schema.kind !== "missing" && schema.version >= 62;
  const transition = async (itemId: unknown, patch: Record<string, unknown>) => {
    const { error } = await db.rpc("transition_dialogue_batch_item", { p_item: itemId, p_lease: lease, p_patch: patch });
    if (error) throw new Error(error.message);
  };
  try {
    const role = await memberRole(db, batch.project_id, batch.created_by);
    if ((ROLE_RANK[role ?? ""] ?? 0) < (ROLE_RANK["editor"] ?? 3)) {
      await db.from("dialogue_batches").update({ status: "paused", pause_reason: L("Skrivetilgangen er fjernet.", "Editing permission has been removed.") }).eq("id", batchId).eq("lease_token", lease);
      return { processed };
    }
    const { data: items, error: readError } = await db.from("dialogue_batch_items").select("*").eq("batch_id", batchId).in("status", ["waiting", "ready"]).order("position").limit(2);
    if (readError) throw new Error(readError.message);
    for (const item of (items ?? []) as Record<string, unknown>[]) {
      const { data: guard } = await db.from("dialogue_batches").select("status,lease_token").eq("id", batchId).maybeSingle();
      if (guard?.status !== "running" || guard?.lease_token !== lease) break;
      let result = item["result"] as Extract<Awaited<ReturnType<typeof runSpeech>>, { ok: true }> | null;
      if (!result) {
        await transition(item["id"], { status: "generating", attempts: Number(item["attempts"] ?? 0) + 1 });
        const out = await runSpeech({ projectId: batch.project_id, blockId: String(item["block_id"]), voiceId: batch.voice.voiceId, model: batch.voice.modelId ?? "eleven_v3", language: String(item["language"]), settings: batch.voice.settings ?? {}, expectedRevision: item["script_revision"], jobId: String(item["job_id"]), batch: true }, { userId: batch.created_by, supabase: userDb });
        if (!out.ok) {
          const blocked = out.status === 402 || out.status === 403;
          // 402/403: the provider refused before billing; retried only after the user reconfirms access (reconfirm_dialogue_batch).
          const retryable = !out.ambiguous && (blocked || out.status === 429 || (typeof out.status === "number" && out.status >= 500));
          await transition(item["id"], { status: "failed", error: out.message, retryable });
          if (blocked || out.ambiguous || out.status === 429) {
            await db.from("dialogue_batches").update({ status: "paused", pause_reason: out.message, access_blocked: blocked }).eq("id", batchId).eq("lease_token", lease);
            break;
          }
          processed++; continue;
        }
        const { text: _text, ...receipt } = out;
        result = { ...receipt, text: "" };
        // Persist the provider receipt before any project mutation. A retry only reapplies this result.
        await transition(item["id"], { result: receipt, status: "ready" });
      }
      const state = await loadProjectState(db, batch.project_id);
      const command: Command = { type: "ApplyGeneratedDialogue", occurrenceId: String(item["occurrence_id"]), blockId: String(item["block_id"]), characterId: batch.character_id,
        assetId: result.assetId, variantId: String(item["variant_id"]), versionId: String(item["version_id"]), clipId: String(item["clip_id"]), dialogueVersionId: String(item["dialogue_version_id"]), compositionId: String(item["composition_id"]), media: result.media, language: String(item["language"]),
        ...(reviews ? { reviewId: String(item["command_id"]) } : {}), metadata: { source: "ai", provider: "elevenlabs", voiceId: batch.voice.voiceId, modelId: batch.voice.modelId ?? "eleven_v3", settings: { ...batch.voice.settings, language: String(item["language"]) }, scriptRevision: Number(item["script_revision"]), parentVersionId: null } };
      const applied = applyCommand(state, { id: String(item["command_id"]) as never, actor: batch.created_by as never, at: new Date().toISOString(), command });
      if (!applied.ok) {
        await transition(item["id"], { status: "skipped", retryable: false, error: applied.error.message });
        processed++; continue;
      }
      // SQL wraps apply_changes plus the completion receipt in a single transaction.
      const { error: commitError } = await db.rpc("complete_dialogue_batch_item", { p_item: item["id"], p_lease: lease, p_command: command, p_inverse: applied.inverse, p_changes: diffStates(state, applied.state) });
      if (commitError) throw new Error(commitError.message);
      processed++;
    }
    const { count } = await db.from("dialogue_batch_items").select("id", { count: "exact", head: true }).eq("batch_id", batchId).in("status", ["waiting", "generating", "ready"]);
    if (count === 0) {
      const { count: failed } = await db.from("dialogue_batch_items").select("id", { count: "exact", head: true }).eq("batch_id", batchId).eq("status", "failed");
      await db.from("dialogue_batches").update({ status: failed ? "paused" : "done", ...(failed ? { pause_reason: L("Noen replikker feilet. Tidligere lyd er bevart.", "Some lines failed. Previous audio is preserved.") } : {}) }).eq("id", batchId).eq("status", "running").eq("lease_token", lease);
    }
    return { processed };
  } catch (error) {
    await db.from("dialogue_batches").update({ status: "paused", pause_reason: L("Jobben ble stoppet. Lagrede resultater beholdes; gjenoppta uten å generere dem på nytt.", "The job stopped. Saved results are retained; resume without regenerating them.") }).eq("id", batchId).eq("lease_token", lease);
    throw error;
  } finally {
    await db.from("dialogue_batches").update({ lease_token: null, lease_until: null }).eq("id", batchId).eq("lease_token", lease);
  }
}

export async function pumpDialogueBatches(db: AnyClient) {
  const { data, error } = await db.from("dialogue_batches").select("id").eq("status", "running").order("created_at").limit(1);
  if (error) throw new Error(error.message);
  const batch = data?.[0];
  return batch ? processDialogueBatch(db, batch.id) : { processed: 0 };
}
/**
 * DV5-rest: «Angre hele jobben». Bruker de lagrede inverse kommandoene fra kommandologgen, i omvendt rekkefølge,
 * og skriver hver angring som en vanlig endring via apply_changes (revisjonskontroll). Angrede elementer merkes
 * «undone» og kjøres aldri igjen, så ingen betalt generering gjentas. Stopper ved første konflikt.
 */
export async function undoDialogueBatch(db: AnyClient, projectId: string, batchId: string, actor: string) {
  const { data: batch } = await db.from("dialogue_batches").select("id,status,lease_until").eq("id", batchId).eq("project_id", projectId).maybeSingle();
  if (!batch) throw new Error(L("Jobben finnes ikke", "The job was not found"));
  if (batch.status === "running" && batch.lease_until && new Date(String(batch.lease_until)) > new Date()) throw new Error(L("Jobben kjører. Vent til den er ferdig eller satt på pause.", "The job is running. Wait until it is done or paused."));
  const { data: items, error } = await db.from("dialogue_batch_items").select("id,command_id,position").eq("batch_id", batchId).eq("status", "done").order("position", { ascending: false });
  if (error) throw new Error(error.message);
  let undone = 0;
  for (const item of (items ?? []) as { id: string; command_id: string }[]) {
    const { data: log } = await db.from("change_log").select("inverse").eq("id", item.command_id).eq("project_id", projectId).maybeSingle();
    const inverse = (log as { inverse?: Command } | null)?.inverse;
    if (!inverse) { await db.from("dialogue_batch_items").update({ status: "undone" }).eq("id", item.id).eq("status", "done"); continue; }
    const state = await loadProjectState(db, projectId);
    const applied = applyCommand(state, { id: newId<"command">(), actor: actor as never, at: new Date().toISOString(), command: inverse });
    if (!applied.ok) throw new Error(L(`Angringen stoppet etter ${undone} replikker: ${applied.error.message}`, `Undo stopped after ${undone} lines: ${applied.error.message}`));
    const id = newId<"command">();
    const { error: applyError } = await db.rpc("apply_changes", { p_project: projectId, p_actor: actor, p_command_id: id, p_command: inverse, p_inverse: applied.inverse, p_changes: diffStates(state, applied.state) });
    if (applyError) throw new Error(L(`Angringen stoppet etter ${undone} replikker. Noen har endret replikken siden.`, `Undo stopped after ${undone} lines. Someone has changed the line since.`));
    await db.from("dialogue_batch_items").update({ status: "undone", error: null, retryable: false }).eq("id", item.id).eq("status", "done");
    undone++;
  }
  return { undone };
}
