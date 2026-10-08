/**
 * Serverfunksjon som kjører domenekjernen autoritativt (DEC-0022):
 * innlogget bruker → medlemskap og rolle sjekkes → prosjektet lastes → kommandoen valideres i src/core →
 * endringssettet lagres atomisk med revisjonskontroll via public.apply_changes (bare service_role).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyCommand, diffStates, isEmptyChangeSet, isUuid, newId, type Command } from "@/core";
import { loadProjectState, type AnyClient } from "./project-rows";

export interface RunCommandInput {
  readonly projectId: string;
  readonly command: Command;
  readonly baseRevisions?: Record<string, number>;
  /** Valgfri kommando-ID fra klienten (UUID). Gjør nye forsøk etter nettverksbrudd idempotente. */
  readonly commandId?: string;
}

export type RunCommandResult =
  | { readonly ok: true; readonly changeId: string; readonly affected: readonly string[] }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly details?: readonly string[];
    };

const ROLE_RANK: Record<string, number> = { owner: 4, editor: 3, commenter: 2, viewer: 1 };

function validateInput(d: unknown): RunCommandInput {
  if (!d || typeof d !== "object") throw new Error("Ugyldig forespørsel");
  const x = d as Record<string, unknown>;
  if (typeof x["projectId"] !== "string" || !isUuid(x["projectId"]))
    throw new Error("Ugyldig prosjekt-ID");
  const cmd = x["command"] as { type?: unknown } | undefined;
  if (!cmd || typeof cmd.type !== "string") throw new Error("Ugyldig kommando");
  const base = x["baseRevisions"];
  if (base !== undefined && (typeof base !== "object" || base === null))
    throw new Error("Ugyldige revisjoner");
  const cid = x["commandId"];
  if (cid !== undefined && (typeof cid !== "string" || !isUuid(cid)))
    throw new Error("Ugyldig kommando-ID");
  return {
    ...(typeof cid === "string" ? { commandId: cid } : {}),
    projectId: x["projectId"],
    command: x["command"] as Command,
    ...(base ? { baseRevisions: base as Record<string, number> } : {}),
  };
}

export const runCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateInput)
  .handler(async ({ data, context }): Promise<RunCommandResult> => {
    const userDb = context.supabase as unknown as AnyClient;
    const { data: member } = await userDb
      .from("project_members")
      .select("role")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .is("removed_at", null)
      .maybeSingle();
    const rank = ROLE_RANK[(member as { role?: string } | null)?.role ?? ""] ?? 0;
    if (rank < ROLE_RANK["editor"]!) {
      return {
        ok: false,
        code: "forbidden",
        message: "Du har ikke tilgang til å endre dette prosjektet",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnyClient;
    if (data.commandId) {
      const { data: done } = await admin
        .from("change_log")
        .select("id")
        .eq("id", data.commandId)
        .eq("project_id", data.projectId)
        .maybeSingle();
      if (done) return { ok: true, changeId: data.commandId, affected: [] }; // allerede utført (nytt forsøk)
    }
    const state = await loadProjectState(admin, data.projectId);
    const id = (data.commandId ?? newId<"command">()) as ReturnType<typeof newId<"command">>;
    const result = applyCommand(state, {
      id,
      actor: context.userId as never,
      at: new Date().toISOString(),
      command: data.command,
      ...(data.baseRevisions ? { baseRevisions: data.baseRevisions } : {}),
    });
    if (!result.ok) {
      return {
        ok: false,
        code: result.error.code,
        message: result.error.message,
        ...(result.error.details ? { details: result.error.details } : {}),
      };
    }
    const changes = diffStates(state, result.state);
    if (isEmptyChangeSet(changes)) return { ok: true, changeId: id, affected: [] };

    const { error } = await admin.rpc("apply_changes", {
      p_project: data.projectId,
      p_actor: context.userId,
      p_command_id: id,
      p_command: data.command,
      p_inverse: result.inverse,
      p_changes: changes,
    });
    if (error) {
      if (error.code === "23505" && data.commandId) {
        // Samme kommando-ID er allerede lagret: et tidligere forsøk lyktes (idempotent nytt forsøk).
        return { ok: true, changeId: id, affected: [] };
      }
      if (error.code === "P0409") {
        return {
          ok: false,
          code: "revision_conflict",
          message: "Noen andre har endret dette i mellomtiden. Hent siste versjon og prøv igjen.",
        };
      }
      console.error("[apply_changes]", error.code, error.message); // ingen hemmeligheter i feilen
      return {
        ok: false,
        code: "storage_error",
        message: "Endringen kunne ikke lagres. Prøv igjen.",
      };
    }
    return { ok: true, changeId: id, affected: result.affected };
  });
