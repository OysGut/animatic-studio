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
  PosterDocument,
  PosterKind,
  RelationKind,
  Production,
  ProductionSegment,
  ProjectState,
  Scene,
  SceneOccurrence,
  SceneVariant,
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
import type { DurationAssumptions } from "./screenplay/duration";

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

type AnyEntity =
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
  | StyleProfile;

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
        voice: a.voice ?? null,
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
        removed: a.removed,
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
  "script_annotations",
  "compositions",
  "composition_layers",
  "audio_clips",
  "clip_parts",
  "time_links",
  "generation_prompts",
  "continuity_events",
  "translations",
  "asset_relations",
  "posters",
  "style_profiles",
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
        ...(x["voice"] && typeof x["voice"] === "object"
          ? { voice: x["voice"] as AssetVoice }
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
  };
}
