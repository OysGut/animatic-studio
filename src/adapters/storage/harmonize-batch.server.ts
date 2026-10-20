/**
 * P8 masseharmonisering: varig jobb med lease per jobb (samme mønster som DV5). Hvert element går
 * waiting → generating → ready (kvittering lagret) → done (lagt inn via apply_changes i samme transaksjon som
 * kvitteringen). Et element som stoppet midt i «generating», kan ha vært fakturert og kjøres aldri på nytt
 * (claim_harmonize_batch merker det som ikke-gjentakbart). Prompter og nøkler logges aldri.
 */
import { applyCommand, buildHarmonizePrompt, diffStates, harmonizeAttachments, harmonizeBatchCommand, newId, type AssetMedia, type Command, type ImageSize, type QualityProfileSnapshot } from "@/core";
import { loadProjectState, type AnyClient } from "./project-rows";
import { memberRole, ROLE_RANK } from "../ai/ai-gate.server";
import { runImageGeneration } from "../ai/image-run.server";
import { t } from "@/core/i18n/keyed";

interface BatchRow {
  id: string;
  project_id: string;
  created_by: string;
  style_profile_id: string | null;
  reference_version_id: string | null;
  provider: string;
  model: string;
  size: string | null;
}

/** Kjører høyst `limit` elementer under én lease. Gir antall behandlede. */
export async function processHarmonizeBatch(db: AnyClient, batchId: string, limit = 2) {
  const lease = newId<"command">();
  const { data: claimed, error } = await db.rpc("claim_harmonize_batch", { p_batch: batchId, p_lease: lease });
  if (error) throw new Error(error.message);
  if (!claimed) return { processed: 0 };
  const batch = claimed as BatchRow;
  let processed = 0;
  const transition = async (itemId: unknown, patch: Record<string, unknown>) => {
    const { error } = await db.rpc("transition_harmonize_batch_item", { p_item: itemId, p_lease: lease, p_patch: patch });
    if (error) throw new Error(error.message);
  };
  const pause = (reason: string, blocked = false) =>
    db.from("harmonize_batches").update({ status: "paused", pause_reason: reason, access_blocked: blocked }).eq("id", batchId).eq("lease_token", lease);
  try {
    const role = await memberRole(db, batch.project_id, batch.created_by);
    if ((ROLE_RANK[role ?? ""] ?? 0) < (ROLE_RANK["editor"] ?? 3)) {
      await pause(t("adapters-storage-harmonize-batch-server.process-harmonize-batch.pause.5e7ffefc6544"));
      return { processed };
    }
    const { data: items, error: readError } = await db.from("harmonize_batch_items").select("*").eq("batch_id", batchId).in("status", ["waiting", "ready"]).order("position").limit(limit);
    if (readError) throw new Error(readError.message);
    for (const item of (items ?? []) as Record<string, unknown>[]) {
      const { data: guard } = await db.from("harmonize_batches").select("status,lease_token").eq("id", batchId).maybeSingle();
      if (guard?.status !== "running" || guard?.lease_token !== lease) break;
      const { data: job } = await db.from("generation_jobs").select("params").eq("id", String(item["job_id"])).maybeSingle();
      const qualityProfile = ((job as { params?: { qualityProfile?: QualityProfileSnapshot } } | null)?.params?.qualityProfile) ?? null;
      let result = item["result"] as { media: AssetMedia; model: string } | null;
      if (!result) {
        const state = await loadProjectState(db, batch.project_id);
        const input = { assetId: String(item["asset_id"]), versionId: String(item["source_version_id"]), styleProfileId: batch.style_profile_id, referenceVersionId: batch.reference_version_id };
        const prompt = buildHarmonizePrompt(state, input);
        if (!prompt) {
          await transition(item["id"], { status: "skipped", retryable: false, error: t("adapters-storage-harmonize-batch-server.error.error.c1d64ea3057c") });
          await db.from("generation_jobs").update({ status: "failed", error: "skipped" } as never).eq("id", String(item["job_id"]));
          processed++; continue;
        }
        await transition(item["id"], { status: "generating", attempts: Number(item["attempts"] ?? 0) + 1 });
        const out = await runImageGeneration(
          { projectId: batch.project_id, assetId: input.assetId, prompt, referencePaths: harmonizeAttachments(state, input).map((a) => a.path), identityFirst: true, purpose: "cutout", variantId: String(item["variant_id"]), provider: batch.provider, model: batch.model, size: (batch.size as ImageSize | null) ?? null, approved: true, qualityProfile },
          { userId: batch.created_by, supabase: db },
          { existingJobId: String(item["job_id"]) },
        );
        if (!out.ok) {
          // Et resultat som kan være fakturert («lost»), gjentas aldri; andre feil kan prøves igjen etter ny start
          const { data: after } = await db.from("generation_jobs").select("status").eq("id", String(item["job_id"])).maybeSingle();
          const charged = (after as { status?: string } | null)?.status === "lost";
          await transition(item["id"], { status: "failed", error: out.message.slice(0, 2000), retryable: !charged });
          await pause(out.message.slice(0, 2000));
          break;
        }
        result = { media: out.media, model: out.model };
        // Kvitteringen lagres før prosjektet endres; en ny kjøring legger bare inn dette resultatet
        await transition(item["id"], { result, status: "ready" });
      }
      const state = await loadProjectState(db, batch.project_id);
      const command = harmonizeBatchCommand(
        state,
        { assetId: String(item["asset_id"]), sourceVersionId: String(item["source_version_id"]), variantId: String(item["variant_id"]), versionId: String(item["version_id"]), harmonizationId: String(item["harmonization_id"]) },
        result,
        { styleProfileId: batch.style_profile_id, referenceVersionId: batch.reference_version_id, qualityProfile },
      ) as Command;
      const applied = applyCommand(state, { id: String(item["command_id"]) as never, actor: batch.created_by as never, at: new Date().toISOString(), command });
      if (!applied.ok) {
        await transition(item["id"], { status: "skipped", retryable: false, error: applied.error.message });
        processed++; continue;
      }
      const { error: commitError } = await db.rpc("complete_harmonize_batch_item", { p_item: item["id"], p_lease: lease, p_command: command, p_inverse: applied.inverse, p_changes: diffStates(state, applied.state) });
      if (commitError) throw new Error(commitError.message);
      processed++;
    }
    const { count } = await db.from("harmonize_batch_items").select("id", { count: "exact", head: true }).eq("batch_id", batchId).in("status", ["waiting", "generating", "ready"]);
    if (count === 0) {
      const { count: failed } = await db.from("harmonize_batch_items").select("id", { count: "exact", head: true }).eq("batch_id", batchId).eq("status", "failed");
      await db.from("harmonize_batches").update({ status: failed ? "paused" : "done", ...(failed ? { pause_reason: t("adapters-storage-harmonize-batch-server.pause-reason.pause-reason.7faef36b486d") } : {}) }).eq("id", batchId).eq("status", "running").eq("lease_token", lease);
    }
    return { processed };
  } catch (e) {
    await pause(t("adapters-storage-harmonize-batch-server.process-harmonize-batch.pause.5373757652a0"));
    throw e;
  } finally {
    await db.from("harmonize_batches").update({ lease_token: null, lease_until: null }).eq("id", batchId).eq("lease_token", lease);
  }
}

/** Tidsstyrt fortsettelse (cron): én jobb om gangen. */
export async function pumpHarmonizeBatches(db: AnyClient) {
  const { data, error } = await db.from("harmonize_batches").select("id").eq("status", "running").order("created_at").limit(1);
  if (error) throw new Error(error.message);
  const batch = (data as { id: string }[] | null)?.[0];
  return batch ? processHarmonizeBatch(db, batch.id) : { processed: 0 };
}
