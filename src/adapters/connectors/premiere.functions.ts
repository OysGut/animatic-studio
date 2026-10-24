/**
 * C-3 Premiere Pro: forslagene fra Premiere-panelet (ett per panel, typen «edit»), lest med brukerens egen
 * tilgang (RLS). Valget lagres med connector_resolve_panel_candidate (samme som C-5).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnyClient } from "@/adapters/storage/project-rows";
import type { PremiereEdit } from "@/core/connectors";
import { t } from "@/core/i18n/keyed";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PremiereProposalView { id: string; returnId: string; panelId: string; edit: PremiereEdit; conflict: boolean; revision: number; createdAt: string }

export const premiereProposalsFor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => { if (!d || typeof d.projectId !== "string" || !UUID.test(d.projectId)) throw new Error(t("c3.error")); return d; })
  .handler(async ({ data, context }): Promise<PremiereProposalView[]> => {
    const user = context.supabase as unknown as AnyClient;
    const r = await user.from("connector_panel_candidates").select("id,return_id,panel_id,incoming,conflict,revision,created_at")
      .eq("project_id", data.projectId).eq("status", "open").eq("kind", "edit").order("created_at").limit(2000);
    if (r.error) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON fra databasen
    return ((r.data as Record<string, any>[]) ?? []).map(x => ({ id: x["id"], returnId: x["return_id"], panelId: x["panel_id"], edit: x["incoming"] as PremiereEdit, conflict: !!x["conflict"], revision: x["revision"], createdAt: x["created_at"] }));
  });
