/**
 * C-5 Storyboard Pro: kandidater fra returer (lest med brukerens egen tilgang, RLS) og brukerens valg.
 * «Bruk innkommende» kjører appen som vanlige, angrebare kommandoer før valget lagres her.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { t } from "@/core/i18n/keyed";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const fail = () => new Error(t("c5.error"));

export interface SbproCandidateView {
  id: string; returnId: string; panelId: string | null; kind: "text" | "timing" | "image" | "new_panel" | "conform";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON fra databasen
  incoming: Record<string, any>; conflict: boolean; revision: number; createdAt: string; mediaPath: string | null; mediaSha256: string | null; mediaBytes: number | null;
}

export const sbproCandidatesFor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => { if (!d || !isUuid(d.projectId)) throw fail(); return d; })
  .handler(async ({ data, context }): Promise<SbproCandidateView[]> => {
    const user = context.supabase as unknown as AnyClient;
    const r = await user.from("connector_panel_candidates").select("id,return_id,panel_id,kind,incoming,conflict,revision,created_at,media_path,media_sha256,media_bytes")
      .eq("project_id", data.projectId).eq("status", "open").neq("kind", "edit").order("created_at").limit(500);
    if (r.error) return [];
    return ((r.data as Record<string, any>[]) ?? []).map(x => ({
      id: x["id"], returnId: x["return_id"], panelId: x["panel_id"], kind: x["kind"], incoming: x["incoming"] ?? {}, conflict: !!x["conflict"],
      revision: x["revision"], createdAt: x["created_at"], mediaPath: x["media_path"], mediaSha256: x["media_sha256"], mediaBytes: x["media_bytes"] === null ? null : Number(x["media_bytes"]),
    }));
  });

export const resolveSbproCandidate = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; choice: string; revision: number }) => {
    if (!d || !isUuid(d.id) || !["keep_both", "choose_current", "choose_incoming", "reject"].includes(d.choice) || !Number.isInteger(d.revision)) throw fail();
    return d;
  })
  .handler(async ({ data, context }) => {
    const user = context.supabase as unknown as AnyClient;
    const r = await user.rpc("connector_resolve_panel_candidate", { p_id: data.id, p_choice: data.choice, p_revision: data.revision });
    if (r.error || r.data !== "ok") throw fail();
    return true;
  });
