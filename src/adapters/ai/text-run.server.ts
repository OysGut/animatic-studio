/**
 * Den interne kjøringen av tekst-AI (T1), felles for `generateText` og skrivehjelpen i manuset (T2).
 * Oppførselen er den samme som før uttrekket; `extraParams` legges bare til i loggens params (for eksempel
 * `kind` for skrivehjelpen) og inneholder aldri prompttekst.
 */
import { TEXT_PROVIDERS, TEXT_PREFS_KEY, chooseTextModel, estimateTextCostUsd, isModelEnabled, isTextPrefs, newId, type AvailableTextProvider, type TextProviderId } from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";
import { TEXT_MODELS } from "./write-prompt.functions";
import {
  MAX_TEXT_JOBS_PER_USER_PER_HOUR,
  lovableText,
  type GenerateTextInput,
  type GenerateTextResult,
  type KeyOwnerKind,
} from "./text.functions";
import { t as tk } from "@/core/i18n/keyed";

interface TextKeyRow {
  readonly id: string;
  readonly user_id: string;
  readonly provider: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly key_version: number;
  readonly text_models?: unknown;
}

const KEY_COLUMNS = "id, user_id, provider, ciphertext, iv, key_version, text_models";

/** Nøkkelen for leverandøren: brukerens egen først, ellers prosjekteierens (som projectKey). */
async function textKey(
  admin: AnyClient,
  projectId: string,
  provider: TextProviderId,
  userId: string,
): Promise<{ row: TextKeyRow; owner: "self" | "project_owner" } | null> {
  const { data: own } = await admin
    .from("ai_provider_keys")
    .select(KEY_COLUMNS)
    .eq("user_id", userId)
    .eq("provider", provider)
    .neq("status", "failed")
    .maybeSingle();
  if (own) return { row: own as unknown as TextKeyRow, owner: "self" };
  const { projectKey } = await import("./ai-gate.server");
  const key = await projectKey(admin, projectId, provider, userId);
  if (!key) return null;
  const { data: full } = await admin
    .from("ai_provider_keys")
    .select(KEY_COLUMNS)
    .eq("id", key.id)
    .maybeSingle();
  if (!full) return null;
  const row = full as unknown as TextKeyRow;
  return { row, owner: row.user_id === userId ? "self" : "project_owner" };
}

const modelsOf = (row: TextKeyRow): string[] =>
  Array.isArray(row.text_models)
    ? row.text_models.filter((m): m is string => typeof m === "string")
    : [];

export async function runTextGeneration(
  context: { readonly supabase: unknown; readonly userId: string },
  data: GenerateTextInput,
  extraParams: Readonly<Record<string, unknown>> = {},
): Promise<GenerateTextResult> {
  const { memberRole, ROLE_RANK, overAccountCap, userTextJobsInHour } = await import("./ai-gate.server");
  const role = await memberRole(
    context.supabase as unknown as AnyClient,
    data.projectId,
    context.userId,
  );
  if ((ROLE_RANK[role ?? ""] ?? 0) < ROLE_RANK["editor"]!)
    return {
      ok: false,
      message: tk("adapters-ai-text-run-server.message.message.b7c8025f319f"),
    };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as AnyClient;
  const schema = await checkSchema(admin);
  if (schema.kind === "missing" || schema.version < 38)
    return {
      ok: false,
      message: tk("adapters-ai-text-run-server.message.message.1bb4d9cfaa4a"),
    };
  const { data: proj } = await admin
    .from("projects")
    .select("id, deleted_at, ai_month_limit")
    .eq("id", data.projectId)
    .maybeSingle();
  if (!proj || (proj as { deleted_at?: string | null }).deleted_at)
    return { ok: false, message: tk("adapters-ai-text-run-server.message.message.66ba62cdf3e7") };
  if ((proj as { ai_month_limit?: number | null }).ai_month_limit === 0)
    return {
      ok: false,
      message: tk("adapters-ai-text-run-server.message.message.5c8257bb8acc"),
    };

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const overHourly = async (extra: number): Promise<string | null> => {
    const count = await userTextJobsInHour(admin, context.userId, hourAgo);
    return count - extra >= MAX_TEXT_JOBS_PER_USER_PER_HOUR
      ? tk("adapters-ai-text-run-server.over-hourly.message.a640e864f25e", { MAX_TEXT_JOBS_PER_USER_PER_HOUR: String(MAX_TEXT_JOBS_PER_USER_PER_HOUR) })
      : null;
  };
  const before = await overHourly(0);
  if (before) return { ok: false, message: before };

  // Leverandører med nøkkel (egen først, ellers prosjekteierens) og brukerens valg
  const { loadModelSettings } = await import("@/adapters/account/ai-models.server");
  const { settings } = await loadModelSettings(admin);
  const keys = new Map<TextProviderId, { row: TextKeyRow; owner: "self" | "project_owner" }>();
  for (const p of TEXT_PROVIDERS) {
    const k = await textKey(admin, data.projectId, p, context.userId);
    if (k) keys.set(p, k);
  }
  const available: AvailableTextProvider[] = [...keys].map(([provider, k]) => ({
    provider,
    models: modelsOf(k.row),
  }));
  const { data: profile } = await admin
    .from("profiles")
    .select("ui_prefs")
    .eq("user_id", context.userId)
    .maybeSingle();
  const rawPrefs = ((profile as { ui_prefs?: Record<string, unknown> } | null)?.ui_prefs ?? {})[
    TEXT_PREFS_KEY
  ];
  const override = process.env["ANIMATIC_TEXT_MODEL"];
  const lovableModels: readonly string[] = override ? [override] : TEXT_MODELS;
  const picked = chooseTextModel({
    explicit:
      data.provider || data.model ? { provider: data.provider, model: data.model } : undefined,
    task: data.task,
    prefs: isTextPrefs(rawPrefs) ? rawPrefs : null,
    available,
    isEnabled: (p, m) => isModelEnabled(settings, p, m),
    lovableModel: lovableModels[0]!,
  });
  if (picked.error !== undefined) return { ok: false, message: picked.error };
  const { choice, reason } = picked;
  const keyInfo = choice.provider === "lovable" ? null : keys.get(choice.provider)!;
  const keyOwner: KeyOwnerKind = keyInfo ? keyInfo.owner : "lovable";

  const inputChars =
    (data.system?.length ?? 0) + data.messages.reduce((t, m) => t + m.content.length, 0);
  const estimate = estimateTextCostUsd(
    choice.provider,
    choice.model,
    Math.ceil(inputChars / 4),
    data.maxTokens,
  );
  let lovableKey: string | undefined;
  if (keyInfo) {
    const capped = await overAccountCap(admin, keyInfo.row.user_id, estimate, false);
    if (capped) return { ok: false, message: capped };
  } else {
    lovableKey = process.env["LOVABLE_API_KEY"];
    if (!lovableKey)
      return {
        ok: false,
        message: tk("adapters-ai-text-run-server.message.message.c8cbed9fde5f"),
      };
  }

  const jobId = newId<"generation_job">();
  const baseParams = {
    task: data.task,
    provider: choice.provider,
    model: choice.model,
    reason,
    keyOwner,
    ...extraParams,
  };
  const { error: logErr } = await admin.from("generation_jobs").insert({
    id: jobId,
    project_id: data.projectId,
    kind: "text",
    provider: choice.provider,
    model: choice.model.slice(0, 100),
    // Prompten lagres ikke (T1): bare oppgaven
    prompt: `[${data.task}]`,
    status: "running",
    created_by: context.userId,
    estimated_cost: estimate,
    cost_usd: estimate,
    provider_key_id: keyInfo?.row.id ?? null,
    key_owner: keyInfo?.row.user_id ?? null,
    params: { ...baseParams, estimatedUsd: estimate },
    started_at: new Date().toISOString(),
  } as never);
  if (logErr)
    return {
      ok: false,
      message: tk("adapters-ai-text-run-server.message.message.16bc4a16500e", { message: String(logErr.message) }),
    };
  // Samtidige kall: kontroller på nytt med denne jobben registrert
  const after =
    (await overHourly(1)) ??
    (keyInfo ? await overAccountCap(admin, keyInfo.row.user_id, estimate, true) : null);
  if (after) {
    await admin.from("generation_jobs").delete().eq("id", jobId);
    return { ok: false, message: after };
  }
  const finish = async (patch: Record<string, unknown>) => {
    await admin
      .from("generation_jobs")
      .update({ ...patch, finished_at: new Date().toISOString() } as never)
      .eq("id", jobId);
  };

  let secret: string | null = null;
  try {
    let stopReason: string | undefined;
    let text: string;
    let model: string;
    let usage: { inputTokens: number; outputTokens: number };
    if (keyInfo && choice.provider !== "lovable") {
      const { decryptKey } = await import("./key-vault.server");
      secret = await decryptKey(keyInfo.row, {
        userId: keyInfo.row.user_id,
        provider: choice.provider,
        rowId: keyInfo.row.id,
      });
      const { generateProviderText } = await import("./providers.server");
      const r = await generateProviderText(choice.provider, {
        key: secret,
        model: choice.model,
        ...(data.system ? { system: data.system } : {}),
        messages: data.messages,
        maxTokens: data.maxTokens,
        ...(data.temperature !== undefined ? { temperature: data.temperature } : {}),
        ...(data.json ? { json: true } : {}),
      });
      ({ text, model, usage, stopReason } = r);
    } else {
      const r = await lovableText(
        lovableKey!,
        lovableModels.includes(choice.model) ? lovableModels : [choice.model],
        data,
      );
      if (!r.ok) {
        await finish({
          status: "failed",
          model: r.model.slice(0, 100),
          cost_usd: 0,
          error: extraParams["storyboard"] ? "storyboard_provider_error" : r.message.slice(0, 2000),
          params: { ...baseParams, estimatedUsd: estimate, ...r.details },
        });
        return { ok: false, message: r.message, ...(r.truncated ? { truncated: true } : {}) };
      }
      ({ text, model, usage, stopReason } = r);
    }
    const costUsd = estimateTextCostUsd(
      choice.provider,
      choice.model,
      usage.inputTokens,
      usage.outputTokens,
    );
    await finish({
      status: "done",
      model: model.slice(0, 100),
      cost_usd: Number.isFinite(costUsd) ? costUsd : estimate,
      params: {
        ...baseParams,
        estimatedUsd: estimate,
        stopReason,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd,
      },
    });
    return {
      ok: true,
      text,
      provider: choice.provider,
      model,
      usage,
      costUsd,
      usedFallback: reason === "fallback",
      reason,
      keyOwner,
      jobId,
    };
  } catch (e) {
    const { scrubSecret, ProviderError } = await import("./providers.server");
    const raw = (e as Error).message || tk("adapters-ai-text-run-server.raw.message.28ecf6141d74");
    const message = scrubSecret(raw, secret);
    // Avvist kall: ingen kostnad hos leverandøren
    await finish({ status: "failed", cost_usd: 0, error: extraParams["storyboard"] ? "storyboard_provider_error" : message.slice(0, 2000),
      params: { ...baseParams, estimatedUsd: estimate, ...(e instanceof ProviderError ? e.details : {}) },
    });
    return {
      ok: false,
      ...(e instanceof ProviderError && e.code === "truncated" ? { truncated: true } : {}),
      message:
        (e as Error).name === "TimeoutError"
          ? tk("adapters-ai-text-run-server.message.message.f402d1f17024")
          : tk("adapters-ai-text-run-server.message.message.eb2d9690bdb9", { message: String(message) }),
    };
  }
}
