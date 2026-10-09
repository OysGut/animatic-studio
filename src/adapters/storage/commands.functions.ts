/**
 * Serverfunksjon som kjører domenekjernen autoritativt (DEC-0022):
 * innlogget bruker → medlemskap og rolle sjekkes → prosjektet lastes → kommandoen valideres i src/core →
 * endringssettet lagres atomisk med revisjonskontroll via public.apply_changes (bare service_role).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  applyCommand,
  diffStates,
  isEmptyChangeSet,
  isUuid,
  newId,
  revisionsOf,
  type Command,
} from "@/core";
import { checkSchema, loadProjectState, type AnyClient } from "./project-rows";

export interface RunCommandInput {
  readonly projectId: string;
  readonly command: Command;
  readonly baseRevisions?: Record<string, number>;
  /** Valgfri kommando-ID fra klienten (UUID). Gjør nye forsøk etter nettverksbrudd idempotente. */
  readonly commandId?: string;
}

export type RunCommandResult =
  | {
      readonly ok: true;
      readonly changeId: string;
      readonly affected: readonly string[];
      /** Kommandoen som angrer denne (null ved nytt forsøk eller ingen endring). */
      readonly inverse: Command | null;
      /** Revisjon per berørt entitet etter endringen – brukes som baseRevisions ved angre (ingen andres endringer overskrives). */
      readonly revisions: Readonly<Record<string, number>>;
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly details?: readonly string[];
    };

const ROLE_RANK: Record<string, number> = { owner: 4, editor: 3, commenter: 2, viewer: 1 };

/** Største kommando som tas imot (et helt manus på ~100 sider er ~0,5 MB). */
const MAX_COMMAND_CHARS = 6_000_000;

/**
 * Kommandoer som bare finnes som invers (angre). De godtas bare når de er identiske med inversen til en
 * endring som samme bruker selv har gjort i prosjektet – ellers kunne de brukes til å slette eller flytte
 * vilkårlig innhold.
 */
const INVERSE_ONLY = new Set<string>([
  "UndoCreateProduction",
  "UndoCreateScene",
  "UndoInsertBlock",
  "UndoForkVariant",
  "UndoAddOccurrence",
  "UndoCreateSegments",
  "UndoImportScreenplay",
  "UndoSplitScene",
  "UnmergeScenes",
  "UndoCreateAssets",
  "UndoCreateAssetVariant",
  "UndoAddAssetVersion",
  "UndoAddAnnotations",
]);

/** Kommandoer som skriver til tabellene fra migrasjon 0004 (ressursbibliotek og notater). */
const LIBRARY_COMMANDS = new Set<string>([
  "CreateAssets",
  "UndoCreateAssets",
  "UpdateAsset",
  "SetAssetArchived",
  "CreateAssetVariant",
  "UndoCreateAssetVariant",
  "UpdateAssetVariant",
  "SetAssetVariantArchived",
  "AddAssetVersion",
  "UndoAddAssetVersion",
  "ApproveAssetVersion",
  "AddAnnotations",
  "EditAnnotation",
  "SetAnnotationRemoved",
]);

/** JSON med sorterte nøkler, for sammenligning med jsonb fra databasen. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

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
  if (JSON.stringify(cmd).length > MAX_COMMAND_CHARS) throw new Error("Endringen er for stor");
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
      if (done)
        return { ok: true, changeId: data.commandId, affected: [], inverse: null, revisions: {} }; // allerede utført (nytt forsøk)
    }
    if (INVERSE_ONLY.has(data.command.type)) {
      const { data: rows } = await admin
        .from("change_log")
        .select("inverse")
        .eq("project_id", data.projectId)
        .eq("actor", context.userId)
        .eq("inverse->>type", data.command.type)
        .order("created_at", { ascending: false })
        .limit(25);
      const wanted = canonicalJson(data.command);
      const match = ((rows ?? []) as { inverse: unknown }[]).some(
        (r) => canonicalJson(r.inverse) === wanted,
      );
      if (!match) {
        return {
          ok: false,
          code: "forbidden",
          message: "Bare dine egne siste endringer kan angres på denne måten.",
        };
      }
    }
    // En bildeversjon som noen gang har vært godkjent, er tatt i bruk og kan ikke angres bort (REQ-0136)
    if (data.command.type === "UndoAddAssetVersion") {
      const { data: approvals } = await admin
        .from("change_log")
        .select("id")
        .eq("project_id", data.projectId)
        .eq("command_type", "ApproveAssetVersion")
        .eq("command->>versionId", data.command.versionId)
        .limit(1);
      if ((approvals ?? []).length > 0)
        return {
          ok: false,
          code: "referenced",
          message: "Bildet har vært godkjent og kan ikke fjernes.",
        };
    }
    // Stempelet på nye notater settes av serveren (navnet i profilen og tidspunktet nå), så ingen kan
    // skrive notater i andres navn. Bare notater fra en importert fil beholder filens navn og tid (DEC-0031).
    if (data.command.type === "AddAnnotations" && !data.command.imported) {
      const { data: profile } = await admin
        .from("profiles")
        .select("display_name")
        .eq("user_id", context.userId)
        .maybeSingle();
      const name = (profile as { display_name?: string } | null)?.display_name?.trim();
      data = {
        ...data,
        command: {
          ...data.command,
          annotations: data.command.annotations.map((a) => {
            const { stampAt: _s, ...rest } = a;
            return { ...rest, authorName: name || a.authorName };
          }),
        },
      };
    }
    // «Endret av …» på notater: navnet hentes fra profilen, ikke fra klienten (DEC-0032)
    if (
      data.command.type === "EditAnnotation" &&
      typeof data.command.editedByName === "string" &&
      data.command.editedAt === undefined
    ) {
      const { data: profile } = await admin
        .from("profiles")
        .select("display_name")
        .eq("user_id", context.userId)
        .maybeSingle();
      const name = (profile as { display_name?: string } | null)?.display_name?.trim();
      if (name) data = { ...data, command: { ...data.command, editedByName: name } };
    }
    // Ressursbiblioteket krever migrasjon 0004 (ellers ville endringen bare blitt logget, ikke lagret)
    if (LIBRARY_COMMANDS.has(data.command.type)) {
      const schema = await checkSchema(admin);
      if (schema.kind !== "ok" || schema.version < 4)
        return {
          ok: false,
          code: "schema",
          message:
            "Databasen mangler ressursbiblioteket og notatene. Kjør migrasjon 0004 i Lovable (se LOVABLE_SYNC.md).",
        };
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
    if (isEmptyChangeSet(changes))
      return { ok: true, changeId: id, affected: [], inverse: null, revisions: {} };

    const { error } = await admin.rpc("apply_changes", {
      p_project: data.projectId,
      p_actor: context.userId,
      p_command_id: id,
      p_command: data.command,
      p_inverse: result.inverse,
      p_changes: changes,
    });
    if (error) {
      if (error.code === "23505") {
        // Enten et nytt forsøk av en kommando som allerede er lagret (idempotent), eller to samtidige
        // endringer som ville gitt samme plass i rekkefølgen.
        if (data.commandId) {
          const { data: done } = await admin
            .from("change_log")
            .select("id")
            .eq("id", data.commandId)
            .maybeSingle();
          if (done) return { ok: true, changeId: id, affected: [], inverse: null, revisions: {} };
        }
        return {
          ok: false,
          code: "revision_conflict",
          message: "Noen andre endret det samme samtidig. Hent siste versjon og prøv igjen.",
        };
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
    return {
      ok: true,
      changeId: id,
      affected: result.affected,
      inverse: result.inverse,
      revisions: revisionsOf(result.state, result.affected),
    };
  });
