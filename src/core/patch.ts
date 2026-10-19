import type { AnimationRig, AnimationRigVersion, AnimationUse } from "./animation/rig";
import type { LipsyncResult } from "./animation/lipsync";
import type { DialogueVersion } from "./dialogue/versions";
import type { AnimationPattern } from "./animation/patterns";
/**
 * Endringssett mellom to tilstander (DEC-0022). Serveren kjører kommandoen i kjernen og sender
 * endringssettet til databasen, som lagrer alt atomisk og avviser det hvis noen rad har fått ny
 * revisjon i mellomtiden (INV-C1). Radformatet (snake_case) er lagringsformatet i DATA_RELATIONSHIPS.md.
 */
import type {
  ClipPart,
  ContinuityEvent,
  Translation,
  GenerationPrompt,
  TimeLink,
  TakeMedia,
  Transition,
  Annotation,
  Asset,
  AssetName,
  AssetVariant,
  AssetVersion,
  AudioClip,
  BlockRevision,
  CollectionName,
  Composition,
  CompositionLayer,
  LanguageImage,
  LayerMask,
  BlendMode,
  AssetRelation,
  Poster,
  StyleGuide,
  StyleProfile,
  StoryCharacterProfile,
  StoryProfileStage,
  StoryFact,
  CanvasNode,
  CanvasEdge,
  TemplateInstance,
  CreditParticipant,
  CreditSequence,
  PosterDocument,
  PosterKind,
  RelationKind,
  Production,
  ProductionSegment,
  ProjectState,
  Scene,
  SceneOccurrence,
  SceneVariant,
  OccurrenceKind,
  ScriptBlock,
  Take,
  TransitionKind,
} from "./model";
import { COLLECTION_TABLES, CONTINUITY_KINDS, RELATION_KINDS, TRANSITION_KINDS } from "./model";
import type {
  AssetVoice,
  ExportSettings,
  ProducedFrom,
  ContinuityDuration,
  ContinuityKind,
  SoundLinkKind,
  StyleUse,
  TakeCoverage,
} from "./model";
import { isVersionView } from "./library/view";
import { isAudioComposition, type AudioComposition } from "./audio/composition";
import { ALIGNMENT_FORMAT, type WordAlignment } from "./audio/alignment";

/** En lagret ordkobling (formen er kontrollert da den ble lagret). */
function isAlignment(v: unknown): v is WordAlignment {
  return (
    !!v &&
    typeof v === "object" &&
    (v as { format?: unknown }).format === ALIGNMENT_FORMAT &&
    Array.isArray((v as { words?: unknown }).words)
  );
}

/** En lagret lydkomposisjon (formen er kontrollert da den ble lagret). */
function isComposition(v: unknown): v is AudioComposition {
  return isAudioComposition(v);
}
import type { DurationAssumptions } from "./screenplay/duration";
import {
  EMPTY_TIMING,
  isEmptyTiming,
  normalizeTiming,
  type CompositionTiming,
} from "./composition/timing";

export type Row = Record<string, unknown>;

export interface ChangeSet {
  /** Nye rader per tabell. */
  readonly inserts: Readonly<Record<string, readonly Row[]>>;
  /** Endrede rader per tabell; `revision` i raden er NY revisjon, `expected_revision` er den gamle. */
  readonly updates: Readonly<Record<string, readonly Row[]>>;
  /** Fjernede rader (bare ved angre av opprettelse) med forventet revisjon. */
  readonly deletes: Readonly<Record<string, readonly { id: string; expected_revision: number }[]>>;
  /** Nye blokkrevisjoner (uforanderlig historikk). */
  readonly blockRevisions: readonly Row[];
}

type AnyEntity = AnimationRig | AnimationRigVersion | AnimationUse
  | TemplateInstance
  | CreditParticipant
  | CreditSequence
  | Production
  | Scene
  | SceneVariant
  | ScriptBlock
  | SceneOccurrence
  | ProductionSegment
  | ClipPart
  | TimeLink
  | GenerationPrompt
  | ContinuityEvent
  | Translation
  | Take
  | Asset
  | AssetVariant
  | AssetVersion
  | Annotation
  | Composition
  | CompositionLayer
  | AudioClip
  | AssetRelation
  | Poster
  | StyleProfile
  | StoryCharacterProfile
  | StoryProfileStage
  | StoryFact
  | CanvasNode
  | CanvasEdge;

export function toRow(collection: CollectionName, e: AnyEntity, projectId: string): Row {
  const base = { id: e.id, project_id: projectId, revision: e.revision };
  switch (collection) {
    case "productions": {
      const p = e as Production;
      return {
        ...base,
        kind: p.kind,
        name: p.name,
        parent_production_id: p.parentProductionId,
        fps_num: p.fps.num,
        fps_den: p.fps.den,
        // Migrasjon 0027 (DEC-0072); ignoreres av apply_changes før den er kjørt
        export_settings: p.exportSettings ?? null,
        // Migrasjon 0031 (DEC-0082)
        description: p.note ?? "",
      };
    }
    case "scenes": {
      const sc = e as Scene;
      return {
        ...base,
        origin_production_id: sc.originProductionId,
        story_kind: sc.storyTime.kind,
        story_anchor_scene_id: sc.storyTime.anchorSceneId,
        story_offset: sc.storyTime.offset,
        derived_from_scene_id: sc.derivedFromSceneId,
        merged_into_scene_id: sc.mergedIntoSceneId,
      };
    }
    case "variants": {
      const v = e as SceneVariant;
      return {
        ...base,
        scene_id: v.sceneId,
        owner_production_id: v.ownerProductionId,
        based_on_variant_id: v.basedOnVariantId,
        heading_int_ext: v.heading.intExt,
        heading_location: v.heading.location,
        heading_time: v.heading.time,
        uncertainty: v.uncertainty,
      };
    }
    case "blocks": {
      const b = e as ScriptBlock;
      return {
        ...base,
        variant_id: b.variantId,
        kind: b.kind,
        order_key: b.orderKey,
        current_rev: b.currentRev,
        text: b.text,
        language: b.language,
        source_ref: b.sourceRef,
        uncertainty: b.uncertainty,
        removed: b.removed,
      };
    }
    case "occurrences": {
      const o = e as SceneOccurrence;
      return {
        ...base,
        production_id: o.productionId,
        scene_id: o.sceneId,
        variant_id: o.variantId,
        order_key: o.orderKey,
        active: o.active,
        excerpt_in: o.excerpt?.inFrame ?? null,
        excerpt_out: o.excerpt?.outFrame ?? null,
        active_take_id: o.activeTakeId,
        production_number: o.productionNumber,
        transition_kind: transitionKindToDb(o.transition?.kind ?? "cut"),
        transition_frames: o.transition?.frames ?? 0,
        // Migrasjon 0013 (DEC-0051); ukjente kolonner hoppes over av apply_changes før den er kjørt
        transition_custom: o.transition !== undefined,
        transition_overlap: o.transition?.overlap ?? false,
        monochrome: o.monochrome ?? false,
        // Migrasjon 0023; ukjente kolonner hoppes over av apply_changes før den er kjørt
        planned_ms: o.plannedMs ?? null,
        // Migrasjon 0032 (DEC-0083); ukjente kolonner hoppes over av apply_changes før den er kjørt
        video_instructions: o.videoInstructions ?? "",
        // Migrasjon 0050 (MTS MT6); ukjente kolonner hoppes over av apply_changes før den er kjørt
        kind: o.kind ?? "scene",
      };
    }
    case "segments": {
      const g = e as ProductionSegment;
      return {
        ...base,
        occurrence_id: g.occurrenceId,
        reason: g.reason,
        order_key: g.orderKey,
        start_block_id: g.startBlockId,
        end_block_id: g.endBlockId,
        ...(g.startMs !== undefined ? { start_ms: g.startMs, end_ms: g.endMs ?? null } : {}),
      };
    }
    case "takes": {
      const t = e as Take;
      return {
        ...base,
        occurrence_id: t.occurrenceId,
        segment_id: t.segmentId,
        kind: t.kind,
        status: t.status,
        duration_frames: t.durationFrames,
        produced_from: t.producedFrom,
        media_ref: t.mediaRef,
        metadata: t.media ?? {},
        // Godkjent grunnlag (migrasjon 0014; ignoreres før). Tomt = som produced_from.
        accepted_from: t.acceptedFrom ?? {},
        // Dialogen i filmlyden (migrasjon 0017, DEC-0059)
        audio_language: t.audioLanguage ?? null,
        // Manusdekning (migrasjon 0026, DEC-0071)
        coverage: t.coverage ?? null,
        // Arbeidslisten (migrasjon 0027, DEC-0072)
        reviewed_versions: t.reviewedVersions ?? [],
      };
    }
    case "assets": {
      const a = e as Asset;
      return {
        ...base,
        kind: a.kind,
        name: a.name,
        names: a.names,
        description: a.description,
        category: a.category,
        tags: a.tags,
        archived: a.archived,
        // Lydkoblinger (migrasjon 0025, DEC-0070); ukjente kolonner ignoreres før migrasjonen
        sound_links: a.soundLinks ?? [],
        // Migrasjon 0026 (DEC-0071)
        context_names: a.contextNames ?? [],
        // Migrasjon 0034 (DEC-0088)
        scene_plans: a.scenePlans ?? [],
        voice: a.voice ?? null,
        // Migrasjon 0029 (DEC-0079)
        removed: a.removed === true,
        // Migrasjon 0030 (DEC-0080)
        visual_brief: a.visualBrief ?? "",
        // Migrasjon 0046 (GP2): kobling til det globale biblioteket
        source_global_asset_id: a.globalAssetId ?? null,
      };
    }
    case "assetVariants": {
      const v = e as AssetVariant;
      return {
        ...base,
        asset_id: v.assetId,
        name: v.name,
        style: v.style,
        appearance: v.appearance,
        approved_version_id: v.approvedVersionId,
        archived: v.archived,
      };
    }
    case "assetVersions": {
      // created_at og created_by settes av databasen (apply_changes)
      const v = e as AssetVersion;
      return {
        ...base,
        variant_id: v.variantId,
        number: v.number,
        media_path: v.mediaPath,
        mime_type: v.mimeType,
        width: v.width,
        height: v.height,
        // byte_size (integer) er utgått etter 0005/0006; størrelsen lagres i byte_size_big
        byte_size_big: v.byteSize,
        sha256: v.sha256,
        note: v.note,
        // Lengde (bare lydfiler). Kolonnen finnes fra migrasjon 0009; apply_changes ser bort fra
        // felter tabellen ikke har, så eldre databaser tåler den
        duration_ms: v.durationMs,
        // Migrasjon 0029 (DEC-0079)
        removed: v.removed === true,
        // Migrasjon 0030 (DEC-0080)
        view: v.view ?? null,
        // Migrasjon 0036 (DEC-0094): lydkomposisjonen versjonen er miksen av
        composition: v.composition ?? null,
        // Migrasjon 0037 (DEC-0095): ord-til-lyd
        alignment: v.alignment ?? null,
        // Migrasjon 0046 (GP2)
        source_global_asset_id: v.globalSource?.assetId ?? null,
        source_global_variant_id: v.globalSource?.variantId ?? null,
        source_global_version_id: v.globalSource?.versionId ?? null,
        // Migrasjon 0049 (MTS MT4): maldefinisjonen
        template_spec: v.template ?? null,
      };
    }
    case "annotations": {
      const n = e as Annotation;
      return {
        ...base,
        variant_id: n.variantId,
        block_id: n.blockId,
        range_start: n.start,
        range_end: n.end,
        quote: n.quote,
        text: n.text,
        author_name: n.authorName,
        stamp_at: n.stampAt,
        edited_by_name: n.editedByName,
        edited_at: n.editedAt,
        removed: n.removed,
        resolved: n.resolved === true,
        // Migrasjon 0034 (DEC-0088)
        source: n.source ?? "user",
        task_id: n.taskId ?? null,
        // Migrasjon 0044 (AS3)
        kind: n.kind ?? "note",
        suggested_text: n.kind ? (n.suggestedText ?? "") : null,
      };
    }
    case "compositions": {
      const c = e as Composition;
      return {
        ...base,
        variant_id: c.variantId,
        name: c.name,
        width: c.width,
        height: c.height,
        duration_frames: c.durationFrames,
        background: c.background,
        camera: c.camera,
        removed: c.removed,
        // Alltid med (også tomt), så et tilbakestilt grunnlag lagres (migrasjon 0014; ignoreres før)
        produced_from: c.producedFrom ?? {},
        // Migrasjon 0029 (DEC-0079)
        step: c.step ?? 1,
        // Migrasjon 0042 (SV1): alltid med, så en tilbakestilling lagres
        timing: c.timing ?? EMPTY_TIMING,
      };
    }
    case "layers": {
      const l = e as CompositionLayer;
      return {
        ...base,
        composition_id: l.compositionId,
        order_key: l.orderKey,
        kind: l.kind,
        name: l.name,
        asset_id: l.assetId,
        asset_variant_id: l.assetVariantId,
        version_id: l.versionId,
        fill: l.fill,
        width: l.width,
        height: l.height,
        parallax: l.parallax,
        transform: l.transform,
        keyframes: l.keyframes,
        visible: l.visible,
        locked: l.locked,
        group_id: l.groupId,
        // Migrasjon 0013 (DEC-0052); ukjente kolonner hoppes over av apply_changes før den er kjørt
        image_swaps: l.swaps,
        motion_path: l.path,
        anchor: l.anchor,
        // Migrasjon 0017 (DEC-0059)
        language_images: l.languageImages ?? [],
        // Migrasjon 0026 (REQ-0175)
        mask: l.mask ?? null,
        blend: l.blend ?? "normal",
        // Migrasjon 0027 (DEC-0072)
        reviewed_versions: l.reviewedVersions ?? [],
        // Migrasjon 0043 (AS2): aktivt tidsområde
        active_from: l.activeRange ? l.activeRange.from : null,
        active_to: l.activeRange ? l.activeRange.to : null,
        // Migrasjon 0048 (MTS): tekst, form, effekter og malfelt
        text_spec: l.text ?? null,
        shape: l.shape ?? null,
        effects: l.effects ?? null,
        template_instance_id: l.template ? l.template.instanceId : null,
        template_key: l.template ? l.template.key : null,
        template_slot: l.template ? l.template.slot : null,
        // Migrasjon 0050 (MTS MT6): overgangen inn i siden (bare sidelag)
        page_transition: l.pageTransition ?? null,
        removed: l.removed,
      };
    }
    case "audioClips": {
      const a = e as AudioClip;
      return {
        ...base,
        occurrence_id: a.occurrenceId,
        kind: a.kind,
        name: a.name,
        asset_id: a.assetId,
        asset_variant_id: a.assetVariantId,
        version_id: a.versionId,
        block_id: a.blockId,
        offset_ms: a.offsetMs,
        source_in_ms: a.sourceInMs,
        length_ms: a.lengthMs,
        gain_db: a.gainDb,
        fade_in_ms: a.fadeInMs,
        fade_out_ms: a.fadeOutMs,
        muted: a.muted,
        // Fra migrasjon 0010 (apply_changes ser bort fra kolonner tabellen ikke har ennå)
        continues: a.continues,
        volume_keys: a.volumeKeys,
        // Migrasjon 0017 (DEC-0059): null = standard for lydtypen
        language: a.language ?? null,
        // Migrasjon 0029 (DEC-0079)
        speed: a.speed ?? 1,
        // Migrasjon 0060 (DV2): aktiv lydversjon og taler
        active_version_id: a.activeVersionId ?? null,
        character_asset_id: a.characterAssetId ?? null,
        removed: a.removed,
      };
    }
    case "dialogueVersions": {
      const v = e as unknown as DialogueVersion;
      return {
        ...base,
        clip_id: v.clipId,
        asset_id: v.assetId,
        asset_variant_id: v.assetVariantId,
        asset_version_id: v.assetVersionId,
        source: v.source,
        provider: v.provider,
        voice_id: v.voiceId,
        model_id: v.modelId,
        settings: v.settings,
        script_revision: v.scriptRevision,
        parent_version_id: v.parentVersionId,
        source_in_ms: v.sourceInMs,
        length_ms: v.lengthMs,
        gain_db: v.gainDb,
        fade_in_ms: v.fadeInMs,
        fade_out_ms: v.fadeOutMs,
        volume_keys: v.volumeKeys,
        speed: v.speed,
        composition_id: v.compositionId,
        removed: v.removed,
      };
    }
    case "clipParts": {
      const c = e as ClipPart;
      return {
        ...base,
        occurrence_id: c.occurrenceId,
        order_key: c.orderKey,
        source: c.source,
        take_id: c.takeId,
        in_ms: c.inMs,
        out_ms: c.outMs,
        // Migrasjon 0026 (DEC-0071); ignoreres av eldre databaser
        transition_ms: c.transitionMs ?? 0,
        removed: c.removed,
      };
    }
    case "timeLinks": {
      const t = e as TimeLink;
      return {
        ...base,
        occurrence_id: t.occurrenceId,
        block_id: t.blockId,
        start_ms: t.startMs,
        end_ms: t.endMs,
        // Alltid med (også null): innsetting bruker kolonnene i første rad, og endring bare kolonnene som er med
        layer_id: t.layerId,
        removed: t.removed,
      };
    }
    case "generationPrompts": {
      const g = e as GenerationPrompt;
      return {
        ...base,
        occurrence_id: g.occurrenceId,
        segment_id: g.segmentId,
        text: g.text,
        based_on: g.basedOn,
        removed: g.removed,
      };
    }
    case "continuityEvents": {
      const c = e as ContinuityEvent;
      // Alle kolonner alltid med (også null), se timeLinks
      return {
        ...base,
        asset_id: c.assetId,
        kind: c.kind,
        description: c.description,
        from_variant_id: c.fromVariantId,
        to_variant_id: c.toVariantId,
        duration: c.duration,
        scene_id: c.sceneId,
        block_id: c.blockId,
        until_scene_id: c.untilSceneId,
        status: c.status,
        // Migrasjon 0018 (DEC-0060): lokal for en produksjon, slått av i produksjoner
        production_id: c.productionId ?? null,
        disabled_in: c.disabledIn ?? [],
        removed: c.removed,
      };
    }
    case "translations": {
      const t = e as Translation;
      return {
        ...base,
        block_id: t.blockId,
        variant_id: t.variantId,
        language: t.language,
        text: t.text,
        based_on_rev: t.basedOnRev,
        status: t.status,
        removed: t.removed,
      };
    }
    case "assetRelations": {
      const x = e as AssetRelation;
      return {
        ...base,
        from_asset_id: x.fromAssetId,
        to_asset_id: x.toAssetId,
        kind: x.kind,
        label: x.label,
        description: x.description,
        status: x.status,
        removed: x.removed,
      };
    }
    case "posters": {
      const x = e as Poster;
      return {
        ...base,
        production_id: x.productionId,
        name: x.name,
        kind: x.kind,
        language: x.language,
        width_mm: x.widthMm,
        height_mm: x.heightMm,
        document: x.document,
        removed: x.removed,
      };
    }
    case "styleProfiles": {
      const x = e as StyleProfile;
      return {
        ...base,
        name: x.name,
        is_default: x.isDefault,
        guide: x.guide,
        // Migrasjon 0026 (DEC-0071)
        applies_to: x.appliesTo ?? [],
        removed: x.removed,
      };
    }
    // Story Lab (SL1, migrasjon 0039)
    case "storyProfiles": {
      const x = e as StoryCharacterProfile;
      return { ...base, asset_id: x.assetId, profile: x.profile, removed: x.removed };
    }
    case "storyProfileStages": {
      const x = e as StoryProfileStage;
      return {
        ...base,
        asset_id: x.assetId,
        from_scene_id: x.fromSceneId,
        patch: x.patch,
        removed: x.removed,
      };
    }
    case "storyFacts": {
      const x = e as StoryFact;
      return {
        ...base,
        text: x.text,
        kind: x.kind,
        at_scene_id: x.atSceneId,
        known_by: x.knownBy,
        removed: x.removed,
      };
    }
    // Skrivecanvaset (SL7, migrasjon 0040)
    case "canvasNodes": {
      const x = e as CanvasNode;
      return {
        ...base,
        kind: x.kind,
        title: x.title,
        body: x.body,
        x: x.x,
        y: x.y,
        w: x.w,
        h: x.h,
        color: x.color,
        group_id: x.groupId,
        asset_id: x.assetId,
        scene_id: x.sceneId,
        removed: x.removed,
      };
    }
    case "templateInstances": {
      const x = e as TemplateInstance;
      return {
        ...base,
        composition_id: x.compositionId,
        template_asset_id: x.templateAssetId,
        template_version_id: x.templateVersionId,
        content: x.values,
        removed: x.removed,
      };
    }
    case "canvasEdges": {
      const x = e as CanvasEdge;
      return {
        ...base,
        from_node_id: x.fromNodeId,
        to_node_id: x.toNodeId,
        label: x.label,
        kind: x.kind,
        removed: x.removed,
      };
    }
    case "animationRigs": { const x = e as AnimationRig; return { ...base, variant_id: x.variantId, current_version_id: x.currentVersionId, removed: x.removed }; }
    case "animationRigVersions": { const x = e as AnimationRigVersion; return { ...base, rig_id: x.rigId, source_version_id: x.sourceVersionId, number: x.number, spec: x.spec, algorithm_version: x.algorithmVersion, removed: x.removed }; }
    case "animationUses": { const x = e as AnimationUse; return { ...base, layer_id: x.layerId, occurrence_id: x.occurrenceId, rig_version_id: x.rigVersionId, enabled: x.enabled, behavior: x.behavior ?? null, removed: x.removed }; }
    case "lipsyncResults": { const x = e as unknown as LipsyncResult; return { ...base, clip_id: x.clipId, take_id: x.takeId, block_id: x.blockId, source: x.source, algorithm_version: x.algorithmVersion, audio_hash: x.audioHash, text_hash: x.textHash, spans: x.spans, overrides: x.overrides, enabled: x.enabled, dialogue_version_id: x.dialogueVersionId ?? null, removed: x.removed }; }
    case "animationPatterns": { const x = e as unknown as AnimationPattern; return { ...base, rig_id: x.rigId, name: x.name, color: x.color, spec: x.spec, removed: x.removed }; }
    case "creditParticipants": {
      const x = e as CreditParticipant;
      return {
        ...base,
        order_key: x.orderKey,
        group_key: x.groupKey,
        hidden: x.hidden,
        fields: x.fields,
        logo_asset_id: x.logoAssetId ?? null,
        logo_version_id: x.logoVersionId ?? null,
        image_asset_id: x.imageAssetId ?? null,
        image_version_id: x.imageVersionId ?? null,
        removed: x.removed,
      };
    }
    case "creditSequences": {
      const x = e as CreditSequence;
      return {
        ...base,
        occurrence_id: x.occurrenceId,
        presentation: x.presentation,
        duration_frames: x.durationFrames,
        pause_frames: x.pauseFrames,
        transition_kind: x.transition ? transitionKindToDb(x.transition.kind) : null,
        transition_frames: x.transition?.frames ?? 0,
        speed: x.speed,
        direction: x.direction,
        group_templates: x.groupTemplates ?? {},
        removed: x.removed,
      };
    }
  }
}

export function blockRevisionRow(r: BlockRevision, projectId: string): Row {
  return {
    project_id: projectId,
    block_id: r.blockId,
    rev: r.rev,
    text: r.text,
    author: r.author,
    created_at: r.createdAt,
  };
}

const COLLECTIONS = Object.keys(COLLECTION_TABLES) as CollectionName[];

/**
 * Innsettingsrekkefølge som respekterer fremmednøkler. Sletting skjer i motsatt rekkefølge.
 * (Takes refererer forekomster; forekomster refererer aktiv take – den sykliske koblingen løses i databasen
 * med utsatt kontroll, se migrasjon 0001.)
 */
export const TABLE_ORDER: readonly string[] = [
  "productions",
  "scenes",
  "scene_variants",
  "script_blocks",
  "scene_occurrences",
  "production_segments",
  "takes",
  "assets",
  "asset_variants",
  "asset_versions",
  "animation_rigs",
  "animation_rig_versions",
  "script_annotations",
  "compositions",
  "template_instances",
  "credit_participants",
  "credit_sequences",
  "composition_layers",
  "animation_uses",
  "lipsync_results",
  "animation_patterns",
  "audio_clips",
  "dialogue_versions",
  "clip_parts",
  "time_links",
  "generation_prompts",
  "continuity_events",
  "translations",
  "asset_relations",
  "posters",
  "style_profiles",
  "story_profiles",
  "story_profile_stages",
  "story_facts",
  "story_canvas_nodes",
  "story_canvas_edges",
];

export function diffStates(before: ProjectState, after: ProjectState): ChangeSet {
  const projectId = after.project.id;
  const inserts: Record<string, Row[]> = {};
  const updates: Record<string, Row[]> = {};
  const deletes: Record<string, { id: string; expected_revision: number }[]> = {};
  for (const col of COLLECTIONS) {
    const table = COLLECTION_TABLES[col];
    const b = before[col] as Readonly<Record<string, AnyEntity>>;
    const a = after[col] as Readonly<Record<string, AnyEntity>>;
    for (const [id, e] of Object.entries(a)) {
      const old = b[id];
      if (!old) (inserts[table] ??= []).push(toRow(col, e, projectId));
      else if (old !== e)
        (updates[table] ??= []).push({
          ...toRow(col, e, projectId),
          expected_revision: old.revision,
        });
    }
    for (const [id, old] of Object.entries(b)) {
      if (!a[id]) (deletes[table] ??= []).push({ id, expected_revision: old.revision });
    }
  }
  // Prosjektraden (bare endringer, aldri ny eller slettet): format og bildefrekvens (DEC-0039)
  if (before.project !== after.project)
    updates["projects"] = [
      {
        id: after.project.id,
        revision: after.project.revision,
        expected_revision: before.project.revision,
        name: after.project.name,
        fps_num: after.project.fps.num,
        fps_den: after.project.fps.den,
        frame_width: after.project.frameWidth,
        frame_height: after.project.frameHeight,
        ...(after.project.defaultTransition !== before.project.defaultTransition
          ? {
              default_transition_kind: transitionKindToDb(
                after.project.defaultTransition?.kind ?? "cut",
              ),
              default_transition_frames: after.project.defaultTransition?.frames ?? 0,
              default_transition_overlap: after.project.defaultTransition?.overlap ?? false,
            }
          : {}),
        // AI-budsjett (DEC-0053): bare når det er endret (null = ingen egen grense / ukjent pris)
        ...(after.project.aiMonthLimit !== before.project.aiMonthLimit ||
        after.project.aiPricePerImage !== before.project.aiPricePerImage
          ? {
              ai_month_limit: after.project.aiMonthLimit ?? null,
              ai_price_per_image: after.project.aiPricePerImage ?? null,
            }
          : {}),
        // Antakelsene for varighetsestimatet (KI-28, migrasjon 0028): bare når de er endret (null = standard)
        ...(after.project.durationAssumptions !== before.project.durationAssumptions
          ? { duration_assumptions: after.project.durationAssumptions ?? null }
          : {}),
      },
    ];
  const known = new Set(before.blockRevisions.map((r) => `${r.blockId}:${r.rev}`));
  const blockRevisions = after.blockRevisions
    .filter((r) => !known.has(`${r.blockId}:${r.rev}`))
    .map((r) => blockRevisionRow(r, projectId));
  return { inserts, updates, deletes, blockRevisions };
}

export function isEmptyChangeSet(c: ChangeSet): boolean {
  const n = (r: Readonly<Record<string, readonly unknown[]>>) =>
    Object.values(r).reduce((x, l) => x + l.length, 0);
  return n(c.inserts) + n(c.updates) + n(c.deletes) + c.blockRevisions.length === 0;
}

// ---------- Fra lagringsformat til domenemodell (brukes når serveren laster et prosjekt) ----------

export interface ProjectRows {
  readonly project: Row;
  readonly productions: readonly Row[];
  readonly scenes: readonly Row[];
  readonly scene_variants: readonly Row[];
  readonly script_blocks: readonly Row[];
  readonly script_block_revisions: readonly Row[];
  readonly scene_occurrences: readonly Row[];
  readonly production_segments: readonly Row[];
  readonly takes: readonly Row[];
  /** Ressursbiblioteket (migrasjon 0004). Tomt hvis migrasjonen ikke er kjørt ennå. */
  readonly assets?: readonly Row[];
  readonly asset_variants?: readonly Row[];
  readonly asset_versions?: readonly Row[];
  readonly script_annotations?: readonly Row[];
  /** 2D-sceneeditoren (migrasjon 0007). Tomt hvis migrasjonen ikke er kjørt ennå. */
  readonly compositions?: readonly Row[];
  readonly composition_layers?: readonly Row[];
  /** Lyd i filmen (migrasjon 0009). Tomt hvis migrasjonen ikke er kjørt ennå. */
  readonly audio_clips?: readonly Row[];
  /** Montering del 4 (migrasjon 0012). Tomt hvis migrasjonen ikke er kjørt ennå. */
  readonly clip_parts?: readonly Row[];
  readonly time_links?: readonly Row[];
  /** M5 del 2 (migrasjon 0014). Tomt hvis migrasjonen ikke er kjørt ennå. */
  readonly generation_prompts?: readonly Row[];
  /** M6 del 2 (migrasjon 0015). Tomt hvis migrasjonen ikke er kjørt ennå. */
  readonly continuity_events?: readonly Row[];
  /** M7 del 2 (migrasjon 0016). Tomt hvis migrasjonen ikke er kjørt ennå. */
  readonly translations?: readonly Row[];
  /** M8 del 1 (migrasjon 0019). Tomt hvis migrasjonen ikke er kjørt ennå. */
  readonly asset_relations?: readonly Row[];
  readonly posters?: readonly Row[];
  readonly style_profiles?: readonly Row[];
  /** Story Lab (migrasjon 0039). Tomt hvis migrasjonen ikke er kjørt ennå. */
  readonly story_profiles?: readonly Row[];
  readonly story_profile_stages?: readonly Row[];
  readonly story_facts?: readonly Row[];
  /** Skrivecanvaset (migrasjon 0040). Tomt hvis migrasjonen ikke er kjørt ennå. */
  readonly story_canvas_nodes?: readonly Row[];
  readonly story_canvas_edges?: readonly Row[];
  /** Malforekomster (migrasjon 0049). Tomt hvis migrasjonen ikke er kjørt ennå. */
  readonly template_instances?: readonly Row[];
  /** Rulletekst (migrasjon 0051). Tomt hvis migrasjonen ikke er kjørt ennå. */
  readonly credit_participants?: readonly Row[];
  readonly credit_sequences?: readonly Row[];
  readonly animation_rigs?: readonly Row[];
  readonly animation_rig_versions?: readonly Row[];
  readonly animation_uses?: readonly Row[];
  readonly lipsync_results?: readonly Row[];
  readonly animation_patterns?: readonly Row[];
  readonly dialogue_versions?: readonly Row[];
}

const str = (v: unknown) => String(v);
const optStr = (v: unknown) => (v === null || v === undefined ? null : String(v));
const num = (v: unknown) => Number(v);
const optNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
/** jsonb kommer som objekt fra databasen, men kan komme som tekst fra enkelte klienter. */
const json = (v: unknown): unknown => (typeof v === "string" ? (JSON.parse(v) as unknown) : v);

/** Overgangstypen i databasen (snake_case, migrasjon 0013). */
export function transitionKindToDb(k: TransitionKind): string {
  return k === "dipWhite" ? "dip_white" : k;
}

function transitionKindFromDb(v: unknown): TransitionKind | null {
  const k = v === "dip_white" ? "dipWhite" : v;
  return (TRANSITION_KINDS as readonly unknown[]).includes(k) ? (k as TransitionKind) : null;
}

/** En overgang fra kolonnene (null = ingen gyldig overgang). */
function transitionFrom(kind: unknown, framesRaw: unknown, overlap: unknown): Transition | null {
  const k = transitionKindFromDb(kind);
  if (!k) return null;
  const frames = Number(framesRaw ?? 0);
  if (k === "cut") return { kind: "cut", frames: 0 };
  if (!(frames > 0)) return null;
  return overlap === true ? { kind: k, frames, overlap: true } : { kind: k, frames };
}

/**
 * Scenens egen overgang (migrasjon 0011/0013). Uten egen overgang følger scenen prosjektets standard.
 * Før 0013 fantes ikke `transition_custom`: da var kutt det samme som standard.
 */
function transitionFromRow(x: Row): { transition?: Transition } {
  const t = transitionFrom(x["transition_kind"], x["transition_frames"], x["transition_overlap"]);
  if (!t) return {};
  const custom =
    x["transition_custom"] === undefined || x["transition_custom"] === null
      ? t.kind !== "cut"
      : x["transition_custom"] === true;
  return custom ? { transition: t } : {};
}

function defaultTransitionFromRow(p: Row): { defaultTransition?: Transition } {
  const t = transitionFrom(
    p["default_transition_kind"],
    p["default_transition_frames"],
    p["default_transition_overlap"],
  );
  return t && t.kind !== "cut" ? { defaultTransition: t } : {};
}

/** Godkjent grunnlag for en versjon (migrasjon 0014): tomt eller manglende = som produced_from. */
/** Språkavhengige bilder i et lag (migrasjon 0017, DEC-0059): tom liste = ingen. */
function languageImagesFromRow(v: unknown): { languageImages?: LanguageImage[] } {
  const list = json(v) as LanguageImage[] | null | undefined;
  if (!Array.isArray(list) || list.length === 0) return {};
  return {
    languageImages: list.map((li) => ({
      language: String(li.language),
      assetVariantId: String(li.assetVariantId) as never,
      versionId: (li.versionId ?? null) as never,
    })),
  };
}

/** Maske og blandingsmodus i et lag (migrasjon 0026, REQ-0175): null/«normal» eller mangler = ingen. */
function reviewedFromRow(v: unknown): { reviewedVersions?: string[] } {
  const a = json(v);
  return Array.isArray(a) && a.length ? { reviewedVersions: a.map(String) } : {};
}

function maskBlendFromRow(m: unknown, b: unknown): { mask?: LayerMask; blend?: BlendMode } {
  const mask = json(m) as LayerMask | null | undefined;
  const out: { mask?: LayerMask; blend?: BlendMode } = {};
  if (mask && typeof mask === "object" && typeof mask.kind === "string") out.mask = mask;
  if (typeof b === "string" && b !== "normal" && b !== "") out.blend = b as BlendMode;
  return out;
}

/** Lagrede eksportinnstillinger (migrasjon 0027); tittelsiden (KI-20) bare som liste med tekst. */
function exportSettingsFromRow(v: unknown): { exportSettings?: ExportSettings } {
  const x = json(v) as Record<string, unknown> | null | undefined;
  if (!x || typeof x !== "object" || Array.isArray(x)) return {};
  const tp = x["titlePage"];
  const { titlePage: _tp, ...rest } = x;
  return {
    exportSettings: {
      ...(rest as unknown as ExportSettings),
      ...(Array.isArray(tp) ? { titlePage: tp.filter((l) => typeof l === "string") } : {}),
    },
  };
}

function takeAcceptedFrom(v: unknown): { acceptedFrom?: ProducedFrom } {
  const r = compositionProducedFrom(v);
  return r.producedFrom ? { acceptedFrom: r.producedFrom } : {};
}

/** Versjonens grunnlag fra raden, nøyaktig som lagret (med `assetVersions` når de finnes). */
function takeProducedFrom(v: unknown): ProducedFrom {
  const p = json(v);
  if (!p || typeof p !== "object" || Array.isArray(p)) return { blockRevisions: {} };
  return p as ProducedFrom;
}

/** Ressursversjonene i grunnlaget (REQ-0022): ressurs-ID → versjons-ID, bare tekst. */
function assetVersionsFromJson(v: unknown): { assetVersions?: Record<string, string> } {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, id] of Object.entries(v as Record<string, unknown>))
    if (typeof id === "string" && id) out[k] = id;
  return Object.keys(out).length ? { assetVersions: out } : {};
}

/**
 * Grunnlaget for 2D-scenen (migrasjon 0014): manuslinjenes revisjoner og ressursversjonene (REQ-0022).
 * Tomt eller manglende = ukjent.
 */
/** Tidsoppsettet fra raden (migrasjon 0042); ugyldig eller tomt gir ingen. */
function compositionTiming(v: unknown): { timing?: CompositionTiming } {
  const r = normalizeTiming(json(v));
  return r.ok && !isEmptyTiming(r.value) ? { timing: r.value } : {};
}

function compositionProducedFrom(v: unknown): { producedFrom?: ProducedFrom } {
  const p = json(v) as { blockRevisions?: Record<string, unknown>; assetVersions?: unknown } | null;
  const revs = p?.blockRevisions;
  const out: Record<string, number> = {};
  if (revs && typeof revs === "object")
    for (const [k, n] of Object.entries(revs)) if (Number.isFinite(Number(n))) out[k] = Number(n);
  const av = assetVersionsFromJson(p?.assetVersions);
  if (Object.keys(out).length === 0 && !av.assetVersions) return {};
  return { producedFrom: { blockRevisions: out, ...av } };
}

/** Filinformasjon for importert film fra raden (migrasjon 0011); tomt objekt gir ingen. */
function takeMediaFromRow(v: unknown): { media?: TakeMedia } {
  const m = v === undefined || v === null ? null : (json(v) as Record<string, unknown>);
  if (!m || typeof m !== "object" || typeof m["fileName"] !== "string") return {};
  return {
    media: {
      fileName: String(m["fileName"]),
      mimeType: String(m["mimeType"] ?? ""),
      byteSize: Number(m["byteSize"] ?? 0),
      width: optNum(m["width"]),
      height: optNum(m["height"]),
      fps: optNum(m["fps"]),
      durationMs: Number(m["durationMs"] ?? 0),
      videoCodec: optStr(m["videoCodec"]),
      hasAudio: Boolean(m["hasAudio"]),
    },
  };
}

/** Antakelsene for varighetsestimatet fra prosjektraden (migrasjon 0028); mangler eller ugyldig = standard. */
function durationAssumptionsFromRow(v: unknown): { durationAssumptions?: DurationAssumptions } {
  const o = v === undefined || v === null ? null : (json(v) as Record<string, unknown> | null);
  if (!o || typeof o !== "object") return {};
  const keys = [
    "dialogueWordsPerMinute",
    "actionSecondsPerLine",
    "headingSeconds",
    "minSceneSeconds",
  ] as const;
  if (!keys.every((k) => typeof o[k] === "number" && Number.isFinite(o[k]))) return {};
  return {
    durationAssumptions: Object.fromEntries(
      keys.map((k) => [k, o[k] as number]),
    ) as unknown as DurationAssumptions,
  };
}

function byId<T extends { id: string }>(list: T[]): Record<string, T> {
  return Object.fromEntries(list.map((x) => [x.id, x]));
}

export function stateFromRows(r: ProjectRows): ProjectState {
  const p = r.project;
  return {
    project: {
      id: str(p["id"]) as never,
      revision: num(p["revision"]),
      name: str(p["name"]),
      fps: { num: num(p["fps_num"]), den: num(p["fps_den"]) },
      // Før migrasjon 0008 finnes ikke kolonnene: HD 16:9
      frameWidth: num(p["frame_width"] ?? 1920),
      frameHeight: num(p["frame_height"] ?? 1080),
      primaryLanguage: "nb",
      ...defaultTransitionFromRow(p),
      ...(p["ai_month_limit"] === null || p["ai_month_limit"] === undefined
        ? {}
        : { aiMonthLimit: Number(p["ai_month_limit"]) }),
      ...(p["ai_price_per_image"] === null || p["ai_price_per_image"] === undefined
        ? {}
        : { aiPricePerImage: Number(p["ai_price_per_image"]) }),
      ...durationAssumptionsFromRow(p["duration_assumptions"]),
    },
    productions: byId(
      r.productions.map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        kind: str(x["kind"]) as never,
        name: str(x["name"]),
        parentProductionId: optStr(x["parent_production_id"]) as never,
        fps: { num: num(x["fps_num"]), den: num(x["fps_den"]) },
        ...exportSettingsFromRow(x["export_settings"]),
        ...(typeof x["description"] === "string" && x["description"]
          ? { note: x["description"] }
          : {}),
        ...(x["created_at"] != null ? { createdAt: iso(x["created_at"]) } : {}),
      })),
    ),
    scenes: byId(
      r.scenes.map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        originProductionId: str(x["origin_production_id"]) as never,
        storyTime: {
          kind: str(x["story_kind"]) as never,
          anchorSceneId: optStr(x["story_anchor_scene_id"]) as never,
          offset: num(x["story_offset"]),
        },
        derivedFromSceneId: optStr(x["derived_from_scene_id"]) as never,
        mergedIntoSceneId: optStr(x["merged_into_scene_id"]) as never,
      })),
    ),
    variants: byId(
      r.scene_variants.map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        sceneId: str(x["scene_id"]) as never,
        ownerProductionId: optStr(x["owner_production_id"]) as never,
        basedOnVariantId: optStr(x["based_on_variant_id"]) as never,
        heading: {
          intExt: str(x["heading_int_ext"]),
          location: str(x["heading_location"]),
          time: str(x["heading_time"]),
        },
        uncertainty: optStr(x["uncertainty"]),
      })),
    ),
    blocks: byId(
      r.script_blocks.map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        variantId: str(x["variant_id"]) as never,
        kind: str(x["kind"]) as never,
        orderKey: str(x["order_key"]),
        currentRev: num(x["current_rev"]),
        text: str(x["text"]),
        language: "nb" as const,
        sourceRef: (x["source_ref"] as { page: number; y: number } | null | undefined) ?? null,
        uncertainty: optStr(x["uncertainty"]),
        removed: x["removed"] === true,
      })),
    ),
    blockRevisions: r.script_block_revisions
      .map((x) => ({
        blockId: str(x["block_id"]) as never,
        rev: num(x["rev"]),
        text: str(x["text"]),
        author: str(x["author"]) as never,
        createdAt: iso(x["created_at"]),
      }))
      .sort((a, b) => (a.blockId === b.blockId ? a.rev - b.rev : a.blockId < b.blockId ? -1 : 1)),
    occurrences: byId(
      r.scene_occurrences.map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        productionId: str(x["production_id"]) as never,
        sceneId: str(x["scene_id"]) as never,
        variantId: str(x["variant_id"]) as never,
        orderKey: str(x["order_key"]),
        active: Boolean(x["active"]),
        excerpt:
          x["excerpt_in"] === null || x["excerpt_in"] === undefined
            ? null
            : { inFrame: num(x["excerpt_in"]), outFrame: num(x["excerpt_out"]) },
        activeTakeId: optStr(x["active_take_id"]) as never,
        productionNumber: optStr(x["production_number"]),
        ...transitionFromRow(x),
        ...(x["monochrome"] === true ? { monochrome: true } : {}),
        ...(x["planned_ms"] !== null && x["planned_ms"] !== undefined
          ? { plannedMs: num(x["planned_ms"]) }
          : {}),
        ...(typeof x["video_instructions"] === "string" && x["video_instructions"]
          ? { videoInstructions: x["video_instructions"] }
          : {}),
        // Migrasjon 0050 (MTS MT6): scenetypen (mangler = «scene»)
        ...(typeof x["kind"] === "string" && x["kind"] !== "scene"
          ? { kind: x["kind"] as OccurrenceKind }
          : {}),
      })),
    ),
    segments: byId(
      r.production_segments.map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        occurrenceId: str(x["occurrence_id"]) as never,
        reason: str(x["reason"]) as never,
        orderKey: str(x["order_key"]),
        startBlockId: optStr(x["start_block_id"]) as never,
        endBlockId: optStr(x["end_block_id"]) as never,
        ...(x["start_ms"] === null || x["start_ms"] === undefined
          ? {}
          : { startMs: num(x["start_ms"]), endMs: num(x["end_ms"] ?? x["start_ms"]) }),
      })),
    ),
    takes: byId(
      r.takes.map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        occurrenceId: str(x["occurrence_id"]) as never,
        segmentId: optStr(x["segment_id"]) as never,
        kind: str(x["kind"]) as never,
        status: str(x["status"]) as never,
        durationFrames: optNum(x["duration_frames"]),
        // Uendret fra raden (også ressursversjonene, REQ-0022): databasen avviser enhver endring av
        // produced_from (INV-07), så den må skrives tilbake nøyaktig slik den ble lest
        producedFrom: takeProducedFrom(x["produced_from"]),
        mediaRef: optStr(x["media_ref"]),
        ...takeMediaFromRow(x["metadata"]),
        ...takeAcceptedFrom(x["accepted_from"]),
        ...(typeof x["audio_language"] === "string" && x["audio_language"]
          ? { audioLanguage: x["audio_language"] }
          : {}),
        ...(x["coverage"] && typeof x["coverage"] === "object"
          ? { coverage: x["coverage"] as TakeCoverage }
          : {}),
        ...reviewedFromRow(x["reviewed_versions"]),
      })),
    ),
    assets: byId(
      (r.assets ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        kind: str(x["kind"]) as never,
        name: str(x["name"]),
        names: ((x["names"] as AssetName[] | null | undefined) ?? []).map((n) => ({
          name: String(n.name),
          kind: n.kind,
          language: n.language ?? null,
        })),
        description: str(x["description"] ?? ""),
        category: str(x["category"] ?? ""),
        tags: ((x["tags"] as string[] | null | undefined) ?? []).map(String),
        archived: x["archived"] === true,
        ...(Array.isArray(x["sound_links"]) && (x["sound_links"] as unknown[]).length
          ? {
              soundLinks: (x["sound_links"] as { kind: string; id: string }[]).map((l) => ({
                kind: l.kind as SoundLinkKind,
                id: String(l.id),
              })),
            }
          : {}),
        ...(Array.isArray(x["context_names"]) && (x["context_names"] as unknown[]).length
          ? {
              contextNames: (x["context_names"] as { name: string; blockIds: string[] }[]).map(
                (n) => ({ name: String(n.name), blockIds: (n.blockIds ?? []).map(String) }),
              ),
            }
          : {}),
        ...(Array.isArray(x["scene_plans"]) && (x["scene_plans"] as unknown[]).length
          ? {
              scenePlans: (x["scene_plans"] as Record<string, unknown>[]).map((p) => ({
                occurrenceId: String(p["occurrenceId"]),
                taskId: String(p["taskId"]),
                fromOccurrenceId: String(p["fromOccurrenceId"]),
                at: String(p["at"]),
              })),
            }
          : {}),
        ...(x["voice"] && typeof x["voice"] === "object"
          ? { voice: x["voice"] as AssetVoice }
          : {}),
        ...(x["removed"] === true ? { removed: true } : {}),
        ...(typeof x["visual_brief"] === "string" && x["visual_brief"]
          ? { visualBrief: x["visual_brief"] }
          : {}),
        ...(typeof x["source_global_asset_id"] === "string"
          ? { globalAssetId: x["source_global_asset_id"] }
          : {}),
      })),
    ),
    assetVariants: byId(
      (r.asset_variants ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        assetId: str(x["asset_id"]) as never,
        name: str(x["name"]),
        style: str(x["style"]) as never,
        appearance: str(x["appearance"] ?? ""),
        approvedVersionId: optStr(x["approved_version_id"]) as never,
        archived: x["archived"] === true,
      })),
    ),
    assetVersions: byId(
      (r.asset_versions ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        variantId: str(x["variant_id"]) as never,
        number: num(x["number"]),
        mediaPath: str(x["media_path"]),
        mimeType: str(x["mime_type"]),
        width: optNum(x["width"]),
        height: optNum(x["height"]),
        byteSize: num(x["byte_size_big"] ?? x["byte_size"]),
        sha256: str(x["sha256"]),
        note: str(x["note"] ?? ""),
        createdAt: iso(x["created_at"]),
        createdBy: str(x["created_by"] ?? ""),
        durationMs: optNum(x["duration_ms"]),
        ...(x["removed"] === true ? { removed: true } : {}),
        ...(isVersionView(x["view"]) ? { view: x["view"] } : {}),
        ...(isComposition(x["composition"]) ? { composition: x["composition"] } : {}),
        ...(json(x["template_spec"]) && typeof json(x["template_spec"]) === "object"
          ? { template: json(x["template_spec"]) as never }
          : {}),
        ...(isAlignment(x["alignment"]) ? { alignment: x["alignment"] } : {}),
        ...(typeof x["source_global_version_id"] === "string" &&
        typeof x["source_global_asset_id"] === "string" &&
        typeof x["source_global_variant_id"] === "string"
          ? {
              globalSource: {
                assetId: x["source_global_asset_id"],
                variantId: x["source_global_variant_id"],
                versionId: x["source_global_version_id"],
              },
            }
          : {}),
      })),
    ),
    annotations: byId(
      (r.script_annotations ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        variantId: optStr(x["variant_id"]) as never,
        blockId: optStr(x["block_id"]) as never,
        start: num(x["range_start"]),
        end: num(x["range_end"]),
        quote: str(x["quote"] ?? ""),
        text: str(x["text"] ?? ""),
        authorName: str(x["author_name"] ?? ""),
        stampAt: iso(x["stamp_at"]),
        editedByName: optStr(x["edited_by_name"]),
        editedAt:
          x["edited_at"] === null || x["edited_at"] === undefined ? null : iso(x["edited_at"]),
        removed: x["removed"] === true,
        ...(x["source"] === "system" ? { source: "system" as const } : {}),
        resolved: x["resolved"] === true,
        ...(typeof x["task_id"] === "string" ? { taskId: x["task_id"] } : {}),
        ...(x["kind"] === "trial_edit"
          ? { kind: "trial_edit" as const, suggestedText: str(x["suggested_text"] ?? "") }
          : {}),
      })),
    ),
    compositions: byId(
      (r.compositions ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        variantId: str(x["variant_id"]) as never,
        name: str(x["name"] ?? ""),
        width: num(x["width"]),
        height: num(x["height"]),
        durationFrames: num(x["duration_frames"] ?? 0),
        background: str(x["background"] ?? "#000000"),
        camera: { shots: [], ...(json(x["camera"]) as object | null) } as never,
        removed: x["removed"] === true,
        ...compositionProducedFrom(x["produced_from"]),
        ...(num(x["step"] ?? 1) > 1 ? { step: num(x["step"]) } : {}),
        ...compositionTiming(x["timing"]),
      })),
    ),
    layers: byId(
      (r.composition_layers ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        compositionId: str(x["composition_id"]) as never,
        orderKey: str(x["order_key"]),
        kind: str(x["kind"]) as never,
        name: str(x["name"] ?? ""),
        assetId: optStr(x["asset_id"]) as never,
        assetVariantId: optStr(x["asset_variant_id"]) as never,
        versionId: optStr(x["version_id"]) as never,
        fill: optStr(x["fill"]),
        width: num(x["width"]),
        height: num(x["height"]),
        parallax: num(x["parallax"]),
        transform: json(x["transform"]) as never,
        keyframes: (json(x["keyframes"]) ?? []) as never,
        visible: x["visible"] !== false,
        locked: x["locked"] === true,
        groupId: optStr(x["group_id"]),
        swaps: ((json(x["image_swaps"]) as unknown[] | null | undefined) ?? []) as never,
        path: (json(x["motion_path"]) ?? null) as never,
        anchor: (json(x["anchor"]) ?? null) as never,
        ...languageImagesFromRow(x["language_images"]),
        ...maskBlendFromRow(x["mask"], x["blend"]),
        ...reviewedFromRow(x["reviewed_versions"]),
        ...(typeof x["active_from"] === "number" && typeof x["active_to"] === "number"
          ? { activeRange: { from: x["active_from"], to: x["active_to"] } }
          : {}),
        // Migrasjon 0048 (MTS)
        ...(json(x["text_spec"]) ? { text: json(x["text_spec"]) as never } : {}),
        ...(json(x["shape"]) ? { shape: json(x["shape"]) as never } : {}),
        ...(json(x["effects"]) ? { effects: json(x["effects"]) as never } : {}),
        ...(typeof x["template_instance_id"] === "string" && typeof x["template_key"] === "string"
          ? {
              template: {
                instanceId: x["template_instance_id"],
                key: x["template_key"],
                slot: optStr(x["template_slot"]),
              },
            }
          : {}),
        // Migrasjon 0050 (MTS MT6): overgangen inn i siden
        ...(json(x["page_transition"]) ? { pageTransition: json(x["page_transition"]) as never } : {}),
        removed: x["removed"] === true,
      })),
    ),
    audioClips: byId(
      (r.audio_clips ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        occurrenceId: str(x["occurrence_id"]) as never,
        kind: str(x["kind"]) as never,
        name: str(x["name"] ?? ""),
        assetId: str(x["asset_id"]) as never,
        assetVariantId: optStr(x["asset_variant_id"]) as never,
        versionId: optStr(x["version_id"]) as never,
        blockId: optStr(x["block_id"]) as never,
        offsetMs: num(x["offset_ms"]),
        sourceInMs: num(x["source_in_ms"] ?? 0),
        lengthMs: num(x["length_ms"]),
        gainDb: num(x["gain_db"] ?? 0),
        fadeInMs: num(x["fade_in_ms"] ?? 0),
        fadeOutMs: num(x["fade_out_ms"] ?? 0),
        muted: x["muted"] === true,
        continues: x["continues"] === true,
        volumeKeys: ((json(x["volume_keys"]) as { t: number; db: number }[] | null) ?? []).map(
          (k) => ({ t: Number(k.t), db: Number(k.db) }),
        ),
        ...(typeof x["language"] === "string" && x["language"] ? { language: x["language"] } : {}),
        ...(x["speed"] !== undefined && x["speed"] !== null && Number(x["speed"]) !== 1
          ? { speed: Number(x["speed"]) }
          : {}),
        ...(x["active_version_id"] ? { activeVersionId: str(x["active_version_id"]) } : {}),
        ...(x["character_asset_id"] ? { characterAssetId: str(x["character_asset_id"]) } : {}),
        removed: x["removed"] === true,
      })),
    ),
    dialogueVersions: byId(
      (r.dialogue_versions ?? []).map((x): DialogueVersion => ({
        id: str(x["id"]),
        revision: num(x["revision"]),
        clipId: str(x["clip_id"]),
        assetId: str(x["asset_id"]),
        assetVariantId: optStr(x["asset_variant_id"]),
        assetVersionId: optStr(x["asset_version_id"]),
        source: str(x["source"] ?? "legacy") as DialogueVersion["source"],
        provider: optStr(x["provider"]),
        voiceId: optStr(x["voice_id"]),
        modelId: optStr(x["model_id"]),
        settings: (json(x["settings"]) as DialogueVersion["settings"] | null) ?? {},
        scriptRevision: optNum(x["script_revision"]),
        parentVersionId: optStr(x["parent_version_id"]),
        sourceInMs: num(x["source_in_ms"] ?? 0),
        lengthMs: num(x["length_ms"]),
        gainDb: num(x["gain_db"] ?? 0),
        fadeInMs: num(x["fade_in_ms"] ?? 0),
        fadeOutMs: num(x["fade_out_ms"] ?? 0),
        volumeKeys: ((json(x["volume_keys"]) as { t: number; db: number }[] | null) ?? []).map(
          (k) => ({ t: Number(k.t), db: Number(k.db) }),
        ),
        speed: x["speed"] === undefined || x["speed"] === null ? 1 : Number(x["speed"]),
        compositionId: optStr(x["composition_id"]),
        ...(x["created_at"] ? { createdAt: iso(x["created_at"]) } : {}),
        removed: x["removed"] === true,
      })),
    ),
    clipParts: byId(
      (r.clip_parts ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        occurrenceId: str(x["occurrence_id"]) as never,
        orderKey: str(x["order_key"]),
        source: (x["source"] === "take" ? "take" : "composition") as ClipPart["source"],
        takeId: optStr(x["take_id"]) as never,
        inMs: num(x["in_ms"]),
        outMs: num(x["out_ms"]),
        ...(num(x["transition_ms"] ?? 0) > 0 ? { transitionMs: num(x["transition_ms"]) } : {}),
        removed: x["removed"] === true,
      })),
    ),
    timeLinks: byId(
      (r.time_links ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        occurrenceId: str(x["occurrence_id"]) as never,
        blockId: str(x["block_id"]) as never,
        startMs: num(x["start_ms"]),
        endMs: optNum(x["end_ms"]),
        layerId: optStr(x["layer_id"]) as never,
        removed: x["removed"] === true,
      })),
    ),
    generationPrompts: byId(
      (r.generation_prompts ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        occurrenceId: str(x["occurrence_id"]) as never,
        segmentId: str(x["segment_id"]) as never,
        text: str(x["text"] ?? ""),
        basedOn: str(x["based_on"] ?? ""),
        removed: x["removed"] === true,
      })),
    ),
    continuityEvents: byId(
      (r.continuity_events ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        assetId: str(x["asset_id"]) as never,
        kind: (CONTINUITY_KINDS as readonly string[]).includes(String(x["kind"]))
          ? (String(x["kind"]) as ContinuityKind)
          : "other",
        description: str(x["description"] ?? ""),
        fromVariantId: optStr(x["from_variant_id"]) as never,
        toVariantId: optStr(x["to_variant_id"]) as never,
        duration: (x["duration"] === "temporary" || x["duration"] === "scene"
          ? x["duration"]
          : "permanent") as ContinuityDuration,
        sceneId: str(x["scene_id"]) as never,
        blockId: optStr(x["block_id"]) as never,
        untilSceneId: optStr(x["until_scene_id"]) as never,
        status: x["status"] === "dismissed" ? "dismissed" : "approved",
        ...(optStr(x["production_id"])
          ? { productionId: optStr(x["production_id"]) as never }
          : {}),
        ...(Array.isArray(json(x["disabled_in"])) && (json(x["disabled_in"]) as unknown[]).length
          ? { disabledIn: (json(x["disabled_in"]) as unknown[]).map(String).sort() as never }
          : {}),
        removed: x["removed"] === true,
      })),
    ),
    translations: byId(
      (r.translations ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        blockId: optStr(x["block_id"]) as never,
        variantId: optStr(x["variant_id"]) as never,
        language: str(x["language"] ?? "en"),
        text: str(x["text"] ?? ""),
        basedOnRev: num(x["based_on_rev"] ?? 0),
        status: (x["status"] === "uncertain" ? "uncertain" : "approved") as Translation["status"],
        removed: x["removed"] === true,
      })),
    ),
    assetRelations: byId(
      (r.asset_relations ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        fromAssetId: str(x["from_asset_id"]) as never,
        toAssetId: str(x["to_asset_id"]) as never,
        kind: ((RELATION_KINDS as readonly string[]).includes(String(x["kind"]))
          ? String(x["kind"])
          : "other") as RelationKind,
        label: str(x["label"] ?? ""),
        description: str(x["description"] ?? ""),
        status: (x["status"] === "dismissed" ? "dismissed" : "approved") as AssetRelation["status"],
        removed: x["removed"] === true,
      })),
    ),
    posters: byId(
      (r.posters ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        productionId: str(x["production_id"]) as never,
        name: str(x["name"] ?? ""),
        kind: (x["kind"] === "character_map" ? "character_map" : "pitch") as PosterKind,
        language: (x["language"] === "en" ? "en" : "nb") as Poster["language"],
        widthMm: num(x["width_mm"] ?? 700),
        heightMm: num(x["height_mm"] ?? 1000),
        document: json(x["document"]) as PosterDocument,
        removed: x["removed"] === true,
      })),
    ),
    styleProfiles: byId(
      (r.style_profiles ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        name: str(x["name"] ?? ""),
        isDefault: x["is_default"] === true,
        guide: json(x["guide"]) as StyleGuide,
        ...(Array.isArray(x["applies_to"]) && (x["applies_to"] as unknown[]).length
          ? { appliesTo: (x["applies_to"] as string[]).map(String) as StyleUse[] }
          : {}),
        removed: x["removed"] === true,
      })),
    ),
    storyProfiles: byId(
      (r.story_profiles ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        assetId: str(x["asset_id"]) as never,
        profile: json(x["profile"]) as StoryCharacterProfile["profile"],
        removed: x["removed"] === true,
      })),
    ),
    storyProfileStages: byId(
      (r.story_profile_stages ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        assetId: str(x["asset_id"]) as never,
        fromSceneId: str(x["from_scene_id"]) as never,
        patch: (json(x["patch"]) ?? {}) as StoryProfileStage["patch"],
        removed: x["removed"] === true,
      })),
    ),
    storyFacts: byId(
      (r.story_facts ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        text: str(x["text"] ?? ""),
        kind: (x["kind"] === "secret" ? "secret" : "fact") as StoryFact["kind"],
        atSceneId: optStr(x["at_scene_id"]) as never,
        knownBy: ((json(x["known_by"]) as StoryFact["knownBy"] | null) ?? []).map((k) => ({
          assetId: String(k.assetId) as never,
          fromSceneId: (k.fromSceneId === null || k.fromSceneId === undefined
            ? null
            : String(k.fromSceneId)) as never,
        })),
        removed: x["removed"] === true,
      })),
    ),
    canvasNodes: byId(
      (r.story_canvas_nodes ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        kind: str(x["kind"]) as CanvasNode["kind"],
        title: str(x["title"] ?? ""),
        body: str(x["body"] ?? ""),
        x: num(x["x"] ?? 0),
        y: num(x["y"] ?? 0),
        w: num(x["w"] ?? 220),
        h: num(x["h"] ?? 120),
        color: optStr(x["color"]),
        groupId: optStr(x["group_id"]) as never,
        assetId: optStr(x["asset_id"]) as never,
        sceneId: optStr(x["scene_id"]) as never,
        removed: x["removed"] === true,
      })),
    ),
    canvasEdges: byId(
      (r.story_canvas_edges ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        fromNodeId: str(x["from_node_id"]) as never,
        toNodeId: str(x["to_node_id"]) as never,
        label: str(x["label"] ?? ""),
        kind: str(x["kind"]) as CanvasEdge["kind"],
        removed: x["removed"] === true,
      })),
    ),
    templateInstances: byId(
      (r.template_instances ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        compositionId: str(x["composition_id"]) as never,
        templateAssetId: str(x["template_asset_id"]) as never,
        templateVersionId: str(x["template_version_id"]) as never,
        values: ((json(x["content"]) as object | null) ?? {}) as never,
        removed: x["removed"] === true,
      })),
    ),
    animationRigs: byId((r.animation_rigs ?? []).map(x => ({ id: str(x["id"]), revision: num(x["revision"]), variantId: str(x["variant_id"]), currentVersionId: optStr(x["current_version_id"]), removed: x["removed"] === true }))),
    animationRigVersions: byId((r.animation_rig_versions ?? []).map(x => ({ id: str(x["id"]), revision: num(x["revision"]), rigId: str(x["rig_id"]), sourceVersionId: str(x["source_version_id"]), number: num(x["number"]), spec: json(x["spec"]) as AnimationRigVersion["spec"], algorithmVersion: 1 as const, removed: x["removed"] === true }))),
    animationUses: byId((r.animation_uses ?? []).map(x => ({ id: str(x["id"]), revision: num(x["revision"]), layerId: str(x["layer_id"]), occurrenceId: str(x["occurrence_id"]), rigVersionId: str(x["rig_version_id"]), enabled: x["enabled"] === true, ...(json(x["behavior"]) ? { behavior: json(x["behavior"]) as NonNullable<AnimationUse["behavior"]> } : {}), removed: x["removed"] === true }))),
    lipsyncResults: byId((r.lipsync_results ?? []).map(x => ({ id: str(x["id"]), revision: num(x["revision"]), clipId: str(x["clip_id"]), takeId: str(x["take_id"]), blockId: optStr(x["block_id"]), source: str(x["source"]) as LipsyncResult["source"], algorithmVersion: num(x["algorithm_version"]), audioHash: str(x["audio_hash"]), textHash: str(x["text_hash"] ?? ""), spans: (json(x["spans"]) as LipsyncResult["spans"] | null) ?? [], overrides: (json(x["overrides"]) as LipsyncResult["overrides"] | null) ?? [], enabled: x["enabled"] === true, ...(x["dialogue_version_id"] ? { dialogueVersionId: str(x["dialogue_version_id"]) } : {}), removed: x["removed"] === true }))),
    animationPatterns: byId((r.animation_patterns ?? []).map(x => ({ id: str(x["id"]), revision: num(x["revision"]), rigId: optStr(x["rig_id"]), name: str(x["name"]), color: str(x["color"]), spec: json(x["spec"]) as AnimationPattern["spec"], removed: x["removed"] === true }))),
    creditParticipants: byId(
      (r.credit_participants ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        orderKey: str(x["order_key"]),
        groupKey: str(x["group_key"] ?? ""),
        hidden: x["hidden"] === true,
        fields: ((json(x["fields"]) as object | null) ?? {}) as never,
        logoAssetId: optStr(x["logo_asset_id"]) as never,
        logoVersionId: optStr(x["logo_version_id"]) as never,
        imageAssetId: optStr(x["image_asset_id"]) as never,
        imageVersionId: optStr(x["image_version_id"]) as never,
        removed: x["removed"] === true,
      })),
    ),
    creditSequences: byId(
      (r.credit_sequences ?? []).map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        occurrenceId: str(x["occurrence_id"]) as never,
        presentation: str(x["presentation"]) as never,
        durationFrames: num(x["duration_frames"]),
        pauseFrames: num(x["pause_frames"]),
        ...(transitionKindFromDb(x["transition_kind"])
          ? {
              transition: {
                kind: transitionKindFromDb(x["transition_kind"]),
                frames: num(x["transition_frames"]),
              } as never,
            }
          : {}),
        speed: num(x["speed"]),
        direction: str(x["direction"]) as never,
        ...((json(x["group_templates"]) as object | null)
          ? { groupTemplates: json(x["group_templates"]) as never }
          : {}),
        removed: x["removed"] === true,
      })),
    ),
  };
}
