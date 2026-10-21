/**
 * B-105a: tekst-AI med prompt bygget på serveren. Klienten sender oppgavetype og parametere, aldri
 * ferdig systemtekst. Prosjektet leses med brukerens egen tilgang (RLS, som før), og selve kallet går
 * gjennom det samme inngangspunktet (runTextGeneration) med rolle-, kvote- og kvitteringskontroll.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isTextTask, type TextTask } from "@/core";
import { t as tk } from "@/core/i18n/keyed";
import type { GenerateTextResult } from "./text.functions";

const messages = z
  .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(20_000) }))
  .max(60);

const base = z.object({
  projectId: z.string().uuid(),
  task: z.string().refine((v) => isTextTask(v)),
  /** Valgfri samtale (rollespill/intervju). Når prompten har egen brukerdel, brukes den i stedet. */
  messages: messages.optional(),
  maxTokens: z.number().int().min(1).max(16_000),
  json: z.boolean().optional(),
  request: z.unknown(),
});

async function prepare(input: unknown, context: { supabase: unknown }) {
  const parsed = base.safeParse(input);
  if (!parsed.success)
    throw new Error(tk("adapters-ai-text-functions.validate-text-input.message.577d6e170c71"));
  const { storyPromptRequest, buildStoryPrompt } = await import("./story-prompts.server");
  const req = storyPromptRequest.safeParse(parsed.data.request);
  if (!req.success)
    throw new Error(tk("adapters-ai-text-functions.validate-text-input.message.577d6e170c71"));
  const { loadProjectState } = await import("@/adapters/storage/project-rows");
  // Brukerens egen klient: RLS avgjør om prosjektet kan leses (samme tilgang som før).
  const state = await loadProjectState(context.supabase as never, parsed.data.projectId);
  const built = buildStoryPrompt(state, req.data);
  const msgs = built.user
    ? [{ role: "user" as const, content: built.user }]
    : (parsed.data.messages ?? []);
  return { d: parsed.data, built, msgs };
}

export const generateStoryText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => d as Record<string, unknown>)
  .handler(async ({ data, context }): Promise<GenerateTextResult> => {
    let prepared;
    try {
      prepared = await prepare(data, context);
    } catch {
      return { ok: false, message: tk("adapters-ai-text-functions.validate-text-input.message.577d6e170c71") };
    }
    const { d, built, msgs } = prepared;
    const { validateTextInput } = await import("./text.functions");
    let input;
    try {
      input = validateTextInput({
      projectId: d.projectId,
      task: d.task as TextTask,
      system: built.system,
      messages: msgs,
      maxTokens: d.maxTokens,
      ...(d.json ? { json: true } : {}),
      });
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
    const { runTextGeneration } = await import("./text-run.server");
    return runTextGeneration(context, input);
  });

/** Antall tegn i den serverbygde prompten (for kostnadsanslaget; samtalen legges til i klienten). Ingen AI-kall, ingen tekst tilbake. */
export const estimateStoryPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => d as Record<string, unknown>)
  .handler(async ({ data, context }): Promise<{ ok: true; chars: number } | { ok: false }> => {
    try {
      const { built } = await prepare(data, context);
      return { ok: true, chars: built.system.length + (built.user?.length ?? 0) };
    } catch {
      return { ok: false };
    }
  });
