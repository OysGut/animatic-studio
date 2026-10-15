/**
 * Serverfunksjon som kjører domenekjernen autoritativt (DEC-0022):
 * innlogget bruker → medlemskap og rolle sjekkes → prosjektet lastes → kommandoen valideres i src/core →
 * endringssettet lagres atomisk med revisjonskontroll via public.apply_changes (bare service_role).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  L,
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

/**
 * Angring av en ny produksjon som har eksporter eller lagrede estimater (migrasjon 0028): radene er historikk
 * (INV-13) og slettes ikke sammen med produksjonen. Produksjoner kan verken deaktiveres eller slettes i appen,
 * så produksjonen beholdes.
 */
export const UNDO_PRODUCTION_HISTORY = // i18n-ignore: norsk tekst som testene sjekker, vises med L()
  "Produksjonen har eksporter eller lagrede estimater og kan ikke angres. Den beholdes som den er.";
const UNDO_PRODUCTION_HISTORY_EN =
  "The production has exports or saved estimates and cannot be undone. It is kept as it is.";
/** Som over, for manusversjoner og importerte manusfiler (fremmednøkkel uten sletting). */
export const UNDO_PRODUCTION_REFERENCED = // i18n-ignore: norsk tekst som testene sjekker, vises med L()
  "Produksjonen har manusversjoner eller importerte manusfiler og kan ikke angres. Den beholdes som den er.";
const UNDO_PRODUCTION_REFERENCED_EN =
  "The production has script versions or imported script files and cannot be undone. It is kept as it is.";

/**
 * Forståelig melding for en feil fra apply_changes som skyldes data domenekjernen ikke ser (historikk i egne
 * tabeller), eller null når feilen ikke er en slik kjent feil.
 */
export function applyChangesErrorMessage(
  command: Command,
  error: { readonly code?: string | null; readonly message?: string | null },
): { readonly code: string; readonly message: string } | null {
  if (command.type !== "UndoCreateProduction") return null;
  if (error.code === "P0001" && /INV-13/.test(error.message ?? ""))
    return {
      code: "referenced",
      message: L(UNDO_PRODUCTION_HISTORY, UNDO_PRODUCTION_HISTORY_EN),
    };
  if (error.code === "23503")
    return {
      code: "referenced",
      message: L(UNDO_PRODUCTION_REFERENCED, UNDO_PRODUCTION_REFERENCED_EN),
    };
  return null;
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
  "UndoCreateComposition",
  "UndoAddLayers",
  "UndoSetProjectFormat",
  "UndoAddAudioClips",
]);

/** Kommandoer som skriver til tabellene fra migrasjon 0004 (ressursbibliotek og notater). */
const LIBRARY_COMMANDS = new Set<string>([
  "CreateAssets",
  "UndoCreateAssets",
  "UpdateAsset",
  "SetAssetArchived",
  "SetAssetsRemoved",
  "SetAssetVersionsRemoved",
  "SetVersionView",
  "SetAssetVisualBrief",
  "SetSoundLinks",
  "SetContextNames",
  "PlanAssetInScenes",
  "RemoveScenePlans",
  "SetScenePlans",
  "SetAssetVoice",
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

/** Kommandoer som skriver til tabellene fra migrasjon 0007 (2D-sceneeditoren). */
const COMPOSITION_COMMANDS = new Set<string>([
  "CreateComposition",
  "UndoCreateComposition",
  "UpdateComposition",
  "SetCompositionStep",
  "SetCompositionRemoved",
  "AddLayers",
  "UndoAddLayers",
  "UpdateLayers",
  "MoveLayer",
  "SetLayersRemoved",
]);

/** Kommandoer som skriver til tabellen fra migrasjon 0009 (lyd i filmen). */
const AUDIO_COMMANDS = new Set<string>([
  "AddAudioClips",
  "UndoAddAudioClips",
  "UpdateAudioClips",
  "SetAudioClipsRemoved",
]);

/** Lyd over flere scener og volumpunkter krever migrasjon 0010 (ellers ville de gått tapt i stillhet). */
function needsAudioFlowSchema(command: { type: string } & Record<string, unknown>): boolean {
  const clips =
    (command["clips"] as { fields?: { continues?: boolean; volumeKeys?: unknown[] } }[]) ?? [];
  return (
    (command.type === "AddAudioClips" || command.type === "UpdateAudioClips") &&
    clips.some((c) => c.fields?.continues === true || (c.fields?.volumeKeys?.length ?? 0) > 0)
  );
}

/** Lydfiler i biblioteket krever også migrasjon 0009 (ny ressurstype og lydformater). */
/** Deler av klipp, tidskoblinger og status for versjoner krever migrasjon 0012 (DEC-0048). */
const EDIT_COMMANDS = new Set([
  "SetSceneEdit",
  "SetTakeStatus",
  "AddTimeLinks",
  "UpdateTimeLinks",
  "SetTimeLinksRemoved",
]);

/**
 * Nye overgangstyper, overlapp, prosjektets standardovergang, svart-hvitt per scene og hendelser i
 * 2D-scenen krever migrasjon 0013 (DEC-0051).
 */
function needsSchema13(command: { type: string } & Record<string, unknown>): boolean {
  if (command.type === "SetDefaultTransition" || command.type === "SetOccurrenceMonochrome")
    return true;
  if (command.type === "SetTransition") {
    // null («følg standarden») lagres som kutt før 0013, og er da det samme som før
    const t = command["transition"] as { kind?: string; overlap?: boolean } | null;
    if (t === null) return false;
    return !["cut", "dissolve", "dip"].includes(t.kind ?? "") || t.overlap === true;
  }
  // Grupper, bildeskifter, bevegelsesbaner og ankerpunkt (DEC-0052)
  if (command.type === "AddLayers" || command.type === "UpdateLayers")
    return (
      (command["layers"] as {
        fields?: { kind?: string; swaps?: unknown[]; path?: unknown; anchor?: unknown };
      }[]) ?? []
    ).some(
      (l) =>
        l.fields?.kind === "group" ||
        (l.fields?.swaps?.length ?? 0) > 0 ||
        (l.fields?.path !== null && l.fields?.path !== undefined) ||
        (l.fields?.anchor !== null && l.fields?.anchor !== undefined),
    );
  if (command.type === "AddTimeLinks" || command.type === "UpdateTimeLinks")
    return ((command["links"] as { fields?: { layerId?: unknown } }[] | undefined) ?? []).some(
      (l) => l.fields?.layerId !== undefined && l.fields?.layerId !== null,
    );
  return false;
}

/** M5 del 2 (DEC-0053): krever migrasjon 0014. */
const SCHEMA14_COMMANDS = new Set([
  "SetAiBudget",
  "SetGenerationPrompt",
  "ReplaceSegments",
  // Avvik ved manusendring (DEC-0054): grunnlaget for 2D-scener lagres fra 0014
  "AcceptScriptChanges",
  "SetProducedFrom",
]);

/** Kontinuitet for karakterer (M6 del 2, DEC-0055): krever migrasjon 0015. */
const SCHEMA15_COMMANDS = new Set([
  "AddContinuityEvents",
  "UpdateContinuityEvents",
  "SetContinuityEventsRemoved",
]);

/** Engelsk og andre språkversjoner av manuset (M7 del 2, DEC-0058): krever migrasjon 0016. */
const SCHEMA16_COMMANDS = new Set([
  "AddTranslations",
  "UpdateTranslations",
  "SetTranslationsRemoved",
]);

/**
 * Språkversjoner av filmen (M7 del 3, DEC-0059) krever migrasjon 0017: språk på lydklipp, språkavhengige
 * bilder i lag og dialogspråket i filmlyden. Uten kolonnene ville valgene forsvinne uten varsel.
 */
export function needsSchema17(command: { type: string } & Record<string, unknown>): boolean {
  if (command.type === "SetTakeAudioLanguage") return true;
  if (command.type === "AddAudioClips" || command.type === "UpdateAudioClips")
    return ((command["clips"] as { fields?: { language?: unknown } }[] | undefined) ?? []).some(
      (c) => c.fields?.language !== undefined && c.fields?.language !== null,
    );
  if (command.type === "AddLayers" || command.type === "UpdateLayers")
    return ((command["layers"] as { fields?: { languageImages?: unknown[] } }[]) ?? []).some(
      (l) => (l.fields?.languageImages?.length ?? 0) > 0,
    );
  return false;
}

/** Kontinuitet i avledede produksjoner (DEC-0060) krever migrasjon 0018. */
export function needsSchema18(command: { type: string } & Record<string, unknown>): boolean {
  if (command.type === "SetContinuityEventDisabled") return true;
  if (command.type === "AddContinuityEvents" || command.type === "UpdateContinuityEvents")
    return (
      (command["events"] as { fields?: { productionId?: unknown } }[] | undefined) ?? []
    ).some((e) => e.fields?.productionId !== undefined && e.fields?.productionId !== null);
  return false;
}

const PRESENTATION_COMMANDS = new Set([
  "AddRelations",
  "UndoAddRelations",
  "UpdateRelations",
  "SetRelationsRemoved",
  "CreatePoster",
  "UndoCreatePoster",
  "UpdatePoster",
  "SetPosterRemoved",
]);

const STYLE_COMMANDS = new Set([
  "CreateStyleProfile",
  "UndoCreateStyleProfile",
  "UpdateStyleProfile",
  "SetStyleProfileRemoved",
]);

/**
 * Maske og blandingsmodus for lag (REQ-0175) krever migrasjon 0026. Uten kolonnene ville valgene forsvinne
 * uten varsel. Ingen maske og «normal» er det samme som før 0026.
 */
export function needsSchema26(command: { type: string } & Record<string, unknown>): boolean {
  // Myke overganger mellom deler, stemmer, betegnelser i kontekst og stilprofiler per bruk (DEC-0071)
  if (command.type === "SetSceneEdit")
    return ((command["parts"] as { transitionMs?: number }[]) ?? []).some(
      (p) => (p.transitionMs ?? 0) > 0,
    );
  if (SCHEMA26_COMMANDS.has(command.type)) return true;
  if (command.type !== "AddLayers" && command.type !== "UpdateLayers") return false;
  return ((command["layers"] as { fields?: { mask?: unknown; blend?: unknown } }[]) ?? []).some(
    (l) =>
      (l.fields?.mask !== undefined && l.fields?.mask !== null) ||
      (l.fields?.blend !== undefined && l.fields?.blend !== "normal"),
  );
}

/** Arbeidslisten og lagrede eksportinnstillinger (DEC-0072) krever migrasjon 0027. */
export function needsSchema27(command: { type: string }): boolean {
  return command.type === "SetReviewedVersions" || command.type === "SetExportSettings";
}

/** Antakelsene for varighetsestimatet per prosjekt (KI-28, DEC-0078) krever migrasjon 0028. */
export function needsSchema28(command: { type: string }): boolean {
  return command.type === "SetDurationAssumptions";
}

/**
 * Slettede objekter, lydhastighet og «animer på toere» (DEC-0079) krever migrasjon 0029 – ellers ville
 * endringen gått tapt i stillhet (apply_changes ser bort fra kolonner tabellen ikke har).
 */
export function needsSchema29(command: { type: string } & Record<string, unknown>): boolean {
  if (
    command.type === "SetAssetsRemoved" ||
    command.type === "SetAssetVersionsRemoved" ||
    command.type === "SetCompositionStep"
  )
    return true;
  if (command.type === "AddAudioClips" || command.type === "UpdateAudioClips") {
    const clips = (command["clips"] as { fields?: { speed?: number } }[]) ?? [];
    return clips.some((c) => c.fields?.speed !== undefined && c.fields.speed !== 1);
  }
  return false;
}

/**
 * Vinkel på bilder og visuelle faktaark (DEC-0080) krever migrasjon 0030 – ellers ville endringen gått tapt
 * i stillhet (apply_changes ser bort fra kolonner tabellen ikke har), og en vinkel på et bilde ville blitt
 * avvist av utløseren som vokter bildeversjonene.
 */
/** Planer for elementer i scener og systemmerknader (DEC-0088) krever migrasjon 0034. */
export function needsSchema34(command: {
  type: string;
  annotations?: readonly { source?: string; taskId?: string }[];
}): boolean {
  return (
    command.type === "PlanAssetInScenes" ||
    command.type === "RemoveScenePlans" ||
    command.type === "SetScenePlans" ||
    (command.type === "AddAnnotations" &&
      !!command.annotations?.some((a) => a.source === "system" || a.taskId))
  );
}

/** Instrukser til AI-video av scenen (DEC-0083) krever migrasjon 0032. */
export function needsSchema32(command: { type: string }): boolean {
  return command.type === "SetSceneVideoInstructions";
}

export function needsSchema31(command: { type: string }): boolean {
  return command.type === "SetProductionNote";
}

export function needsSchema30(command: { type: string }): boolean {
  return command.type === "SetVersionView" || command.type === "SetAssetVisualBrief";
}

/** Kommandoer som bare skriver kolonner fra migrasjon 0026 (DEC-0071). */
const SCHEMA26_COMMANDS = new Set<string>([
  "SetAssetVoice",
  "SetContextNames",
  "SetStyleAppliesTo",
  "SetTakeCoverage",
]);

/** Lydkoblinger (REQ-0204, DEC-0070) krever migrasjon 0025. */
export function needsSchema25(command: { type: string }): boolean {
  return command.type === "SetSoundLinks";
}

/** Planlagt lengde per scene (REQ-0111/0113) krever migrasjon 0023. */
export function needsSchema23(command: { type: string }): boolean {
  return command.type === "SetPlannedDuration";
}

/** Filmens visuelle stil for AI (DEC-0065) krever migrasjon 0021. */
export function needsSchema21(command: { type: string }): boolean {
  return STYLE_COMMANDS.has(command.type);
}

/** Relasjoner og plakater (M8 del 1, DEC-0061) krever migrasjon 0019. */
export function needsSchema19(command: { type: string }): boolean {
  return PRESENTATION_COMMANDS.has(command.type);
}

/** Importert film og overganger krever migrasjon 0011 (DEC-0047). */
function needsFilmSchema(command: { type: string } & Record<string, unknown>): boolean {
  if (command.type === "SetTransition") return true;
  return command.type === "AddTake" && command["media"] !== undefined;
}

function needsAudioSchema(command: { type: string } & Record<string, unknown>): boolean {
  if (AUDIO_COMMANDS.has(command.type)) return true;
  if (command.type === "CreateAssets")
    return ((command["assets"] as { fields?: { kind?: string } }[] | undefined) ?? []).some(
      (a) => a.fields?.kind === "sound",
    );
  if (command.type === "UpdateAsset")
    return (command["fields"] as { kind?: string } | undefined)?.kind === "sound";
  if (command.type === "AddAssetVersion")
    return String(
      (command["media"] as { mimeType?: string } | undefined)?.mimeType ?? "",
    ).startsWith("audio/");
  return false;
}

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
  if (!d || typeof d !== "object") throw new Error(L("Ugyldig forespørsel", "Invalid request"));
  const x = d as Record<string, unknown>;
  if (typeof x["projectId"] !== "string" || !isUuid(x["projectId"]))
    throw new Error(L("Ugyldig prosjekt-ID", "Invalid project ID"));
  const cmd = x["command"] as { type?: unknown } | undefined;
  if (!cmd || typeof cmd.type !== "string")
    throw new Error(L("Ugyldig kommando", "Invalid command"));
  const base = x["baseRevisions"];
  if (base !== undefined && (typeof base !== "object" || base === null))
    throw new Error(L("Ugyldige revisjoner", "Invalid revisions"));
  if (JSON.stringify(cmd).length > MAX_COMMAND_CHARS)
    throw new Error(L("Endringen er for stor", "The change is too large"));
  const cid = x["commandId"];
  if (cid !== undefined && (typeof cid !== "string" || !isUuid(cid)))
    throw new Error(L("Ugyldig kommando-ID", "Invalid command ID"));
  return {
    ...(typeof cid === "string" ? { commandId: cid } : {}),
    projectId: x["projectId"],
    command: x["command"] as Command,
    ...(base ? { baseRevisions: base as Record<string, number> } : {}),
  };
}

export const runCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateInput)
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
        message: L(
          "Du har ikke tilgang til å endre dette prosjektet",
          "You do not have access to change this project",
        ),
      };
    }

    // AI-budsjettet bestemmes av eieren (DEC-0053, REQ-0528)
    if (data.command.type === "SetAiBudget" && rank < ROLE_RANK["owner"]!) {
      return {
        ok: false,
        code: "forbidden",
        message: L(
          "Bare eieren av prosjektet kan endre AI-budsjettet.",
          "Only the owner of the project can change the AI budget.",
        ),
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnyClient;
    // Låst prosjekt eller konto som ikke er aktiv (DEC-0086): forståelig melding før databasen avviser
    {
      const { writeBlocked } = await import("@/adapters/account/lock.server");
      const blocked = await writeBlocked(admin, data.projectId, context.userId);
      if (blocked) return { ok: false, code: "forbidden", message: blocked };
    }
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
          message: L(
            "Bare dine egne siste endringer kan angres på denne måten.",
            "Only your own latest changes can be undone in this way.",
          ),
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
          message: L(
            "Bildet har vært godkjent og kan ikke fjernes.",
            "The image has been approved and cannot be removed.",
          ),
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
      if (schema.kind === "missing" || schema.version < 4)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler ressursbiblioteket og notatene. Kjør migrasjon 0004 i Lovable (se LOVABLE_SYNC.md).",
            "The database is missing the asset library and notes. Run migration 0004 in Lovable (see LOVABLE_SYNC.md).",
          ),
        };
    }
    // Prosjektets format krever migrasjon 0008
    if (data.command.type === "SetProjectFormat" || data.command.type === "UndoSetProjectFormat") {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 8)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler prosjektformatet. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0008.",
            "The database is missing the project format. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0008.",
          ),
        };
    }
    // Lyd krever migrasjon 0009
    if (needsAudioSchema(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 9)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler lyd. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0009.",
            "The database is missing sound. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0009.",
          ),
        };
    }
    if (EDIT_COMMANDS.has(data.command.type)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 12)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler klipping og tidskoblinger. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0012.",
            "The database is missing clipping and time links. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0012.",
          ),
        };
    }
    if (needsSchema13(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 13)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler de nye funksjonene (overganger, svart-hvitt, grupper, bildeskifter og bevegelsesbaner). Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0013.",
            "The database is missing the new features (transitions, black and white, groups, image swaps and motion paths). Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0013.",
          ),
        };
    }
    // AI-budsjett, egne beskrivelser og inndeling for generering krever migrasjon 0014 (DEC-0053)
    if (SCHEMA14_COMMANDS.has(data.command.type)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 14)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler AI-budsjett og genereringsbeskrivelser. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0014.",
            "The database is missing the AI budget and generation descriptions. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0014.",
          ),
        };
    }
    if (SCHEMA15_COMMANDS.has(data.command.type)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 15)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler kontinuitet for karakterene. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0015.",
            "The database is missing continuity for the characters. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0015.",
          ),
        };
    }
    if (SCHEMA16_COMMANDS.has(data.command.type)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 16)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler språkversjoner av manuset. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0016.",
            "The database is missing language versions of the script. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0016.",
          ),
        };
    }
    if (needsSchema17(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 17)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler språkversjoner av filmen (lyd og bilder per språk). Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0017.",
            "The database is missing language versions of the film (audio and images per language). Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0017.",
          ),
        };
    }
    if (needsSchema18(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 18)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler kontinuitet for spinoffer. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0018.",
            "The database is missing continuity for spin-offs. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0018.",
          ),
        };
    }
    if (needsSchema34(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 34)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler oppgaver og systemmerknader. Den må oppdateres (migrasjon 0034).",
            "The database is missing tasks and system notes. It must be updated (migration 0034).",
          ),
        };
    }
    if (needsSchema32(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 32)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler instrukser for AI-video. Den må oppdateres (migrasjon 0032).",
            "The database is missing instructions for AI video. It must be updated (migration 0032).",
          ),
        };
    }
    if (needsSchema31(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 31)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler notater på produksjonene. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0031.",
            "The database is missing notes on the productions. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0031.",
          ),
        };
    }
    if (needsSchema30(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 30)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler tillegget for vinkler på bilder og visuelle faktaark. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0030.",
            "The database is missing the addition for angles on images and visual fact sheets. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0030.",
          ),
        };
    }
    if (needsSchema29(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 29)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler tillegget for slettede objekter, lydhastighet og «animer på toere». Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0029.",
            "The database is missing the addition for deleted items, sound speed and “animate on twos”. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0029.",
          ),
        };
    }
    if (needsSchema28(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 28)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler tillegget for lagrede varighetsestimater og eksportlogg. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0028.",
            "The database is missing the addition for saved duration estimates and the export log. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0028.",
          ),
        };
    }
    if (needsSchema27(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 27)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler tillegget for arbeidslisten og eksportinnstillinger. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0027.",
            "The database is missing the addition for the worklist and export settings. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0027.",
          ),
        };
    }
    if (needsSchema26(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 26)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler det nyeste tillegget (masker, overganger, stemmer, stilprofiler). Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0026.",
            "The database is missing the newest addition (masks, transitions, voices, style profiles). Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0026.",
          ),
        };
    }
    if (needsSchema25(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 25)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler koblinger for lyd. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0025.",
            "The database is missing sound links. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0025.",
          ),
        };
    }
    if (needsSchema23(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 23)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler planlagt lengde per scene. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0023.",
            "The database is missing planned length per scene. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0023.",
          ),
        };
    }
    if (needsSchema21(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 21)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler filmens visuelle stil. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0021.",
            "The database is missing the film's visual style. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0021.",
          ),
        };
    }
    if (needsSchema19(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 19)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler plakater og relasjoner. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0019.",
            "The database is missing posters and relations. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0019.",
          ),
        };
    }
    if (needsFilmSchema(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 11)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler importert film og overganger. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0011.",
            "The database is missing imported film and transitions. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0011.",
          ),
        };
    }
    if (needsAudioFlowSchema(data.command as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 10)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler lyd over flere scener og volumpunkter. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0010.",
            "The database is missing sound across several scenes and volume points. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0010.",
          ),
        };
    }
    // 2D-sceneeditoren krever migrasjon 0007
    if (COMPOSITION_COMMANDS.has(data.command.type)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 7)
        return {
          ok: false,
          code: "schema",
          message: L(
            "Databasen mangler sceneeditoren. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0007.",
            "The database is missing the scene editor. Paste the message in LOVABLE_SYNC.md into Lovable to run migration 0007.",
          ),
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
      const known = applyChangesErrorMessage(data.command, error);
      if (known) return { ok: false, ...known };
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
          message: L(
            "Noen andre endret det samme samtidig. Hent siste versjon og prøv igjen.",
            "Someone else changed the same thing at the same time. Fetch the latest version and try again.",
          ),
        };
      }
      if (error.code === "P0409") {
        return {
          ok: false,
          code: "revision_conflict",
          message: L(
            "Noen andre har endret dette i mellomtiden. Hent siste versjon og prøv igjen.",
            "Someone else has changed this in the meantime. Fetch the latest version and try again.",
          ),
        };
      }
      if (error.code === "42501") {
        return {
          ok: false,
          code: "forbidden",
          message: L(
            "Prosjektet er slettet, eller du har ikke lenger skriverett i det.",
            "The project has been deleted, or you no longer have write access to it.",
          ),
        };
      }
      console.error("[apply_changes]", error.code, error.message); // ingen hemmeligheter i feilen
      return {
        ok: false,
        code: "storage_error",
        message: L(
          "Endringen kunne ikke lagres. Prøv igjen.",
          "The change could not be saved. Try again.",
        ),
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
