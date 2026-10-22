import { applyMeasureSetCommand } from "../print/measure/commands";
import { applyMouthCommand } from "../interchange/mouth-commands";
import { DEFAULT_CAPTURE, captureSettingsValid, projectCodeValid } from "../interchange/settings";
import { applyPrintJobCommand } from "../print/job/commands";
import { lineLinkError, translationLineError, type TranslationLineLink, type TranslationLine } from "../translation/line-align-prompt";
import { assetVoiceError } from "../dialogue/voice";
import { languageTagError } from "../dialogue/languages";
import { clipDrift, type DialogueReview } from "../dialogue/drift";
import { NOTE_FLAG_TARGETS, NOTE_FLAG_MAX_TEXT, type NoteFlag } from "../notes/flags";
import { qualityProfileError, type QualityProfile } from "../generation/quality-profile";
import { isScriptLanguageTag } from "../translation/language-tags";
import { languageVersionError, versionIdFor, type LanguageVersion, type LanguageVersionErrorCode } from "../translation/language-versions";
import { lineInfo } from "../audio/takes";
import { DEFAULT_COMPOSITION } from "../composition/fields";
import { applyRigCommand } from "../animation/rig-commands";
import { applyMultiplaneRigCommand } from "../rig/multiplane-commands";
import { applyBehaviorCommand } from "../animation/behavior-commands";
import {
  DIALOGUE_VERSION_SOURCES,
  activeDialogueVersion,
  clipOwnEdit,
  dialogueOverlaps,
  dialogueVersionIdFor,
  editOf,
  fileOf,
  isVersionedKind,
  mirrorDialogueClips,
  orphanDialogueVersions,
  sameFile,
  versionsOfClip,
  type DialogueEdit,
  type DialogueVersion,
  type DialogueVersionFields,
} from "../dialogue/versions";
/**
 * Utfører én kommando mot prosjekttilstanden. Ren funksjon: (tilstand, kommando) → ny tilstand + invers.
 * Samme funksjon brukes i klienten (rask tilbakemelding) og på serveren (autoritativ, DEC-0022).
 */
import { compositionError, compositionSourceMs } from "../audio/composition";
import { alignmentError } from "../audio/alignment";
import {
  isUuid,
  type AssetVariantId,
  type AssetId,
  type AudioClipId,
  type BlockId,
  type CanvasEdgeId,
  type CanvasNodeId,
  type OccurrenceId,
  type AnnotationId,
  type ContinuityEventId,
  type TranslationId,
  type LayerId,
  type SceneId,
  type TakeId,
  type VariantId,
} from "../ids";
import { checkInvariants } from "../invariants";
import { materializeDraftStep, sparseDraftStep } from "./draft-fields";

import { templateError, type TemplateValues } from "../typography/template";
import { derivedFilesError } from "../library/image-ingest";
import { fontSpecError, FONT_PACK_MAX_BYTES, FONT_PACK_MIME } from "../typography/project-fonts";
import { canHaveStoryProfile, profileError, profilePatchError } from "../storylab/profile";
import { factError, type StoryFactFields } from "../storylab/facts";
import { activeProfileOf } from "../storylab/stages";
import { canvasEdgeError, canvasNodeError } from "../storylab/canvas";
import { secondsToFrames, type Rational } from "../time";
import {
  CREDIT_PARTICIPANTS_MAX,
  EXPORT_SETTINGS_MAX_BYTES,
  OCCURRENCE_KINDS,
  STILL_MIME_TYPES,
  TITLE_PAGE_MAX_BYTES,
  TITLE_PAGE_MAX_LINE,
  TITLE_PAGE_MAX_LINES,
  exportSettingsBytes,
  occurrenceKind,
  type ExportSettings,
} from "../model";
import { creditParticipantError, creditSequenceError } from "../credits";
import {
  formatMapping,
  isAllowedFps,
  rescaleComposition,
  rescaleLayer,
  sameFps,
} from "../composition/format";
import {
  normalizeCamera,
  normalizeCompositionFields,
  normalizeLayerFields,
} from "../composition/fields";
import {
  EMPTY_TIMING,
  isEmptyTiming,
  normalizeTiming,
  type CompositionTiming,
} from "../composition/timing";
import { compareKeys, isValidOrderKey, keyBetween, keysEvenly } from "../order-key";
import { compositionOfVariant } from "../composition/render";
import { isVersionView } from "../library/view";
import { compositionAssetVersions, takeAssetVersions } from "../library/content-sync";
import {
  MAX_TRANSITION_FRAMES,
  TRANSITION_KINDS,
  CONTINUITY_KINDS,
  type ContinuityEvent,
  type Translation,
  PRIMARY_LANGUAGE,
  type Annotation,
  type SoundLink,
  type ContextName,
  type AudioClip,
  type BlockRevision,
  type CompositionLayer,
  type ProjectState,
  type ScriptBlock,
  type ClipPart,
  type Take,
  type TakeMedia,
  type TimeLink,
  type Transition,
  type ProducedFrom,
  type TransitionKind,
  type ProductionSegment,
  type SegmentReason,
  type AssetRelation,
  type Poster,
  type StyleProfile,
  RELATION_KINDS,
} from "../model";
import { posterAssetRefs, posterDocumentError } from "../presentation/document";
import { STYLE_USES, STYLE_USE_LABEL, styleGuideError } from "../generation/style";
import {
  harmonizationError,
  preferredReferenceError,
  type StyleHarmonization,
  type StylePreferredReference,
} from "../generation/style-harmonize";
import { blocksOfVariant } from "../views";
import { normalizeDurationAssumptions, sameDurationAssumptions } from "../screenplay/duration";
import { MAX_PROMPT_CHARS } from "../generation/prompt";
import type {
  AssetMedia,
  RelationFields,
  PosterFields,
  StyleProfileFields,
  NewAnnotation,
  AssetFields,
  AudioClipFields,
  AssetVariantFields,
  ClipPartFields,
  Command,
  CompositionFields,
  TimeLinkFields,
  ContinuityEventFields,
  TranslationFields,
  LayerFields,
  CommandEnvelope,
  CommandError,
  CommandErrorCode,
} from "./types";
import { t as tk } from "@/core/i18n/keyed";
import { isSceneColor, isWorkStatus } from "../assembly/scene-marks";

export type ApplyResult =
  | {
      readonly ok: true;
      readonly state: ProjectState;
      /** Kommandoen som reverserer denne (for angre per bruker, ADR-0005). */
      readonly inverse: Command;
      /** ID-er for entiteter som ble opprettet eller endret. */
      readonly affected: readonly string[];
    }
  | { readonly ok: false; readonly error: CommandError };

class CommandFailure extends Error {
  constructor(
    readonly code: CommandErrorCode,
    message: string,
    readonly details?: readonly string[],
  ) {
    super(message);
  }
}

/** Høyst så mange koblinger per lydressurs (REQ-0204). */
const MAX_SOUND_LINKS = 100;

function fail(code: CommandErrorCode, message: string, details?: readonly string[]): never {
  throw new CommandFailure(code, message, details);
}

function need<T>(value: T | undefined, what: string): T {
  // Samlingene er vanlige objekter: «__proto__» eller «constructor» som ID må ikke gi treff
  if (
    value === undefined ||
    value === null ||
    typeof value === "function" ||
    (typeof value === "object" && !Object.prototype.hasOwnProperty.call(value, "id"))
  )
    fail("not_found", tk("core-commands-apply.need.fail.c40198b4a7fe", { what: String(what) }));
  return value;
}

function assertNewId(s: ProjectState, id: string) {
  if (!isUuid(id)) fail("invalid", tk("core-commands-apply.assert-new-id.fail.8c297427af29", { id: String(id) }));
  const all = [
    s.productions,
    s.scenes,
    s.variants,
    s.blocks,
    s.occurrences,
    s.segments,
    s.takes,
    s.assets,
    s.assetVariants,
    s.assetVersions,
    s.annotations,
    s.compositions,
    s.layers,
    s.audioClips,
    s.clipParts,
    s.timeLinks,
    s.generationPrompts,
    s.continuityEvents,
    s.translations,
    s.assetRelations,
    s.posters,
    s.styleProfiles,
    s.storyProfiles,
    s.storyProfileStages,
    s.storyFacts,
    s.canvasNodes,
    s.canvasEdges,
    s.animationRigs, s.animationRigVersions, s.animationUses,
    s.lipsyncResults, s.animationPatterns, s.mouthSets, s.mouthTracks,
    s.dialogueVersions,
    s.dialogueReviews ?? {}, s.noteFlags ?? {},
    s.templateInstances ?? {},
  ];
  if (all.some((c) => c[id] !== undefined))
    fail("duplicate_id", tk("core-commands-apply.assert-new-id.fail.a6e7d3cb494b", { id: String(id) }));
}

// ---------- Ressursbiblioteket ----------

export const ASSET_KINDS = [
  "character",
  "object",
  "location",
  "animal",
  "environment",
  "other",
  "sound",
] as const;
export const ASSET_NAME_KINDS = ["alias", "nickname", "former", "language"] as const;
export const VISUAL_STYLES = [
  "reference",
  "illustrated",
  "realistic",
  "animatic",
  "poster",
  "other",
] as const;
export const ASSET_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];
/** Lydformater for ressurser av typen «sound» (DEC-0044). */
export const AUDIO_MIME_TYPES: readonly string[] = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/flac",
  "audio/x-flac",
];
/** Lengste lydfil og lengste lydklipp: 10 timer. */
export const AUDIO_MAX_MS = 36_000_000;
/** Planlagt lengde for en scene (REQ-0111/0113): 1 sekund til 10 timer. */
export const MIN_PLANNED_MS = 1000;
/** Lengste instrukser til AI-video av en scene (DEC-0083; samme grense i migrasjon 0032). */
export const MAX_SCENE_VIDEO_INSTRUCTIONS = 2000;
export const MAX_PLANNED_MS = 36_000_000;

/**
 * Fortellingstiden for en scene (mandat 10.7, INV-09): kjent type, lineær uten anker, anker som finnes,
 * ikke seg selv og ingen sirkel, og en endelig forskyvning.
 */
function validStoryTime(
  s: ProjectState,
  sceneId: string,
  st: ProjectState["scenes"][string]["storyTime"] | undefined,
): void {
  if (!st || !["linear", "flashback", "flashforward", "dream", "jump"].includes(st.kind))
    fail("invalid", tk("core-commands-apply.valid-story-time.fail.842e68eed37b"));
  if (
    typeof st!.offset !== "number" ||
    !Number.isFinite(st!.offset) ||
    Math.abs(st!.offset) > 100_000
  )
    fail("invalid", tk("core-commands-apply.valid-story-time.fail.6cd8fd2e6898"));
  if (st!.kind === "linear" && st!.anchorSceneId !== null)
    fail("invalid", tk("core-commands-apply.valid-story-time.fail.bffd1f3268f4"));
  if (st!.anchorSceneId !== null) {
    if (!s.scenes[st!.anchorSceneId])
      fail("not_found", tk("core-commands-apply.valid-story-time.fail.813c0cf1a857"));
    if (st!.anchorSceneId === sceneId)
      fail(
        "invalid",
        tk("core-commands-apply.valid-story-time.fail.0bac906370ff"),
      );
    // Ingen sykliske ankre (fortellingstiden må kunne beregnes, INV-09)
    let cur: string | null = st!.anchorSceneId;
    const seen = new Set<string>();
    while (cur !== null && !seen.has(cur)) {
      if (cur === sceneId)
        fail(
          "invalid",
          tk("core-commands-apply.valid-story-time.fail.19865b0c5772"),
        );
      seen.add(cur);
      const anc: ProjectState["scenes"][string] | undefined = s.scenes[cur];
      cur = anc && anc.storyTime.kind !== "linear" ? anc.storyTime.anchorSceneId : null;
    }
  }
}

function plannedOrFail(ms: unknown): number {
  if (typeof ms !== "number" || !Number.isInteger(ms) || ms < MIN_PLANNED_MS || ms > MAX_PLANNED_MS)
    fail("invalid", tk("core-commands-apply.planned-or-fail.fail.b14f889ee131"));
  return ms as number;
}
/** Maks filstørrelse for et bilde: 2 GB (Lovable Clouds standard per fil, DEC-0032). */
export const ASSET_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Kontrollerer og rydder feltene (trimmer, fjerner duplikater). Samme regler i klient og server. */
/** En ID i det globale biblioteket (GP2): bare en UUID (kobling, ingen fremmednøkkel). */
function globalRef(id: unknown): string {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    fail("invalid", tk("core-commands-apply.global-ref.fail.300fb117fe65"));
  return id.toLowerCase();
}

function normalizeAssetFields(f: AssetFields): AssetFields {
  if (
    !f ||
    typeof f.name !== "string" ||
    typeof f.description !== "string" ||
    typeof f.category !== "string" ||
    !Array.isArray(f.names) ||
    !Array.isArray(f.tags) ||
    f.names.some(
      (n) =>
        !n ||
        typeof n.name !== "string" ||
        (n.language !== null && n.language !== undefined && typeof n.language !== "string"),
    ) ||
    f.tags.some((t) => typeof t !== "string")
  )
    fail("invalid", tk("core-commands-apply.normalize-asset-fields.fail.49a4f93a3497"));
  // «template» (MTS MT4) står ikke i ASSET_KINDS, så den ikke vises i typevalgene for vanlige ressurser
  if (!(ASSET_KINDS as readonly string[]).includes(f.kind) && f.kind !== "template" && f.kind !== "font")
    fail("invalid", tk("core-commands-apply.normalize-asset-fields.fail.0cbfa9fe6623"));
  const name = f.name.trim();
  if (!name || name.length > 200)
    fail(
      "invalid",
      tk("core-commands-apply.normalize-asset-fields.fail.3cff67207f18"),
    );
  if (f.description.length > 5000)
    fail("invalid", tk("core-commands-apply.normalize-asset-fields.fail.8f6954756818"));
  if (f.category.trim().length > 100)
    fail("invalid", tk("core-commands-apply.normalize-asset-fields.fail.66aeb55b5d13"));
  if (f.names.length > 50)
    fail("invalid", tk("core-commands-apply.normalize-asset-fields.fail.39b0f5b53990"));
  if (f.tags.length > 30) fail("invalid", tk("core-commands-apply.normalize-asset-fields.fail.22ef6084fba3"));
  const seenNames = new Set([name.toLocaleLowerCase("nb")]);
  const names = [];
  for (const n of f.names) {
    const t = n.name.trim();
    if (!t) continue;
    if (t.length > 200)
      fail("invalid", tk("core-commands-apply.normalize-asset-fields.fail.0ff2e46ed709"));
    if (!(ASSET_NAME_KINDS as readonly string[]).includes(n.kind))
      fail("invalid", tk("core-commands-apply.normalize-asset-fields.fail.d6524e95066b"));
    const key = t.toLocaleLowerCase("nb");
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    const language = n.language?.trim() || null;
    if (language !== null && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(language))
      fail("invalid", tk("core-commands-apply.normalize-asset-fields.fail.9820e1dbe5ca"));
    names.push({ name: t, kind: n.kind, language });
  }
  const tags: string[] = [];
  for (const t of f.tags) {
    const x = t.trim();
    if (!x) continue;
    if (x.length > 50) fail("invalid", tk("core-commands-apply.normalize-asset-fields.fail.02299a8cfbdc"));
    if (!tags.some((y) => y.toLocaleLowerCase("nb") === x.toLocaleLowerCase("nb"))) tags.push(x);
  }
  return {
    kind: f.kind,
    name,
    names,
    description: f.description.trim(),
    category: f.category.trim(),
    tags,
  };
}

function normalizeVariantFields(f: AssetVariantFields): AssetVariantFields {
  if (!f || typeof f.name !== "string" || typeof f.appearance !== "string")
    fail("invalid", tk("core-commands-apply.normalize-variant-fields.fail.c3326cf0559c"));
  const name = f.name.trim();
  if (!name || name.length > 200)
    fail(
      "invalid",
      tk("core-commands-apply.normalize-variant-fields.fail.f1ff484ae39b"),
    );
  if (!(VISUAL_STYLES as readonly string[]).includes(f.style))
    fail("invalid", tk("core-commands-apply.normalize-variant-fields.fail.5f579682d80d"));
  if (f.appearance.trim().length > 500)
    fail(
      "invalid",
      tk("core-commands-apply.normalize-variant-fields.fail.c28526b5b5b4"),
    );
  return { name, style: f.style, appearance: f.appearance.trim() };
}

// ---------- Notater ----------

function normalizeAnnotation(s: ProjectState, n: NewAnnotation, now: string): Annotation {
  if (n.resolved !== undefined && typeof n.resolved !== "boolean")
    fail("invalid", tk("core-commands-apply.normalize-annotation.fail.6eabe261790c"));
  // Forsøksvis manusredigering (AS3, C2): bare på tekst, med foreslått tekst
  if (n.kind !== undefined) {
    if (n.kind !== "trial_edit")
      fail("invalid", tk("core-commands-apply.normalize-annotation.fail.a816337346dd"));
    if (n.blockId === null)
      fail(
        "invalid",
        tk("core-commands-apply.normalize-annotation.fail.0be2b1ec2b0d"),
      );
    if (typeof n.suggestedText !== "string" || n.suggestedText.length > 10_000)
      fail("invalid", tk("core-commands-apply.normalize-annotation.fail.2f98f6279b1f"));
  } else if (n.suggestedText !== undefined)
    fail("invalid", tk("core-commands-apply.normalize-annotation.fail.d33670adc7b7"));
  const text = n.text.trim();
  if (!text || text.length > 10_000)
    fail(
      "invalid",
      tk("core-commands-apply.normalize-annotation.fail.56bbbe25105e"),
    );
  const authorName = n.authorName.trim().slice(0, 100);
  const stampAt = n.stampAt ?? now;
  if (typeof stampAt !== "string" || Number.isNaN(Date.parse(stampAt)))
    fail("invalid", tk("core-commands-apply.normalize-annotation.fail.a65da3b45de9"));
  if (typeof n.quote !== "string" || n.quote.length > 5000)
    fail("invalid", tk("core-commands-apply.normalize-annotation.fail.bb0816189b37"));
  if (n.blockId !== null) {
    const b = need(s.blocks[n.blockId], tk("core-commands-apply.b.need.e4b7085bbc3f"));
    if (b.removed) fail("invalid", tk("core-commands-apply.normalize-annotation.fail.09292e24e862"));
    if (n.variantId !== null)
      fail(
        "invalid",
        tk("core-commands-apply.normalize-annotation.fail.59b24d0b16aa"),
      );
    if (n.quote === "") {
      // Notat på hele elementet: ingen tekstområde, følger hele teksten også etter endringer
      if (n.start !== 0 || n.end !== 0)
        fail("invalid", tk("core-commands-apply.normalize-annotation.fail.7595e9f85f20"));
    } else {
      if (!Number.isInteger(n.start) || !Number.isInteger(n.end) || n.start < 0 || n.end <= n.start)
        fail("invalid", tk("core-commands-apply.normalize-annotation.fail.7595e9f85f20.2"));
      if (b.text.slice(n.start, n.end) !== n.quote) {
        // Teksten er endret siden (f.eks. gjør om etter angre): finn det markerte nærmest samme sted
        let best = -1;
        for (let i = b.text.indexOf(n.quote); i >= 0; i = b.text.indexOf(n.quote, i + 1))
          if (best < 0 || Math.abs(i - n.start) < Math.abs(best - n.start)) best = i;
        if (best < 0)
          fail(
            "invalid",
            tk("core-commands-apply.normalize-annotation.fail.ad6082629731"),
          );
        return {
          ...base(),
          start: best,
          end: best + n.quote.length,
        };
      }
    }
  } else {
    if (n.variantId === null)
      fail(
        "invalid",
        tk("core-commands-apply.normalize-annotation.fail.0bdc84d7c0d6"),
      );
    need(s.variants[n.variantId], tk("core-commands-apply.normalize-annotation.need.240f5ac3f427"));
    if (n.start !== 0 || n.end !== 0 || n.quote !== "")
      fail(
        "invalid",
        tk("core-commands-apply.normalize-annotation.fail.27208039bdc7"),
      );
  }
  return base();

  function base(): Annotation {
    return {
      id: n.annotationId,
      revision: 1,
      variantId: n.variantId,
      blockId: n.blockId,
      start: n.start,
      end: n.end,
      quote: n.quote,
      text,
      authorName: authorName || "Ukjent", // i18n-ignore – lagret forfatternavn (standard)
      stampAt: new Date(stampAt as string).toISOString(),
      editedByName: null,
      editedAt: null,
      removed: false,
      resolved: n.resolved === true,
      ...(n.source === "system" ? { source: "system" as const } : {}),
      ...(n.taskId !== undefined ? { taskId: checkTaskId(n.taskId) } : {}),
      ...(n.kind === "trial_edit" ? { kind: "trial_edit" as const, suggestedText: n.suggestedText! } : {}),
    };
  }
}

/** Oppgave-ID (DEC-0088): en UUID. */
function checkTaskId(id: unknown): string {
  if (typeof id !== "string" || !isUuid(id)) fail("invalid", tk("core-commands-apply.check-task-id.fail.9383f3657c7c"));
  return id;
}

function assertKey(key: string) {
  if (!isValidOrderKey(key))
    fail("invalid", tk("core-commands-apply.assert-key.fail.8115adfc5b00", { key: String(key) }));
}

/** Finn revisjonen til en entitet uansett samling. */
/** Revisjon per entitet (for baseRevisions ved angre/gjør om, INV-C1). Entiteter som ikke finnes, utelates. */
export function revisionsOf(s: ProjectState, ids: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) {
    const r = revisionOf(s, id);
    if (r !== undefined) out[id] = r;
  }
  return out;
}

export function revisionOf(s: ProjectState, id: string): number | undefined {
  if (id === s.project.id) return s.project.revision;
  for (const c of [
    s.productions,
    s.scenes,
    s.variants,
    s.blocks,
    s.occurrences,
    s.segments,
    s.takes,
    s.assets,
    s.assetVariants,
    s.assetVersions,
    s.annotations,
    s.compositions,
    s.layers,
    s.audioClips,
    s.clipParts,
    s.timeLinks,
    s.generationPrompts,
    s.continuityEvents,
    s.translations,
    s.assetRelations,
    s.posters,
    s.styleProfiles,
    s.storyProfiles,
    s.storyProfileStages,
    s.storyFacts,
    s.canvasNodes,
    s.canvasEdges,
    s.animationRigs, s.animationRigVersions, s.animationUses,
    s.lipsyncResults, s.animationPatterns, s.mouthSets, s.mouthTracks,
    s.dialogueVersions,
    s.dialogueReviews ?? {}, s.noteFlags ?? {},
  ]) {
    const e = c[id];
    if (e) return e.revision;
  }
  return undefined;
}

function currentBlockRevisions(s: ProjectState, variantId: VariantId): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of Object.values(s.blocks))
    if (b.variantId === variantId && !b.removed) out[b.id] = b.currentRev;
  return out;
}

/** Kan blokker i denne varianten redigeres i produksjonen? (INV-04, mandat 24.5) */
function assertCanEditVariant(s: ProjectState, productionId: string, variantId: VariantId) {
  const variant = need(s.variants[variantId], tk("core-commands-apply.variant.need.aee0968fe242"));
  const production = need(s.productions[productionId], tk("core-commands-apply.production.need.029c6cd72e60"));
  if (variant.ownerProductionId === null) {
    if (production.kind !== "main") {
      fail(
        "must_fork_variant",
        tk("core-commands-apply.assert-can-edit-variant.fail.ca92e96a3180"),
      );
    }
  } else if (variant.ownerProductionId !== productionId) {
    fail(
      "must_fork_variant",
      tk("core-commands-apply.assert-can-edit-variant.fail.731eac609516"),
    );
  }
}

// ---------- 2D-sceneeditor (M3 del 2, DEC-0035) ----------

function compositionFields(f: CompositionFields): CompositionFields {
  const r = normalizeCompositionFields(f);
  if (!r.ok) fail("invalid", r.error);
  return r.value;
}

/**
 * Brukes ressursen, varianten eller versjonen av et lag (eget bilde eller bildeskifte, også slettede lag som
 * kan hentes tilbake)? Da kan den ikke angres bort (DEC-0052).
 */
function usedByLayer(
  s: ProjectState,
  key: "assetId" | "assetVariantId" | "versionId",
  id: string,
): boolean {
  return Object.values(s.layers).some(
    (l) =>
      l[key] === id ||
      l.swaps.some((w) => w[key] === id) ||
      (key !== "assetId" && (l.languageImages ?? []).some((li) => li[key] === id)),
  );
}

/** Brukes ressursen i en relasjon eller på en plakat (DEC-0061)? Da kan den ikke slettes ved angring. */
function usedByPresentation(
  s: ProjectState,
  key: "assets" | "variants" | "versions",
  id: string,
): boolean {
  if (
    key === "assets" &&
    Object.values(s.assetRelations).some((r) => r.fromAssetId === id || r.toAssetId === id)
  )
    return true;
  // Story Lab (SL1): profiler, stadier og fakta viser til karakteren
  if (key === "assets" && storyLabUsesAsset(s, id)) return true;
  if (
    key === "versions" &&
    Object.values(s.styleProfiles).some((p) => p.guide.referenceVersionIds.includes(id))
  )
    return true;
  return Object.values(s.posters).some((p) => posterAssetRefs(p.document)[key].has(id));
}

function layerFields(s: ProjectState, f: LayerFields, prev?: CompositionLayer): LayerFields {
  // En eldre klient uten feltene for bildeskifte, bane og ankerpunkt skal ikke slette dem (DEC-0052)
  if (prev)
    f = {
      ...f,
      swaps: f.swaps ?? prev.swaps,
      path: f.path === undefined ? prev.path : f.path,
      anchor: f.anchor === undefined ? prev.anchor : f.anchor,
      // Språkavhengige bilder (DEC-0059): utelatt = uendret
      languageImages: f.languageImages ?? prev.languageImages ?? [],
      // Maske og blandingsmodus (REQ-0175): utelatt = uendret
      mask: f.mask === undefined ? (prev.mask ?? null) : f.mask,
      blend: f.blend ?? prev.blend ?? "normal",
      // Aktivt tidsområde (AS2): utelatt = uendret
      activeRange: f.activeRange === undefined ? (prev.activeRange ?? null) : f.activeRange,
      // Tekst, form, effekter og malfelt (MTS): utelatt = uendret
      text: f.text === undefined ? (prev.text ?? null) : f.text,
      shape: f.shape === undefined ? (prev.shape ?? null) : f.shape,
      effects: f.effects === undefined ? (prev.effects ?? null) : f.effects,
      template: f.template === undefined ? (prev.template ?? null) : f.template,
      // Sideovergang (MTS MT6): utelatt = uendret
      pageTransition: f.pageTransition === undefined ? (prev.pageTransition ?? null) : f.pageTransition,
    };
  // Nytt bilde i laget (annen ressurs): bilder per språk av den gamle ressursen passer ikke lenger
  if (prev && f.assetId !== prev.assetId)
    f = {
      ...f,
      languageImages: (f.languageImages ?? []).filter(
        (li) => f.assetId !== null && s.assetVariants[li.assetVariantId]?.assetId === f.assetId,
      ),
    };
  const r = normalizeLayerFields(f);
  if (!r.ok) fail("invalid", r.error);
  const v = r.value;
  if (v.assetId !== null && need(s.assets[v.assetId], tk("core-commands-apply.layer-fields.need.56dbffff510d")).kind === "sound")
    fail(
      "invalid",
      tk("core-commands-apply.layer-fields.fail.513f3348c7fa"),
    );
  if (v.assetVariantId !== null) {
    const va = need(
      s.assetVariants[v.assetVariantId],
      tk("core-commands-apply.va.need.447921afc7f5"),
    );
    if (va.assetId !== v.assetId)
      fail(
        "invalid",
        tk("core-commands-apply.layer-fields.fail.7f52555bd15a"),
      );
  }
  if (v.versionId !== null) {
    const ve = need(s.assetVersions[v.versionId], tk("core-commands-apply.ve.need.d1986046a351"));
    if (ve.variantId !== v.assetVariantId)
      fail(
        "invalid",
        tk("core-commands-apply.layer-fields.fail.f4600eab3c7f"),
      );
  }
  // Bildeskifter: samme kontroll som lagets eget bilde (uendrede skifter kontrolleres ikke på nytt)
  const old = new Set((prev?.swaps ?? []).map((w) => JSON.stringify(w)));
  for (const w of v.swaps) {
    if (old.has(JSON.stringify(w))) continue;
    if (
      need(s.assets[w.assetId], tk("core-commands-apply.layer-fields.need.2a0057233cfc")).kind ===
      "sound"
    )
      fail(
        "invalid",
        tk("core-commands-apply.layer-fields.fail.513f3348c7fa.2"),
      );
    if (w.assetVariantId !== null) {
      const va = need(
        s.assetVariants[w.assetVariantId],
        tk("core-commands-apply.va.need.447921afc7f5.2"),
      );
      if (va.assetId !== w.assetId)
        fail(
          "invalid",
          tk("core-commands-apply.layer-fields.fail.7f52555bd15a.2"),
        );
    }
    if (w.versionId !== null) {
      const ve = need(s.assetVersions[w.versionId], tk("core-commands-apply.ve.need.d1986046a351.2"));
      if (ve.variantId !== w.assetVariantId)
        fail(
          "invalid",
          tk("core-commands-apply.layer-fields.fail.f4600eab3c7f.2"),
        );
    }
  }
  // Språkavhengige bilder (DEC-0059, REQ-0337): en variant av lagets egen ressurs (uendrede kontrolleres
  // ikke på nytt, som bildeskifter)
  const oldLang = new Set((prev?.languageImages ?? []).map((x) => JSON.stringify(x)));
  for (const li of v.languageImages ?? []) {
    if (prev && prev.assetId === v.assetId && oldLang.has(JSON.stringify(li))) continue;
    const va = need(
      s.assetVariants[li.assetVariantId],
      tk("core-commands-apply.va.need.5f17b1c836f3"),
    );
    if (va.assetId !== v.assetId)
      fail(
        "invalid",
        tk("core-commands-apply.layer-fields.fail.79c934507535"),
      );
    if (li.versionId !== null) {
      const ve = need(
        s.assetVersions[li.versionId],
        tk("core-commands-apply.ve.need.315394bd6853"),
      );
      if (ve.variantId !== li.assetVariantId)
        fail(
          "invalid",
          tk("core-commands-apply.layer-fields.fail.f4600eab3c7f.3"),
        );
    }
  }
  return v;
}

function fieldsOfLayer(l: CompositionLayer): LayerFields {
  return {
    kind: l.kind,
    name: l.name,
    assetId: l.assetId,
    assetVariantId: l.assetVariantId,
    versionId: l.versionId,
    fill: l.fill,
    width: l.width,
    height: l.height,
    parallax: l.parallax,
    transform: l.transform,
    keyframes: l.keyframes,
    visible: l.visible,
    locked: l.locked,
    groupId: l.groupId,
    swaps: l.swaps,
    path: l.path,
    anchor: l.anchor,
    ...(l.languageImages?.length ? { languageImages: l.languageImages } : {}),
    ...(l.mask ? { mask: l.mask } : {}),
    ...(l.blend && l.blend !== "normal" ? { blend: l.blend } : {}),
    ...(l.activeRange ? { activeRange: l.activeRange } : {}),
    ...(l.text ? { text: l.text } : {}),
    ...(l.shape ? { shape: l.shape } : {}),
    ...(l.effects ? { effects: l.effects } : {}),
    ...(l.template ? { template: l.template } : {}),
  };
}

/**
 * Masker (REQ-0175): et lag som får en maske av et annet lag, må vise til et lag (ikke en gruppe) i samme
 * 2D-scene, ikke seg selv, og masker må ikke gå i ring (A maskeres av B som maskeres av A). Bare lag som får
 * ny maske kontrolleres; et slettet maskelag gjør bare at laget vises uten maske.
 */
function checkMasks(before: ProjectState, after: ProjectState, ids: readonly string[]): void {
  for (const id of ids) {
    const l = after.layers[id];
    const m = l?.mask;
    if (!l || !m || m.kind !== "layer") continue;
    if (JSON.stringify(before.layers[id]?.mask ?? null) === JSON.stringify(m)) continue;
    if (m.layerId === l.id)
      fail(
        "invalid",
        tk("core-commands-apply.check-masks.fail.765458411686"),
      );
    const target = after.layers[m.layerId];
    if (!target || target.compositionId !== l.compositionId)
      fail(
        "invalid",
        tk("core-commands-apply.check-masks.fail.7f6a26c60e3b"),
      );
    if (target.kind === "group" || target.kind === "page")
      fail(
        "invalid",
        tk("core-commands-apply.check-masks.fail.da01a985bedf"),
      );
    const seen = new Set<string>([l.id]);
    let cur: CompositionLayer | undefined = target;
    while (cur && cur.mask?.kind === "layer") {
      if (seen.has(cur.mask.layerId))
        fail(
          "invalid",
          tk("core-commands-apply.check-masks.fail.92e942ca652c"),
        );
      seen.add(cur.id);
      cur = after.layers[cur.mask.layerId];
    }
  }
}

/**
 * Grupper (DEC-0052): et lag som legges i en gruppe, må peke på et gruppelag i samme 2D-scene som ikke er
 * slettet. Bare lag som får ny gruppe kontrolleres (en slettet gruppe gjør bare at lagene står fritt).
 */
function checkGroups(before: ProjectState, after: ProjectState, ids: readonly string[]): void {
  for (const id of ids) {
    const l = after.layers[id];
    if (!l || l.groupId === null || before.layers[id]?.groupId === l.groupId) continue;
    const g = after.layers[l.groupId];
    if (!g || (g.kind !== "group" && g.kind !== "page") || g.compositionId !== l.compositionId || g.id === l.id)
      fail(
        "invalid",
        tk("core-commands-apply.check-groups.fail.15af7f115373"),
      );
    if (g.removed) fail("invalid", tk("core-commands-apply.check-groups.fail.b4cc24e0688a"));
  }
}

function sortedLayerKeys(s: ProjectState, compositionId: string, except?: string): string[] {
  return Object.values(s.layers)
    .filter((l) => l.compositionId === compositionId && l.id !== except)
    .map((l) => l.orderKey)
    .sort(compareKeys);
}

const MAX_CAMERA_JSON = 64 * 1024;

/** Lengste stillbilde som versjon (bilder ved 1000 fps tilsvarer AUDIO_MAX_MS; i praksis langt nok). */
const STILL_MAX_FRAMES = 1_000_000;

/** Flest deler i ett klipp (DEC-0048). */
export const MAX_CLIP_PARTS = 200;

function partFieldsOf(p: ClipPartFields): ClipPartFields {
  if (!p || typeof p !== "object" || !isUuid(String(p.partId)))
    fail("invalid", tk("core-commands-apply.part-fields-of.fail.b771de8114b6"));
  if (p.source !== "take" && p.source !== "composition")
    fail("invalid", tk("core-commands-apply.part-fields-of.fail.7a7ac42b6b1c"));
  if ((p.source === "take") !== (p.takeId !== null && p.takeId !== undefined))
    fail(
      "invalid",
      tk("core-commands-apply.part-fields-of.fail.a3f4e2d4745e"),
    );
  if (
    !Number.isInteger(p.inMs) ||
    !Number.isInteger(p.outMs) ||
    p.inMs < 0 ||
    p.outMs <= p.inMs ||
    p.outMs > AUDIO_MAX_MS
  )
    fail(
      "invalid",
      tk("core-commands-apply.part-fields-of.fail.bf41314b1cc8"),
    );
  return {
    partId: p.partId,
    source: p.source,
    takeId: p.source === "take" ? p.takeId : null,
    inMs: p.inMs,
    outMs: p.outMs,
    ...(p.transitionMs ? { transitionMs: transitionMsOf(p.transitionMs, p.outMs - p.inMs) } : {}),
  };
}

/** Lengste myke overgang mellom to deler (ms). */
export const MAX_PART_TRANSITION_MS = 5000;

function transitionMsOf(ms: number, partMs: number): number {
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_PART_TRANSITION_MS)
    fail(
      "invalid",
      tk("core-commands-apply.transition-ms-of.fail.bf3b7c2f75e7", { MAX_PART_TRANSITION_MS: String(MAX_PART_TRANSITION_MS) }),
    );
  if (ms > partMs)
    fail(
      "invalid",
      tk("core-commands-apply.transition-ms-of.fail.5ac489f8e261"),
    );
  return ms;
}

/** Lengste beskrivelse av en kontinuitetshendelse. */
export const CONTINUITY_DESCRIPTION_MAX = 2000;

function continuityFieldsOf(
  s: ProjectState,
  f: ContinuityEventFields,
  prev?: ContinuityEvent,
): Omit<ContinuityEvent, "id" | "revision" | "removed" | "disabledIn"> {
  if (!f || typeof f !== "object")
    fail("invalid", tk("core-commands-apply.continuity-fields-of.fail.64d2629fc38c"));
  const a = need(s.assets[f.assetId], tk("core-commands-apply.a.need.f66a94bd1bc8"));
  if (a.kind === "sound" || a.kind === "location" || a.kind === "environment")
    fail(
      "invalid",
      tk("core-commands-apply.continuity-fields-of.fail.68cc32b39eac"),
    );
  if (!(CONTINUITY_KINDS as readonly string[]).includes(f.kind))
    fail("invalid", tk("core-commands-apply.continuity-fields-of.fail.45f5d92b5eed"));
  if (f.duration !== "permanent" && f.duration !== "temporary" && f.duration !== "scene")
    fail("invalid", tk("core-commands-apply.continuity-fields-of.fail.da74a1bf64c7"));
  if (f.status !== "approved" && f.status !== "dismissed")
    fail("invalid", tk("core-commands-apply.continuity-fields-of.fail.33efffb72988"));
  if (typeof f.description !== "string" || f.description.length > CONTINUITY_DESCRIPTION_MAX)
    fail("invalid", tk("core-commands-apply.continuity-fields-of.fail.38a915f2e197"));
  const variant = (id: AssetVariantId | null, what: string) => {
    if (id === null || id === undefined) return null;
    const v = need(s.assetVariants[id], what);
    if (v.assetId !== a.id)
      fail(
        "invalid",
        tk("core-commands-apply.variant.fail.36e064655cdb", { what: String(what) }),
      );
    return v.id;
  };
  let scene = need(s.scenes[f.sceneId], tk("core-commands-apply.scene.need.89e5e8c309f1"));
  let blockId: BlockId | null = null;
  if (f.blockId !== null && f.blockId !== undefined) {
    const b = need(s.blocks[f.blockId], tk("core-commands-apply.b.need.440bfebc27b1"));
    const lineScene = s.variants[b.variantId]?.sceneId;
    if (!lineScene)
      fail(
        "invalid",
        tk("core-commands-apply.continuity-fields-of.fail.e4cf16786478"),
      );
    // Scenen følger linjen (den kan ha flyttet ved deling eller sammenslåing siden hendelsen ble laget)
    scene = need(s.scenes[lineScene], tk("core-commands-apply.continuity-fields-of.need.771effb5f150"));
    blockId = b.id;
  }
  let untilSceneId: SceneId | null = null;
  if (f.duration === "temporary") {
    if (f.untilSceneId === null || f.untilSceneId === undefined)
      fail(
        "invalid",
        tk("core-commands-apply.continuity-fields-of.fail.8881e4053997"),
      );
    untilSceneId = need(
      s.scenes[f.untilSceneId],
      tk("core-commands-apply.continuity-fields-of.need.fd75e73bcb50"),
    ).id;
    if (untilSceneId === scene.id)
      fail(
        "invalid",
        tk("core-commands-apply.continuity-fields-of.fail.a631ee54d738"),
      );
  }
  // Lokal for en avledet produksjon (DEC-0060); utelatt ved endring = uendret
  const productionId = f.productionId === undefined ? (prev?.productionId ?? null) : f.productionId;
  if (productionId !== null) {
    const p = need(s.productions[productionId], tk("core-commands-apply.p.need.83aa7f655d8e"));
    if (p.kind === "main")
      fail(
        "invalid",
        tk("core-commands-apply.continuity-fields-of.fail.fa0fbf99c75b"),
      );
    if (prev && !prev.productionId)
      fail(
        "invalid",
        tk("core-commands-apply.continuity-fields-of.fail.36dda2e1b710"),
      );
  } else if (prev?.productionId)
    fail(
      "invalid",
      tk("core-commands-apply.continuity-fields-of.fail.6be806c8a95b"),
    );
  return {
    ...(productionId !== null ? { productionId: productionId as never } : {}),
    assetId: a.id,
    kind: f.kind,
    description: f.description.trim(),
    fromVariantId: variant(f.fromVariantId, tk("core-commands-apply.from-variant-id.variant.54750c663342")),
    toVariantId: variant(f.toVariantId, tk("core-commands-apply.to-variant-id.variant.fc4c1333b27f")),
    duration: f.duration,
    sceneId: scene.id,
    blockId,
    untilSceneId,
    status: f.status,
  };
}

/** Lengste oversatte tekst (som manusblokker). */
const TRANSLATION_MAX = 20000;

/**
 * ML3: språkversjonen til en linjekobling følger målradene (samme språkversjon som linjene), ellers
 * prosjektets versjon for språket. Mål med ulike versjoner avvises.
 */
function linkVersionId(s: ProjectState, f: { readonly language: string; readonly targetTranslationIds: readonly string[] }): string | undefined {
  const ids = new Set<string>();
  for (const id of f.targetTranslationIds) {
    const v = s.translations[id]?.languageVersionId ?? s.translationLines?.[id]?.languageVersionId;
    if (v) ids.add(v);
  }
  if (ids.size > 1) fail("invalid", tk("ml3-language-versions.error.mixed-versions"));
  return [...ids][0] ?? versionIdFor(s, f.language);
}

/** ML3: feilmelding for en språkversjon. */
function languageVersionMessage(code: LanguageVersionErrorCode, language: string): string {
  switch (code) {
    case "duplicate": return tk("ml3-language-versions.error.duplicate", { language });
    case "language": return tk("ml3-language-versions.error.language");
    case "norwegian": return tk("ml3-language-versions.error.norwegian");
    case "name": return tk("ml3-language-versions.error.name");
    case "status": return tk("ml3-language-versions.error.status");
  }
}

function translationFieldsOf(
  s: ProjectState,
  f: TranslationFields,
): Omit<Translation, "id" | "revision" | "removed"> {
  if (!f || typeof f !== "object")
    fail("invalid", tk("core-commands-apply.translation-fields-of.fail.eb653dd6de37"));
  if (!isScriptLanguageTag(f.language))
    fail("invalid", tk("core-commands-apply.translation-fields-of.fail.705cd5c07cc0"));
  if (f.language === "nb" || f.language === "no")
    fail(
      "invalid",
      tk("core-commands-apply.translation-fields-of.fail.b8697ac1dfc3"),
    );
  if (typeof f.text !== "string" || f.text.length > TRANSLATION_MAX)
    fail("invalid", tk("core-commands-apply.translation-fields-of.fail.73a9adebd4ff"));
  if (!f.text.trim())
    fail(
      "invalid",
      tk("core-commands-apply.translation-fields-of.fail.14d30ec4a4bb"),
    );
  if (f.status !== "approved" && f.status !== "uncertain")
    fail("invalid", tk("core-commands-apply.translation-fields-of.fail.90cb0f0670c0"));
  const hasBlock = f.blockId !== null && f.blockId !== undefined;
  const hasVariant = f.variantId !== null && f.variantId !== undefined;
  if (hasBlock === hasVariant)
    fail(
      "invalid",
      tk("core-commands-apply.translation-fields-of.fail.0623198f6f04"),
    );
  if (!Number.isInteger(f.basedOnRev) || f.basedOnRev < 0)
    fail("invalid", tk("core-commands-apply.translation-fields-of.fail.6ea381291e51"));
  if (hasBlock) {
    const b = need(s.blocks[f.blockId!], tk("core-commands-apply.b.need.440bfebc27b1.2"));
    if (f.basedOnRev > b.currentRev)
      fail("invalid", tk("core-commands-apply.translation-fields-of.fail.fc219dd67591"));
    return {
      blockId: b.id,
      variantId: null,
      language: f.language,
      text: f.text,
      basedOnRev: f.basedOnRev,
      status: f.status,
    };
  }
  const v = need(s.variants[f.variantId!], tk("core-commands-apply.v.need.acdff82a388d"));
  // Scenehodet: revisjonen av scenevarianten da det ble oversatt (endret hode → gjennomgå)
  if (f.basedOnRev > v.revision)
    fail("invalid", tk("core-commands-apply.translation-fields-of.fail.fc219dd67591.2"));
  return {
    blockId: null,
    variantId: v.id,
    language: f.language,
    text: f.text,
    basedOnRev: f.basedOnRev,
    status: f.status,
  };
}

const translationKey = (t: Pick<Translation, "blockId" | "variantId" | "language">) =>
  `${t.blockId ?? t.variantId}:${t.language}`;

// ---------- Presentasjon (M8 del 1, DEC-0061) ----------

function relationFieldsOf(
  s: ProjectState,
  f: RelationFields,
): Omit<AssetRelation, "id" | "revision" | "removed"> {
  if (!f || typeof f !== "object") fail("invalid", tk("core-commands-apply.relation-fields-of.fail.79d3bd5578bc"));
  const a = need(s.assets[f.fromAssetId], tk("core-commands-apply.a.need.f66a94bd1bc8.2"));
  const b = need(s.assets[f.toAssetId], tk("core-commands-apply.b.need.218c6f1c6e33"));
  if (a.id === b.id)
    fail(
      "invalid",
      tk("core-commands-apply.relation-fields-of.fail.cc260a8be421"),
    );
  if (a.kind === "sound" || b.kind === "sound")
    fail("invalid", tk("core-commands-apply.relation-fields-of.fail.92dccdf85f06"));
  if (!(RELATION_KINDS as readonly string[]).includes(f.kind))
    fail("invalid", tk("core-commands-apply.relation-fields-of.fail.3a87aa964d8e"));
  if (typeof f.label !== "string" || f.label.length > 120)
    fail("invalid", tk("core-commands-apply.relation-fields-of.fail.fe9d02cf9a0e"));
  if (typeof f.description !== "string" || f.description.length > 2000)
    fail("invalid", tk("core-commands-apply.relation-fields-of.fail.0f7a1420eb04"));
  if (f.status !== "approved" && f.status !== "dismissed")
    fail("invalid", tk("core-commands-apply.relation-fields-of.fail.cca2de6fa431"));
  return {
    fromAssetId: a.id,
    toAssetId: b.id,
    kind: f.kind,
    label: f.label.trim(),
    description: f.description.trim(),
    status: f.status,
  };
}

function otherDefault(s: ProjectState, id: string): boolean {
  return Object.values(s.styleProfiles).some((x) => x.id !== id && !x.removed && x.isDefault);
}

/** Stilprofilens felter. Forbildebilder kontrolleres bare når de er nye i profilen. */
function styleProfileFieldsOf(
  s: ProjectState,
  f: StyleProfileFields,
  id: string,
  prev?: StyleProfile,
): Omit<StyleProfile, "id" | "revision" | "removed"> {
  if (!f || typeof f !== "object")
    fail("invalid", tk("core-commands-apply.style-profile-fields-of.fail.aa0fe51d1fda"));
  if (typeof f.name !== "string" || !f.name.trim() || f.name.length > 120)
    fail(
      "invalid",
      tk("core-commands-apply.style-profile-fields-of.fail.1a5d7414ab5e"),
    );
  if (typeof f.isDefault !== "boolean")
    fail("invalid", tk("core-commands-apply.style-profile-fields-of.fail.aa0fe51d1fda.2"));
  if (f.isDefault && otherDefault(s, id))
    fail(
      "invalid",
      tk("core-commands-apply.style-profile-fields-of.fail.b3e627910868"),
    );
  const err = styleGuideError(f.guide);
  if (err) fail("invalid", err);
  const old = new Set(prev?.guide.referenceVersionIds ?? []);
  for (const v of f.guide.referenceVersionIds)
    if (
      !old.has(v) &&
      !need(s.assetVersions[v], tk("core-commands-apply.style-profile-fields-of.need.a17eb54a0e1a")).mimeType.startsWith(
        "image/",
      )
    )
      fail("invalid", tk("core-commands-apply.style-profile-fields-of.fail.33fe9e5313bb"));
  return { name: f.name.trim(), isDefault: f.isDefault, guide: f.guide };
}

/** Samme par og type kan bare finnes én gang (avvist eller godkjent) – ingen doble linjer i kartet. */
function assertUniqueRelation(all: Record<string, AssetRelation>, id: string): void {
  const r = all[id];
  if (!r || r.removed) return;
  const key = (x: AssetRelation) => `${[x.fromAssetId, x.toAssetId].sort().join("|")}|${x.kind}`;
  const k = key(r);
  if (Object.values(all).some((x) => x.id !== id && !x.removed && key(x) === k))
    fail("invalid", tk("core-commands-apply.assert-unique-relation.fail.9b10da4a06dd"));
}

/** Plakatens felter. Ressurser kontrolleres bare når de er nye i plakaten (som bildeskifter). */
function posterFieldsOf(
  s: ProjectState,
  f: PosterFields,
  prev?: Poster,
): Omit<Poster, "id" | "revision" | "removed"> {
  if (!f || typeof f !== "object") fail("invalid", tk("core-commands-apply.poster-fields-of.fail.8317719e5364"));
  const p = need(s.productions[f.productionId], tk("core-commands-apply.p.need.83aa7f655d8e.2"));
  if (prev && prev.productionId !== p.id)
    fail(
      "invalid",
      tk("core-commands-apply.poster-fields-of.fail.3ea68299261b"),
    );
  if (typeof f.name !== "string" || !f.name.trim() || f.name.length > 200)
    fail(
      "invalid",
      tk("core-commands-apply.poster-fields-of.fail.84c011b222be"),
    );
  if (f.kind !== "pitch" && f.kind !== "character_map")
    fail("invalid", tk("core-commands-apply.poster-fields-of.fail.67222877f93c"));
  if (f.language !== "nb" && f.language !== "en")
    fail("invalid", tk("core-commands-apply.poster-fields-of.fail.966611c3dc2e"));
  if (
    !Number.isFinite(f.widthMm) ||
    !Number.isFinite(f.heightMm) ||
    f.widthMm < 50 ||
    f.heightMm < 50 ||
    f.widthMm > 3000 ||
    f.heightMm > 3000
  )
    fail("invalid", tk("core-commands-apply.poster-fields-of.fail.935ed0b5decd"));
  const err = posterDocumentError(f.document);
  if (err) fail("invalid", err);
  if (JSON.stringify(f.document).length > 1_500_000)
    fail("invalid", tk("core-commands-apply.poster-fields-of.fail.2a4ff0315b22"));
  const refs = posterAssetRefs(f.document);
  const old = prev ? posterAssetRefs(prev.document) : null;
  for (const id of refs.assets)
    if (!old?.assets.has(id)) {
      const a = need(s.assets[id], tk("core-commands-apply.a.need.95de442cb06c"));
      if (a.kind === "sound")
        fail(
          "invalid",
          tk("core-commands-apply.poster-fields-of.fail.963da91bce02"),
        );
    }
  for (const id of refs.variants)
    if (!old?.variants.has(id))
      need(s.assetVariants[id], tk("core-commands-apply.poster-fields-of.need.69ca4ea20008"));
  for (const id of refs.versions)
    if (!old?.versions.has(id))
      need(s.assetVersions[id], tk("core-commands-apply.poster-fields-of.need.3407b3f0ded9"));
  for (const id of refs.relations)
    if (!old?.relations.has(id))
      need(s.assetRelations[id], tk("core-commands-apply.poster-fields-of.need.9586cf378d30"));
  return {
    productionId: p.id,
    name: f.name.trim(),
    kind: f.kind,
    language: f.language,
    widthMm: Math.round(f.widthMm * 10) / 10,
    heightMm: Math.round(f.heightMm * 10) / 10,
    document: f.document,
  };
}

function continuityFieldsFrom(e: ContinuityEvent): ContinuityEventFields {
  return {
    assetId: e.assetId,
    kind: e.kind,
    description: e.description,
    fromVariantId: e.fromVariantId,
    toVariantId: e.toVariantId,
    duration: e.duration,
    sceneId: e.sceneId,
    blockId: e.blockId,
    untilSceneId: e.untilSceneId,
    status: e.status,
    ...(e.productionId ? { productionId: e.productionId } : {}),
  };
}

/**
 * Når en forekomst får egen scenevariant (ForkVariant) eller går tilbake (angre), følger forekomstens
 * lydkoblinger, tidskoblinger og produksjonssegmenter med til de tilsvarende blokkene (DEC-0057).
 */
function remapOccurrenceBlocks(
  s: ProjectState,
  occurrenceId: string,
  map: Readonly<Record<string, BlockId>>,
): {
  state: Pick<ProjectState, "audioClips" | "timeLinks" | "segments" | "takes">;
  affected: string[];
} {
  const affected: string[] = [];
  // Godkjent grunnlag for forekomstens versjoner (DEC-0054) følger blokkene
  const takes = { ...s.takes };
  for (const t of Object.values(s.takes)) {
    if (t.occurrenceId !== occurrenceId) continue;
    const base = (t.acceptedFrom ?? t.producedFrom).blockRevisions;
    if (!Object.keys(base).some((k) => map[k])) continue;
    const next: Record<string, number> = {};
    for (const [k, v] of Object.entries(base)) next[map[k] ?? k] = v;
    // Tilbake til det opprinnelige grunnlaget (angre): ingen egen godkjenning
    const pf = t.producedFrom.blockRevisions;
    const back =
      Object.keys(next).length === Object.keys(pf).length &&
      Object.entries(next).every(([k, v]) => pf[k] === v);
    const { acceptedFrom: _a, ...rest } = t;
    takes[t.id] = back
      ? { ...rest, revision: t.revision + 1 }
      : { ...t, acceptedFrom: { blockRevisions: next }, revision: t.revision + 1 };
    affected.push(t.id);
  }
  const to = (id: BlockId | null) => (id && map[id] ? map[id]! : id);
  const audioClips = { ...s.audioClips };
  for (const a of Object.values(s.audioClips))
    if (a.occurrenceId === occurrenceId && a.blockId && map[a.blockId]) {
      audioClips[a.id] = { ...a, blockId: to(a.blockId), revision: a.revision + 1 };
      affected.push(a.id);
    }
  const timeLinks = { ...s.timeLinks };
  for (const t of Object.values(s.timeLinks))
    if (t.occurrenceId === occurrenceId && map[t.blockId]) {
      timeLinks[t.id] = { ...t, blockId: to(t.blockId)!, revision: t.revision + 1 };
      affected.push(t.id);
    }
  const segments = { ...s.segments };
  for (const g of Object.values(s.segments))
    if (
      g.occurrenceId === occurrenceId &&
      ((g.startBlockId && map[g.startBlockId]) || (g.endBlockId && map[g.endBlockId]))
    ) {
      segments[g.id] = {
        ...g,
        startBlockId: to(g.startBlockId),
        endBlockId: to(g.endBlockId),
        revision: g.revision + 1,
      };
      affected.push(g.id);
    }
  return { state: { audioClips, timeLinks, segments, takes }, affected };
}

function timeLinkFieldsOf(
  s: ProjectState,
  f: TimeLinkFields,
): Omit<TimeLink, "id" | "revision" | "removed"> {
  if (!f || typeof f !== "object") fail("invalid", tk("core-commands-apply.time-link-fields-of.fail.4a6de2a6f03b"));
  const o = need(s.occurrences[f.occurrenceId], tk("core-commands-apply.o.need.19409a5cc0dd"));
  const b = need(s.blocks[f.blockId], tk("core-commands-apply.b.need.440bfebc27b1.3"));
  if (b.variantId !== o.variantId)
    fail("invalid", tk("core-commands-apply.time-link-fields-of.fail.d840e389ebf5"));
  if (!Number.isInteger(f.startMs) || f.startMs < 0 || f.startMs > AUDIO_MAX_MS)
    fail("invalid", tk("core-commands-apply.time-link-fields-of.fail.f49c25a8d877"));
  if (
    f.endMs !== null &&
    (!Number.isInteger(f.endMs) || f.endMs <= f.startMs || f.endMs > AUDIO_MAX_MS)
  )
    fail(
      "invalid",
      tk("core-commands-apply.time-link-fields-of.fail.f34b6788cf67"),
    );
  let layerId: LayerId | null = null;
  if (f.layerId !== undefined && f.layerId !== null) {
    const l = need(s.layers[f.layerId], tk("core-commands-apply.l.need.80c6bba9c7a0"));
    const comp = compositionOfVariant(s, o.variantId);
    if (!comp || l.compositionId !== comp.id)
      fail(
        "invalid",
        tk("core-commands-apply.time-link-fields-of.fail.e211b20433e8"),
      );
    layerId = l.id;
  }
  return { occurrenceId: o.id, blockId: b.id, startMs: f.startMs, endMs: f.endMs, layerId };
}

/** Filmformater som kan importeres (DEC-0047). */
export const FILM_MIME_TYPES: readonly string[] = ["video/mp4", "video/quicktime", "video/webm"];

/** Kontroll av filinformasjonen for importert film. */
function takeMediaOf(m: unknown): TakeMedia {
  if (!m || typeof m !== "object")
    fail(
      "invalid",
      tk("core-commands-apply.take-media-of.fail.08366892ced8"),
    );
  const x = m as Record<string, unknown>;
  const optPos = (v: unknown, max: number) =>
    v === null || (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max);
  if (
    typeof x["fileName"] !== "string" ||
    x["fileName"].length < 1 ||
    x["fileName"].length > 255 ||
    typeof x["mimeType"] !== "string" ||
    !FILM_MIME_TYPES.includes(x["mimeType"]) ||
    !Number.isInteger(x["byteSize"]) ||
    (x["byteSize"] as number) <= 0 ||
    (x["byteSize"] as number) > ASSET_MAX_BYTES ||
    !optPos(x["width"], 16384) ||
    !optPos(x["height"], 16384) ||
    !optPos(x["fps"], 1000) ||
    !Number.isInteger(x["durationMs"]) ||
    (x["durationMs"] as number) <= 0 ||
    (x["durationMs"] as number) > AUDIO_MAX_MS ||
    !(
      x["videoCodec"] === null ||
      (typeof x["videoCodec"] === "string" && x["videoCodec"].length <= 40)
    ) ||
    typeof x["hasAudio"] !== "boolean"
  )
    fail(
      "invalid",
      tk("core-commands-apply.take-media-of.fail.08366892ced8.2"),
    );
  return {
    fileName: x["fileName"] as string,
    mimeType: x["mimeType"] as string,
    byteSize: x["byteSize"] as number,
    width: x["width"] as number | null,
    height: x["height"] as number | null,
    fps: x["fps"] as number | null,
    durationMs: x["durationMs"] as number,
    videoCodec: x["videoCodec"] as string | null,
    hasAudio: x["hasAudio"] as boolean,
  };
}

/**
 * Fast UUID avledet av to ID-er (KI-33): samme inndata gir alltid samme ID, så en kopi får samme ID ved
 * «gjør om» uten at ID-ene må sendes med. 128 biter fra fire uavhengige 32-biters blandinger (cyrb128).
 */
export function derivedUuid(a: string, b: string): string {
  const str = `${a}:${b}`;
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  const hex = [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, "0")).join("");
  // Versjon 8 (egendefinert) og RFC 4122-variant, så ID-en er en gyldig UUID
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Grunnlaget fra en kommando (gjør om / kopi), med bare gyldige ressursversjoner (REQ-0022). */
function producedFromOf(p: ProducedFrom): ProducedFrom {
  if (!p || typeof p !== "object" || !p.blockRevisions || typeof p.blockRevisions !== "object")
    fail("invalid", tk("core-commands-apply.produced-from-of.fail.eca35c22d122"));
  const av = p.assetVersions;
  if (av === undefined) return { blockRevisions: p.blockRevisions };
  if (
    !av ||
    typeof av !== "object" ||
    Object.entries(av).some(([k, v]) => !isUuid(k) || typeof v !== "string" || !isUuid(v))
  )
    fail("invalid", tk("core-commands-apply.produced-from-of.fail.eca35c22d122.2"));
  return { blockRevisions: p.blockRevisions, assetVersions: av };
}

/** Overgangen regnet om til ny bildefrekvens (KI-48): kutt forblir kutt, ellers 1–MAX bilder. */
function rescaleTransition(t: Transition, frame: (f: number) => number): Transition {
  if (t.kind === "cut") return t;
  return { ...t, frames: Math.min(MAX_TRANSITION_FRAMES, Math.max(1, frame(t.frames))) };
}

/**
 * Lengden til en versjon av scenen med ny bildefrekvens (KI-48): fra filens lengde når den er kjent (som
 * ved import), ellers omregnet. Uten lengde (null) forblir den uten.
 */
function rescaleTakeFrames(t: Take, frame: (f: number) => number, fps: Rational): number | null {
  const ms = t.media?.durationMs;
  if (typeof ms === "number" && Number.isFinite(ms) && ms > 0)
    return Math.max(1, secondsToFrames(ms / 1000, fps));
  if (t.durationFrames === null) return null;
  return t.durationFrames > 0 ? Math.max(1, frame(t.durationFrames)) : t.durationFrames;
}

/** Utdraget regnet om til ny bildefrekvens (KI-48); alltid minst ett bilde langt. */
function rescaleExcerpt(
  e: { readonly inFrame: number; readonly outFrame: number },
  frame: (f: number) => number,
): { inFrame: number; outFrame: number } {
  const inFrame = frame(e.inFrame);
  return { inFrame, outFrame: Math.max(inFrame + 1, frame(e.outFrame)) };
}

function transitionOf(t: unknown): Transition {
  if (!t || typeof t !== "object") fail("invalid", tk("core-commands-apply.transition-of.fail.b9314a81e22e"));
  const x = t as Record<string, unknown>;
  const kind = x["kind"];
  if (!(TRANSITION_KINDS as readonly unknown[]).includes(kind))
    fail("invalid", tk("core-commands-apply.transition-of.fail.b9314a81e22e.2"));
  if (kind === "cut") return { kind: "cut", frames: 0 };
  const frames = x["frames"];
  if (
    !Number.isInteger(frames) ||
    (frames as number) < 1 ||
    (frames as number) > MAX_TRANSITION_FRAMES
  )
    fail(
      "invalid",
      tk("core-commands-apply.transition-of.fail.ccad4abddddf", { MAX_TRANSITION_FRAMES: String(MAX_TRANSITION_FRAMES) }),
    );
  if (x["overlap"] !== undefined && typeof x["overlap"] !== "boolean")
    fail("invalid", tk("core-commands-apply.transition-of.fail.b9314a81e22e.3"));
  return x["overlap"] === true
    ? { kind: kind as TransitionKind, frames: frames as number, overlap: true }
    : { kind: kind as TransitionKind, frames: frames as number };
}

export const AUDIO_KINDS = ["dialogue", "narration", "sfx", "ambience", "music"] as const;

/** Kontroll av et lydklipp (DEC-0044). */
function audioFields(
  s: ProjectState,
  f: AudioClipFields,
): Omit<AudioClipFields, "language" | "speed"> & { language?: string; speed?: number } {
  if (!f || typeof f !== "object") fail("invalid", tk("core-commands-apply.audio-fields.fail.70cc3ca19989"));
  if (!(AUDIO_KINDS as readonly string[]).includes(f.kind))
    fail("invalid", tk("core-commands-apply.audio-fields.fail.6e3ebb531beb"));
  if (typeof f.name !== "string" || f.name.length > 200)
    fail("invalid", tk("core-commands-apply.audio-fields.fail.4d5950ab2ca8"));
  need(s.occurrences[f.occurrenceId], tk("core-commands-apply.audio-fields.need.fe507cf096f2"));
  const asset = need(s.assets[f.assetId], tk("core-commands-apply.asset.need.7974d3050f34"));
  if (asset.kind !== "sound")
    fail("invalid", tk("core-commands-apply.audio-fields.fail.810d98f16a66"));
  if (f.assetVariantId !== null) {
    const va = need(
      s.assetVariants[f.assetVariantId],
      tk("core-commands-apply.va.need.7c3b80f26eaa"),
    );
    if (va.assetId !== f.assetId)
      fail(
        "invalid",
        tk("core-commands-apply.audio-fields.fail.380d3e25beb3"),
      );
  }
  if (f.versionId !== null) {
    const ve = need(s.assetVersions[f.versionId], tk("core-commands-apply.ve.need.6890d7bec134"));
    if (ve.variantId !== f.assetVariantId)
      fail(
        "invalid",
        tk("core-commands-apply.audio-fields.fail.63c138d0981e"),
      );
  }
  if (f.blockId !== null) {
    const b = need(s.blocks[f.blockId], tk("core-commands-apply.b.need.e8b8292ff7bf"));
    const occ = s.occurrences[f.occurrenceId]!;
    if (b.variantId !== occ.variantId)
      fail("invalid", tk("core-commands-apply.audio-fields.fail.da2ad8621dc3"));
  }
  const int = (v: number, lo: number, hi: number, what: string) => {
    if (!Number.isInteger(v) || v < lo || v > hi)
      fail("invalid", tk("core-commands-apply.int.fail.5eff8a5e1065", { what: String(what) }));
  };
  int(f.offsetMs, 0, AUDIO_MAX_MS, tk("core-commands-apply.audio-fields.int.09e40d11a9a7"));
  int(f.sourceInMs, 0, AUDIO_MAX_MS, tk("core-commands-apply.audio-fields.int.b161043690a9"));
  int(f.lengthMs, 1, AUDIO_MAX_MS, tk("core-commands-apply.audio-fields.int.7f7b44687076"));
  int(f.fadeInMs, 0, 600_000, tk("core-commands-apply.audio-fields.int.3b699fb5ccb4"));
  int(f.fadeOutMs, 0, 600_000, tk("core-commands-apply.audio-fields.int.da2be1137279"));
  if (typeof f.gainDb !== "number" || !Number.isFinite(f.gainDb) || f.gainDb < -60 || f.gainDb > 12)
    fail(
      "invalid",
      tk("core-commands-apply.audio-fields.fail.1c0fe6f61acb"),
    );
  if (typeof f.muted !== "boolean") fail("invalid", tk("core-commands-apply.audio-fields.fail.44d9f860b5a2"));
  if (typeof f.continues !== "boolean")
    fail("invalid", tk("core-commands-apply.audio-fields.fail.050b98fa964a"));
  if (!Array.isArray(f.volumeKeys) || f.volumeKeys.length > 500)
    fail("invalid", tk("core-commands-apply.audio-fields.fail.7977cfb5c7c1"));
  const keys = [...f.volumeKeys]
    .map((k) => {
      if (
        !k ||
        !Number.isInteger(k.t) ||
        k.t < 0 ||
        k.t > AUDIO_MAX_MS ||
        typeof k.db !== "number" ||
        !Number.isFinite(k.db) ||
        k.db < -60 ||
        k.db > 12
      )
        fail(
          "invalid",
          tk("core-commands-apply.keys.fail.c42b4b00d246"),
        );
      return { t: k.t, db: Math.round(k.db * 10) / 10 };
    })
    .sort((a, b) => a.t - b.t);
  for (let i = 1; i < keys.length; i++)
    if (keys[i]!.t === keys[i - 1]!.t)
      fail("invalid", tk("core-commands-apply.audio-fields.fail.0d31fbba5efc"));
  // Språk (DEC-0059): språkkode eller «*» (felles); utelatt = standard for lydtypen
  const language = f.language ?? null;
  if (language !== null && language !== "*" && !LANGUAGE_CODE.test(String(language)))
    fail("invalid", tk("core-commands-apply.audio-fields.fail.387c929241d3"));
  // Hastighet (DEC-0079): 25–400 %
  const speed = f.speed ?? 1;
  if (typeof speed !== "number" || !Number.isFinite(speed) || speed < 0.25 || speed > 4)
    fail(
      "invalid",
      tk("core-commands-apply.audio-fields.fail.07dd76d98d3c"),
    );
  const sp = Math.round(speed * 100) / 100;
  return {
    occurrenceId: f.occurrenceId,
    kind: f.kind,
    name: f.name.trim(),
    assetId: f.assetId,
    assetVariantId: f.assetVariantId,
    versionId: f.versionId,
    blockId: f.blockId,
    offsetMs: f.offsetMs,
    sourceInMs: f.sourceInMs,
    lengthMs: f.lengthMs,
    gainDb: Math.round(f.gainDb * 10) / 10,
    fadeInMs: f.fadeInMs,
    fadeOutMs: f.fadeOutMs,
    muted: f.muted,
    continues: f.continues,
    volumeKeys: keys,
    ...(language !== null ? { language } : {}),
    ...(sp !== 1 ? { speed: sp } : {}),
  };
}

/** Språkkode (DEC-0058/0059), f.eks. «nb», «en» eller «en-GB». */
const LANGUAGE_CODE = { test: (v: string) => isScriptLanguageTag(v) };

/**
 * Samlede kommandoer (UpdateSceneDraft, RetimeScene): hver rad som trinnene endrer, skrives én gang per
 * transaksjon, så revisjonen blir opprinnelig revisjon + 1 (1 for nye rader) uansett hvor mange trinn som rører
 * raden. Det samme gjelder inversen. Slik stemmer patchen og baseRevisions med apply_changes.
 */
function oneRevisionPerRow(before: ProjectState, after: ProjectState): ProjectState {
  let out: ProjectState | null = null;
  for (const key of Object.keys(after) as (keyof ProjectState)[]) {
    const a = after[key] as unknown;
    const b = before[key] as unknown;
    if (key === "project" || a === b || !a || typeof a !== "object" || Array.isArray(a)) continue;
    const table = a as Record<string, unknown>;
    const old = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
    let next: Record<string, unknown> | null = null;
    for (const [id, row] of Object.entries(table)) {
      if (row === old[id] || !row || typeof row !== "object") continue;
      const r = row as { revision?: unknown };
      if (typeof r.revision !== "number") continue;
      const prev = old[id] as { revision?: unknown } | undefined;
      const want = prev && typeof prev.revision === "number" ? prev.revision + 1 : 1;
      if (r.revision === want) continue;
      next ??= { ...table };
      next[id] = { ...(row as object), revision: want };
    }
    if (next) {
      out ??= { ...after };
      (out as unknown as Record<string, unknown>)[key] = next;
    }
  }
  return out ?? after;
}

const LEGACY_META = {
  source: "legacy" as const,
  provider: null,
  voiceId: null,
  modelId: null,
  settings: {},
  parentVersionId: null,
};

/** Validerer redigeringen i en lydversjon med samme regler som et lydklipp (DV2). */
function dialogueEditFields(s: ProjectState, a: AudioClip, v: DialogueVersion | null, e: DialogueEdit): DialogueEdit {
  if (!e || typeof e !== "object") fail("invalid", tk("core-commands-apply.dialogue-edit-fields.fail.5bca8c4cdbcf"));
  const f = audioFields(s, {
    ...audioClipFieldsOf(a),
    ...(v ? { assetId: v.assetId as never, assetVariantId: v.assetVariantId as never, versionId: v.assetVersionId as never } : {}),
    sourceInMs: e.sourceInMs,
    lengthMs: e.lengthMs,
    gainDb: e.gainDb,
    fadeInMs: e.fadeInMs,
    fadeOutMs: e.fadeOutMs,
    volumeKeys: e.volumeKeys,
    speed: e.speed,
  });
  const compositionId = e.compositionId ?? null;
  if (compositionId !== null && !s.assetVersions[compositionId]?.composition)
    fail("invalid", tk("core-commands-apply.dialogue-edit-fields.fail.9323205aae09"));
  return { ...editFromAudioFields(f), compositionId };
}

/** Redigeringen i validerte klippfelt. Hastigheten er utelatt når den er 1 – den arves aldri fra klippet. */
function editFromAudioFields(f: AudioClipFields): DialogueEdit {
  return {
    sourceInMs: f.sourceInMs,
    lengthMs: f.lengthMs,
    gainDb: f.gainDb,
    fadeInMs: f.fadeInMs,
    fadeOutMs: f.fadeOutMs,
    volumeKeys: f.volumeKeys,
    speed: f.speed ?? 1,
    compositionId: null,
  };
}

function dialogueVersionFields(s: ProjectState, a: AudioClip, f: DialogueVersionFields): DialogueVersionFields {
  if (!f || typeof f !== "object") fail("invalid", tk("core-commands-apply.dialogue-version-fields.fail.6cde734587a4"));
  if (!DIALOGUE_VERSION_SOURCES.includes(f.source)) fail("invalid", tk("core-commands-apply.dialogue-version-fields.fail.87ffa5735ee9"));
  const file = fileOf(f);
  const asset = s.assets[file.assetId];
  if (!asset || asset.kind !== "sound") fail("invalid", tk("core-commands-apply.dialogue-version-fields.fail.76aee4660193"));
  if (file.assetVariantId !== null && s.assetVariants[file.assetVariantId]?.assetId !== file.assetId)
    fail("invalid", tk("core-commands-apply.dialogue-version-fields.fail.62e6a59a8ce6"));
  if (file.assetVersionId !== null && !s.assetVersions[file.assetVersionId])
    fail("invalid", tk("core-commands-apply.dialogue-version-fields.fail.130c757cad94"));
  const short = (x: unknown, max: number) => (x === null || x === undefined ? null : typeof x === "string" && x.length <= max ? x : fail("invalid", tk("core-commands-apply.short.fail.1999e77cd58e")));
  if (f.settings === null || typeof f.settings !== "object" || Array.isArray(f.settings) || JSON.stringify(f.settings).length > 8192)
    fail("invalid", tk("core-commands-apply.dialogue-version-fields.fail.e8d5f13b47da"));
  if (f.scriptRevision !== null && !(Number.isInteger(f.scriptRevision) && f.scriptRevision > 0))
    fail("invalid", tk("core-commands-apply.dialogue-version-fields.fail.7cc4f8ba4d83"));
  if (f.parentVersionId !== null && s.dialogueVersions[f.parentVersionId]?.clipId !== a.id)
    fail("invalid", tk("core-commands-apply.dialogue-version-fields.fail.145de80d52ce"));
  const edit = dialogueEditFields(s, a, { ...(f as unknown as DialogueVersion) }, f);
  return {
    ...file,
    ...edit,
    source: f.source,
    provider: short(f.provider, 40),
    voiceId: short(f.voiceId, 200),
    modelId: short(f.modelId, 200),
    settings: f.settings,
    scriptRevision: f.scriptRevision,
    parentVersionId: f.parentVersionId,
  };
}

export function audioClipFieldsOf(a: AudioClip): AudioClipFields {
  return {
    occurrenceId: a.occurrenceId,
    kind: a.kind,
    name: a.name,
    assetId: a.assetId,
    assetVariantId: a.assetVariantId,
    versionId: a.versionId,
    blockId: a.blockId,
    offsetMs: a.offsetMs,
    sourceInMs: a.sourceInMs,
    lengthMs: a.lengthMs,
    gainDb: a.gainDb,
    fadeInMs: a.fadeInMs,
    fadeOutMs: a.fadeOutMs,
    muted: a.muted,
    continues: a.continues,
    volumeKeys: a.volumeKeys,
    ...(a.language !== undefined ? { language: a.language } : {}),
    ...(a.speed !== undefined && a.speed !== 1 ? { speed: a.speed } : {}),
  };
}

/** Trinnene en ApplyTemplate kan inneholde (MTS MT4). */
export const TEMPLATE_STEPS: ReadonlySet<string> = new Set<string>([
  "AddTemplateInstance",
  "UndoAddTemplateInstance",
  "UpdateTemplateInstance",
  "AddLayers",
  "UndoAddLayers",
  "UpdateLayers",
  "SetLayersRemoved",
]);

/** Innholdet i en malforekomst (null = gyldig). */
function templateValuesError(s: ProjectState, v: TemplateValues): string | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return tk("core-commands-apply.template-values-error.message.56aea7e68b2d");
  const entries = Object.entries(v);
  if (entries.length > 100) return tk("core-commands-apply.template-values-error.message.b2447a2904d4");
  for (const [k, x] of entries) {
    if (!/^[a-z0-9_-]{1,40}$/.test(k)) return tk("core-commands-apply.template-values-error.message.aef5bdabb282");
    if (x && "text" in x) {
      if (typeof x.text !== "string") return tk("core-commands-apply.template-values-error.message.deb39779b502");
      const n = [...x.text].length;
      if (n > 2000)
        return tk("core-commands-apply.template-values-error.message.fe04c8c76c0f", { n: String(n) });
    } else if (x && "assetId" in x) {
      if (!s.assets[x.assetId]) return tk("core-commands-apply.template-values-error.message.d049960d7801");
      if (x.assetVariantId !== null && s.assetVariants[x.assetVariantId]?.assetId !== x.assetId)
        return tk("core-commands-apply.template-values-error.message.417af66ba338");
    } else return tk("core-commands-apply.template-values-error.message.56aea7e68b2d.2");
  }
  return null;
}

/** Trinnene en RetimeScene kan inneholde (bare tidsendringer i scenen). */
const RETIME_STEPS = new Set<string>([
  "UpdateComposition",
  "UpdateLayers",
  "UpdateAudioClips",
  "SetAudioClipsRemoved",
  "UpdateTimeLinks",
  "SetTransition",
  "SetPlannedDuration",
]);

/** Trinnene et utkast fra Asset Studio kan inneholde (AS1): bare endringer i scenen. */
export const SCENE_DRAFT_STEPS: ReadonlySet<string> = new Set<string>([
  "CreateRig", "SaveRigVersion", "SetRigAnchors", "AttachAnimationUse", "SetAnimationLayerEnabled", "SetAnimationBehavior", "AdoptRigVersion", "UndoAnimationChange",
  "SaveLipsyncResult", "SetLipsyncEnabled", "SetLipsyncOverrides", "SaveAnimationPattern", "RemoveAnimationPattern", "UndoBehaviorChange",
  "UpdateLayers",
  "UpdateAudioClips",
  "UpdateComposition",
]);
/** Største antall trinn i ett utkast. */
export const MAX_SCENE_DRAFT_STEPS = 200;
const RIG_IMPORT_STEPS = new Set(["CreateAssetVariant", "AddAssetVersion", "UndoCreateAssetVariant", "UndoAddAssetVersion"]);

function run(
  s: ProjectState,
  env: CommandEnvelope,
): { state: ProjectState; inverse: Command; affected: string[] } {
  const c = env.command;
  const rev = (e: { revision: number }) => e.revision + 1;
  const newRevision = (blockId: BlockId, revNo: number, text: string): BlockRevision => ({
    blockId,
    rev: revNo,
    text,
    author: env.actor,
    createdAt: env.at,
  });

  switch (c.type) {
    case "SaveMouthSet": case "SaveMouthTrack": case "UndoMouthChange": {
      try { return applyMouthCommand(s, c); } catch (error) { fail("invalid", error instanceof Error ? error.message : tk("ptg4.invalid")); }
    }
    case "SetDialogueLanguage": {
      if (c.language !== null && languageTagError(c.language)) fail("invalid", languageTagError(c.language) ?? "");
      if (c.target === "project") {
        if (c.targetId !== s.project.id) fail("invalid", tk("core-commands-apply.run.fail.e1a4759e48db"));
        const { scriptLanguage: _language, ...base } = s.project;
        const project: ProjectState["project"] = { ...base, ...(c.language ? { scriptLanguage: c.language } : {}), revision: rev(s.project) };
        return { state: { ...s, project }, inverse: { ...c, language: s.project.scriptLanguage ?? null }, affected: [s.project.id] };
      }
      const collection = c.target === "variant" ? "variants" : c.target === "block" || c.target === "blockSpeech" ? "blocks" : c.target === "clip" ? "audioClips" : null;
      if (!collection) fail("invalid", tk("core-commands-apply.run.fail.17428c3d8e68"));
      const rows = s[collection];
      const row = need(rows[c.targetId], tk("core-commands-apply.row.need.6c017b3107eb"));
      if (c.target === "clip" && (row as import("../model").AudioClip).kind !== "dialogue") fail("invalid", tk("core-commands-apply.run.fail.d9d18b49ae4b"));
      const field = c.target === "clip" || c.target === "blockSpeech" ? "speechLanguage" : "scriptLanguage";
      const previous = (row as unknown as Record<string, unknown>)[field] as string | null | undefined;
      const updated = { ...row, [field]: c.language, revision: rev(row) };
      if (c.language === null) delete (updated as unknown as Record<string, unknown>)[field];
      return { state: { ...s, [collection]: { ...rows, [row.id]: updated } }, inverse: { ...c, language: previous ?? null }, affected: [row.id] };
    }
    case "ApplyGeneratedDialogue": {
      // Current version identity deduplicates local repeats; persisted job/change receipts fence replay after undo.
      if (s.assetVersions[c.versionId] || s.dialogueVersions[c.dialogueVersionId]) return { state: s, inverse: { type: "UndoGeneratedDialogue", steps: [] }, affected: [] };
      const info = lineInfo(s, c.occurrenceId, c.blockId);
      const character = s.assets[c.characterId];
      if (!info || !character || character.removed || !["character", "animal", "other"].includes(character.kind)) fail("invalid", tk("core-commands-apply.run.fail.5db779041c90"));
      if (c.metadata.scriptRevision !== s.blocks[c.blockId]?.currentRev) fail("revision_conflict", tk("core-commands-apply.run.fail.ff90fc98972c"));
      if (c.metadata.source !== "ai" || !c.media.durationMs || c.media.durationMs <= 0 || languageTagError(c.language)) fail("invalid", tk("core-commands-apply.run.fail.5c479f557940"));
      let cur = s;
      const inverses: Command[] = [];
      const affected = new Set<string>();
      const execute = (command: Command) => { const result = run(cur, { ...env, command }); const mirrored = mirrorDialogueClips(cur, result.state); cur = mirrored.state; inverses.unshift(result.inverse); [...result.affected, ...mirrored.touched].forEach(id => affected.add(id)); };
      if (!Object.values(cur.compositions).some(comp => !comp.removed && comp.variantId === s.occurrences[c.occurrenceId]?.variantId)) execute({ type: "CreateComposition", compositionId: c.compositionId as never, variantId: s.occurrences[c.occurrenceId]?.variantId as never, fields: { ...DEFAULT_COMPOSITION, width: s.project.frameWidth, height: s.project.frameHeight, durationFrames: Math.max(1, Math.ceil((info.startMs + c.media.durationMs) * s.project.fps.num / s.project.fps.den / 1000)) } });
      execute({ type: "CreateAssets", assets: [{ assetId: c.assetId as never, fields: { kind: "sound", name: info.text.slice(0, 200), names: [], description: "", category: "", tags: [] } }] });
      execute({ type: "CreateAssetVariant", assetId: c.assetId as never, variantId: c.variantId as never, fields: { name: tk("core-commands-apply.name.name.10726b1fac37"), style: "other", appearance: "" } });
      execute({ type: "AddAssetVersion", variantId: c.variantId as never, versionId: c.versionId as never, media: c.media, note: tk("core-commands-apply.note.note.fa29c4b1c5e8") });
      const existing = info.clip;
      const clipId = existing?.id ?? c.clipId;
      if (existing) execute({ type: "AddDialogueVersion", dialogueVersionId: c.dialogueVersionId, clipId: existing.id, activate: true, fields: { assetId: c.assetId, assetVariantId: c.variantId, assetVersionId: c.versionId, sourceInMs: 0, lengthMs: c.media.durationMs, gainDb: 0, fadeInMs: 0, fadeOutMs: 0, volumeKeys: [], speed: 1, compositionId: null, ...c.metadata, parentVersionId: existing.activeVersionId ?? null } });
      else execute({ type: "AddAudioClips", dialogueMeta: c.metadata, clips: [{ clipId: c.clipId as never, fields: { occurrenceId: c.occurrenceId as never, kind: "dialogue", name: info.text.slice(0, 200), assetId: c.assetId as never, assetVariantId: c.variantId as never, versionId: c.versionId as never, blockId: c.blockId as never, offsetMs: info.startMs, sourceInMs: 0, lengthMs: c.media.durationMs, gainDb: 0, fadeInMs: 0, fadeOutMs: 0, muted: false, continues: false, volumeKeys: [] } }] });
      execute({ type: "SetDialogueCharacter", clipIds: [clipId as never], characterAssetId: c.characterId as never });
      if (c.reviewId && !(cur.dialogueReviews ?? {})[c.reviewId]) execute({ type: "ReviewDialogueDrift", reviewId: c.reviewId, clipId, basis: "generated" });
      const clip = cur.audioClips[clipId];
      if (clip && !existing) cur = { ...cur, audioClips: { ...cur.audioClips, [clipId]: { ...clip, placementEstimated: true } } };
      return { state: oneRevisionPerRow(s, cur), inverse: { type: "UndoGeneratedDialogue", steps: inverses }, affected: [...affected] };
    }
    case "UndoGeneratedDialogue": {
      const allowed = new Set(["UndoCreateComposition", "CreateComposition", "UndoCreateAssets", "CreateAssets", "UndoCreateAssetVariant", "CreateAssetVariant", "UndoAddAssetVersion", "AddAssetVersion", "UndoAddAudioClips", "AddAudioClips", "UndoAddDialogueVersion", "AddDialogueVersion", "SetDialogueCharacter", "RestoreDialogueCharacters", "ReviewDialogueDrift", "UndoReviewDialogueDrift"]);
      if (c.steps.length > 20 || c.steps.some(step => !allowed.has(step.type))) fail("invalid", tk("core-commands-apply.run.fail.cea522eeb861"));
      let cur = s; const inverses: Command[] = []; const affected = new Set<string>();
      for (const step of c.steps) { const result = run(cur, { ...env, command: step }); const mirrored = mirrorDialogueClips(cur, result.state); cur = mirrored.state; inverses.unshift(result.inverse); [...result.affected, ...mirrored.touched].forEach(id => affected.add(id)); }
      return { state: oneRevisionPerRow(s, cur), inverse: { type: "UndoGeneratedDialogue", steps: inverses }, affected: [...affected] };
    }
    case "CreateRig": case "SaveRigVersion": case "SetRigAnchors": case "AttachAnimationUse": case "SetAnimationLayerEnabled": case "SetAnimationBehavior": case "AdoptRigVersion": case "UndoAnimationChange": {
      try { return applyRigCommand(s, c); } catch (error) { fail("invalid", error instanceof Error ? error.message : tk("core-commands-apply.run.fail.20f599eed294")); }
    }
    case "SavePrintJob": case "SetPrintJobRemoved": case "RestorePrintJob": {
      try { return applyPrintJobCommand(s, c); } catch (error) { fail("invalid", error instanceof Error ? error.message : tk("print-job.invalid")); }
    }
    case "SaveMeasureSet": case "SetMeasureSetRemoved": case "RestoreMeasureSet": {
      try { return applyMeasureSetCommand(s, c); } catch (error) { fail("invalid", error instanceof Error ? error.message : tk("app-inspect.invalid")); }
    }
    case "AddRigTemplate": case "UpdateRigTemplate": case "SetRigTemplateRemoved": case "AddRigSetup": case "UpdateRigSetup": case "SetRigSetupRemoved": case "ApplySceneRig": case "SetLayerRigPlate": case "UndoMultiplaneRigChange": {
      try { return applyMultiplaneRigCommand(s, c); } catch (error) { fail("invalid", error instanceof Error ? error.message : tk("core-commands-apply.run.fail.20f599eed294")); }
    }
    case "SaveLipsyncResult": case "SetLipsyncEnabled": case "SetLipsyncOverrides": case "SaveAnimationPattern": case "RemoveAnimationPattern": case "UndoBehaviorChange": {
      try { return applyBehaviorCommand(s, c); } catch (error) { fail("invalid", error instanceof Error ? error.message : tk("core-commands-apply.run.fail.84f506950452")); }
    }
    case "CreateProduction": {
      assertNewId(s, c.productionId);
      if (!c.name.trim())
        fail("invalid", tk("core-commands-apply.run.fail.fb833929f383"));
      if (c.kind === "main" && Object.values(s.productions).some((p) => p.kind === "main")) {
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.e834fe833d56"),
        );
      }
      if (c.parentProductionId !== null)
        need(s.productions[c.parentProductionId], tk("core-commands-apply.run.need.5fcbce4639ae"));
      return {
        state: {
          ...s,
          productions: {
            ...s.productions,
            [c.productionId]: {
              id: c.productionId,
              revision: 1,
              kind: c.kind,
              name: c.name.trim(),
              parentProductionId: c.parentProductionId,
              fps: s.project.fps,
            },
          },
        },
        inverse: { type: "UndoCreateProduction", productionId: c.productionId },
        affected: [c.productionId],
      };
    }

    case "UndoCreateProduction": {
      need(s.productions[c.productionId], tk("core-commands-apply.run.need.2b6fa9163f18"));
      if (Object.values(s.occurrences).some((o) => o.productionId === c.productionId)) {
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.c8207819a4b2"),
        );
      }
      if (
        Object.values(s.continuityEvents).some(
          (e) => e.productionId === c.productionId || e.disabledIn?.includes(c.productionId),
        )
      )
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.64bab6ecff30"),
        );
      if (Object.values(s.posters).some((p) => p.productionId === c.productionId))
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.5678053100c4"),
        );
      const { [c.productionId]: _removed, ...productions } = s.productions;
      return {
        state: { ...s, productions },
        inverse: {
          type: "CreateProduction",
          productionId: c.productionId,
          kind: _removed!.kind,
          name: _removed!.name,
          parentProductionId: _removed!.parentProductionId,
        },
        affected: [c.productionId],
      };
    }

    case "SetProductionNote": {
      const p = need(s.productions[c.productionId], tk("core-commands-apply.p.need.83aa7f655d8e.3"));
      if (typeof c.note !== "string") fail("invalid", tk("core-commands-apply.run.fail.24b4ca8f826f"));
      const note = c.note.replace(/\r\n?/g, "\n").trim();
      if (note.length > 2000)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.dffe6b7b50fd"),
        );
      if ((p.note ?? "") === note) fail("invalid", tk("core-commands-apply.run.fail.42404ff62cbc"));
      const { note: _n, ...rest } = p;
      return {
        state: {
          ...s,
          productions: {
            ...s.productions,
            [p.id]: { ...rest, ...(note ? { note } : {}), revision: rev(p) },
          },
        },
        inverse: { type: "SetProductionNote", productionId: p.id, note: p.note ?? "" },
        affected: [p.id],
      };
    }

    case "CreateScene": {
      const production = need(s.productions[c.productionId], tk("core-commands-apply.production.need.029c6cd72e60.2"));
      for (const id of [c.sceneId, c.variantId, c.occurrenceId, ...c.blocks.map((b) => b.blockId)])
        assertNewId(s, id);
      if (new Set(c.blocks.map((b) => b.blockId)).size !== c.blocks.length)
        fail("duplicate_id", tk("core-commands-apply.run.fail.3de4dca7e5fb"));
      assertKey(c.orderKey);
      c.blocks.forEach((b) => assertKey(b.orderKey));
      const owner = production.kind === "main" ? null : production.id;
      const blocks: Record<string, ScriptBlock> = { ...s.blocks };
      const revisions: BlockRevision[] = [...s.blockRevisions];
      for (const b of c.blocks) {
        blocks[b.blockId] = {
          id: b.blockId,
          revision: 1,
          variantId: c.variantId,
          kind: b.kind,
          orderKey: b.orderKey,
          currentRev: 1,
          text: b.text,
          language: PRIMARY_LANGUAGE,
          sourceRef: b.sourceRef ?? null,
          uncertainty: b.uncertainty ?? null,
          removed: b.removed ?? false,
        };
        revisions.push(newRevision(b.blockId, 1, b.text));
      }
      return {
        state: {
          ...s,
          scenes: {
            ...s.scenes,
            [c.sceneId]: {
              id: c.sceneId,
              revision: 1,
              originProductionId: production.id,
              storyTime: (() => {
                const st = c.storyTime ?? {
                  kind: "linear" as const,
                  anchorSceneId: null,
                  offset: 0,
                };
                validStoryTime(s, c.sceneId, st);
                return st;
              })(),
              derivedFromSceneId: null,
              mergedIntoSceneId: null,
            },
          },
          variants: {
            ...s.variants,
            [c.variantId]: {
              id: c.variantId,
              revision: 1,
              sceneId: c.sceneId,
              ownerProductionId: owner,
              basedOnVariantId: null,
              heading: c.heading,
              uncertainty: c.headingUncertainty ?? null,
            },
          },
          blocks,
          blockRevisions: revisions,
          occurrences: {
            ...s.occurrences,
            [c.occurrenceId]: {
              id: c.occurrenceId,
              revision: 1,
              productionId: production.id,
              sceneId: c.sceneId,
              variantId: c.variantId,
              orderKey: c.orderKey,
              active: true,
              excerpt: null,
              activeTakeId: null,
              productionNumber: c.productionNumber ?? null,
              ...(() => {
                const kind = c.kind ?? "scene";
                if (!OCCURRENCE_KINDS.includes(kind))
                  fail("invalid", tk("core-commands-apply.c-occurrence-id.fail.0d1984ba2cad"));
                return kind !== "scene" ? { kind } : {};
              })(),
            },
          },
        },
        inverse: {
          type: "UndoCreateScene",
          sceneId: c.sceneId,
          variantId: c.variantId,
          occurrenceId: c.occurrenceId,
          blockIds: c.blocks.map((b) => b.blockId),
        },
        affected: [c.sceneId, c.variantId, c.occurrenceId, ...c.blocks.map((b) => b.blockId)],
      };
    }

    case "UndoCreateScene": {
      need(s.scenes[c.sceneId], tk("core-commands-apply.run.need.594b13c00857"));
      const otherUse = Object.values(s.occurrences).some(
        (o) => o.sceneId === c.sceneId && o.id !== c.occurrenceId,
      );
      const otherVariants = Object.values(s.variants).some(
        (v) => v.sceneId === c.sceneId && v.id !== c.variantId,
      );
      const hasTakes = Object.values(s.takes).some((t) => t.occurrenceId === c.occurrenceId);
      const hasSegments = Object.values(s.segments).some((g) => g.occurrenceId === c.occurrenceId);
      const referencedByScenes = Object.values(s.scenes).some(
        (x) =>
          x.id !== c.sceneId &&
          (x.mergedIntoSceneId === c.sceneId ||
            x.derivedFromSceneId === c.sceneId ||
            x.storyTime.anchorSceneId === c.sceneId),
      );
      const referencedByStoryLab = storyLabUsesScene(s, c.sceneId);
      if (
        otherUse ||
        otherVariants ||
        hasTakes ||
        hasSegments ||
        referencedByScenes ||
        referencedByStoryLab
      ) {
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.115aa05c487f"),
        );
      }
      const occ = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.occ.need.c74e3e0a72f5"));
      const variant = need(s.variants[c.variantId], tk("core-commands-apply.variant.need.aee0968fe242.2"));
      if (
        occ.sceneId !== c.sceneId ||
        variant.sceneId !== c.sceneId ||
        occ.variantId !== c.variantId
      ) {
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.da11c5bca828"),
        );
      }
      {
        const now = Object.values(s.blocks)
          .filter((b) => b.variantId === c.variantId)
          .map((b) => b.id as string);
        const created = new Set(c.blockIds as readonly string[]);
        if (now.length !== created.size || now.some((id) => !created.has(id))) {
          fail(
            "referenced",
            tk("core-commands-apply.run.fail.4dd0789defd1"),
          );
        }
      }
      const blockList = Object.values(s.blocks).filter((b) => b.variantId === c.variantId);
      const blocks = { ...s.blocks };
      for (const b of blockList) delete blocks[b.id];
      const { [c.sceneId]: scene, ...scenes } = s.scenes;
      const { [c.variantId]: _v, ...variants } = s.variants;
      const { [c.occurrenceId]: _o, ...occurrences } = s.occurrences;
      const ids = new Set(blockList.map((b) => b.id as string));
      return {
        state: {
          ...s,
          scenes,
          variants,
          occurrences,
          blocks,
          blockRevisions: s.blockRevisions.filter((r) => !ids.has(r.blockId)),
        },
        inverse: {
          type: "CreateScene",
          productionId: occ.productionId,
          sceneId: c.sceneId,
          variantId: c.variantId,
          occurrenceId: c.occurrenceId,
          orderKey: occ.orderKey,
          heading: variant.heading,
          blocks: blockList.map((b) => ({
            blockId: b.id,
            kind: b.kind,
            text: b.text,
            orderKey: b.orderKey,
            sourceRef: b.sourceRef,
            uncertainty: b.uncertainty,
            removed: b.removed,
          })),
          storyTime: scene!.storyTime,
          productionNumber: occ.productionNumber,
          headingUncertainty: variant.uncertainty,
        },
        affected: [c.sceneId, c.variantId, c.occurrenceId, ...ids],
      };
    }

    case "MoveOccurrence": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.19409a5cc0dd.2"));
      assertKey(c.orderKey);
      return {
        state: {
          ...s,
          occurrences: {
            ...s.occurrences,
            [o.id]: { ...o, orderKey: c.orderKey, revision: rev(o) },
          },
        },
        inverse: { type: "MoveOccurrence", occurrenceId: o.id, orderKey: o.orderKey },
        affected: [o.id],
      };
    }

    case "SetOccurrenceActive": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.19409a5cc0dd.3"));
      return {
        state: {
          ...s,
          occurrences: { ...s.occurrences, [o.id]: { ...o, active: c.active, revision: rev(o) } },
        },
        inverse: { type: "SetOccurrenceActive", occurrenceId: o.id, active: o.active },
        affected: [o.id],
      };
    }

    case "EditBlockText": {
      const b = need(s.blocks[c.blockId], tk("core-commands-apply.b.need.440bfebc27b1.4"));
      assertCanEditVariant(s, c.productionId, b.variantId);
      if (b.text === c.text) fail("invalid", tk("core-commands-apply.run.fail.58050f840666"));
      const next = b.currentRev + 1;
      return {
        state: {
          ...s,
          blocks: {
            ...s.blocks,
            [b.id]: { ...b, text: c.text, currentRev: next, revision: rev(b) },
          },
          blockRevisions: [...s.blockRevisions, newRevision(b.id, next, c.text)],
        },
        inverse: {
          type: "EditBlockText",
          productionId: c.productionId,
          blockId: b.id,
          text: b.text,
        },
        affected: [b.id],
      };
    }

    case "InsertBlock": {
      assertCanEditVariant(s, c.productionId, c.variantId);
      assertNewId(s, c.block.blockId);
      assertKey(c.block.orderKey);
      if (
        Object.values(s.blocks).some(
          (b) => b.variantId === c.variantId && b.orderKey === c.block.orderKey,
        )
      ) {
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.b69011b4bbf1"),
        );
      }
      return {
        state: {
          ...s,
          blocks: {
            ...s.blocks,
            [c.block.blockId]: {
              id: c.block.blockId,
              revision: 1,
              variantId: c.variantId,
              kind: c.block.kind,
              orderKey: c.block.orderKey,
              currentRev: 1,
              text: c.block.text,
              language: PRIMARY_LANGUAGE,
              sourceRef: c.block.sourceRef ?? null,
              uncertainty: c.block.uncertainty ?? null,
              removed: c.block.removed ?? false,
            },
          },
          blockRevisions: [...s.blockRevisions, newRevision(c.block.blockId, 1, c.block.text)],
        },
        inverse: { type: "UndoInsertBlock", blockId: c.block.blockId },
        affected: [c.block.blockId],
      };
    }

    case "UndoInsertBlock": {
      const b = need(s.blocks[c.blockId], tk("core-commands-apply.b.need.440bfebc27b1.5"));
      if (Object.values(s.segments).some((g) => g.startBlockId === b.id || g.endBlockId === b.id)) {
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.f5c87cd8bb67"),
        );
      }
      const { [b.id]: _b, ...blocks } = s.blocks;
      const owner = s.variants[b.variantId]?.ownerProductionId;
      const ctx = owner ?? Object.values(s.productions).find((p) => p.kind === "main")?.id;
      return {
        state: { ...s, blocks, blockRevisions: s.blockRevisions.filter((r) => r.blockId !== b.id) },
        inverse: {
          type: "InsertBlock",
          productionId: need(ctx, tk("core-commands-apply.production-id.need.10fa86ad944e")),
          variantId: b.variantId,
          block: {
            blockId: b.id,
            kind: b.kind,
            text: b.text,
            orderKey: b.orderKey,
            sourceRef: b.sourceRef,
            uncertainty: b.uncertainty,
            removed: b.removed,
          },
        },
        affected: [b.id],
      };
    }

    case "ForkVariant": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.19409a5cc0dd.4"));
      // Tilbakeføring (DEC-0060): innholdet kopieres fra en annen variant av scenen (spinoffens versjon)
      const source = need(
        s.variants[c.sourceVariantId ?? o.variantId],
        tk("core-commands-apply.source.need.f8ff37fb0b06"),
      );
      if (source.sceneId !== o.sceneId)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.47fdf02d57e3"),
        );
      if (source.ownerProductionId === o.productionId)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.44d56ee9544d"),
        );
      if (c.sourceVariantId && c.sourceVariantId === o.variantId)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.c9c3c91b30b8"),
        );
      assertNewId(s, c.newVariantId);
      const sourceBlocks = Object.values(s.blocks).filter((b) => b.variantId === source.id);
      const blocks = { ...s.blocks };
      const revisions = [...s.blockRevisions];
      // Teksthistorikken følger med (samme revisjonsnumre), så avvikskontroll og «gammel tekst» virker
      // også i den nye versjonen (DEC-0057)
      const history = new Map<string, BlockRevision[]>();
      for (const r of s.blockRevisions) {
        const list = history.get(r.blockId);
        if (list) list.push(r);
        else history.set(r.blockId, [r]);
      }
      for (const b of sourceBlocks) {
        const nid = c.blockIdMap[b.id];
        if (!nid)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.cdc0d4ddaebf"),
          );
        assertNewId(s, nid);
        blocks[nid] = { ...b, id: nid, revision: 1, variantId: c.newVariantId };
        const old = history.get(b.id) ?? [];
        // Historikken kopieres som nye rader skrevet av den som lager versjonen (teksten er den samme)
        if (old.length) for (const r of old) revisions.push(newRevision(nid, r.rev, r.text));
        else revisions.push(newRevision(nid, b.currentRev, b.text));
      }
      if (new Set(Object.values(c.blockIdMap)).size !== sourceBlocks.length)
        fail("invalid", tk("core-commands-apply.run.fail.b34521627676"));
      // Forekomstens koblinger (lyd, tid, segmenter, godkjent grunnlag) følger blokkene. Kommer innholdet fra
      // en annen variant, finnes de tilsvarende blokkene via rekkefølgenøkkelen (samme opphav)
      let occMap: Record<string, BlockId> = { ...c.blockIdMap };
      if (c.sourceVariantId) {
        const byKey = new Map(sourceBlocks.map((b) => [b.orderKey, b]));
        occMap = {};
        for (const b of Object.values(s.blocks)) {
          if (b.variantId !== o.variantId) continue;
          const src = byKey.get(b.orderKey);
          if (src && src.kind === b.kind) occMap[b.id] = c.blockIdMap[src.id]!;
        }
        const own = new Set(
          Object.values(s.blocks)
            .filter((b) => b.variantId === o.variantId)
            .map((b) => b.id as string),
        );
        const lost = (id: string | null) => id !== null && own.has(id) && !occMap[id];
        if (
          Object.values(s.audioClips).some((a) => a.occurrenceId === o.id && lost(a.blockId)) ||
          Object.values(s.timeLinks).some(
            (l) => l.occurrenceId === o.id && !l.removed && lost(l.blockId),
          ) ||
          Object.values(s.segments).some(
            (g) => g.occurrenceId === o.id && (lost(g.startBlockId) || lost(g.endBlockId)),
          )
        )
          fail(
            "referenced",
            tk("core-commands-apply.run.fail.4243a66425b3"),
          );
      }
      const remapped = remapOccurrenceBlocks(s, o.id, occMap);
      // Oversettelsene følger med til den nye versjonen (DEC-0058)
      const translations = { ...s.translations };
      const copied: string[] = [];
      for (const t of Object.values(s.translations)) {
        if (t.removed) continue;
        const onBlock = t.blockId && c.blockIdMap[t.blockId];
        const onHeading = t.variantId === source.id;
        if (!onBlock && !onHeading) continue;
        const nid = c.translationIdMap?.[t.id];
        if (!nid) continue;
        assertNewId(s, nid);
        translations[nid] = {
          ...t,
          id: nid,
          revision: 1,
          blockId: onBlock ? c.blockIdMap[t.blockId!]! : null,
          variantId: onHeading ? c.newVariantId : null,
          // Scenehodet i den nye versjonen har revisjon 1; må det gjennomgås, må det fortsatt det
          basedOnRev: onHeading ? (source.revision > t.basedOnRev ? 0 : 1) : t.basedOnRev,
        };
        copied.push(nid);
      }
      // Notatene følger med til den nye versjonen, som oversettelsene (KI-33): notater på teksten til de
      // nye blokkene og nåler på scenen til den nye varianten. Originalene blir stående
      const annotations = { ...s.annotations };
      const annotationCopies: Record<string, AnnotationId> = {};
      for (const a of Object.values(s.annotations)) {
        if (a.removed) continue;
        const onBlock = a.blockId ? c.blockIdMap[a.blockId] : undefined;
        const onScene = a.variantId === source.id;
        if (!onBlock && !onScene) continue;
        const nid = c.annotationIdMap
          ? c.annotationIdMap[a.id]
          : (derivedUuid(c.newVariantId, a.id) as AnnotationId);
        if (!nid) continue;
        assertNewId(s, nid);
        if (annotations[nid])
          fail("duplicate_id", tk("core-commands-apply.run.fail.26ae31147a2b"));
        annotations[nid] = {
          ...a,
          id: nid,
          revision: 1,
          blockId: onBlock ?? null,
          variantId: onBlock ? null : c.newVariantId,
        };
        annotationCopies[a.id] = nid;
        copied.push(nid);
      }
      return {
        state: {
          ...s,
          ...remapped.state,
          translations,
          annotations,
          variants: {
            ...s.variants,
            [c.newVariantId]: {
              id: c.newVariantId,
              revision: 1,
              sceneId: source.sceneId,
              // Hovedfilmens versjoner deles (null), så spinoffer kan gjenbruke dem (DEC-0060)
              ownerProductionId:
                s.productions[o.productionId]?.kind === "main" ? null : o.productionId,
              basedOnVariantId: source.id,
              heading: source.heading,
              uncertainty: source.uncertainty,
            },
          },
          blocks,
          blockRevisions: revisions,
          occurrences: {
            ...s.occurrences,
            [o.id]: { ...o, variantId: c.newVariantId, revision: rev(o) },
          },
        },
        inverse: {
          type: "UndoForkVariant",
          occurrenceId: o.id,
          previousVariantId: o.variantId,
          newVariantId: c.newVariantId,
          ...(c.sourceVariantId ? { sourceVariantId: c.sourceVariantId } : {}),
          // Hvilke notater som er kopier av hvilke (KI-33), så angre finner dem uten å sammenligne innhold
          ...(Object.keys(annotationCopies).length ? { annotationIdMap: annotationCopies } : {}),
        },
        affected: [
          c.newVariantId,
          o.id,
          ...Object.values(c.blockIdMap),
          ...remapped.affected,
          ...copied,
        ],
      };
    }

    case "UndoForkVariant": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.19409a5cc0dd.5"));
      const nv = need(s.variants[c.newVariantId], tk("core-commands-apply.nv.need.871ccc028013"));
      need(s.variants[c.previousVariantId], tk("core-commands-apply.run.need.4d338280178d"));
      if (o.variantId !== nv.id)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.12b93d4f8422"),
        );
      if (Object.values(s.occurrences).some((x) => x.variantId === nv.id && x.id !== o.id))
        fail("referenced", tk("core-commands-apply.run.fail.9d626dbeeab2"));
      const forked = Object.values(s.blocks).filter((b) => b.variantId === nv.id);
      // Innholdet kom fra kilden (ved tilbakeføring spinoffens versjon, ellers den forrige varianten)
      const contentId = c.sourceVariantId ?? c.previousVariantId;
      need(s.variants[contentId], tk("core-commands-apply.run.need.ab5b93958552"));
      const original = Object.values(s.blocks).filter((b) => b.variantId === contentId);
      // Kan angres når innholdet er som i originalen (endringer som er angret, teller ikke)
      const byKey = new Map(original.map((b) => [b.orderKey, b]));
      // Ved tilbakeføring kan spinoffens versjon ha blitt endret etterpå: da avgjør revisjonen at kopien
      // ikke er endret siden (alle endringer øker revisjonen), ikke likhet med kilden (DEC-0060)
      const same = c.sourceVariantId
        ? nv.revision === 1 && forked.every((b) => b.revision === 1 && byKey.has(b.orderKey))
        : forked.length === original.length &&
          forked.every((b) => {
            const src = byKey.get(b.orderKey);
            return !!src && src.text === b.text && src.kind === b.kind && src.removed === b.removed;
          });
      if (!same)
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.eb82939b85c5"),
        );
      if (Object.values(s.compositions).some((x) => x.variantId === nv.id))
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.ef58bb901e3a"),
        );
      // Oversettelser i den egne versjonen: kan angres når de er kopier av originalens
      const toSource = new Map<string, string>();
      for (const b of forked) {
        const src = byKey.get(b.orderKey);
        if (src) toSource.set(b.id, src.id);
      }
      toSource.set(nv.id, contentId);
      const translationIdMap: Record<string, TranslationId> = {};
      const dropTranslations: string[] = [];
      for (const t of Object.values(s.translations)) {
        const target = t.blockId ?? t.variantId;
        if (!target || !toSource.has(target)) continue;
        dropTranslations.push(t.id);
        if (t.removed) continue;
        const srcTarget = toSource.get(target)!;
        if (c.sourceVariantId) {
          // Kopi som ikke er endret siden (revisjon 1); kilden kan være endret etterpå
          if (t.revision !== 1)
            fail(
              "referenced",
              tk("core-commands-apply.run.fail.3f074ef03872"),
            );
          const orig = Object.values(s.translations).find(
            (x) =>
              !x.removed && (x.blockId ?? x.variantId) === srcTarget && x.language === t.language,
          );
          if (orig) translationIdMap[orig.id] = t.id;
          continue;
        }
        const orig = Object.values(s.translations).find(
          (x) =>
            !x.removed &&
            (x.blockId ?? x.variantId) === srcTarget &&
            x.language === t.language &&
            x.text === t.text,
        );
        if (!orig)
          fail(
            "referenced",
            tk("core-commands-apply.run.fail.3f074ef03872.2"),
          );
        translationIdMap[orig.id] = t.id;
      }
      // Notater i den egne versjonen (KI-33): kan angres når de er uendrede kopier (revisjon 1) av originalens.
      // Kopien finnes ut fra ID-en (kartet fra ForkVariant, ellers den avledede ID-en), ikke fra innholdet:
      // originalen kan være endret etterpå, og like notater må ikke slås sammen
      const copyOf = new Map<string, string>();
      if (c.annotationIdMap)
        for (const [origId, copyId] of Object.entries(c.annotationIdMap))
          copyOf.set(copyId, origId);
      else for (const x of Object.values(s.annotations)) copyOf.set(derivedUuid(nv.id, x.id), x.id);
      const annotationIdMap: Record<string, AnnotationId> = {};
      const dropAnnotations: string[] = [];
      for (const a of Object.values(s.annotations)) {
        const target = a.blockId ?? a.variantId;
        if (!target || !toSource.has(target)) continue;
        dropAnnotations.push(a.id);
        if (a.removed) continue;
        const origId = a.revision === 1 ? copyOf.get(a.id) : undefined;
        const orig = origId !== undefined ? s.annotations[origId] : undefined;
        if (!orig)
          fail(
            "referenced",
            tk("core-commands-apply.run.fail.8cf6dd892be3"),
          );
        annotationIdMap[orig.id] = a.id as AnnotationId;
      }
      const ids = new Set(forked.map((b) => b.id as string));
      const blocks = { ...s.blocks };
      for (const id of ids) delete blocks[id];
      const { [nv.id]: _nv, ...variants } = s.variants;
      // Gjenskap blokk-kartet for inversen (kilde → ny) og koblingene tilbake (ny → forrige variant)
      const map: Record<string, BlockId> = {};
      for (const b of forked) {
        const src = byKey.get(b.orderKey);
        if (src) map[src.id] = b.id;
      }
      const prevByKey = new Map(
        Object.values(s.blocks)
          .filter((b) => b.variantId === c.previousVariantId)
          .map((b) => [b.orderKey, b]),
      );
      const back: Record<string, BlockId> = {};
      for (const b of forked) {
        const p = prevByKey.get(b.orderKey);
        if (p && p.kind === b.kind) back[b.id] = p.id;
      }
      const stranded = (id: string | null) => id !== null && ids.has(id) && !back[id];
      if (
        Object.values(s.audioClips).some((a) => a.occurrenceId === o.id && stranded(a.blockId)) ||
        Object.values(s.timeLinks).some((l) => l.occurrenceId === o.id && stranded(l.blockId)) ||
        Object.values(s.segments).some(
          (g) => g.occurrenceId === o.id && (stranded(g.startBlockId) || stranded(g.endBlockId)),
        )
      )
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.ce1c9815ef21"),
        );
      const remapped = remapOccurrenceBlocks(s, o.id, back);
      const translations = { ...s.translations };
      for (const id of dropTranslations) delete translations[id];
      const annotations = { ...s.annotations };
      for (const id of dropAnnotations) delete annotations[id];
      return {
        state: {
          ...s,
          ...remapped.state,
          translations,
          annotations,
          variants,
          blocks,
          blockRevisions: s.blockRevisions.filter((r) => !ids.has(r.blockId)),
          occurrences: {
            ...s.occurrences,
            [o.id]: { ...o, variantId: c.previousVariantId, revision: rev(o) },
          },
        },
        inverse: {
          type: "ForkVariant",
          occurrenceId: o.id,
          newVariantId: nv.id,
          blockIdMap: map,
          ...(Object.keys(translationIdMap).length ? { translationIdMap } : {}),
          // Alltid med (også tomt), så gjør om kopierer nøyaktig de samme notatene
          annotationIdMap,
          ...(c.sourceVariantId ? { sourceVariantId: c.sourceVariantId } : {}),
        },
        affected: [
          nv.id,
          o.id,
          ...ids,
          ...remapped.affected,
          ...dropTranslations,
          ...dropAnnotations,
        ],
      };
    }

    case "TransferScene": {
      const production = need(s.productions[c.productionId], tk("core-commands-apply.production.need.029c6cd72e60.3"));
      const source = need(s.variants[c.sourceVariantId], tk("core-commands-apply.source.need.f8ff37fb0b06.2"));
      if (source.ownerProductionId === null || source.ownerProductionId === c.productionId)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.2608e912fc62"),
        );
      if (
        Object.values(s.occurrences).some(
          (o) => o.productionId === c.productionId && o.sceneId === source.sceneId,
        )
      )
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.532eb0bc510e", { name: String(production.name) }),
        );
      assertNewId(s, c.occurrenceId);
      assertKey(c.orderKey);
      // Forekomsten peker først på spinoffens versjon; ForkVariant gir den en egen kopi med en gang
      const staged: ProjectState = {
        ...s,
        occurrences: {
          ...s.occurrences,
          [c.occurrenceId]: {
            id: c.occurrenceId,
            revision: 0,
            productionId: c.productionId,
            sceneId: source.sceneId,
            variantId: source.id,
            orderKey: c.orderKey,
            active: true,
            excerpt: null,
            activeTakeId: null,
            productionNumber: null,
          },
        },
      };
      const forked = run(staged, {
        ...env,
        command: {
          type: "ForkVariant",
          occurrenceId: c.occurrenceId,
          newVariantId: c.newVariantId,
          blockIdMap: c.blockIdMap,
          ...(c.translationIdMap ? { translationIdMap: c.translationIdMap } : {}),
        },
      });
      const occ = forked.state.occurrences[c.occurrenceId]!;
      return {
        state: {
          ...forked.state,
          occurrences: { ...forked.state.occurrences, [occ.id]: { ...occ, revision: 1 } },
        },
        inverse: {
          type: "UndoTransferScene",
          occurrenceId: c.occurrenceId,
          sourceVariantId: source.id,
          newVariantId: c.newVariantId,
        },
        affected: forked.affected,
      };
    }

    case "UndoTransferScene": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.19409a5cc0dd.6"));
      // Tidskoblinger som er fjernet (angret i samme gruppe), slettes sammen med forekomsten
      const deadLinks = Object.values(s.timeLinks).filter(
        (l) => l.occurrenceId === o.id && l.removed,
      );
      if (
        Object.values(s.takes).some((t) => t.occurrenceId === o.id) ||
        Object.values(s.segments).some((g) => g.occurrenceId === o.id) ||
        Object.values(s.audioClips).some((a) => a.occurrenceId === o.id) ||
        Object.values(s.timeLinks).some((l) => l.occurrenceId === o.id && !l.removed) ||
        Object.values(s.clipParts).some((p) => p.occurrenceId === o.id) ||
        Object.values(s.generationPrompts).some((g) => g.occurrenceId === o.id)
      )
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.6e014f819615"),
        );
      const undone = run(s, {
        ...env,
        command: {
          type: "UndoForkVariant",
          occurrenceId: o.id,
          previousVariantId: c.sourceVariantId,
          newVariantId: c.newVariantId,
          // Spinoffens versjon kan være endret etter overføringen
          sourceVariantId: c.sourceVariantId,
        },
      });
      const inv = undone.inverse as Extract<Command, { type: "ForkVariant" }>;
      const { [o.id]: _o, ...occurrences } = undone.state.occurrences;
      const timeLinks = { ...undone.state.timeLinks };
      for (const l of deadLinks) delete timeLinks[l.id];
      return {
        state: { ...undone.state, occurrences, timeLinks },
        inverse: {
          type: "TransferScene",
          productionId: o.productionId,
          occurrenceId: o.id,
          orderKey: o.orderKey,
          sourceVariantId: c.sourceVariantId,
          newVariantId: c.newVariantId,
          blockIdMap: inv.blockIdMap,
          ...(inv.translationIdMap ? { translationIdMap: inv.translationIdMap } : {}),
        },
        affected: [...undone.affected, ...deadLinks.map((l) => l.id)],
      };
    }

    case "AddOccurrence": {
      need(s.productions[c.productionId], tk("core-commands-apply.run.need.2b6fa9163f18.2"));
      const scene = need(s.scenes[c.sceneId], tk("core-commands-apply.scene.need.89e5e8c309f1.2"));
      const variant = need(s.variants[c.variantId], tk("core-commands-apply.variant.need.aee0968fe242.3"));
      if (variant.sceneId !== scene.id)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.47fdf02d57e3.2"),
        );
      if (variant.ownerProductionId !== null && variant.ownerProductionId !== c.productionId) {
        fail(
          "must_fork_variant",
          tk("core-commands-apply.run.fail.bf6e299735f5"),
        );
      }
      assertNewId(s, c.occurrenceId);
      assertKey(c.orderKey);
      // Scenetypen (MTS MT6): utelatt/«scene» = vanlig manusscene
      const kind = c.kind ?? "scene";
      if (!OCCURRENCE_KINDS.includes(kind))
        fail("invalid", tk("core-commands-apply.run.fail.c90237d1bece"));
      return {
        state: {
          ...s,
          occurrences: {
            ...s.occurrences,
            [c.occurrenceId]: {
              id: c.occurrenceId,
              revision: 1,
              productionId: c.productionId,
              sceneId: c.sceneId,
              variantId: c.variantId,
              orderKey: c.orderKey,
              active: true,
              excerpt: null,
              activeTakeId: null,
              productionNumber: null,
              ...(kind !== "scene" ? { kind } : {}),
            },
          },
        },
        inverse: { type: "UndoAddOccurrence", occurrenceId: c.occurrenceId },
        affected: [c.occurrenceId],
      };
    }

    case "UndoAddOccurrence": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.19409a5cc0dd.7"));
      if (
        Object.values(s.takes).some((t) => t.occurrenceId === o.id) ||
        Object.values(s.segments).some((g) => g.occurrenceId === o.id)
      ) {
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.f57101b8ab6d"),
        );
      }
      if (Object.values(s.occurrences).filter((x) => x.sceneId === o.sceneId).length <= 1) {
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.e6c4d2321157"),
        );
      }
      const { [o.id]: _o, ...occurrences } = s.occurrences;
      return {
        state: { ...s, occurrences },
        inverse: {
          type: "AddOccurrence",
          productionId: o.productionId,
          occurrenceId: o.id,
          sceneId: o.sceneId,
          variantId: o.variantId,
          orderKey: o.orderKey,
          ...(o.kind && o.kind !== "scene" ? { kind: o.kind } : {}),
        },
        affected: [o.id],
      };
    }

    case "AddCreditParticipant": {
      assertNewId(s, c.participantId);
      const count = Object.values(s.creditParticipants).filter((p) => !p.removed).length;
      if (count >= CREDIT_PARTICIPANTS_MAX)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.30e0bbf0560c", { CREDIT_PARTICIPANTS_MAX: String(CREDIT_PARTICIPANTS_MAX) }),
        );
      const err = creditParticipantError({ orderKey: c.fields.orderKey, groupKey: c.fields.groupKey, fields: c.fields.fields });
      if (err) fail("invalid", err);
      assertKey(c.fields.orderKey);
      const p: import("../model").CreditParticipant = {
        id: c.participantId,
        revision: 1,
        orderKey: c.fields.orderKey,
        groupKey: c.fields.groupKey,
        hidden: c.fields.hidden === true,
        fields: c.fields.fields,
        logoAssetId: c.fields.logoAssetId ?? null,
        logoVersionId: c.fields.logoVersionId ?? null,
        imageAssetId: c.fields.imageAssetId ?? null,
        imageVersionId: c.fields.imageVersionId ?? null,
        removed: false,
      };
      return {
        state: { ...s, creditParticipants: { ...s.creditParticipants, [p.id]: p } },
        inverse: { type: "RemoveCreditParticipant", participantId: p.id },
        affected: [p.id],
      };
    }

    case "UpdateCreditParticipant": {
      const p = need(s.creditParticipants[c.participantId], tk("core-commands-apply.p.need.9afc95de1625"));
      const next = {
        orderKey: c.fields.orderKey ?? p.orderKey,
        groupKey: c.fields.groupKey ?? p.groupKey,
        fields: c.fields.fields ?? p.fields,
      };
      const err = creditParticipantError(next);
      if (err) fail("invalid", err);
      if (c.fields.orderKey !== undefined) assertKey(c.fields.orderKey);
      const updated: import("../model").CreditParticipant = {
        ...p,
        orderKey: next.orderKey,
        groupKey: next.groupKey,
        hidden: c.fields.hidden ?? p.hidden,
        fields: next.fields,
        logoAssetId: c.fields.logoAssetId === undefined ? p.logoAssetId : c.fields.logoAssetId,
        logoVersionId: c.fields.logoVersionId === undefined ? p.logoVersionId : c.fields.logoVersionId,
        imageAssetId: c.fields.imageAssetId === undefined ? p.imageAssetId : c.fields.imageAssetId,
        imageVersionId: c.fields.imageVersionId === undefined ? p.imageVersionId : c.fields.imageVersionId,
        revision: rev(p),
      };
      const inverseFields: Record<string, unknown> = {};
      for (const k of Object.keys(c.fields)) inverseFields[k] = p[k as keyof typeof p] ?? null;
      return {
        state: { ...s, creditParticipants: { ...s.creditParticipants, [p.id]: updated } },
        inverse: { type: "UpdateCreditParticipant", participantId: p.id, fields: inverseFields },
        affected: [p.id],
      };
    }

    case "RemoveCreditParticipant": {
      const p = need(s.creditParticipants[c.participantId], tk("core-commands-apply.p.need.9afc95de1625.2"));
      if (p.removed) fail("invalid", tk("core-commands-apply.run.fail.649437ba0bb1"));
      return {
        state: {
          ...s,
          creditParticipants: { ...s.creditParticipants, [p.id]: { ...p, removed: true, revision: rev(p) } },
        },
        inverse: {
          type: "AddCreditParticipant",
          participantId: p.id,
          fields: {
            orderKey: p.orderKey,
            groupKey: p.groupKey,
            hidden: p.hidden,
            fields: p.fields,
            logoAssetId: p.logoAssetId ?? null,
            logoVersionId: p.logoVersionId ?? null,
            imageAssetId: p.imageAssetId ?? null,
            imageVersionId: p.imageVersionId ?? null,
          },
        },
        affected: [p.id],
      };
    }

    case "SetCreditSequence": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.19409a5cc0dd.8"));
      if (occurrenceKind(o) !== "credits")
        fail("invalid", tk("core-commands-apply.run.fail.0e8b3d5fb382"));
      const err = creditSequenceError(c.fields);
      if (err) fail("invalid", err);
      const existing = Object.values(s.creditSequences).find(
        (q) => q.occurrenceId === o.id && !q.removed,
      );
      if (existing && existing.id !== c.sequenceId)
        fail("invalid", tk("core-commands-apply.run.fail.b68db90b4809"));
      const prev = s.creditSequences[c.sequenceId];
      const seq: import("../model").CreditSequence = {
        id: c.sequenceId,
        revision: prev ? rev(prev) : 1,
        occurrenceId: o.id,
        presentation: c.fields.presentation,
        durationFrames: c.fields.durationFrames,
        pauseFrames: c.fields.pauseFrames,
        transition: c.fields.transition ?? null,
        speed: c.fields.speed,
        direction: c.fields.direction,
        ...(c.fields.groupTemplates ? { groupTemplates: c.fields.groupTemplates } : {}),
        removed: false,
      };
      return {
        state: { ...s, creditSequences: { ...s.creditSequences, [seq.id]: seq } },
        inverse: prev
          ? {
              type: "SetCreditSequence",
              sequenceId: prev.id,
              occurrenceId: prev.occurrenceId,
              fields: {
                presentation: prev.presentation,
                durationFrames: prev.durationFrames,
                pauseFrames: prev.pauseFrames,
                transition: prev.transition ?? null,
                speed: prev.speed,
                direction: prev.direction,
                ...(prev.groupTemplates ? { groupTemplates: prev.groupTemplates } : {}),
              },
            }
          : // Angre av opprettelse: sekvensen fjernes (removed = true)
            { type: "RemoveCreditSequence", sequenceId: seq.id },
        affected: [seq.id],
      };
    }

    case "RemoveCreditSequence": {
      const q = need(s.creditSequences[c.sequenceId], tk("core-commands-apply.q.need.c20cd198d6e4"));
      if (q.removed) fail("invalid", tk("core-commands-apply.run.fail.d7e940bc1191"));
      return {
        state: {
          ...s,
          creditSequences: { ...s.creditSequences, [q.id]: { ...q, removed: true, revision: rev(q) } },
        },
        inverse: {
          type: "SetCreditSequence",
          sequenceId: q.id,
          occurrenceId: q.occurrenceId,
          fields: {
            presentation: q.presentation,
            durationFrames: q.durationFrames,
            pauseFrames: q.pauseFrames,
            transition: q.transition ?? null,
            speed: q.speed,
            direction: q.direction,
            ...(q.groupTemplates ? { groupTemplates: q.groupTemplates } : {}),
          },
        },
        affected: [q.id],
      };
    }

    case "CreateSegments": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.19409a5cc0dd.9"));
      if (c.segments.length === 0)
        fail("invalid", tk("core-commands-apply.run.fail.6ac3eba406a5"));
      const segments = { ...s.segments };
      for (const g of c.segments) {
        assertNewId(s, g.segmentId);
        assertKey(g.orderKey);
        for (const bid of [g.startBlockId, g.endBlockId]) {
          if (bid !== null) {
            const b = need(s.blocks[bid], tk("core-commands-apply.b.need.e4b7085bbc3f.2"));
            if (b.variantId !== o.variantId)
              fail(
                "invalid",
                tk("core-commands-apply.run.fail.392651f69596"),
              );
          }
        }
        segments[g.segmentId] = {
          id: g.segmentId,
          revision: 1,
          occurrenceId: o.id,
          reason: c.reason,
          orderKey: g.orderKey,
          startBlockId: g.startBlockId,
          endBlockId: g.endBlockId,
        };
      }
      return {
        state: { ...s, segments },
        inverse: { type: "UndoCreateSegments", segmentIds: c.segments.map((g) => g.segmentId) },
        affected: c.segments.map((g) => g.segmentId),
      };
    }

    case "UndoCreateSegments": {
      const list = c.segmentIds.map((id) => need(s.segments[id], tk("core-commands-apply.list.need.1eeed154fa5d")));
      const ids = new Set(c.segmentIds as readonly string[]);
      if (Object.values(s.takes).some((t) => t.segmentId !== null && ids.has(t.segmentId))) {
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.ec88f2a854ad"),
        );
      }
      if (Object.values(s.generationPrompts).some((p) => ids.has(p.segmentId) && !p.removed))
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.7152eaeaa9f6"),
        );
      const segments = { ...s.segments };
      for (const id of ids) delete segments[id];
      // Tilbakestilte beskrivelser forsvinner med segmentet (DEC-0053)
      const generationPrompts = { ...s.generationPrompts };
      for (const p of Object.values(s.generationPrompts))
        if (ids.has(p.segmentId)) delete generationPrompts[p.id];
      const first = list[0]!;
      return {
        state: { ...s, segments, generationPrompts },
        inverse: {
          type: "CreateSegments",
          occurrenceId: first.occurrenceId,
          reason: first.reason,
          segments: list.map((g) => ({
            segmentId: g.id,
            orderKey: g.orderKey,
            startBlockId: g.startBlockId,
            endBlockId: g.endBlockId,
          })),
        },
        affected: [...ids],
      };
    }

    case "AddTake": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.19409a5cc0dd.10"));
      assertNewId(s, c.takeId);
      if (c.segmentId !== null) {
        const g = need(s.segments[c.segmentId], tk("core-commands-apply.g.need.31cdb75fe74f"));
        if (g.occurrenceId !== o.id)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.c631839d8b25"),
          );
      }
      if (
        c.durationFrames !== null &&
        (!Number.isInteger(c.durationFrames) || c.durationFrames < 0)
      ) {
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.2c6997c9e8ab"),
        );
      }
      // Filen må ligge i prosjektets egen mappe (ellers kunne sletting av prosjektet nå andres filer)
      if (
        c.mediaRef !== null &&
        (typeof c.mediaRef !== "string" ||
          c.mediaRef.length > 600 ||
          !c.mediaRef.startsWith(`${s.project.id}/`) ||
          c.mediaRef.includes(".."))
      )
        fail("invalid", tk("core-commands-apply.run.fail.f2fb32b26d93"));
      if (c.media !== undefined && c.kind !== "imported_film" && c.kind !== "ai_video")
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.6ee639bc8f58"),
        );
      // Stillbilde (DEC-0072): et bilde fra biblioteket i dette prosjektet, med varighet
      if (c.kind === "still" && c.mediaRef !== null) {
        const v = Object.values(s.assetVersions).find((x) => x.mediaPath === c.mediaRef);
        if (!v || !STILL_MIME_TYPES.includes(v.mimeType))
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.1f06e5896fb1"),
          );
        if (!c.durationFrames || c.durationFrames > STILL_MAX_FRAMES)
          fail("invalid", tk("core-commands-apply.run.fail.9b77f16847d8"));
      }
      const media = c.media === undefined ? undefined : takeMediaOf(c.media);
      const draft: Take = {
        id: c.takeId,
        revision: 1,
        occurrenceId: o.id,
        segmentId: c.segmentId,
        kind: c.kind,
        status: c.status,
        durationFrames: c.durationFrames,
        producedFrom: { blockRevisions: currentBlockRevisions(s, o.variantId) },
        mediaRef: c.mediaRef,
        ...(media ? { media } : {}),
      };
      // Ressursversjonene materialet lages fra (REQ-0022); producedFrom er uforanderlig etterpå (INV-07)
      const assetVersions = takeAssetVersions(s, draft);
      const take: Take = assetVersions
        ? { ...draft, producedFrom: { ...draft.producedFrom, assetVersions } }
        : draft;
      return {
        state: { ...s, takes: { ...s.takes, [take.id]: take } },
        // Produsert materiale kastes aldri (INV-07, 21.5). Angre av «legg til» betyr bare at den ikke er aktiv.
        inverse: { type: "SetActiveTake", occurrenceId: o.id, takeId: o.activeTakeId },
        affected: [take.id],
      };
    }

    case "SetTransition": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.19409a5cc0dd.11"));
      const t = c.transition === null ? null : transitionOf(c.transition);
      const prev: Transition | null = o.transition ?? null;
      const { transition: _old, ...rest } = o;
      const next = t === null ? rest : { ...rest, transition: t };
      return {
        state: {
          ...s,
          occurrences: { ...s.occurrences, [o.id]: { ...next, revision: rev(o) } },
        },
        inverse: { type: "SetTransition", occurrenceId: o.id, transition: prev },
        affected: [o.id],
      };
    }

    case "SetDefaultTransition": {
      const t = c.transition === null ? null : transitionOf(c.transition);
      const prev: Transition | null = s.project.defaultTransition ?? null;
      const { defaultTransition: _old, ...rest } = s.project;
      const project = t === null || t.kind === "cut" ? rest : { ...rest, defaultTransition: t };
      return {
        state: { ...s, project: { ...project, revision: s.project.revision + 1 } },
        inverse: { type: "SetDefaultTransition", transition: prev },
        affected: [s.project.id],
      };
    }

    case "SetInterchangeSettings": {
      if (!projectCodeValid(c.code) || !captureSettingsValid(c.capture)) fail("invalid", tk("ptg1.invalid-settings"));
      return { state: { ...s, project: { ...s.project, code: c.code, capture: c.capture, revision: rev(s.project) } },
        inverse: { type: "SetInterchangeSettings", code: s.project.code ?? null, capture: s.project.capture ?? DEFAULT_CAPTURE }, affected: [s.project.id] };
    }

    case "SetAiBudget": {
      const lim = c.monthLimit;
      const price = c.pricePerImage;
      if (lim !== null && (!Number.isInteger(lim) || lim < 0 || lim > 100000))
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.ba159a047797"),
        );
      if (price !== null && (!Number.isFinite(price) || price < 0 || price > 100000))
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.dd1b7b817053"),
        );
      const { aiMonthLimit: oldLim, aiPricePerImage: oldPrice, ...rest } = s.project;
      const project = {
        ...rest,
        ...(lim !== null ? { aiMonthLimit: lim } : {}),
        ...(price !== null ? { aiPricePerImage: Math.round(price * 100) / 100 } : {}),
        revision: s.project.revision + 1,
      };
      return {
        state: { ...s, project },
        inverse: {
          type: "SetAiBudget",
          monthLimit: oldLim ?? null,
          pricePerImage: oldPrice ?? null,
        },
        affected: [s.project.id],
      };
    }

    case "SetGenerationPrompt": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.6a267a80d65f"));
      const seg = need(s.segments[c.segmentId], tk("core-commands-apply.seg.need.6fcf7559c02b"));
      if (seg.occurrenceId !== o.id)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.7b7cc38ea941"),
        );
      if (typeof c.basedOn !== "string" || c.basedOn.length > MAX_PROMPT_CHARS)
        fail("invalid", tk("core-commands-apply.run.fail.8077964197e3"));
      const text = c.text === null ? null : c.text.trim();
      if (text !== null && (text.length === 0 || text.length > MAX_PROMPT_CHARS))
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.a8ab2418c1cf", { MAX_PROMPT_CHARS: String(MAX_PROMPT_CHARS) }),
        );
      const old = s.generationPrompts[c.promptId];
      const prompts = { ...s.generationPrompts };
      if (old) {
        if (old.occurrenceId !== o.id || old.segmentId !== seg.id)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.a46fb444956c"),
          );
        if (
          text !== null &&
          old.removed &&
          Object.values(s.generationPrompts).some(
            (p) => p.segmentId === seg.id && !p.removed && p.id !== old.id,
          )
        )
          fail(
            "referenced",
            tk("core-commands-apply.run.fail.dc3d6e9e7817"),
          );
        prompts[old.id] =
          text === null
            ? { ...old, basedOn: c.basedOn, removed: true, revision: rev(old) }
            : { ...old, text, basedOn: c.basedOn, removed: false, revision: rev(old) };
      } else {
        if (text === null)
          fail("invalid", tk("core-commands-apply.run.fail.dd384e5d8045"));
        assertNewId(s, c.promptId);
        if (Object.values(s.generationPrompts).some((p) => p.segmentId === seg.id && !p.removed))
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.3fbd34bdac6d"),
          );
        prompts[c.promptId] = {
          id: c.promptId,
          revision: 1,
          occurrenceId: o.id,
          segmentId: seg.id,
          text: text!,
          basedOn: c.basedOn,
          removed: false,
        };
      }
      return {
        state: { ...s, generationPrompts: prompts },
        inverse: {
          type: "SetGenerationPrompt",
          promptId: c.promptId,
          occurrenceId: o.id,
          segmentId: seg.id,
          text: old && !old.removed ? old.text : null,
          basedOn: old?.basedOn ?? "",
        },
        affected: [c.promptId],
      };
    }

    case "ReplaceSegments": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.6a267a80d65f.2"));
      if (c.removeSegmentIds.length === 0 && c.segments.length === 0)
        fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb"));
      if (c.segments.length > 200) fail("invalid", tk("core-commands-apply.run.fail.50831d62447d"));
      // Samtidige endringer: det som fjernes, må være nøyaktig inndelingen som gjelder nå
      const current = Object.values(s.segments)
        .filter((g) => g.occurrenceId === o.id && g.reason === c.reason)
        .map((g) => g.id as string)
        .sort();
      const asked = [...new Set(c.removeSegmentIds as readonly string[])].sort();
      if (current.length !== asked.length || current.some((id, i) => id !== asked[i]))
        fail(
          "revision_conflict",
          tk("core-commands-apply.run.fail.94a03f5a191f"),
        );
      const segments = { ...s.segments };
      const prompts = { ...s.generationPrompts };
      const removedOld: ProductionSegment[] = [];
      for (const id of c.removeSegmentIds) {
        const g = need(s.segments[id], tk("core-commands-apply.g.need.31cdb75fe74f.2"));
        if (g.occurrenceId !== o.id)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.7b7cc38ea941.2"),
          );
        if (Object.values(s.takes).some((t) => t.segmentId === id))
          fail(
            "referenced",
            tk("core-commands-apply.run.fail.a978af2390ea"),
          );
        if (Object.values(s.generationPrompts).some((p) => p.segmentId === id && !p.removed))
          fail(
            "referenced",
            tk("core-commands-apply.run.fail.83251b4dff6b"),
          );
        // Fjernede beskrivelser for segmentet forsvinner med det
        for (const p of Object.values(s.generationPrompts))
          if (p.segmentId === id) delete prompts[p.id];
        removedOld.push(g);
        delete segments[id];
      }
      const reasons: readonly SegmentReason[] = [
        "narrative_subsequence",
        "continuity_change",
        "model_limit",
        "manual",
      ];
      if (!reasons.includes(c.reason)) fail("invalid", tk("core-commands-apply.run.fail.71ce23edc75a"));
      for (const g of c.segments) {
        // Et segment som fjernes, kan ikke legges til igjen i samme endring (lagres i én transaksjon)
        if (segments[g.segmentId] || removedOld.some((x) => x.id === g.segmentId))
          fail(
            "duplicate_id",
            tk("core-commands-apply.run.fail.d71ef564dfa8", { segmentId: String(g.segmentId) }),
          );
        assertNewId({ ...s, segments, generationPrompts: prompts }, g.segmentId);
        assertKey(g.orderKey);
        for (const bid of [g.startBlockId, g.endBlockId]) {
          if (bid === null) continue;
          const b = need(s.blocks[bid], tk("core-commands-apply.b.need.e4b7085bbc3f.3"));
          if (b.variantId !== o.variantId)
            fail(
              "invalid",
              tk("core-commands-apply.run.fail.392651f69596.2"),
            );
        }
        const timed = g.startMs !== undefined || g.endMs !== undefined;
        if (c.reason === "model_limit" && !timed)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.7556f496a447"),
          );
        if (
          timed &&
          (!Number.isInteger(g.startMs) ||
            !Number.isInteger(g.endMs) ||
            g.startMs! < 0 ||
            g.endMs! <= g.startMs! ||
            g.endMs! > 36_000_000)
        )
          fail("invalid", tk("core-commands-apply.run.fail.0687c52045f9"));
        segments[g.segmentId] = {
          id: g.segmentId,
          revision: 1,
          occurrenceId: o.id,
          reason: c.reason,
          orderKey: g.orderKey,
          startBlockId: g.startBlockId,
          endBlockId: g.endBlockId,
          ...(timed ? { startMs: g.startMs!, endMs: g.endMs! } : {}),
        };
      }
      return {
        state: { ...s, segments, generationPrompts: prompts },
        inverse: {
          type: "ReplaceSegments",
          occurrenceId: o.id,
          reason: removedOld[0]?.reason ?? c.reason,
          removeSegmentIds: c.segments.map((g) => g.segmentId),
          segments: removedOld.map((g) => ({
            segmentId: g.id,
            orderKey: g.orderKey,
            startBlockId: g.startBlockId,
            endBlockId: g.endBlockId,
            ...(g.startMs !== undefined
              ? { startMs: g.startMs, endMs: g.endMs ?? g.startMs + 1 }
              : {}),
          })),
        },
        affected: [...c.removeSegmentIds, ...c.segments.map((g) => g.segmentId)],
      };
    }

    case "AcceptScriptChanges": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.6a267a80d65f.3"));
      if (c.compositionIds.length === 0 && c.takeIds.length === 0)
        fail("invalid", tk("core-commands-apply.run.fail.cb37d067be6d"));
      const now = currentBlockRevisions(s, o.variantId);
      const compositions = { ...s.compositions };
      const takes = { ...s.takes };
      const inverse: Extract<Command, { type: "SetProducedFrom" }> = {
        type: "SetProducedFrom",
        compositions: [],
        takes: [],
      };
      for (const id of c.compositionIds) {
        const comp = need(s.compositions[id], tk("core-commands-apply.comp.need.118fc96033c3"));
        if (comp.variantId !== o.variantId)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.494de762ebe9"),
          );
        (
          inverse.compositions as {
            compositionId: typeof id;
            blockRevisions: Record<string, number>;
            assetVersions: Readonly<Record<string, string>> | null;
          }[]
        ).push({
          compositionId: id,
          blockRevisions: comp.producedFrom?.blockRevisions ?? {},
          assetVersions: comp.producedFrom?.assetVersions ?? null,
        });
        // Grunnlaget fornyes: manuset og ressursversjonene scenen viser nå (REQ-0022)
        const assetVersions = compositionAssetVersions(s, id);
        compositions[id] = {
          ...comp,
          producedFrom: { blockRevisions: now, ...(assetVersions ? { assetVersions } : {}) },
          revision: rev(comp),
        };
      }
      for (const id of c.takeIds) {
        const t = need(s.takes[id], tk("core-commands-apply.t.need.183b43aa1e75"));
        if (t.occurrenceId !== o.id)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.da27e402dc1c"),
          );
        (
          inverse.takes as {
            takeId: typeof id;
            blockRevisions: Record<string, number>;
            assetVersions: Readonly<Record<string, string>> | null;
          }[]
        ).push({
          takeId: id,
          blockRevisions: t.acceptedFrom?.blockRevisions ?? {},
          assetVersions: t.acceptedFrom?.assetVersions ?? null,
        });
        // producedFrom er uforanderlig (INV-07); godkjenningen lagres ved siden av
        const assetVersions = takeAssetVersions(s, t);
        takes[id] = {
          ...t,
          acceptedFrom: { blockRevisions: now, ...(assetVersions ? { assetVersions } : {}) },
          revision: rev(t),
        };
      }
      return {
        state: { ...s, compositions, takes },
        inverse,
        affected: [...c.compositionIds, ...c.takeIds],
      };
    }

    case "SetProducedFrom": {
      const clean = (m: Readonly<Record<string, number>>) => {
        if (!m || typeof m !== "object") fail("invalid", tk("core-commands-apply.clean.fail.13c79e45d41e"));
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(m)) {
          if (!isUuid(k) || !Number.isInteger(v) || v < 1)
            fail("invalid", tk("core-commands-apply.clean.fail.13c79e45d41e.2"));
          out[k] = v;
        }
        return out;
      };
      const compositions = { ...s.compositions };
      const takes = { ...s.takes };
      const inverse: Extract<Command, { type: "SetProducedFrom" }> = {
        type: "SetProducedFrom",
        compositions: c.compositions.map((x) => {
          const pf = need(
            s.compositions[x.compositionId],
            tk("core-commands-apply.pf.need.71e535a260df"),
          ).producedFrom;
          return {
            compositionId: x.compositionId,
            blockRevisions: pf?.blockRevisions ?? {},
            assetVersions: pf?.assetVersions ?? null,
          };
        }),
        takes: c.takes.map((x) => {
          const af = need(s.takes[x.takeId], tk("core-commands-apply.af.need.9164b9c05b05")).acceptedFrom;
          return {
            takeId: x.takeId,
            blockRevisions: af?.blockRevisions ?? {},
            assetVersions: af?.assetVersions ?? null,
          };
        }),
      };
      // Ressursversjonene (REQ-0022): utelatt eller null = ukjent (eldre angresteg hadde dem ikke)
      const cleanVersions = (
        m: Readonly<Record<string, string>> | null | undefined,
      ): Readonly<Record<string, string>> | undefined => {
        if (m === undefined || m === null) return undefined;
        if (typeof m !== "object") fail("invalid", tk("core-commands-apply.clean-versions.fail.153f4ef1ef6b"));
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(m)) {
          if (!isUuid(k) || typeof v !== "string" || !isUuid(v))
            fail("invalid", tk("core-commands-apply.clean-versions.fail.153f4ef1ef6b.2"));
          out[k] = v;
        }
        return Object.keys(out).length ? out : undefined;
      };
      const basis = (
        revs: Record<string, number>,
        av: Readonly<Record<string, string>> | undefined,
      ) =>
        Object.keys(revs).length || av
          ? { blockRevisions: revs, ...(av ? { assetVersions: av } : {}) }
          : null;
      for (const x of c.compositions) {
        const comp = s.compositions[x.compositionId]!;
        const pf = basis(clean(x.blockRevisions), cleanVersions(x.assetVersions));
        const { producedFrom: _old, ...rest } = comp;
        compositions[comp.id] = {
          ...rest,
          ...(pf ? { producedFrom: pf } : {}),
          revision: rev(comp),
        };
      }
      for (const x of c.takes) {
        const t = s.takes[x.takeId]!;
        // Som for 2D-scener: uten manuslinjer og uten ressursversjoner fjernes godkjenningen helt, så
        // producedFrom gjelder igjen; med bare ressursversjoner beholdes den (REQ-0022)
        const af = basis(clean(x.blockRevisions), cleanVersions(x.assetVersions));
        const { acceptedFrom: _old, ...restTake } = t;
        takes[t.id] = {
          ...restTake,
          ...(af ? { acceptedFrom: af } : {}),
          revision: rev(t),
        };
      }
      return {
        state: { ...s, compositions, takes },
        inverse,
        affected: [...c.compositions.map((x) => x.compositionId), ...c.takes.map((x) => x.takeId)],
      };
    }

    case "SetPlannedDuration": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.19409a5cc0dd.12"));
      const ms = c.plannedMs;
      if (
        ms !== null &&
        (typeof ms !== "number" ||
          !Number.isInteger(ms) ||
          ms < MIN_PLANNED_MS ||
          ms > MAX_PLANNED_MS)
      )
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.975d6cdedb5d"),
        );
      const { plannedMs: _old, ...rest } = o;
      const next = ms === null ? rest : { ...rest, plannedMs: ms };
      return {
        state: {
          ...s,
          occurrences: { ...s.occurrences, [o.id]: { ...next, revision: rev(o) } },
        },
        inverse: { type: "SetPlannedDuration", occurrenceId: o.id, plannedMs: o.plannedMs ?? null },
        affected: [o.id],
      };
    }

    case "SetSceneVideoInstructions": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.19409a5cc0dd.13"));
      if (typeof c.text !== "string")
        fail("invalid", tk("core-commands-apply.run.fail.3e01775fc197"));
      const text = c.text.replace(/\r\n?/g, "\n").trim();
      if (text.length > MAX_SCENE_VIDEO_INSTRUCTIONS)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.8569fc4deb58", { MAX_SCENE_VIDEO_INSTRUCTIONS: String(MAX_SCENE_VIDEO_INSTRUCTIONS) }),
        );
      if ((o.videoInstructions ?? "") === text) fail("invalid", tk("core-commands-apply.run.fail.42404ff62cbc.2"));
      const { videoInstructions: _old, ...rest } = o;
      return {
        state: {
          ...s,
          occurrences: {
            ...s.occurrences,
            [o.id]: { ...rest, ...(text ? { videoInstructions: text } : {}), revision: rev(o) },
          },
        },
        inverse: {
          type: "SetSceneVideoInstructions",
          occurrenceId: o.id,
          text: o.videoInstructions ?? "",
        },
        affected: [o.id],
      };
    }

    case "SetOccurrenceMonochrome": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.19409a5cc0dd.14"));
      if (typeof c.monochrome !== "boolean") fail("invalid", tk("core-commands-apply.run.fail.18934f1e81fa"));
      const { monochrome: _old, ...rest } = o;
      const next = c.monochrome ? { ...rest, monochrome: true } : rest;
      return {
        state: {
          ...s,
          occurrences: { ...s.occurrences, [o.id]: { ...next, revision: rev(o) } },
        },
        inverse: {
          type: "SetOccurrenceMonochrome",
          occurrenceId: o.id,
          monochrome: o.monochrome === true,
        },
        affected: [o.id],
      };
    }

    case "SetOccurrenceWorkStatus": {
      const o = need(s.occurrences[c.occurrenceId], tk("b118.err-scene-missing"));
      if (c.workStatus !== null && !isWorkStatus(c.workStatus)) fail("invalid", tk("b118.err-status"));
      const { workStatus: _old, ...rest } = o;
      const next = c.workStatus !== null ? { ...rest, workStatus: c.workStatus } : rest;
      return {
        state: { ...s, occurrences: { ...s.occurrences, [o.id]: { ...next, revision: rev(o) } } },
        inverse: { type: "SetOccurrenceWorkStatus", occurrenceId: o.id, workStatus: o.workStatus ?? null },
        affected: [o.id],
      };
    }

    case "SetOccurrenceColor": {
      const o = need(s.occurrences[c.occurrenceId], tk("b118.err-scene-missing"));
      if (c.color !== null && !isSceneColor(c.color)) fail("invalid", tk("b118.err-color"));
      const { color: _old, ...rest } = o;
      const next = c.color !== null ? { ...rest, color: c.color } : rest;
      return {
        state: { ...s, occurrences: { ...s.occurrences, [o.id]: { ...next, revision: rev(o) } } },
        inverse: { type: "SetOccurrenceColor", occurrenceId: o.id, color: o.color ?? null },
        affected: [o.id],
      };
    }

    case "SetSceneEdit": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.19409a5cc0dd.15"));
      if (c.activeTakeId !== null) {
        const t = need(s.takes[c.activeTakeId], tk("core-commands-apply.t.need.183b43aa1e75.2"));
        if (s.occurrences[t.occurrenceId]?.sceneId !== o.sceneId)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.78b89c2d3a09"),
          );
      }
      if (!Array.isArray(c.parts) || c.parts.length > MAX_CLIP_PARTS)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.75f5550586f8", { MAX_CLIP_PARTS: String(MAX_CLIP_PARTS) }),
        );
      const comp = compositionOfVariant(s, o.variantId);
      const fps = s.project.fps.num / s.project.fps.den;
      const compMs =
        comp && comp.durationFrames > 0
          ? Math.round((comp.durationFrames / fps) * 1000)
          : AUDIO_MAX_MS;
      const seen = new Set<string>();
      const keys = keysEvenly(Math.max(1, c.parts.length));
      const next: Record<string, ClipPart> = { ...s.clipParts };
      const affected: string[] = [o.id];
      c.parts.forEach((p, i) => {
        const f = partFieldsOf(p);
        if (seen.has(f.partId)) fail("invalid", tk("core-commands-apply.run.fail.ce89889b56fc"));
        seen.add(f.partId);
        const prev = s.clipParts[f.partId];
        const unchanged =
          prev !== undefined &&
          prev.source === f.source &&
          prev.takeId === f.takeId &&
          prev.inMs === f.inMs &&
          prev.outMs === f.outMs;
        if (unchanged) {
          // Uendrede deler kontrolleres ikke mot kilden på nytt (2D-scenen kan ha blitt kortere)
        } else if (f.source === "take") {
          const t = need(s.takes[f.takeId!], tk("core-commands-apply.t.need.183b43aa1e75.3"));
          if (s.occurrences[t.occurrenceId]?.sceneId !== o.sceneId)
            fail(
              "invalid",
              tk("core-commands-apply.run.fail.78b89c2d3a09.2"),
            );
          if (
            (t.kind !== "imported_film" && t.kind !== "ai_video" && t.kind !== "still") ||
            !t.mediaRef
          )
            fail(
              "invalid",
              tk("core-commands-apply.run.fail.44f73b3efc0e"),
            );
          // Et stillbilde kan vises så lenge man vil; filmen har sin lengde
          const max = t.kind === "still" ? AUDIO_MAX_MS : (t.media?.durationMs ?? AUDIO_MAX_MS);
          if (f.outMs > max)
            fail(
              "invalid",
              tk("core-commands-apply.run.fail.39426785e783"),
            );
        } else {
          if (!comp) fail("invalid", tk("core-commands-apply.run.fail.857cef7b08da"));
          if (f.outMs > compMs)
            fail(
              "invalid",
              tk("core-commands-apply.run.fail.4fcf4f1ca46a"),
            );
        }
        const old = s.clipParts[f.partId];
        if (old && old.occurrenceId !== o.id)
          fail("invalid", tk("core-commands-apply.run.fail.f0d32ad7ecb3"));
        if (!old) assertNewId(s, f.partId);
        const part: ClipPart = {
          id: f.partId as never,
          revision: old ? rev(old) : 1,
          occurrenceId: o.id,
          orderKey: keys[i]!,
          source: f.source,
          takeId: f.takeId as never,
          inMs: f.inMs,
          outMs: f.outMs,
          // Første del har ingen del før seg å tone fra; overgangen er aldri lengre enn delen før (den kan ha
          // blitt kortet inn etter at overgangen ble valgt), så vinduet når aldri forbi nabodelen
          ...(i > 0 && f.transitionMs
            ? (() => {
                const before = c.parts[i - 1]!;
                const ms = Math.min(f.transitionMs, before.outMs - before.inMs);
                return ms > 0 ? { transitionMs: ms } : {};
              })()
            : {}),
          removed: false,
        };
        if (
          !old ||
          old.removed ||
          old.orderKey !== part.orderKey ||
          old.source !== part.source ||
          old.takeId !== part.takeId ||
          old.inMs !== part.inMs ||
          old.outMs !== part.outMs ||
          (old.transitionMs ?? 0) !== (part.transitionMs ?? 0)
        ) {
          next[part.id] = part;
          affected.push(part.id);
        }
      });
      const before = Object.values(s.clipParts)
        .filter((p) => p.occurrenceId === o.id && !p.removed)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
      for (const p of before)
        if (!seen.has(p.id)) {
          next[p.id] = { ...p, removed: true, revision: rev(p) };
          affected.push(p.id);
        }
      // Revisjonen økes alltid: to som klipper samme scene samtidig, får konflikt i stedet for at den
      // enes deler forsvinner (INV-C1)
      const occ = { ...o, activeTakeId: c.activeTakeId as TakeId | null, revision: rev(o) };
      return {
        state: { ...s, occurrences: { ...s.occurrences, [o.id]: occ }, clipParts: next },
        inverse: {
          type: "SetSceneEdit",
          occurrenceId: o.id,
          activeTakeId: o.activeTakeId,
          parts: before.map((p) => ({
            partId: p.id,
            source: p.source,
            takeId: p.takeId,
            inMs: p.inMs,
            outMs: p.outMs,
            ...(p.transitionMs ? { transitionMs: p.transitionMs } : {}),
          })),
        },
        affected,
      };
    }

    case "SetTakeStatus": {
      const t = need(s.takes[c.takeId], tk("core-commands-apply.t.need.183b43aa1e75.4"));
      if (c.status !== "reference" && c.status !== "in_progress" && c.status !== "approved")
        fail("invalid", tk("core-commands-apply.run.fail.5c6d480cde92"));
      return {
        state: {
          ...s,
          takes: { ...s.takes, [t.id]: { ...t, status: c.status, revision: rev(t) } },
        },
        inverse: { type: "SetTakeStatus", takeId: t.id, status: t.status },
        affected: [t.id],
      };
    }

    case "SetTakeAudioLanguage": {
      const t = need(s.takes[c.takeId], tk("core-commands-apply.t.need.183b43aa1e75.5"));
      const v = c.audioLanguage;
      if (v !== null && v !== "none" && (typeof v !== "string" || !LANGUAGE_CODE.test(v)))
        fail("invalid", tk("core-commands-apply.run.fail.0c2cd6b5efc4"));
      if ((t.audioLanguage ?? null) === v) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.2"));
      const { audioLanguage: _old, ...rest } = t;
      return {
        state: {
          ...s,
          takes: {
            ...s.takes,
            [t.id]: { ...rest, ...(v !== null ? { audioLanguage: v } : {}), revision: rev(t) },
          },
        },
        inverse: {
          type: "SetTakeAudioLanguage",
          takeId: t.id,
          audioLanguage: t.audioLanguage ?? null,
        },
        affected: [t.id],
      };
    }

    case "AddTimeLinks": {
      if (!Array.isArray(c.links) || c.links.length === 0 || c.links.length > 500)
        fail("invalid", tk("core-commands-apply.run.fail.bc9197915a5a"));
      const next = { ...s.timeLinks };
      for (const l of c.links) {
        assertNewId(s, l.linkId);
        if (next[l.linkId])
          fail("invalid", tk("core-commands-apply.run.fail.262b7e34755d"));
        const f = timeLinkFieldsOf(s, l.fields);
        next[l.linkId] = { id: l.linkId, revision: 1, ...f, removed: false };
      }
      const ids = c.links.map((l) => l.linkId);
      return {
        state: { ...s, timeLinks: next },
        inverse: { type: "SetTimeLinksRemoved", linkIds: ids, removed: true },
        affected: ids,
      };
    }

    case "UpdateTimeLinks": {
      const next = { ...s.timeLinks };
      const old: { linkId: TimeLink["id"]; fields: TimeLinkFields }[] = [];
      for (const l of c.links) {
        const t = need(s.timeLinks[l.linkId], tk("core-commands-apply.t.need.fbe6c26e5adf"));
        // Uten layerId beholdes laget koblingen gjelder
        const f = timeLinkFieldsOf(
          s,
          l.fields && l.fields.layerId === undefined
            ? { ...l.fields, layerId: t.layerId }
            : l.fields,
        );
        old.push({
          linkId: t.id,
          fields: {
            occurrenceId: t.occurrenceId,
            blockId: t.blockId,
            startMs: t.startMs,
            endMs: t.endMs,
            layerId: t.layerId,
          },
        });
        next[t.id] = { ...t, ...f, revision: rev(t) };
      }
      return {
        state: { ...s, timeLinks: next },
        inverse: { type: "UpdateTimeLinks", links: old },
        affected: c.links.map((l) => l.linkId),
      };
    }

    case "SetTimeLinksRemoved": {
      const next = { ...s.timeLinks };
      for (const id of c.linkIds) {
        const t = need(s.timeLinks[id], tk("core-commands-apply.t.need.fbe6c26e5adf.2"));
        next[id] = { ...t, removed: c.removed, revision: rev(t) };
      }
      return {
        state: { ...s, timeLinks: next },
        inverse: { type: "SetTimeLinksRemoved", linkIds: c.linkIds, removed: !c.removed },
        affected: [...c.linkIds],
      };
    }

    case "AddContinuityEvents": {
      if (!Array.isArray(c.events) || c.events.length === 0 || c.events.length > 500)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.424299adefdb"),
        );
      const next = { ...s.continuityEvents };
      for (const e of c.events) {
        assertNewId(s, e.eventId);
        if (next[e.eventId]) fail("invalid", tk("core-commands-apply.run.fail.9ea46b6006dc"));
        next[e.eventId] = {
          id: e.eventId,
          revision: 1,
          ...continuityFieldsOf(s, e.fields),
          removed: false,
        };
      }
      const ids = c.events.map((e) => e.eventId);
      return {
        state: { ...s, continuityEvents: next },
        inverse: { type: "SetContinuityEventsRemoved", eventIds: ids, removed: true },
        affected: ids,
      };
    }

    case "UpdateContinuityEvents": {
      if (!Array.isArray(c.events) || c.events.length === 0 || c.events.length > 500)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.424299adefdb.2"),
        );
      const next = { ...s.continuityEvents };
      const old: { eventId: ContinuityEventId; fields: ContinuityEventFields }[] = [];
      for (const e of c.events) {
        const ev = need(
          s.continuityEvents[e.eventId],
          tk("core-commands-apply.ev.need.ee8a453a6747"),
        );
        old.push({ eventId: ev.id, fields: continuityFieldsFrom(ev) });
        const { productionId: _p, ...rest } = ev;
        next[ev.id] = { ...rest, ...continuityFieldsOf(s, e.fields, ev), revision: rev(ev) };
      }
      return {
        state: { ...s, continuityEvents: next },
        inverse: { type: "UpdateContinuityEvents", events: old },
        affected: c.events.map((e) => e.eventId),
      };
    }

    // ---------- Presentasjon (M8 del 1, DEC-0061) ----------
    case "AddRelations": {
      if (!Array.isArray(c.items) || c.items.length === 0 || c.items.length > 500)
        fail("invalid", tk("core-commands-apply.run.fail.0f8acb0836d1"));
      const next = { ...s.assetRelations };
      for (const it of c.items) {
        assertNewId(s, it.relationId);
        if (next[it.relationId])
          fail("invalid", tk("core-commands-apply.run.fail.43e798f328e9"));
        next[it.relationId] = {
          id: it.relationId,
          revision: 1,
          ...relationFieldsOf(s, it.fields),
          removed: false,
        };
        assertUniqueRelation(next, it.relationId);
      }
      const ids = c.items.map((x) => x.relationId);
      return {
        state: { ...s, assetRelations: next },
        inverse: { type: "UndoAddRelations", relationIds: ids },
        affected: ids,
      };
    }

    case "UpdateRelations": {
      if (!Array.isArray(c.items) || c.items.length === 0 || c.items.length > 500)
        fail("invalid", tk("core-commands-apply.run.fail.0f8acb0836d1.2"));
      const next = { ...s.assetRelations };
      const old: { relationId: AssetRelation["id"]; fields: RelationFields }[] = [];
      for (const it of c.items) {
        const r = need(s.assetRelations[it.relationId], tk("core-commands-apply.r.need.63710286c2e8"));
        old.push({
          relationId: r.id,
          fields: {
            fromAssetId: r.fromAssetId,
            toAssetId: r.toAssetId,
            kind: r.kind,
            label: r.label,
            description: r.description,
            status: r.status,
          },
        });
        next[r.id] = { ...r, ...relationFieldsOf(s, it.fields), revision: rev(r) };
      }
      for (const it of c.items) assertUniqueRelation(next, it.relationId);
      return {
        state: { ...s, assetRelations: next },
        inverse: { type: "UpdateRelations", items: old },
        affected: c.items.map((x) => x.relationId),
      };
    }

    case "UndoAddRelations": {
      const ids = [...new Set(c.relationIds)];
      const gone = ids.map((id) => need(s.assetRelations[id], tk("core-commands-apply.gone.need.eb3c027217b8")));
      if (
        Object.values(s.posters).some((p) =>
          ids.some((id) => posterAssetRefs(p.document).relations.has(id)),
        )
      )
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.f3c5ad5ceea2"),
        );
      const next = { ...s.assetRelations };
      for (const id of ids) delete next[id];
      return {
        state: { ...s, assetRelations: next },
        inverse: {
          type: "AddRelations",
          items: gone.map((r) => ({
            relationId: r.id,
            fields: {
              fromAssetId: r.fromAssetId,
              toAssetId: r.toAssetId,
              kind: r.kind,
              label: r.label,
              description: r.description,
              status: r.status,
            },
          })),
        },
        affected: ids,
      };
    }

    case "SetRelationsRemoved": {
      const next = { ...s.assetRelations };
      const changed = [...new Set(c.relationIds)]
        .map((id) => need(s.assetRelations[id], tk("core-commands-apply.changed.need.d041b9c2d6c1")))
        .filter((r) => r.removed !== c.removed);
      if (changed.length === 0) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.3"));
      for (const r of changed) next[r.id] = { ...r, removed: c.removed, revision: rev(r) };
      if (!c.removed) for (const r of changed) assertUniqueRelation(next, r.id);
      return {
        state: { ...s, assetRelations: next },
        inverse: {
          type: "SetRelationsRemoved",
          relationIds: changed.map((r) => r.id),
          removed: !c.removed,
        },
        affected: changed.map((r) => r.id),
      };
    }

    case "CreatePoster": {
      assertNewId(s, c.posterId);
      return {
        state: {
          ...s,
          posters: {
            ...s.posters,
            [c.posterId]: {
              id: c.posterId,
              revision: 1,
              ...posterFieldsOf(s, c.fields),
              removed: false,
            },
          },
        },
        inverse: { type: "UndoCreatePoster", posterId: c.posterId },
        affected: [c.posterId],
      };
    }

    case "UndoCreatePoster": {
      const p = need(s.posters[c.posterId], tk("core-commands-apply.p.need.345947a21724"));
      const { [p.id]: _p, ...posters } = s.posters;
      const { id: _id, revision: _r, removed: _rm, ...fields } = p;
      return {
        state: { ...s, posters },
        inverse: { type: "CreatePoster", posterId: p.id, fields },
        affected: [p.id],
      };
    }

    case "UpdatePoster": {
      const p = need(s.posters[c.posterId], tk("core-commands-apply.p.need.345947a21724.2"));
      const { id: _id, revision: _r, removed: _rm, ...old } = p;
      return {
        state: {
          ...s,
          posters: {
            ...s.posters,
            [p.id]: { ...p, ...posterFieldsOf(s, c.fields, p), revision: rev(p) },
          },
        },
        inverse: { type: "UpdatePoster", posterId: p.id, fields: old },
        affected: [p.id],
      };
    }

    case "SetPosterRemoved": {
      const p = need(s.posters[c.posterId], tk("core-commands-apply.p.need.345947a21724.3"));
      if (p.removed === c.removed) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.4"));
      return {
        state: {
          ...s,
          posters: { ...s.posters, [p.id]: { ...p, removed: c.removed, revision: rev(p) } },
        },
        inverse: { type: "SetPosterRemoved", posterId: p.id, removed: !c.removed },
        affected: [p.id],
      };
    }

    case "CreateStyleProfile": {
      assertNewId(s, c.profileId);
      const fields = styleProfileFieldsOf(s, c.fields, c.profileId);
      return {
        state: {
          ...s,
          styleProfiles: {
            ...s.styleProfiles,
            [c.profileId]: { id: c.profileId, revision: 1, ...fields, removed: false },
          },
        },
        inverse: { type: "UndoCreateStyleProfile", profileId: c.profileId },
        affected: [c.profileId],
      };
    }

    case "UndoCreateStyleProfile": {
      const p = need(s.styleProfiles[c.profileId], tk("core-commands-apply.p.need.14e61a4bb845"));
      // P8: profilen er stilkilden for harmoniseringer eller har foretrukne referanser (REQ-0144)
      if (
        Object.values(s.styleHarmonizations ?? {}).some((h) => !h.removed && h.styleProfileId === p.id) ||
        Object.values(s.stylePreferredReferences ?? {}).some((r) => !r.removed && r.styleProfileId === p.id)
      )
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.41755885877d"),
        );
      if (p.appliesTo?.length)
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.b011bd242f1a"),
        );
      const { [p.id]: _p, ...styleProfiles } = s.styleProfiles;
      return {
        state: { ...s, styleProfiles },
        inverse: {
          type: "CreateStyleProfile",
          profileId: p.id,
          fields: { name: p.name, isDefault: p.isDefault, guide: p.guide },
        },
        affected: [p.id],
      };
    }

    case "UpdateStyleProfile": {
      const p = need(s.styleProfiles[c.profileId], tk("core-commands-apply.p.need.14e61a4bb845.2"));
      const fields = styleProfileFieldsOf(s, c.fields, p.id, p);
      return {
        state: {
          ...s,
          styleProfiles: { ...s.styleProfiles, [p.id]: { ...p, ...fields, revision: rev(p) } },
        },
        inverse: {
          type: "UpdateStyleProfile",
          profileId: p.id,
          fields: { name: p.name, isDefault: p.isDefault, guide: p.guide },
        },
        affected: [p.id],
      };
    }

    case "SetStyleAppliesTo": {
      const p = need(s.styleProfiles[c.profileId], tk("core-commands-apply.p.need.14e61a4bb845.3"));
      if (!Array.isArray(c.appliesTo) || c.appliesTo.some((u) => !STYLE_USES.includes(u)))
        fail("invalid", tk("core-commands-apply.run.fail.8860001d638e"));
      const uses = STYLE_USES.filter((u) => c.appliesTo.includes(u));
      // Hver bruk har høyst én profil, så det alltid er klart hvilken som gjelder
      for (const u of uses) {
        const other = Object.values(s.styleProfiles).find(
          (x) => x.id !== p.id && !x.removed && (x.appliesTo ?? []).includes(u),
        );
        if (other)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.f6065d812b79", { value1: String(STYLE_USE_LABEL[u]), name: String(other.name) }),
          );
      }
      const before = p.appliesTo ?? [];
      if (before.length === uses.length && before.every((u, i) => u === uses[i]))
        fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.5"));
      return {
        state: {
          ...s,
          styleProfiles: {
            ...s.styleProfiles,
            [p.id]: { ...p, appliesTo: uses, revision: rev(p) },
          },
        },
        inverse: { type: "SetStyleAppliesTo", profileId: p.id, appliesTo: before },
        affected: [p.id],
      };
    }

    case "SetStyleProfileRemoved": {
      const p = need(s.styleProfiles[c.profileId], tk("core-commands-apply.p.need.14e61a4bb845.4"));
      if (p.removed === c.removed) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.6"));
      if (!c.removed && p.isDefault && otherDefault(s, p.id))
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.7e7a1a8c6519"),
        );
      if (!c.removed)
        for (const u of p.appliesTo ?? []) {
          const other = Object.values(s.styleProfiles).find(
            (x) => x.id !== p.id && !x.removed && (x.appliesTo ?? []).includes(u),
          );
          if (other)
            fail(
              "invalid",
              tk("core-commands-apply.run.fail.f6065d812b79.2", { value1: String(STYLE_USE_LABEL[u]), name: String(other.name) }),
            );
        }
      return {
        state: {
          ...s,
          styleProfiles: {
            ...s.styleProfiles,
            [p.id]: { ...p, removed: c.removed, revision: rev(p) },
          },
        },
        inverse: { type: "SetStyleProfileRemoved", profileId: p.id, removed: !c.removed },
        affected: [p.id],
      };
    }

    // ---------- Story Lab (SL1) ----------

    case "SetStoryProfile": {
      const asset = storyAsset(s, c.assetId);
      const e = profileError(c.profile);
      if (e) fail("invalid", e);
      const prev = s.storyProfiles[c.profileId];
      if (prev) {
        if (prev.assetId !== asset.id)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.056218678887"),
          );
        if (prev.removed)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.0346c02d9cb2"),
          );
        return {
          state: {
            ...s,
            storyProfiles: {
              ...s.storyProfiles,
              [prev.id]: { ...prev, profile: c.profile, revision: rev(prev) },
            },
          },
          inverse: {
            type: "SetStoryProfile",
            profileId: prev.id,
            assetId: prev.assetId,
            profile: prev.profile,
          },
          affected: [prev.id],
        };
      }
      assertNewId(s, c.profileId);
      if (activeProfileOf(s, asset.id))
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.9ac798ceab57"),
        );
      return {
        state: {
          ...s,
          storyProfiles: {
            ...s.storyProfiles,
            [c.profileId]: {
              id: c.profileId,
              revision: 1,
              assetId: asset.id,
              profile: c.profile,
              removed: false,
            },
          },
        },
        inverse: { type: "UndoCreateStoryProfile", profileId: c.profileId },
        affected: [c.profileId],
      };
    }

    case "UndoCreateStoryProfile": {
      const p = need(s.storyProfiles[c.profileId], tk("core-commands-apply.p.need.0a4bb91e2b76"));
      const { [p.id]: _p, ...storyProfiles } = s.storyProfiles;
      return {
        state: { ...s, storyProfiles },
        inverse: {
          type: "SetStoryProfile",
          profileId: p.id,
          assetId: p.assetId,
          profile: p.profile,
        },
        affected: [p.id],
      };
    }

    case "RemoveStoryProfile": {
      const p = need(s.storyProfiles[c.profileId], tk("core-commands-apply.p.need.0a4bb91e2b76.2"));
      if (p.removed === c.removed) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.7"));
      if (!c.removed && activeProfileOf(s, p.assetId))
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.9ac798ceab57.2"),
        );
      return {
        state: {
          ...s,
          storyProfiles: {
            ...s.storyProfiles,
            [p.id]: { ...p, removed: c.removed, revision: rev(p) },
          },
        },
        inverse: { type: "RemoveStoryProfile", profileId: p.id, removed: !c.removed },
        affected: [p.id],
      };
    }

    case "AddStoryProfileStage": {
      assertNewId(s, c.stageId);
      const asset = storyAsset(s, c.assetId);
      need(s.scenes[c.fromSceneId], tk("core-commands-apply.run.need.594b13c00857.2"));
      const e = profilePatchError(c.patch);
      if (e) fail("invalid", e);
      assertOneStagePerScene(s, asset.id, c.fromSceneId, c.stageId);
      return {
        state: {
          ...s,
          storyProfileStages: {
            ...s.storyProfileStages,
            [c.stageId]: {
              id: c.stageId,
              revision: 1,
              assetId: asset.id,
              fromSceneId: c.fromSceneId,
              patch: c.patch,
              removed: false,
            },
          },
        },
        inverse: { type: "UndoAddStoryProfileStage", stageId: c.stageId },
        affected: [c.stageId],
      };
    }

    case "UndoAddStoryProfileStage": {
      const g = need(s.storyProfileStages[c.stageId], tk("core-commands-apply.g.need.b48915069fad"));
      const { [g.id]: _g, ...storyProfileStages } = s.storyProfileStages;
      return {
        state: { ...s, storyProfileStages },
        inverse: {
          type: "AddStoryProfileStage",
          stageId: g.id,
          assetId: g.assetId,
          fromSceneId: g.fromSceneId,
          patch: g.patch,
        },
        affected: [g.id],
      };
    }

    case "UpdateStoryProfileStage": {
      const g = need(s.storyProfileStages[c.stageId], tk("core-commands-apply.g.need.b48915069fad.2"));
      need(s.scenes[c.fromSceneId], tk("core-commands-apply.run.need.594b13c00857.3"));
      const e = profilePatchError(c.patch);
      if (e) fail("invalid", e);
      if (!g.removed) assertOneStagePerScene(s, g.assetId, c.fromSceneId, g.id);
      return {
        state: {
          ...s,
          storyProfileStages: {
            ...s.storyProfileStages,
            [g.id]: { ...g, fromSceneId: c.fromSceneId, patch: c.patch, revision: rev(g) },
          },
        },
        inverse: {
          type: "UpdateStoryProfileStage",
          stageId: g.id,
          fromSceneId: g.fromSceneId,
          patch: g.patch,
        },
        affected: [g.id],
      };
    }

    case "RemoveStoryProfileStage": {
      const g = need(s.storyProfileStages[c.stageId], tk("core-commands-apply.g.need.b48915069fad.3"));
      if (g.removed === c.removed) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.8"));
      if (!c.removed) assertOneStagePerScene(s, g.assetId, g.fromSceneId, g.id);
      return {
        state: {
          ...s,
          storyProfileStages: {
            ...s.storyProfileStages,
            [g.id]: { ...g, removed: c.removed, revision: rev(g) },
          },
        },
        inverse: { type: "RemoveStoryProfileStage", stageId: g.id, removed: !c.removed },
        affected: [g.id],
      };
    }

    case "AddStoryFact": {
      assertNewId(s, c.factId);
      const fields = storyFactFieldsOf(s, c.fields);
      return {
        state: {
          ...s,
          storyFacts: {
            ...s.storyFacts,
            [c.factId]: { id: c.factId, revision: 1, ...fields, removed: false },
          },
        },
        inverse: { type: "UndoAddStoryFact", factId: c.factId },
        affected: [c.factId],
      };
    }

    case "UndoAddStoryFact": {
      const f = need(s.storyFacts[c.factId], tk("core-commands-apply.f.need.716e5a25a786"));
      const { [f.id]: _f, ...storyFacts } = s.storyFacts;
      return {
        state: { ...s, storyFacts },
        inverse: { type: "AddStoryFact", factId: f.id, fields: factFieldsOf(f) },
        affected: [f.id],
      };
    }

    case "UpdateStoryFact": {
      const f = need(s.storyFacts[c.factId], tk("core-commands-apply.f.need.716e5a25a786.2"));
      const fields = storyFactFieldsOf(s, c.fields);
      return {
        state: {
          ...s,
          storyFacts: { ...s.storyFacts, [f.id]: { ...f, ...fields, revision: rev(f) } },
        },
        inverse: { type: "UpdateStoryFact", factId: f.id, fields: factFieldsOf(f) },
        affected: [f.id],
      };
    }

    case "RemoveStoryFact": {
      const f = need(s.storyFacts[c.factId], tk("core-commands-apply.f.need.716e5a25a786.3"));
      if (f.removed === c.removed) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.9"));
      return {
        state: {
          ...s,
          storyFacts: { ...s.storyFacts, [f.id]: { ...f, removed: c.removed, revision: rev(f) } },
        },
        inverse: { type: "RemoveStoryFact", factId: f.id, removed: !c.removed },
        affected: [f.id],
      };
    }

    // ---------- Skrivecanvaset (SL7) ----------
    case "AddCanvasNodes": {
      if (c.nodes.length === 0 || c.nodes.length > 1000)
        fail("invalid", tk("core-commands-apply.run.fail.1b2d497b2a23"));
      const added: Record<string, import("../model").CanvasNode> = {};
      for (const n of c.nodes) {
        assertNewId(s, n.id);
        if (added[n.id])
          fail("duplicate_id", tk("core-commands-apply.run.fail.2033cf23cc9a", { id: String(n.id) }));
        added[n.id] = { id: n.id, revision: 1, ...canvasNodeFieldsOf(n), removed: false };
      }
      const next = { ...s, canvasNodes: { ...s.canvasNodes, ...added } };
      for (const n of Object.values(added)) canvasLinksOf(next, n);
      return {
        state: next,
        inverse: { type: "UndoAddCanvasNodes", nodeIds: c.nodes.map((n) => n.id) },
        affected: c.nodes.map((n) => n.id),
      };
    }

    case "UndoAddCanvasNodes": {
      const nodes = c.nodeIds.map((id) => need(s.canvasNodes[id], tk("core-commands-apply.nodes.need.1e4f52500a4c")));
      const ids = new Set<string>(c.nodeIds);
      if (Object.values(s.canvasEdges).some((e) => ids.has(e.fromNodeId) || ids.has(e.toNodeId)))
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.2b17d85a7981"),
        );
      if (
        Object.values(s.canvasNodes).some((n) => !ids.has(n.id) && n.groupId && ids.has(n.groupId))
      )
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.c36b4e11057b"),
        );
      const canvasNodes = { ...s.canvasNodes };
      for (const id of c.nodeIds) delete canvasNodes[id];
      return {
        state: { ...s, canvasNodes },
        inverse: {
          type: "AddCanvasNodes",
          nodes: nodes.map((n) => ({ id: n.id, ...canvasNodeFieldsOf(n) })),
        },
        affected: [...c.nodeIds],
      };
    }

    case "UpdateCanvasNode": {
      const n = need(s.canvasNodes[c.nodeId], tk("core-commands-apply.n.need.090034be6d16"));
      const before = canvasNodeFieldsOf(n);
      const fields = canvasNodeFieldsOf({ ...before, ...c.patch });
      const updated = { ...n, ...fields, revision: n.revision + 1 };
      const next = { ...s, canvasNodes: { ...s.canvasNodes, [n.id]: updated } };
      canvasLinksOf(next, updated);
      const inversePatch: Record<string, unknown> = {};
      for (const k of Object.keys(c.patch) as (keyof typeof before)[]) inversePatch[k] = before[k];
      return {
        state: next,
        inverse: { type: "UpdateCanvasNode", nodeId: n.id, patch: inversePatch as never },
        affected: [n.id],
      };
    }

    case "MoveCanvasNodes": {
      if (c.moves.length === 0) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.10"));
      const canvasNodes = { ...s.canvasNodes };
      const back: { nodeId: CanvasNodeId; x: number; y: number; w?: number; h?: number }[] = [];
      for (const m of c.moves) {
        const n = need(canvasNodes[m.nodeId], tk("core-commands-apply.n.need.090034be6d16.2"));
        if (back.some((b) => b.nodeId === m.nodeId))
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.d9e424c52804"),
          );
        const fields = canvasNodeFieldsOf({
          ...canvasNodeFieldsOf(n),
          x: m.x,
          y: m.y,
          ...(m.w !== undefined ? { w: m.w } : {}),
          ...(m.h !== undefined ? { h: m.h } : {}),
        });
        back.push({
          nodeId: n.id,
          x: n.x,
          y: n.y,
          ...(m.w !== undefined ? { w: n.w } : {}),
          ...(m.h !== undefined ? { h: n.h } : {}),
        });
        canvasNodes[n.id] = { ...n, ...fields, revision: n.revision + 1 };
      }
      return {
        state: { ...s, canvasNodes },
        inverse: { type: "MoveCanvasNodes", moves: back },
        affected: back.map((b) => b.nodeId),
      };
    }

    case "RemoveCanvasNodes": {
      if (c.nodeIds.length === 0) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.11"));
      const canvasNodes = { ...s.canvasNodes };
      const canvasEdges = { ...s.canvasEdges };
      for (const id of c.nodeIds) {
        const n = need(canvasNodes[id], tk("core-commands-apply.n.need.090034be6d16.3"));
        if (n.removed === c.removed) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.12"));
        canvasNodes[id] = { ...n, removed: c.removed, revision: n.revision + 1 };
      }
      let edgeIds: string[];
      if (c.removed) {
        const ids = new Set<string>(c.nodeIds);
        edgeIds = Object.values(s.canvasEdges)
          .filter((e) => !e.removed && (ids.has(e.fromNodeId) || ids.has(e.toNodeId)))
          .map((e) => e.id);
      } else {
        edgeIds = [...(c.edgeIds ?? [])];
        for (const id of edgeIds) {
          const e = need(canvasEdges[id], tk("core-commands-apply.e.need.0a11693d950c"));
          if (!e.removed) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.13"));
        }
      }
      for (const id of edgeIds) {
        const e = canvasEdges[id]!;
        canvasEdges[id] = { ...e, removed: c.removed, revision: e.revision + 1 };
      }
      if (!c.removed)
        for (const id of edgeIds) {
          const e = canvasEdges[id]!;
          if (canvasNodes[e.fromNodeId]?.removed || canvasNodes[e.toNodeId]?.removed)
            fail(
              "invalid",
              tk("core-commands-apply.run.fail.6344e2d6f455"),
            );
        }
      return {
        state: { ...s, canvasNodes, canvasEdges },
        inverse: {
          type: "RemoveCanvasNodes",
          nodeIds: [...c.nodeIds],
          removed: !c.removed,
          ...(c.removed ? { edgeIds: edgeIds as CanvasEdgeId[] } : {}),
        },
        affected: [...c.nodeIds, ...edgeIds],
      };
    }

    case "AddCanvasEdge": {
      assertNewId(s, c.edgeId);
      const fields = canvasEdgeFieldsOf(s, c.fields);
      return {
        state: {
          ...s,
          canvasEdges: {
            ...s.canvasEdges,
            [c.edgeId]: { id: c.edgeId, revision: 1, ...fields, removed: false },
          },
        },
        inverse: { type: "UndoAddCanvasEdge", edgeId: c.edgeId },
        affected: [c.edgeId],
      };
    }

    case "UndoAddCanvasEdge": {
      const e = need(s.canvasEdges[c.edgeId], tk("core-commands-apply.e.need.0a11693d950c.2"));
      const { [e.id]: _e, ...canvasEdges } = s.canvasEdges;
      return {
        state: { ...s, canvasEdges },
        inverse: {
          type: "AddCanvasEdge",
          edgeId: e.id,
          fields: { fromNodeId: e.fromNodeId, toNodeId: e.toNodeId, label: e.label, kind: e.kind },
        },
        affected: [e.id],
      };
    }

    case "UpdateCanvasEdge": {
      const e = need(s.canvasEdges[c.edgeId], tk("core-commands-apply.e.need.0a11693d950c.3"));
      const before = { label: e.label, kind: e.kind };
      const fields = canvasEdgeFieldsOf(
        s,
        {
          fromNodeId: e.fromNodeId,
          toNodeId: e.toNodeId,
          ...before,
          ...c.patch,
        },
        true,
      );
      const inversePatch: Record<string, unknown> = {};
      for (const k of Object.keys(c.patch) as ("label" | "kind")[]) inversePatch[k] = before[k];
      return {
        state: {
          ...s,
          canvasEdges: {
            ...s.canvasEdges,
            [e.id]: { ...e, label: fields.label, kind: fields.kind, revision: e.revision + 1 },
          },
        },
        inverse: { type: "UpdateCanvasEdge", edgeId: e.id, patch: inversePatch as never },
        affected: [e.id],
      };
    }

    case "RemoveCanvasEdge": {
      const e = need(s.canvasEdges[c.edgeId], tk("core-commands-apply.e.need.0a11693d950c.4"));
      if (e.removed === c.removed) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.14"));
      if (
        !c.removed &&
        (s.canvasNodes[e.fromNodeId]?.removed || s.canvasNodes[e.toNodeId]?.removed)
      )
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.6344e2d6f455.2"),
        );
      return {
        state: {
          ...s,
          canvasEdges: {
            ...s.canvasEdges,
            [e.id]: { ...e, removed: c.removed, revision: e.revision + 1 },
          },
        },
        inverse: { type: "RemoveCanvasEdge", edgeId: e.id, removed: !c.removed },
        affected: [e.id],
      };
    }

    case "SetContinuityEventDisabled": {
      const ev = need(
        s.continuityEvents[c.eventId],
        tk("core-commands-apply.ev.need.ee8a453a6747.2"),
      );
      const p = need(s.productions[c.productionId], tk("core-commands-apply.p.need.83aa7f655d8e.4"));
      if (p.kind === "main")
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.9d80317af7d2"),
        );
      if (ev.productionId)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.64582b36442d"),
        );
      const list = ev.disabledIn ?? [];
      if (list.includes(p.id) === c.disabled) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.15"));
      const nextList = c.disabled ? [...list, p.id].sort() : list.filter((x) => x !== p.id);
      const { disabledIn: _d, ...rest } = ev;
      return {
        state: {
          ...s,
          continuityEvents: {
            ...s.continuityEvents,
            [ev.id]: {
              ...rest,
              ...(nextList.length ? { disabledIn: nextList } : {}),
              revision: rev(ev),
            },
          },
        },
        inverse: { ...c, disabled: !c.disabled },
        affected: [ev.id],
      };
    }

    case "SetContinuityEventsRemoved": {
      const next = { ...s.continuityEvents };
      for (const id of c.eventIds) {
        const ev = need(s.continuityEvents[id], tk("core-commands-apply.ev.need.ee8a453a6747.3"));
        next[id] = { ...ev, removed: c.removed, revision: rev(ev) };
      }
      return {
        state: { ...s, continuityEvents: next },
        inverse: { type: "SetContinuityEventsRemoved", eventIds: c.eventIds, removed: !c.removed },
        affected: [...c.eventIds],
      };
    }

    case "SetLineLink": {
      if (lineLinkError(s,c.fields)) fail("invalid",tk("core-commands-apply.run.fail.89e87eb528d2"));
      const old=(s.translationLineLinks ?? {})[c.linkId];
      if (!old) assertNewId(s,c.linkId);
      const lvId=linkVersionId(s,c.fields);
      const link: TranslationLineLink={...c.fields,id:c.linkId,revision:old ? rev(old) : 1,removed:c.removed === true,createdBy:old?.createdBy ?? env.actor,createdAt:old?.createdAt ?? env.at,...(lvId?{languageVersionId:lvId}:{})};
      return {state:{...s,translationLineLinks:{...(s.translationLineLinks ?? {}),[link.id]:link}},inverse:old ? {type:"RestoreLineLinks",items:[old]} : {type:"UndoAddLineLink",linkId:link.id},affected:[link.id]};
    }
    case "UndoAddLineLink": {
      const old=need((s.translationLineLinks ?? {})[c.linkId],tk("core-commands-apply.old.need.06c609c3631a"));
      const links={...(s.translationLineLinks ?? {})}; delete links[old.id];
      return {state:{...s,translationLineLinks:links},inverse:{type:"SetLineLink",linkId:old.id,fields:old},affected:[old.id]};
    }
    case "AddTranslationLines": {
      const removeIds=c.removeLineIds ?? [];
      if (!Array.isArray(c.items) || c.items.length > 2000 || removeIds.length > 2000 || (!c.items.length && !removeIds.length)) fail("invalid",tk("core-commands-apply.run.fail.e1f81c493593"));
      const lines={...(s.translationLines ?? {})}; const restore: TranslationLine[]=[];
      for (const id of removeIds) { const old=need(lines[id],tk("core-commands-apply.old.need.da611a844cbd")); restore.push(old); lines[id]={...old,removed:true,revision:rev(old)}; }
      for (const it of c.items) {
        if (lines[it.lineId]) fail("invalid",tk("core-commands-apply.run.fail.254e29d4336d"));
        assertNewId(s,it.lineId);
        if (translationLineError(s,it.fields)) fail("invalid",tk("core-commands-apply.run.fail.f29afea92528"));
        const f=it.fields;
        const lvId=versionIdFor(s,f.language);
        lines[it.lineId]={id:it.lineId,revision:1,variantId:f.variantId,language:f.language,ord:f.ord,kind:f.kind,text:f.text,removed:false,...(lvId?{languageVersionId:lvId}:{})};
      }
      const ids=c.items.map(i=>i.lineId);
      return {state:{...s,translationLines:lines},inverse:{type:"UndoAddTranslationLines",lineIds:ids,restore},affected:[...ids,...removeIds]};
    }
    case "UndoAddTranslationLines": {
      const lines={...(s.translationLines ?? {})};
      const items=c.lineIds.map(id=>{const u=need(lines[id],tk("core-commands-apply.u.need.e95acc024793")); delete lines[id]; return {lineId:u.id,fields:{variantId:u.variantId,language:u.language,ord:u.ord,kind:u.kind,text:u.text}};});
      for (const old of c.restore) { const now=need(lines[old.id],tk("core-commands-apply.now.need.15bd98231f3e")); lines[old.id]={...old,revision:rev(now)}; }
      return {state:{...s,translationLines:lines},inverse:{type:"AddTranslationLines",items,removeLineIds:c.restore.map(r=>r.id)},affected:[...c.lineIds,...c.restore.map(r=>r.id)]};
    }
    case "ApproveLineLinks":
    case "RejectLineLinks": {
      if ((!c.linkIds.length && !(c.type === "ApproveLineLinks" && c.additions?.length)) || c.linkIds.length > 400 || new Set(c.linkIds).size !== c.linkIds.length) fail("invalid",tk("core-commands-apply.run.fail.b05a24446829"));
      const links={...(s.translationLineLinks ?? {})}; const old: TranslationLineLink[]=[];
      for (const id of c.linkIds) {
        const link=need(links[id],tk("core-commands-apply.link.need.25ef8d16c50c"));
        // Approval needs valid lines; rejecting a stale link is always allowed.
        if (c.type === "ApproveLineLinks" && lineLinkError(s,link)) fail("invalid",tk("core-commands-apply.run.fail.38640f3a842b"));
        old.push(link); links[id]={...link,revision:rev(link),...(c.type === "ApproveLineLinks" ? {origin:"approved" as const,removed:false} : {removed:c.removed})};
      }
      const additions=c.type === "ApproveLineLinks" ? c.additions ?? [] : [];
      if (additions.length > 400) fail("invalid",tk("core-commands-apply.run.fail.d6270f98e85b"));
      for (const item of additions) {
        assertNewId(s,item.linkId);
        if (links[item.linkId] || lineLinkError(s,item.fields)) fail("invalid",tk("core-commands-apply.run.fail.63ed75e56b51"));
        const lvId=linkVersionId(s,item.fields);
        links[item.linkId]={...item.fields,id:item.linkId,origin:"approved",removed:false,revision:1,createdBy:env.actor,createdAt:env.at,...(lvId?{languageVersionId:lvId}:{})};
      }
      // New approval rows undo to removed receipts, preserving provenance and one transaction.
      const undoItems=[...old,...additions.map(item=>({...links[item.linkId],removed:true} as TranslationLineLink))];
      return {state:{...s,translationLineLinks:links},inverse:{type:"RestoreLineLinks",items:undoItems},affected:[...c.linkIds,...additions.map(i=>i.linkId)]};
    }
    case "RestoreLineLinks": {
      const links={...(s.translationLineLinks ?? {})}; const old: TranslationLineLink[]=[];
      for (const item of c.items) {
        const now=need(links[item.id],tk("core-commands-apply.now.need.c790eb8340c6"));
        // Undo restores receipts unchanged; only changed references must be valid.
        const sameRefs=item.variantId===now.variantId && item.language===now.language && item.sourceBlockIds.join()===now.sourceBlockIds.join() && item.targetTranslationIds.join()===now.targetTranslationIds.join();
        if (!item.removed && !sameRefs && lineLinkError(s,item)) fail("invalid",tk("core-commands-apply.run.fail.63ed75e56b51.2"));
        old.push(now);links[item.id]={...item,revision:rev(now)};
      }
      return {state:{...s,translationLineLinks:links},inverse:{type:"RestoreLineLinks",items:old},affected:c.items.map(i=>i.id)};
    }

    // P8 (REQ-0137–0145, REQ-0400–0402): stilharmonisering. Originalen endres aldri; resultatet er en ny
    // versjon (evt. på en ny variant) med metadata om kilde, modell, profil og bruksvalg.
    case "ApplyHarmonizedImage": {
      assertNewId(s,c.versionId); assertNewId(s,c.harmonizationId);
      let assetVariants=s.assetVariants; let createdVariant=false;
      if (c.newVariant) {
        assertNewId(s,c.variantId);
        need(s.assets[c.newVariant.assetId],tk("core-commands-apply.run.need.16680672678c"));
        assetVariants={...assetVariants,[c.variantId]:{id:c.variantId,revision:1,assetId:c.newVariant.assetId,...normalizeVariantFields(c.newVariant.fields),approvedVersionId:null,archived:c.newVariant.archived===true}};
        createdVariant=true;
      }
      const va=need(assetVariants[c.variantId],tk("core-commands-apply.va.need.315882a5547a"));
      const m=c.media;
      if (!m || typeof m.path!=="string" || typeof m.mimeType!=="string" || typeof m.sha256!=="string" || typeof c.note!=="string")
        fail("invalid",tk("core-commands-apply.run.fail.a055aa72fcb4"));
      if (!m.path.startsWith(`${s.project.id}/`) || m.path.length>600 || m.path.includes(".."))
        fail("invalid",tk("core-commands-apply.run.fail.c4078f3f4978"));
      if (!ASSET_MIME_TYPES.includes(m.mimeType))
        fail("invalid",tk("core-commands-apply.run.fail.bf6e905ff6b8"));
      if (!Number.isInteger(m.byteSize) || m.byteSize<=0 || m.byteSize>ASSET_MAX_BYTES)
        fail("invalid",tk("core-commands-apply.run.fail.f79f89233d6b"));
      if (!/^[0-9a-f]{64}$/.test(m.sha256)) fail("invalid",tk("core-commands-apply.run.fail.bacfc2e4bb12"));
      for (const d of [m.width,m.height]) if (d!==null && (!Number.isInteger(d) || d<=0 || d>100_000)) fail("invalid",tk("core-commands-apply.run.fail.ab33cacf5990"));
      if (c.note.length>2000) fail("invalid",tk("core-commands-apply.run.fail.55b1d38c8fdc"));
      if (c.fields.versionId!==c.versionId) fail("invalid",tk("core-commands-apply.run.fail.63e58e07cdaf"));
      const siblings=Object.values(s.assetVersions).filter((x)=>x.variantId===va.id);
      const number=siblings.reduce((n,x)=>Math.max(n,x.number),0)+1;
      const s2: ProjectState={...s,assetVariants,assetVersions:{...s.assetVersions,[c.versionId]:{id:c.versionId,revision:1,variantId:va.id,number,mediaPath:m.path,mimeType:m.mimeType,width:m.width,height:m.height,byteSize:m.byteSize,sha256:m.sha256,note:c.note.trim(),createdAt:env.at,createdBy:env.actor,durationMs:null}}};
      const herr=harmonizationError(s2,c.fields);
      if (herr) fail("invalid",herr);
      if (s.styleHarmonizations[c.harmonizationId]) fail("invalid",tk("core-commands-apply.run.fail.c869cd7afd05"));
      const h: StyleHarmonization={...c.fields,id:c.harmonizationId,revision:1,removed:false};
      return {state:{...s2,styleHarmonizations:{...s2.styleHarmonizations,[h.id]:h}},inverse:{type:"UndoApplyHarmonizedImage",harmonizationId:h.id,variantId:va.id,versionId:c.versionId,createdVariant},affected:[h.id,c.versionId,...(createdVariant?[va.id]:[])]};
    }
    case "UndoApplyHarmonizedImage": {
      const h=need(s.styleHarmonizations[c.harmonizationId],tk("core-commands-apply.h.need.19429948dc36"));
      const ver=need(s.assetVersions[c.versionId],tk("core-commands-apply.ver.need.f1d2238c110b"));
      const va=need(s.assetVariants[c.variantId],tk("core-commands-apply.va.need.315882a5547a.2"));
      if (usedByPresentation(s,"versions",ver.id) || usedByLayer(s,"versionId",ver.id))
        fail("referenced",tk("core-commands-apply.run.fail.186cc3ce7432"));
      const styleHarmonizations={...s.styleHarmonizations}; delete styleHarmonizations[h.id];
      const assetVersions={...s.assetVersions}; delete assetVersions[ver.id];
      const assetVariants: Record<string, typeof va> = { ...s.assetVariants };
      if (c.createdVariant) delete assetVariants[va.id];
      const media: AssetMedia={path:ver.mediaPath,mimeType:ver.mimeType,width:ver.width,height:ver.height,byteSize:ver.byteSize,sha256:ver.sha256};
      return {state:{...s,assetVariants,assetVersions,styleHarmonizations},inverse:{type:"ApplyHarmonizedImage",harmonizationId:h.id,variantId:va.id,versionId:ver.id,media,note:ver.note,fields:{versionId:h.versionId,sourceVersionId:h.sourceVersionId,model:h.model,qualityProfile:h.qualityProfile,styleProfileId:h.styleProfileId,referenceVersionId:h.referenceVersionId,use:h.use,note:h.note},...(c.createdVariant?{newVariant:{assetId:va.assetId,fields:{name:va.name,style:va.style,appearance:va.appearance}}}:{})},affected:[h.id,ver.id,...(c.createdVariant?[va.id]:[])]};
    }
    case "SetStyleHarmonization": {
      const old=(s.styleHarmonizations ?? {})[c.harmonizationId];
      if (!old) assertNewId(s,c.harmonizationId);
      if (!c.removed && harmonizationError(s,c.fields)) fail("invalid",tk("core-commands-apply.run.fail.7504824ae3d4"));
      const h: StyleHarmonization={...c.fields,id:c.harmonizationId,revision:old?rev(old):1,removed:c.removed===true};
      return {state:{...s,styleHarmonizations:{...(s.styleHarmonizations ?? {}),[h.id]:h}},inverse:old?{type:"RestoreStyleHarmonizations",items:[old]}:{type:"UndoAddStyleHarmonization",harmonizationId:h.id},affected:[h.id]};
    }
    case "UndoAddStyleHarmonization": {
      const old=need((s.styleHarmonizations ?? {})[c.harmonizationId],tk("core-commands-apply.old.need.2231b94d8754"));
      const hs={...(s.styleHarmonizations ?? {})}; delete hs[old.id];
      return {state:{...s,styleHarmonizations:hs},inverse:{type:"SetStyleHarmonization",harmonizationId:old.id,fields:{versionId:old.versionId,sourceVersionId:old.sourceVersionId,model:old.model,qualityProfile:old.qualityProfile,styleProfileId:old.styleProfileId,referenceVersionId:old.referenceVersionId,use:old.use,note:old.note}},affected:[old.id]};
    }
    case "RestoreStyleHarmonizations": {
      const hs={...(s.styleHarmonizations ?? {})}; const old: StyleHarmonization[]=[];
      for (const item of c.items) { const now=need(hs[item.id],tk("core-commands-apply.now.need.99c53bfc2c46")); old.push(now); hs[item.id]={...item,revision:rev(now)}; }
      return {state:{...s,styleHarmonizations:hs},inverse:{type:"RestoreStyleHarmonizations",items:old},affected:c.items.map(i=>i.id)};
    }
    case "SetPreferredStyleReference": {
      const perr=preferredReferenceError(s,c.fields);
      if (perr) fail("invalid",perr);
      const refs={...(s.stylePreferredReferences ?? {})};
      const old=Object.values(refs).find((r)=>!r.removed && r.assetId===c.fields.assetId && r.styleProfileId===c.fields.styleProfileId);
      const existing=refs[c.referenceId];
      if (existing && !existing.removed && old && existing.id!==old.id) fail("invalid",tk("core-commands-apply.run.fail.e5b83a67739d"));
      const restored: StylePreferredReference[]=[];
      if (old && old.id!==c.referenceId) { restored.push(old); refs[old.id]={...old,removed:true,revision:rev(old)}; }
      if (existing) restored.push(existing); else assertNewId(s,c.referenceId);
      refs[c.referenceId]={...c.fields,id:c.referenceId,revision:existing?rev(existing):1,removed:false};
      return {state:{...s,stylePreferredReferences:refs},inverse:{type:"UndoSetPreferredStyleReference",addedId:existing?null:c.referenceId,restored},affected:[c.referenceId,...(old&&old.id!==c.referenceId?[old.id]:[])]};
    }
    case "UndoSetPreferredStyleReference": {
      const refs={...(s.stylePreferredReferences ?? {})};
      let redo: { referenceId: string; fields: import("../generation/style-harmonize").StylePreferredReferenceFields } | null=null;
      if (c.addedId) { const added=need(refs[c.addedId],tk("core-commands-apply.added.need.6728f351666d")); redo={referenceId:added.id,fields:{assetId:added.assetId,styleProfileId:added.styleProfileId,variantId:added.variantId}}; delete refs[added.id]; }
      for (const item of c.restored) {
        const now=need(refs[item.id],tk("core-commands-apply.now.need.fc11998da1a2"));
        if (!redo && !item.removed) redo={referenceId:now.id,fields:{assetId:now.assetId,styleProfileId:now.styleProfileId,variantId:now.variantId}};
        refs[item.id]={...item,revision:rev(now)};
      }
      if (!redo) fail("invalid",tk("core-commands-apply.run.fail.9c1870afdd29"));
      return {state:{...s,stylePreferredReferences:refs},inverse:{type:"SetPreferredStyleReference",...redo},affected:[...(c.addedId?[c.addedId]:[]),...c.restored.map(r=>r.id)]};
    }


    case "AddTranslations": {
      if (!Array.isArray(c.items) || c.items.length === 0 || c.items.length > 2000)
        fail("invalid", tk("core-commands-apply.run.fail.e2c4b2494e3c"));
      const next = { ...s.translations };
      const taken = new Set(
        Object.values(s.translations)
          .filter((t) => !t.removed)
          .map(translationKey),
      );
      for (const it of c.items) {
        assertNewId(s, it.translationId);
        if (next[it.translationId])
          fail("invalid", tk("core-commands-apply.run.fail.35b90d37002a"));
        const f = translationFieldsOf(s, it.fields);
        // Én gjeldende oversettelse per linje og språk
        if (taken.has(translationKey(f)))
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.55e593008ba0"),
          );
        taken.add(translationKey(f));
        const lvId = versionIdFor(s, f.language);
        next[it.translationId] = { id: it.translationId, revision: 1, ...f, removed: false, ...(lvId ? { languageVersionId: lvId } : {}) };
      }
      const ids = c.items.map((x) => x.translationId);
      return {
        state: { ...s, translations: next },
        inverse: { type: "SetTranslationsRemoved", translationIds: ids, removed: true },
        affected: ids,
      };
    }

    case "UpdateTranslations": {
      if (!Array.isArray(c.items) || c.items.length === 0 || c.items.length > 2000)
        fail("invalid", tk("core-commands-apply.run.fail.e2c4b2494e3c.2"));
      const next = { ...s.translations };
      const old: { translationId: TranslationId; fields: TranslationFields }[] = [];
      for (const it of c.items) {
        const t = need(s.translations[it.translationId], tk("core-commands-apply.t.need.0f90ec539d53"));
        const f = translationFieldsOf(s, it.fields);
        if (translationKey(f) !== translationKey(t))
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.f7c5485df649"),
          );
        old.push({
          translationId: t.id,
          fields: {
            blockId: t.blockId,
            variantId: t.variantId,
            language: t.language,
            text: t.text,
            basedOnRev: t.basedOnRev,
            status: t.status,
          },
        });
        next[t.id] = { ...t, ...f, revision: rev(t) };
      }
      return {
        state: { ...s, translations: next },
        inverse: { type: "UpdateTranslations", items: old },
        affected: c.items.map((x) => x.translationId),
      };
    }

    case "SetTranslationsRemoved": {
      const next = { ...s.translations };
      const targetIds = new Set<string>(c.translationIds);
      const live = new Set(
        Object.values(s.translations)
          .filter((t) => !t.removed && !targetIds.has(t.id))
          .map(translationKey),
      );
      for (const id of c.translationIds) {
        const t = need(s.translations[id], tk("core-commands-apply.t.need.0f90ec539d53.2"));
        if (!c.removed && live.has(translationKey(t)))
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.5f893eb8b897"),
          );
        if (!c.removed) live.add(translationKey(t));
        next[id] = { ...t, removed: c.removed, revision: rev(t) };
      }
      return {
        state: { ...s, translations: next },
        inverse: {
          type: "SetTranslationsRemoved",
          translationIds: c.translationIds,
          removed: !c.removed,
        },
        affected: [...c.translationIds],
      };
    }

    case "SetActiveTake": {
      const o = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.o.need.19409a5cc0dd.16"));
      if (c.takeId !== null) {
        const t = need(s.takes[c.takeId], tk("core-commands-apply.t.need.183b43aa1e75.6"));
        const tOcc = need(
          s.occurrences[t.occurrenceId],
          tk("core-commands-apply.t-occ.need.ce56e174e65d"),
        );
        if (tOcc.sceneId !== o.sceneId)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.78b89c2d3a09.3"),
          );
      }
      return {
        state: {
          ...s,
          occurrences: {
            ...s.occurrences,
            [o.id]: { ...o, activeTakeId: c.takeId as TakeId | null, revision: rev(o) },
          },
        },
        inverse: { type: "SetActiveTake", occurrenceId: o.id, takeId: o.activeTakeId },
        affected: [o.id],
      };
    }

    case "ImportScreenplay": {
      need(s.productions[c.productionId], tk("core-commands-apply.run.need.2b6fa9163f18.3"));
      if (c.scenes.length === 0)
        fail("invalid", tk("core-commands-apply.run.fail.5088785b428c"));
      let st = s;
      const affected: string[] = [];
      for (const sc of c.scenes) {
        const r = run(st, {
          ...env,
          command: {
            type: "CreateScene",
            productionId: c.productionId,
            sceneId: sc.sceneId,
            variantId: sc.variantId,
            occurrenceId: sc.occurrenceId,
            orderKey: sc.orderKey,
            heading: sc.heading,
            blocks: sc.blocks,
            productionNumber: sc.productionNumber,
            headingUncertainty: sc.headingUncertainty ?? null,
          },
        });
        st = r.state;
        affected.push(...r.affected);
      }
      return {
        state: st,
        inverse: { type: "UndoImportScreenplay", productionId: c.productionId, scenes: c.scenes },
        affected,
      };
    }

    case "UndoImportScreenplay": {
      let st = s;
      const affected: string[] = [];
      for (const sc of [...c.scenes].reverse()) {
        const r = run(st, {
          ...env,
          command: {
            type: "UndoCreateScene",
            sceneId: sc.sceneId,
            variantId: sc.variantId,
            occurrenceId: sc.occurrenceId,
            blockIds: sc.blocks.map((b) => b.blockId),
          },
        });
        st = r.state;
        affected.push(...r.affected);
      }
      return {
        state: st,
        inverse: { type: "ImportScreenplay", productionId: c.productionId, scenes: c.scenes },
        affected,
      };
    }

    case "RemoveBlock":
    case "RestoreBlock": {
      const b = need(s.blocks[c.blockId], tk("core-commands-apply.b.need.440bfebc27b1.6"));
      assertCanEditVariant(s, c.productionId, b.variantId);
      const removed = c.type === "RemoveBlock";
      if (b.removed === removed)
        fail(
          "invalid",
          removed
            ? tk("core-commands-apply.run.fail.d22f37b10dd7")
            : tk("core-commands-apply.run.fail.7fd2f8806849"),
        );
      if (
        removed &&
        Object.values(s.segments).some((g) => g.startBlockId === b.id || g.endBlockId === b.id)
      ) {
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.39613296f878"),
        );
      }
      return {
        state: { ...s, blocks: { ...s.blocks, [b.id]: { ...b, removed, revision: rev(b) } } },
        inverse: {
          type: removed ? "RestoreBlock" : "RemoveBlock",
          productionId: c.productionId,
          blockId: b.id,
        },
        affected: [b.id],
      };
    }

    case "SetBlockKind": {
      const b = need(s.blocks[c.blockId], tk("core-commands-apply.b.need.440bfebc27b1.7"));
      assertCanEditVariant(s, c.productionId, b.variantId);
      if (b.kind === c.kind)
        fail("invalid", tk("core-commands-apply.run.fail.c6864d75c2e4"));
      return {
        state: { ...s, blocks: { ...s.blocks, [b.id]: { ...b, kind: c.kind, revision: rev(b) } } },
        inverse: {
          type: "SetBlockKind",
          productionId: c.productionId,
          blockId: b.id,
          kind: b.kind,
        },
        affected: [b.id],
      };
    }

    case "EditSceneHeading": {
      const v = need(s.variants[c.variantId], tk("core-commands-apply.v.need.cd0c858f5020"));
      assertCanEditVariant(s, c.productionId, v.id);
      return {
        state: {
          ...s,
          variants: { ...s.variants, [v.id]: { ...v, heading: c.heading, revision: rev(v) } },
        },
        inverse: {
          type: "EditSceneHeading",
          productionId: c.productionId,
          variantId: v.id,
          heading: v.heading,
        },
        affected: [v.id],
      };
    }

    case "SetUncertainty": {
      const b = s.blocks[c.targetId];
      if (b) {
        assertCanEditVariant(s, c.productionId, b.variantId);
        return {
          state: {
            ...s,
            blocks: { ...s.blocks, [b.id]: { ...b, uncertainty: c.uncertainty, revision: rev(b) } },
          },
          inverse: {
            type: "SetUncertainty",
            productionId: c.productionId,
            targetId: b.id,
            uncertainty: b.uncertainty,
          },
          affected: [b.id],
        };
      }
      const v = need(s.variants[c.targetId], tk("core-commands-apply.v.need.8d1f3017c293"));
      assertCanEditVariant(s, c.productionId, v.id);
      return {
        state: {
          ...s,
          variants: {
            ...s.variants,
            [v.id]: { ...v, uncertainty: c.uncertainty, revision: rev(v) },
          },
        },
        inverse: {
          type: "SetUncertainty",
          productionId: c.productionId,
          targetId: v.id,
          uncertainty: v.uncertainty,
        },
        affected: [v.id],
      };
    }

    case "SplitScene": {
      const occ = need(s.occurrences[c.occurrenceId], tk("core-commands-apply.occ.need.c74e3e0a72f5.2"));
      if (occ.productionId !== c.productionId)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.3bb30ed24241"),
        );
      assertCanEditVariant(s, c.productionId, occ.variantId);
      const variant = need(s.variants[occ.variantId], tk("core-commands-apply.variant.need.aee0968fe242.4"));
      const scene = need(s.scenes[occ.sceneId], tk("core-commands-apply.scene.need.89e5e8c309f1.3"));
      const blocks = Object.values(s.blocks)
        .filter((b) => b.variantId === variant.id && !b.removed)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
      const idx = blocks.findIndex((b) => b.id === c.atBlockId);
      if (idx < 0)
        fail(
          "not_found",
          tk("core-commands-apply.run.fail.df194d6d3a3f"),
        );
      if (idx === 0)
        fail("invalid", tk("core-commands-apply.run.fail.3a090d7e5697"));
      // Fjernede blokker etter delingspunktet følger med, så «Hent tilbake» legger dem i riktig scene
      const atKey = blocks[idx]!.orderKey;
      const moved = Object.values(s.blocks)
        .filter((b) => b.variantId === variant.id && compareKeys(b.orderKey, atKey) >= 0)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
      const movedIds = new Set(moved.map((b) => b.id as string));
      if (
        Object.values(s.segments).some(
          (g) =>
            (g.startBlockId && movedIds.has(g.startBlockId)) ||
            (g.endBlockId && movedIds.has(g.endBlockId)),
        )
      ) {
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.b87723b08a65"),
        );
      }
      assertNewId(s, c.newSceneId);
      assertNewId(s, c.newVariantId);
      const users = Object.values(s.occurrences).filter((o) => o.variantId === variant.id);
      // INV-04: splitting skal ikke legge til forekomster i andre produksjoner. Del varianten først (ForkVariant).
      if (users.some((u) => u.productionId !== c.productionId)) {
        fail(
          "must_fork_variant",
          tk("core-commands-apply.run.fail.43e5b3ba4810"),
        );
      }
      for (const u of users) {
        const nid = c.newOccurrenceIds[u.id];
        if (!nid)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.48bea132f6ca", { id: String(u.id) }),
          );
        assertNewId(s, nid);
      }
      if (
        new Set(Object.values(c.newOccurrenceIds)).size !== users.length ||
        Object.keys(c.newOccurrenceIds).length !== users.length
      ) {
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.c221967900f0"),
        );
      }
      const blocksNext = { ...s.blocks };
      for (const b of moved)
        blocksNext[b.id] = { ...b, variantId: c.newVariantId, revision: rev(b) };
      const occNext = { ...s.occurrences };
      // En planlagt lengde gjaldt hele scenen; etter delingen følger begge delene estimatet til brukeren
      // planlegger dem på nytt (ellers ville den første delen fått hele planen)
      const plans: Record<string, number> = {};
      for (const u of users)
        if (u.plannedMs !== undefined) {
          plans[u.id] = u.plannedMs;
          const { plannedMs: _p, ...rest } = u;
          occNext[u.id] = { ...rest, revision: rev(u) };
        }
      for (const u of users) {
        const after = Object.values(s.occurrences)
          .filter(
            (o) => o.productionId === u.productionId && compareKeys(o.orderKey, u.orderKey) > 0,
          )
          .sort((a, b) => compareKeys(a.orderKey, b.orderKey))[0];
        const nid = c.newOccurrenceIds[u.id]!;
        occNext[nid] = {
          id: nid,
          revision: 1,
          productionId: u.productionId,
          sceneId: c.newSceneId,
          variantId: c.newVariantId,
          orderKey: keyBetween(u.orderKey, after?.orderKey ?? null),
          active: u.active,
          excerpt: null,
          activeTakeId: null,
          productionNumber: null,
        };
      }
      return {
        state: {
          ...s,
          scenes: {
            ...s.scenes,
            [c.newSceneId]: {
              id: c.newSceneId,
              revision: 1,
              originProductionId: scene.originProductionId,
              storyTime: { kind: "linear", anchorSceneId: null, offset: 0 },
              derivedFromSceneId: scene.id,
              mergedIntoSceneId: null,
            },
          },
          variants: {
            ...s.variants,
            [c.newVariantId]: {
              id: c.newVariantId,
              revision: 1,
              sceneId: c.newSceneId,
              ownerProductionId: variant.ownerProductionId,
              basedOnVariantId: null,
              heading: c.heading,
              uncertainty: null,
            },
          },
          blocks: blocksNext,
          occurrences: occNext,
        },
        inverse: {
          type: "UndoSplitScene",
          split: {
            productionId: c.productionId,
            occurrenceId: c.occurrenceId,
            atBlockId: c.atBlockId,
            newSceneId: c.newSceneId,
            newVariantId: c.newVariantId,
            newOccurrenceIds: c.newOccurrenceIds,
            heading: c.heading,
          },
          originalVariantId: variant.id,
          ...(Object.keys(plans).length ? { plans } : {}),
        },
        affected: [
          c.newSceneId,
          c.newVariantId,
          ...Object.values(c.newOccurrenceIds),
          ...movedIds,
          ...Object.keys(plans),
        ],
      };
    }

    case "UndoSplitScene": {
      const sp = c.split;
      const newScene = need(s.scenes[sp.newSceneId], tk("core-commands-apply.new-scene.need.4930163eb96a"));
      const nv = need(s.variants[sp.newVariantId], tk("core-commands-apply.nv.need.4ffe9578935b"));
      const ov = need(
        s.variants[c.originalVariantId],
        tk("core-commands-apply.ov.need.7aeb626b4981"),
      );
      // Bare en ekte deling kan slås tilbake (kan ikke brukes til å slette eller flytte vilkårlige scener)
      if (
        nv.sceneId !== newScene.id ||
        newScene.derivedFromSceneId === null ||
        ov.sceneId !== newScene.derivedFromSceneId ||
        nv.ownerProductionId !== ov.ownerProductionId
      ) {
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.d120470befda"),
        );
      }
      assertCanEditVariant(s, sp.productionId, ov.id);
      for (const [oldId, newId] of Object.entries(sp.newOccurrenceIds)) {
        const o = s.occurrences[newId];
        const old = s.occurrences[oldId];
        if (
          !o ||
          o.sceneId !== newScene.id ||
          o.variantId !== nv.id ||
          !old ||
          old.variantId !== ov.id
        ) {
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.2dada8685f83"),
          );
        }
      }
      if (
        Object.values(s.scenes).some(
          (x) => x.mergedIntoSceneId === newScene.id || x.derivedFromSceneId === newScene.id,
        )
      ) {
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.8af60a51bbfe"),
        );
      }
      if (Object.values(s.scenes).some((x) => x.storyTime.anchorSceneId === newScene.id)) {
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.5a4520e2607b"),
        );
      }
      {
        const keys = new Set(
          Object.values(s.blocks)
            .filter((b) => b.variantId === ov.id)
            .map((b) => b.orderKey),
        );
        if (Object.values(s.blocks).some((b) => b.variantId === nv.id && keys.has(b.orderKey))) {
          fail(
            "referenced",
            tk("core-commands-apply.run.fail.fa1e6dfea9a5"),
          );
        }
      }
      const newOccIds = new Set(Object.values(sp.newOccurrenceIds) as string[]);
      if (
        Object.values(s.occurrences).some(
          (o) => o.sceneId === sp.newSceneId && !newOccIds.has(o.id),
        )
      ) {
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.b72075d1a48f"),
        );
      }
      if (
        Object.values(s.takes).some((t) => newOccIds.has(t.occurrenceId)) ||
        Object.values(s.segments).some((g) => newOccIds.has(g.occurrenceId))
      ) {
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.741a0d26bdf1"),
        );
      }
      const blocksNext = { ...s.blocks };
      for (const b of Object.values(s.blocks))
        if (b.variantId === nv.id)
          blocksNext[b.id] = { ...b, variantId: c.originalVariantId, revision: rev(b) };
      const occNext = { ...s.occurrences };
      for (const id of newOccIds) delete occNext[id];
      // Planlagte lengder delingen fjernet, settes tilbake (bare på forekomstene som ble delt)
      const restored: string[] = [];
      for (const [id, ms] of Object.entries(c.plans ?? {})) {
        const o = occNext[id];
        if (!o || !Object.hasOwn(occNext, id) || !Object.hasOwn(sp.newOccurrenceIds, id))
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.869ee7c87423"),
          );
        if (!Number.isInteger(ms) || ms < MIN_PLANNED_MS || ms > MAX_PLANNED_MS)
          fail("invalid", tk("core-commands-apply.run.fail.0de9cece4a6c"));
        occNext[id] = { ...o!, plannedMs: ms, revision: rev(o!) };
        restored.push(id);
      }
      // En plan satt på en del etter delingen gjaldt bare den delen; den gjelder ikke hele scenen (KI-150)
      for (const id of Object.keys(sp.newOccurrenceIds)) {
        const o = occNext[id];
        if (!o || Object.hasOwn(c.plans ?? {}, id) || o.plannedMs === undefined) continue;
        const { plannedMs: _p, ...rest } = o;
        occNext[id] = { ...rest, revision: rev(o) };
        restored.push(id);
      }
      const { [sp.newSceneId]: _sc, ...scenes } = s.scenes;
      const { [sp.newVariantId]: _v, ...variants } = s.variants;
      return {
        state: { ...s, scenes, variants, blocks: blocksNext, occurrences: occNext },
        inverse: { type: "SplitScene", ...sp },
        affected: [
          sp.newSceneId,
          sp.newVariantId,
          ...newOccIds,
          ...restored,
          ...Object.values(s.blocks)
            .filter((b) => b.variantId === nv.id)
            .map((b) => b.id),
        ],
      };
    }

    case "MergeScenes": {
      const target = need(s.occurrences[c.targetOccurrenceId], tk("core-commands-apply.target.need.02f9cc4b6c43"));
      const source = need(
        s.occurrences[c.sourceOccurrenceId],
        tk("core-commands-apply.source.need.f40c5d3b1836"),
      );
      if (target.productionId !== c.productionId || source.productionId !== c.productionId)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.60295d0f1b8d"),
        );
      if (target.sceneId === source.sceneId)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.be2b3c18c49f"),
        );
      assertCanEditVariant(s, c.productionId, target.variantId);
      assertCanEditVariant(s, c.productionId, source.variantId);
      const sourceScene = need(s.scenes[source.sceneId], tk("core-commands-apply.source-scene.need.060816a20844"));
      if (sourceScene.mergedIntoSceneId !== null)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.a2eb0aadc766"),
        );
      if (
        need(s.scenes[target.sceneId], tk("core-commands-apply.run.need.6b06525f1944")).mergedIntoSceneId !==
        null
      )
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.3a2a99026f70"),
        );
      if (
        Object.values(s.occurrences).some((o) => o.sceneId === source.sceneId && o.id !== source.id)
      ) {
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.230a43d67c98"),
        );
      }
      if (Object.values(s.segments).some((g) => g.occurrenceId === source.id))
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.3924a1226a78"),
        );
      // INV-04: teksten i en scene som også brukes i andre produksjoner endres ikke herfra
      if (
        Object.values(s.occurrences).some(
          (o) => o.variantId === target.variantId && o.productionId !== c.productionId,
        )
      ) {
        fail(
          "must_fork_variant",
          tk("core-commands-apply.run.fail.1d0d38be4995"),
        );
      }
      const targetBlocks = Object.values(s.blocks)
        .filter((b) => b.variantId === target.variantId)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
      const sourceBlocks = Object.values(s.blocks)
        .filter((b) => b.variantId === source.variantId)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
      let lastKey = targetBlocks.length ? targetBlocks[targetBlocks.length - 1]!.orderKey : null;
      const blocksNext = { ...s.blocks };
      const placements = sourceBlocks.map((b) => ({
        blockId: b.id,
        variantId: b.variantId,
        orderKey: b.orderKey,
      }));
      for (const b of sourceBlocks) {
        lastKey = keyBetween(lastKey, null);
        blocksNext[b.id] = {
          ...b,
          variantId: target.variantId,
          orderKey: lastKey,
          revision: rev(b),
        };
      }
      return {
        state: {
          ...s,
          blocks: blocksNext,
          scenes: {
            ...s.scenes,
            [sourceScene.id]: {
              ...sourceScene,
              mergedIntoSceneId: target.sceneId,
              revision: rev(sourceScene),
            },
          },
          occurrences: {
            ...s.occurrences,
            [source.id]: { ...source, active: false, revision: rev(source) },
            // Målscenen får kildens innhold: en planlagt lengde for den gamle målscenen stemmer ikke
            // lenger, så den følger estimatet til brukeren planlegger på nytt
            ...(target.plannedMs !== undefined
              ? (() => {
                  const { plannedMs: _p, ...rest } = target;
                  return { [target.id]: { ...rest, revision: rev(target) } };
                })()
              : {}),
          },
        },
        inverse: {
          type: "UnmergeScenes",
          productionId: c.productionId,
          targetOccurrenceId: target.id,
          sourceOccurrenceId: source.id,
          placements,
          sourceWasActive: source.active,
          ...(target.plannedMs !== undefined ? { targetPlannedMs: target.plannedMs } : {}),
        },
        affected: [
          sourceScene.id,
          source.id,
          ...(target.plannedMs !== undefined ? [target.id] : []),
          ...placements.map((p) => p.blockId),
        ],
      };
    }

    case "UnmergeScenes": {
      const source = need(
        s.occurrences[c.sourceOccurrenceId],
        tk("core-commands-apply.source.need.f40c5d3b1836.2"),
      );
      const sourceScene = need(s.scenes[source.sceneId], tk("core-commands-apply.source-scene.need.060816a20844.2"));
      if (sourceScene.mergedIntoSceneId === null)
        fail("invalid", tk("core-commands-apply.run.fail.a3e3956d19b7"));
      const target = need(s.occurrences[c.targetOccurrenceId], tk("core-commands-apply.target.need.02f9cc4b6c43.2"));
      if (
        sourceScene.mergedIntoSceneId !== target.sceneId ||
        source.productionId !== c.productionId
      ) {
        fail("invalid", tk("core-commands-apply.run.fail.103b48d942c6"));
      }
      assertCanEditVariant(s, c.productionId, source.variantId);
      if (new Set(c.placements.map((p) => p.blockId)).size !== c.placements.length) {
        fail("invalid", tk("core-commands-apply.run.fail.83b56eb08225"));
      }
      {
        // Sammenslåingen la kildens blokker sist i målscenen, og kildescenen ble tom
        const inTarget = Object.values(s.blocks)
          .filter((b) => b.variantId === target.variantId)
          .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
        const tail = new Set(
          inTarget.slice(inTarget.length - c.placements.length).map((b) => b.id as string),
        );
        const sourceEmpty = !Object.values(s.blocks).some((b) => b.variantId === source.variantId);
        if (
          !sourceEmpty ||
          c.placements.length > inTarget.length ||
          c.placements.some((p) => !tail.has(p.blockId))
        ) {
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.64b1464b43e6"),
          );
        }
      }
      for (const p of c.placements) {
        const b = need(s.blocks[p.blockId], tk("core-commands-apply.b.need.e4b7085bbc3f.4"));
        if (b.variantId !== target.variantId || p.variantId !== source.variantId) {
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.8d7b886c2d39"),
          );
        }
        assertKey(p.orderKey);
      }
      const blocksNext = { ...s.blocks };
      for (const p of c.placements) {
        const b = need(s.blocks[p.blockId], tk("core-commands-apply.b.need.e4b7085bbc3f.5"));
        blocksNext[b.id] = { ...b, variantId: p.variantId, orderKey: p.orderKey, revision: rev(b) };
      }
      return {
        state: {
          ...s,
          blocks: blocksNext,
          scenes: {
            ...s.scenes,
            [sourceScene.id]: {
              ...sourceScene,
              mergedIntoSceneId: null,
              revision: rev(sourceScene),
            },
          },
          occurrences: {
            ...s.occurrences,
            [source.id]: { ...source, active: c.sourceWasActive, revision: rev(source) },
            ...(c.targetPlannedMs !== undefined
              ? {
                  [target.id]: {
                    ...target,
                    plannedMs: plannedOrFail(c.targetPlannedMs),
                    revision: rev(target),
                  },
                }
              : target.plannedMs !== undefined
                ? // En plan satt etter sammenslåingen gjaldt begge scenene; ikke målscenen alene (KI-150)
                  (() => {
                    const { plannedMs: _p, ...rest } = target;
                    return { [target.id]: { ...rest, revision: rev(target) } };
                  })()
                : {}),
          },
        },
        inverse: {
          type: "MergeScenes",
          productionId: c.productionId,
          targetOccurrenceId: c.targetOccurrenceId,
          sourceOccurrenceId: c.sourceOccurrenceId,
        },
        affected: [
          sourceScene.id,
          source.id,
          ...(c.targetPlannedMs !== undefined || target.plannedMs !== undefined ? [target.id] : []),
          ...c.placements.map((p) => p.blockId),
        ],
      };
    }

    case "SetStoryTime": {
      const sc = need(s.scenes[c.sceneId], tk("core-commands-apply.sc.need.e5b3af0e559f"));
      validStoryTime(s, sc.id, c.storyTime);
      return {
        state: {
          ...s,
          scenes: { ...s.scenes, [sc.id]: { ...sc, storyTime: c.storyTime, revision: rev(sc) } },
        },
        inverse: { type: "SetStoryTime", sceneId: sc.id, storyTime: sc.storyTime },
        affected: [sc.id],
      };
    }

    // ---------- Ressursbiblioteket (M3 del 1) ----------
    case "CreateAssets": {
      if (c.assets.length === 0)
        fail("invalid", tk("core-commands-apply.run.fail.0baef55845f5"));
      if (c.assets.length > 500)
        fail("invalid", tk("core-commands-apply.run.fail.7d1aa6425f36"));
      const seen = new Set<string>();
      const assets = { ...s.assets };
      for (const x of c.assets) {
        assertNewId(s, x.assetId);
        if (seen.has(x.assetId))
          fail(
            "duplicate_id",
            tk("core-commands-apply.run.fail.dd3ff8542967", { assetId: String(x.assetId) }),
          );
        seen.add(x.assetId);
        assets[x.assetId] = {
          id: x.assetId,
          revision: 1,
          ...normalizeAssetFields(x.fields),
          archived: x.archived === true,
          ...(x.globalAssetId !== undefined
            ? { globalAssetId: globalRef(x.globalAssetId) }
            : {}),
        };
      }
      return {
        state: { ...s, assets },
        inverse: { type: "UndoCreateAssets", assetIds: c.assets.map((x) => x.assetId) },
        affected: [...seen],
      };
    }

    case "UndoCreateAssets": {
      const assets = { ...s.assets };
      for (const id of c.assetIds) {
        need(s.assets[id], tk("core-commands-apply.run.need.16680672678c.2"));
        if (usedByPresentation(s, "assets", id))
          fail(
            "referenced",
            tk("core-commands-apply.run.fail.3fad1e23074d"),
          );
        if (usedByLayer(s, "assetId", id))
          fail(
            "referenced",
            tk("core-commands-apply.run.fail.1d6c8b0c6a60"),
          );
        if (Object.values(s.assetVariants).some((v) => v.assetId === id))
          fail(
            "referenced",
            tk("core-commands-apply.run.fail.a36288d20fae"),
          );
        // Stemme, betegnelser og lydkoblinger følger ikke med når opprettelsen gjøres om igjen; da angres
        // ikke opprettelsen (ingen andres arbeid skal gå tapt i stillhet)
        const extra = s.assets[id]!;
        if (extra.voice || extra.contextNames?.length || extra.soundLinks?.length)
          fail(
            "referenced",
            tk("core-commands-apply.run.fail.1cf8022c5866"),
          );
        delete assets[id];
      }
      return {
        state: { ...s, assets },
        inverse: {
          type: "CreateAssets",
          assets: c.assetIds.map((id) => {
            const a = s.assets[id]!;
            return {
              assetId: a.id,
              fields: {
                kind: a.kind,
                name: a.name,
                names: a.names,
                description: a.description,
                category: a.category,
                tags: a.tags,
              },
              ...(a.archived ? { archived: true } : {}),
              ...(a.globalAssetId ? { globalAssetId: a.globalAssetId } : {}),
            };
          }),
        },
        affected: [...c.assetIds],
      };
    }

    case "UpdateAsset": {
      const a = need(s.assets[c.assetId], tk("core-commands-apply.a.need.f66a94bd1bc8.3"));
      if ((a.kind === "template") !== (c.fields.kind === "template") || (a.kind === "font") !== (c.fields.kind === "font"))
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.75cc6abb04c4"),
        );
      return {
        state: {
          ...s,
          assets: {
            ...s.assets,
            [a.id]: { ...a, ...normalizeAssetFields(c.fields), revision: rev(a) },
          },
        },
        inverse: {
          type: "UpdateAsset",
          assetId: a.id,
          fields: {
            kind: a.kind,
            name: a.name,
            names: a.names,
            description: a.description,
            category: a.category,
            tags: a.tags,
          },
        },
        affected: [a.id],
      };
    }

    case "PlanAssetInScenes": {
      const a = need(s.assets[c.assetId], tk("core-commands-apply.a.need.f66a94bd1bc8.4"));
      const taskId = checkTaskId(c.taskId);
      need(s.occurrences[c.fromOccurrenceId as never], tk("core-commands-apply.run.need.594b13c00857.4"));
      if (
        !Array.isArray(c.occurrenceIds) ||
        c.occurrenceIds.length === 0 ||
        c.occurrenceIds.length > 500
      )
        fail("invalid", tk("core-commands-apply.run.fail.5de6b7f2e487"));
      const ids = [...new Set(c.occurrenceIds.map(String))];
      for (const id of ids) need(s.occurrences[id as never], tk("core-commands-apply.run.need.594b13c00857.5"));
      const before = a.scenePlans ?? [];
      const plans = [
        ...before.filter((p) => !ids.includes(p.occurrenceId)),
        ...ids.map((occurrenceId) => ({
          occurrenceId,
          taskId,
          fromOccurrenceId: c.fromOccurrenceId,
          at: env.at,
        })),
      ];
      if (plans.length > 1000)
        fail("invalid", tk("core-commands-apply.run.fail.c7a02efe7e5d"));
      return {
        state: {
          ...s,
          assets: { ...s.assets, [a.id]: { ...a, scenePlans: plans, revision: rev(a) } },
        },
        inverse: { type: "SetScenePlans", assetId: a.id, plans: before },
        affected: [a.id],
      };
    }

    case "RemoveScenePlans": {
      const a = need(s.assets[c.assetId], tk("core-commands-apply.a.need.f66a94bd1bc8.5"));
      const before = a.scenePlans ?? [];
      const only = c.occurrenceIds ? new Set(c.occurrenceIds.map(String)) : null;
      const plans = before.filter(
        (p) =>
          !(
            (c.taskId === undefined || p.taskId === c.taskId) &&
            (!only || only.has(p.occurrenceId))
          ),
      );
      return {
        state: {
          ...s,
          assets: { ...s.assets, [a.id]: { ...a, scenePlans: plans, revision: rev(a) } },
        },
        inverse: { type: "SetScenePlans", assetId: a.id, plans: before },
        affected: [a.id],
      };
    }

    case "SetScenePlans": {
      const a = need(s.assets[c.assetId], tk("core-commands-apply.a.need.f66a94bd1bc8.6"));
      if (!Array.isArray(c.plans) || c.plans.length > 1000)
        fail("invalid", tk("core-commands-apply.run.fail.c7a02efe7e5d.2"));
      const plans = c.plans.map((p) => ({
        occurrenceId: String(p.occurrenceId),
        taskId: checkTaskId(p.taskId),
        fromOccurrenceId: String(p.fromOccurrenceId),
        at: String(p.at),
      }));
      return {
        state: {
          ...s,
          assets: { ...s.assets, [a.id]: { ...a, scenePlans: plans, revision: rev(a) } },
        },
        inverse: { type: "SetScenePlans", assetId: a.id, plans: a.scenePlans ?? [] },
        affected: [a.id],
      };
    }

    case "SetContextNames": {
      const a = need(s.assets[c.assetId], tk("core-commands-apply.a.need.f66a94bd1bc8.7"));
      if (!Array.isArray(c.contextNames) || c.contextNames.length > 200)
        fail("invalid", tk("core-commands-apply.run.fail.8135b7ff01bd"));
      const before = a.contextNames ?? [];
      const known = new Set(before.flatMap((x) => x.blockIds));
      const names = new Set<string>();
      const list: ContextName[] = [];
      for (const n of c.contextNames) {
        const name = typeof n?.name === "string" ? n.name.trim().replace(/\s+/g, " ") : "";
        if (!name || name.length > 80)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.26e35ec964d5"),
          );
        const key = name.toLocaleLowerCase("nb");
        if (names.has(key))
          fail("invalid", tk("core-commands-apply.run.fail.7b9b5db3437a"));
        names.add(key);
        if (!Array.isArray(n.blockIds) || n.blockIds.length === 0 || n.blockIds.length > 2000)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.5453d6443268"),
          );
        const ids: string[] = [
          ...new Set<string>((n.blockIds as readonly unknown[]).map((x: unknown) => String(x))),
        ];
        for (const id of ids)
          if (!s.blocks[id] && !known.has(id) && !(c.restore === true && isUuid(id)))
            fail(
              "not_found",
              tk("core-commands-apply.run.fail.d9d5816ec86b"),
            );
        list.push({ name, blockIds: ids });
      }
      return {
        state: {
          ...s,
          assets: { ...s.assets, [a.id]: { ...a, contextNames: list, revision: rev(a) } },
        },
        inverse: { type: "SetContextNames", assetId: a.id, contextNames: before, restore: true },
        affected: [a.id],
      };
    }

    case "SetReviewedVersions": {
      if (
        !Array.isArray(c.versionIds) ||
        c.versionIds.length > 200 ||
        c.versionIds.some((v) => typeof v !== "string" || !s.assetVersions[v])
      )
        fail("invalid", tk("core-commands-apply.run.fail.148502dada3b"));
      const ids = [...new Set(c.versionIds)];
      if (c.target === "layer") {
        const l = need(s.layers[c.id], tk("core-commands-apply.l.need.80c6bba9c7a0.2"));
        return {
          state: {
            ...s,
            layers: {
              ...s.layers,
              [l.id]: { ...l, reviewedVersions: ids, revision: rev(l) },
            },
          },
          inverse: {
            type: "SetReviewedVersions",
            target: "layer",
            id: l.id,
            versionIds: l.reviewedVersions ?? [],
          },
          affected: [l.id],
        };
      }
      if (c.target !== "take") fail("invalid", tk("core-commands-apply.run.fail.816b7399a39c"));
      const t = need(s.takes[c.id], tk("core-commands-apply.t.need.183b43aa1e75.7"));
      return {
        state: {
          ...s,
          takes: { ...s.takes, [t.id]: { ...t, reviewedVersions: ids, revision: rev(t) } },
        },
        inverse: {
          type: "SetReviewedVersions",
          target: "take",
          id: t.id,
          versionIds: t.reviewedVersions ?? [],
        },
        affected: [t.id],
      };
    }

    case "SetExportSettings": {
      const p = need(s.productions[c.productionId], tk("core-commands-apply.p.need.83aa7f655d8e.5"));
      const x = c.settings;
      if (
        x !== null &&
        (typeof x !== "object" ||
          (x.size !== "full" && x.size !== "half") ||
          typeof x.monochrome !== "boolean" ||
          (x.output !== "video" && x.output !== "dialogue"))
      )
        fail("invalid", tk("core-commands-apply.run.fail.cd7f81e8e704"));
      // Tittelsiden (KI-20): utelatt = beholdes, null = fjernes
      let titlePage: readonly string[] | undefined = p.exportSettings?.titlePage;
      if (x !== null && x.titlePage !== undefined) {
        if (x.titlePage === null) titlePage = undefined;
        else {
          if (
            !Array.isArray(x.titlePage) ||
            x.titlePage.some((l) => typeof l !== "string" || l.length > TITLE_PAGE_MAX_LINE) ||
            x.titlePage.length > TITLE_PAGE_MAX_LINES
          )
            fail("invalid", tk("core-commands-apply.run.fail.b157f12cec83"));
          titlePage = [...x.titlePage];
        }
      }
      // «Inkluder rulletekst» (MTS MT8): utelatt = beholdes, standard er på
      let includeCredits = p.exportSettings?.includeCredits;
      if (x !== null && x.includeCredits !== undefined) {
        if (x.includeCredits !== null && typeof x.includeCredits !== "boolean")
          fail("invalid", tk("core-commands-apply.run.fail.cd7f81e8e704.2"));
        includeCredits = x.includeCredits ?? undefined;
      }
      const settings: ExportSettings | null =
        x === null
          ? null
          : {
              size: x.size,
              monochrome: x.monochrome,
              output: x.output,
              ...(titlePage !== undefined ? { titlePage } : {}),
              ...(includeCredits !== undefined ? { includeCredits } : {}),
            };
      if (
        settings &&
        (exportSettingsBytes(settings) > EXPORT_SETTINGS_MAX_BYTES - 512 ||
          (settings.titlePage &&
            new TextEncoder().encode(JSON.stringify(settings.titlePage)).byteLength >
              TITLE_PAGE_MAX_BYTES))
      )
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.9c390cecc6a7"),
        );
      const prev = p.exportSettings ?? null;
      return {
        state: {
          ...s,
          productions: {
            ...s.productions,
            [p.id]: { ...p, exportSettings: settings, revision: rev(p) },
          },
        },
        inverse: {
          type: "SetExportSettings",
          productionId: p.id,
          // Tittelsiden settes alltid tilbake nøyaktig (null = fantes ikke)
          settings: prev === null ? null : { ...prev, titlePage: prev.titlePage ?? null },
        },
        affected: [p.id],
      };
    }

    case "SetDurationAssumptions": {
      // Felles for prosjektet (KI-28); null fjerner dem (standardverdiene gjelder)
      const next =
        c.assumptions === null ? null : normalizeDurationAssumptions(c.assumptions as unknown);
      if (c.assumptions !== null && next === null)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.0b04d1ada500"),
        );
      const prev = s.project.durationAssumptions ?? null;
      if (prev === next || (prev !== null && next !== null && sameDurationAssumptions(prev, next)))
        fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.16"));
      const { durationAssumptions: _old, ...rest } = s.project;
      const project =
        next === null
          ? { ...rest, revision: s.project.revision + 1 }
          : { ...rest, durationAssumptions: next, revision: s.project.revision + 1 };
      return {
        state: { ...s, project },
        inverse: { type: "SetDurationAssumptions", assumptions: prev },
        affected: [s.project.id],
      };
    }

    case "SetTakeCoverage": {
      const t = need(s.takes[c.takeId], tk("core-commands-apply.t.need.183b43aa1e75.8"));
      if (t.kind !== "imported_film" && t.kind !== "ai_video")
        fail("invalid", tk("core-commands-apply.run.fail.57f46e91a350"));
      const cov = c.coverage;
      if (cov !== null) {
        const o = need(s.occurrences[t.occurrenceId], tk("core-commands-apply.o.need.6a267a80d65f.4"));
        const order = blocksOfVariant(s, o.variantId)
          .filter((b) => b.kind !== "heading")
          .map((b) => b.id as string);
        const a = order.indexOf(cov?.startBlockId);
        const b = order.indexOf(cov?.endBlockId);
        if (a < 0 || b < 0)
          fail("not_found", tk("core-commands-apply.run.fail.86af62095c51"));
        if (b < a)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.b44b446a1898"),
          );
      }
      return {
        state: {
          ...s,
          takes: {
            ...s.takes,
            [t.id]: {
              ...t,
              coverage: cov ? { startBlockId: cov.startBlockId, endBlockId: cov.endBlockId } : null,
              revision: rev(t),
            },
          },
        },
        inverse: { type: "SetTakeCoverage", takeId: t.id, coverage: t.coverage ?? null },
        affected: [t.id],
      };
    }

    case "SetAssetVoice": {
      const a = need(s.assets[c.assetId], tk("core-commands-apply.a.need.f66a94bd1bc8.8"));
      if (a.kind !== "character" && a.kind !== "animal" && a.kind !== "other")
        fail("invalid", tk("core-commands-apply.run.fail.911f0cdc2360"));
      const v = c.voice;
      const voiceError = assetVoiceError(v);
      if (voiceError) fail("invalid", voiceError);
      return {
        state: {
          ...s,
          assets: {
            ...s.assets,
            [a.id]: {
              ...a,
              voice: v ? { ...v, label: v.label.trim(), ...(v.settings ? { settings: { ...v.settings } } : {}) } : null,
              revision: rev(a),
            },
          },
        },
        inverse: { type: "SetAssetVoice", assetId: a.id, voice: a.voice ?? null },
        affected: [a.id],
      };
    }

    case "SetDialogueCharacter":
    case "RestoreDialogueCharacters": {
      const links = c.type === "SetDialogueCharacter" ? c.clipIds.map(clipId => ({ clipId, characterAssetId: c.characterAssetId })) : c.links;
      if (!links.length || links.length > 1000) fail("invalid", tk("core-commands-apply.run.fail.107468d41a87"));
      const audioClips = { ...s.audioClips };
      const back: { clipId: AudioClipId; characterAssetId: AssetId | null }[] = [];
      for (const link of links) {
        const clip = need(s.audioClips[link.clipId], tk("core-commands-apply.clip.need.4362655cd77c"));
        if (clip.removed || !isVersionedKind(clip)) fail("invalid", tk("core-commands-apply.run.fail.0931cc58239e"));
        const asset = link.characterAssetId ? s.assets[link.characterAssetId] : null;
        if (link.characterAssetId && (!asset || asset.removed || !["character", "animal", "other"].includes(asset.kind)))
          fail("invalid", tk("core-commands-apply.run.fail.8ae79a8d027f"));
        back.push({ clipId: clip.id, characterAssetId: (clip.characterAssetId ?? null) as AssetId | null });
        audioClips[clip.id] = { ...clip, characterAssetId: link.characterAssetId, revision: rev(clip) };
      }
      return { state: { ...s, audioClips }, inverse: { type: "RestoreDialogueCharacters", links: back }, affected: links.map(l => l.clipId) };
    }

    case "SetSoundLinks": {
      const a = need(s.assets[c.assetId], tk("core-commands-apply.a.need.f66a94bd1bc8.9"));
      if (a.kind !== "sound")
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.8d087d9077db"),
        );
      if (!Array.isArray(c.links) || c.links.length > MAX_SOUND_LINKS)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.7641448ad8b5", { MAX_SOUND_LINKS: String(MAX_SOUND_LINKS) }),
        );
      const seen = new Set<string>();
      const links: SoundLink[] = [];
      const KINDS = ["asset", "block", "scene", "segment", "event", "production"];
      for (const l of c.links) {
        if (!l || !KINDS.includes(l.kind)) fail("invalid", tk("core-commands-apply.run.fail.3bc025bf2c59"));
        if (!l || typeof l.id !== "string") fail("invalid", tk("core-commands-apply.run.fail.3bc025bf2c59.2"));
        const key = `${l.kind}:${l.id}`;
        if (seen.has(key)) fail("invalid", tk("core-commands-apply.run.fail.bcfaf6077b74"));
        seen.add(key);
        const exists =
          l.kind === "asset"
            ? !!s.assets[l.id] && l.id !== a.id
            : l.kind === "block"
              ? !!s.blocks[l.id]
              : l.kind === "scene"
                ? !!s.scenes[l.id]
                : l.kind === "segment"
                  ? !!s.segments[l.id]
                  : l.kind === "event"
                    ? !!s.continuityEvents[l.id]
                    : l.kind === "production"
                      ? !!s.productions[l.id]
                      : false;
        // Nye koblinger må peke på noe som finnes. En kobling til noe som siden er fjernet, kan stå, fjernes
        // og settes tilbake ved angring (permanent ID; vises som «finnes ikke lenger»).
        const kept = (a.soundLinks ?? []).some((x) => x.kind === l.kind && x.id === l.id);
        if (!exists && !kept && !(c.restore === true && isUuid(l.id)))
          fail(
            "not_found",
            tk("core-commands-apply.run.fail.09df275a8cce"),
          );
        links.push({ kind: l.kind, id: l.id });
      }
      const before = a.soundLinks ?? [];
      if (
        before.length === links.length &&
        before.every((x, i) => x.kind === links[i]!.kind && x.id === links[i]!.id)
      )
        fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.17"));
      return {
        state: {
          ...s,
          assets: { ...s.assets, [a.id]: { ...a, soundLinks: links, revision: rev(a) } },
        },
        inverse: { type: "SetSoundLinks", assetId: a.id, links: before, restore: true },
        affected: [a.id],
      };
    }

    case "SetAssetArchived": {
      const a = need(s.assets[c.assetId], tk("core-commands-apply.a.need.f66a94bd1bc8.10"));
      return {
        state: {
          ...s,
          assets: { ...s.assets, [a.id]: { ...a, archived: c.archived, revision: rev(a) } },
        },
        inverse: { type: "SetAssetArchived", assetId: a.id, archived: a.archived },
        affected: [a.id],
      };
    }

    case "SetAssetsRemoved": {
      if (!Array.isArray(c.assetIds) || c.assetIds.length === 0 || c.assetIds.length > 500)
        fail("invalid", tk("core-commands-apply.run.fail.41a4d4f2b9ce"));
      const assets = { ...s.assets };
      const before: (typeof c.assetIds)[number][] = [];
      for (const id of new Set(c.assetIds)) {
        const a = need(s.assets[id], tk("core-commands-apply.a.need.f66a94bd1bc8.11"));
        if ((a.removed === true) === c.removed) continue;
        const { removed: _r, ...rest } = a;
        assets[a.id] = { ...rest, ...(c.removed ? { removed: true } : {}), revision: rev(a) };
        before.push(a.id);
      }
      if (before.length === 0)
        fail(
          "invalid",
          c.removed ? tk("core-commands-apply.run.fail.6c70b2095d1b") : tk("core-commands-apply.run.fail.f98aa91c06a3"),
        );
      return {
        state: { ...s, assets },
        inverse: { type: "SetAssetsRemoved", assetIds: before, removed: !c.removed },
        affected: before,
      };
    }

    case "SetAssetVersionsRemoved": {
      if (!Array.isArray(c.versionIds) || c.versionIds.length === 0 || c.versionIds.length > 500)
        fail("invalid", tk("core-commands-apply.run.fail.31b1bf8349cd"));
      const versions = { ...s.assetVersions };
      const before: (typeof c.versionIds)[number][] = [];
      for (const id of new Set(c.versionIds)) {
        const v = need(s.assetVersions[id], tk("core-commands-apply.v.need.4566fe3845fa"));
        if ((v.removed === true) === c.removed) continue;
        // Det godkjente bildet kan ikke slettes: godkjenn et annet først (ellers ville scenene mistet det)
        if (c.removed && s.assetVariants[v.variantId]?.approvedVersionId === v.id)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.3f89d6906184", { number: String(v.number) }),
          );
        const { removed: _r, ...rest } = v;
        versions[v.id] = { ...rest, ...(c.removed ? { removed: true } : {}), revision: rev(v) };
        before.push(v.id);
      }
      if (before.length === 0)
        fail(
          "invalid",
          c.removed ? tk("core-commands-apply.run.fail.6c70b2095d1b.2") : tk("core-commands-apply.run.fail.f98aa91c06a3.2"),
        );
      return {
        state: { ...s, assetVersions: versions },
        inverse: { type: "SetAssetVersionsRemoved", versionIds: before, removed: !c.removed },
        affected: before,
      };
    }

    case "SetVersionView": {
      const v = need(s.assetVersions[c.versionId], tk("core-commands-apply.v.need.4566fe3845fa.2"));
      if (c.view !== null && !isVersionView(c.view))
        fail("invalid", tk("core-commands-apply.run.fail.ba6d1dab4bd7"));
      if ((v.view ?? null) === c.view) fail("invalid", tk("core-commands-apply.run.fail.42404ff62cbc.3"));
      const { view: _v, ...rest } = v;
      return {
        state: {
          ...s,
          assetVersions: {
            ...s.assetVersions,
            [v.id]: { ...rest, ...(c.view ? { view: c.view } : {}), revision: rev(v) },
          },
        },
        inverse: { type: "SetVersionView", versionId: v.id, view: v.view ?? null },
        affected: [v.id],
      };
    }

    case "SetVersionAlignment": {
      const v = need(s.assetVersions[c.versionId], tk("core-commands-apply.v.need.0466fefacd57"));
      const va = s.assetVariants[v.variantId];
      if (s.assets[va?.assetId ?? ""]?.kind !== "sound" || v.durationMs === null)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.693fc28d9174"),
        );
      if (c.alignment !== null) {
        const e = alignmentError(c.alignment);
        if (e) fail("invalid", e);
        if (!s.blocks[c.alignment.blockId])
          fail("invalid", tk("core-commands-apply.run.fail.6fbc54425f99"));
        if (c.alignment.words.some((w) => w.endMs !== null && w.endMs > v.durationMs! + 1000))
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.3d46d4499a6e"),
          );
      }
      const { alignment: _a, ...rest } = v;
      return {
        state: {
          ...s,
          assetVersions: {
            ...s.assetVersions,
            [v.id]: {
              ...rest,
              ...(c.alignment ? { alignment: c.alignment } : {}),
              revision: rev(v),
            },
          },
        },
        inverse: { type: "SetVersionAlignment", versionId: v.id, alignment: v.alignment ?? null },
        affected: [v.id],
      };
    }

    case "SetAssetVisualBrief": {
      const a = need(s.assets[c.assetId], tk("core-commands-apply.a.need.f66a94bd1bc8.12"));
      if (typeof c.text !== "string") fail("invalid", tk("core-commands-apply.run.fail.32415a83fac8"));
      const text = c.text.replace(/\r\n?/g, "\n").trim();
      if (text.length > 4000)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.a68c9d7db744"),
        );
      if ((a.visualBrief ?? "") === text) fail("invalid", tk("core-commands-apply.run.fail.42404ff62cbc.4"));
      const { visualBrief: _b, ...rest } = a;
      return {
        state: {
          ...s,
          assets: {
            ...s.assets,
            [a.id]: { ...rest, ...(text ? { visualBrief: text } : {}), revision: rev(a) },
          },
        },
        inverse: { type: "SetAssetVisualBrief", assetId: a.id, text: a.visualBrief ?? "" },
        affected: [a.id],
      };
    }

    case "SetCompositionStep": {
      const comp = need(s.compositions[c.compositionId], tk("core-commands-apply.comp.need.118fc96033c3.2"));
      if (!Number.isInteger(c.step) || c.step < 1 || c.step > 4)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.f5bb30ec8c5b"),
        );
      if ((comp.step ?? 1) === c.step) fail("invalid", tk("core-commands-apply.run.fail.42404ff62cbc.5"));
      const { step: _s, ...rest } = comp;
      return {
        state: {
          ...s,
          compositions: {
            ...s.compositions,
            [comp.id]: { ...rest, ...(c.step > 1 ? { step: c.step } : {}), revision: rev(comp) },
          },
        },
        inverse: { type: "SetCompositionStep", compositionId: comp.id, step: comp.step ?? 1 },
        affected: [comp.id],
      };
    }

    case "CreateAssetVariant": {
      assertNewId(s, c.variantId);
      need(s.assets[c.assetId], tk("core-commands-apply.run.need.16680672678c.3"));
      return {
        state: {
          ...s,
          assetVariants: {
            ...s.assetVariants,
            [c.variantId]: {
              id: c.variantId,
              revision: 1,
              assetId: c.assetId,
              ...normalizeVariantFields(c.fields),
              approvedVersionId: null,
              archived: c.archived === true,
            },
          },
        },
        inverse: { type: "UndoCreateAssetVariant", variantId: c.variantId },
        affected: [c.variantId],
      };
    }

    case "UndoCreateAssetVariant": {
      const va = need(s.assetVariants[c.variantId], tk("core-commands-apply.va.need.315882a5547a.3"));
      if (Object.values(s.assetVersions).some((x) => x.variantId === va.id))
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.0aeb0396b2fb"),
        );
      if (usedByPresentation(s, "variants", va.id))
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.c4dbc633d267"),
        );
      if (usedByLayer(s, "assetVariantId", va.id))
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.9e6811e0c72c"),
        );
      // P8 (REQ-0144): en foretrukket referanse for en stilprofil peker på varianten
      if (Object.values(s.stylePreferredReferences ?? {}).some((r) => !r.removed && r.variantId === va.id))
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.244ffba1a39d"),
        );
      const assetVariants = { ...s.assetVariants };
      delete assetVariants[va.id];
      return {
        state: { ...s, assetVariants },
        inverse: {
          type: "CreateAssetVariant",
          variantId: va.id,
          assetId: va.assetId,
          fields: { name: va.name, style: va.style, appearance: va.appearance },
          ...(va.archived ? { archived: true } : {}),
        },
        affected: [va.id],
      };
    }

    case "UpdateAssetVariant": {
      const va = need(s.assetVariants[c.variantId], tk("core-commands-apply.va.need.315882a5547a.4"));
      return {
        state: {
          ...s,
          assetVariants: {
            ...s.assetVariants,
            [va.id]: { ...va, ...normalizeVariantFields(c.fields), revision: rev(va) },
          },
        },
        inverse: {
          type: "UpdateAssetVariant",
          variantId: va.id,
          fields: { name: va.name, style: va.style, appearance: va.appearance },
        },
        affected: [va.id],
      };
    }

    case "SetAssetVariantArchived": {
      const va = need(s.assetVariants[c.variantId], tk("core-commands-apply.va.need.315882a5547a.5"));
      return {
        state: {
          ...s,
          assetVariants: {
            ...s.assetVariants,
            [va.id]: { ...va, archived: c.archived, revision: rev(va) },
          },
        },
        inverse: { type: "SetAssetVariantArchived", variantId: va.id, archived: va.archived },
        affected: [va.id],
      };
    }

    case "AddAssetVersion": {
      assertNewId(s, c.versionId);
      const va = need(s.assetVariants[c.variantId], tk("core-commands-apply.va.need.315882a5547a.6"));
      const m = c.media;
      if (
        !m ||
        typeof m.path !== "string" ||
        typeof m.mimeType !== "string" ||
        typeof m.sha256 !== "string" ||
        typeof c.note !== "string"
      )
        fail("invalid", tk("core-commands-apply.run.fail.a055aa72fcb4.2"));
      if (!m.path.startsWith(`${s.project.id}/`) || m.path.length > 600 || m.path.includes(".."))
        fail("invalid", tk("core-commands-apply.run.fail.c4078f3f4978.2"));
      const sound = s.assets[va.assetId]?.kind === "sound";
      if (c.alignment !== undefined) {
        if (!sound || !s.blocks[c.alignment.blockId]) fail("invalid", tk("core-commands-apply.run.fail.c5fb828ed558"));
        const error = alignmentError(c.alignment);
        if (error) fail("invalid", error);
        const duration = m.durationMs;
        if (typeof duration !== "number" || c.alignment.words.some((w) => w.endMs !== null && w.endMs > duration + 1000))
          fail("invalid", tk("core-commands-apply.run.fail.3d46d4499a6e.2"));
      }
      if (sound) {
        if (!AUDIO_MIME_TYPES.includes(m.mimeType))
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.fde3c1d2c2ee"),
          );
        const d = m.durationMs ?? null;
        if (d !== null && (!Number.isInteger(d) || d <= 0 || d > AUDIO_MAX_MS))
          fail("invalid", tk("core-commands-apply.run.fail.9deac46a3184"));
        if (c.composition !== undefined) {
          const e = compositionError(c.composition, (id) => compositionSourceMs(s, id));
          if (e) fail("invalid", e);
        }
      } else if (c.composition !== undefined)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.5be4d4c3999c"),
        );
      else if ((s.assets[va.assetId]?.kind === "font") !== (c.font !== undefined))
        fail("invalid", tk("b098.command.font-mismatch"));
      else if (c.font !== undefined) {
        const e = fontSpecError(c.font);
        if (e) fail("invalid", e);
        if (m.mimeType !== FONT_PACK_MIME) fail("invalid", tk("b098.command.font-mismatch"));
        if (!Number.isInteger(m.byteSize) || m.byteSize <= 0 || m.byteSize > FONT_PACK_MAX_BYTES)
          fail("invalid", tk("core-commands-apply.run.fail.f79f89233d6b.2"));
      } else if ((s.assets[va.assetId]?.kind === "template") !== (c.template !== undefined))
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.2b3608b2865a"),
        );
      else if (c.template !== undefined && templateError(c.template))
        fail("invalid", templateError(c.template)!);
      else if (!ASSET_MIME_TYPES.includes(m.mimeType))
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.bf6e905ff6b8.2"),
        );
      if (c.font === undefined && (!Number.isInteger(m.byteSize) || m.byteSize <= 0 || m.byteSize > ASSET_MAX_BYTES))
        fail("invalid", tk("core-commands-apply.run.fail.f79f89233d6b.2"));
      if (!/^[0-9a-f]{64}$/.test(m.sha256))
        fail("invalid", tk("core-commands-apply.run.fail.bacfc2e4bb12.2"));
      for (const d of [m.width, m.height])
        if (d !== null && (!Number.isInteger(d) || d <= 0 || d > 100_000))
          fail("invalid", tk("core-commands-apply.run.fail.ab33cacf5990.2"));
      if (c.note.length > 2000)
        fail("invalid", tk("core-commands-apply.run.fail.55b1d38c8fdc.2"));
      if (c.derivedFromVersionId !== undefined) {
        const from = s.assetVersions[c.derivedFromVersionId];
        if (!from || from.id === c.versionId || s.assetVariants[from.variantId]?.assetId !== va.assetId)
          fail("invalid", tk("id3.derived-from.invalid"));
      }
      if (m.derivedFiles !== undefined) {
        const derr = derivedFilesError(m.derivedFiles, `${s.project.id}/`);
        if (derr) fail("invalid", derr);
      }
      const siblings = Object.values(s.assetVersions).filter((x) => x.variantId === va.id);
      // Gjør om etter angre: behold det opprinnelige nummeret hvis det er ledig
      const number =
        c.number !== undefined &&
        Number.isInteger(c.number) &&
        c.number >= 1 &&
        !siblings.some((x) => x.number === c.number)
          ? c.number
          : siblings.reduce((n, x) => Math.max(n, x.number), 0) + 1;
      return {
        state: {
          ...s,
          assetVersions: {
            ...s.assetVersions,
            [c.versionId]: {
              id: c.versionId,
              revision: 1,
              variantId: va.id,
              number,
              mediaPath: m.path,
              mimeType: m.mimeType,
              width: m.width,
              height: m.height,
              byteSize: m.byteSize,
              sha256: m.sha256,
              note: c.note.trim(),
              createdAt: env.at,
              createdBy: env.actor,
              durationMs: sound ? (m.durationMs ?? null) : null,
              ...(sound && c.composition ? { composition: c.composition } : {}),
              ...(c.alignment ? { alignment: c.alignment } : {}),
              ...(c.template !== undefined ? { template: c.template } : {}),
              ...(c.font !== undefined ? { font: c.font } : {}),
              ...(c.derivedFromVersionId !== undefined ? { derivedFromVersionId: c.derivedFromVersionId } : {}),
              // B-105a: avledede filer (arbeidskopi, proxy, miniatyr, rå TIFF) – bare for bilder
              ...(m.derivedFiles !== undefined && m.mimeType.startsWith("image/")
                ? { derivedFiles: m.derivedFiles }
                : {}),
              ...(c.globalSource !== undefined
                ? {
                    globalSource: {
                      assetId: globalRef(c.globalSource?.assetId),
                      variantId: globalRef(c.globalSource?.variantId),
                      versionId: globalRef(c.globalSource?.versionId),
                    },
                  }
                : {}),
            },
          },
        },
        inverse: { type: "UndoAddAssetVersion", versionId: c.versionId },
        affected: [c.versionId],
      };
    }

    case "UndoAddAssetVersion": {
      const ver = need(s.assetVersions[c.versionId], tk("core-commands-apply.ver.need.f1d2238c110b.2"));
      const va = s.assetVariants[ver.variantId];
      // P8: metadataen om en harmonisering må fjernes sammen med bildet (samme angregruppe)
      if (Object.values(s.styleHarmonizations ?? {}).some((h) => !h.removed && (h.versionId === ver.id || h.sourceVersionId === ver.id || h.referenceVersionId === ver.id)))
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.9c944cc63828"),
        );
      if (va?.approvedVersionId === ver.id)
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.7272075a451c"),
        );
      if (usedByPresentation(s, "versions", ver.id))
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.67e6aee040db"),
        );
      if (usedByLayer(s, "versionId", ver.id))
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.1d5865621a01"),
        );
      if (Object.values(s.takes).some((t) => t.kind === "still" && t.mediaRef === ver.mediaPath))
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.a55702a743e4"),
        );
      if (
        Object.values(s.layers).some((l) => l.reviewedVersions?.includes(ver.id)) ||
        Object.values(s.takes).some((t) => t.reviewedVersions?.includes(ver.id))
      )
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.d54de575a710"),
        );
      // Et opptak som brukes i en lydkomposisjon eller av et lydklipp, beholdes (DEC-0094)
      if (
        Object.values(s.assetVersions).some((x) =>
          x.composition?.segments.some((g) => g.versionId === ver.id),
        ) ||
        Object.values(s.audioClips).some((a) => !a.removed && a.versionId === ver.id)
      )
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.2ac778684e4e"),
        );
      // En malversjon som brukes av en forekomst, beholdes (MTS MT4, AJ)
      if (Object.values(s.templateInstances ?? {}).some((i) => i.templateVersionId === ver.id))
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.7e1816e55874"),
        );
      // Bare det nyeste bildet kan angres bort (en versjon andre kan ha brukt, beholdes)
      if (
        Object.values(s.assetVersions).some(
          (x) => x.variantId === ver.variantId && x.number > ver.number,
        )
      )
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.796310d518b7"),
        );
      const assetVersions = { ...s.assetVersions };
      delete assetVersions[ver.id];
      return {
        state: { ...s, assetVersions },
        inverse: {
          type: "AddAssetVersion",
          versionId: ver.id,
          variantId: ver.variantId,
          media: {
            path: ver.mediaPath,
            mimeType: ver.mimeType,
            width: ver.width,
            height: ver.height,
            byteSize: ver.byteSize,
            sha256: ver.sha256,
            ...(ver.durationMs !== null ? { durationMs: ver.durationMs } : {}),
            ...(ver.derivedFiles ? { derivedFiles: ver.derivedFiles } : {}),
          },
          note: ver.note,
          number: ver.number,
          ...(ver.composition ? { composition: ver.composition } : {}),
          ...(ver.alignment ? { alignment: ver.alignment } : {}),
          ...(ver.template ? { template: ver.template } : {}),
          ...(ver.globalSource ? { globalSource: ver.globalSource } : {}),
          ...(ver.derivedFromVersionId ? { derivedFromVersionId: ver.derivedFromVersionId } : {}),
        },
        affected: [ver.id],
      };
    }

    // B-105a: avledede filer på en bildeversjon (opplasting og bakgrunnsoppgradering av eldre bilder)
    case "SetAssetVersionDerived": {
      const ver = need(s.assetVersions[c.versionId], tk("core-commands-apply.ver.need.f1d2238c110b.2"));
      if (!ver.mimeType.startsWith("image/"))
        fail("invalid", tk("core-commands-apply.run.fail.bf6e905ff6b8.2"));
      if (c.derived !== null) {
        const derr = derivedFilesError(c.derived, `${s.project.id}/`);
        if (derr) fail("invalid", derr);
      }
      const { derivedFiles: _previous, ...withoutDerived } = ver;
      return {
        state: {
          ...s,
          assetVersions: {
            ...s.assetVersions,
            [ver.id]: {
              ...withoutDerived,
              revision: rev(ver),
              ...(c.derived !== null ? { derivedFiles: c.derived } : {}),
            },
          },
        },
        inverse: {
          type: "SetAssetVersionDerived",
          versionId: ver.id,
          derived: ver.derivedFiles ?? null,
        },
        affected: [ver.id],
      };
    }

    // ---------- Notater i manus (DEC-0031) ----------
    case "AddAnnotations": {
      if (!Array.isArray(c.annotations) || c.annotations.length === 0)
        fail("invalid", tk("core-commands-apply.run.fail.71dd0ec5e8ae"));
      if (c.annotations.length > 2000)
        fail("invalid", tk("core-commands-apply.run.fail.cb7291831892"));
      const annotations = { ...s.annotations };
      const ids: string[] = [];
      for (const n of c.annotations) {
        if (!n || typeof n.text !== "string" || typeof n.authorName !== "string")
          fail("invalid", tk("core-commands-apply.run.fail.ce6ea8d09faf"));
        assertNewId(s, n.annotationId);
        if (annotations[n.annotationId])
          fail("duplicate_id", tk("core-commands-apply.run.fail.26ae31147a2b.2"));
        annotations[n.annotationId] = normalizeAnnotation(s, n, env.at);
        ids.push(n.annotationId);
      }
      return {
        state: { ...s, annotations },
        inverse: { type: "UndoAddAnnotations", annotationIds: ids as never },
        affected: ids,
      };
    }

    case "UndoAddAnnotations": {
      const annotations = { ...s.annotations };
      const back = [];
      for (const id of c.annotationIds) {
        const a = need(s.annotations[id], tk("core-commands-apply.a.need.d46e4f867b8c"));
        back.push({
          annotationId: a.id,
          blockId: a.blockId,
          variantId: a.variantId,
          start: a.start,
          end: a.end,
          quote: a.quote,
          text: a.text,
          authorName: a.authorName,
          stampAt: a.stampAt,
          resolved: a.resolved === true,
          ...(a.source ? { source: a.source } : {}),
          ...(a.taskId ? { taskId: a.taskId } : {}),
          ...(a.kind ? { kind: a.kind, suggestedText: a.suggestedText ?? "" } : {}),
        });
        delete annotations[id];
      }
      return {
        state: { ...s, annotations },
        inverse: { type: "AddAnnotations", annotations: back },
        affected: [...c.annotationIds],
      };
    }

    case "EditAnnotation": {
      const a = need(s.annotations[c.annotationId], tk("core-commands-apply.a.need.d46e4f867b8c.2"));
      const text = typeof c.text === "string" ? c.text.trim() : "";
      if (!text || text.length > 10_000)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.82ff6c962eb3"),
        );
      // «Endret av …» (DEC-0032): navn fra den som endrer, tid = nå (eller oppgitt ved angre)
      const editedByName =
        c.editedByName === undefined
          ? a.editedByName
          : c.editedByName === null
            ? null
            : String(c.editedByName).trim().slice(0, 100) || "Ukjent"; // i18n-ignore – lagret navn
      const editedAt =
        c.editedAt !== undefined
          ? c.editedAt
          : c.editedByName === undefined || c.editedByName === null
            ? a.editedAt
            : env.at;
      if (editedAt !== null && Number.isNaN(Date.parse(editedAt)))
        fail("invalid", tk("core-commands-apply.run.fail.909296a27bc6"));
      return {
        state: {
          ...s,
          annotations: {
            ...s.annotations,
            [a.id]: {
              ...a,
              text,
              editedByName,
              editedAt: editedAt === null ? null : new Date(editedAt).toISOString(),
              revision: rev(a),
            },
          },
        },
        inverse: {
          type: "EditAnnotation",
          annotationId: a.id,
          text: a.text,
          editedByName: a.editedByName,
          editedAt: a.editedAt,
        },
        affected: [a.id],
      };
    }

    case "ReviewDialogueDrift": {
      assertNewId(s, c.reviewId);
      const clip = need(s.audioClips[c.clipId], tk("core-commands-apply.clip.need.4362655cd77c.2"));
      const d = clipDrift(s, clip);
      if (!d.versionId) fail("invalid", tk("core-commands-apply.run.fail.b4d4f3fa97b0"));
      const basis = c.basis ?? "manual";
      if (basis === "manual" && d.status !== "drift" && d.status !== "unknown") fail("invalid", tk("core-commands-apply.run.fail.84181468061d"));
      if (basis === "generated" && d.audioRevision !== d.currentRevision) fail("invalid", tk("core-commands-apply.run.fail.bc16f25f9b4e"));
      const review: DialogueReview = { id: c.reviewId, revision: 1, dialogueVersionId: d.versionId!, blockId: d.blockId, blockRevision: d.currentRevision, basis, createdBy: env.actor, createdAt: env.at, removed: false };
      return { state: { ...s, dialogueReviews: { ...(s.dialogueReviews ?? {}), [review.id]: review } }, inverse: { type: "UndoReviewDialogueDrift", reviewId: review.id }, affected: [review.id] };
    }
    case "UndoReviewDialogueDrift": {
      const r = need((s.dialogueReviews ?? {})[c.reviewId], tk("core-commands-apply.r.need.0517acc7550b"));
      const reviews = { ...(s.dialogueReviews ?? {}) };
      delete reviews[r.id];
      const clip = Object.values(s.audioClips).find(a => a.activeVersionId === r.dialogueVersionId || s.dialogueVersions[r.dialogueVersionId]?.clipId === a.id);
      return { state: { ...s, dialogueReviews: reviews }, inverse: { type: "ReviewDialogueDrift", reviewId: r.id, clipId: clip?.id ?? "", basis: r.basis }, affected: [r.id] };
    }
    case "AddNoteFlag": {
      assertNewId(s, c.flagId);
      if (!NOTE_FLAG_TARGETS.includes(c.targetKind) || !isUuid(c.targetId)) fail("invalid", tk("core-commands-apply.run.fail.393c18b95ab7"));
      if (typeof c.text !== "string" || c.text.length > NOTE_FLAG_MAX_TEXT) fail("invalid", tk("core-commands-apply.run.fail.996bbf5f460f"));
      const exists = { dialogue_version: s.dialogueVersions, audio_clip: s.audioClips, asset_version: s.assetVersions, asset_variant: s.assetVariants, occurrence: s.occurrences }[c.targetKind][c.targetId];
      if (!exists) fail("not_found", tk("core-commands-apply.run.fail.ae2bf229e914"));
      const flag: NoteFlag = { id: c.flagId, revision: 1, targetKind: c.targetKind, targetId: c.targetId, text: c.text, enabled: true, createdBy: env.actor, createdAt: env.at, editedBy: null, editedAt: null, removed: false };
      return { state: { ...s, noteFlags: { ...(s.noteFlags ?? {}), [flag.id]: flag } }, inverse: { type: "UndoAddNoteFlag", flagId: flag.id }, affected: [flag.id] };
    }
    case "UndoAddNoteFlag": {
      const f = need((s.noteFlags ?? {})[c.flagId], tk("core-commands-apply.f.need.8ab231644533"));
      const flags = { ...(s.noteFlags ?? {}) };
      delete flags[f.id];
      return { state: { ...s, noteFlags: flags }, inverse: { type: "AddNoteFlag", flagId: f.id, targetKind: f.targetKind, targetId: f.targetId, text: f.text }, affected: [f.id] };
    }
    case "UpdateNoteFlag": {
      const f = need((s.noteFlags ?? {})[c.flagId], tk("core-commands-apply.f.need.8ab231644533.2"));
      if (c.text !== undefined && (typeof c.text !== "string" || c.text.length > NOTE_FLAG_MAX_TEXT)) fail("invalid", tk("core-commands-apply.run.fail.996bbf5f460f.2"));
      if (c.enabled !== undefined && typeof c.enabled !== "boolean") fail("invalid", tk("core-commands-apply.run.fail.5c6d480cde92.2"));
      // H5: å slå av lappen beholder teksten
      const next: NoteFlag = { ...f, ...(c.text !== undefined ? { text: c.text } : {}), ...(c.enabled !== undefined ? { enabled: c.enabled } : {}), editedBy: env.actor, editedAt: env.at, revision: rev(f) };
      return { state: { ...s, noteFlags: { ...(s.noteFlags ?? {}), [f.id]: next } }, inverse: { type: "UpdateNoteFlag", flagId: f.id, ...(c.text !== undefined ? { text: f.text } : {}), ...(c.enabled !== undefined ? { enabled: f.enabled } : {}) }, affected: [f.id] };
    }
    case "SetNoteFlagRemoved": {
      const f = need((s.noteFlags ?? {})[c.flagId], tk("core-commands-apply.f.need.8ab231644533.3"));
      return { state: { ...s, noteFlags: { ...(s.noteFlags ?? {}), [f.id]: { ...f, removed: c.removed === true, revision: rev(f) } } }, inverse: { type: "SetNoteFlagRemoved", flagId: f.id, removed: f.removed }, affected: [f.id] };
    }
    // ML3 språkversjoner (B-049): register per prosjekt, alltid med norsk kilde
    case "AddLanguageVersion": {
      assertNewId(s, c.versionId);
      const f = { language: c.language, name: typeof c.name === "string" ? c.name.trim() : "", status: c.status ?? "active" } as const;
      const err = languageVersionError(s, f);
      if (err) fail("invalid", languageVersionMessage(err, c.language));
      const v: LanguageVersion = { id: c.versionId, revision: 1, ...f, removed: false, createdBy: env.actor, createdAt: env.at };
      return { state: { ...s, languageVersions: { ...(s.languageVersions ?? {}), [v.id]: v } }, inverse: { type: "UndoAddLanguageVersion", versionId: v.id }, affected: [v.id] };
    }
    case "UndoAddLanguageVersion": {
      const v = (s.languageVersions ?? {})[c.versionId];
      if (!v) fail("invalid", tk("ml3-language-versions.error.not-found"));
      // Rader som allerede bruker versjonen, hindrer angring (ingen stille tap)
      const used = [...Object.values(s.translations), ...Object.values(s.translationLines ?? {}), ...Object.values(s.translationLineLinks ?? {})].some((r) => r.languageVersionId === v.id);
      if (used) fail("invalid", tk("ml3-language-versions.error.in-use"));
      const next = { ...(s.languageVersions ?? {}) };
      delete next[v.id];
      return { state: { ...s, languageVersions: next }, inverse: { type: "AddLanguageVersion", versionId: v.id, language: v.language, name: v.name, status: v.status }, affected: [v.id] };
    }
    case "UpdateLanguageVersion": {
      const v = (s.languageVersions ?? {})[c.versionId];
      if (!v || v.removed) fail("invalid", tk("ml3-language-versions.error.not-found"));
      const f = { language: v.language, name: c.name !== undefined ? (typeof c.name === "string" ? c.name.trim() : "") : v.name, status: c.status ?? v.status };
      const err = languageVersionError(s, f, v.id);
      if (err) fail("invalid", languageVersionMessage(err, v.language));
      if (f.name === v.name && f.status === v.status) fail("invalid", tk("ml3-language-versions.error.unchanged"));
      return { state: { ...s, languageVersions: { ...(s.languageVersions ?? {}), [v.id]: { ...v, name: f.name, status: f.status, revision: rev(v) } } }, inverse: { type: "UpdateLanguageVersion", versionId: v.id, ...(f.name !== v.name ? { name: v.name } : {}), ...(f.status !== v.status ? { status: v.status } : {}) }, affected: [v.id] };
    }
    case "SetLanguageVersionRemoved": {
      const v = (s.languageVersions ?? {})[c.versionId];
      if (!v) fail("invalid", tk("ml3-language-versions.error.not-found"));
      if (v.removed === c.removed) fail("invalid", tk("ml3-language-versions.error.unchanged"));
      if (!c.removed) {
        const err = languageVersionError(s, v, v.id);
        if (err) fail("invalid", languageVersionMessage(err, v.language));
      }
      return { state: { ...s, languageVersions: { ...(s.languageVersions ?? {}), [v.id]: { ...v, removed: c.removed, revision: rev(v) } } }, inverse: { type: "SetLanguageVersionRemoved", versionId: v.id, removed: v.removed }, affected: [v.id] };
    }
    // M8 kvalitetsprofiler (REQ-0854–0862)
    case "AddQualityProfile": {
      assertNewId(s, c.profileId);
      const err = qualityProfileError(c.name, c.spec ?? {});
      if (err) fail("invalid", err);
      const p: QualityProfile = { id: c.profileId, revision: 1, name: c.name.trim(), spec: c.spec ?? {}, removed: false, createdBy: env.actor, createdAt: env.at, editedBy: null, editedAt: null };
      const project = c.restoreActive ? { ...s.project, activeQualityProfileId: p.id, revision: s.project.revision + 1 } : s.project;
      return { state: { ...s, project, qualityProfiles: { ...(s.qualityProfiles ?? {}), [p.id]: p } }, inverse: { type: "UndoAddQualityProfile", profileId: p.id }, affected: [p.id, ...(c.restoreActive ? [project.id] : [])] };
    }
    case "UndoAddQualityProfile": {
      const p = need((s.qualityProfiles ?? {})[c.profileId], tk("core-commands-apply.p.need.621f13ab4b10"));
      const profiles = { ...(s.qualityProfiles ?? {}) };
      delete profiles[p.id];
      // Var profilen aktiv, fjernes valget samtidig (samma angregruppe)
      const project = s.project.activeQualityProfileId === p.id ? { ...s.project, activeQualityProfileId: null, revision: s.project.revision + 1 } : s.project;
      return { state: { ...s, project, qualityProfiles: profiles }, inverse: { type: "AddQualityProfile", profileId: p.id, name: p.name, spec: p.spec, restoreActive: s.project.activeQualityProfileId === p.id }, affected: [p.id, project.id] };
    }
    case "UpdateQualityProfile": {
      const p = need((s.qualityProfiles ?? {})[c.profileId], tk("core-commands-apply.p.need.621f13ab4b10.2"));
      const name = c.name !== undefined ? c.name : p.name;
      const spec = c.spec !== undefined ? c.spec : p.spec;
      const err = qualityProfileError(name, spec ?? {});
      if (err) fail("invalid", err);
      const next: QualityProfile = { ...p, name: name.trim(), spec: spec ?? {}, editedBy: env.actor, editedAt: env.at, revision: rev(p) };
      return { state: { ...s, qualityProfiles: { ...(s.qualityProfiles ?? {}), [p.id]: next } }, inverse: { type: "UpdateQualityProfile", profileId: p.id, ...(c.name !== undefined ? { name: p.name } : {}), ...(c.spec !== undefined ? { spec: p.spec } : {}) }, affected: [p.id] };
    }
    case "SetQualityProfileRemoved": {
      const p = need((s.qualityProfiles ?? {})[c.profileId], tk("core-commands-apply.p.need.621f13ab4b10.3"));
      const next: QualityProfile = { ...p, removed: c.removed === true, editedBy: env.actor, editedAt: env.at, revision: rev(p) };
      // En fjernet profil kan ikke være aktiv
      const project = c.removed === true && s.project.activeQualityProfileId === p.id ? { ...s.project, activeQualityProfileId: null, revision: s.project.revision + 1 } : c.restoreActive && !c.removed ? { ...s.project, activeQualityProfileId:p.id, revision:s.project.revision + 1 } : s.project;
      return { state: { ...s, project, qualityProfiles: { ...(s.qualityProfiles ?? {}), [p.id]: next } }, inverse: { type: "SetQualityProfileRemoved", profileId: p.id, removed: p.removed, restoreActive: c.removed && s.project.activeQualityProfileId === p.id }, affected: [p.id, project.id] };
    }
    case "SetActiveQualityProfile": {
      if (c.profileId !== null) {
        const p = need((s.qualityProfiles ?? {})[c.profileId], tk("core-commands-apply.p.need.621f13ab4b10.4"));
        if (p.removed) fail("invalid", tk("core-commands-apply.run.fail.7c23382b944a"));
      }
      const prev = s.project.activeQualityProfileId ?? null;
      const project = { ...s.project, activeQualityProfileId: c.profileId, revision: s.project.revision + 1 };
      return { state: { ...s, project }, inverse: { type: "SetActiveQualityProfile", profileId: prev }, affected: [s.project.id] };
    }
    case "SetAnnotationResolved": {
      const a = need(s.annotations[c.annotationId], tk("core-commands-apply.a.need.d46e4f867b8c.3"));
      if (typeof c.resolved !== "boolean") fail("invalid", tk("core-commands-apply.run.fail.4bb12992b233"));
      return {
        state: { ...s, annotations: { ...s.annotations, [a.id]: { ...a, resolved: c.resolved, revision: rev(a) } } },
        inverse: { type: "SetAnnotationResolved", annotationId: a.id, resolved: a.resolved === true },
        affected: [a.id],
      };
    }

    case "SetAnnotationRemoved": {
      const a = need(s.annotations[c.annotationId], tk("core-commands-apply.a.need.d46e4f867b8c.4"));
      return {
        state: {
          ...s,
          annotations: {
            ...s.annotations,
            [a.id]: { ...a, removed: c.removed === true, revision: rev(a) },
          },
        },
        inverse: { type: "SetAnnotationRemoved", annotationId: a.id, removed: a.removed },
        affected: [a.id],
      };
    }

    case "ApproveAssetVersion": {
      const va = need(s.assetVariants[c.variantId], tk("core-commands-apply.va.need.315882a5547a.7"));
      if (c.versionId !== null) {
        const ver = need(s.assetVersions[c.versionId], tk("core-commands-apply.ver.need.f1d2238c110b.3"));
        if (ver.variantId !== va.id)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.8b7013daefd3"),
          );
      }
      return {
        state: {
          ...s,
          assetVariants: {
            ...s.assetVariants,
            [va.id]: { ...va, approvedVersionId: c.versionId, revision: rev(va) },
          },
        },
        inverse: {
          type: "ApproveAssetVersion",
          variantId: va.id,
          versionId: va.approvedVersionId,
        },
        affected: [va.id],
      };
    }

    // ---------- Prosjektets format (DEC-0039) ----------

    case "SetProjectFormat": {
      if (!Number.isInteger(c.width) || c.width < 16 || c.width > 16384)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.cc0b051868a6"),
        );
      if (!Number.isInteger(c.height) || c.height < 16 || c.height > 16384)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.e833ab87862f"),
        );
      if (!isAllowedFps(c.fps)) fail("invalid", tk("core-commands-apply.run.fail.a37af7016617"));
      const p = s.project;
      const from = { width: p.frameWidth, height: p.frameHeight, fps: p.fps };
      const to = { width: c.width, height: c.height, fps: c.fps };
      if (
        from.width === to.width &&
        from.height === to.height &&
        sameFps(from.fps, to.fps) &&
        // Scener med eget format (laget før 0008) gjør at samme format likevel er en endring
        Object.values(s.compositions).every((x) => x.width === to.width && x.height === to.height)
      )
        fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.18"));
      const m = formatMapping(from, to);
      const compositions = { ...s.compositions };
      const layers = { ...s.layers };
      const productions = { ...s.productions };
      const affected: string[] = [p.id];
      const oldComps = Object.values(s.compositions);
      const oldLayers = Object.values(s.layers);
      for (const comp of oldComps) {
        // Scener med eget format fra før (laget før 0008) regnes om fra sitt eget format
        const own = { width: comp.width, height: comp.height, fps: p.fps };
        const cm =
          own.width === from.width && own.height === from.height ? m : formatMapping(own, to);
        compositions[comp.id] = { ...rescaleComposition(comp, cm, to), revision: rev(comp) };
        affected.push(comp.id);
        for (const l of oldLayers)
          if (l.compositionId === comp.id) {
            layers[l.id] = { ...rescaleLayer(l, cm), revision: rev(l) };
            affected.push(l.id);
          }
      }
      const prodFps = Object.values(s.productions).map((x) => ({ productionId: x.id, fps: x.fps }));
      for (const x of Object.values(s.productions))
        if (!sameFps(x.fps, c.fps)) {
          productions[x.id] = { ...x, fps: c.fps, revision: rev(x) };
          affected.push(x.id);
        }
      // Overganger og utdrag er i bilder og regnes om til ny bildefrekvens (KI-48); klippdeler er i ms
      const occurrences = { ...s.occurrences };
      const oldOcc: {
        occurrenceId: OccurrenceId;
        transition: Transition | null;
        excerpt: { inFrame: number; outFrame: number } | null;
      }[] = [];
      const fpsChanged = !sameFps(from.fps, to.fps);
      if (fpsChanged)
        for (const o of Object.values(s.occurrences)) {
          if (!o.transition && !o.excerpt) continue;
          oldOcc.push({
            occurrenceId: o.id,
            transition: o.transition ?? null,
            excerpt: o.excerpt,
          });
          occurrences[o.id] = {
            ...o,
            ...(o.transition ? { transition: rescaleTransition(o.transition, m.frame) } : {}),
            excerpt: o.excerpt ? rescaleExcerpt(o.excerpt, m.frame) : null,
            revision: rev(o),
          };
          affected.push(o.id);
        }
      // Versjonenes lengde i bilder (KI-48): film med kjent lengde regnes fra filen, resten omregnes
      const takes = { ...s.takes };
      const oldTakeFrames: { takeId: TakeId; durationFrames: number | null }[] = [];
      if (fpsChanged)
        for (const t of Object.values(s.takes)) {
          const next = rescaleTakeFrames(t, m.frame, to.fps);
          if (next === t.durationFrames) continue;
          oldTakeFrames.push({ takeId: t.id, durationFrames: t.durationFrames });
          takes[t.id] = { ...t, durationFrames: next, revision: rev(t) };
          affected.push(t.id);
        }
      const oldDefault = p.defaultTransition ?? null;
      return {
        state: {
          ...s,
          project: {
            ...p,
            frameWidth: c.width,
            frameHeight: c.height,
            fps: c.fps,
            ...(oldDefault && fpsChanged
              ? { defaultTransition: rescaleTransition(oldDefault, m.frame) }
              : {}),
            revision: rev(p),
          },
          productions,
          compositions,
          layers,
          occurrences,
          takes,
        },
        inverse: {
          type: "UndoSetProjectFormat",
          project: from,
          productionFps: prodFps,
          compositions: oldComps,
          layers: oldLayers,
          occurrences: oldOcc,
          defaultTransition: oldDefault,
          takeFrames: oldTakeFrames,
        },
        affected,
      };
    }

    case "UndoSetProjectFormat": {
      const p = s.project;
      const compositions = { ...s.compositions };
      const layers = { ...s.layers };
      const productions = { ...s.productions };
      const affected: string[] = [p.id];
      // Det som fantes før endringen, settes tilbake nøyaktig (det som er fjernet siden, hoppes over);
      // 2D-scener og lag som er laget etterpå, regnes om tilbake til det gamle formatet
      const back = formatMapping(
        { width: p.frameWidth, height: p.frameHeight, fps: p.fps },
        { width: c.project.width, height: c.project.height, fps: c.project.fps },
      );
      // Omregningen endringen gjorde (fra det gamle formatet til det nåværende): en verdi i bilder settes bare
      // tilbake nøyaktig hvis den fortsatt er slik endringen satte den; er den endret siden, regnes den
      // nåværende verdien om tilbake (senere endringer overskrives ikke i stillhet)
      const fwd = formatMapping(
        { width: c.project.width, height: c.project.height, fps: c.project.fps },
        { width: p.frameWidth, height: p.frameHeight, fps: p.fps },
      );
      const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
      const backTransition = (
        was: Transition | null | undefined,
        cur: Transition | null,
      ): Transition | null =>
        was !== undefined && sameJson(was ? rescaleTransition(was, fwd.frame) : null, cur)
          ? was
          : cur
            ? rescaleTransition(cur, back.frame)
            : null;
      type Excerpt = { readonly inFrame: number; readonly outFrame: number } | null;
      const backExcerpt = (was: Excerpt | undefined, cur: Excerpt): Excerpt =>
        was !== undefined && sameJson(was ? rescaleExcerpt(was, fwd.frame) : null, cur)
          ? was
          : cur
            ? rescaleExcerpt(cur, back.frame)
            : null;
      const oldComp = new Map(c.compositions.map((x) => [x.id, x]));
      const oldLayer = new Map(c.layers.map((x) => [x.id, x]));
      for (const cur of Object.values(s.compositions)) {
        const old = oldComp.get(cur.id);
        compositions[cur.id] = old
          ? { ...old, revision: rev(cur) }
          : { ...rescaleComposition(cur, back, c.project), revision: rev(cur) };
        affected.push(cur.id);
      }
      for (const cur of Object.values(s.layers)) {
        const old = oldLayer.get(cur.id);
        layers[cur.id] = old
          ? { ...old, revision: rev(cur) }
          : { ...rescaleLayer(cur, back), revision: rev(cur) };
        affected.push(cur.id);
      }
      for (const x of c.productionFps) {
        const cur = s.productions[x.productionId];
        if (cur && !sameFps(cur.fps, x.fps)) {
          productions[cur.id] = { ...cur, fps: x.fps, revision: rev(cur) };
          affected.push(cur.id);
        }
      }
      // Overganger og utdrag (KI-48): det som fantes og ikke er endret siden, settes tilbake nøyaktig; det som
      // er nytt eller endret etterpå, regnes om tilbake
      const occurrences = { ...s.occurrences };
      let project: typeof p = p;
      if (c.occurrences !== undefined && !sameFps(p.fps, c.project.fps)) {
        const old = new Map(c.occurrences.map((x) => [x.occurrenceId as string, x]));
        for (const o of Object.values(s.occurrences)) {
          const was = old.get(o.id);
          if (!was && !o.transition && !o.excerpt) continue;
          const { transition: _t, ...rest } = o;
          const transition = backTransition(was?.transition, o.transition ?? null);
          occurrences[o.id] = {
            ...rest,
            ...(transition ? { transition } : {}),
            excerpt: backExcerpt(was?.excerpt, o.excerpt),
            revision: rev(o),
          };
          affected.push(o.id);
        }
        const { defaultTransition: _d, ...restProject } = p;
        const d = backTransition(c.defaultTransition, p.defaultTransition ?? null);
        project = d ? { ...restProject, defaultTransition: d } : restProject;
      }
      const takes = { ...s.takes };
      if (c.takeFrames !== undefined && !sameFps(p.fps, c.project.fps)) {
        const old = new Map(c.takeFrames.map((x) => [x.takeId as string, x.durationFrames]));
        for (const t of Object.values(s.takes)) {
          const was = old.has(t.id) ? old.get(t.id)! : undefined;
          const next =
            was !== undefined &&
            rescaleTakeFrames({ ...t, durationFrames: was }, fwd.frame, p.fps) === t.durationFrames
              ? was
              : rescaleTakeFrames(t, back.frame, c.project.fps);
          if (next === t.durationFrames) continue;
          takes[t.id] = { ...t, durationFrames: next, revision: rev(t) };
          affected.push(t.id);
        }
      }
      return {
        state: {
          ...s,
          project: {
            ...project,
            frameWidth: c.project.width,
            frameHeight: c.project.height,
            fps: c.project.fps,
            revision: rev(p),
          },
          productions,
          compositions,
          layers,
          occurrences,
          takes,
        },
        inverse: {
          type: "SetProjectFormat",
          width: p.frameWidth,
          height: p.frameHeight,
          fps: p.fps,
        },
        affected,
      };
    }

    // ---------- 2D-sceneeditor (M3 del 2, DEC-0035) ----------

    case "CreateComposition": {
      assertNewId(s, c.compositionId);
      need(s.variants[c.variantId], tk("core-commands-apply.run.need.594b13c00857.6"));
      if (Object.values(s.compositions).some((x) => x.variantId === c.variantId && !x.removed))
        fail("invalid", tk("core-commands-apply.run.fail.5f34b746afab"));
      // Formatet følger alltid prosjektet (DEC-0039)
      const fields = compositionFields({
        ...c.fields,
        width: s.project.frameWidth,
        height: s.project.frameHeight,
      });
      return {
        state: {
          ...s,
          compositions: {
            ...s.compositions,
            [c.compositionId]: {
              id: c.compositionId,
              revision: 1,
              variantId: c.variantId,
              ...fields,
              camera: { shots: [] },
              removed: false,
              // Laget fra manuset slik det er nå (avvik ved senere endringer, DEC-0054)
              producedFrom: c.producedFrom
                ? producedFromOf(c.producedFrom)
                : { blockRevisions: currentBlockRevisions(s, c.variantId) },
            },
          },
        },
        inverse: { type: "UndoCreateComposition", compositionId: c.compositionId },
        affected: [c.compositionId],
      };
    }

    case "UndoCreateComposition": {
      const comp = need(s.compositions[c.compositionId], tk("core-commands-apply.comp.need.118fc96033c3.3"));
      if (Object.values(s.layers).some((l) => l.compositionId === comp.id))
        fail(
          "referenced",
          tk("core-commands-apply.run.fail.b141715260ce"),
        );
      const compositions = { ...s.compositions };
      delete compositions[comp.id];
      return {
        state: { ...s, compositions },
        inverse: {
          type: "CreateComposition",
          compositionId: comp.id,
          variantId: comp.variantId,
          fields: {
            name: comp.name,
            width: comp.width,
            height: comp.height,
            durationFrames: comp.durationFrames,
            background: comp.background,
          },
          ...(comp.producedFrom ? { producedFrom: comp.producedFrom } : {}),
        },
        affected: [comp.id],
      };
    }

    case "UpdateSceneDraft": {
      // AS1: utkastet fra Asset Studio i én kommando – én transaksjon og én angring
      const comp = need(s.compositions[c.compositionId], tk("core-commands-apply.comp.need.118fc96033c3.4"));
      need(s.occurrences[c.occurrenceId], tk("core-commands-apply.run.need.594b13c00857.7"));
      if (c.steps.length === 0 || c.steps.length > MAX_SCENE_DRAFT_STEPS)
        fail("invalid", tk("core-commands-apply.run.fail.e68866fcd708"));
      let cur = s;
      const inverses: Command[] = [];
      const affected = new Set<string>();
      const rigImport = c.steps.some(step => step.type === "SaveRigVersion" || step.type === "UndoAnimationChange");
      for (const step of c.steps) {
        if (!SCENE_DRAFT_STEPS.has(step.type) && !(rigImport && RIG_IMPORT_STEPS.has(step.type)))
          fail("invalid", tk("core-commands-apply.run.fail.12defba57062"));
        if (step.type === "UpdateComposition" && step.compositionId !== comp.id)
          fail("invalid", tk("core-commands-apply.run.fail.abf81837006b"));
        if (
          step.type === "UpdateLayers" &&
          step.layers.some((x) => cur.layers[x.layerId]?.compositionId !== comp.id)
        )
          fail("invalid", tk("core-commands-apply.run.fail.5cad11beebf2"));
        if (["CreateAssetVariant", "AddAssetVersion", "UndoCreateAssetVariant", "UndoAddAssetVersion"].includes(step.type)) {
          const allowedAssets = new Set(Object.values(cur.layers).filter(l => !l.removed && l.compositionId === comp.id).map(l => l.assetId));
          const assetId = step.type === "CreateAssetVariant" ? step.assetId : step.type === "AddAssetVersion" || step.type === "UndoCreateAssetVariant" ? cur.assetVariants[step.variantId]?.assetId : step.type === "UndoAddAssetVersion" ? cur.assetVariants[cur.assetVersions[step.versionId]?.variantId ?? ""]?.assetId : undefined;
          if (!assetId || !allowedAssets.has(assetId)) fail("invalid", tk("core-commands-apply.run.fail.3abfc8d89d9d"));
        }
        if (step.type === "AttachAnimationUse" && (step.occurrenceId !== c.occurrenceId || cur.layers[step.layerId]?.compositionId !== comp.id)) fail("invalid", tk("core-commands-apply.run.fail.08bf08b1cf5a"));
        if (step.type === "SetAnimationLayerEnabled" && cur.animationUses[step.useId]?.occurrenceId !== c.occurrenceId) fail("invalid", tk("core-commands-apply.run.fail.08bf08b1cf5a.2"));
        const r = run(cur, { ...env, command: materializeDraftStep(cur, step) });
        const inverse = sparseDraftStep(r.state, cur, r.inverse);
        cur = r.state;
        inverses.unshift(inverse);
        for (const id of r.affected) affected.add(id);
      }
      return {
        state: oneRevisionPerRow(s, cur),
        inverse: {
          type: "UpdateSceneDraft",
          occurrenceId: c.occurrenceId,
          compositionId: c.compositionId,
          steps: inverses,
        },
        affected: [...affected],
      };
    }

    case "RetimeScene": {
      // SV1: alle tidsendringene i én kommando – én transaksjon og én angring
      const comp = need(s.compositions[c.compositionId], tk("core-commands-apply.comp.need.118fc96033c3.5"));
      need(s.occurrences[c.occurrenceId], tk("core-commands-apply.run.need.594b13c00857.8"));
      if (c.steps.length === 0 || c.steps.length > 20)
        fail("invalid", tk("core-commands-apply.run.fail.09e0764e15c7"));
      let cur = s;
      const inverses: Command[] = [];
      const affected = new Set<string>();
      for (const step of c.steps) {
        if (!RETIME_STEPS.has(step.type))
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.f1e5c378fda7"),
          );
        if (step.type === "UpdateComposition" && step.compositionId !== comp.id)
          fail("invalid", tk("core-commands-apply.run.fail.abf81837006b.2"));
        const r = run(cur, { ...env, command: step });
        cur = r.state;
        inverses.unshift(r.inverse);
        for (const id of r.affected) affected.add(id);
      }
      return {
        state: oneRevisionPerRow(s, cur),
        inverse: {
          type: "RetimeScene",
          occurrenceId: c.occurrenceId,
          compositionId: c.compositionId,
          steps: inverses,
        },
        affected: [...affected],
      };
    }

    case "UpdateComposition": {
      const comp = need(s.compositions[c.compositionId], tk("core-commands-apply.comp.need.118fc96033c3.6"));
      // Formatet endres bare samlet for prosjektet (SetProjectFormat, DEC-0039)
      const fields = compositionFields({ ...c.fields, width: comp.width, height: comp.height });
      let camera = comp.camera;
      if (c.camera !== undefined) {
        const r = normalizeCamera(c.camera);
        if (!r.ok) fail("invalid", r.error);
        if (JSON.stringify(r.value).length > MAX_CAMERA_JSON)
          fail("invalid", tk("core-commands-apply.run.fail.fce1be24f040"));
        camera = r.value;
      }
      let timing = comp.timing;
      if (c.timing !== undefined) {
        const r = normalizeTiming(c.timing);
        if (!r.ok) fail("invalid", r.error);
        if (JSON.stringify(r.value).length > 60000)
          fail("invalid", tk("core-commands-apply.run.fail.96412ad53411"));
        timing = isEmptyTiming(r.value) ? undefined : r.value;
      }
      const nextComp: ProjectState["compositions"][string] = {
        ...comp,
        ...fields,
        camera,
        revision: rev(comp),
      };
      if (timing) (nextComp as { timing?: CompositionTiming }).timing = timing;
      else delete (nextComp as { timing?: CompositionTiming }).timing;
      return {
        state: {
          ...s,
          compositions: {
            ...s.compositions,
            [comp.id]: nextComp,
          },
        },
        inverse: {
          type: "UpdateComposition",
          compositionId: comp.id,
          fields: {
            name: comp.name,
            width: comp.width,
            height: comp.height,
            durationFrames: comp.durationFrames,
            background: comp.background,
          },
          ...(c.camera !== undefined ? { camera: comp.camera } : {}),
          ...(c.timing !== undefined ? { timing: comp.timing ?? EMPTY_TIMING } : {}),
        },
        affected: [comp.id],
      };
    }

    case "SetCompositionRemoved": {
      const comp = need(s.compositions[c.compositionId], tk("core-commands-apply.comp.need.118fc96033c3.7"));
      if (
        !c.removed &&
        Object.values(s.compositions).some(
          (x) => x.id !== comp.id && x.variantId === comp.variantId && !x.removed,
        )
      )
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.c6d8411e74ee"),
        );
      return {
        state: {
          ...s,
          compositions: {
            ...s.compositions,
            [comp.id]: { ...comp, removed: c.removed, revision: rev(comp) },
          },
        },
        inverse: { type: "SetCompositionRemoved", compositionId: comp.id, removed: comp.removed },
        affected: [comp.id],
      };
    }

    case "AddTemplateInstance": {
      assertNewId(s, c.instanceId);
      const f = c.fields;
      const comp = need(s.compositions[f.compositionId], tk("core-commands-apply.comp.need.118fc96033c3.8"));
      if (comp.removed) fail("invalid", tk("core-commands-apply.run.fail.838d32162c1a"));
      const ver = need(s.assetVersions[f.templateVersionId], tk("core-commands-apply.ver.need.45e9bd47ebb5"));
      const asset = s.assets[f.templateAssetId];
      if (!asset || asset.kind !== "template" || !ver.template || s.assetVariants[ver.variantId]?.assetId !== asset.id)
        fail("invalid", tk("core-commands-apply.run.fail.89bcb1f2b3c1"));
      const e = templateValuesError(s, f.values);
      if (e) fail("invalid", e);
      return {
        state: {
          ...s,
          templateInstances: {
            ...s.templateInstances,
            [c.instanceId]: {
              id: c.instanceId,
              revision: 1,
              compositionId: comp.id,
              templateAssetId: asset.id,
              templateVersionId: ver.id,
              values: f.values,
              removed: false,
            },
          },
        },
        inverse: { type: "UndoAddTemplateInstance", instanceId: c.instanceId },
        affected: [c.instanceId],
      };
    }

    case "UndoAddTemplateInstance": {
      const inst = need(s.templateInstances[c.instanceId], tk("core-commands-apply.inst.need.57c39ddfee5c"));
      if (Object.values(s.layers).some((l) => l.template?.instanceId === inst.id))
        fail("referenced", tk("core-commands-apply.run.fail.50344121fa7d"));
      const templateInstances = { ...s.templateInstances };
      delete templateInstances[inst.id];
      return {
        state: { ...s, templateInstances },
        inverse: {
          type: "AddTemplateInstance",
          instanceId: inst.id,
          fields: {
            compositionId: inst.compositionId,
            templateAssetId: inst.templateAssetId,
            templateVersionId: inst.templateVersionId,
            values: inst.values,
          },
        },
        affected: [inst.id],
      };
    }

    case "UpdateTemplateInstance": {
      const inst = need(s.templateInstances[c.instanceId], tk("core-commands-apply.inst.need.57c39ddfee5c.2"));
      const ver = need(s.assetVersions[c.fields.templateVersionId], tk("core-commands-apply.ver.need.45e9bd47ebb5.2"));
      if (!ver.template || s.assetVariants[ver.variantId]?.assetId !== inst.templateAssetId)
        fail("invalid", tk("core-commands-apply.run.fail.8382aacbceca"));
      const e = templateValuesError(s, c.fields.values);
      if (e) fail("invalid", e);
      return {
        state: {
          ...s,
          templateInstances: {
            ...s.templateInstances,
            [inst.id]: { ...inst, values: c.fields.values, templateVersionId: ver.id, revision: rev(inst) },
          },
        },
        inverse: {
          type: "UpdateTemplateInstance",
          instanceId: inst.id,
          fields: { values: inst.values, templateVersionId: inst.templateVersionId },
        },
        affected: [inst.id],
      };
    }

    case "ApplyTemplate": {
      if (c.steps.length === 0 || c.steps.length > 20)
        fail("invalid", tk("core-commands-apply.run.fail.cb5e3723481e"));
      let cur = s;
      const inverses: Command[] = [];
      const affected = new Set<string>();
      for (const step of c.steps) {
        if (!TEMPLATE_STEPS.has(step.type))
          fail("invalid", tk("core-commands-apply.run.fail.9b5fcd16022d"));
        const r = run(cur, { ...env, command: step });
        cur = r.state;
        inverses.unshift(r.inverse);
        for (const id of r.affected) affected.add(id);
      }
      // Lag som peker på en malforekomst, må peke på en som finnes, i samme 2D-scene
      for (const id of affected) {
        const l = cur.layers[id];
        if (!l?.template) continue;
        const inst = cur.templateInstances[l.template.instanceId];
        if (!inst || inst.compositionId !== l.compositionId)
          fail("invalid", tk("core-commands-apply.run.fail.44711e2e68a5"));
      }
      return {
        state: oneRevisionPerRow(s, cur),
        inverse: { type: "ApplyTemplate", steps: inverses },
        affected: [...affected],
      };
    }

    case "AddLayers": {
      if (c.layers.length === 0) fail("invalid", tk("core-commands-apply.run.fail.12e7dfc4dafc"));
      if (c.layers.length > 500)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.7bd082749046"),
        );
      const layers = { ...s.layers };
      const ids = new Set<string>();
      for (const n of c.layers) {
        assertNewId(s, n.layerId);
        if (ids.has(n.layerId))
          fail(
            "duplicate_id",
            tk("core-commands-apply.run.fail.5f0710f61967", { layerId: String(n.layerId) }),
          );
        ids.add(n.layerId);
        const comp = need(s.compositions[n.compositionId], tk("core-commands-apply.comp.need.118fc96033c3.9"));
        if (comp.removed)
          fail("invalid", tk("core-commands-apply.run.fail.838d32162c1a.2"));
        const fields = layerFields(s, n.fields);
        let orderKey = n.orderKey;
        const keys = Object.values(layers)
          .filter((l) => l.compositionId === comp.id)
          .map((l) => l.orderKey)
          .sort(compareKeys);
        // Utelatt plassering: øverst – men en lokasjon eller et miljø (bakgrunnsbilde) legges nederst
        // (Mars 2026-10-13: «Når en legger til en lokasjon så skal den default legge seg i bakgrunnen»)
        if (orderKey === undefined)
          orderKey =
            fields.kind === "background" && fields.assetId !== null
              ? keyBetween(null, keys[0] ?? null)
              : keyBetween(keys[keys.length - 1] ?? null, null);
        else if (!isValidOrderKey(orderKey) || keys.includes(orderKey))
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.ff7ff57d4d5b"),
          );
        layers[n.layerId] = {
          id: n.layerId,
          revision: 1,
          compositionId: comp.id,
          orderKey,
          ...fields,
          removed: false,
        };
      }
      checkGroups(
        s,
        { ...s, layers },
        c.layers.map((n) => n.layerId),
      );
      checkMasks(
        s,
        { ...s, layers },
        c.layers.map((n) => n.layerId),
      );
      return {
        state: { ...s, layers },
        inverse: { type: "UndoAddLayers", layerIds: c.layers.map((n) => n.layerId) },
        affected: c.layers.map((n) => n.layerId),
      };
    }

    case "UndoAddLayers": {
      const layers = { ...s.layers };
      const restored = c.layerIds.map((id) => {
        const l = need(s.layers[id], tk("core-commands-apply.l.need.80c6bba9c7a0.3"));
        delete layers[id];
        return l;
      });
      return {
        state: { ...s, layers },
        inverse: {
          type: "AddLayers",
          layers: restored.map((l) => ({
            layerId: l.id,
            compositionId: l.compositionId,
            orderKey: l.orderKey,
            fields: fieldsOfLayer(l),
          })),
        },
        affected: [...c.layerIds],
      };
    }

    case "UpdateLayers": {
      if (c.layers.length === 0) fail("invalid", tk("core-commands-apply.run.fail.31060cbe5b55"));
      if (new Set(c.layers.map((x) => x.layerId)).size !== c.layers.length)
        fail("invalid", tk("core-commands-apply.run.fail.9de614734d96"));
      const layers = { ...s.layers };
      const before: { layerId: CompositionLayer["id"]; fields: LayerFields }[] = [];
      for (const u of c.layers) {
        const l = need(s.layers[u.layerId], tk("core-commands-apply.l.need.80c6bba9c7a0.4"));
        before.push({
          layerId: l.id,
          fields: {
            ...fieldsOfLayer(l),
            languageImages: l.languageImages ?? [],
            mask: l.mask ?? null,
            blend: l.blend ?? "normal",
            activeRange: l.activeRange ?? null,
            text: l.text ?? null,
            shape: l.shape ?? null,
            effects: l.effects ?? null,
            template: l.template ?? null,
          },
        });
        const {
          languageImages: _li,
          mask: _m,
          blend: _b,
          activeRange: _ar,
          text: _tx,
          shape: _sh,
          effects: _ef,
          template: _tp,
          ...rest
        } = l;
        layers[l.id] = { ...rest, ...layerFields(s, u.fields, l), revision: rev(l) };
      }
      checkGroups(
        s,
        { ...s, layers },
        c.layers.map((x) => x.layerId),
      );
      checkMasks(
        s,
        { ...s, layers },
        c.layers.map((x) => x.layerId),
      );
      return {
        state: { ...s, layers },
        inverse: { type: "UpdateLayers", layers: before },
        affected: c.layers.map((x) => x.layerId),
      };
    }

    case "MoveLayer": {
      const l = need(s.layers[c.layerId], tk("core-commands-apply.l.need.80c6bba9c7a0.5"));
      const keys = sortedLayerKeys(s, l.compositionId, l.id);
      let orderKey: string;
      if (c.beforeLayerId === null) {
        orderKey = keyBetween(keys[keys.length - 1] ?? null, null);
      } else {
        const target = need(
          s.layers[c.beforeLayerId],
          tk("core-commands-apply.target.need.0df9c8578b48"),
        );
        if (target.compositionId !== l.compositionId || target.id === l.id)
          fail(
            "invalid",
            tk("core-commands-apply.run.fail.0de72e918a2c"),
          );
        const i = keys.indexOf(target.orderKey);
        orderKey = keyBetween(keys[i - 1] ?? null, target.orderKey);
      }
      // Angre: tilbake rett bak laget som lå foran før flyttingen (eller helt foran)
      const inFront = Object.values(s.layers)
        .filter((x) => x.compositionId === l.compositionId && x.id !== l.id)
        .filter((x) => compareKeys(x.orderKey, l.orderKey) > 0)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey))[0];
      return {
        state: { ...s, layers: { ...s.layers, [l.id]: { ...l, orderKey, revision: rev(l) } } },
        inverse: { type: "MoveLayer", layerId: l.id, beforeLayerId: inFront?.id ?? null },
        affected: [l.id],
      };
    }

    case "SetLayersRemoved": {
      if (c.layerIds.length === 0) fail("invalid", tk("core-commands-apply.run.fail.beacd2f4090b"));
      const layers = { ...s.layers };
      const changed = [...new Set(c.layerIds)]
        .map((id) => need(s.layers[id], tk("core-commands-apply.changed.need.31893f8f2dbe")))
        .filter((l) => l.removed !== c.removed);
      if (changed.length === 0) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.19"));
      for (const l of changed) layers[l.id] = { ...l, removed: c.removed, revision: rev(l) };
      return {
        state: { ...s, layers },
        inverse: {
          type: "SetLayersRemoved",
          layerIds: changed.map((l) => l.id),
          removed: !c.removed,
        },
        affected: changed.map((l) => l.id),
      };
    }

    // ---------- Lyd i filmen (DEC-0044) ----------

    case "AddAudioClips": {
      if (!Array.isArray(c.clips) || c.clips.length === 0)
        fail("invalid", tk("core-commands-apply.run.fail.eb7e8fe80886"));
      if (c.clips.length > 500)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.379370657c88"),
        );
      const audioClips = { ...s.audioClips };
      const ids = new Set<string>();
      for (const n of c.clips) {
        assertNewId(s, n.clipId);
        if (ids.has(n.clipId))
          fail(
            "duplicate_id",
            tk("core-commands-apply.run.fail.e2820ee3b7c5", { clipId: String(n.clipId) }),
          );
        ids.add(n.clipId);
        audioClips[n.clipId] = {
          id: n.clipId,
          revision: 1,
          ...audioFields(s, n.fields),
          removed: false,
        };
      }
      // DV2: en ny replikkforekomst får sin første lydversjon (deterministisk ID) og spiller den
      let dialogueVersions = s.dialogueVersions;
      for (const n of c.clips) {
        const a = audioClips[n.clipId]!;
        if (!isVersionedKind(a)) continue;
        const file = { assetId: a.assetId, assetVariantId: a.assetVariantId, assetVersionId: a.versionId };
        const vid = dialogueVersionIdFor(a.id, file);
        assertNewId(s, vid);
        dialogueVersions = dialogueVersions === s.dialogueVersions ? { ...dialogueVersions } : dialogueVersions;
        (dialogueVersions as Record<string, DialogueVersion>)[vid] = {
          id: vid,
          revision: 1,
          clipId: a.id,
          ...file,
          ...clipOwnEdit(a),
          ...LEGACY_META,
          scriptRevision: a.blockId ? s.blocks[a.blockId]?.currentRev ?? null : null,
          ...(c.dialogueMeta ?? {}),
          removed: false,
        };
        audioClips[a.id] = { ...a, activeVersionId: vid };
        if (c.dialogueMeta) dialogueVersionFields(s, a, (dialogueVersions as Record<string, DialogueVersion>)[vid] as DialogueVersion);
      }
      return {
        state: { ...s, audioClips, dialogueVersions },
        inverse: { type: "UndoAddAudioClips", clipIds: c.clips.map((n) => n.clipId) },
        affected: c.clips.map((n) => n.clipId),
      };
    }

    case "UndoAddAudioClips": {
      const audioClips = { ...s.audioClips };
      let dialogueVersions = s.dialogueVersions;
      const restored = c.clipIds.map((id) => {
        const a = need(s.audioClips[id], tk("core-commands-apply.a.need.842e287f8451"));
        delete audioClips[id];
        // DV2: bare den første versjonen (laget sammen med klippet) går med. Finnes flere, er det lagt til
        // opptak eller redigering siden – da angres ikke opprettelsen (ingen lydversjon går tapt).
        const versions = versionsOfClip(s, id, true);
        if (versions.length) {
          const first = dialogueVersionIdFor(id, {
            assetId: a.assetId,
            assetVariantId: a.assetVariantId,
            assetVersionId: a.versionId,
          });
          if (versions.length > 1 || versions[0]!.id !== first || Object.values(s.lipsyncResults).some((r) => r.clipId === id))
            fail(
              "referenced",
              tk("core-commands-apply.restored.fail.9c45a54b72ed"),
              versions.map((v) => v.id),
            );
          dialogueVersions = dialogueVersions === s.dialogueVersions ? { ...dialogueVersions } : dialogueVersions;
          delete (dialogueVersions as Record<string, DialogueVersion>)[first];
        }
        return a;
      });
      return {
        state: { ...s, audioClips, dialogueVersions },
        inverse: {
          type: "AddAudioClips",
          clips: restored.map((a) => ({ clipId: a.id, fields: audioClipFieldsOf(a) })),
        },
        affected: [...c.clipIds],
      };
    }

    case "UpdateAudioClips": {
      if (!Array.isArray(c.clips) || c.clips.length === 0)
        fail("invalid", tk("core-commands-apply.run.fail.24fdaec2ca86"));
      if (new Set(c.clips.map((x) => x.clipId)).size !== c.clips.length)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.a7b384899f9b"),
        );
      const audioClips = { ...s.audioClips };
      const dialogueVersions: Record<string, DialogueVersion> = { ...s.dialogueVersions };
      const before: { clipId: AudioClip["id"]; fields: AudioClipFields }[] = [];
      const beforeActive: Record<string, string> = {};
      const created: string[] = [];
      const restored: string[] = [];
      const touchedVersions: string[] = [];
      for (const u of c.clips) {
        const a = need(s.audioClips[u.clipId], tk("core-commands-apply.a.need.842e287f8451.2"));
        before.push({ clipId: a.id, fields: audioClipFieldsOf(a) });
        // Alle feltene erstattes; språket fjernes når det ikke er med (standard for lydtypen)
        const { language: _lang, ...rest } = a;
        const f = audioFields(s, u.fields);
        const active = activeDialogueVersion(s, a);
        if (!active) {
          audioClips[a.id] = { ...rest, ...f, revision: rev(a) };
          continue;
        }
        beforeActive[a.id] = active.id;
        // DV2: versjonert replikk. Plassering og metadata hører til klippet; fil og redigering til versjonen.
        // Klippets speilfelt settes av mirrorDialogueClips etterpå.
        audioClips[a.id] = {
          ...rest,
          occurrenceId: f.occurrenceId,
          kind: f.kind,
          name: f.name,
          blockId: f.blockId,
          offsetMs: f.offsetMs,
          muted: f.muted,
          continues: f.continues,
          ...(f.language !== undefined ? { language: f.language } : {}),
          revision: rev(a),
        };
        const file = { assetId: f.assetId, assetVariantId: f.assetVariantId, assetVersionId: f.versionId };
        const edit: DialogueEdit = { ...editFromAudioFields(f), compositionId: active.compositionId };
        if (sameFile(active, file)) {
          dialogueVersions[active.id] = { ...active, ...edit, revision: rev(active) };
          touchedVersions.push(active.id);
          continue;
        }
        // Ny fil (nytt take valgt): bytt til versjonen for den filen med SIN redigering, eller lag en ny.
        const exact = c.activeVersionIds?.[a.id];
        const candidates = versionsOfClip(s, a.id, true).filter((v) => sameFile(v, file));
        const existing =
          candidates.find((v) => v.id === exact) ?? candidates.find((v) => !v.removed) ?? candidates[0];
        if (existing) {
          if (existing.removed) {
            dialogueVersions[existing.id] = { ...existing, removed: false, revision: rev(existing) };
            touchedVersions.push(existing.id);
            restored.push(existing.id);
          }
          audioClips[a.id] = { ...audioClips[a.id]!, activeVersionId: existing.id };
          continue;
        }
        const vid = dialogueVersionIdFor(a.id, file);
        assertNewId(s, vid);
        dialogueVersions[vid] = {
          id: vid,
          revision: 1,
          clipId: a.id,
          ...file,
          ...edit,
          ...LEGACY_META,
          parentVersionId: active.id,
          scriptRevision: f.blockId ? (s.blocks[f.blockId]?.currentRev ?? null) : null,
          removed: false,
        };
        created.push(vid);
        audioClips[a.id] = { ...audioClips[a.id]!, activeVersionId: vid };
      }
      // Inversen fjerner versjonene som ble laget her – bare de som ikke lenger er aktive eller brukt
      for (const id of c.dropDialogueVersions ?? []) {
        const v = dialogueVersions[id];
        if (!v) continue;
        if (Object.values(audioClips).some((x) => x.activeVersionId === id))
          fail("referenced", tk("core-commands-apply.run.fail.91045cf1a494"), [id]);
        if (Object.values(s.lipsyncResults).some((r) => r.dialogueVersionId === id))
          fail("referenced", tk("core-commands-apply.run.fail.8d198ddd5d35"), [id]);
        delete dialogueVersions[id];
      }
      const reRemoved: string[] = [];
      for (const id of c.reRemoveDialogueVersions ?? []) {
        const v = dialogueVersions[id];
        if (!v || v.removed) continue;
        if (Object.values(audioClips).some((x) => x.activeVersionId === id))
          fail("referenced", tk("core-commands-apply.run.fail.91045cf1a494.2"), [id]);
        dialogueVersions[id] = { ...v, removed: true, revision: rev(s.dialogueVersions[id] ?? v) };
        reRemoved.push(id);
      }
      return {
        state: { ...s, audioClips, dialogueVersions },
        inverse: {
          type: "UpdateAudioClips",
          clips: before,
          ...(created.length ? { dropDialogueVersions: created } : {}),
          ...(restored.length ? { reRemoveDialogueVersions: restored } : {}),
          ...(Object.keys(beforeActive).length ? { activeVersionIds: beforeActive } : {}),
        },
        affected: [...new Set([...c.clips.map((x) => x.clipId), ...created, ...touchedVersions, ...(c.dropDialogueVersions ?? []), ...reRemoved])],
      };
    }

    // ---------- Lydversjoner per replikk (DV2) ----------

    case "AddDialogueVersion": {
      const a = need(s.audioClips[c.clipId], tk("core-commands-apply.a.need.4bd65c8ae95b"));
      if (!isVersionedKind(a))
        fail("invalid", tk("core-commands-apply.run.fail.92fc2816e38c"));
      assertNewId(s, c.dialogueVersionId);
      const v = dialogueVersionFields(s, a, c.fields);
      const prev = activeDialogueVersion(s, a);
      // Et klipp uten versjon ennå (før backfill) får aldri en versjon som overskriver redigeringen i klippet
      if (!prev)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.32f5a46a7fe1"),
        );
      const row: DialogueVersion = { id: c.dialogueVersionId, revision: 1, clipId: a.id, ...v, removed: false };
      const activate = c.activate;
      return {
        state: {
          ...s,
          dialogueVersions: { ...s.dialogueVersions, [row.id]: row },
          audioClips: activate ? { ...s.audioClips, [a.id]: { ...a, activeVersionId: row.id, revision: rev(a) } } : s.audioClips,
        },
        inverse: { type: "UndoAddDialogueVersion", dialogueVersionId: row.id, restoreActiveId: activate ? prev.id : null },
        affected: activate ? [row.id, a.id] : [row.id],
      };
    }

    case "UndoAddDialogueVersion": {
      const v = need(s.dialogueVersions[c.dialogueVersionId], tk("core-commands-apply.v.need.aefe1a88d6d9"));
      const a = need(s.audioClips[v.clipId], tk("core-commands-apply.a.need.4bd65c8ae95b.2"));
      if (Object.values(s.lipsyncResults).some((r) => r.dialogueVersionId === v.id))
        fail("referenced", tk("core-commands-apply.run.fail.5a07283b276c"), [v.id]);
      const wasActive = a.activeVersionId === v.id;
      let clip = a;
      if (wasActive) {
        const back = c.restoreActiveId ? s.dialogueVersions[c.restoreActiveId] : undefined;
        if (!back || back.clipId !== a.id)
          fail("invalid", tk("core-commands-apply.run.fail.c71669fa3021"));
        clip = { ...a, activeVersionId: back.id, revision: rev(a) };
      }
      const dialogueVersions = { ...s.dialogueVersions };
      delete dialogueVersions[v.id];
      const { id: _id, revision: _r, clipId: _c, createdAt: _at, removed: _rm, ...fields } = v;
      return {
        state: { ...s, dialogueVersions, audioClips: clip === a ? s.audioClips : { ...s.audioClips, [a.id]: clip } },
        inverse: { type: "AddDialogueVersion", dialogueVersionId: v.id, clipId: a.id, fields, activate: wasActive },
        affected: wasActive ? [v.id, a.id] : [v.id],
      };
    }

    case "SetActiveDialogueVersion": {
      const a = need(s.audioClips[c.clipId], tk("core-commands-apply.a.need.4bd65c8ae95b.3"));
      const v = need(s.dialogueVersions[c.dialogueVersionId], tk("core-commands-apply.v.need.aefe1a88d6d9.2"));
      if (v.clipId !== a.id)
        fail("invalid", tk("core-commands-apply.run.fail.2c8fce45e436"));
      if (v.removed) fail("invalid", tk("core-commands-apply.run.fail.74da5d95ba4d"));
      const prev = a.activeVersionId ?? null;
      if (prev === v.id) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.20"));
      if (!prev) fail("invalid", tk("core-commands-apply.run.fail.b4d4f3fa97b0.2"));
      return {
        state: { ...s, audioClips: { ...s.audioClips, [a.id]: { ...a, activeVersionId: v.id, revision: rev(a) } } },
        inverse: { type: "SetActiveDialogueVersion", clipId: a.id, dialogueVersionId: prev },
        affected: [a.id],
      };
    }

    case "UpdateDialogueVersionEdit": {
      const v = need(s.dialogueVersions[c.dialogueVersionId], tk("core-commands-apply.v.need.aefe1a88d6d9.3"));
      const a = need(s.audioClips[v.clipId], tk("core-commands-apply.a.need.4bd65c8ae95b.4"));
      const edit = dialogueEditFields(s, a, v, c.edit);
      return {
        state: { ...s, dialogueVersions: { ...s.dialogueVersions, [v.id]: { ...v, ...edit, revision: rev(v) } } },
        inverse: { type: "UpdateDialogueVersionEdit", dialogueVersionId: v.id, edit: editOf(v) },
        affected: [v.id],
      };
    }

    case "MoveDialogueLine": {
      const a = need(s.audioClips[c.clipId], tk("core-commands-apply.a.need.4bd65c8ae95b.5"));
      if (!Number.isInteger(c.offsetMs) || c.offsetMs < 0 || c.offsetMs > AUDIO_MAX_MS)
        fail("invalid", tk("core-commands-apply.run.fail.98d1da121bbe"));
      if (c.offsetMs === a.offsetMs) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.21"));
      const clash = dialogueOverlaps(s, a.id, c.offsetMs);
      if (clash.length && !c.allowOverlap)
        fail(
          "invalid",
          tk("core-commands-apply.run.fail.15615d4251bb"),
          clash,
        );
      return {
        state: { ...s, audioClips: { ...s.audioClips, [a.id]: { ...a, offsetMs: c.offsetMs, revision: rev(a) } } },
        inverse: { type: "MoveDialogueLine", clipId: a.id, offsetMs: a.offsetMs, allowOverlap: true },
        affected: [a.id],
      };
    }

    case "SetDialogueVersionRemoved": {
      const v = need(s.dialogueVersions[c.dialogueVersionId], tk("core-commands-apply.v.need.aefe1a88d6d9.4"));
      if (typeof c.removed !== "boolean" || v.removed === c.removed) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.22"));
      if (c.removed && s.audioClips[v.clipId]?.activeVersionId === v.id)
        fail("invalid", tk("core-commands-apply.run.fail.1090bbf0b3ea"));
      return {
        state: { ...s, dialogueVersions: { ...s.dialogueVersions, [v.id]: { ...v, removed: c.removed, revision: rev(v) } } },
        inverse: { type: "SetDialogueVersionRemoved", dialogueVersionId: v.id, removed: !c.removed },
        affected: [v.id],
      };
    }

    case "SetAudioClipsRemoved": {
      if (!Array.isArray(c.clipIds) || c.clipIds.length === 0)
        fail("invalid", tk("core-commands-apply.run.fail.f4543f02b71e"));
      const audioClips = { ...s.audioClips };
      const changed = [...new Set(c.clipIds)]
        .map((id) => need(s.audioClips[id], tk("core-commands-apply.changed.need.002144ecb105")))
        .filter((a) => a.removed !== c.removed);
      if (changed.length === 0) fail("invalid", tk("core-commands-apply.run.fail.1191fb10a4fb.23"));
      for (const a of changed) audioClips[a.id] = { ...a, removed: c.removed, revision: rev(a) };
      return {
        state: { ...s, audioClips },
        inverse: {
          type: "SetAudioClipsRemoved",
          clipIds: changed.map((a) => a.id),
          removed: !c.removed,
        },
        affected: changed.map((a) => a.id),
      };
    }
  }
}

export function applyCommand(state: ProjectState, env: CommandEnvelope): ApplyResult {
  try {
    if (env.baseRevisions) {
      const stale: string[] = [];
      for (const [id, expected] of Object.entries(env.baseRevisions)) {
        const actual = revisionOf(state, id);
        if (actual !== expected) stale.push(id);
      }
      if (stale.length > 0) {
        return {
          ok: false,
          error: {
            code: "revision_conflict",
            message: tk("core-commands-apply.message.message.7fb07b9c942c"),
            details: stale,
          },
        };
      }
    }
    const ran = run(state, env);
    const { inverse } = ran;
    let affected = ran.affected;
    let next = ran.state;
    // Notater på tekst eller scener som forsvinner (angre av import, ny scene, innsetting …):
    // slettede notater fjernes med, synlige notater stopper endringen med en tydelig melding (DEC-0031)
    const orphans = Object.values(next.annotations).filter(
      (a) =>
        (a.blockId !== null && !Object.prototype.hasOwnProperty.call(next.blocks, a.blockId)) ||
        (a.variantId !== null && !Object.prototype.hasOwnProperty.call(next.variants, a.variantId)),
    );
    if (orphans.length) {
      const visible = orphans.filter((a) => !a.removed);
      if (visible.length)
        fail(
          "referenced",
          visible.length === 1
            ? tk("core-commands-apply.apply-command.fail.f1efa40121aa")
            : tk("core-commands-apply.apply-command.fail.1ca964426207", { length: String(visible.length) }),
          visible.map((a) => a.id),
        );
      const annotations = { ...next.annotations };
      for (const a of orphans) delete annotations[a.id];
      next = { ...next, annotations };
    }
    // 2D-scener på scener som forsvinner, og lag som viser ressurser som forsvinner (DEC-0035)
    if (next.variants !== state.variants || next.compositions !== state.compositions) {
      const lost = Object.values(next.compositions).filter(
        (c) => !Object.prototype.hasOwnProperty.call(next.variants, c.variantId),
      );
      if (lost.length)
        fail(
          "referenced",
          tk("core-commands-apply.apply-command.fail.5fdcb9475e15"),
          lost.map((c) => c.id),
        );
    }
    if (
      next.assets !== state.assets ||
      next.assetVariants !== state.assetVariants ||
      next.assetVersions !== state.assetVersions
    ) {
      const has = (o: object, id: string | null) =>
        id === null || Object.prototype.hasOwnProperty.call(o, id);
      const lost = Object.values(next.layers).filter(
        (l) =>
          !has(next.assets, l.assetId) ||
          !has(next.assetVariants, l.assetVariantId) ||
          !has(next.assetVersions, l.versionId),
      );
      if (lost.length)
        fail(
          "referenced",
          tk("core-commands-apply.apply-command.fail.3d3dec29e0b1"),
          lost.map((l) => l.id),
        );
    }
    // Lyd i scener eller fra lydfiler som forsvinner (angre av opprettelse, DEC-0044)
    if (
      next.occurrences !== state.occurrences ||
      next.blocks !== state.blocks ||
      next.assets !== state.assets ||
      next.assetVariants !== state.assetVariants ||
      next.assetVersions !== state.assetVersions
    ) {
      const has = (o: object, id: string | null) =>
        id === null || Object.prototype.hasOwnProperty.call(o, id);
      const lost = Object.values(next.audioClips).filter(
        (a) =>
          !has(next.occurrences, a.occurrenceId) ||
          !has(next.blocks, a.blockId) ||
          !has(next.assets, a.assetId) ||
          !has(next.assetVariants, a.assetVariantId) ||
          !has(next.assetVersions, a.versionId),
      );
      if (lost.length)
        fail(
          "referenced",
          tk("core-commands-apply.apply-command.fail.4713d7677358"),
          lost.map((a) => a.id),
        );
    }
    // Klippdeler og tidskoblinger som peker på noe som forsvinner (angre av opprettelse, DEC-0048).
    // Også fjernede rader: de ligger fortsatt i databasen med fremmednøkkel.
    if (
      next.occurrences !== state.occurrences ||
      next.blocks !== state.blocks ||
      next.takes !== state.takes ||
      next.layers !== state.layers
    ) {
      const has = (o: object, id: string | null) =>
        id === null || Object.prototype.hasOwnProperty.call(o, id);
      const lost = [
        ...Object.values(next.clipParts).filter(
          (p) => !has(next.occurrences, p.occurrenceId) || !has(next.takes, p.takeId),
        ),
        ...Object.values(next.timeLinks).filter(
          (l) =>
            !has(next.occurrences, l.occurrenceId) ||
            !has(next.blocks, l.blockId) ||
            !has(next.layers, l.layerId),
        ),
      ];
      if (lost.length)
        fail(
          "referenced",
          tk("core-commands-apply.apply-command.fail.353c6e16b98d"),
          lost.map((x) => x.id),
        );
    }
    // Kontinuitetshendelser (DEC-0055) når manus, scener eller ressurser endres
    if (
      next.scenes !== state.scenes ||
      next.blocks !== state.blocks ||
      next.variants !== state.variants ||
      next.assets !== state.assets ||
      next.assetVariants !== state.assetVariants
    ) {
      const has = (o: object, id: string | null) =>
        id === null || Object.prototype.hasOwnProperty.call(o, id);
      let events: Record<string, ContinuityEvent> | null = null;
      const lost: string[] = [];
      for (const e of Object.values(next.continuityEvents)) {
        const gone =
          !has(next.assets, e.assetId) ||
          !has(next.assetVariants, e.fromVariantId) ||
          !has(next.assetVariants, e.toVariantId) ||
          !has(next.scenes, e.untilSceneId) ||
          !has(next.blocks, e.blockId);
        // Linjen har flyttet til en annen scene (deling, sammenslåing, angring av dem): hendelsen følger linjen
        const b = e.blockId ? next.blocks[e.blockId] : undefined;
        const lineScene = b ? next.variants[b.variantId]?.sceneId : undefined;
        if (!gone && lineScene && lineScene !== e.sceneId) {
          events ??= { ...next.continuityEvents };
          const was = state.continuityEvents[e.id];
          events[e.id] = {
            ...e,
            sceneId: lineScene,
            revision: was ? was.revision + 1 : e.revision,
          };
          continue;
        }
        if (!gone && has(next.scenes, e.sceneId)) continue;
        // Fjernede hendelser og avviste forslag slettes sammen med det de pekte på (angre av opprettelse)
        if (e.removed || e.status === "dismissed") {
          events ??= { ...next.continuityEvents };
          delete events[e.id];
        } else lost.push(e.id);
      }
      if (lost.length)
        fail(
          "referenced",
          tk("core-commands-apply.apply-command.fail.a9b441303514"),
          lost,
        );
      if (events) next = { ...next, continuityEvents: events };
    }
    // Oversettelser av linjer eller scener som forsvinner (angre av opprettelse, DEC-0058): fjernede slettes
    // med, gjeldende stopper endringen
    if (next.blocks !== state.blocks || next.variants !== state.variants) {
      const has = (o: object, id: string | null) =>
        id === null || Object.prototype.hasOwnProperty.call(o, id);
      let translations: Record<string, Translation> | null = null;
      const lost: string[] = [];
      for (const t of Object.values(next.translations)) {
        if (has(next.blocks, t.blockId) && has(next.variants, t.variantId)) continue;
        if (t.removed) {
          translations ??= { ...next.translations };
          delete translations[t.id];
        } else lost.push(t.id);
      }
      if (lost.length)
        fail(
          "referenced",
          tk("core-commands-apply.apply-command.fail.5e5e6432d761"),
          lost,
        );
      if (translations) next = { ...next, translations };
    }
    // DV2: lydversjoner uten replikk stoppes; klippets speilfelt settes fra aktiv versjon – ett sted
    if (next.audioClips !== state.audioClips || next.dialogueVersions !== state.dialogueVersions) {
      const orphans = orphanDialogueVersions(next);
      if (orphans.length)
        fail(
          "referenced",
          tk("core-commands-apply.apply-command.fail.b3b487fb3399"),
          orphans,
        );
      const m = mirrorDialogueClips(state, next);
      next = m.state;
      if (m.touched.length) affected = [...new Set([...affected, ...m.touched])];
    }
    const violations = checkInvariants(next);
    if (violations.length > 0) {
      return {
        ok: false,
        error: {
          code: "invariant_violation",
          message: tk("core-commands-apply.message.message.5c925420dd7c"),
          details: violations.map((v) => `${v.invariant}: ${v.message}`),
        },
      };
    }
    return { ok: true, state: next, inverse, affected };
  } catch (e) {
    if (e instanceof CommandFailure) {
      return {
        ok: false,
        error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) },
      };
    }
    throw e;
  }
}

// ---------- Story Lab (SL1) ----------

/** Ressursen som får profil, stadium eller kunnskap: må finnes, ikke være fjernet, og være karakter eller dyr. */
function storyAsset(s: ProjectState, assetId: string) {
  const a = need(s.assets[assetId], tk("core-commands-apply.a.need.2f43276b4fc5"));
  if (a.removed) fail("invalid", tk("core-commands-apply.story-asset.fail.93010b6ee6ee"));
  if (!canHaveStoryProfile(a.kind))
    fail(
      "invalid",
      tk("core-commands-apply.story-asset.fail.afda9e7789a5"),
    );
  return a;
}

function assertOneStagePerScene(s: ProjectState, assetId: string, sceneId: string, selfId: string) {
  if (
    Object.values(s.storyProfileStages).some(
      (g) => g.id !== selfId && !g.removed && g.assetId === assetId && g.fromSceneId === sceneId,
    )
  )
    fail(
      "invalid",
      tk("core-commands-apply.assert-one-stage-per-scene.fail.c5365c9fe01f"),
    );
}

function factFieldsOf(f: import("../model").StoryFact): StoryFactFields {
  return { text: f.text, kind: f.kind, atSceneId: f.atSceneId, knownBy: f.knownBy };
}

function storyFactFieldsOf(s: ProjectState, f: StoryFactFields): StoryFactFields {
  const e = factError(f);
  if (e) fail("invalid", e);
  if (f.atSceneId !== null) need(s.scenes[f.atSceneId], tk("core-commands-apply.story-fact-fields-of.need.07f15bf524aa"));
  for (const k of f.knownBy) {
    storyAsset(s, k.assetId);
    if (k.fromSceneId !== null) need(s.scenes[k.fromSceneId], tk("core-commands-apply.story-fact-fields-of.need.07f15bf524aa.2"));
  }
  return {
    text: f.text.trim(),
    kind: f.kind,
    atSceneId: f.atSceneId,
    knownBy: f.knownBy.map((k) => ({ assetId: k.assetId, fromSceneId: k.fromSceneId })),
  };
}

/** Viser Story Lab til ressursen (også fjernede rader, de finnes i databasen)? */
function storyLabUsesAsset(s: ProjectState, id: string): boolean {
  return (
    Object.values(s.storyProfiles).some((p) => p.assetId === id) ||
    Object.values(s.storyProfileStages).some((g) => g.assetId === id) ||
    Object.values(s.storyFacts).some((f) => f.knownBy.some((k) => k.assetId === id)) ||
    Object.values(s.canvasNodes).some((n) => n.assetId === id)
  );
}

/** Viser Story Lab til scenen? */
function storyLabUsesScene(s: ProjectState, id: string): boolean {
  return (
    Object.values(s.storyProfileStages).some((g) => g.fromSceneId === id) ||
    Object.values(s.storyFacts).some(
      (f) => f.atSceneId === id || f.knownBy.some((k) => k.fromSceneId === id),
    ) ||
    Object.values(s.canvasNodes).some((n) => n.sceneId === id)
  );
}

// ---------- Skrivecanvaset (SL7) ----------
function canvasNodeFieldsOf(
  f: import("../model").CanvasNodeFields,
): import("../model").CanvasNodeFields {
  const e = canvasNodeError(f);
  if (e) fail("invalid", e);
  return {
    kind: f.kind,
    title: f.title,
    body: f.body,
    x: f.x,
    y: f.y,
    w: f.w,
    h: f.h,
    color: f.color,
    groupId: f.groupId,
    assetId: f.assetId,
    sceneId: f.sceneId,
  };
}

/** Koblingene fra en node må finnes: gruppen er en gruppenode, ressursen og scenen finnes. */
function canvasLinksOf(s: ProjectState, n: import("../model").CanvasNode): void {
  if (n.groupId !== null) {
    if (n.groupId === n.id)
      fail("invalid", tk("core-commands-apply.canvas-links-of.fail.10a17eaa0961"));
    const g = need(s.canvasNodes[n.groupId], tk("core-commands-apply.g.need.b5262a58956d"));
    if (g.kind !== "group")
      fail("invalid", tk("core-commands-apply.canvas-links-of.fail.ec04e022d162"));
  }
  if (n.assetId !== null) need(s.assets[n.assetId], tk("core-commands-apply.canvas-links-of.need.605b620bbbae"));
  if (n.sceneId !== null) need(s.scenes[n.sceneId], tk("core-commands-apply.canvas-links-of.need.22648d16076f"));
}

function canvasEdgeFieldsOf(
  s: ProjectState,
  f: import("../model").CanvasEdgeFields,
  allowRemoved = false,
): import("../model").CanvasEdgeFields {
  const e = canvasEdgeError(f);
  if (e) fail("invalid", e);
  const a = need(s.canvasNodes[f.fromNodeId], tk("core-commands-apply.a.need.4619c75558af"));
  const b = need(s.canvasNodes[f.toNodeId], tk("core-commands-apply.b.need.39d7882f196d"));
  if (!allowRemoved && (a.removed || b.removed))
    fail("invalid", tk("core-commands-apply.canvas-edge-fields-of.fail.8e35930ceda8"));
  return { fromNodeId: f.fromNodeId, toNodeId: f.toNodeId, label: f.label, kind: f.kind };
}
