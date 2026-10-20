/**
 * Skrivehjelp i manuset (T2). Klienten sender bare ID-er og valg; serveren laster prosjektet, bygger prompten
 * med kjernens promptbyggere (bare det utdraget som trengs) og kjører den samme interne T1-kjøringen som
 * `generateText` (oppgaven «script», leverandørvalg, kostnadstak, timegrense og reserve). Loggen i
 * generation_jobs får `kind` i params – aldri prompttekst eller svar.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assistRequestError, buildAssistPrompt, isTextModelId, isTextProviderId, isUuid, type AssistRequest } from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";
import type { GenerateTextResult } from "./text.functions";
import { t } from "@/core/i18n/keyed";

export interface ScriptAssistInput {
  readonly projectId: string;
  readonly request: AssistRequest;
  readonly provider?: string;
  readonly model?: string;
}

export function validateScriptAssistInput(d: unknown): ScriptAssistInput {
  if (!d || typeof d !== "object") throw new Error(t("adapters-ai-script-assist-functions.validate-script-assist-input.message.238c61386bc0"));
  const x = d as Record<string, unknown>;
  if (typeof x["projectId"] !== "string" || !isUuid(x["projectId"]))
    throw new Error(t("adapters-ai-script-assist-functions.validate-script-assist-input.message.ff2e0e59e595"));
  const e = assistRequestError(x["request"]);
  if (e) throw new Error(e);
  const provider = x["provider"];
  if (provider !== undefined && provider !== "lovable" && !isTextProviderId(provider))
    throw new Error(t("adapters-ai-script-assist-functions.validate-script-assist-input.message.5a066fae50bb"));
  const model = x["model"];
  if (model !== undefined && !isTextModelId(model)) throw new Error(t("adapters-ai-script-assist-functions.validate-script-assist-input.message.791135083add"));
  const r = x["request"] as AssistRequest;
  return {
    projectId: x["projectId"],
    // Bare de kjente feltene sendes videre
    request: {
      kind: r.kind,
      productionId: r.productionId,
      occurrenceId: r.occurrenceId,
      blockIds: [...r.blockIds],
      ...(r.afterBlockId !== undefined ? { afterBlockId: r.afterBlockId } : {}),
      ...(r.characterAssetId !== undefined ? { characterAssetId: r.characterAssetId } : {}),
      ...(r.canvasNodeId !== undefined ? { canvasNodeId: r.canvasNodeId } : {}),
      ...(r.description !== undefined ? { description: r.description } : {}),
      ...(r.mode !== undefined ? { mode: r.mode } : {}),
      ...(r.instruction !== undefined ? { instruction: r.instruction } : {}),
    },
    ...(provider !== undefined ? { provider: provider as string } : {}),
    ...(model !== undefined ? { model: model as string } : {}),
  };
}

export const scriptAssist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateScriptAssistInput)
  .handler(async ({ data, context }): Promise<GenerateTextResult> => {
    const { memberRole, ROLE_RANK } = await import("./ai-gate.server");
    const role = await memberRole(context.supabase as unknown as AnyClient, data.projectId, context.userId);
    if ((ROLE_RANK[role ?? ""] ?? 0) < ROLE_RANK["editor"]!)
      return {
        ok: false,
        message: t("adapters-ai-script-assist-functions.message.message.f174bdae2102"),
      };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadProjectState } = await import("@/adapters/storage/project-rows");
    const state = await loadProjectState(supabaseAdmin as unknown as AnyClient, data.projectId);
    const built = buildAssistPrompt(state, data.request);
    if (!built.ok) return { ok: false, message: built.message };
    const { runTextGeneration } = await import("./text-run.server");
    return runTextGeneration(
      context,
      {
        projectId: data.projectId,
        task: "script",
        system: built.prompt.system,
        messages: [{ role: "user", content: built.prompt.user }],
        maxTokens: built.prompt.maxTokens,
        temperature: built.prompt.temperature,
        json: true,
        ...(data.provider !== undefined ? { provider: data.provider } : {}),
        ...(data.model !== undefined ? { model: data.model } : {}),
      },
      { kind: data.request.kind },
    );
  });
