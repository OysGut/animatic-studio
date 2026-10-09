/**
 * Endringssett mellom to tilstander (DEC-0022). Serveren kjører kommandoen i kjernen og sender
 * endringssettet til databasen, som lagrer alt atomisk og avviser det hvis noen rad har fått ny
 * revisjon i mellomtiden (INV-C1). Radformatet (snake_case) er lagringsformatet i DATA_RELATIONSHIPS.md.
 */
import type {
  BlockRevision,
  CollectionName,
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
  Production | Scene | SceneVariant | ScriptBlock | SceneOccurrence | ProductionSegment | Take;

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
}

const str = (v: unknown) => String(v);
const optStr = (v: unknown) => (v === null || v === undefined ? null : String(v));
const num = (v: unknown) => Number(v);
const optNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

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
  };
}
