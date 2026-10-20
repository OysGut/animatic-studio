/**
 * P8 masseharmonisering (krav 6): én godkjenning for et samlet kostnadsanslag, varig jobb med lease og
 * idempotens (DV5-mønsteret). Bare redaktører og eiere. Prompter og nøkler logges aldri.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  L,
  estimateCostUsd,
  harmonizeBatchSelectionError,
  isProviderId,
  isUuid,
  newId,
  parseQualityProfileMeta,
} from "@/core";
import type { AnyClient } from "./project-rows";

async function access(supabase: unknown, projectId: string, userId: string) {
  const { memberRole, ROLE_RANK } = await import("../ai/ai-gate.server");
  const role = await memberRole(supabase as AnyClient, projectId, userId);
  if ((ROLE_RANK[role ?? ""] ?? 0) < ROLE_RANK["editor"]!)
    throw new Error(L("Du har ikke skrivetilgang.", "You do not have editing permission."));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}
function projectInput(raw: unknown) {
  const x = (raw ?? {}) as Record<string, unknown>;
  if (typeof x["projectId"] !== "string" || !isUuid(x["projectId"]))
    throw new Error(L("Ugyldig prosjekt", "Invalid project"));
  return { projectId: x["projectId"], raw: x };
}
const uuidOrNull = (v: unknown) => (typeof v === "string" && isUuid(v) ? v : null);

export interface HarmonizeBatchView {
  id: string;
  status: string;
  pause_reason: string | null;
  style_profile_id: string | null;
  reference_version_id: string | null;
  model: string;
  items: { id: string; asset_id: string; source_version_id: string; version_id: string; status: string; error: string | null; retryable: boolean }[];
}

export const listHarmonizeBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(projectInput)
  .handler(async ({ data, context }): Promise<HarmonizeBatchView[]> => {
    const db = await access(context.supabase, data.projectId, context.userId);
    const { data: rows, error } = await db
      .from("harmonize_batches")
      .select("id,status,pause_reason,style_profile_id,reference_version_id,model,items:harmonize_batch_items(id,asset_id,source_version_id,version_id,status,error,retryable)")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (rows ?? []) as HarmonizeBatchView[];
  });

export interface HarmonizeBatchInput {
  projectId: string;
  requestId: string;
  styleProfileId: string | null;
  referenceVersionId: string | null;
  provider: string;
  model: string | null;
  size: "1K" | "2K" | "4K" | null;
  qualityProfile: ReturnType<typeof parseQualityProfileMeta>;
  items: { assetId: string; sourceVersionId: string }[];
  approved: true;
}

export function validateHarmonizeBatch(raw: unknown): HarmonizeBatchInput {
  const { projectId, raw: x } = projectInput(raw);
  if (x["approved"] !== true)
    throw new Error(L("Kostnaden må bekreftes", "The cost must be approved"));
  const requestId = uuidOrNull(x["requestId"]);
  if (!requestId) throw new Error(L("Ugyldig jobb", "Invalid job"));
  const provider = x["provider"] ?? "lovable";
  if (!isProviderId(provider)) throw new Error(L("Ukjent leverandør", "Unknown provider"));
  const model = x["model"] ?? null;
  if (model !== null && (typeof model !== "string" || model.length > 120))
    throw new Error(L("Ugyldig modell", "Invalid model"));
  const size = x["size"] ?? null;
  if (size !== null && size !== "1K" && size !== "2K" && size !== "4K")
    throw new Error(L("Ugyldig størrelse", "Invalid size"));
  const items = x["items"];
  if (!Array.isArray(items) || !items.every((i) => uuidOrNull((i as Record<string, unknown>)?.["assetId"]) && uuidOrNull((i as Record<string, unknown>)?.["sourceVersionId"])))
    throw new Error(L("Ugyldig bildevalg", "Invalid image selection"));
  return {
    projectId,
    requestId,
    styleProfileId: uuidOrNull(x["styleProfileId"]),
    referenceVersionId: uuidOrNull(x["referenceVersionId"]),
    provider,
    model: model as string | null,
    size: size as HarmonizeBatchInput["size"],
    qualityProfile: parseQualityProfileMeta(x["qualityProfile"]),
    items: (items as { assetId: string; sourceVersionId: string }[]).map((i) => ({ assetId: i.assetId, sourceVersionId: i.sourceVersionId })),
    approved: true,
  };
}

export const createHarmonizeBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateHarmonizeBatch)
  .handler(async ({ data, context }) => {
    const db = await access(context.supabase, data.projectId, context.userId);
    const { loadProjectState } = await import("./project-rows");
    const state = await loadProjectState(db, data.projectId);
    const err = harmonizeBatchSelectionError(state, data.items, data.styleProfileId, data.referenceVersionId);
    if (err) throw new Error(err);
    const { builtInImageModel } = await import("@/core");
    const own = data.provider !== "lovable";
    // Massejobben lager frilagte figurer som enkeltharmoniseringen; valgt innebygd modell respekteres (P8-avvik 1)
    const model = own
      ? (data.model ?? "")
      : builtInImageModel(data.model, "cutout", {
          image: process.env["ANIMATIC_IMAGE_MODEL"],
          cutout: process.env["ANIMATIC_CUTOUT_MODEL"],
        });
    const { modelGate } = await import("../account/ai-models.server");
    const gate = await modelGate(db, data.provider, model);
    if (gate.message) throw new Error(gate.message);
    const { projectKey, overAccountCap, overProjectBudget } = await import("../ai/ai-gate.server");
    const key = own ? await projectKey(db, data.projectId, data.provider, context.userId) : null;
    if (own && !key)
      throw new Error(L("Ingen prosjekteier har koblet til denne leverandøren.", "No project owner has connected this provider."));
    const unit = own
      ? estimateCostUsd(data.provider, model, { images: 1, ...(data.size ? { size: data.size } : {}) }, gate.settings)
      : 0;
    if (unit === null) throw new Error(L("Modellprisen er ukjent.", "The model price is unknown."));
    const items = data.items.map((i) => ({
      id: newId<"command">(),
      job_id: newId<"generation_job">(),
      asset_id: i.assetId,
      source_version_id: i.sourceVersionId,
      cost: unit,
      variant_id: newId<"asset_variant">(),
      version_id: newId<"asset_version">(),
      harmonization_id: newId<"command">(),
      command_id: newId<"command">(),
    }));
    if (key) {
      const cap = await overAccountCap(db, key.user_id, unit * items.length, false);
      if (cap) throw new Error(cap);
    }
    const budget = await overProjectBudget(db, data.projectId, state.project.aiMonthLimit, false);
    if (budget) throw new Error(budget);
    const { data: id, error } = await db.rpc("create_harmonize_batch", {
      p_project: data.projectId,
      p_actor: context.userId,
      p_request: data.requestId,
      p_style_profile: data.styleProfileId,
      p_reference_version: data.referenceVersionId,
      p_provider: data.provider,
      p_model: model,
      p_size: data.size,
      p_quality_profile: data.qualityProfile,
      p_items: items,
      p_key: key?.id ?? null,
      p_key_owner: key?.user_id ?? null,
    });
    if (error) throw new Error(error.message);
    return { id: String(id) };
  });

function batchInput(raw: unknown) {
  const { projectId, raw: x } = projectInput(raw);
  const batchId = uuidOrNull(x["batchId"]);
  if (!batchId) throw new Error(L("Ugyldig jobb", "Invalid job"));
  return { projectId, batchId, approved: x["approved"] === true };
}

export const advanceHarmonizeBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(batchInput)
  .handler(async ({ data, context }) => {
    const db = await access(context.supabase, data.projectId, context.userId);
    const { data: row } = await db.from("harmonize_batches").select("id").eq("id", data.batchId).eq("project_id", data.projectId).maybeSingle();
    if (!row) throw new Error(L("Jobben finnes ikke", "The job was not found"));
    const { processHarmonizeBatch } = await import("./harmonize-batch.server");
    return processHarmonizeBatch(db, data.batchId);
  });

/** Gjenopptak krever ny eksplisitt bekreftelse; bare elementer som sikkert ikke ble fakturert, kjøres igjen. */
export const resumeHarmonizeBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(batchInput)
  .handler(async ({ data, context }) => {
    if (!data.approved)
      throw new Error(L("Bekreft kostnaden på nytt før jobben fortsetter.", "Approve the cost again before the job continues."));
    const db = await access(context.supabase, data.projectId, context.userId);
    const { error } = await db.rpc("reconfirm_harmonize_batch", { p_project: data.projectId, p_batch: data.batchId, p_actor: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
