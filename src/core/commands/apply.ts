import { assetVoiceError } from "../dialogue/voice";
import { languageTagError } from "../dialogue/languages";
import { lineInfo } from "../audio/takes";
import { DEFAULT_COMPOSITION } from "../composition/fields";
import { applyRigCommand } from "../animation/rig-commands";
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
import { L } from "../i18n";
import { templateError, type TemplateValues } from "../typography/template";
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
import { blocksOfVariant } from "../views";
import { normalizeDurationAssumptions, sameDurationAssumptions } from "../screenplay/duration";
import { MAX_PROMPT_CHARS } from "../generation/prompt";
import type {
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
    fail("not_found", L(`${what} finnes ikke`, `${what} was not found`));
  return value;
}

function assertNewId(s: ProjectState, id: string) {
  if (!isUuid(id)) fail("invalid", L(`Ugyldig ID ${id}`, `Invalid ID ${id}`));
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
    s.lipsyncResults, s.animationPatterns,
    s.dialogueVersions,
    s.templateInstances ?? {},
  ];
  if (all.some((c) => c[id] !== undefined))
    fail("duplicate_id", L(`ID ${id} er allerede i bruk`, `ID ${id} is already in use`));
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
    fail("invalid", L("Ukjent type fortellingstid", "Unknown story time type"));
  if (
    typeof st!.offset !== "number" ||
    !Number.isFinite(st!.offset) ||
    Math.abs(st!.offset) > 100_000
  )
    fail("invalid", L("Ugyldig forskyvning", "Invalid offset"));
  if (st!.kind === "linear" && st!.anchorSceneId !== null)
    fail("invalid", L("Lineære scener har ikke anker", "Linear scenes have no anchor"));
  if (st!.anchorSceneId !== null) {
    if (!s.scenes[st!.anchorSceneId])
      fail("not_found", L("Ankerscenen finnes ikke", "The anchor scene does not exist"));
    if (st!.anchorSceneId === sceneId)
      fail(
        "invalid",
        L("En scene kan ikke ankres til seg selv", "A scene cannot be anchored to itself"),
      );
    // Ingen sykliske ankre (fortellingstiden må kunne beregnes, INV-09)
    let cur: string | null = st!.anchorSceneId;
    const seen = new Set<string>();
    while (cur !== null && !seen.has(cur)) {
      if (cur === sceneId)
        fail(
          "invalid",
          L(
            "Ankeret ville gitt en sirkel i fortellingstiden",
            "The anchor would create a loop in story time",
          ),
        );
      seen.add(cur);
      const anc: ProjectState["scenes"][string] | undefined = s.scenes[cur];
      cur = anc && anc.storyTime.kind !== "linear" ? anc.storyTime.anchorSceneId : null;
    }
  }
}

function plannedOrFail(ms: unknown): number {
  if (typeof ms !== "number" || !Number.isInteger(ms) || ms < MIN_PLANNED_MS || ms > MAX_PLANNED_MS)
    fail("invalid", L("Ugyldig planlagt lengde", "Invalid planned length"));
  return ms as number;
}
/** Maks filstørrelse for et bilde: 2 GB (Lovable Clouds standard per fil, DEC-0032). */
export const ASSET_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Kontrollerer og rydder feltene (trimmer, fjerner duplikater). Samme regler i klient og server. */
/** En ID i det globale biblioteket (GP2): bare en UUID (kobling, ingen fremmednøkkel). */
function globalRef(id: unknown): string {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    fail("invalid", L("Ugyldig kobling til det globale biblioteket", "Invalid link to the global library"));
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
    fail("invalid", L("Ufullstendige ressursfelter", "Incomplete asset fields"));
  // «template» (MTS MT4) står ikke i ASSET_KINDS, så den ikke vises i typevalgene for vanlige ressurser
  if (!(ASSET_KINDS as readonly string[]).includes(f.kind) && f.kind !== "template")
    fail("invalid", L("Ukjent ressurstype", "Unknown asset type"));
  const name = f.name.trim();
  if (!name || name.length > 200)
    fail(
      "invalid",
      L(
        "Ressursen må ha et navn (maks 200 tegn)",
        "The asset must have a name (max 200 characters)",
      ),
    );
  if (f.description.length > 5000)
    fail("invalid", L("Beskrivelsen er for lang", "The description is too long"));
  if (f.category.trim().length > 100)
    fail("invalid", L("Kategorien er for lang", "The category is too long"));
  if (f.names.length > 50)
    fail("invalid", L("For mange alternative navn", "Too many alternative names"));
  if (f.tags.length > 30) fail("invalid", L("For mange stikkord", "Too many keywords"));
  const seenNames = new Set([name.toLocaleLowerCase("nb")]);
  const names = [];
  for (const n of f.names) {
    const t = n.name.trim();
    if (!t) continue;
    if (t.length > 200)
      fail("invalid", L("Et alternativt navn er for langt", "An alternative name is too long"));
    if (!(ASSET_NAME_KINDS as readonly string[]).includes(n.kind))
      fail("invalid", L("Ukjent navnetype", "Unknown name type"));
    const key = t.toLocaleLowerCase("nb");
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    const language = n.language?.trim() || null;
    if (language !== null && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(language))
      fail("invalid", L("Ugyldig språkkode", "Invalid language code"));
    names.push({ name: t, kind: n.kind, language });
  }
  const tags: string[] = [];
  for (const t of f.tags) {
    const x = t.trim();
    if (!x) continue;
    if (x.length > 50) fail("invalid", L("Et stikkord er for langt", "A keyword is too long"));
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
    fail("invalid", L("Ufullstendige variantfelter", "Incomplete variant fields"));
  const name = f.name.trim();
  if (!name || name.length > 200)
    fail(
      "invalid",
      L(
        "Varianten må ha et navn (maks 200 tegn)",
        "The variant must have a name (max 200 characters)",
      ),
    );
  if (!(VISUAL_STYLES as readonly string[]).includes(f.style))
    fail("invalid", L("Ukjent stil", "Unknown style"));
  if (f.appearance.trim().length > 500)
    fail(
      "invalid",
      L("Utseendebeskrivelsen er for lang", "The appearance description is too long"),
    );
  return { name, style: f.style, appearance: f.appearance.trim() };
}

// ---------- Notater ----------

function normalizeAnnotation(s: ProjectState, n: NewAnnotation, now: string): Annotation {
  if (n.resolved !== undefined && typeof n.resolved !== "boolean")
    fail("invalid", L("Ugyldig notatstatus", "Invalid note status"));
  // Forsøksvis manusredigering (AS3, C2): bare på tekst, med foreslått tekst
  if (n.kind !== undefined) {
    if (n.kind !== "trial_edit")
      fail("invalid", L("Ukjent notattype", "Unknown note type"));
    if (n.blockId === null)
      fail(
        "invalid",
        L(
          "En forsøksvis manusredigering må høre til en manuslinje",
          "A trial script edit must belong to a script line",
        ),
      );
    if (typeof n.suggestedText !== "string" || n.suggestedText.length > 10_000)
      fail("invalid", L("Ugyldig foreslått tekst", "Invalid suggested text"));
  } else if (n.suggestedText !== undefined)
    fail("invalid", L("Foreslått tekst uten forsøksvis redigering", "Suggested text without a trial edit"));
  const text = n.text.trim();
  if (!text || text.length > 10_000)
    fail(
      "invalid",
      L(
        "Notatet må ha tekst (maks 10 000 tegn)",
        "The note must have text (max 10,000 characters)",
      ),
    );
  const authorName = n.authorName.trim().slice(0, 100);
  const stampAt = n.stampAt ?? now;
  if (typeof stampAt !== "string" || Number.isNaN(Date.parse(stampAt)))
    fail("invalid", L("Ugyldig tidspunkt for notatet", "Invalid time for the note"));
  if (typeof n.quote !== "string" || n.quote.length > 5000)
    fail("invalid", L("Ugyldig sitat", "Invalid quote"));
  if (n.blockId !== null) {
    const b = need(s.blocks[n.blockId], L("Blokken", "The block"));
    if (b.removed) fail("invalid", L("Blokken er fjernet", "The block has been removed"));
    if (n.variantId !== null)
      fail(
        "invalid",
        L("Et notat på tekst har ikke scene i tillegg", "A note on text cannot also have a scene"),
      );
    if (n.quote === "") {
      // Notat på hele elementet: ingen tekstområde, følger hele teksten også etter endringer
      if (n.start !== 0 || n.end !== 0)
        fail("invalid", L("Ugyldig tekstområde for notatet", "Invalid text range for the note"));
    } else {
      if (!Number.isInteger(n.start) || !Number.isInteger(n.end) || n.start < 0 || n.end <= n.start)
        fail("invalid", L("Ugyldig tekstområde for notatet", "Invalid text range for the note"));
      if (b.text.slice(n.start, n.end) !== n.quote) {
        // Teksten er endret siden (f.eks. gjør om etter angre): finn det markerte nærmest samme sted
        let best = -1;
        for (let i = b.text.indexOf(n.quote); i >= 0; i = b.text.indexOf(n.quote, i + 1))
          if (best < 0 || Math.abs(i - n.start) < Math.abs(best - n.start)) best = i;
        if (best < 0)
          fail(
            "invalid",
            L(
              "Den markerte teksten finnes ikke i manuset",
              "The selected text does not exist in the script",
            ),
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
        L("Notatet må høre til en scene eller tekst", "The note must belong to a scene or text"),
      );
    need(s.variants[n.variantId], L("Scenen", "The scene"));
    if (n.start !== 0 || n.end !== 0 || n.quote !== "")
      fail(
        "invalid",
        L("En nål på scenen har ikke tekstområde", "A pin on the scene has no text range"),
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
  if (typeof id !== "string" || !isUuid(id)) fail("invalid", L("Ugyldig oppgave", "Invalid task"));
  return id;
}

function assertKey(key: string) {
  if (!isValidOrderKey(key))
    fail("invalid", L(`Ugyldig sorteringsnøkkel ${key}`, `Invalid sort key ${key}`));
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
    s.lipsyncResults, s.animationPatterns,
    s.dialogueVersions,
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
  const variant = need(s.variants[variantId], L("Varianten", "The variant"));
  const production = need(s.productions[productionId], L("Produksjonen", "The production"));
  if (variant.ownerProductionId === null) {
    if (production.kind !== "main") {
      fail(
        "must_fork_variant",
        L(
          "Scenen deles med hovedfilmen. Endringer i denne produksjonen lagres som egen versjon av scenen.",
          "The scene is shared with the main film. Changes in this production are saved as a separate version of the scene.",
        ),
      );
    }
  } else if (variant.ownerProductionId !== productionId) {
    fail(
      "must_fork_variant",
      L(
        "Denne versjonen av scenen tilhører en annen produksjon",
        "This version of the scene belongs to another production",
      ),
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
  if (v.assetId !== null && need(s.assets[v.assetId], L("Ressursen", "The asset")).kind === "sound")
    fail(
      "invalid",
      L("En lydfil kan ikke vises som lag", "An audio file cannot be shown as a layer"),
    );
  if (v.assetVariantId !== null) {
    const va = need(
      s.assetVariants[v.assetVariantId],
      L("Varianten av ressursen", "The asset variant"),
    );
    if (va.assetId !== v.assetId)
      fail(
        "invalid",
        L("Varianten hører til en annen ressurs", "The variant belongs to another asset"),
      );
  }
  if (v.versionId !== null) {
    const ve = need(s.assetVersions[v.versionId], L("Bildeversjonen", "The image version"));
    if (ve.variantId !== v.assetVariantId)
      fail(
        "invalid",
        L("Versjonen hører til en annen variant", "The version belongs to another variant"),
      );
  }
  // Bildeskifter: samme kontroll som lagets eget bilde (uendrede skifter kontrolleres ikke på nytt)
  const old = new Set((prev?.swaps ?? []).map((w) => JSON.stringify(w)));
  for (const w of v.swaps) {
    if (old.has(JSON.stringify(w))) continue;
    if (
      need(s.assets[w.assetId], L("Bildet i bildeskiftet", "The image in the image swap")).kind ===
      "sound"
    )
      fail(
        "invalid",
        L("En lydfil kan ikke vises som lag", "An audio file cannot be shown as a layer"),
      );
    if (w.assetVariantId !== null) {
      const va = need(
        s.assetVariants[w.assetVariantId],
        L("Varianten av ressursen", "The asset variant"),
      );
      if (va.assetId !== w.assetId)
        fail(
          "invalid",
          L("Varianten hører til en annen ressurs", "The variant belongs to another asset"),
        );
    }
    if (w.versionId !== null) {
      const ve = need(s.assetVersions[w.versionId], L("Bildeversjonen", "The image version"));
      if (ve.variantId !== w.assetVariantId)
        fail(
          "invalid",
          L("Versjonen hører til en annen variant", "The version belongs to another variant"),
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
      L("Varianten for språket", "The variant for the language"),
    );
    if (va.assetId !== v.assetId)
      fail(
        "invalid",
        L(
          "Bildet for et språk må være en variant av samme ressurs som laget",
          "The image for a language must be a variant of the same asset as the layer",
        ),
      );
    if (li.versionId !== null) {
      const ve = need(
        s.assetVersions[li.versionId],
        L("Bildeversjonen for språket", "The image version for the language"),
      );
      if (ve.variantId !== li.assetVariantId)
        fail(
          "invalid",
          L("Versjonen hører til en annen variant", "The version belongs to another variant"),
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
        L("Et lag kan ikke være maske for seg selv", "A layer cannot be a mask for itself"),
      );
    const target = after.layers[m.layerId];
    if (!target || target.compositionId !== l.compositionId)
      fail(
        "invalid",
        L(
          "Laget som skal brukes som maske, finnes ikke i denne 2D-scenen",
          "The layer to be used as a mask does not exist in this 2D scene",
        ),
      );
    if (target.kind === "group" || target.kind === "page")
      fail(
        "invalid",
        L("En gruppe eller side kan ikke brukes som maske", "A group or page cannot be used as a mask"),
      );
    const seen = new Set<string>([l.id]);
    let cur: CompositionLayer | undefined = target;
    while (cur && cur.mask?.kind === "layer") {
      if (seen.has(cur.mask.layerId))
        fail(
          "invalid",
          L(
            "Maskene går i ring (lagene maskerer hverandre)",
            "The masks form a loop (the layers mask each other)",
          ),
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
        L("Gruppen finnes ikke i denne 2D-scenen", "The group does not exist in this 2D scene"),
      );
    if (g.removed) fail("invalid", L("Gruppen er slettet", "The group has been deleted"));
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
    fail("invalid", L("Ugyldig del", "Invalid part"));
  if (p.source !== "take" && p.source !== "composition")
    fail("invalid", L("Ugyldig kilde for delen", "Invalid source for the part"));
  if ((p.source === "take") !== (p.takeId !== null && p.takeId !== undefined))
    fail(
      "invalid",
      L(
        "Delen må ha versjon bare når kilden er film",
        "The part may only have a version when the source is film",
      ),
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
      L(
        "Inn- og utpunkt må være hele millisekunder, og ut må være etter inn",
        "In and out points must be whole milliseconds, and out must be after in",
      ),
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
      L(
        `Overgangen må være 0–${MAX_PART_TRANSITION_MS} ms`,
        `The transition must be 0–${MAX_PART_TRANSITION_MS} ms`,
      ),
    );
  if (ms > partMs)
    fail(
      "invalid",
      L(
        "Overgangen kan ikke være lengre enn delen",
        "The transition cannot be longer than the part",
      ),
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
    fail("invalid", L("Ugyldig kontinuitetshendelse", "Invalid continuity event"));
  const a = need(s.assets[f.assetId], L("Ressursen", "The asset"));
  if (a.kind === "sound" || a.kind === "location" || a.kind === "environment")
    fail(
      "invalid",
      L("Denne typen ressurs har ikke kontinuitet", "This type of asset has no continuity"),
    );
  if (!(CONTINUITY_KINDS as readonly string[]).includes(f.kind))
    fail("invalid", L("Ukjent type kontinuitetshendelse", "Unknown continuity event type"));
  if (f.duration !== "permanent" && f.duration !== "temporary" && f.duration !== "scene")
    fail("invalid", L("Ukjent varighet", "Unknown duration"));
  if (f.status !== "approved" && f.status !== "dismissed")
    fail("invalid", L("Ugyldig status", "Invalid status"));
  if (typeof f.description !== "string" || f.description.length > CONTINUITY_DESCRIPTION_MAX)
    fail("invalid", L("Beskrivelsen er for lang", "The description is too long"));
  const variant = (id: AssetVariantId | null, what: string) => {
    if (id === null || id === undefined) return null;
    const v = need(s.assetVariants[id], what);
    if (v.assetId !== a.id)
      fail(
        "invalid",
        L(`${what} hører ikke til ressursen`, `${what} does not belong to the asset`),
      );
    return v.id;
  };
  let scene = need(s.scenes[f.sceneId], L("Scenen", "The scene"));
  let blockId: BlockId | null = null;
  if (f.blockId !== null && f.blockId !== undefined) {
    const b = need(s.blocks[f.blockId], L("Manusblokken", "The script block"));
    const lineScene = s.variants[b.variantId]?.sceneId;
    if (!lineScene)
      fail(
        "invalid",
        L("Manuslinjen hører ikke til en scene", "The script line does not belong to a scene"),
      );
    // Scenen følger linjen (den kan ha flyttet ved deling eller sammenslåing siden hendelsen ble laget)
    scene = need(s.scenes[lineScene], L("Scenen", "The scene"));
    blockId = b.id;
  }
  let untilSceneId: SceneId | null = null;
  if (f.duration === "temporary") {
    if (f.untilSceneId === null || f.untilSceneId === undefined)
      fail(
        "invalid",
        L("Velg scenen der endringen er over", "Choose the scene where the change ends"),
      );
    untilSceneId = need(
      s.scenes[f.untilSceneId],
      L("Scenen der endringen er over", "The scene where the change ends"),
    ).id;
    if (untilSceneId === scene.id)
      fail(
        "invalid",
        L("Endringen må vare til en senere scene", "The change must last until a later scene"),
      );
  }
  // Lokal for en avledet produksjon (DEC-0060); utelatt ved endring = uendret
  const productionId = f.productionId === undefined ? (prev?.productionId ?? null) : f.productionId;
  if (productionId !== null) {
    const p = need(s.productions[productionId], L("Produksjonen", "The production"));
    if (p.kind === "main")
      fail(
        "invalid",
        L("Hovedfilmens hendelser er ikke lokale", "The main film's events are not local"),
      );
    if (prev && !prev.productionId)
      fail(
        "invalid",
        L(
          "En hendelse fra hovedfilmen kan ikke gjøres lokal. Slå den av i spinoffen i stedet.",
          "An event from the main film cannot be made local. Turn it off in the spin-off instead.",
        ),
      );
  } else if (prev?.productionId)
    fail(
      "invalid",
      L(
        "En lokal hendelse kan ikke flyttes til hovedfilmen",
        "A local event cannot be moved to the main film",
      ),
    );
  return {
    ...(productionId !== null ? { productionId: productionId as never } : {}),
    assetId: a.id,
    kind: f.kind,
    description: f.description.trim(),
    fromVariantId: variant(f.fromVariantId, L("Utseendet før", "The appearance before")),
    toVariantId: variant(f.toVariantId, L("Utseendet etter", "The appearance after")),
    duration: f.duration,
    sceneId: scene.id,
    blockId,
    untilSceneId,
    status: f.status,
  };
}

/** Lengste oversatte tekst (som manusblokker). */
const TRANSLATION_MAX = 20000;

function translationFieldsOf(
  s: ProjectState,
  f: TranslationFields,
): Omit<Translation, "id" | "revision" | "removed"> {
  if (!f || typeof f !== "object")
    fail("invalid", L("Ugyldig oversettelse", "Invalid translation"));
  if (typeof f.language !== "string" || !/^[a-z]{2}(-[A-Z]{2})?$/.test(f.language))
    fail("invalid", L("Ugyldig språkkode", "Invalid language code"));
  if (f.language === "nb" || f.language === "no")
    fail(
      "invalid",
      L(
        "Norsk er hovedmanuset og oversettes ikke",
        "Norwegian is the main script and is not translated",
      ),
    );
  if (typeof f.text !== "string" || f.text.length > TRANSLATION_MAX)
    fail("invalid", L("Oversettelsen er for lang", "The translation is too long"));
  if (!f.text.trim())
    fail(
      "invalid",
      L(
        "Oversettelsen er tom. Fjern den i stedet.",
        "The translation is empty. Remove it instead.",
      ),
    );
  if (f.status !== "approved" && f.status !== "uncertain")
    fail("invalid", L("Ugyldig status", "Invalid status"));
  const hasBlock = f.blockId !== null && f.blockId !== undefined;
  const hasVariant = f.variantId !== null && f.variantId !== undefined;
  if (hasBlock === hasVariant)
    fail(
      "invalid",
      L(
        "En oversettelse gjelder én linje eller ett scenehode",
        "A translation applies to one line or one scene heading",
      ),
    );
  if (!Number.isInteger(f.basedOnRev) || f.basedOnRev < 0)
    fail("invalid", L("Ugyldig revisjon", "Invalid revision"));
  if (hasBlock) {
    const b = need(s.blocks[f.blockId!], L("Manusblokken", "The script block"));
    if (f.basedOnRev > b.currentRev)
      fail("invalid", L("Revisjonen finnes ikke", "The revision does not exist"));
    return {
      blockId: b.id,
      variantId: null,
      language: f.language,
      text: f.text,
      basedOnRev: f.basedOnRev,
      status: f.status,
    };
  }
  const v = need(s.variants[f.variantId!], L("Scenen", "The scene"));
  // Scenehodet: revisjonen av scenevarianten da det ble oversatt (endret hode → gjennomgå)
  if (f.basedOnRev > v.revision)
    fail("invalid", L("Revisjonen finnes ikke", "The revision does not exist"));
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
  if (!f || typeof f !== "object") fail("invalid", L("Ugyldig relasjon", "Invalid relation"));
  const a = need(s.assets[f.fromAssetId], L("Ressursen", "The asset"));
  const b = need(s.assets[f.toAssetId], L("Ressursen", "The asset"));
  if (a.id === b.id)
    fail(
      "invalid",
      L(
        "En relasjon må gå mellom to forskjellige ressurser",
        "A relation must be between two different assets",
      ),
    );
  if (a.kind === "sound" || b.kind === "sound")
    fail("invalid", L("Lydfiler kan ikke ha relasjoner", "Audio files cannot have relations"));
  if (!(RELATION_KINDS as readonly string[]).includes(f.kind))
    fail("invalid", L("Ukjent relasjonstype", "Unknown relation type"));
  if (typeof f.label !== "string" || f.label.length > 120)
    fail("invalid", L("Navnet er for langt", "The name is too long"));
  if (typeof f.description !== "string" || f.description.length > 2000)
    fail("invalid", L("Beskrivelsen er for lang", "The description is too long"));
  if (f.status !== "approved" && f.status !== "dismissed")
    fail("invalid", L("Ugyldig status", "Invalid status"));
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
    fail("invalid", L("Ugyldig stilprofil", "Invalid style profile"));
  if (typeof f.name !== "string" || !f.name.trim() || f.name.length > 120)
    fail(
      "invalid",
      L(
        "Stilprofilen må ha et navn (maks 120 tegn)",
        "The style profile must have a name (max 120 characters)",
      ),
    );
  if (typeof f.isDefault !== "boolean")
    fail("invalid", L("Ugyldig stilprofil", "Invalid style profile"));
  if (f.isDefault && otherDefault(s, id))
    fail(
      "invalid",
      L(
        "Prosjektet har allerede en standard stilprofil",
        "The project already has a default style profile",
      ),
    );
  const err = styleGuideError(f.guide);
  if (err) fail("invalid", err);
  const old = new Set(prev?.guide.referenceVersionIds ?? []);
  for (const v of f.guide.referenceVersionIds)
    if (
      !old.has(v) &&
      !need(s.assetVersions[v], L("Forbildebildet", "The reference image")).mimeType.startsWith(
        "image/",
      )
    )
      fail("invalid", L("Forbildebildet må være et bilde", "The reference image must be an image"));
  return { name: f.name.trim(), isDefault: f.isDefault, guide: f.guide };
}

/** Samme par og type kan bare finnes én gang (avvist eller godkjent) – ingen doble linjer i kartet. */
function assertUniqueRelation(all: Record<string, AssetRelation>, id: string): void {
  const r = all[id];
  if (!r || r.removed) return;
  const key = (x: AssetRelation) => `${[x.fromAssetId, x.toAssetId].sort().join("|")}|${x.kind}`;
  const k = key(r);
  if (Object.values(all).some((x) => x.id !== id && !x.removed && key(x) === k))
    fail("invalid", L("Relasjonen finnes allerede", "The relation already exists"));
}

/** Plakatens felter. Ressurser kontrolleres bare når de er nye i plakaten (som bildeskifter). */
function posterFieldsOf(
  s: ProjectState,
  f: PosterFields,
  prev?: Poster,
): Omit<Poster, "id" | "revision" | "removed"> {
  if (!f || typeof f !== "object") fail("invalid", L("Ugyldig plakat", "Invalid poster"));
  const p = need(s.productions[f.productionId], L("Produksjonen", "The production"));
  if (prev && prev.productionId !== p.id)
    fail(
      "invalid",
      L("Plakaten tilhører en annen produksjon", "The poster belongs to another production"),
    );
  if (typeof f.name !== "string" || !f.name.trim() || f.name.length > 200)
    fail(
      "invalid",
      L(
        "Plakaten må ha et navn (maks 200 tegn)",
        "The poster must have a name (max 200 characters)",
      ),
    );
  if (f.kind !== "pitch" && f.kind !== "character_map")
    fail("invalid", L("Ukjent plakattype", "Unknown poster type"));
  if (f.language !== "nb" && f.language !== "en")
    fail("invalid", L("Ukjent språk", "Unknown language"));
  if (
    !Number.isFinite(f.widthMm) ||
    !Number.isFinite(f.heightMm) ||
    f.widthMm < 50 ||
    f.heightMm < 50 ||
    f.widthMm > 3000 ||
    f.heightMm > 3000
  )
    fail("invalid", L("Ugyldig format (5–300 cm)", "Invalid format (5–300 cm)"));
  const err = posterDocumentError(f.document);
  if (err) fail("invalid", err);
  if (JSON.stringify(f.document).length > 1_500_000)
    fail("invalid", L("Plakaten er for stor", "The poster is too large"));
  const refs = posterAssetRefs(f.document);
  const old = prev ? posterAssetRefs(prev.document) : null;
  for (const id of refs.assets)
    if (!old?.assets.has(id)) {
      const a = need(s.assets[id], L("Ressursen på plakaten", "The asset on the poster"));
      if (a.kind === "sound")
        fail(
          "invalid",
          L("En lydfil kan ikke vises på plakaten", "An audio file cannot be shown on the poster"),
        );
    }
  for (const id of refs.variants)
    if (!old?.variants.has(id))
      need(s.assetVariants[id], L("Varianten på plakaten", "The variant on the poster"));
  for (const id of refs.versions)
    if (!old?.versions.has(id))
      need(s.assetVersions[id], L("Bildet på plakaten", "The image on the poster"));
  for (const id of refs.relations)
    if (!old?.relations.has(id))
      need(s.assetRelations[id], L("Relasjonen på plakaten", "The relation on the poster"));
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
  if (!f || typeof f !== "object") fail("invalid", L("Ugyldig tidskobling", "Invalid time link"));
  const o = need(s.occurrences[f.occurrenceId], L("Forekomsten", "The occurrence"));
  const b = need(s.blocks[f.blockId], L("Manusblokken", "The script block"));
  if (b.variantId !== o.variantId)
    fail("invalid", L("Blokken hører ikke til scenen", "The block does not belong to the scene"));
  if (!Number.isInteger(f.startMs) || f.startMs < 0 || f.startMs > AUDIO_MAX_MS)
    fail("invalid", L("Ugyldig tid for tidskoblingen", "Invalid time for the time link"));
  if (
    f.endMs !== null &&
    (!Number.isInteger(f.endMs) || f.endMs <= f.startMs || f.endMs > AUDIO_MAX_MS)
  )
    fail(
      "invalid",
      L(
        "Slutten på tidskoblingen må være etter starten",
        "The end of the time link must be after the start",
      ),
    );
  let layerId: LayerId | null = null;
  if (f.layerId !== undefined && f.layerId !== null) {
    const l = need(s.layers[f.layerId], L("Laget", "The layer"));
    const comp = compositionOfVariant(s, o.variantId);
    if (!comp || l.compositionId !== comp.id)
      fail(
        "invalid",
        L(
          "Laget hører ikke til scenens 2D-scene",
          "The layer does not belong to the scene's 2D scene",
        ),
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
      L("Ugyldig filinformasjon for filmen", "Invalid file information for the film"),
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
      L("Ugyldig filinformasjon for filmen", "Invalid file information for the film"),
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
    fail("invalid", L("Ugyldig grunnlag", "Invalid basis"));
  const av = p.assetVersions;
  if (av === undefined) return { blockRevisions: p.blockRevisions };
  if (
    !av ||
    typeof av !== "object" ||
    Object.entries(av).some(([k, v]) => !isUuid(k) || typeof v !== "string" || !isUuid(v))
  )
    fail("invalid", L("Ugyldig grunnlag", "Invalid basis"));
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
  if (!t || typeof t !== "object") fail("invalid", L("Ugyldig overgang", "Invalid transition"));
  const x = t as Record<string, unknown>;
  const kind = x["kind"];
  if (!(TRANSITION_KINDS as readonly unknown[]).includes(kind))
    fail("invalid", L("Ugyldig overgang", "Invalid transition"));
  if (kind === "cut") return { kind: "cut", frames: 0 };
  const frames = x["frames"];
  if (
    !Number.isInteger(frames) ||
    (frames as number) < 1 ||
    (frames as number) > MAX_TRANSITION_FRAMES
  )
    fail(
      "invalid",
      L(
        `Overgangen må vare mellom 1 og ${MAX_TRANSITION_FRAMES} bilder`,
        `The transition must last between 1 and ${MAX_TRANSITION_FRAMES} frames`,
      ),
    );
  if (x["overlap"] !== undefined && typeof x["overlap"] !== "boolean")
    fail("invalid", L("Ugyldig overgang", "Invalid transition"));
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
  if (!f || typeof f !== "object") fail("invalid", L("Ugyldig lydklipp", "Invalid audio clip"));
  if (!(AUDIO_KINDS as readonly string[]).includes(f.kind))
    fail("invalid", L("Ukjent lydtype", "Unknown audio type"));
  if (typeof f.name !== "string" || f.name.length > 200)
    fail("invalid", L("Navnet er for langt", "The name is too long"));
  need(s.occurrences[f.occurrenceId], L("Scenen", "The scene"));
  const asset = need(s.assets[f.assetId], L("Lydfilen", "The audio file"));
  if (asset.kind !== "sound")
    fail("invalid", L("Ressursen er ikke en lydfil", "The asset is not an audio file"));
  if (f.assetVariantId !== null) {
    const va = need(
      s.assetVariants[f.assetVariantId],
      L("Varianten av lydfilen", "The variant of the audio file"),
    );
    if (va.assetId !== f.assetId)
      fail(
        "invalid",
        L("Varianten hører til en annen ressurs", "The variant belongs to another asset"),
      );
  }
  if (f.versionId !== null) {
    const ve = need(s.assetVersions[f.versionId], L("Lydversjonen", "The audio version"));
    if (ve.variantId !== f.assetVariantId)
      fail(
        "invalid",
        L("Versjonen hører til en annen variant", "The version belongs to another variant"),
      );
  }
  if (f.blockId !== null) {
    const b = need(s.blocks[f.blockId], L("Replikken", "The line"));
    const occ = s.occurrences[f.occurrenceId]!;
    if (b.variantId !== occ.variantId)
      fail("invalid", L("Replikken hører til en annen scene", "The line belongs to another scene"));
  }
  const int = (v: number, lo: number, hi: number, what: string) => {
    if (!Number.isInteger(v) || v < lo || v > hi)
      fail("invalid", L(`Ugyldig ${what}`, `Invalid ${what}`));
  };
  int(f.offsetMs, 0, AUDIO_MAX_MS, L("start i scenen", "start in the scene"));
  int(f.sourceInMs, 0, AUDIO_MAX_MS, L("start i lydfilen", "start in the audio file"));
  int(f.lengthMs, 1, AUDIO_MAX_MS, L("lengde", "length"));
  int(f.fadeInMs, 0, 600_000, L("inntoning", "fade in"));
  int(f.fadeOutMs, 0, 600_000, L("uttoning", "fade out"));
  if (typeof f.gainDb !== "number" || !Number.isFinite(f.gainDb) || f.gainDb < -60 || f.gainDb > 12)
    fail(
      "invalid",
      L("Volumet må være mellom −60 og +12 dB", "The volume must be between −60 and +12 dB"),
    );
  if (typeof f.muted !== "boolean") fail("invalid", L("Ugyldig demping", "Invalid mute setting"));
  if (typeof f.continues !== "boolean")
    fail("invalid", L("Ugyldig valg for «løper videre»", "Invalid choice for “continues”"));
  if (!Array.isArray(f.volumeKeys) || f.volumeKeys.length > 500)
    fail("invalid", L("For mange volumpunkter (maks 500)", "Too many volume points (max 500)"));
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
          L(
            "Ugyldig volumpunkt (tid i ms, nivå mellom −60 og +12 dB)",
            "Invalid volume point (time in ms, level between −60 and +12 dB)",
          ),
        );
      return { t: k.t, db: Math.round(k.db * 10) / 10 };
    })
    .sort((a, b) => a.t - b.t);
  for (let i = 1; i < keys.length; i++)
    if (keys[i]!.t === keys[i - 1]!.t)
      fail("invalid", L("To volumpunkter på samme tid", "Two volume points at the same time"));
  // Språk (DEC-0059): språkkode eller «*» (felles); utelatt = standard for lydtypen
  const language = f.language ?? null;
  if (language !== null && language !== "*" && !LANGUAGE_CODE.test(String(language)))
    fail("invalid", L("Ugyldig språk for lyden", "Invalid language for the sound"));
  // Hastighet (DEC-0079): 25–400 %
  const speed = f.speed ?? 1;
  if (typeof speed !== "number" || !Number.isFinite(speed) || speed < 0.25 || speed > 4)
    fail(
      "invalid",
      L("Hastigheten må være mellom 25 og 400 %", "The speed must be between 25 and 400%"),
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
const LANGUAGE_CODE = /^[a-z]{2}(-[A-Z]{2})?$/;

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
  if (!e || typeof e !== "object") fail("invalid", L("Ugyldig redigering", "Invalid edit"));
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
    fail("invalid", L("Lydkomposisjonen finnes ikke", "The audio composition was not found"));
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
  if (!f || typeof f !== "object") fail("invalid", L("Ugyldig lydversjon", "Invalid audio version"));
  if (!DIALOGUE_VERSION_SOURCES.includes(f.source)) fail("invalid", L("Ukjent lydkilde", "Unknown audio source"));
  const file = fileOf(f);
  const asset = s.assets[file.assetId];
  if (!asset || asset.kind !== "sound") fail("invalid", L("Lydfilen finnes ikke", "The audio file was not found"));
  if (file.assetVariantId !== null && s.assetVariants[file.assetVariantId]?.assetId !== file.assetId)
    fail("invalid", L("Lydvarianten finnes ikke", "The audio variant was not found"));
  if (file.assetVersionId !== null && !s.assetVersions[file.assetVersionId])
    fail("invalid", L("Lydopptaket finnes ikke", "The recording was not found"));
  const short = (x: unknown, max: number) => (x === null || x === undefined ? null : typeof x === "string" && x.length <= max ? x : fail("invalid", L("For lang tekst i lydversjonen", "Text in the audio version is too long")));
  if (f.settings === null || typeof f.settings !== "object" || Array.isArray(f.settings) || JSON.stringify(f.settings).length > 8192)
    fail("invalid", L("Ugyldige genereringsinnstillinger", "Invalid generation settings"));
  if (f.scriptRevision !== null && !(Number.isInteger(f.scriptRevision) && f.scriptRevision > 0))
    fail("invalid", L("Ugyldig manusrevisjon", "Invalid script revision"));
  if (f.parentVersionId !== null && s.dialogueVersions[f.parentVersionId]?.clipId !== a.id)
    fail("invalid", L("Foreldreversjonen hører ikke til replikken", "The parent version does not belong to the line"));
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
  if (!v || typeof v !== "object" || Array.isArray(v)) return L("Ugyldig innhold", "Invalid content");
  const entries = Object.entries(v);
  if (entries.length > 100) return L("For mange felt", "Too many fields");
  for (const [k, x] of entries) {
    if (!/^[a-z0-9_-]{1,40}$/.test(k)) return L("Ugyldig felt", "Invalid field");
    if (x && "text" in x) {
      if (typeof x.text !== "string") return L("Ugyldig tekst", "Invalid text");
      const n = [...x.text].length;
      if (n > 2000)
        return L(
          `Teksten i feltet har ${n} tegn. Grensen er 2000 tegn.`,
          `The text in the field has ${n} characters. The limit is 2000 characters.`,
        );
    } else if (x && "assetId" in x) {
      if (!s.assets[x.assetId]) return L("Bildet i feltet finnes ikke", "The image in the field does not exist");
      if (x.assetVariantId !== null && s.assetVariants[x.assetVariantId]?.assetId !== x.assetId)
        return L("Ugyldig variant i feltet", "Invalid variant in the field");
    } else return L("Ugyldig innhold", "Invalid content");
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
    case "SetDialogueLanguage": {
      if (c.language !== null && languageTagError(c.language)) fail("invalid", languageTagError(c.language) ?? "");
      if (c.target === "project") {
        if (c.targetId !== s.project.id) fail("invalid", L("Feil prosjekt", "Wrong project"));
        const project: ProjectState["project"] = { ...s.project, ...(c.language ? { scriptLanguage: c.language } : {}), revision: rev(s.project) };
        if (c.language === null) delete project.scriptLanguage;
        return { state: { ...s, project }, inverse: { ...c, language: s.project.scriptLanguage ?? null }, affected: [s.project.id] };
      }
      const collection = c.target === "variant" ? "variants" : c.target === "block" || c.target === "blockSpeech" ? "blocks" : c.target === "clip" ? "audioClips" : null;
      if (!collection) fail("invalid", L("Ugyldig språkmål", "Invalid language target"));
      const rows = s[collection];
      const row = need(rows[c.targetId], L("Språkmålet", "The language target"));
      if (c.target === "clip" && (row as import("../model").AudioClip).kind !== "dialogue") fail("invalid", L("Bare replikker har talespråk", "Only dialogue lines have speech language"));
      const field = c.target === "clip" || c.target === "blockSpeech" ? "speechLanguage" : "scriptLanguage";
      const previous = (row as unknown as Record<string, unknown>)[field] as string | null | undefined;
      const updated = { ...row, [field]: c.language, revision: rev(row) };
      if (c.language === null) delete (updated as unknown as Record<string, unknown>)[field];
      return { state: { ...s, [collection]: { ...rows, [row.id]: updated } }, inverse: { ...c, language: previous ?? null }, affected: [row.id] };
    }
    case "ApplyGeneratedDialogue": {
      // Stable job-owned version identity is a receipt, even after explicit undo/deactivation.
      if (s.assetVersions[c.versionId] || s.dialogueVersions[c.dialogueVersionId]) return { state: s, inverse: { type: "UndoGeneratedDialogue", steps: [] }, affected: [] };
      const info = lineInfo(s, c.occurrenceId, c.blockId);
      const character = s.assets[c.characterId];
      if (!info || !character || character.removed || !["character", "animal", "other"].includes(character.kind)) fail("invalid", L("Replikken eller karakteren finnes ikke", "The line or character was not found"));
      if (c.metadata.scriptRevision !== s.blocks[c.blockId]?.currentRev) fail("revision_conflict", L("Manuset er endret. Resultatet er bevart, men ikke aktivert.", "The script has changed. The result is preserved but not activated."));
      if (c.metadata.source !== "ai" || !c.media.durationMs || c.media.durationMs <= 0 || languageTagError(c.language)) fail("invalid", L("Ugyldig generert tale", "Invalid generated speech"));
      let cur = s;
      const inverses: Command[] = [];
      const affected = new Set<string>();
      const execute = (command: Command) => { const result = run(cur, { ...env, command }); const mirrored = mirrorDialogueClips(cur, result.state); cur = mirrored.state; inverses.unshift(result.inverse); [...result.affected, ...mirrored.touched].forEach(id => affected.add(id)); };
      if (!Object.values(cur.compositions).some(comp => !comp.removed && comp.variantId === s.occurrences[c.occurrenceId]?.variantId)) execute({ type: "CreateComposition", compositionId: c.compositionId as never, variantId: s.occurrences[c.occurrenceId]?.variantId as never, fields: { ...DEFAULT_COMPOSITION, width: s.project.frameWidth, height: s.project.frameHeight, durationFrames: Math.max(1, Math.ceil((info.startMs + c.media.durationMs) * s.project.fps.num / s.project.fps.den / 1000)) } });
      execute({ type: "CreateAssets", assets: [{ assetId: c.assetId as never, fields: { kind: "sound", name: info.text.slice(0, 200), names: [], description: "", category: "", tags: [] } }] });
      execute({ type: "CreateAssetVariant", assetId: c.assetId as never, variantId: c.variantId as never, fields: { name: L("Generert tale", "Generated speech"), style: "other", appearance: "" } });
      execute({ type: "AddAssetVersion", variantId: c.variantId as never, versionId: c.versionId as never, media: c.media, note: L("Massegenerert replikk", "Batch-generated line") });
      const existing = info.clip;
      const clipId = existing?.id ?? c.clipId;
      if (existing) execute({ type: "AddDialogueVersion", dialogueVersionId: c.dialogueVersionId, clipId: existing.id, activate: true, fields: { assetId: c.assetId, assetVariantId: c.variantId, assetVersionId: c.versionId, sourceInMs: 0, lengthMs: c.media.durationMs, gainDb: 0, fadeInMs: 0, fadeOutMs: 0, volumeKeys: [], speed: 1, compositionId: null, ...c.metadata, parentVersionId: existing.activeVersionId ?? null } });
      else execute({ type: "AddAudioClips", dialogueMeta: c.metadata, clips: [{ clipId: c.clipId as never, fields: { occurrenceId: c.occurrenceId as never, kind: "dialogue", name: info.text.slice(0, 200), assetId: c.assetId as never, assetVariantId: c.variantId as never, versionId: c.versionId as never, blockId: c.blockId as never, offsetMs: info.startMs, sourceInMs: 0, lengthMs: c.media.durationMs, gainDb: 0, fadeInMs: 0, fadeOutMs: 0, muted: false, continues: false, volumeKeys: [] } }] });
      execute({ type: "SetDialogueCharacter", clipIds: [clipId as never], characterAssetId: c.characterId as never });
      const clip = cur.audioClips[clipId];
      if (clip && !existing) cur = { ...cur, audioClips: { ...cur.audioClips, [clipId]: { ...clip, placementEstimated: true } } };
      return { state: oneRevisionPerRow(s, cur), inverse: { type: "UndoGeneratedDialogue", steps: inverses }, affected: [...affected] };
    }
    case "UndoGeneratedDialogue": {
      const allowed = new Set(["UndoCreateComposition", "CreateComposition", "UndoCreateAssets", "CreateAssets", "UndoCreateAssetVariant", "CreateAssetVariant", "UndoAddAssetVersion", "AddAssetVersion", "UndoAddAudioClips", "AddAudioClips", "UndoAddDialogueVersion", "AddDialogueVersion", "SetDialogueCharacter", "RestoreDialogueCharacters"]);
      if (c.steps.length > 20 || c.steps.some(step => !allowed.has(step.type))) fail("invalid", L("Ugyldig angring av generering", "Invalid generation undo"));
      let cur = s; const inverses: Command[] = []; const affected = new Set<string>();
      for (const step of c.steps) { const result = run(cur, { ...env, command: step }); const mirrored = mirrorDialogueClips(cur, result.state); cur = mirrored.state; inverses.unshift(result.inverse); [...result.affected, ...mirrored.touched].forEach(id => affected.add(id)); }
      return { state: oneRevisionPerRow(s, cur), inverse: { type: "UndoGeneratedDialogue", steps: inverses }, affected: [...affected] };
    }
    case "CreateRig": case "SaveRigVersion": case "SetRigAnchors": case "AttachAnimationUse": case "SetAnimationLayerEnabled": case "SetAnimationBehavior": case "AdoptRigVersion": case "UndoAnimationChange": {
      try { return applyRigCommand(s, c); } catch (error) { fail("invalid", error instanceof Error ? error.message : L("Ugyldig animasjonsoppsett", "Invalid animation setup")); }
    }
    case "SaveLipsyncResult": case "SetLipsyncEnabled": case "SetLipsyncOverrides": case "SaveAnimationPattern": case "RemoveAnimationPattern": case "UndoBehaviorChange": {
      try { return applyBehaviorCommand(s, c); } catch (error) { fail("invalid", error instanceof Error ? error.message : L("Ugyldig animasjonsdata", "Invalid animation data")); }
    }
    case "CreateProduction": {
      assertNewId(s, c.productionId);
      if (!c.name.trim())
        fail("invalid", L("Produksjonen må ha et navn", "The production must have a name"));
      if (c.kind === "main" && Object.values(s.productions).some((p) => p.kind === "main")) {
        fail(
          "invalid",
          L(
            "Prosjektet har allerede en hovedproduksjon",
            "The project already has a main production",
          ),
        );
      }
      if (c.parentProductionId !== null)
        need(s.productions[c.parentProductionId], L("Overordnet produksjon", "Parent production"));
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
      need(s.productions[c.productionId], L("Produksjonen", "The production"));
      if (Object.values(s.occurrences).some((o) => o.productionId === c.productionId)) {
        fail(
          "referenced",
          L(
            "Produksjonen inneholder scener og kan ikke angres",
            "The production contains scenes and cannot be undone",
          ),
        );
      }
      if (
        Object.values(s.continuityEvents).some(
          (e) => e.productionId === c.productionId || e.disabledIn?.includes(c.productionId),
        )
      )
        fail(
          "referenced",
          L(
            "Produksjonen har egen kontinuitet og kan ikke angres",
            "The production has its own continuity and cannot be undone",
          ),
        );
      if (Object.values(s.posters).some((p) => p.productionId === c.productionId))
        fail(
          "referenced",
          L(
            "Produksjonen har plakater og kan ikke angres",
            "The production has posters and cannot be undone",
          ),
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
      const p = need(s.productions[c.productionId], L("Produksjonen", "The production"));
      if (typeof c.note !== "string") fail("invalid", L("Ugyldig notat", "Invalid note"));
      const note = c.note.replace(/\r\n?/g, "\n").trim();
      if (note.length > 2000)
        fail(
          "invalid",
          L(
            "Notatet er for langt (høyst 2000 tegn)",
            "The note is too long (at most 2,000 characters)",
          ),
        );
      if ((p.note ?? "") === note) fail("invalid", L("Uendret", "Unchanged"));
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
      const production = need(s.productions[c.productionId], L("Produksjonen", "The production"));
      for (const id of [c.sceneId, c.variantId, c.occurrenceId, ...c.blocks.map((b) => b.blockId)])
        assertNewId(s, id);
      if (new Set(c.blocks.map((b) => b.blockId)).size !== c.blocks.length)
        fail("duplicate_id", L("Blokk-ID-er gjentas", "Block IDs are repeated"));
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
                  fail("invalid", L("Ugyldig scenetype", "Invalid occurrence kind"));
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
      need(s.scenes[c.sceneId], L("Scenen", "The scene"));
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
          L(
            "Scenen er tatt i bruk og kan ikke angres. Deaktiver den i stedet.",
            "The scene is in use and cannot be undone. Deactivate it instead.",
          ),
        );
      }
      const occ = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
      const variant = need(s.variants[c.variantId], L("Varianten", "The variant"));
      if (
        occ.sceneId !== c.sceneId ||
        variant.sceneId !== c.sceneId ||
        occ.variantId !== c.variantId
      ) {
        fail(
          "invalid",
          L(
            "Scene, variant og forekomst hører ikke sammen",
            "Scene, variant and occurrence do not belong together",
          ),
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
            L(
              "Scenen har fått eller mistet tekst etter at den ble laget, og kan ikke angres. Deaktiver den i stedet.",
              "The scene has gained or lost text since it was made, and cannot be undone. Deactivate it instead.",
            ),
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
      const o = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
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
      const o = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
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
      const b = need(s.blocks[c.blockId], L("Manusblokken", "The script block"));
      assertCanEditVariant(s, c.productionId, b.variantId);
      if (b.text === c.text) fail("invalid", L("Teksten er uendret", "The text is unchanged"));
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
          L("To blokker kan ikke ha samme plass", "Two blocks cannot occupy the same position"),
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
      const b = need(s.blocks[c.blockId], L("Manusblokken", "The script block"));
      if (Object.values(s.segments).some((g) => g.startBlockId === b.id || g.endBlockId === b.id)) {
        fail(
          "referenced",
          L("Blokken brukes av et produksjonssegment", "The block is used by a production segment"),
        );
      }
      const { [b.id]: _b, ...blocks } = s.blocks;
      const owner = s.variants[b.variantId]?.ownerProductionId;
      const ctx = owner ?? Object.values(s.productions).find((p) => p.kind === "main")?.id;
      return {
        state: { ...s, blocks, blockRevisions: s.blockRevisions.filter((r) => r.blockId !== b.id) },
        inverse: {
          type: "InsertBlock",
          productionId: need(ctx, L("Produksjon for blokken", "Production for the block")),
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
      const o = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
      // Tilbakeføring (DEC-0060): innholdet kopieres fra en annen variant av scenen (spinoffens versjon)
      const source = need(
        s.variants[c.sourceVariantId ?? o.variantId],
        L("Varianten", "The variant"),
      );
      if (source.sceneId !== o.sceneId)
        fail(
          "invalid",
          L("Varianten tilhører en annen scene", "The variant belongs to another scene"),
        );
      if (source.ownerProductionId === o.productionId)
        fail(
          "invalid",
          L(
            "Varianten eies allerede av produksjonen",
            "The variant is already owned by the production",
          ),
        );
      if (c.sourceVariantId && c.sourceVariantId === o.variantId)
        fail(
          "invalid",
          L(
            "Forekomsten bruker allerede denne varianten",
            "The occurrence already uses this variant",
          ),
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
            L(
              "Scenen er endret i den andre produksjonen i mellomtiden. Lag egen versjon på nytt.",
              "The scene was changed in the other production in the meantime. Make a separate version again.",
            ),
          );
        assertNewId(s, nid);
        blocks[nid] = { ...b, id: nid, revision: 1, variantId: c.newVariantId };
        const old = history.get(b.id) ?? [];
        // Historikken kopieres som nye rader skrevet av den som lager versjonen (teksten er den samme)
        if (old.length) for (const r of old) revisions.push(newRevision(nid, r.rev, r.text));
        else revisions.push(newRevision(nid, b.currentRev, b.text));
      }
      if (new Set(Object.values(c.blockIdMap)).size !== sourceBlocks.length)
        fail("invalid", L("Blokk-ID-kartet er ufullstendig", "The block ID map is incomplete"));
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
            L(
              "Lyd, tidskoblinger eller segmenter er koblet til linjer som ikke finnes i den nye versjonen. Fjern koblingene først.",
              "Audio, time links or segments are linked to lines that do not exist in the new version. Remove the links first.",
            ),
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
          fail("duplicate_id", L("Samme notat-ID to ganger", "The same note ID twice"));
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
      const o = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
      const nv = need(s.variants[c.newVariantId], L("Varianten", "The variant"));
      need(s.variants[c.previousVariantId], L("Opprinnelig variant", "Original variant"));
      if (o.variantId !== nv.id)
        fail(
          "invalid",
          L("Forekomsten bruker ikke denne varianten", "The occurrence does not use this variant"),
        );
      if (Object.values(s.occurrences).some((x) => x.variantId === nv.id && x.id !== o.id))
        fail("referenced", L("Varianten brukes andre steder", "The variant is used elsewhere"));
      const forked = Object.values(s.blocks).filter((b) => b.variantId === nv.id);
      // Innholdet kom fra kilden (ved tilbakeføring spinoffens versjon, ellers den forrige varianten)
      const contentId = c.sourceVariantId ?? c.previousVariantId;
      need(s.variants[contentId], L("Kildevarianten", "The source variant"));
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
          L(
            "Den egne versjonen er endret; angre endringene i den først",
            "The own version has been changed; undo those changes first",
          ),
        );
      if (Object.values(s.compositions).some((x) => x.variantId === nv.id))
        fail(
          "referenced",
          L(
            "Den egne versjonen har en 2D-scene; angre den først",
            "The own version has a 2D scene; undo it first",
          ),
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
              L(
                "Den egne versjonen har egne oversettelser; angre dem først",
                "The own version has its own translations; undo them first",
              ),
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
            L(
              "Den egne versjonen har egne oversettelser; angre dem først",
              "The own version has its own translations; undo them first",
            ),
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
            L(
              "Den egne versjonen har egne notater; angre dem først",
              "The own version has its own notes; undo them first",
            ),
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
          L(
            "Lyd eller tidskoblinger er koblet til linjer bare den nye versjonen har",
            "Audio or time links are linked to lines only the new version has",
          ),
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
      const production = need(s.productions[c.productionId], L("Produksjonen", "The production"));
      const source = need(s.variants[c.sourceVariantId], L("Varianten", "The variant"));
      if (source.ownerProductionId === null || source.ownerProductionId === c.productionId)
        fail(
          "invalid",
          L(
            "Bare en scene som tilhører en annen produksjon kan overføres",
            "Only a scene that belongs to another production can be transferred",
          ),
        );
      if (
        Object.values(s.occurrences).some(
          (o) => o.productionId === c.productionId && o.sceneId === source.sceneId,
        )
      )
        fail(
          "invalid",
          L(
            `Scenen er allerede med i ${production.name}`,
            `The scene is already in ${production.name}`,
          ),
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
      const o = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
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
          L(
            "Scenen har fått materiale i produksjonen. Deaktiver den i stedet.",
            "The scene has received material in the production. Deactivate it instead.",
          ),
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
      need(s.productions[c.productionId], L("Produksjonen", "The production"));
      const scene = need(s.scenes[c.sceneId], L("Scenen", "The scene"));
      const variant = need(s.variants[c.variantId], L("Varianten", "The variant"));
      if (variant.sceneId !== scene.id)
        fail(
          "invalid",
          L("Varianten tilhører en annen scene", "The variant belongs to another scene"),
        );
      if (variant.ownerProductionId !== null && variant.ownerProductionId !== c.productionId) {
        fail(
          "must_fork_variant",
          L(
            "Denne versjonen av scenen tilhører en annen produksjon",
            "This version of the scene belongs to another production",
          ),
        );
      }
      assertNewId(s, c.occurrenceId);
      assertKey(c.orderKey);
      // Scenetypen (MTS MT6): utelatt/«scene» = vanlig manusscene
      const kind = c.kind ?? "scene";
      if (!OCCURRENCE_KINDS.includes(kind))
        fail("invalid", L("Ugyldig scenetype", "Invalid occurrence kind"));
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
      const o = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
      if (
        Object.values(s.takes).some((t) => t.occurrenceId === o.id) ||
        Object.values(s.segments).some((g) => g.occurrenceId === o.id)
      ) {
        fail(
          "referenced",
          L(
            "Forekomsten har produksjonsmateriale. Deaktiver den i stedet.",
            "The occurrence has production material. Deactivate it instead.",
          ),
        );
      }
      if (Object.values(s.occurrences).filter((x) => x.sceneId === o.sceneId).length <= 1) {
        fail(
          "referenced",
          L(
            "Siste forekomst av scenen kan bare fjernes ved å angre opprettelsen av scenen",
            "The last occurrence of the scene can only be removed by undoing the creation of the scene",
          ),
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
          L(
            `Rulleteksten kan ha høyst ${CREDIT_PARTICIPANTS_MAX} deltakere`,
            `The credits can have at most ${CREDIT_PARTICIPANTS_MAX} participants`,
          ),
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
      const p = need(s.creditParticipants[c.participantId], L("Deltakeren", "The participant"));
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
      const p = need(s.creditParticipants[c.participantId], L("Deltakeren", "The participant"));
      if (p.removed) fail("invalid", L("Deltakeren er allerede fjernet", "The participant is already removed"));
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
      const o = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
      if (occurrenceKind(o) !== "credits")
        fail("invalid", L("Forekomsten er ikke en rulletekst", "The occurrence is not a credits sequence"));
      const err = creditSequenceError(c.fields);
      if (err) fail("invalid", err);
      const existing = Object.values(s.creditSequences).find(
        (q) => q.occurrenceId === o.id && !q.removed,
      );
      if (existing && existing.id !== c.sequenceId)
        fail("invalid", L("Forekomsten har allerede en rulletekst", "The occurrence already has a credits sequence"));
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
      const q = need(s.creditSequences[c.sequenceId], L("Rulleteksten", "The credits sequence"));
      if (q.removed) fail("invalid", L("Rulleteksten er allerede fjernet", "The credits sequence is already removed"));
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
      const o = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
      if (c.segments.length === 0)
        fail("invalid", L("Ingen segmenter oppgitt", "No segments given"));
      const segments = { ...s.segments };
      for (const g of c.segments) {
        assertNewId(s, g.segmentId);
        assertKey(g.orderKey);
        for (const bid of [g.startBlockId, g.endBlockId]) {
          if (bid !== null) {
            const b = need(s.blocks[bid], L("Blokken", "The block"));
            if (b.variantId !== o.variantId)
              fail(
                "invalid",
                L(
                  "Segmentet viser til en blokk i en annen variant",
                  "The segment refers to a block in another variant",
                ),
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
      const list = c.segmentIds.map((id) => need(s.segments[id], L("Segmentet", "The segment")));
      const ids = new Set(c.segmentIds as readonly string[]);
      if (Object.values(s.takes).some((t) => t.segmentId !== null && ids.has(t.segmentId))) {
        fail(
          "referenced",
          L(
            "Segmentet har produsert materiale og kan ikke fjernes",
            "The segment has produced material and cannot be removed",
          ),
        );
      }
      if (Object.values(s.generationPrompts).some((p) => ids.has(p.segmentId) && !p.removed))
        fail(
          "referenced",
          L(
            "Segmentet har en egen genereringsbeskrivelse",
            "The segment has its own generation description",
          ),
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
      const o = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
      assertNewId(s, c.takeId);
      if (c.segmentId !== null) {
        const g = need(s.segments[c.segmentId], L("Segmentet", "The segment"));
        if (g.occurrenceId !== o.id)
          fail(
            "invalid",
            L("Segmentet tilhører en annen forekomst", "The segment belongs to another occurrence"),
          );
      }
      if (
        c.durationFrames !== null &&
        (!Number.isInteger(c.durationFrames) || c.durationFrames < 0)
      ) {
        fail(
          "invalid",
          L(
            "Varighet må være et ikke-negativt heltall bilder",
            "Duration must be a non-negative whole number of frames",
          ),
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
        fail("invalid", L("Ugyldig mediesti", "Invalid media path"));
      if (c.media !== undefined && c.kind !== "imported_film" && c.kind !== "ai_video")
        fail(
          "invalid",
          L("Filinformasjon gjelder bare film", "File information only applies to film"),
        );
      // Stillbilde (DEC-0072): et bilde fra biblioteket i dette prosjektet, med varighet
      if (c.kind === "still" && c.mediaRef !== null) {
        const v = Object.values(s.assetVersions).find((x) => x.mediaPath === c.mediaRef);
        if (!v || !STILL_MIME_TYPES.includes(v.mimeType))
          fail(
            "invalid",
            L(
              "Stillbildet må være et PNG-, JPEG- eller WebP-bilde i ressursbiblioteket",
              "The still must be a PNG, JPEG or WebP image in the asset library",
            ),
          );
        if (!c.durationFrames || c.durationFrames > STILL_MAX_FRAMES)
          fail("invalid", L("Stillbildet må ha en varighet", "The still must have a duration"));
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
      const o = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
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

    case "SetAiBudget": {
      const lim = c.monthLimit;
      const price = c.pricePerImage;
      if (lim !== null && (!Number.isInteger(lim) || lim < 0 || lim > 100000))
        fail(
          "invalid",
          L(
            "Grensen må være et helt tall mellom 0 og 100 000",
            "The limit must be a whole number between 0 and 100,000",
          ),
        );
      if (price !== null && (!Number.isFinite(price) || price < 0 || price > 100000))
        fail(
          "invalid",
          L(
            "Prisen må være et tall mellom 0 og 100 000",
            "The price must be a number between 0 and 100,000",
          ),
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
      const o = need(s.occurrences[c.occurrenceId], L("Scenen", "The scene"));
      const seg = need(s.segments[c.segmentId], L("Segmentet", "The segment"));
      if (seg.occurrenceId !== o.id)
        fail(
          "invalid",
          L("Segmentet hører til en annen scene", "The segment belongs to another scene"),
        );
      if (typeof c.basedOn !== "string" || c.basedOn.length > MAX_PROMPT_CHARS)
        fail("invalid", L("Ugyldig grunnlag", "Invalid basis"));
      const text = c.text === null ? null : c.text.trim();
      if (text !== null && (text.length === 0 || text.length > MAX_PROMPT_CHARS))
        fail(
          "invalid",
          L(
            `Beskrivelsen må ha mellom 1 og ${MAX_PROMPT_CHARS} tegn`,
            `The description must have between 1 and ${MAX_PROMPT_CHARS} characters`,
          ),
        );
      const old = s.generationPrompts[c.promptId];
      const prompts = { ...s.generationPrompts };
      if (old) {
        if (old.occurrenceId !== o.id || old.segmentId !== seg.id)
          fail(
            "invalid",
            L(
              "Beskrivelsen hører til et annet segment",
              "The description belongs to another segment",
            ),
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
            L(
              "Segmentet har fått en annen egen beskrivelse i mellomtiden",
              "The segment has received a different description in the meantime",
            ),
          );
        prompts[old.id] =
          text === null
            ? { ...old, basedOn: c.basedOn, removed: true, revision: rev(old) }
            : { ...old, text, basedOn: c.basedOn, removed: false, revision: rev(old) };
      } else {
        if (text === null)
          fail("invalid", L("Ingen beskrivelse å fjerne", "No description to remove"));
        assertNewId(s, c.promptId);
        if (Object.values(s.generationPrompts).some((p) => p.segmentId === seg.id && !p.removed))
          fail(
            "invalid",
            L(
              "Segmentet har allerede en egen beskrivelse",
              "The segment already has its own description",
            ),
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
      const o = need(s.occurrences[c.occurrenceId], L("Scenen", "The scene"));
      if (c.removeSegmentIds.length === 0 && c.segments.length === 0)
        fail("invalid", L("Ingen endring", "No change"));
      if (c.segments.length > 200) fail("invalid", L("For mange segmenter", "Too many segments"));
      // Samtidige endringer: det som fjernes, må være nøyaktig inndelingen som gjelder nå
      const current = Object.values(s.segments)
        .filter((g) => g.occurrenceId === o.id && g.reason === c.reason)
        .map((g) => g.id as string)
        .sort();
      const asked = [...new Set(c.removeSegmentIds as readonly string[])].sort();
      if (current.length !== asked.length || current.some((id, i) => id !== asked[i]))
        fail(
          "revision_conflict",
          L(
            "Inndelingen er endret i mellomtiden (av deg eller noen andre). Lukk og åpne vinduet igjen.",
            "The division was changed in the meantime (by you or someone else). Close the window and open it again.",
          ),
        );
      const segments = { ...s.segments };
      const prompts = { ...s.generationPrompts };
      const removedOld: ProductionSegment[] = [];
      for (const id of c.removeSegmentIds) {
        const g = need(s.segments[id], L("Segmentet", "The segment"));
        if (g.occurrenceId !== o.id)
          fail(
            "invalid",
            L("Segmentet hører til en annen scene", "The segment belongs to another scene"),
          );
        if (Object.values(s.takes).some((t) => t.segmentId === id))
          fail(
            "referenced",
            L(
              "Segmentet har produsert materiale og kan ikke endres",
              "The segment has produced material and cannot be changed",
            ),
          );
        if (Object.values(s.generationPrompts).some((p) => p.segmentId === id && !p.removed))
          fail(
            "referenced",
            L(
              "Segmentet har en egen beskrivelse. Tilbakestill den først.",
              "The segment has its own description. Reset it first.",
            ),
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
      if (!reasons.includes(c.reason)) fail("invalid", L("Ugyldig grunn", "Invalid reason"));
      for (const g of c.segments) {
        // Et segment som fjernes, kan ikke legges til igjen i samme endring (lagres i én transaksjon)
        if (segments[g.segmentId] || removedOld.some((x) => x.id === g.segmentId))
          fail(
            "duplicate_id",
            L(`ID ${g.segmentId} er allerede i bruk`, `ID ${g.segmentId} is already in use`),
          );
        assertNewId({ ...s, segments, generationPrompts: prompts }, g.segmentId);
        assertKey(g.orderKey);
        for (const bid of [g.startBlockId, g.endBlockId]) {
          if (bid === null) continue;
          const b = need(s.blocks[bid], L("Blokken", "The block"));
          if (b.variantId !== o.variantId)
            fail(
              "invalid",
              L(
                "Segmentet viser til en blokk i en annen variant",
                "The segment refers to a block in another variant",
              ),
            );
        }
        const timed = g.startMs !== undefined || g.endMs !== undefined;
        if (c.reason === "model_limit" && !timed)
          fail(
            "invalid",
            L("Segmenter til generering må ha tid", "Segments for generation must have a time"),
          );
        if (
          timed &&
          (!Number.isInteger(g.startMs) ||
            !Number.isInteger(g.endMs) ||
            g.startMs! < 0 ||
            g.endMs! <= g.startMs! ||
            g.endMs! > 36_000_000)
        )
          fail("invalid", L("Ugyldig tid for segmentet", "Invalid time for the segment"));
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
      const o = need(s.occurrences[c.occurrenceId], L("Scenen", "The scene"));
      if (c.compositionIds.length === 0 && c.takeIds.length === 0)
        fail("invalid", L("Ingenting å godkjenne", "Nothing to approve"));
      const now = currentBlockRevisions(s, o.variantId);
      const compositions = { ...s.compositions };
      const takes = { ...s.takes };
      const inverse: Extract<Command, { type: "SetProducedFrom" }> = {
        type: "SetProducedFrom",
        compositions: [],
        takes: [],
      };
      for (const id of c.compositionIds) {
        const comp = need(s.compositions[id], L("2D-scenen", "The 2D scene"));
        if (comp.variantId !== o.variantId)
          fail(
            "invalid",
            L("2D-scenen hører til en annen scene", "The 2D scene belongs to another scene"),
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
        const t = need(s.takes[id], L("Versjonen", "The version"));
        if (t.occurrenceId !== o.id)
          fail(
            "invalid",
            L("Versjonen hører til en annen scene", "The version belongs to another scene"),
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
        if (!m || typeof m !== "object") fail("invalid", L("Ugyldig grunnlag", "Invalid basis"));
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(m)) {
          if (!isUuid(k) || !Number.isInteger(v) || v < 1)
            fail("invalid", L("Ugyldig grunnlag", "Invalid basis"));
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
            L("2D-scenen", "The 2D scene"),
          ).producedFrom;
          return {
            compositionId: x.compositionId,
            blockRevisions: pf?.blockRevisions ?? {},
            assetVersions: pf?.assetVersions ?? null,
          };
        }),
        takes: c.takes.map((x) => {
          const af = need(s.takes[x.takeId], L("Versjonen", "The version")).acceptedFrom;
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
        if (typeof m !== "object") fail("invalid", L("Ugyldig grunnlag", "Invalid basis"));
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(m)) {
          if (!isUuid(k) || typeof v !== "string" || !isUuid(v))
            fail("invalid", L("Ugyldig grunnlag", "Invalid basis"));
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
      const o = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
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
          L(
            "Planlagt lengde må være mellom 1 sekund og 10 timer",
            "Planned length must be between 1 second and 10 hours",
          ),
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
      const o = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
      if (typeof c.text !== "string")
        fail("invalid", L("Ugyldige instrukser", "Invalid instructions"));
      const text = c.text.replace(/\r\n?/g, "\n").trim();
      if (text.length > MAX_SCENE_VIDEO_INSTRUCTIONS)
        fail(
          "invalid",
          L(
            `Instruksene er for lange (høyst ${MAX_SCENE_VIDEO_INSTRUCTIONS} tegn)`,
            `The instructions are too long (at most ${MAX_SCENE_VIDEO_INSTRUCTIONS} characters)`,
          ),
        );
      if ((o.videoInstructions ?? "") === text) fail("invalid", L("Uendret", "Unchanged"));
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
      const o = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
      if (typeof c.monochrome !== "boolean") fail("invalid", L("Ugyldig valg", "Invalid choice"));
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

    case "SetSceneEdit": {
      const o = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
      if (c.activeTakeId !== null) {
        const t = need(s.takes[c.activeTakeId], L("Versjonen", "The version"));
        if (s.occurrences[t.occurrenceId]?.sceneId !== o.sceneId)
          fail(
            "invalid",
            L("Versjonen tilhører en annen scene", "The version belongs to another scene"),
          );
      }
      if (!Array.isArray(c.parts) || c.parts.length > MAX_CLIP_PARTS)
        fail(
          "invalid",
          L(`For mange deler (maks ${MAX_CLIP_PARTS})`, `Too many parts (max ${MAX_CLIP_PARTS})`),
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
        if (seen.has(f.partId)) fail("invalid", L("Samme del to ganger", "The same part twice"));
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
          const t = need(s.takes[f.takeId!], L("Versjonen", "The version"));
          if (s.occurrences[t.occurrenceId]?.sceneId !== o.sceneId)
            fail(
              "invalid",
              L("Versjonen tilhører en annen scene", "The version belongs to another scene"),
            );
          if (
            (t.kind !== "imported_film" && t.kind !== "ai_video" && t.kind !== "still") ||
            !t.mediaRef
          )
            fail(
              "invalid",
              L(
                "Bare film (importert eller AI-video) eller stillbilde kan brukes som del",
                "Only film (imported or AI video) or a still can be used as a part",
              ),
            );
          // Et stillbilde kan vises så lenge man vil; filmen har sin lengde
          const max = t.kind === "still" ? AUDIO_MAX_MS : (t.media?.durationMs ?? AUDIO_MAX_MS);
          if (f.outMs > max)
            fail(
              "invalid",
              L(
                "Utpunktet er etter slutten av filmen",
                "The out point is after the end of the film",
              ),
            );
        } else {
          if (!comp) fail("invalid", L("Scenen har ingen 2D-scene", "The scene has no 2D scene"));
          if (f.outMs > compMs)
            fail(
              "invalid",
              L(
                "Utpunktet er etter slutten av 2D-scenen",
                "The out point is after the end of the 2D scene",
              ),
            );
        }
        const old = s.clipParts[f.partId];
        if (old && old.occurrenceId !== o.id)
          fail("invalid", L("Delen tilhører en annen scene", "The part belongs to another scene"));
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
      const t = need(s.takes[c.takeId], L("Versjonen", "The version"));
      if (c.status !== "reference" && c.status !== "in_progress" && c.status !== "approved")
        fail("invalid", L("Ugyldig status", "Invalid status"));
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
      const t = need(s.takes[c.takeId], L("Versjonen", "The version"));
      const v = c.audioLanguage;
      if (v !== null && v !== "none" && (typeof v !== "string" || !LANGUAGE_CODE.test(v)))
        fail("invalid", L("Ugyldig språk for filmlyden", "Invalid language for the film audio"));
      if ((t.audioLanguage ?? null) === v) fail("invalid", L("Ingen endring", "No change"));
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
        fail("invalid", L("Ugyldig antall tidskoblinger", "Invalid number of time links"));
      const next = { ...s.timeLinks };
      for (const l of c.links) {
        assertNewId(s, l.linkId);
        if (next[l.linkId])
          fail("invalid", L("Samme tidskobling to ganger", "The same time link twice"));
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
        const t = need(s.timeLinks[l.linkId], L("Tidskoblingen", "The time link"));
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
        const t = need(s.timeLinks[id], L("Tidskoblingen", "The time link"));
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
          L("Ugyldig antall kontinuitetshendelser", "Invalid number of continuity events"),
        );
      const next = { ...s.continuityEvents };
      for (const e of c.events) {
        assertNewId(s, e.eventId);
        if (next[e.eventId]) fail("invalid", L("Samme hendelse to ganger", "The same event twice"));
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
          L("Ugyldig antall kontinuitetshendelser", "Invalid number of continuity events"),
        );
      const next = { ...s.continuityEvents };
      const old: { eventId: ContinuityEventId; fields: ContinuityEventFields }[] = [];
      for (const e of c.events) {
        const ev = need(
          s.continuityEvents[e.eventId],
          L("Kontinuitetshendelsen", "The continuity event"),
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
        fail("invalid", L("Ugyldig antall relasjoner", "Invalid number of relations"));
      const next = { ...s.assetRelations };
      for (const it of c.items) {
        assertNewId(s, it.relationId);
        if (next[it.relationId])
          fail("invalid", L("Samme relasjon to ganger", "The same relation twice"));
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
        fail("invalid", L("Ugyldig antall relasjoner", "Invalid number of relations"));
      const next = { ...s.assetRelations };
      const old: { relationId: AssetRelation["id"]; fields: RelationFields }[] = [];
      for (const it of c.items) {
        const r = need(s.assetRelations[it.relationId], L("Relasjonen", "The relation"));
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
      const gone = ids.map((id) => need(s.assetRelations[id], L("Relasjonen", "The relation")));
      if (
        Object.values(s.posters).some((p) =>
          ids.some((id) => posterAssetRefs(p.document).relations.has(id)),
        )
      )
        fail(
          "referenced",
          L(
            "Relasjonen vises på en plakat og kan ikke angres. Fjern den i stedet.",
            "The relation appears on a poster and cannot be undone. Remove it instead.",
          ),
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
        .map((id) => need(s.assetRelations[id], L("Relasjonen", "The relation")))
        .filter((r) => r.removed !== c.removed);
      if (changed.length === 0) fail("invalid", L("Ingen endring", "No change"));
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
      const p = need(s.posters[c.posterId], L("Plakaten", "The poster"));
      const { [p.id]: _p, ...posters } = s.posters;
      const { id: _id, revision: _r, removed: _rm, ...fields } = p;
      return {
        state: { ...s, posters },
        inverse: { type: "CreatePoster", posterId: p.id, fields },
        affected: [p.id],
      };
    }

    case "UpdatePoster": {
      const p = need(s.posters[c.posterId], L("Plakaten", "The poster"));
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
      const p = need(s.posters[c.posterId], L("Plakaten", "The poster"));
      if (p.removed === c.removed) fail("invalid", L("Ingen endring", "No change"));
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
      const p = need(s.styleProfiles[c.profileId], L("Stilprofilen", "The style profile"));
      if (p.appliesTo?.length)
        fail(
          "referenced",
          L(
            "Stilprofilen er valgt for bestemte bruk og kan ikke fjernes ved angring. Fjern den i stilguiden i stedet.",
            "The style profile is selected for specific uses and cannot be removed by undoing. Remove it in the style guide instead.",
          ),
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
      const p = need(s.styleProfiles[c.profileId], L("Stilprofilen", "The style profile"));
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
      const p = need(s.styleProfiles[c.profileId], L("Stilprofilen", "The style profile"));
      if (!Array.isArray(c.appliesTo) || c.appliesTo.some((u) => !STYLE_USES.includes(u)))
        fail("invalid", L("Ugyldig bruk for stilprofilen", "Invalid use for the style profile"));
      const uses = STYLE_USES.filter((u) => c.appliesTo.includes(u));
      // Hver bruk har høyst én profil, så det alltid er klart hvilken som gjelder
      for (const u of uses) {
        const other = Object.values(s.styleProfiles).find(
          (x) => x.id !== p.id && !x.removed && (x.appliesTo ?? []).includes(u),
        );
        if (other)
          fail(
            "invalid",
            L(
              `«${STYLE_USE_LABEL[u]}» bruker allerede stilprofilen «${other.name}»`,
              `“${STYLE_USE_LABEL[u]}” already uses the style profile “${other.name}”`,
            ),
          );
      }
      const before = p.appliesTo ?? [];
      if (before.length === uses.length && before.every((u, i) => u === uses[i]))
        fail("invalid", L("Ingen endring", "No change"));
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
      const p = need(s.styleProfiles[c.profileId], L("Stilprofilen", "The style profile"));
      if (p.removed === c.removed) fail("invalid", L("Ingen endring", "No change"));
      if (!c.removed && p.isDefault && otherDefault(s, p.id))
        fail(
          "invalid",
          L(
            "Prosjektet har allerede en standard stilprofil",
            "The project already has a default style profile",
          ),
        );
      if (!c.removed)
        for (const u of p.appliesTo ?? []) {
          const other = Object.values(s.styleProfiles).find(
            (x) => x.id !== p.id && !x.removed && (x.appliesTo ?? []).includes(u),
          );
          if (other)
            fail(
              "invalid",
              L(
                `«${STYLE_USE_LABEL[u]}» bruker allerede stilprofilen «${other.name}»`,
                `“${STYLE_USE_LABEL[u]}” already uses the style profile “${other.name}”`,
              ),
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
            L("Profilen hører til en annen karakter", "The profile belongs to another character"),
          );
        if (prev.removed)
          fail(
            "invalid",
            L(
              "Profilen er fjernet. Hent den tilbake først.",
              "The profile has been removed. Restore it first.",
            ),
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
          L("Karakteren har allerede en profil", "The character already has a profile"),
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
      const p = need(s.storyProfiles[c.profileId], L("Profilen", "The profile"));
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
      const p = need(s.storyProfiles[c.profileId], L("Profilen", "The profile"));
      if (p.removed === c.removed) fail("invalid", L("Ingen endring", "No change"));
      if (!c.removed && activeProfileOf(s, p.assetId))
        fail(
          "invalid",
          L("Karakteren har allerede en profil", "The character already has a profile"),
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
      need(s.scenes[c.fromSceneId], L("Scenen", "The scene"));
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
      const g = need(s.storyProfileStages[c.stageId], L("Stadiet", "The stage"));
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
      const g = need(s.storyProfileStages[c.stageId], L("Stadiet", "The stage"));
      need(s.scenes[c.fromSceneId], L("Scenen", "The scene"));
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
      const g = need(s.storyProfileStages[c.stageId], L("Stadiet", "The stage"));
      if (g.removed === c.removed) fail("invalid", L("Ingen endring", "No change"));
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
      const f = need(s.storyFacts[c.factId], L("Faktumet", "The fact"));
      const { [f.id]: _f, ...storyFacts } = s.storyFacts;
      return {
        state: { ...s, storyFacts },
        inverse: { type: "AddStoryFact", factId: f.id, fields: factFieldsOf(f) },
        affected: [f.id],
      };
    }

    case "UpdateStoryFact": {
      const f = need(s.storyFacts[c.factId], L("Faktumet", "The fact"));
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
      const f = need(s.storyFacts[c.factId], L("Faktumet", "The fact"));
      if (f.removed === c.removed) fail("invalid", L("Ingen endring", "No change"));
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
        fail("invalid", L("Ugyldig antall noder", "Invalid number of nodes"));
      const added: Record<string, import("../model").CanvasNode> = {};
      for (const n of c.nodes) {
        assertNewId(s, n.id);
        if (added[n.id])
          fail("duplicate_id", L(`ID ${n.id} er brukt to ganger`, `ID ${n.id} is used twice`));
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
      const nodes = c.nodeIds.map((id) => need(s.canvasNodes[id], L("Noden", "The node")));
      const ids = new Set<string>(c.nodeIds);
      if (Object.values(s.canvasEdges).some((e) => ids.has(e.fromNodeId) || ids.has(e.toNodeId)))
        fail(
          "invalid",
          L(
            "Noden har koblinger. Fjern dem først.",
            "The node has connections. Remove them first.",
          ),
        );
      if (
        Object.values(s.canvasNodes).some((n) => !ids.has(n.id) && n.groupId && ids.has(n.groupId))
      )
        fail(
          "invalid",
          L(
            "Gruppen har noder. Fjern dem fra gruppen først.",
            "The group has nodes. Remove them from the group first.",
          ),
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
      const n = need(s.canvasNodes[c.nodeId], L("Noden", "The node"));
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
      if (c.moves.length === 0) fail("invalid", L("Ingen endring", "No change"));
      const canvasNodes = { ...s.canvasNodes };
      const back: { nodeId: CanvasNodeId; x: number; y: number; w?: number; h?: number }[] = [];
      for (const m of c.moves) {
        const n = need(canvasNodes[m.nodeId], L("Noden", "The node"));
        if (back.some((b) => b.nodeId === m.nodeId))
          fail(
            "invalid",
            L("Samme node er med flere ganger", "The same node is listed more than once"),
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
      if (c.nodeIds.length === 0) fail("invalid", L("Ingen endring", "No change"));
      const canvasNodes = { ...s.canvasNodes };
      const canvasEdges = { ...s.canvasEdges };
      for (const id of c.nodeIds) {
        const n = need(canvasNodes[id], L("Noden", "The node"));
        if (n.removed === c.removed) fail("invalid", L("Ingen endring", "No change"));
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
          const e = need(canvasEdges[id], L("Koblingen", "The connection"));
          if (!e.removed) fail("invalid", L("Ingen endring", "No change"));
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
              L("Koblingen peker på en fjernet node", "The connection points to a removed node"),
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
      const e = need(s.canvasEdges[c.edgeId], L("Koblingen", "The connection"));
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
      const e = need(s.canvasEdges[c.edgeId], L("Koblingen", "The connection"));
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
      const e = need(s.canvasEdges[c.edgeId], L("Koblingen", "The connection"));
      if (e.removed === c.removed) fail("invalid", L("Ingen endring", "No change"));
      if (
        !c.removed &&
        (s.canvasNodes[e.fromNodeId]?.removed || s.canvasNodes[e.toNodeId]?.removed)
      )
        fail(
          "invalid",
          L("Koblingen peker på en fjernet node", "The connection points to a removed node"),
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
        L("Kontinuitetshendelsen", "The continuity event"),
      );
      const p = need(s.productions[c.productionId], L("Produksjonen", "The production"));
      if (p.kind === "main")
        fail(
          "invalid",
          L(
            "Hovedfilmens hendelser fjernes i stedet for å slås av",
            "The main film's events are removed instead of being turned off",
          ),
        );
      if (ev.productionId)
        fail(
          "invalid",
          L(
            "En lokal hendelse fjernes i stedet for å slås av",
            "A local event is removed instead of being turned off",
          ),
        );
      const list = ev.disabledIn ?? [];
      if (list.includes(p.id) === c.disabled) fail("invalid", L("Ingen endring", "No change"));
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
        const ev = need(s.continuityEvents[id], L("Kontinuitetshendelsen", "The continuity event"));
        next[id] = { ...ev, removed: c.removed, revision: rev(ev) };
      }
      return {
        state: { ...s, continuityEvents: next },
        inverse: { type: "SetContinuityEventsRemoved", eventIds: c.eventIds, removed: !c.removed },
        affected: [...c.eventIds],
      };
    }

    case "AddTranslations": {
      if (!Array.isArray(c.items) || c.items.length === 0 || c.items.length > 2000)
        fail("invalid", L("Ugyldig antall oversettelser", "Invalid number of translations"));
      const next = { ...s.translations };
      const taken = new Set(
        Object.values(s.translations)
          .filter((t) => !t.removed)
          .map(translationKey),
      );
      for (const it of c.items) {
        assertNewId(s, it.translationId);
        if (next[it.translationId])
          fail("invalid", L("Samme oversettelse to ganger", "The same translation twice"));
        const f = translationFieldsOf(s, it.fields);
        // Én gjeldende oversettelse per linje og språk
        if (taken.has(translationKey(f)))
          fail(
            "invalid",
            L(
              "Linjen har allerede en oversettelse til dette språket",
              "The line already has a translation into this language",
            ),
          );
        taken.add(translationKey(f));
        next[it.translationId] = { id: it.translationId, revision: 1, ...f, removed: false };
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
        fail("invalid", L("Ugyldig antall oversettelser", "Invalid number of translations"));
      const next = { ...s.translations };
      const old: { translationId: TranslationId; fields: TranslationFields }[] = [];
      for (const it of c.items) {
        const t = need(s.translations[it.translationId], L("Oversettelsen", "The translation"));
        const f = translationFieldsOf(s, it.fields);
        if (translationKey(f) !== translationKey(t))
          fail(
            "invalid",
            L(
              "En oversettelse kan ikke flyttes til en annen linje eller et annet språk",
              "A translation cannot be moved to another line or another language",
            ),
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
        const t = need(s.translations[id], L("Oversettelsen", "The translation"));
        if (!c.removed && live.has(translationKey(t)))
          fail(
            "invalid",
            L(
              "Linjen har fått en annen oversettelse i mellomtiden",
              "The line has received a different translation in the meantime",
            ),
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
      const o = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
      if (c.takeId !== null) {
        const t = need(s.takes[c.takeId], L("Versjonen", "The version"));
        const tOcc = need(
          s.occurrences[t.occurrenceId],
          L("Forekomsten til versjonen", "The occurrence of the version"),
        );
        if (tOcc.sceneId !== o.sceneId)
          fail(
            "invalid",
            L("Versjonen tilhører en annen scene", "The version belongs to another scene"),
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
      need(s.productions[c.productionId], L("Produksjonen", "The production"));
      if (c.scenes.length === 0)
        fail("invalid", L("Manuset inneholder ingen scener", "The script contains no scenes"));
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
      const b = need(s.blocks[c.blockId], L("Manusblokken", "The script block"));
      assertCanEditVariant(s, c.productionId, b.variantId);
      const removed = c.type === "RemoveBlock";
      if (b.removed === removed)
        fail(
          "invalid",
          removed
            ? L("Blokken er allerede fjernet", "The block has already been removed")
            : L("Blokken er ikke fjernet", "The block has not been removed"),
        );
      if (
        removed &&
        Object.values(s.segments).some((g) => g.startBlockId === b.id || g.endBlockId === b.id)
      ) {
        fail(
          "referenced",
          L(
            "Blokken brukes som grense for et produksjonssegment",
            "The block is used as a boundary for a production segment",
          ),
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
      const b = need(s.blocks[c.blockId], L("Manusblokken", "The script block"));
      assertCanEditVariant(s, c.productionId, b.variantId);
      if (b.kind === c.kind)
        fail("invalid", L("Elementtypen er uendret", "The element type is unchanged"));
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
      const v = need(s.variants[c.variantId], L("Varianten", "The variant"));
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
      const v = need(s.variants[c.targetId], L("Blokken eller varianten", "The block or variant"));
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
      const occ = need(s.occurrences[c.occurrenceId], L("Forekomsten", "The occurrence"));
      if (occ.productionId !== c.productionId)
        fail(
          "invalid",
          L(
            "Forekomsten tilhører en annen produksjon",
            "The occurrence belongs to another production",
          ),
        );
      assertCanEditVariant(s, c.productionId, occ.variantId);
      const variant = need(s.variants[occ.variantId], L("Varianten", "The variant"));
      const scene = need(s.scenes[occ.sceneId], L("Scenen", "The scene"));
      const blocks = Object.values(s.blocks)
        .filter((b) => b.variantId === variant.id && !b.removed)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
      const idx = blocks.findIndex((b) => b.id === c.atBlockId);
      if (idx < 0)
        fail(
          "not_found",
          L("Blokken finnes ikke i scenen", "The block does not exist in the scene"),
        );
      if (idx === 0)
        fail("invalid", L("Kan ikke splitte ved første blokk", "Cannot split at the first block"));
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
          L(
            "Produksjonssegmenter viser til blokker som ville blitt flyttet",
            "Production segments refer to blocks that would be moved",
          ),
        );
      }
      assertNewId(s, c.newSceneId);
      assertNewId(s, c.newVariantId);
      const users = Object.values(s.occurrences).filter((o) => o.variantId === variant.id);
      // INV-04: splitting skal ikke legge til forekomster i andre produksjoner. Del varianten først (ForkVariant).
      if (users.some((u) => u.productionId !== c.productionId)) {
        fail(
          "must_fork_variant",
          L(
            "Scenen brukes også i en annen produksjon (for eksempel en spinoff) og kan ikke deles herfra. Gi den andre produksjonen egen versjon av scenen først.",
            "The scene is also used in another production (for example a spin-off) and cannot be split from here. Give the other production its own version of the scene first.",
          ),
        );
      }
      for (const u of users) {
        const nid = c.newOccurrenceIds[u.id];
        if (!nid)
          fail(
            "invalid",
            L(`Mangler ny forekomst for ${u.id}`, `Missing new occurrence for ${u.id}`),
          );
        assertNewId(s, nid);
      }
      if (
        new Set(Object.values(c.newOccurrenceIds)).size !== users.length ||
        Object.keys(c.newOccurrenceIds).length !== users.length
      ) {
        fail(
          "invalid",
          L(
            "Forekomstkartet stemmer ikke med bruken av scenen",
            "The occurrence map does not match the use of the scene",
          ),
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
      const newScene = need(s.scenes[sp.newSceneId], L("Den nye scenen", "The new scene"));
      const nv = need(s.variants[sp.newVariantId], L("Den nye varianten", "The new variant"));
      const ov = need(
        s.variants[c.originalVariantId],
        L("Den opprinnelige varianten", "The original variant"),
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
          L(
            "Dette er ikke en deling som kan slås tilbake",
            "This is not a split that can be undone",
          ),
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
            L("Forekomstene stemmer ikke med delingen", "The occurrences do not match the split"),
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
          L(
            "Den nye scenen er brukt i en senere deling eller sammenslåing",
            "The new scene is used in a later split or merge",
          ),
        );
      }
      if (Object.values(s.scenes).some((x) => x.storyTime.anchorSceneId === newScene.id)) {
        fail(
          "referenced",
          L(
            "En annen scene er plassert i fortellingstiden i forhold til den nye scenen. Endre den først.",
            "Another scene is placed in story time relative to the new scene. Change it first.",
          ),
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
            L(
              "Scenen er endret etter delingen og kan ikke slås tilbake automatisk",
              "The scene was changed after the split and cannot be reverted automatically",
            ),
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
          L("Den nye scenen er tatt i bruk andre steder", "The new scene is used elsewhere"),
        );
      }
      if (
        Object.values(s.takes).some((t) => newOccIds.has(t.occurrenceId)) ||
        Object.values(s.segments).some((g) => newOccIds.has(g.occurrenceId))
      ) {
        fail(
          "referenced",
          L(
            "Den nye scenen har produksjonsmateriale og kan ikke slås tilbake",
            "The new scene has production material and cannot be reverted",
          ),
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
            L("Planen stemmer ikke med delingen", "The plan does not match the split"),
          );
        if (!Number.isInteger(ms) || ms < MIN_PLANNED_MS || ms > MAX_PLANNED_MS)
          fail("invalid", L("Ugyldig planlagt lengde", "Invalid planned length"));
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
      const target = need(s.occurrences[c.targetOccurrenceId], L("Målscenen", "The target scene"));
      const source = need(
        s.occurrences[c.sourceOccurrenceId],
        L("Kildescenen", "The source scene"),
      );
      if (target.productionId !== c.productionId || source.productionId !== c.productionId)
        fail(
          "invalid",
          L(
            "Begge scenene må være i samme produksjon",
            "Both scenes must be in the same production",
          ),
        );
      if (target.sceneId === source.sceneId)
        fail(
          "invalid",
          L("Kan ikke slå en scene sammen med seg selv", "A scene cannot be merged with itself"),
        );
      assertCanEditVariant(s, c.productionId, target.variantId);
      assertCanEditVariant(s, c.productionId, source.variantId);
      const sourceScene = need(s.scenes[source.sceneId], L("Kildescenen", "The source scene"));
      if (sourceScene.mergedIntoSceneId !== null)
        fail(
          "invalid",
          L(
            "Kildescenen er allerede slått sammen med en annen scene",
            "The source scene is already merged with another scene",
          ),
        );
      if (
        need(s.scenes[target.sceneId], L("Målscenen", "The target scene")).mergedIntoSceneId !==
        null
      )
        fail(
          "invalid",
          L(
            "Målscenen er slått sammen med en annen scene",
            "The target scene is already merged with another scene",
          ),
        );
      if (
        Object.values(s.occurrences).some((o) => o.sceneId === source.sceneId && o.id !== source.id)
      ) {
        fail(
          "referenced",
          L(
            "Kildescenen brukes også i andre produksjoner. Slå sammen der den bare finnes én gang.",
            "The source scene is also used in other productions. Merge where it only exists once.",
          ),
        );
      }
      if (Object.values(s.segments).some((g) => g.occurrenceId === source.id))
        fail(
          "referenced",
          L("Kildescenen har produksjonssegmenter", "The source scene has production segments"),
        );
      // INV-04: teksten i en scene som også brukes i andre produksjoner endres ikke herfra
      if (
        Object.values(s.occurrences).some(
          (o) => o.variantId === target.variantId && o.productionId !== c.productionId,
        )
      ) {
        fail(
          "must_fork_variant",
          L(
            "Målscenen brukes også i en annen produksjon (for eksempel en spinoff) og kan ikke slås sammen herfra. Gi den andre produksjonen egen versjon av scenen først.",
            "The target scene is also used in another production (for example a spin-off) and cannot be merged from here. Give the other production its own version of the scene first.",
          ),
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
        L("Kildescenen", "The source scene"),
      );
      const sourceScene = need(s.scenes[source.sceneId], L("Kildescenen", "The source scene"));
      if (sourceScene.mergedIntoSceneId === null)
        fail("invalid", L("Scenen er ikke slått sammen", "The scene has not been merged"));
      const target = need(s.occurrences[c.targetOccurrenceId], L("Målscenen", "The target scene"));
      if (
        sourceScene.mergedIntoSceneId !== target.sceneId ||
        source.productionId !== c.productionId
      ) {
        fail("invalid", L("Sammenslåingen stemmer ikke", "The merge does not match"));
      }
      assertCanEditVariant(s, c.productionId, source.variantId);
      if (new Set(c.placements.map((p) => p.blockId)).size !== c.placements.length) {
        fail("invalid", L("Blokker gjentas", "Blocks are repeated"));
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
            L("Blokkene stemmer ikke med sammenslåingen", "The blocks do not match the merge"),
          );
        }
      }
      for (const p of c.placements) {
        const b = need(s.blocks[p.blockId], L("Blokken", "The block"));
        if (b.variantId !== target.variantId || p.variantId !== source.variantId) {
          fail(
            "invalid",
            L("Blokken var ikke en del av sammenslåingen", "The block was not part of the merge"),
          );
        }
        assertKey(p.orderKey);
      }
      const blocksNext = { ...s.blocks };
      for (const p of c.placements) {
        const b = need(s.blocks[p.blockId], L("Blokken", "The block"));
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
      const sc = need(s.scenes[c.sceneId], L("Scenen", "The scene"));
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
        fail("invalid", L("Ingen ressurser å legge til", "No assets to add"));
      if (c.assets.length > 500)
        fail("invalid", L("For mange ressurser i én endring", "Too many assets in one change"));
      const seen = new Set<string>();
      const assets = { ...s.assets };
      for (const x of c.assets) {
        assertNewId(s, x.assetId);
        if (seen.has(x.assetId))
          fail(
            "duplicate_id",
            L(`ID ${x.assetId} er brukt to ganger`, `ID ${x.assetId} is used twice`),
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
        need(s.assets[id], L("Ressursen", "The asset"));
        if (usedByPresentation(s, "assets", id))
          fail(
            "referenced",
            L(
              "Ressursen brukes i en relasjon eller på en plakat og kan ikke fjernes. Arkiver den i stedet.",
              "The asset is used in a relation or on a poster and cannot be removed. Archive it instead.",
            ),
          );
        if (usedByLayer(s, "assetId", id))
          fail(
            "referenced",
            L(
              "Ressursen brukes i en 2D-scene og kan ikke fjernes. Arkiver den i stedet.",
              "The asset is used in a 2D scene and cannot be removed. Archive it instead.",
            ),
          );
        if (Object.values(s.assetVariants).some((v) => v.assetId === id))
          fail(
            "referenced",
            L(
              "Ressursen har fått visuelle varianter og kan ikke fjernes. Arkiver den i stedet.",
              "The asset has visual variants and cannot be removed. Archive it instead.",
            ),
          );
        // Stemme, betegnelser og lydkoblinger følger ikke med når opprettelsen gjøres om igjen; da angres
        // ikke opprettelsen (ingen andres arbeid skal gå tapt i stillhet)
        const extra = s.assets[id]!;
        if (extra.voice || extra.contextNames?.length || extra.soundLinks?.length)
          fail(
            "referenced",
            L(
              "Ressursen har fått stemme, betegnelser eller lydkoblinger og kan ikke fjernes. Arkiver den i stedet.",
              "The asset has a voice, designations or sound links and cannot be removed. Archive it instead.",
            ),
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
      const a = need(s.assets[c.assetId], L("Ressursen", "The asset"));
      if ((a.kind === "template") !== (c.fields.kind === "template"))
        fail(
          "invalid",
          L(
            "En mal kan ikke gjøres om til en annen ressurstype, eller omvendt",
            "A template cannot be changed into another asset type, or the other way round",
          ),
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
      const a = need(s.assets[c.assetId], L("Ressursen", "The asset"));
      const taskId = checkTaskId(c.taskId);
      need(s.occurrences[c.fromOccurrenceId as never], L("Scenen", "The scene"));
      if (
        !Array.isArray(c.occurrenceIds) ||
        c.occurrenceIds.length === 0 ||
        c.occurrenceIds.length > 500
      )
        fail("invalid", L("Velg 1–500 scener", "Choose 1–500 scenes"));
      const ids = [...new Set(c.occurrenceIds.map(String))];
      for (const id of ids) need(s.occurrences[id as never], L("Scenen", "The scene"));
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
        fail("invalid", L("For mange planlagte scener", "Too many planned scenes"));
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
      const a = need(s.assets[c.assetId], L("Ressursen", "The asset"));
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
      const a = need(s.assets[c.assetId], L("Ressursen", "The asset"));
      if (!Array.isArray(c.plans) || c.plans.length > 1000)
        fail("invalid", L("For mange planlagte scener", "Too many planned scenes"));
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
      const a = need(s.assets[c.assetId], L("Ressursen", "The asset"));
      if (!Array.isArray(c.contextNames) || c.contextNames.length > 200)
        fail("invalid", L("Høyst 200 betegnelser", "At most 200 designations"));
      const before = a.contextNames ?? [];
      const known = new Set(before.flatMap((x) => x.blockIds));
      const names = new Set<string>();
      const list: ContextName[] = [];
      for (const n of c.contextNames) {
        const name = typeof n?.name === "string" ? n.name.trim().replace(/\s+/g, " ") : "";
        if (!name || name.length > 80)
          fail(
            "invalid",
            L("Betegnelsen må ha 1–80 tegn", "The designation must have 1–80 characters"),
          );
        const key = name.toLocaleLowerCase("nb");
        if (names.has(key))
          fail("invalid", L("Samme betegnelse to ganger", "The same designation twice"));
        names.add(key);
        if (!Array.isArray(n.blockIds) || n.blockIds.length === 0 || n.blockIds.length > 2000)
          fail(
            "invalid",
            L("Velg minst én linje i manuset", "Choose at least one line in the script"),
          );
        const ids: string[] = [
          ...new Set<string>((n.blockIds as readonly unknown[]).map((x: unknown) => String(x))),
        ];
        for (const id of ids)
          if (!s.blocks[id] && !known.has(id) && !(c.restore === true && isUuid(id)))
            fail(
              "not_found",
              L(
                "En av linjene finnes ikke i manuset",
                "One of the lines does not exist in the script",
              ),
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
        fail("invalid", L("Ukjent ressursversjon", "Unknown asset version"));
      const ids = [...new Set(c.versionIds)];
      if (c.target === "layer") {
        const l = need(s.layers[c.id], L("Laget", "The layer"));
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
      if (c.target !== "take") fail("invalid", L("Ukjent mål", "Unknown target"));
      const t = need(s.takes[c.id], L("Versjonen", "The version"));
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
      const p = need(s.productions[c.productionId], L("Produksjonen", "The production"));
      const x = c.settings;
      if (
        x !== null &&
        (typeof x !== "object" ||
          (x.size !== "full" && x.size !== "half") ||
          typeof x.monochrome !== "boolean" ||
          (x.output !== "video" && x.output !== "dialogue"))
      )
        fail("invalid", L("Ugyldige eksportinnstillinger", "Invalid export settings"));
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
            fail("invalid", L("Ugyldig tittelside", "Invalid title page"));
          titlePage = [...x.titlePage];
        }
      }
      // «Inkluder rulletekst» (MTS MT8): utelatt = beholdes, standard er på
      let includeCredits = p.exportSettings?.includeCredits;
      if (x !== null && x.includeCredits !== undefined) {
        if (x.includeCredits !== null && typeof x.includeCredits !== "boolean")
          fail("invalid", L("Ugyldige eksportinnstillinger", "Invalid export settings"));
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
          L(
            "Tittelsiden er for lang til å lagres (maks om lag 3 kB)",
            "The title page is too long to save (max about 3 kB)",
          ),
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
          L(
            "Ugyldige antakelser for varighetsestimatet",
            "Invalid assumptions for the duration estimate",
          ),
        );
      const prev = s.project.durationAssumptions ?? null;
      if (prev === next || (prev !== null && next !== null && sameDurationAssumptions(prev, next)))
        fail("invalid", L("Ingen endring", "No change"));
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
      const t = need(s.takes[c.takeId], L("Versjonen", "The version"));
      if (t.kind !== "imported_film" && t.kind !== "ai_video")
        fail("invalid", L("Bare film kan ha manusdekning", "Only film can have script coverage"));
      const cov = c.coverage;
      if (cov !== null) {
        const o = need(s.occurrences[t.occurrenceId], L("Scenen", "The scene"));
        const order = blocksOfVariant(s, o.variantId)
          .filter((b) => b.kind !== "heading")
          .map((b) => b.id as string);
        const a = order.indexOf(cov?.startBlockId);
        const b = order.indexOf(cov?.endBlockId);
        if (a < 0 || b < 0)
          fail("not_found", L("Linjene må være i scenen", "The lines must be in the scene"));
        if (b < a)
          fail(
            "invalid",
            L("Siste linje må komme etter første", "The last line must come after the first"),
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
      const a = need(s.assets[c.assetId], L("Ressursen", "The asset"));
      if (a.kind !== "character" && a.kind !== "animal" && a.kind !== "other")
        fail("invalid", L("Bare karakterer kan få stemme", "Only characters can have a voice"));
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
      if (!links.length || links.length > 1000) fail("invalid", L("Ugyldig karakterkobling", "Invalid character link"));
      const audioClips = { ...s.audioClips };
      const back: { clipId: AudioClipId; characterAssetId: AssetId | null }[] = [];
      for (const link of links) {
        const clip = need(s.audioClips[link.clipId], L("Replikken", "The line"));
        if (clip.removed || !isVersionedKind(clip)) fail("invalid", L("Bare dialog kan kobles til en karakter", "Only dialogue can be linked to a character"));
        const asset = link.characterAssetId ? s.assets[link.characterAssetId] : null;
        if (link.characterAssetId && (!asset || asset.removed || !["character", "animal", "other"].includes(asset.kind)))
          fail("invalid", L("Karakteren finnes ikke", "The character was not found"));
        back.push({ clipId: clip.id, characterAssetId: (clip.characterAssetId ?? null) as AssetId | null });
        audioClips[clip.id] = { ...clip, characterAssetId: link.characterAssetId, revision: rev(clip) };
      }
      return { state: { ...s, audioClips }, inverse: { type: "RestoreDialogueCharacters", links: back }, affected: links.map(l => l.clipId) };
    }

    case "SetSoundLinks": {
      const a = need(s.assets[c.assetId], L("Ressursen", "The asset"));
      if (a.kind !== "sound")
        fail(
          "invalid",
          L(
            "Bare lydressurser kan kobles på denne måten",
            "Only audio assets can be linked in this way",
          ),
        );
      if (!Array.isArray(c.links) || c.links.length > MAX_SOUND_LINKS)
        fail(
          "invalid",
          L(`Høyst ${MAX_SOUND_LINKS} koblinger`, `At most ${MAX_SOUND_LINKS} links`),
        );
      const seen = new Set<string>();
      const links: SoundLink[] = [];
      const KINDS = ["asset", "block", "scene", "segment", "event", "production"];
      for (const l of c.links) {
        if (!l || !KINDS.includes(l.kind)) fail("invalid", L("Ugyldig kobling", "Invalid link"));
        if (!l || typeof l.id !== "string") fail("invalid", L("Ugyldig kobling", "Invalid link"));
        const key = `${l.kind}:${l.id}`;
        if (seen.has(key)) fail("invalid", L("Samme kobling to ganger", "The same link twice"));
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
            L(
              "Det lyden skal kobles til, finnes ikke",
              "The item the sound should be linked to does not exist",
            ),
          );
        links.push({ kind: l.kind, id: l.id });
      }
      const before = a.soundLinks ?? [];
      if (
        before.length === links.length &&
        before.every((x, i) => x.kind === links[i]!.kind && x.id === links[i]!.id)
      )
        fail("invalid", L("Ingen endring", "No change"));
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
      const a = need(s.assets[c.assetId], L("Ressursen", "The asset"));
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
        fail("invalid", L("Velg 1–500 ressurser", "Choose 1–500 assets"));
      const assets = { ...s.assets };
      const before: (typeof c.assetIds)[number][] = [];
      for (const id of new Set(c.assetIds)) {
        const a = need(s.assets[id], L("Ressursen", "The asset"));
        if ((a.removed === true) === c.removed) continue;
        const { removed: _r, ...rest } = a;
        assets[a.id] = { ...rest, ...(c.removed ? { removed: true } : {}), revision: rev(a) };
        before.push(a.id);
      }
      if (before.length === 0)
        fail(
          "invalid",
          c.removed ? L("Allerede slettet", "Already deleted") : L("Ikke slettet", "Not deleted"),
        );
      return {
        state: { ...s, assets },
        inverse: { type: "SetAssetsRemoved", assetIds: before, removed: !c.removed },
        affected: before,
      };
    }

    case "SetAssetVersionsRemoved": {
      if (!Array.isArray(c.versionIds) || c.versionIds.length === 0 || c.versionIds.length > 500)
        fail("invalid", L("Velg 1–500 bilder", "Choose 1–500 images"));
      const versions = { ...s.assetVersions };
      const before: (typeof c.versionIds)[number][] = [];
      for (const id of new Set(c.versionIds)) {
        const v = need(s.assetVersions[id], L("Bildet", "The image"));
        if ((v.removed === true) === c.removed) continue;
        // Det godkjente bildet kan ikke slettes: godkjenn et annet først (ellers ville scenene mistet det)
        if (c.removed && s.assetVariants[v.variantId]?.approvedVersionId === v.id)
          fail(
            "invalid",
            L(
              `v${v.number} er godkjent. Godkjenn et annet bilde først.`,
              `v${v.number} is approved. Approve another image first.`,
            ),
          );
        const { removed: _r, ...rest } = v;
        versions[v.id] = { ...rest, ...(c.removed ? { removed: true } : {}), revision: rev(v) };
        before.push(v.id);
      }
      if (before.length === 0)
        fail(
          "invalid",
          c.removed ? L("Allerede slettet", "Already deleted") : L("Ikke slettet", "Not deleted"),
        );
      return {
        state: { ...s, assetVersions: versions },
        inverse: { type: "SetAssetVersionsRemoved", versionIds: before, removed: !c.removed },
        affected: before,
      };
    }

    case "SetVersionView": {
      const v = need(s.assetVersions[c.versionId], L("Bildet", "The image"));
      if (c.view !== null && !isVersionView(c.view))
        fail("invalid", L("Ukjent vinkel", "Unknown angle"));
      if ((v.view ?? null) === c.view) fail("invalid", L("Uendret", "Unchanged"));
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
      const v = need(s.assetVersions[c.versionId], L("Opptaket", "The recording"));
      const va = s.assetVariants[v.variantId];
      if (s.assets[va?.assetId ?? ""]?.kind !== "sound" || v.durationMs === null)
        fail(
          "invalid",
          L("Bare lydopptak kan ha ordkobling", "Only audio recordings can have word alignment"),
        );
      if (c.alignment !== null) {
        const e = alignmentError(c.alignment);
        if (e) fail("invalid", e);
        if (!s.blocks[c.alignment.blockId])
          fail("invalid", L("Replikken finnes ikke", "The line does not exist"));
        if (c.alignment.words.some((w) => w.endMs !== null && w.endMs > v.durationMs! + 1000))
          fail(
            "invalid",
            L(
              "Et ord ligger etter slutten av opptaket",
              "A word is after the end of the recording",
            ),
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
      const a = need(s.assets[c.assetId], L("Ressursen", "The asset"));
      if (typeof c.text !== "string") fail("invalid", L("Ugyldig tekst", "Invalid text"));
      const text = c.text.replace(/\r\n?/g, "\n").trim();
      if (text.length > 4000)
        fail(
          "invalid",
          L(
            "Faktaarket er for langt (høyst 4000 tegn)",
            "The fact sheet is too long (at most 4,000 characters)",
          ),
        );
      if ((a.visualBrief ?? "") === text) fail("invalid", L("Uendret", "Unchanged"));
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
      const comp = need(s.compositions[c.compositionId], L("2D-scenen", "The 2D scene"));
      if (!Number.isInteger(c.step) || c.step < 1 || c.step > 4)
        fail(
          "invalid",
          L(
            "Velg 1–4 (hvert bilde, toere, treere eller firere)",
            "Choose 1–4 (every frame, twos, threes or fours)",
          ),
        );
      if ((comp.step ?? 1) === c.step) fail("invalid", L("Uendret", "Unchanged"));
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
      need(s.assets[c.assetId], L("Ressursen", "The asset"));
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
      const va = need(s.assetVariants[c.variantId], L("Varianten", "The variant"));
      if (Object.values(s.assetVersions).some((x) => x.variantId === va.id))
        fail(
          "referenced",
          L(
            "Varianten har bilder og kan ikke fjernes. Arkiver den i stedet.",
            "The variant has images and cannot be removed. Archive it instead.",
          ),
        );
      if (usedByPresentation(s, "variants", va.id))
        fail(
          "referenced",
          L(
            "Varianten brukes på en plakat og kan ikke fjernes.",
            "The variant is used on a poster and cannot be removed.",
          ),
        );
      if (usedByLayer(s, "assetVariantId", va.id))
        fail(
          "referenced",
          L(
            "Varianten brukes i en 2D-scene og kan ikke fjernes.",
            "The variant is used in a 2D scene and cannot be removed.",
          ),
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
      const va = need(s.assetVariants[c.variantId], L("Varianten", "The variant"));
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
      const va = need(s.assetVariants[c.variantId], L("Varianten", "The variant"));
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
      const va = need(s.assetVariants[c.variantId], L("Varianten", "The variant"));
      const m = c.media;
      if (
        !m ||
        typeof m.path !== "string" ||
        typeof m.mimeType !== "string" ||
        typeof m.sha256 !== "string" ||
        typeof c.note !== "string"
      )
        fail("invalid", L("Ufullstendige bildedata", "Incomplete image data"));
      if (!m.path.startsWith(`${s.project.id}/`) || m.path.length > 600 || m.path.includes(".."))
        fail("invalid", L("Ugyldig lagringssti for bildet", "Invalid storage path for the image"));
      const sound = s.assets[va.assetId]?.kind === "sound";
      if (c.alignment !== undefined) {
        if (!sound || !s.blocks[c.alignment.blockId]) fail("invalid", L("Ugyldig replikk for ordkobling", "Invalid line for word alignment"));
        const error = alignmentError(c.alignment);
        if (error) fail("invalid", error);
        const duration = m.durationMs;
        if (typeof duration !== "number" || c.alignment.words.some((w) => w.endMs !== null && w.endMs > duration + 1000))
          fail("invalid", L("Et ord ligger etter slutten av opptaket", "A word is after the end of the recording"));
      }
      if (sound) {
        if (!AUDIO_MIME_TYPES.includes(m.mimeType))
          fail(
            "invalid",
            L(
              "Lyden må være MP3, WAV, OGG, WebM, M4A/AAC eller FLAC",
              "The sound must be MP3, WAV, OGG, WebM, M4A/AAC or FLAC",
            ),
          );
        const d = m.durationMs ?? null;
        if (d !== null && (!Number.isInteger(d) || d <= 0 || d > AUDIO_MAX_MS))
          fail("invalid", L("Ugyldig lengde på lydfilen", "Invalid length of the audio file"));
        if (c.composition !== undefined) {
          const e = compositionError(c.composition, (id) => compositionSourceMs(s, id));
          if (e) fail("invalid", e);
        }
      } else if (c.composition !== undefined)
        fail(
          "invalid",
          L("Bare lyd kan ha en lydkomposisjon", "Only audio can have an audio composition"),
        );
      else if ((s.assets[va.assetId]?.kind === "template") !== (c.template !== undefined))
        fail(
          "invalid",
          L(
            "En mal må ha en maldefinisjon, og bare maler kan ha det",
            "A template must have a template definition, and only templates can have one",
          ),
        );
      else if (c.template !== undefined && templateError(c.template))
        fail("invalid", templateError(c.template)!);
      else if (!ASSET_MIME_TYPES.includes(m.mimeType))
        fail(
          "invalid",
          L("Bildet må være PNG, JPEG, WebP eller GIF", "The image must be PNG, JPEG, WebP or GIF"),
        );
      if (!Number.isInteger(m.byteSize) || m.byteSize <= 0 || m.byteSize > ASSET_MAX_BYTES)
        fail("invalid", L("Bildet er for stort (maks 2 GB)", "The image is too large (max 2 GB)"));
      if (!/^[0-9a-f]{64}$/.test(m.sha256))
        fail("invalid", L("Ugyldig kontrollsum", "Invalid checksum"));
      for (const d of [m.width, m.height])
        if (d !== null && (!Number.isInteger(d) || d <= 0 || d > 100_000))
          fail("invalid", L("Ugyldige bildemål", "Invalid image dimensions"));
      if (c.note.length > 2000)
        fail("invalid", L("Merknaden er for lang", "The annotation is too long"));
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
      const ver = need(s.assetVersions[c.versionId], L("Versjonen", "The version"));
      const va = s.assetVariants[ver.variantId];
      if (va?.approvedVersionId === ver.id)
        fail(
          "referenced",
          L(
            "Versjonen er godkjent og kan ikke fjernes",
            "The version is approved and cannot be removed",
          ),
        );
      if (usedByPresentation(s, "versions", ver.id))
        fail(
          "referenced",
          L(
            "Bildet brukes på en plakat eller som forbilde for filmens stil og kan ikke fjernes.",
            "The image is used on a poster or as a reference for the film's style and cannot be removed.",
          ),
        );
      if (usedByLayer(s, "versionId", ver.id))
        fail(
          "referenced",
          L(
            "Bildet brukes i en 2D-scene og kan ikke fjernes.",
            "The image is used in a 2D scene and cannot be removed.",
          ),
        );
      if (Object.values(s.takes).some((t) => t.kind === "still" && t.mediaRef === ver.mediaPath))
        fail(
          "referenced",
          L(
            "Bildet brukes som stillbilde i filmen og kan ikke fjernes.",
            "The image is used as a still in the film and cannot be removed.",
          ),
        );
      if (
        Object.values(s.layers).some((l) => l.reviewedVersions?.includes(ver.id)) ||
        Object.values(s.takes).some((t) => t.reviewedVersions?.includes(ver.id))
      )
        fail(
          "referenced",
          L(
            "Bildet er gått gjennom i arbeidslisten og kan ikke fjernes.",
            "The image has been through the worklist and cannot be removed.",
          ),
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
          L(
            "Opptaket brukes i en lydkomposisjon eller i en scene og kan ikke fjernes.",
            "The recording is used in an audio composition or in a scene and cannot be removed.",
          ),
        );
      // En malversjon som brukes av en forekomst, beholdes (MTS MT4, AJ)
      if (Object.values(s.templateInstances ?? {}).some((i) => i.templateVersionId === ver.id))
        fail(
          "referenced",
          L(
            "Malversjonen brukes i en scene og kan ikke fjernes.",
            "The template version is used in a scene and cannot be removed.",
          ),
        );
      // Bare det nyeste bildet kan angres bort (en versjon andre kan ha brukt, beholdes)
      if (
        Object.values(s.assetVersions).some(
          (x) => x.variantId === ver.variantId && x.number > ver.number,
        )
      )
        fail(
          "referenced",
          L(
            "Det er lastet opp nyere bilder etter dette. Det kan ikke fjernes.",
            "Newer images have been uploaded after this. It cannot be removed.",
          ),
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
          },
          note: ver.note,
          number: ver.number,
          ...(ver.composition ? { composition: ver.composition } : {}),
          ...(ver.alignment ? { alignment: ver.alignment } : {}),
          ...(ver.template ? { template: ver.template } : {}),
          ...(ver.globalSource ? { globalSource: ver.globalSource } : {}),
        },
        affected: [ver.id],
      };
    }

    // ---------- Notater i manus (DEC-0031) ----------
    case "AddAnnotations": {
      if (!Array.isArray(c.annotations) || c.annotations.length === 0)
        fail("invalid", L("Ingen notater å legge til", "No notes to add"));
      if (c.annotations.length > 2000)
        fail("invalid", L("For mange notater i én endring", "Too many notes in one change"));
      const annotations = { ...s.annotations };
      const ids: string[] = [];
      for (const n of c.annotations) {
        if (!n || typeof n.text !== "string" || typeof n.authorName !== "string")
          fail("invalid", L("Ufullstendige notatdata", "Incomplete note data"));
        assertNewId(s, n.annotationId);
        if (annotations[n.annotationId])
          fail("duplicate_id", L("Samme notat-ID to ganger", "The same note ID twice"));
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
        const a = need(s.annotations[id], L("Notatet", "The note"));
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
      const a = need(s.annotations[c.annotationId], L("Notatet", "The note"));
      const text = typeof c.text === "string" ? c.text.trim() : "";
      if (!text || text.length > 10_000)
        fail(
          "invalid",
          L(
            "Notatet må ha tekst (maks 10 000 tegn)",
            "The note must have text (max 10,000 characters)",
          ),
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
        fail("invalid", L("Ugyldig tidspunkt for endringen", "Invalid time for the change"));
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

    case "SetAnnotationResolved": {
      const a = need(s.annotations[c.annotationId], L("Notatet", "The note"));
      if (typeof c.resolved !== "boolean") fail("invalid", L("Ugyldig notatstatus", "Invalid note status"));
      return {
        state: { ...s, annotations: { ...s.annotations, [a.id]: { ...a, resolved: c.resolved, revision: rev(a) } } },
        inverse: { type: "SetAnnotationResolved", annotationId: a.id, resolved: a.resolved === true },
        affected: [a.id],
      };
    }

    case "SetAnnotationRemoved": {
      const a = need(s.annotations[c.annotationId], L("Notatet", "The note"));
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
      const va = need(s.assetVariants[c.variantId], L("Varianten", "The variant"));
      if (c.versionId !== null) {
        const ver = need(s.assetVersions[c.versionId], L("Versjonen", "The version"));
        if (ver.variantId !== va.id)
          fail(
            "invalid",
            L("Versjonen tilhører en annen variant", "The version belongs to another variant"),
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
          L(
            "Bredden må være et helt tall mellom 16 og 16384",
            "The width must be a whole number between 16 and 16384",
          ),
        );
      if (!Number.isInteger(c.height) || c.height < 16 || c.height > 16384)
        fail(
          "invalid",
          L(
            "Høyden må være et helt tall mellom 16 og 16384",
            "The height must be a whole number between 16 and 16384",
          ),
        );
      if (!isAllowedFps(c.fps)) fail("invalid", L("Ukjent bildefrekvens", "Unknown frame rate"));
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
        fail("invalid", L("Ingen endring", "No change"));
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
      need(s.variants[c.variantId], L("Scenen", "The scene"));
      if (Object.values(s.compositions).some((x) => x.variantId === c.variantId && !x.removed))
        fail("invalid", L("Scenen har allerede en 2D-scene", "The scene already has a 2D scene"));
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
      const comp = need(s.compositions[c.compositionId], L("2D-scenen", "The 2D scene"));
      if (Object.values(s.layers).some((l) => l.compositionId === comp.id))
        fail(
          "referenced",
          L(
            "2D-scenen har lag og kan ikke fjernes. Slett den i stedet.",
            "The 2D scene has layers and cannot be removed. Delete it instead.",
          ),
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
      const comp = need(s.compositions[c.compositionId], L("2D-scenen", "The 2D scene"));
      need(s.occurrences[c.occurrenceId], L("Scenen", "The scene"));
      if (c.steps.length === 0 || c.steps.length > MAX_SCENE_DRAFT_STEPS)
        fail("invalid", L("Ugyldig utkast for scenen", "Invalid scene draft"));
      let cur = s;
      const inverses: Command[] = [];
      const affected = new Set<string>();
      const rigImport = c.steps.some(step => step.type === "SaveRigVersion" || step.type === "UndoAnimationChange");
      for (const step of c.steps) {
        if (!SCENE_DRAFT_STEPS.has(step.type) && !(rigImport && RIG_IMPORT_STEPS.has(step.type)))
          fail("invalid", L("Ugyldig trinn i utkastet for scenen", "Invalid step in the scene draft"));
        if (step.type === "UpdateComposition" && step.compositionId !== comp.id)
          fail("invalid", L("Feil 2D-scene", "Wrong 2D scene"));
        if (
          step.type === "UpdateLayers" &&
          step.layers.some((x) => cur.layers[x.layerId]?.compositionId !== comp.id)
        )
          fail("invalid", L("Laget hører ikke til scenen", "The layer does not belong to the scene"));
        if (["CreateAssetVariant", "AddAssetVersion", "UndoCreateAssetVariant", "UndoAddAssetVersion"].includes(step.type)) {
          const allowedAssets = new Set(Object.values(cur.layers).filter(l => !l.removed && l.compositionId === comp.id).map(l => l.assetId));
          const assetId = step.type === "CreateAssetVariant" ? step.assetId : step.type === "AddAssetVersion" || step.type === "UndoCreateAssetVariant" ? cur.assetVariants[step.variantId]?.assetId : step.type === "UndoAddAssetVersion" ? cur.assetVariants[cur.assetVersions[step.versionId]?.variantId ?? ""]?.assetId : undefined;
          if (!assetId || !allowedAssets.has(assetId)) fail("invalid", L("Rigg-delen tilhører ikke scenen", "The rig part does not belong to the scene"));
        }
        if (step.type === "AttachAnimationUse" && (step.occurrenceId !== c.occurrenceId || cur.layers[step.layerId]?.compositionId !== comp.id)) fail("invalid", L("Feil scene for animasjonsbruken", "Wrong scene for the animation use"));
        if (step.type === "SetAnimationLayerEnabled" && cur.animationUses[step.useId]?.occurrenceId !== c.occurrenceId) fail("invalid", L("Feil scene for animasjonsbruken", "Wrong scene for the animation use"));
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
      const comp = need(s.compositions[c.compositionId], L("2D-scenen", "The 2D scene"));
      need(s.occurrences[c.occurrenceId], L("Scenen", "The scene"));
      if (c.steps.length === 0 || c.steps.length > 20)
        fail("invalid", L("Ugyldig endring av scenevarighet", "Invalid scene duration change"));
      let cur = s;
      const inverses: Command[] = [];
      const affected = new Set<string>();
      for (const step of c.steps) {
        if (!RETIME_STEPS.has(step.type))
          fail(
            "invalid",
            L("Ugyldig trinn i endring av scenevarighet", "Invalid step in scene duration change"),
          );
        if (step.type === "UpdateComposition" && step.compositionId !== comp.id)
          fail("invalid", L("Feil 2D-scene", "Wrong 2D scene"));
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
      const comp = need(s.compositions[c.compositionId], L("2D-scenen", "The 2D scene"));
      // Formatet endres bare samlet for prosjektet (SetProjectFormat, DEC-0039)
      const fields = compositionFields({ ...c.fields, width: comp.width, height: comp.height });
      let camera = comp.camera;
      if (c.camera !== undefined) {
        const r = normalizeCamera(c.camera);
        if (!r.ok) fail("invalid", r.error);
        if (JSON.stringify(r.value).length > MAX_CAMERA_JSON)
          fail("invalid", L("Kameraet er for stort", "The camera is too large"));
        camera = r.value;
      }
      let timing = comp.timing;
      if (c.timing !== undefined) {
        const r = normalizeTiming(c.timing);
        if (!r.ok) fail("invalid", r.error);
        if (JSON.stringify(r.value).length > 60000)
          fail("invalid", L("Tidsoppsettet er for stort", "The timing is too large"));
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
      const comp = need(s.compositions[c.compositionId], L("2D-scenen", "The 2D scene"));
      if (
        !c.removed &&
        Object.values(s.compositions).some(
          (x) => x.id !== comp.id && x.variantId === comp.variantId && !x.removed,
        )
      )
        fail(
          "invalid",
          L("Scenen har allerede en annen 2D-scene", "The scene already has another 2D scene"),
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
      const comp = need(s.compositions[f.compositionId], L("2D-scenen", "The 2D scene"));
      if (comp.removed) fail("invalid", L("2D-scenen er slettet", "The 2D scene has been deleted"));
      const ver = need(s.assetVersions[f.templateVersionId], L("Malversjonen", "The template version"));
      const asset = s.assets[f.templateAssetId];
      if (!asset || asset.kind !== "template" || !ver.template || s.assetVariants[ver.variantId]?.assetId !== asset.id)
        fail("invalid", L("Versjonen er ikke en mal", "The version is not a template"));
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
      const inst = need(s.templateInstances[c.instanceId], L("Malforekomsten", "The template instance"));
      if (Object.values(s.layers).some((l) => l.template?.instanceId === inst.id))
        fail("referenced", L("Malforekomsten har lag", "The template instance has layers"));
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
      const inst = need(s.templateInstances[c.instanceId], L("Malforekomsten", "The template instance"));
      const ver = need(s.assetVersions[c.fields.templateVersionId], L("Malversjonen", "The template version"));
      if (!ver.template || s.assetVariants[ver.variantId]?.assetId !== inst.templateAssetId)
        fail("invalid", L("Versjonen hører til en annen mal", "The version belongs to another template"));
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
        fail("invalid", L("Ugyldig malendring", "Invalid template change"));
      let cur = s;
      const inverses: Command[] = [];
      const affected = new Set<string>();
      for (const step of c.steps) {
        if (!TEMPLATE_STEPS.has(step.type))
          fail("invalid", L("Ugyldig trinn i malendringen", "Invalid step in the template change"));
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
          fail("invalid", L("Laget peker på en ukjent malforekomst", "The layer refers to an unknown template instance"));
      }
      return {
        state: oneRevisionPerRow(s, cur),
        inverse: { type: "ApplyTemplate", steps: inverses },
        affected: [...affected],
      };
    }

    case "AddLayers": {
      if (c.layers.length === 0) fail("invalid", L("Ingen lag å legge til", "No layers to add"));
      if (c.layers.length > 500)
        fail(
          "invalid",
          L("For mange lag på én gang (maks 500)", "Too many layers at once (max 500)"),
        );
      const layers = { ...s.layers };
      const ids = new Set<string>();
      for (const n of c.layers) {
        assertNewId(s, n.layerId);
        if (ids.has(n.layerId))
          fail(
            "duplicate_id",
            L(`ID ${n.layerId} er brukt to ganger`, `ID ${n.layerId} is used twice`),
          );
        ids.add(n.layerId);
        const comp = need(s.compositions[n.compositionId], L("2D-scenen", "The 2D scene"));
        if (comp.removed)
          fail("invalid", L("2D-scenen er slettet", "The 2D scene has been deleted"));
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
            L("Ugyldig plassering i lagrekkefølgen", "Invalid position in the layer order"),
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
        const l = need(s.layers[id], L("Laget", "The layer"));
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
      if (c.layers.length === 0) fail("invalid", L("Ingen lag å endre", "No layers to change"));
      if (new Set(c.layers.map((x) => x.layerId)).size !== c.layers.length)
        fail("invalid", L("Samme lag er med to ganger", "The same layer is included twice"));
      const layers = { ...s.layers };
      const before: { layerId: CompositionLayer["id"]; fields: LayerFields }[] = [];
      for (const u of c.layers) {
        const l = need(s.layers[u.layerId], L("Laget", "The layer"));
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
      const l = need(s.layers[c.layerId], L("Laget", "The layer"));
      const keys = sortedLayerKeys(s, l.compositionId, l.id);
      let orderKey: string;
      if (c.beforeLayerId === null) {
        orderKey = keyBetween(keys[keys.length - 1] ?? null, null);
      } else {
        const target = need(
          s.layers[c.beforeLayerId],
          L("Laget det skal flyttes bak", "The layer to move behind"),
        );
        if (target.compositionId !== l.compositionId || target.id === l.id)
          fail(
            "invalid",
            L(
              "Lagene hører ikke til samme 2D-scene",
              "The layers do not belong to the same 2D scene",
            ),
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
      if (c.layerIds.length === 0) fail("invalid", L("Ingen lag valgt", "No layers selected"));
      const layers = { ...s.layers };
      const changed = [...new Set(c.layerIds)]
        .map((id) => need(s.layers[id], L("Laget", "The layer")))
        .filter((l) => l.removed !== c.removed);
      if (changed.length === 0) fail("invalid", L("Ingen endring", "No change"));
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
        fail("invalid", L("Ingen lyd å legge til", "No audio to add"));
      if (c.clips.length > 500)
        fail(
          "invalid",
          L("For mange lydklipp på én gang (maks 500)", "Too many audio clips at once (max 500)"),
        );
      const audioClips = { ...s.audioClips };
      const ids = new Set<string>();
      for (const n of c.clips) {
        assertNewId(s, n.clipId);
        if (ids.has(n.clipId))
          fail(
            "duplicate_id",
            L(`ID ${n.clipId} er brukt to ganger`, `ID ${n.clipId} is used twice`),
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
        const a = need(s.audioClips[id], L("Lydklippet", "The audio clip"));
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
              L(
                "Replikken har flere lydversjoner eller leppesynk. Ingen versjon slettes; angre dem først.",
                "The line has several audio versions or lip sync. No version is deleted; undo them first.",
              ),
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
        fail("invalid", L("Ingen lyd å endre", "No audio to change"));
      if (new Set(c.clips.map((x) => x.clipId)).size !== c.clips.length)
        fail(
          "invalid",
          L("Samme lydklipp er med to ganger", "The same audio clip is included twice"),
        );
      const audioClips = { ...s.audioClips };
      const dialogueVersions: Record<string, DialogueVersion> = { ...s.dialogueVersions };
      const before: { clipId: AudioClip["id"]; fields: AudioClipFields }[] = [];
      const beforeActive: Record<string, string> = {};
      const created: string[] = [];
      const restored: string[] = [];
      const touchedVersions: string[] = [];
      for (const u of c.clips) {
        const a = need(s.audioClips[u.clipId], L("Lydklippet", "The audio clip"));
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
          fail("referenced", L("Lydversjonen er aktiv og slettes ikke", "The audio version is active and is not deleted"), [id]);
        if (Object.values(s.lipsyncResults).some((r) => r.dialogueVersionId === id))
          fail("referenced", L("Lydversjonen har leppesynk og slettes ikke", "The audio version has lip sync and is not deleted"), [id]);
        delete dialogueVersions[id];
      }
      const reRemoved: string[] = [];
      for (const id of c.reRemoveDialogueVersions ?? []) {
        const v = dialogueVersions[id];
        if (!v || v.removed) continue;
        if (Object.values(audioClips).some((x) => x.activeVersionId === id))
          fail("referenced", L("Lydversjonen er aktiv og slettes ikke", "The audio version is active and is not deleted"), [id]);
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
      const a = need(s.audioClips[c.clipId], L("Replikken", "The line"));
      if (!isVersionedKind(a))
        fail("invalid", L("Bare replikker har lydversjoner", "Only lines have audio versions"));
      assertNewId(s, c.dialogueVersionId);
      const v = dialogueVersionFields(s, a, c.fields);
      const prev = activeDialogueVersion(s, a);
      // Et klipp uten versjon ennå (før backfill) får aldri en versjon som overskriver redigeringen i klippet
      if (!prev)
        fail(
          "invalid",
          L("Replikken har ingen lydversjon ennå. Last prosjektet på nytt.", "The line has no audio version yet. Reload the project."),
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
      const v = need(s.dialogueVersions[c.dialogueVersionId], L("Lydversjonen", "The audio version"));
      const a = need(s.audioClips[v.clipId], L("Replikken", "The line"));
      if (Object.values(s.lipsyncResults).some((r) => r.dialogueVersionId === v.id))
        fail("referenced", L("Lydversjonen har leppesynk. Angre leppesynket først.", "The audio version has lip sync. Undo the lip sync first."), [v.id]);
      const wasActive = a.activeVersionId === v.id;
      let clip = a;
      if (wasActive) {
        const back = c.restoreActiveId ? s.dialogueVersions[c.restoreActiveId] : undefined;
        if (!back || back.clipId !== a.id)
          fail("invalid", L("Den forrige lydversjonen finnes ikke", "The previous audio version was not found"));
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
      const a = need(s.audioClips[c.clipId], L("Replikken", "The line"));
      const v = need(s.dialogueVersions[c.dialogueVersionId], L("Lydversjonen", "The audio version"));
      if (v.clipId !== a.id)
        fail("invalid", L("Lydversjonen hører til en annen replikk", "The audio version belongs to another line"));
      if (v.removed) fail("invalid", L("Lydversjonen er slettet", "The audio version is deleted"));
      const prev = a.activeVersionId ?? null;
      if (prev === v.id) fail("invalid", L("Ingen endring", "No change"));
      if (!prev) fail("invalid", L("Replikken har ingen aktiv lydversjon", "The line has no active audio version"));
      return {
        state: { ...s, audioClips: { ...s.audioClips, [a.id]: { ...a, activeVersionId: v.id, revision: rev(a) } } },
        inverse: { type: "SetActiveDialogueVersion", clipId: a.id, dialogueVersionId: prev },
        affected: [a.id],
      };
    }

    case "UpdateDialogueVersionEdit": {
      const v = need(s.dialogueVersions[c.dialogueVersionId], L("Lydversjonen", "The audio version"));
      const a = need(s.audioClips[v.clipId], L("Replikken", "The line"));
      const edit = dialogueEditFields(s, a, v, c.edit);
      return {
        state: { ...s, dialogueVersions: { ...s.dialogueVersions, [v.id]: { ...v, ...edit, revision: rev(v) } } },
        inverse: { type: "UpdateDialogueVersionEdit", dialogueVersionId: v.id, edit: editOf(v) },
        affected: [v.id],
      };
    }

    case "MoveDialogueLine": {
      const a = need(s.audioClips[c.clipId], L("Replikken", "The line"));
      if (!Number.isInteger(c.offsetMs) || c.offsetMs < 0 || c.offsetMs > AUDIO_MAX_MS)
        fail("invalid", L("Ugyldig plassering", "Invalid position"));
      if (c.offsetMs === a.offsetMs) fail("invalid", L("Ingen endring", "No change"));
      const clash = dialogueOverlaps(s, a.id, c.offsetMs);
      if (clash.length && !c.allowOverlap)
        fail(
          "invalid",
          L(
            "Replikken ville overlappe en annen replikk fra samme karakter. Ingen andre replikker flyttes.",
            "The line would overlap another line by the same character. No other lines are moved.",
          ),
          clash,
        );
      return {
        state: { ...s, audioClips: { ...s.audioClips, [a.id]: { ...a, offsetMs: c.offsetMs, revision: rev(a) } } },
        inverse: { type: "MoveDialogueLine", clipId: a.id, offsetMs: a.offsetMs, allowOverlap: true },
        affected: [a.id],
      };
    }

    case "SetDialogueVersionRemoved": {
      const v = need(s.dialogueVersions[c.dialogueVersionId], L("Lydversjonen", "The audio version"));
      if (typeof c.removed !== "boolean" || v.removed === c.removed) fail("invalid", L("Ingen endring", "No change"));
      if (c.removed && s.audioClips[v.clipId]?.activeVersionId === v.id)
        fail("invalid", L("Den aktive versjonen kan ikke slettes. Velg en annen først.", "The active version cannot be deleted. Choose another first."));
      return {
        state: { ...s, dialogueVersions: { ...s.dialogueVersions, [v.id]: { ...v, removed: c.removed, revision: rev(v) } } },
        inverse: { type: "SetDialogueVersionRemoved", dialogueVersionId: v.id, removed: !c.removed },
        affected: [v.id],
      };
    }

    case "SetAudioClipsRemoved": {
      if (!Array.isArray(c.clipIds) || c.clipIds.length === 0)
        fail("invalid", L("Ingen lyd valgt", "No audio selected"));
      const audioClips = { ...s.audioClips };
      const changed = [...new Set(c.clipIds)]
        .map((id) => need(s.audioClips[id], L("Lydklippet", "The audio clip")))
        .filter((a) => a.removed !== c.removed);
      if (changed.length === 0) fail("invalid", L("Ingen endring", "No change"));
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
            message: L(
              "Noen andre har endret dette i mellomtiden",
              "Someone else has changed this in the meantime",
            ),
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
            ? L(
                "Det finnes et notat på denne teksten. Slett notatet først hvis endringen skal angres.",
                "There is a note on this text. Delete the note first if the change is to be undone.",
              )
            : L(
                `Det finnes ${visible.length} notater på denne teksten. Slett notatene først hvis endringen skal angres.`,
                `There are ${visible.length} notes on this text. Delete the notes first if the change is to be undone.`,
              ),
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
          L(
            "Scenen har en 2D-scene i sceneeditoren og kan ikke fjernes. Slett 2D-scenen først.",
            "The scene has a 2D scene in the scene editor and cannot be removed. Delete the 2D scene first.",
          ),
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
          L(
            "Ressursen er brukt i en 2D-scene og kan ikke fjernes. Arkiver den i stedet.",
            "The asset is used in a 2D scene and cannot be removed. Archive it instead.",
          ),
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
          L(
            "Det ligger lyd på dette i filmen. Fjern lyden først hvis endringen skal angres.",
            "There is sound on this in the film. Remove the sound first if the change is to be undone.",
          ),
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
          L(
            "Scenen er klippet eller har tidskoblinger i monteringen, så dette kan ikke angres.",
            "The scene is cut or has time links in the assembly, so this cannot be undone.",
          ),
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
          L(
            "Det er registrert kontinuitet (utseende) på dette. Fjern hendelsen først hvis endringen skal angres.",
            "Continuity (appearance) has been recorded for this. Remove the event first if the change is to be undone.",
          ),
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
          L(
            "Teksten har oversettelser (for eksempel engelsk). Angre importen av oversettelsen eller fjern oversettelsene av disse linjene først.",
            "The text has translations (for example English). Undo the import of the translation or remove the translations of these lines first.",
          ),
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
          L(
            "Replikken har lydversjoner som ikke kan fjernes. Ingen lydversjon slettes.",
            "The line has audio versions that cannot be removed. No audio version is deleted.",
          ),
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
          message: L(
            "Endringen ville brutt en systemregel",
            "The change would break a system rule",
          ),
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
  const a = need(s.assets[assetId], L("Karakteren", "The character"));
  if (a.removed) fail("invalid", L("Karakteren er fjernet", "The character has been removed"));
  if (!canHaveStoryProfile(a.kind))
    fail(
      "invalid",
      L(
        "Bare karakterer og dyr kan ha en profil i Story Lab",
        "Only characters and animals can have a profile in Story Lab",
      ),
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
      L(
        "Karakteren har allerede et stadium fra denne scenen",
        "The character already has a stage from this scene",
      ),
    );
}

function factFieldsOf(f: import("../model").StoryFact): StoryFactFields {
  return { text: f.text, kind: f.kind, atSceneId: f.atSceneId, knownBy: f.knownBy };
}

function storyFactFieldsOf(s: ProjectState, f: StoryFactFields): StoryFactFields {
  const e = factError(f);
  if (e) fail("invalid", e);
  if (f.atSceneId !== null) need(s.scenes[f.atSceneId], L("Scenen", "The scene"));
  for (const k of f.knownBy) {
    storyAsset(s, k.assetId);
    if (k.fromSceneId !== null) need(s.scenes[k.fromSceneId], L("Scenen", "The scene"));
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
      fail("invalid", L("En gruppe kan ikke ligge i seg selv", "A group cannot contain itself"));
    const g = need(s.canvasNodes[n.groupId], L("Gruppen", "The group"));
    if (g.kind !== "group")
      fail("invalid", L("Gruppen må være en gruppenode", "The group must be a group node"));
  }
  if (n.assetId !== null) need(s.assets[n.assetId], L("Ressursen", "The asset"));
  if (n.sceneId !== null) need(s.scenes[n.sceneId], L("Scenen", "The scene"));
}

function canvasEdgeFieldsOf(
  s: ProjectState,
  f: import("../model").CanvasEdgeFields,
  allowRemoved = false,
): import("../model").CanvasEdgeFields {
  const e = canvasEdgeError(f);
  if (e) fail("invalid", e);
  const a = need(s.canvasNodes[f.fromNodeId], L("Noden", "The node"));
  const b = need(s.canvasNodes[f.toNodeId], L("Noden", "The node"));
  if (!allowRemoved && (a.removed || b.removed))
    fail("invalid", L("Noden er fjernet", "The node has been removed"));
  return { fromNodeId: f.fromNodeId, toNodeId: f.toNodeId, label: f.label, kind: f.kind };
}
