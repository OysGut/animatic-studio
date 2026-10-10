/**
 * Endringssett mellom to tilstander (DEC-0022). Serveren kjører kommandoen i kjernen og sender
 * endringssettet til databasen, som lagrer alt atomisk og avviser det hvis noen rad har fått ny
 * revisjon i mellomtiden (INV-C1). Radformatet (snake_case) er lagringsformatet i DATA_RELATIONSHIPS.md.
 */
import type {
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
  Production,
  ProductionSegment,
  ProjectState,
  Scene,
  SceneOccurrence,
  SceneVariant,
  ScriptBlock,
  Take,
} from "./model";
import { COLLECTION_TABLES } from "./model";

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
  | Take
  | Asset
  | AssetVariant
  | AssetVersion
  | Annotation
  | Composition
  | CompositionLayer
  | AudioClip;

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
        removed: a.removed,
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
}

const str = (v: unknown) => String(v);
const optStr = (v: unknown) => (v === null || v === undefined ? null : String(v));
const num = (v: unknown) => Number(v);
const optNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
/** jsonb kommer som objekt fra databasen, men kan komme som tekst fra enkelte klienter. */
const json = (v: unknown): unknown => (typeof v === "string" ? (JSON.parse(v) as unknown) : v);

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
    },
    productions: byId(
      r.productions.map((x) => ({
        id: str(x["id"]) as never,
        revision: num(x["revision"]),
        kind: str(x["kind"]) as never,
        name: str(x["name"]),
        parentProductionId: optStr(x["parent_production_id"]) as never,
        fps: { num: num(x["fps_num"]), den: num(x["fps_den"]) },
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
        producedFrom: (x["produced_from"] as { blockRevisions: Record<string, number> }) ?? {
          blockRevisions: {},
        },
        mediaRef: optStr(x["media_ref"]),
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
        removed: x["removed"] === true,
      })),
    ),
  };
}
