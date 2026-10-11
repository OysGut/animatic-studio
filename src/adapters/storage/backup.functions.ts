/**
 * Gjenoppretting fra sikkerhetskopi (DEC-0049, REQ-0411/0412). Klienten har allerede laget et nytt, tomt
 * prosjekt (create_project) og lastet opp mediefilene til det; her skrives prosjektdataene inn atomisk via
 * public.apply_changes (samme vei som alle andre endringer), deretter manusversjonene og de importerte
 * manusfilene. Bare eieren av det nye prosjektet kan gjøre dette, og bare når prosjektet er tomt.
 *
 * Nye ID-er lages deterministisk av sikkerhetskopien og det nye prosjektet, så et nytt forsøk etter en feil
 * fortsetter uten å lage noe dobbelt.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BACKUP_MAX_JSON_BYTES,
  backupDataKey,
  backupIdMap,
  diffStates,
  isUuid,
  newId,
  parseBackup,
  restoredExtras,
  restoredState,
  type ProjectState,
} from "@/core";
import { checkSchema, loadProjectState, type AnyClient } from "./project-rows";

export interface RestoreBackupInput {
  readonly projectId: string;
  readonly backup: unknown;
}

export type RestoreBackupResult =
  | {
      readonly ok: true;
      /** Prosjektdataene var allerede gjenopprettet (nytt forsøk). */
      readonly resumed: boolean;
      readonly versions: number;
      readonly documents: number;
    }
  | { readonly ok: false; readonly message: string };

function validate(d: unknown): RestoreBackupInput {
  if (!d || typeof d !== "object") throw new Error("Ugyldig forespørsel");
  const x = d as Record<string, unknown>;
  if (typeof x["projectId"] !== "string" || !isUuid(x["projectId"]))
    throw new Error("Ugyldig prosjekt");
  if (!x["backup"] || typeof x["backup"] !== "object") throw new Error("Mangler sikkerhetskopi");
  if (JSON.stringify(x["backup"]).length > BACKUP_MAX_JSON_BYTES)
    throw new Error("Sikkerhetskopien er for stor til å gjenopprettes her");
  return { projectId: x["projectId"], backup: x["backup"] };
}

/** Er prosjektet tomt (bare hovedfilmen som create_project lager)? */
function isEmpty(s: ProjectState): boolean {
  return (
    Object.keys(s.productions).length === 1 &&
    Object.keys(s.scenes).length === 0 &&
    Object.keys(s.blocks).length === 0 &&
    Object.keys(s.occurrences).length === 0 &&
    Object.keys(s.takes).length === 0 &&
    Object.keys(s.assets).length === 0 &&
    Object.keys(s.compositions).length === 0 &&
    Object.keys(s.audioClips).length === 0
  );
}

export const restoreBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validate)
  .handler(async ({ data, context }): Promise<RestoreBackupResult> => {
    const userDb = context.supabase as unknown as AnyClient;
    const { data: member } = await userDb
      .from("project_members")
      .select("role")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .is("removed_at", null)
      .maybeSingle();
    if ((member as { role?: string } | null)?.role !== "owner")
      return { ok: false, message: "Bare eieren av det nye prosjektet kan gjenopprette til det." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnyClient;
    const schema = await checkSchema(admin);
    if (schema.kind === "missing" || schema.version < 12)
      return {
        ok: false,
        message:
          "Databasen er ikke oppdatert. Lim inn meldingen i LOVABLE_SYNC.md i Lovable før du gjenoppretter.",
      };

    let backup;
    try {
      backup = parseBackup(data.backup, schema.version);
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
    const { data: project } = await admin
      .from("projects")
      .select("deleted_at")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project || (project as { deleted_at: string | null }).deleted_at)
      return { ok: false, message: "Prosjektet finnes ikke." };

    const base = await loadProjectState(admin, data.projectId);
    const main = Object.values(base.productions).find((p) => p.kind === "main");
    if (!main) return { ok: false, message: "Det nye prosjektet mangler hovedfilm." };
    const map = await backupIdMap(backup, data.projectId, main.id);

    // Fingeravtrykk av sikkerhetskopien: et nytt forsøk må gjelde nøyaktig samme sikkerhetskopi
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(backupDataKey(backup))),
    );
    const backupHash = [...digest].map((x) => x.toString(16).padStart(2, "0")).join("");
    // Var prosjektdataene allerede lagret (nytt forsøk etter feil i neste steg)?
    const { data: done } = await admin
      .from("change_log")
      .select("command")
      .eq("project_id", data.projectId)
      .eq("command_type", "RestoreBackup")
      .limit(1);
    const previous = ((done ?? []) as { command: { backupHash?: string } }[])[0];
    const resumed = previous !== undefined;
    if (previous && previous.command?.backupHash !== backupHash)
      return {
        ok: false,
        message: "Prosjektet er allerede gjenopprettet fra en annen sikkerhetskopi.",
      };

    if (!resumed) {
      if (!isEmpty(base))
        return {
          ok: false,
          message:
            "Prosjektet er ikke tomt. Gjenoppretting lager alltid et nytt prosjekt, og ingenting overskrives.",
        };
      let target: ProjectState;
      try {
        target = restoredState(backup, map, base, context.userId);
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
      const changes = diffStates(base, target);
      const command = {
        type: "RestoreBackup",
        sourceProjectName: String(backup.project["name"] ?? ""),
        backupCreatedAt: backup.createdAt,
        formatVersion: backup.formatVersion,
        backupHash,
      };
      const { error } = await admin.rpc("apply_changes", {
        p_project: data.projectId,
        p_actor: context.userId,
        p_command_id: newId<"command">(),
        p_command: command,
        p_inverse: null,
        p_changes: changes,
      });
      if (error) {
        console.error("[restore apply_changes]", error.code, error.message);
        return {
          ok: false,
          message:
            error.code === "42501"
              ? "Du har ikke skriverett i det nye prosjektet."
              : `Prosjektdataene kunne ikke lagres (${error.message}).`,
        };
      }
    }

    const extras = restoredExtras(backup, map, context.userId);
    if (extras.scriptVersions.length > 0) {
      const { error } = await admin
        .from("script_versions")
        .upsert(extras.scriptVersions, { onConflict: "id", ignoreDuplicates: true });
      if (error) {
        console.error("[restore script_versions]", error.code, error.message);
        return {
          ok: false,
          message: `Prosjektet er gjenopprettet, men manusversjonene kunne ikke lagres (${error.message}). Prøv igjen.`,
        };
      }
    }
    if (extras.importedDocuments.length > 0) {
      const { error } = await admin
        .from("imported_documents")
        .upsert(extras.importedDocuments, { onConflict: "id", ignoreDuplicates: true });
      if (error) {
        console.error("[restore imported_documents]", error.code, error.message);
        return {
          ok: false,
          message: `Prosjektet er gjenopprettet, men listen over importerte manusfiler kunne ikke lagres (${error.message}). Prøv igjen.`,
        };
      }
    }
    return {
      ok: true,
      resumed,
      versions: extras.scriptVersions.length,
      documents: extras.importedDocuments.length,
    };
  });
