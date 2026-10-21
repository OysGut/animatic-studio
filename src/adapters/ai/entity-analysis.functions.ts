/**
 * Automatisk gjenkjenning av karakterer, dyr, objekter, steder, miljø og lyd (OG2, B-047). Kjøres med den
 * innebygde AI-en på tjenestens regning, uten kostnadsbekreftelse. Klienten sender bare prosjekt og
 * scene-ID-er; serveren leser manuset og bygger prompten selv. Resultatet lagres per scene med hash av
 * innholdet (script_entity_analysis, migrasjon 0041). Ingen ressurser opprettes.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid, librarySuggestions, mainProduction } from "@/core";
import {
  ENTITY_ANALYSIS_MAX_CANDIDATES,
  ENTITY_ANALYSIS_MAX_SCENES_PER_RUN,
  analysisFromJson,
  analysisScenes,
  candidatesInScene,
  scenesNeedingAnalysis,
  type StoredSceneAnalysis,
} from "@/core/library/analysis-hash";
import { classifyEntitiesPrompt, type AIClassification } from "@/core/library/classification-prompt";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { t } from "@/core/i18n/keyed";

export interface AnalyzeInput {
  readonly projectId: string;
  readonly scope: "all" | { readonly sceneIds: readonly string[] };
  readonly language: "nb" | "en";
}

export type AnalyzeResult =
  | {
      readonly ok: true;
      readonly analyzedScenes: number;
      readonly remainingScenes: number;
      readonly newSuggestions: number;
    }
  | { readonly ok: false; readonly message: string; readonly retryable: boolean };

export function validateAnalyzeInput(d: unknown): AnalyzeInput {
  const x = (d ?? {}) as Record<string, unknown>;
  if (typeof x["projectId"] !== "string" || !isUuid(x["projectId"]))
    throw new Error(t("adapters-ai-entity-analysis-functions.validate-analyze-input.message.cfa026a0c68f"));
  const scope = x["scope"];
  let s: AnalyzeInput["scope"];
  if (scope === "all") s = "all";
  else {
    const ids = (scope as { sceneIds?: unknown } | null)?.sceneIds;
    if (!Array.isArray(ids) || ids.length > 500 || !ids.every((v) => typeof v === "string" && isUuid(v)))
      throw new Error(t("adapters-ai-entity-analysis-functions.validate-analyze-input.message.88cc30b04a23"));
    s = { sceneIds: ids as string[] };
  }
  return { projectId: x["projectId"], scope: s, language: x["language"] === "en" ? "en" : "nb" };
}

async function readStored(db: AnyClient, projectId: string): Promise<StoredSceneAnalysis[]> {
  const { data, error } = await db
    .from("script_entity_analysis")
    .select("scene_id, content_hash, result")
    .eq("project_id", projectId)
    .eq("removed", false);
  if (error) return [];
  return ((data ?? []) as { scene_id: string; content_hash: string; result: { items?: AIClassification[] } }[]).map(
    (r) => ({
      sceneId: r.scene_id,
      contentHash: r.content_hash,
      items: Array.isArray(r.result?.items) ? r.result.items : [],
    }),
  );
}

/** Lagret analyse for prosjektet (RLS: bare medlemmer). */
export const listEntityAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (typeof x["projectId"] !== "string" || !isUuid(x["projectId"]))
      throw new Error(t("adapters-ai-entity-analysis-functions.list-entity-analysis.create-server-fn-method-post-middleware-require-supabase-auth-validator.8df87b652a66"));
    return { projectId: x["projectId"] };
  })
  .handler(async ({ data, context }) => {
    const rows = await readStored(context.supabase as unknown as AnyClient, data.projectId);
    return { rows: rows.map((r) => ({ sceneId: r.sceneId, contentHash: r.contentHash, items: [...r.items] })) };
  });

export const analyzeScriptEntities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateAnalyzeInput)
  .handler(async ({ data, context }): Promise<AnalyzeResult> => {
    const { memberRole, ROLE_RANK } = await import("./ai-gate.server");
    const role = await memberRole(context.supabase as unknown as AnyClient, data.projectId, context.userId);
    if ((ROLE_RANK[role ?? ""] ?? 0) < ROLE_RANK["editor"]!)
      return {
        ok: false,
        retryable: false,
        message: t("adapters-ai-entity-analysis-functions.message.message.3b81e2f9bbbd"),
      };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnyClient;
    const { checkSchema, loadProjectState } = await import("@/adapters/storage/project-rows");
    const schema = await checkSchema(admin);
    if (schema.kind === "missing" || schema.version < 41)
      return {
        ok: false,
        retryable: false,
        message: t("adapters-ai-entity-analysis-functions.message.message.ffdd8e5d9d13"),
      };
    const state = await loadProjectState(admin, data.projectId);
    const prod = mainProduction(state);
    if (!prod) return { ok: true, analyzedScenes: 0, remainingScenes: 0, newSuggestions: 0 };
    const scenes = analysisScenes(state, prod.id);
    const stored = await readStored(admin, data.projectId);
    const wanted = data.scope === "all" ? null : new Set(data.scope.sceneIds);
    // Serveren regner hashen selv: uendrede scener hoppes over («all» = analyser alt på nytt)
    const todo = wanted
      ? scenesNeedingAnalysis(scenes, stored).filter((id) => wanted.has(id))
      : scenes.map((sc) => sc.sceneId);
    const batch = scenes.filter((sc) => todo.slice(0, ENTITY_ANALYSIS_MAX_SCENES_PER_RUN).includes(sc.sceneId));
    if (!batch.length) return { ok: true, analyzedScenes: 0, remainingScenes: 0, newSuggestions: 0 };

    const suggestions = librarySuggestions(state, prod.id);
    const perScene = batch.map((sc) => ({ sc, cands: candidatesInScene(suggestions, sc.text) }));
    const names = [...new Set(perScene.flatMap((p) => p.cands.map((c) => c.name)))].slice(0, ENTITY_ANALYSIS_MAX_CANDIDATES);
    let items: AIClassification[] = [];
    let model = "";
    if (names.length) {
      const cands = suggestions.filter((s) => names.includes(s.name));
      const prompt = classifyEntitiesPrompt({
        candidates: cands,
        contexts: Object.fromEntries(cands.map((s) => [s.name, s.contexts ?? []])),
        language: data.language,
      });
      const { runServiceAi } = await import("./service-ai.server");
      const r = await runServiceAi({
        admin,
        projectId: data.projectId,
        userId: context.userId,
        task: "entity_analysis",
        system: prompt.system,
        user: prompt.user,
        maxTokens: 4000,
      });
      if (!r.ok) return r;
      items = analysisFromJson(r.text, names);
      model = r.model;
    }
    const byName = new Map(items.map((i) => [i.name, i]));
    const before = new Set(stored.flatMap((r) => r.items.map((i) => i.name)));
    const upserts = perScene.map(({ sc, cands }) => ({
      project_id: data.projectId,
      scene_id: sc.sceneId,
      content_hash: sc.hash,
      result: { items: cands.map((c) => byName.get(c.name)).filter(Boolean) },
      model: model.slice(0, 100),
      analyzed_at: new Date().toISOString(),
      created_by: context.userId,
    }));
    const { saveEntityAnalysis } = await import("@/adapters/storage/entity-analysis.server");
    const error = await saveEntityAnalysis(admin, upserts);
    if (error)
      return { ok: false, retryable: false, message: t("adapters-ai-entity-analysis-functions.message.message.33f365d71838") };
    return {
      ok: true,
      analyzedScenes: batch.length,
      remainingScenes: Math.max(0, todo.length - batch.length),
      newSuggestions: items.filter((i) => !before.has(i.name)).length,
    };
  });
