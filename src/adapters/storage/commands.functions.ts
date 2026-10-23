/**
 * Serverfunksjon som kjører domenekjernen autoritativt (DEC-0022):
 * innlogget bruker → medlemskap og rolle sjekkes → prosjektet lastes → kommandoen valideres i src/core →
 * endringssettet lagres atomisk med revisjonskontroll via public.apply_changes (bare service_role).
 */
import { createServerFn } from "@tanstack/react-start";
import { scenesOfChange } from "@/core/last-changed";
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
import { t as tk } from "@/core/i18n/keyed";

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
      message: tk("adapters-storage-commands-functions.undo-production-history"),
    };
  if (error.code === "23503")
    return {
      code: "referenced",
      message: tk("adapters-storage-commands-functions.undo-production-referenced"),
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
  "UndoMouthChange",
  "UndoReviewDialogueDrift",
  "UndoAddLineLink",
  "UndoAddTranslationLines",
  "UndoAddNoteFlag",
  "UndoGeneratedDialogue",
  "RestoreDialogueCharacters",
  "UndoAnimationChange",
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
  "UndoCreateStoryProfile",
  "UndoAddStoryProfileStage",
  "UndoAddStoryFact",
  "WithLayerRefit",
]);

/** Kommandoer som skriver til tabellene fra migrasjon 0004 (ressursbibliotek og notater). */
const LIBRARY_COMMANDS = new Set<string>([
  "ApplyGeneratedDialogue",
  "SetDialogueCharacter",
  "RestoreDialogueCharacters",
  "CreateAssets",
  "UndoCreateAssets",
  "UpdateAsset",
  "SetAssetArchived",
  "SetAssetsRemoved",
  "SetAssetVersionsRemoved",
  "SetVersionView",
  "SetAssetVisualBrief",
  "SetAssetBriefVersions",
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
  "SetAnnotationResolved",
]);

/** Kommandoer som skriver til tabellene fra migrasjon 0007 (2D-sceneeditoren). */
const COMPOSITION_COMMANDS = new Set<string>([
  "CreateComposition",
  "UndoCreateComposition",
  "UpdateComposition",
  "RetimeScene",
  "UpdateSceneDraft",
  "ApplyTemplate",
  "AddTemplateInstance",
  "UndoAddTemplateInstance",
  "UpdateTemplateInstance",
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

/** Lydkomposisjoner (DEC-0094) krever migrasjon 0036 – ellers ville komposisjonen gått tapt i stillhet. */
/** Ord-til-lyd (DEC-0095) krever migrasjon 0037. */
export function needsSchema37(command: { type: string }): boolean {
  return command.type === "SetVersionAlignment";
}

export function needsSchema36(command: { type: string } & Record<string, unknown>): boolean {
  return command.type === "AddAssetVersion" && command["composition"] !== undefined;
}

/** Instrukser til AI-video av scenen (DEC-0083) krever migrasjon 0032. */
export function needsSchema32(command: { type: string }): boolean {
  return command.type === "SetSceneVideoInstructions";
}

export function needsSchema31(command: { type: string }): boolean {
  return command.type === "SetProductionNote";
}

/** Migrasjon 0089: tekstversjoner av bildebeskrivelsen og bildets referanse til dem. */
export function needsSchema89(command: { type: string } & Record<string, unknown>): boolean {
  return command.type === "SetAssetBriefVersions" || (command.type === "SetAssetVisualBrief" && command["autoAt"] !== undefined) || (command.type === "AddAssetVersion" && command["briefVersionId"] !== undefined);
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

/** Story Lab (SL1): profiler, stadier og fakta krever migrasjon 0039. */
const STORY_LAB_COMMANDS = new Set([
  "SetStoryProfile",
  "UndoCreateStoryProfile",
  "RemoveStoryProfile",
  "AddStoryProfileStage",
  "UndoAddStoryProfileStage",
  "UpdateStoryProfileStage",
  "RemoveStoryProfileStage",
  "AddStoryFact",
  "UndoAddStoryFact",
  "UpdateStoryFact",
  "RemoveStoryFact",
]);

export function needsSchema39(command: { type: string }): boolean {
  return STORY_LAB_COMMANDS.has(command.type);
}

/** Skrivecanvaset i Story Lab (SL7) krever migrasjon 0040. */
const CANVAS_COMMANDS = new Set([
  "AddCanvasNodes",
  "UndoAddCanvasNodes",
  "UpdateCanvasNode",
  "MoveCanvasNodes",
  "RemoveCanvasNodes",
  "AddCanvasEdge",
  "UndoAddCanvasEdge",
  "UpdateCanvasEdge",
  "RemoveCanvasEdge",
]);

/** Malforekomster og maler (MTS MT4) krever migrasjon 0049. */
export function needsSchema49(command: { type: string } & Record<string, unknown>): boolean {
  if (["ApplyTemplate", "AddTemplateInstance", "UndoAddTemplateInstance", "UpdateTemplateInstance"].includes(command.type))
    return true;
  if (command.type === "AddAssetVersion") return command["template"] !== undefined;
  if (command.type === "CreateAssets")
    return ((command["assets"] as { fields?: { kind?: string } }[] | undefined) ?? []).some(
      (a) => a.fields?.kind === "template",
    );
  return false;
}

/** Fontressurser (B-098) krever migrasjon 0074. */
export function needsSchema74(command: { type: string } & Record<string, unknown>): boolean {
  if (command.type === "AddAssetVersion") return command["font"] !== undefined;
  if (command.type === "CreateAssets")
    return ((command["assets"] as { fields?: { kind?: string } }[] | undefined) ?? []).some((a) => a.fields?.kind === "font");
  return false;
}

/** Tekstlag, former og effekter (MTS MT1) krever migrasjon 0048. */
export function needsSchema48(command: { type: string } & Record<string, unknown>): boolean {
  const layers = (cmd: Record<string, unknown>): unknown[] => {
    if (cmd["type"] === "AddLayers" || cmd["type"] === "UpdateLayers")
      return ((cmd["layers"] as { fields?: unknown }[] | undefined) ?? []).map((l) => l.fields);
    if (Array.isArray(cmd["steps"])) return (cmd["steps"] as Record<string, unknown>[]).flatMap(layers);
    return [];
  };
  return layers(command).some((f) => {
    const x = (f ?? {}) as Record<string, unknown>;
    return x["kind"] === "text" || !!x["text"] || !!x["shape"] || !!x["effects"] || !!x["template"];
  });
}

export function needsSchema40(command: { type: string }): boolean {
  return CANVAS_COMMANDS.has(command.type);
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
  if (!d || typeof d !== "object") throw new Error(tk("adapters-storage-commands-functions.validate-input.message.a57266b69001"));
  const x = d as Record<string, unknown>;
  if (typeof x["projectId"] !== "string" || !isUuid(x["projectId"]))
    throw new Error(tk("adapters-storage-commands-functions.validate-input.message.b4a51e050410"));
  const cmd = x["command"] as { type?: unknown } | undefined;
  if (!cmd || typeof cmd.type !== "string")
    throw new Error(tk("adapters-storage-commands-functions.validate-input.message.880d71dcf6ed"));
  const base = x["baseRevisions"];
  if (base !== undefined && (typeof base !== "object" || base === null))
    throw new Error(tk("adapters-storage-commands-functions.validate-input.message.a5f2dc3fe631"));
  if (JSON.stringify(cmd).length > MAX_COMMAND_CHARS)
    throw new Error(tk("adapters-storage-commands-functions.validate-input.message.c634b1d34291"));
  const cid = x["commandId"];
  if (cid !== undefined && (typeof cid !== "string" || !isUuid(cid)))
    throw new Error(tk("adapters-storage-commands-functions.validate-input.message.2f8767a2619f"));
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
    // Plassholder → bilde (23.10): angre/gjør om av en endring med tilpasning kontrolleres som endringen selv
    // (selve trinnet godtas bare som en lagret invers, se INVERSE_ONLY)
    const checked: Command =
      data.command.type === "WithLayerRefit"
        ? (data.command.steps.find((x) => x?.type !== "UpdateLayers") ?? data.command.steps[0])
        : data.command;
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
        message: tk("adapters-storage-commands-functions.message.message.1c44d10ba51d"),
      };
    }

    // AI-budsjettet bestemmes av eieren (DEC-0053, REQ-0528)
    if (checked.type === "SetAiBudget" && rank < ROLE_RANK["owner"]!) {
      return {
        ok: false,
        code: "forbidden",
        message: tk("adapters-storage-commands-functions.message.message.4c1a78e0865c"),
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
          message: tk("adapters-storage-commands-functions.message.message.dcdaebb1e836"),
        };
      }
    }
    // En bildeversjon som noen gang har vært godkjent, er tatt i bruk og kan ikke angres bort (REQ-0136)
    if (checked.type === "UndoAddAssetVersion") {
      const { data: approvals } = await admin
        .from("change_log")
        .select("id")
        .eq("project_id", data.projectId)
        .eq("command_type", "ApproveAssetVersion")
        .eq("command->>versionId", checked.versionId)
        .limit(1);
      if ((approvals ?? []).length > 0)
        return {
          ok: false,
          code: "referenced",
          message: tk("adapters-storage-commands-functions.message.message.3c251d61dcc2"),
        };
    }
    const animationSteps = checked.type === "UpdateSceneDraft" ? checked.steps : [checked];
    if (["SaveMouthSet", "SaveMouthTrack", "UndoMouthChange"].includes(checked.type)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 84) return { ok: false, code: "schema", message: tk("ptg4.schema") };
    }
    if (animationSteps.some(step => ["CreateRig", "SaveRigVersion", "SetRigAnchors", "AttachAnimationUse", "SetAnimationLayerEnabled", "UndoAnimationChange"].includes(step.type))) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 54) return { ok: false, code: "schema", message: tk("adapters-storage-commands-functions.message.message.d351befc7495") };
      if (schema.version < 55 && animationSteps.some(step => step.type === "SaveRigVersion" && Object.keys(step.spec.parts ?? {}).length > 0)) return { ok: false, code: "schema", message: tk("adapters-storage-commands-functions.message.message.cce83db8d0d4") };
    }
    if (animationSteps.some(step => ["SaveLipsyncResult", "SetLipsyncEnabled", "SetLipsyncOverrides", "SaveAnimationPattern", "RemoveAnimationPattern", "UndoBehaviorChange"].includes(step.type))) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 56) return { ok: false, code: "schema", message: tk("adapters-storage-commands-functions.message.message.7fde6dc68084") };
    }
    // DV7/DV8: avviksgjennomganger og huskelapper krever migrasjon 0062
    if (["ReviewDialogueDrift", "UndoReviewDialogueDrift", "AddNoteFlag", "UndoAddNoteFlag", "UpdateNoteFlag", "SetNoteFlagRemoved"].includes(checked.type)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 62) return { ok: false, code: "schema", message: tk("adapters-storage-commands-functions.message.message.b87bdd379b23") };
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
    if (LIBRARY_COMMANDS.has(checked.type)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 4)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.04b0cde81aaf"),
        };
    }
    // Scenestatus og scenefarge (B-118) krever migrasjon 0083
    if (checked.type === "SetOccurrenceWorkStatus" || checked.type === "SetOccurrenceColor") {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 83)
        return { ok: false, code: "schema", message: tk("b118.err-schema") };
    }
    // Prosjektets format krever migrasjon 0008
    if (checked.type === "SetProjectFormat" || checked.type === "UndoSetProjectFormat") {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 8)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.01438c3c6b49"),
        };
    }
    // Lyd krever migrasjon 0009
    if (needsAudioSchema(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 9)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.115702403951"),
        };
    }
    if (EDIT_COMMANDS.has(checked.type)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 12)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.3d6e65936633"),
        };
    }
    if (needsSchema13(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 13)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.402d2c13486c"),
        };
    }
    // AI-budsjett, egne beskrivelser og inndeling for generering krever migrasjon 0014 (DEC-0053)
    if (SCHEMA14_COMMANDS.has(checked.type)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 14)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.736fdd526c7e"),
        };
    }
    if (SCHEMA15_COMMANDS.has(checked.type)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 15)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.3cd9842f48f3"),
        };
    }
    if (["SetLineLink","UndoAddLineLink","ApproveLineLinks","RejectLineLinks","RestoreLineLinks","AddTranslationLines","UndoAddTranslationLines"].includes(checked.type)) {
      const schema=await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 64) return {ok:false,code:"schema",message:tk("adapters-storage-commands-functions.message.message.1b1c45bc8516")};
    }
    if (SCHEMA16_COMMANDS.has(checked.type)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 16)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.b305cd2f5e74"),
        };
    }
    if (needsSchema17(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 17)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.fda297080af9"),
        };
    }
    if (needsSchema18(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 18)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.f3d36f381f8f"),
        };
    }
    if (needsSchema48(checked as never) || needsSchema49(checked as never)) {
      const schema = await checkSchema(admin);
      const need = needsSchema49(checked as never) ? 49 : 48;
      if (schema.kind === "missing" || schema.version < need)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.28a62ad62dd5", { need: String(need) }),
        };
    }
    if (needsSchema74(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 74)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.28a62ad62dd5", { need: "74" }),
        };
    }
    if (needsSchema40(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 40)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.2341b10b6eaf"),
        };
    }
    if (needsSchema39(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 39)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.a5075b930191"),
        };
    }
    if (needsSchema37(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 37)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.51efa6f76610"),
        };
    }
    if (needsSchema36(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 36)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.f958e3a6e218"),
        };
    }
    if (needsSchema34(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 34)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.c52e168dcd76"),
        };
    }
    if (needsSchema32(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 32)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.c77162f93c47"),
        };
    }
    if (needsSchema31(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 31)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.e1f8960f3a98"),
        };
    }
    if (needsSchema89(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 89)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.28a62ad62dd5", { need: "89" }),
        };
    }
    if (needsSchema30(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 30)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.fe59c3be6214"),
        };
    }
    if (needsSchema29(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 29)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.bd0f5f4a9cf4"),
        };
    }
    if (needsSchema28(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 28)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.94cbfeb1a92d"),
        };
    }
    if (needsSchema27(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 27)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.a351f6c20569"),
        };
    }
    if (needsSchema26(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 26)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.f770da01452c"),
        };
    }
    if (needsSchema25(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 25)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.16525acc1633"),
        };
    }
    if (needsSchema23(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 23)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.bb458d81609f"),
        };
    }
    if (needsSchema21(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 21)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.855135ab45cb"),
        };
    }
    if (needsSchema19(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 19)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.a70968a5bbb7"),
        };
    }
    if (needsFilmSchema(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 11)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.9678261bea35"),
        };
    }
    if (needsAudioFlowSchema(checked as never)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 10)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.c5c2cbda311b"),
        };
    }
    // 2D-sceneeditoren krever migrasjon 0007
    if (COMPOSITION_COMMANDS.has(checked.type)) {
      const schema = await checkSchema(admin);
      if (schema.kind === "missing" || schema.version < 7)
        return {
          ok: false,
          code: "schema",
          message: tk("adapters-storage-commands-functions.message.message.0e67cf134641"),
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

    // B-097 (0088): scenene endringen gjelder («Sist endret») skrives av apply_changes i samme transaksjon.
    const sceneIds = scenesOfChange(state, result.state, result.affected);
    const { error } = await admin.rpc("apply_changes", {
      p_project: data.projectId,
      p_actor: context.userId,
      p_command_id: id,
      p_command: data.command,
      p_inverse: result.inverse,
      p_changes: sceneIds.length ? { ...changes, sceneIds } : changes,
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
          message: tk("adapters-storage-commands-functions.message.message.ef7edfce4adc"),
        };
      }
      if (error.code === "P0409") {
        return {
          ok: false,
          code: "revision_conflict",
          message: tk("adapters-storage-commands-functions.message.message.c94f1751f646"),
        };
      }
      if (error.code === "42501") {
        return {
          ok: false,
          code: "forbidden",
          message: tk("adapters-storage-commands-functions.message.message.db3043eb5901"),
        };
      }
      console.error("[apply_changes]", error.code, error.message); // ingen hemmeligheter i feilen
      return {
        ok: false,
        code: "storage_error",
        message: tk("adapters-storage-commands-functions.message.message.30fa43b653a4"),
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
