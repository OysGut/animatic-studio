/**
 * AI-kobling av oversatt manus (OG2, B-048) med den innebygde AI-en. Kjøres automatisk etter den
 * regelbaserte koblingen (DEC-0058), bare for usikre eller manglende scener. Importert tekst kommer fra
 * nettleseren (filen lagres ikke), begrenset til korte utdrag og en fast prompt; de norske utdragene leser
 * serveren selv. Svaret er bare forslag som brukeren godkjenner. Det norske manuset endres aldri.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { L, blocksOfVariant, isUuid } from "@/core";
import {
  ALIGN_EXCERPT_CHARS,
  alignItemsError,
  alignmentFromJson,
  alignmentPrompt,
  type AiSceneLink,
  type AlignCandidate,
  type AlignRequestItem,
} from "@/core/translation/align-prompt";
import type { AnyClient } from "@/adapters/storage/project-rows";

export interface AlignInput {
  readonly projectId: string;
  readonly language: string;
  readonly items: readonly AlignRequestItem[];
}

export type AlignResult =
  | { readonly ok: true; readonly links: readonly AiSceneLink[] }
  | { readonly ok: false; readonly message: string };

export function validateAlignInput(d: unknown): AlignInput {
  const x = (d ?? {}) as Record<string, unknown>;
  if (typeof x["projectId"] !== "string" || !isUuid(x["projectId"]))
    throw new Error(L("Ugyldig prosjekt", "Invalid project"));
  if (typeof x["language"] !== "string" || !/^[a-z]{2,3}(-[A-Za-z]{2})?$/u.test(x["language"]))
    throw new Error(L("Ugyldig språk", "Invalid language"));
  if (alignItemsError(x["items"])) throw new Error(L("Ugyldig forespørsel", "Invalid request"));
  const items = (x["items"] as AlignRequestItem[]).map((it) => ({
    index: it.index,
    heading: it.heading.slice(0, 120),
    lines: it.lines.map((l) => l.slice(0, ALIGN_EXCERPT_CHARS)),
    candidateOccurrenceIds: it.candidateOccurrenceIds.filter((id) => isUuid(id)),
  }));
  return { projectId: x["projectId"], language: x["language"], items };
}

export const alignTranslationWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateAlignInput)
  .handler(async ({ data, context }): Promise<AlignResult> => {
    const { memberRole, ROLE_RANK } = await import("./ai-gate.server");
    const role = await memberRole(context.supabase as unknown as AnyClient, data.projectId, context.userId);
    if ((ROLE_RANK[role ?? ""] ?? 0) < ROLE_RANK["editor"]!)
      return { ok: false, message: L("Du har ikke tilgang til dette prosjektet.", "You do not have access to this project.") };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnyClient;
    const { loadProjectState } = await import("@/adapters/storage/project-rows");
    const state = await loadProjectState(admin, data.projectId);
    const ids = [...new Set(data.items.flatMap((i) => i.candidateOccurrenceIds))];
    const candidates: AlignCandidate[] = [];
    for (const id of ids) {
      const o = state.occurrences[id as never];
      if (!o) continue; // ukjent eller annet prosjekt
      const v = state.variants[o.variantId];
      const h = v?.heading;
      candidates.push({
        occurrenceId: id,
        number: o.productionNumber ?? "",
        heading: h ? `${h.intExt} ${h.location} ${h.time}` : "",
        excerpt: blocksOfVariant(state, o.variantId).map((b) => b.text).join(" / ").slice(0, ALIGN_EXCERPT_CHARS),
      });
    }
    const known = new Set(candidates.map((c) => c.occurrenceId));
    const items = data.items.map((i) => ({ ...i, candidateOccurrenceIds: i.candidateOccurrenceIds.filter((c) => known.has(c)) }));
    const prompt = alignmentPrompt({ items, candidates, language: data.language });
    const { runServiceAi } = await import("./service-ai.server");
    const r = await runServiceAi({
      admin,
      projectId: data.projectId,
      userId: context.userId,
      task: "translation_align",
      system: prompt.system,
      user: prompt.user,
      maxTokens: 4000,
    });
    if (!r.ok) return { ok: false, message: r.message };
    return { ok: true, links: alignmentFromJson(r.text, items) };
  });
