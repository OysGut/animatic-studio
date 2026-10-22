/**
 * B-105a: forhåndsvisning av bildeprompten, bygget på serveren. Returnerer beskrivelsen brukeren kan se og
 * redigere (uten avsnittet om vedlagte bilder), negativ beskrivelse, oppsummering og antall vedlegg.
 * Ingen AI-kall. Prosjektet leses med brukerens egen tilgang (RLS).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ImagePromptPreview {
  readonly prompt: string;
  readonly negative: string | null;
  readonly summary: readonly string[] | null;
  /** Tegn avsnittet om vedleggene tar i den endelige prompten (for lengdegrensen i feltet). */
  readonly legendChars: number;
  /** Vedleggene (versjon, rolle og vinkel) – stiene beregnes på serveren ved generering. */
  readonly attached: readonly { readonly versionId: string; readonly role: "identity" | "view" | "style"; readonly view?: string }[];
}

const input = z.object({ projectId: z.string().uuid(), request: z.unknown() });

export const previewImagePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => d as Record<string, unknown>)
  .handler(async ({ data, context }): Promise<{ ok: true; preview: ImagePromptPreview } | { ok: false }> => {
    const parsed = input.safeParse(data);
    if (!parsed.success) return { ok: false };
    const { imagePromptRequest, composeImagePrompt, finalImagePrompt } = await import("./image-prompts.server");
    const req = imagePromptRequest.safeParse(parsed.data.request);
    if (!req.success) return { ok: false };
    try {
      const { loadProjectState } = await import("@/adapters/storage/project-rows");
      const state = await loadProjectState(context.supabase as never, parsed.data.projectId);
      const c = composeImagePrompt(state, req.data);
      if (!c) return { ok: false };
      return {
        ok: true,
        preview: {
          prompt: c.body,
          negative: c.negative,
          summary: c.summary,
          legendChars: c.attached.length ? finalImagePrompt(c, "x").length - 1 : 0,
          attached: c.attached.map((a) => ({ versionId: a.versionId, role: a.role, ...(a.view ? { view: a.view } : {}) })),
        },
      };
    } catch {
      return { ok: false };
    }
  });
