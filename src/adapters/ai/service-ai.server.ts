/**
 * Den innebygde AI-en på tjenestens regning (OG2, B-047/B-048). BARE PÅ SERVEREN.
 *
 * Eneste unntak fra «ett inngangspunkt» (generateText): prompten bygges alltid på serveren fra fast
 * mal og manusdata, så veien kan ikke brukes som åpen AI-proxy. Bruker aldri brukerens eller eierens
 * nøkler. Tak: 20 kjøringer per prosjekt per døgn (alle oppgavene samlet) og en lås på 60 sekunder per
 * oppgave. Loggen i generation_jobs har oppgave, modell og kostnad – aldri prompt eller svar.
 */
import { L, newId } from "@/core";
import { dailyQuotaError, lockActive } from "@/core/library/analysis-hash";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { lovableText } from "./text.functions";
import { TEXT_MODELS } from "./write-prompt.functions";

export type ServiceTask = "entity_analysis" | "translation_align";
const SERVICE_TASKS: readonly ServiceTask[] = ["entity_analysis", "translation_align"];

export type ServiceAiResult =
  | { readonly ok: true; readonly text: string; readonly model: string; readonly jobId: string }
  | { readonly ok: false; readonly message: string; readonly retryable: boolean };

export async function runServiceAi(input: {
  readonly admin: AnyClient;
  readonly projectId: string;
  readonly userId: string;
  readonly task: ServiceTask;
  readonly system: string;
  readonly user: string;
  readonly maxTokens: number;
}): Promise<ServiceAiResult> {
  const { admin, projectId, userId, task } = input;
  const key = process.env["LOVABLE_API_KEY"];
  if (!key)
    return {
      ok: false,
      retryable: false,
      message: L(
        "Den innebygde AI-en er ikke tilgjengelig nå. Forslagene bygger på manusreglene.",
        "The built-in AI is not available right now. The suggestions are based on script rules.",
      ),
    };
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { data: recent } = await admin
    .from("generation_jobs")
    .select("id, created_at, params")
    .eq("project_id", projectId)
    .eq("kind", "text")
    .eq("params->>keyOwner", "lovable")
    .in("params->>task", SERVICE_TASKS)
    .gte("created_at", dayAgo)
    .order("created_at", { ascending: false })
    .limit(500);
  const ours = ((recent ?? []) as { created_at: string; params: { task?: string } | null }[]).filter(
    (r) => SERVICE_TASKS.includes(r.params?.task as ServiceTask),
  );
  const quota = dailyQuotaError(ours.length);
  if (quota) return { ok: false, retryable: false, message: quota };
  const lastSame = ours.find((r) => r.params?.task === task);
  if (lockActive(lastSame ? Date.parse(lastSame.created_at) : null, Date.now()))
    return {
      ok: false,
      retryable: true,
      message: L("Analysen kjører allerede.", "The analysis is already running."),
    };

  const override = process.env["ANIMATIC_TEXT_MODEL"];
  const models: readonly string[] = override ? [override] : TEXT_MODELS;
  const jobId = newId<"generation_job">();
  const params = { task, provider: "lovable", keyOwner: "lovable", service: true };
  const { error: logErr } = await admin.from("generation_jobs").insert({
    id: jobId,
    project_id: projectId,
    kind: "text",
    provider: "lovable",
    model: models[0]!.slice(0, 100),
    prompt: `[${task}]`,
    status: "running",
    created_by: userId,
    estimated_cost: 0,
    cost_usd: 0,
    provider_key_id: null,
    key_owner: null,
    params,
    started_at: new Date().toISOString(),
  } as never);
  if (logErr)
    return {
      ok: false,
      retryable: false,
      message: L("Analysen kunne ikke logges.", "The analysis could not be logged."),
    };
  const finish = (patch: Record<string, unknown>) =>
    admin
      .from("generation_jobs")
      .update({ ...patch, finished_at: new Date().toISOString() } as never)
      .eq("id", jobId);
  try {
    const r = await lovableText(key, models, {
      projectId,
      task: "general",
      system: input.system,
      messages: [{ role: "user", content: input.user }],
      maxTokens: input.maxTokens,
      json: true,
    });
    if (!r.ok) {
      await finish({ status: "failed", cost_usd: 0, error: r.message.slice(0, 2000) });
      return { ok: false, retryable: false, message: r.message };
    }
    await finish({
      status: "done",
      model: r.model.slice(0, 100),
      params: { ...params, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens },
    });
    return { ok: true, text: r.text, model: r.model, jobId };
  } catch (e) {
    await finish({ status: "failed", cost_usd: 0, error: String((e as Error).name).slice(0, 200) });
    return {
      ok: false,
      retryable: false,
      message: L("Den innebygde AI-en svarte ikke.", "The built-in AI did not respond."),
    };
  }
}
