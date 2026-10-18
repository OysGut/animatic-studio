/**
 * Felles tekst-AI (T1, grunnmuren for Story Lab): én serverfunksjon for alle tekstoppgaver.
 *
 * Leverandør og modell velges i kjernen (`chooseTextModel`): eksplisitt valg, brukerens valg for
 * oppgavegruppen (profiles.ui_prefs → aiText), første leverandør med gyldig nøkkel, og til slutt Lovable AI
 * som reserve. Nøkkelen er brukerens egen først; har brukeren ingen gyldig nøkkel hos leverandøren, brukes
 * prosjekteierens (som for bilde og video). Kostnadstaket gjelder kontoen som eier nøkkelen som brukes.
 *
 * Krever redaktør eller eier i prosjektet. Tak per bruker per time. Loggen i generation_jobs (kind «text»,
 * migrasjon 0038) har leverandør, modell, tokens og anslått kostnad – aldri prompttekst eller svar.
 * Nøkler logges aldri og sendes aldri til nettleseren.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  L,
  TEXT_PROVIDERS,
  TEXT_PREFS_KEY,
  chooseTextModel,
  estimateTextCostUsd,
  isModelEnabled,
  isTextModelId,
  isTextPrefs,
  isTextProviderId,
  isTextTask,
  isUuid,
  newId,
  type AvailableTextProvider,
  type TextChoiceReason,
  type TextProviderId,
  type TextTask,
} from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";
import { GATEWAY, gatewayError, isUnknownModelError } from "./gateway";
import { TEXT_MODELS } from "./write-prompt.functions";

export const MAX_TEXT_JOBS_PER_USER_PER_HOUR = 120;
export const MAX_TEXT_SYSTEM_CHARS = 20_000;
export const MAX_TEXT_MESSAGES = 60;
export const MAX_TEXT_TOTAL_CHARS = 200_000;
export const MAX_TEXT_OUTPUT_TOKENS = 8000;
const DEFAULT_TEXT_OUTPUT_TOKENS = 2000;

export interface GenerateTextInput {
  readonly projectId: string;
  readonly task: TextTask;
  readonly system?: string;
  readonly messages: readonly { readonly role: "user" | "assistant"; readonly content: string }[];
  readonly maxTokens: number;
  readonly temperature?: number;
  readonly json?: boolean;
  readonly provider?: string;
  readonly model?: string;
}

export type KeyOwnerKind = "self" | "project_owner" | "lovable";

export type GenerateTextResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly provider: TextProviderId | "lovable";
      readonly model: string;
      readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
      readonly costUsd: number;
      /** Lovable AI ble brukt fordi ingen egen leverandør kunne brukes. */
      readonly usedFallback: boolean;
      readonly reason: TextChoiceReason;
      readonly keyOwner: KeyOwnerKind;
      readonly jobId: string;
    }
  | { readonly ok: false; readonly message: string };

/** Kontroll av input (eksportert for testene). */
export function validateTextInput(d: unknown): GenerateTextInput {
  if (!d || typeof d !== "object") throw new Error(L("Ugyldig forespørsel", "Invalid request"));
  const x = d as Record<string, unknown>;
  const projectId = x["projectId"];
  if (typeof projectId !== "string" || !isUuid(projectId))
    throw new Error(L("Ugyldig prosjekt", "Invalid project"));
  if (!isTextTask(x["task"])) throw new Error(L("Ukjent oppgave", "Unknown task"));
  const system = x["system"];
  if (system !== undefined && (typeof system !== "string" || system.length > MAX_TEXT_SYSTEM_CHARS))
    throw new Error(L("Systeminstruksen er for lang", "The system instruction is too long"));
  const messages = x["messages"];
  if (
    !Array.isArray(messages) ||
    messages.length < 1 ||
    messages.length > MAX_TEXT_MESSAGES ||
    !messages.every(
      (m) =>
        m &&
        typeof m === "object" &&
        ((m as Record<string, unknown>)["role"] === "user" ||
          (m as Record<string, unknown>)["role"] === "assistant") &&
        typeof (m as Record<string, unknown>)["content"] === "string" &&
        ((m as Record<string, unknown>)["content"] as string).length > 0,
    )
  )
    throw new Error(L("Ugyldige meldinger", "Invalid messages"));
  const msgs = messages as { role: "user" | "assistant"; content: string }[];
  if (msgs[msgs.length - 1]!.role !== "user")
    throw new Error(
      L("Siste melding må være fra brukeren", "The last message must be from the user"),
    );
  const total =
    (typeof system === "string" ? system.length : 0) +
    msgs.reduce((t, m) => t + m.content.length, 0);
  if (total > MAX_TEXT_TOTAL_CHARS)
    throw new Error(L("Teksten er for lang", "The text is too long"));
  const maxTokens = x["maxTokens"] ?? DEFAULT_TEXT_OUTPUT_TOKENS;
  if (
    typeof maxTokens !== "number" ||
    !Number.isInteger(maxTokens) ||
    maxTokens < 1 ||
    maxTokens > MAX_TEXT_OUTPUT_TOKENS
  )
    throw new Error(L("Ugyldig svarlengde", "Invalid reply length"));
  const temperature = x["temperature"];
  if (
    temperature !== undefined &&
    (typeof temperature !== "number" ||
      !Number.isFinite(temperature) ||
      temperature < 0 ||
      temperature > 2)
  )
    throw new Error(L("Ugyldig temperatur", "Invalid temperature"));
  const provider = x["provider"];
  if (provider !== undefined && provider !== "lovable" && !isTextProviderId(provider))
    throw new Error(L("Ukjent tekstleverandør", "Unknown text provider"));
  const model = x["model"];
  if (model !== undefined && !isTextModelId(model))
    throw new Error(L("Ugyldig modell", "Invalid model"));
  return {
    projectId,
    task: x["task"] as TextTask,
    ...(typeof system === "string" && system ? { system } : {}),
    messages: msgs.map((m) => ({ role: m.role, content: m.content })),
    maxTokens,
    ...(temperature !== undefined ? { temperature: temperature as number } : {}),
    ...(x["json"] === true ? { json: true } : {}),
    ...(provider !== undefined ? { provider: provider as string } : {}),
    ...(model !== undefined ? { model: model as string } : {}),
  };
}

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

/** Lovable AI Gateway (reserven): Chat Completions. */
export async function lovableText(
  key: string,
  models: readonly string[],
  d: GenerateTextInput,
): Promise<
  | { ok: true; text: string; model: string; usage: { inputTokens: number; outputTokens: number } }
  | { ok: false; message: string; model: string }
> {
  let last = models[0]!;
  for (const model of models) {
    last = model;
    const system = [d.system, d.json ? "Reply with a single valid JSON value only." : ""]
      .filter(Boolean)
      .join("\n\n");
    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model,
        messages: [...(system ? [{ role: "system", content: system }] : []), ...d.messages],
        max_tokens: d.maxTokens,
        ...(d.temperature !== undefined ? { temperature: d.temperature } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (isUnknownModelError(res.status, body)) continue;
      return { ok: false, message: gatewayError(res.status, body), model };
    }
    const j = (await res.json()) as {
      choices?: { message?: { content?: unknown } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const c = j.choices?.[0]?.message?.content;
    const text = typeof c === "string" ? c : "";
    if (!text.trim())
      return {
        ok: false,
        message: L("AI-tjenesten svarte uten tekst.", "The AI service replied without text."),
        model,
      };
    return {
      ok: true,
      text,
      model,
      usage: {
        inputTokens: Number(j.usage?.prompt_tokens) || 0,
        outputTokens: Number(j.usage?.completion_tokens) || 0,
      },
    };
  }
  return {
    ok: false,
    message: L(
      "Lovable kjente ikke igjen noen av språkmodellene. Sett ANIMATIC_TEXT_MODEL i Lovable Cloud.",
      "Lovable did not recognise any of the language models. Set ANIMATIC_TEXT_MODEL in Lovable Cloud.",
    ),
    model: last,
  };
}

export const generateText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateTextInput)
  .handler(async ({ data, context }): Promise<GenerateTextResult> => {
    const { memberRole, ROLE_RANK, overAccountCap } = await import("./ai-gate.server");
    const role = await memberRole(
      context.supabase as unknown as AnyClient,
      data.projectId,
      context.userId,
    );
    if ((ROLE_RANK[role ?? ""] ?? 0) < ROLE_RANK["editor"]!)
      return {
        ok: false,
        message: L(
          "Du har ikke tilgang til å bruke AI i dette prosjektet.",
          "You do not have access to use AI in this project.",
        ),
      };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnyClient;
    const schema = await checkSchema(admin);
    if (schema.kind === "missing" || schema.version < 38)
      return {
        ok: false,
        message: L(
          "Databasen er ikke oppdatert for tekst-AI (migrasjon 0038).",
          "The database is not updated for text AI (migration 0038).",
        ),
      };
    const { data: proj } = await admin
      .from("projects")
      .select("id, deleted_at, ai_month_limit")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj || (proj as { deleted_at?: string | null }).deleted_at)
      return { ok: false, message: L("Prosjektet er slettet.", "The project has been deleted.") };
    if ((proj as { ai_month_limit?: number | null }).ai_month_limit === 0)
      return {
        ok: false,
        message: L(
          "AI er slått av for prosjektet (budsjettet er 0). Eieren kan endre det på prosjektoversikten.",
          "AI is turned off for the project (the budget is 0). The owner can change this on the project overview.",
        ),
      };

    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const overHourly = async (extra: number): Promise<string | null> => {
      const { count } = await admin
        .from("generation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("created_by", context.userId)
        .eq("kind", "text")
        .gte("created_at", hourAgo);
      return (count ?? 0) - extra >= MAX_TEXT_JOBS_PER_USER_PER_HOUR
        ? L(
            `Grensen på ${MAX_TEXT_JOBS_PER_USER_PER_HOUR} tekstkall til AI i timen er nådd. Prøv igjen senere.`,
            `The limit of ${MAX_TEXT_JOBS_PER_USER_PER_HOUR} text AI calls per hour has been reached. Try again later.`,
          )
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
          message: L(
            "Ingen tekst-AI er tilgjengelig: ingen gyldig nøkkel, og Lovable AI er ikke slått på (LOVABLE_API_KEY mangler).",
            "No text AI is available: no valid key, and Lovable AI is not turned on (LOVABLE_API_KEY is missing).",
          ),
        };
    }

    const jobId = newId<"generation_job">();
    const baseParams = {
      task: data.task,
      provider: choice.provider,
      model: choice.model,
      reason,
      keyOwner,
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
        message: L(
          `Kallet kunne ikke logges: ${logErr.message}`,
          `The call could not be logged: ${logErr.message}`,
        ),
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
        ({ text, model, usage } = r);
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
            error: r.message.slice(0, 2000),
          });
          return { ok: false, message: r.message };
        }
        ({ text, model, usage } = r);
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
      const { scrubSecret } = await import("./providers.server");
      const raw = (e as Error).message || L("Ukjent feil", "Unknown error");
      const message = scrubSecret(raw, secret);
      // Avvist kall: ingen kostnad hos leverandøren
      await finish({ status: "failed", cost_usd: 0, error: message.slice(0, 2000) });
      return {
        ok: false,
        message:
          (e as Error).name === "TimeoutError"
            ? L(
                "AI-tjenesten brukte for lang tid. Prøv igjen.",
                "The AI service took too long. Try again.",
              )
            : L(`Teksten ble ikke skrevet: ${message}`, `The text was not written: ${message}`),
      };
    }
  });
