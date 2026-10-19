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
  L,
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
  if (!d || typeof d !== "object") throw new Error(L("Ugyldig forespørsel", "Invalid request"));
  const x = d as Record<string, unknown>;
  if (typeof x["projectId"] !== "string" || !isUuid(x["projectId"]))
    throw new Error(L("Ugyldig prosjekt", "Invalid project"));
  if (!x["backup"] || typeof x["backup"] !== "object")
    throw new Error(L("Mangler sikkerhetskopi", "The backup is missing"));
  if (JSON.stringify(x["backup"]).length > BACKUP_MAX_JSON_BYTES)
    throw new Error(
      L(
        "Sikkerhetskopien er for stor til å gjenopprettes her",
        "The backup is too large to be restored here",
      ),
    );
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
      return {
        ok: false,
        message: L(
          "Bare eieren av det nye prosjektet kan gjenopprette til det.",
          "Only the owner of the new project can restore to it.",
        ),
      };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnyClient;
    const schema = await checkSchema(admin);
    if (schema.kind === "missing" || schema.version < 12)
      return {
        ok: false,
        message: L(
          "Databasen er ikke oppdatert. Kontakt administratoren for å oppdatere Animatic Studio.",
          "The database is not up to date. Contact the administrator to update Animatic Studio.",
        ),
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
      return { ok: false, message: L("Prosjektet finnes ikke.", "The project does not exist.") };

    const base = await loadProjectState(admin, data.projectId);
    const main = Object.values(base.productions).find((p) => p.kind === "main");
    if (!main)
      return {
        ok: false,
        message: L(
          "Det nye prosjektet mangler hovedfilm.",
          "The new project is missing a main film.",
        ),
      };
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
        message: L(
          "Prosjektet er allerede gjenopprettet fra en annen sikkerhetskopi.",
          "The project has already been restored from a different backup.",
        ),
      };

    if (!resumed) {
      if (!isEmpty(base))
        return {
          ok: false,
          message: L(
            "Prosjektet er ikke tomt. Gjenoppretting lager alltid et nytt prosjekt, og ingenting overskrives.",
            "The project is not empty. Restoring always creates a new project, and nothing is overwritten.",
          ),
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
              ? L(
                  "Du har ikke skriverett i det nye prosjektet.",
                  "You do not have write access to the new project.",
                )
              : L(
                  `Prosjektdataene kunne ikke lagres (${error.message}).`,
                  `The project data could not be saved (${error.message}).`,
                ),
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
          message: L(
            `Prosjektet er gjenopprettet, men manusversjonene kunne ikke lagres (${error.message}). Prøv igjen.`,
            `The project has been restored, but the script versions could not be saved (${error.message}). Try again.`,
          ),
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
          message: L(
            `Prosjektet er gjenopprettet, men listen over importerte manusfiler kunne ikke lagres (${error.message}). Prøv igjen.`,
            `The project has been restored, but the list of imported script files could not be saved (${error.message}). Try again.`,
          ),
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
