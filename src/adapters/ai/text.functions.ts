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
import { isTextModelId, isTextProviderId, isTextTask, isUuid, type TextChoiceReason, type TextProviderId, type TextTask } from "@/core";
import { GATEWAY, gatewayError, isUnknownModelError } from "./gateway";
import { t as tk } from "@/core/i18n/keyed";

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
  if (!d || typeof d !== "object") throw new Error(tk("adapters-ai-text-functions.validate-text-input.message.577d6e170c71"));
  const x = d as Record<string, unknown>;
  const projectId = x["projectId"];
  if (typeof projectId !== "string" || !isUuid(projectId))
    throw new Error(tk("adapters-ai-text-functions.validate-text-input.message.d506465a80be"));
  if (!isTextTask(x["task"])) throw new Error(tk("adapters-ai-text-functions.validate-text-input.message.8eb263086a8a"));
  const system = x["system"];
  if (system !== undefined && (typeof system !== "string" || system.length > MAX_TEXT_SYSTEM_CHARS))
    throw new Error(tk("adapters-ai-text-functions.validate-text-input.message.cb34fce9daa3"));
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
    throw new Error(tk("adapters-ai-text-functions.validate-text-input.message.95ad372996f0"));
  const msgs = messages as { role: "user" | "assistant"; content: string }[];
  if (msgs[msgs.length - 1]!.role !== "user")
    throw new Error(
      tk("adapters-ai-text-functions.validate-text-input.message.d48999213d4d"),
    );
  const total =
    (typeof system === "string" ? system.length : 0) +
    msgs.reduce((t, m) => t + m.content.length, 0);
  if (total > MAX_TEXT_TOTAL_CHARS)
    throw new Error(tk("adapters-ai-text-functions.validate-text-input.message.055a893298fc"));
  const maxTokens = x["maxTokens"] ?? DEFAULT_TEXT_OUTPUT_TOKENS;
  if (
    typeof maxTokens !== "number" ||
    !Number.isInteger(maxTokens) ||
    maxTokens < 1 ||
    maxTokens > MAX_TEXT_OUTPUT_TOKENS
  )
    throw new Error(tk("adapters-ai-text-functions.validate-text-input.message.96b80a51de73"));
  const temperature = x["temperature"];
  if (
    temperature !== undefined &&
    (typeof temperature !== "number" ||
      !Number.isFinite(temperature) ||
      temperature < 0 ||
      temperature > 2)
  )
    throw new Error(tk("adapters-ai-text-functions.validate-text-input.message.48f68893ad98"));
  const provider = x["provider"];
  if (provider !== undefined && provider !== "lovable" && !isTextProviderId(provider))
    throw new Error(tk("adapters-ai-text-functions.validate-text-input.message.c2bc2fc1ba58"));
  const model = x["model"];
  if (model !== undefined && !isTextModelId(model))
    throw new Error(tk("adapters-ai-text-functions.validate-text-input.message.4f7ad352eff5"));
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
        message: tk("adapters-ai-text-functions.message.message.43163e181625"),
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
    message: tk("r6-brand.text-model"),
    model: last,
  };
}

export const generateText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateTextInput)
  .handler(async ({ data, context }): Promise<GenerateTextResult> => {
    const { runTextGeneration } = await import("./text-run.server");
    return runTextGeneration(context, data);
  });
