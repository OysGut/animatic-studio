/**
 * Utfører én kommando mot prosjekttilstanden. Ren funksjon: (tilstand, kommando) → ny tilstand + invers.
 * Samme funksjon brukes i klienten (rask tilbakemelding) og på serveren (autoritativ, DEC-0022).
 */
import { isUuid, type BlockId, type TakeId, type VariantId } from "../ids";
import { checkInvariants } from "../invariants";
import { compareKeys, isValidOrderKey, keyBetween } from "../order-key";
import {
  PRIMARY_LANGUAGE,
  type BlockRevision,
  type ProjectState,
  type ScriptBlock,
  type Take,
} from "../model";
import type { Command, CommandEnvelope, CommandError, CommandErrorCode } from "./types";

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

function fail(code: CommandErrorCode, message: string, details?: readonly string[]): never {
  throw new CommandFailure(code, message, details);
}

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) fail("not_found", `${what} finnes ikke`);
  return value;
}

function assertNewId(s: ProjectState, id: string) {
  if (!isUuid(id)) fail("invalid", `Ugyldig ID ${id}`);
  const all = [s.productions, s.scenes, s.variants, s.blocks, s.occurrences, s.segments, s.takes];
  if (all.some((c) => c[id] !== undefined)) fail("duplicate_id", `ID ${id} er allerede i bruk`);
}

function assertKey(key: string) {
  if (!isValidOrderKey(key)) fail("invalid", `Ugyldig sorteringsnøkkel ${key}`);
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
  const variant = need(s.variants[variantId], "Varianten");
  const production = need(s.productions[productionId], "Produksjonen");
  if (variant.ownerProductionId === null) {
    if (production.kind !== "main") {
      fail(
        "must_fork_variant",
        "Scenen deles med hovedfilmen. Endringer i denne produksjonen lagres som egen scenevariant (ForkVariant først).",
      );
    }
  } else if (variant.ownerProductionId !== productionId) {
    fail("must_fork_variant", "Varianten tilhører en annen produksjon");
  }
}

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
    case "CreateProduction": {
      assertNewId(s, c.productionId);
      if (!c.name.trim()) fail("invalid", "Produksjonen må ha et navn");
      if (c.kind === "main" && Object.values(s.productions).some((p) => p.kind === "main")) {
        fail("invalid", "Prosjektet har allerede en hovedproduksjon");
      }
      if (c.parentProductionId !== null)
        need(s.productions[c.parentProductionId], "Overordnet produksjon");
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
      need(s.productions[c.productionId], "Produksjonen");
      if (Object.values(s.occurrences).some((o) => o.productionId === c.productionId)) {
        fail("referenced", "Produksjonen inneholder scener og kan ikke angres");
      }
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

    case "CreateScene": {
      const production = need(s.productions[c.productionId], "Produksjonen");
      for (const id of [c.sceneId, c.variantId, c.occurrenceId, ...c.blocks.map((b) => b.blockId)])
        assertNewId(s, id);
      if (new Set(c.blocks.map((b) => b.blockId)).size !== c.blocks.length)
        fail("duplicate_id", "Blokk-ID-er gjentas");
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
              storyTime: c.storyTime ?? { kind: "linear", anchorSceneId: null, offset: 0 },
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
      need(s.scenes[c.sceneId], "Scenen");
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
          (x.mergedIntoSceneId === c.sceneId || x.derivedFromSceneId === c.sceneId),
      );
      if (otherUse || otherVariants || hasTakes || hasSegments || referencedByScenes) {
        fail("referenced", "Scenen er tatt i bruk og kan ikke angres. Deaktiver den i stedet.");
      }
      const occ = need(s.occurrences[c.occurrenceId], "Forekomsten");
      const variant = need(s.variants[c.variantId], "Varianten");
      if (
        occ.sceneId !== c.sceneId ||
        variant.sceneId !== c.sceneId ||
        occ.variantId !== c.variantId
      ) {
        fail("invalid", "Scene, variant og forekomst hører ikke sammen");
      }
      {
        const now = Object.values(s.blocks)
          .filter((b) => b.variantId === c.variantId)
          .map((b) => b.id as string);
        const created = new Set(c.blockIds as readonly string[]);
        if (now.length !== created.size || now.some((id) => !created.has(id))) {
          fail(
            "referenced",
            "Scenen har fått eller mistet tekst etter at den ble laget, og kan ikke angres. Deaktiver den i stedet.",
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
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
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
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
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
      const b = need(s.blocks[c.blockId], "Manusblokken");
      assertCanEditVariant(s, c.productionId, b.variantId);
      if (b.text === c.text) fail("invalid", "Teksten er uendret");
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
        fail("invalid", "To blokker kan ikke ha samme plass");
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
      const b = need(s.blocks[c.blockId], "Manusblokken");
      if (Object.values(s.segments).some((g) => g.startBlockId === b.id || g.endBlockId === b.id)) {
        fail("referenced", "Blokken brukes av et produksjonssegment");
      }
      const { [b.id]: _b, ...blocks } = s.blocks;
      const owner = s.variants[b.variantId]?.ownerProductionId;
      const ctx = owner ?? Object.values(s.productions).find((p) => p.kind === "main")?.id;
      return {
        state: { ...s, blocks, blockRevisions: s.blockRevisions.filter((r) => r.blockId !== b.id) },
        inverse: {
          type: "InsertBlock",
          productionId: need(ctx, "Produksjon for blokken"),
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
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      const source = need(s.variants[o.variantId], "Varianten");
      if (source.ownerProductionId === o.productionId)
        fail("invalid", "Varianten eies allerede av produksjonen");
      assertNewId(s, c.newVariantId);
      const sourceBlocks = Object.values(s.blocks).filter((b) => b.variantId === source.id);
      const blocks = { ...s.blocks };
      const revisions = [...s.blockRevisions];
      for (const b of sourceBlocks) {
        const nid = c.blockIdMap[b.id];
        if (!nid) fail("invalid", `Mangler ny ID for blokk ${b.id}`);
        assertNewId(s, nid);
        blocks[nid] = { ...b, id: nid, revision: 1, variantId: c.newVariantId, currentRev: 1 };
        revisions.push(newRevision(nid, 1, b.text));
      }
      if (new Set(Object.values(c.blockIdMap)).size !== sourceBlocks.length)
        fail("invalid", "Blokk-ID-kartet er ufullstendig");
      return {
        state: {
          ...s,
          variants: {
            ...s.variants,
            [c.newVariantId]: {
              id: c.newVariantId,
              revision: 1,
              sceneId: source.sceneId,
              ownerProductionId: o.productionId,
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
          previousVariantId: source.id,
          newVariantId: c.newVariantId,
        },
        affected: [c.newVariantId, o.id, ...Object.values(c.blockIdMap)],
      };
    }

    case "UndoForkVariant": {
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      const nv = need(s.variants[c.newVariantId], "Varianten");
      need(s.variants[c.previousVariantId], "Opprinnelig variant");
      if (o.variantId !== nv.id) fail("invalid", "Forekomsten bruker ikke denne varianten");
      if (Object.values(s.occurrences).some((x) => x.variantId === nv.id && x.id !== o.id))
        fail("referenced", "Varianten brukes andre steder");
      const forked = Object.values(s.blocks).filter((b) => b.variantId === nv.id);
      if (forked.some((b) => b.currentRev > 1))
        fail("referenced", "Varianten er redigert; angre redigeringene først");
      const ids = new Set(forked.map((b) => b.id as string));
      const blocks = { ...s.blocks };
      for (const id of ids) delete blocks[id];
      const { [nv.id]: _nv, ...variants } = s.variants;
      // Gjenskap blokk-kartet for inversen
      const map: Record<string, BlockId> = {};
      for (const b of forked) {
        const src = Object.values(s.blocks).find(
          (x) => x.variantId === c.previousVariantId && x.orderKey === b.orderKey,
        );
        if (src) map[src.id] = b.id;
      }
      return {
        state: {
          ...s,
          variants,
          blocks,
          blockRevisions: s.blockRevisions.filter((r) => !ids.has(r.blockId)),
          occurrences: {
            ...s.occurrences,
            [o.id]: { ...o, variantId: c.previousVariantId, revision: rev(o) },
          },
        },
        inverse: { type: "ForkVariant", occurrenceId: o.id, newVariantId: nv.id, blockIdMap: map },
        affected: [nv.id, o.id, ...ids],
      };
    }

    case "AddOccurrence": {
      need(s.productions[c.productionId], "Produksjonen");
      const scene = need(s.scenes[c.sceneId], "Scenen");
      const variant = need(s.variants[c.variantId], "Varianten");
      if (variant.sceneId !== scene.id) fail("invalid", "Varianten tilhører en annen scene");
      if (variant.ownerProductionId !== null && variant.ownerProductionId !== c.productionId) {
        fail("must_fork_variant", "Varianten tilhører en annen produksjon");
      }
      assertNewId(s, c.occurrenceId);
      assertKey(c.orderKey);
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
            },
          },
        },
        inverse: { type: "UndoAddOccurrence", occurrenceId: c.occurrenceId },
        affected: [c.occurrenceId],
      };
    }

    case "UndoAddOccurrence": {
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      if (
        Object.values(s.takes).some((t) => t.occurrenceId === o.id) ||
        Object.values(s.segments).some((g) => g.occurrenceId === o.id)
      ) {
        fail("referenced", "Forekomsten har produksjonsmateriale. Deaktiver den i stedet.");
      }
      if (Object.values(s.occurrences).filter((x) => x.sceneId === o.sceneId).length <= 1) {
        fail(
          "referenced",
          "Siste forekomst av scenen kan bare fjernes ved å angre opprettelsen av scenen",
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
        },
        affected: [o.id],
      };
    }

    case "CreateSegments": {
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      if (c.segments.length === 0) fail("invalid", "Ingen segmenter oppgitt");
      const segments = { ...s.segments };
      for (const g of c.segments) {
        assertNewId(s, g.segmentId);
        assertKey(g.orderKey);
        for (const bid of [g.startBlockId, g.endBlockId]) {
          if (bid !== null) {
            const b = need(s.blocks[bid], "Blokken");
            if (b.variantId !== o.variantId)
              fail("invalid", "Segmentet viser til en blokk i en annen variant");
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
      const list = c.segmentIds.map((id) => need(s.segments[id], "Segmentet"));
      const ids = new Set(c.segmentIds as readonly string[]);
      if (Object.values(s.takes).some((t) => t.segmentId !== null && ids.has(t.segmentId))) {
        fail("referenced", "Segmentet har produsert materiale og kan ikke fjernes");
      }
      const segments = { ...s.segments };
      for (const id of ids) delete segments[id];
      const first = list[0]!;
      return {
        state: { ...s, segments },
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
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      assertNewId(s, c.takeId);
      if (c.segmentId !== null) {
        const g = need(s.segments[c.segmentId], "Segmentet");
        if (g.occurrenceId !== o.id) fail("invalid", "Segmentet tilhører en annen forekomst");
      }
      if (
        c.durationFrames !== null &&
        (!Number.isInteger(c.durationFrames) || c.durationFrames < 0)
      ) {
        fail("invalid", "Varighet må være et ikke-negativt heltall bilder");
      }
      const take: Take = {
        id: c.takeId,
        revision: 1,
        occurrenceId: o.id,
        segmentId: c.segmentId,
        kind: c.kind,
        status: c.status,
        durationFrames: c.durationFrames,
        producedFrom: { blockRevisions: currentBlockRevisions(s, o.variantId) },
        mediaRef: c.mediaRef,
      };
      return {
        state: { ...s, takes: { ...s.takes, [take.id]: take } },
        // Produsert materiale kastes aldri (INV-07, 21.5). Angre av «legg til» betyr bare at den ikke er aktiv.
        inverse: { type: "SetActiveTake", occurrenceId: o.id, takeId: o.activeTakeId },
        affected: [take.id],
      };
    }

    case "SetActiveTake": {
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      if (c.takeId !== null) {
        const t = need(s.takes[c.takeId], "Versjonen");
        const tOcc = need(s.occurrences[t.occurrenceId], "Forekomsten til versjonen");
        if (tOcc.sceneId !== o.sceneId) fail("invalid", "Versjonen tilhører en annen scene");
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
      need(s.productions[c.productionId], "Produksjonen");
      if (c.scenes.length === 0) fail("invalid", "Manuset inneholder ingen scener");
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
      const b = need(s.blocks[c.blockId], "Manusblokken");
      assertCanEditVariant(s, c.productionId, b.variantId);
      const removed = c.type === "RemoveBlock";
      if (b.removed === removed)
        fail("invalid", removed ? "Blokken er allerede fjernet" : "Blokken er ikke fjernet");
      if (
        removed &&
        Object.values(s.segments).some((g) => g.startBlockId === b.id || g.endBlockId === b.id)
      ) {
        fail("referenced", "Blokken brukes som grense for et produksjonssegment");
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
      const b = need(s.blocks[c.blockId], "Manusblokken");
      assertCanEditVariant(s, c.productionId, b.variantId);
      if (b.kind === c.kind) fail("invalid", "Elementtypen er uendret");
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
      const v = need(s.variants[c.variantId], "Varianten");
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
      const v = need(s.variants[c.targetId], "Blokken eller varianten");
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
      const occ = need(s.occurrences[c.occurrenceId], "Forekomsten");
      if (occ.productionId !== c.productionId)
        fail("invalid", "Forekomsten tilhører en annen produksjon");
      assertCanEditVariant(s, c.productionId, occ.variantId);
      const variant = need(s.variants[occ.variantId], "Varianten");
      const scene = need(s.scenes[occ.sceneId], "Scenen");
      const blocks = Object.values(s.blocks)
        .filter((b) => b.variantId === variant.id && !b.removed)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
      const idx = blocks.findIndex((b) => b.id === c.atBlockId);
      if (idx < 0) fail("not_found", "Blokken finnes ikke i scenen");
      if (idx === 0) fail("invalid", "Kan ikke splitte ved første blokk");
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
        fail("referenced", "Produksjonssegmenter viser til blokker som ville blitt flyttet");
      }
      assertNewId(s, c.newSceneId);
      assertNewId(s, c.newVariantId);
      const users = Object.values(s.occurrences).filter((o) => o.variantId === variant.id);
      // INV-04: splitting skal ikke legge til forekomster i andre produksjoner. Del varianten først (ForkVariant).
      if (users.some((u) => u.productionId !== c.productionId)) {
        fail(
          "must_fork_variant",
          "Scenen brukes også i en annen produksjon. Lag en egen variant før du splitter den.",
        );
      }
      for (const u of users) {
        const nid = c.newOccurrenceIds[u.id];
        if (!nid) fail("invalid", `Mangler ny forekomst for ${u.id}`);
        assertNewId(s, nid);
      }
      if (
        new Set(Object.values(c.newOccurrenceIds)).size !== users.length ||
        Object.keys(c.newOccurrenceIds).length !== users.length
      ) {
        fail("invalid", "Forekomstkartet stemmer ikke med bruken av scenen");
      }
      const blocksNext = { ...s.blocks };
      for (const b of moved)
        blocksNext[b.id] = { ...b, variantId: c.newVariantId, revision: rev(b) };
      const occNext = { ...s.occurrences };
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
        },
        affected: [c.newSceneId, c.newVariantId, ...Object.values(c.newOccurrenceIds), ...movedIds],
      };
    }

    case "UndoSplitScene": {
      const sp = c.split;
      const newScene = need(s.scenes[sp.newSceneId], "Den nye scenen");
      const nv = need(s.variants[sp.newVariantId], "Den nye varianten");
      const ov = need(s.variants[c.originalVariantId], "Den opprinnelige varianten");
      // Bare en ekte deling kan slås tilbake (kan ikke brukes til å slette eller flytte vilkårlige scener)
      if (
        nv.sceneId !== newScene.id ||
        newScene.derivedFromSceneId === null ||
        ov.sceneId !== newScene.derivedFromSceneId ||
        nv.ownerProductionId !== ov.ownerProductionId
      ) {
        fail("invalid", "Dette er ikke en deling som kan slås tilbake");
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
          fail("invalid", "Forekomstene stemmer ikke med delingen");
        }
      }
      if (
        Object.values(s.scenes).some(
          (x) => x.mergedIntoSceneId === newScene.id || x.derivedFromSceneId === newScene.id,
        )
      ) {
        fail("referenced", "Den nye scenen er brukt i en senere deling eller sammenslåing");
      }
      {
        const keys = new Set(
          Object.values(s.blocks)
            .filter((b) => b.variantId === ov.id)
            .map((b) => b.orderKey),
        );
        if (Object.values(s.blocks).some((b) => b.variantId === nv.id && keys.has(b.orderKey))) {
          fail("referenced", "Scenen er endret etter delingen og kan ikke slås tilbake automatisk");
        }
      }
      const newOccIds = new Set(Object.values(sp.newOccurrenceIds) as string[]);
      if (
        Object.values(s.occurrences).some(
          (o) => o.sceneId === sp.newSceneId && !newOccIds.has(o.id),
        )
      ) {
        fail("referenced", "Den nye scenen er tatt i bruk andre steder");
      }
      if (
        Object.values(s.takes).some((t) => newOccIds.has(t.occurrenceId)) ||
        Object.values(s.segments).some((g) => newOccIds.has(g.occurrenceId))
      ) {
        fail("referenced", "Den nye scenen har produksjonsmateriale og kan ikke slås tilbake");
      }
      const blocksNext = { ...s.blocks };
      for (const b of Object.values(s.blocks))
        if (b.variantId === nv.id)
          blocksNext[b.id] = { ...b, variantId: c.originalVariantId, revision: rev(b) };
      const occNext = { ...s.occurrences };
      for (const id of newOccIds) delete occNext[id];
      const { [sp.newSceneId]: _sc, ...scenes } = s.scenes;
      const { [sp.newVariantId]: _v, ...variants } = s.variants;
      return {
        state: { ...s, scenes, variants, blocks: blocksNext, occurrences: occNext },
        inverse: { type: "SplitScene", ...sp },
        affected: [
          sp.newSceneId,
          sp.newVariantId,
          ...newOccIds,
          ...Object.values(s.blocks)
            .filter((b) => b.variantId === nv.id)
            .map((b) => b.id),
        ],
      };
    }

    case "MergeScenes": {
      const target = need(s.occurrences[c.targetOccurrenceId], "Målscenen");
      const source = need(s.occurrences[c.sourceOccurrenceId], "Kildescenen");
      if (target.productionId !== c.productionId || source.productionId !== c.productionId)
        fail("invalid", "Begge scenene må være i samme produksjon");
      if (target.sceneId === source.sceneId)
        fail("invalid", "Kan ikke slå en scene sammen med seg selv");
      assertCanEditVariant(s, c.productionId, target.variantId);
      assertCanEditVariant(s, c.productionId, source.variantId);
      const sourceScene = need(s.scenes[source.sceneId], "Kildescenen");
      if (sourceScene.mergedIntoSceneId !== null)
        fail("invalid", "Kildescenen er allerede slått sammen med en annen scene");
      if (need(s.scenes[target.sceneId], "Målscenen").mergedIntoSceneId !== null)
        fail("invalid", "Målscenen er slått sammen med en annen scene");
      if (
        Object.values(s.occurrences).some((o) => o.sceneId === source.sceneId && o.id !== source.id)
      ) {
        fail(
          "referenced",
          "Kildescenen brukes også i andre produksjoner. Slå sammen der den bare finnes én gang.",
        );
      }
      if (Object.values(s.segments).some((g) => g.occurrenceId === source.id))
        fail("referenced", "Kildescenen har produksjonssegmenter");
      // INV-04: teksten i en scene som også brukes i andre produksjoner endres ikke herfra
      if (
        Object.values(s.occurrences).some(
          (o) => o.variantId === target.variantId && o.productionId !== c.productionId,
        )
      ) {
        fail(
          "must_fork_variant",
          "Målscenen brukes også i en annen produksjon. Lag en egen variant før du slår sammen.",
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
          },
        },
        inverse: {
          type: "UnmergeScenes",
          productionId: c.productionId,
          targetOccurrenceId: target.id,
          sourceOccurrenceId: source.id,
          placements,
          sourceWasActive: source.active,
        },
        affected: [sourceScene.id, source.id, ...placements.map((p) => p.blockId)],
      };
    }

    case "UnmergeScenes": {
      const source = need(s.occurrences[c.sourceOccurrenceId], "Kildescenen");
      const sourceScene = need(s.scenes[source.sceneId], "Kildescenen");
      if (sourceScene.mergedIntoSceneId === null) fail("invalid", "Scenen er ikke slått sammen");
      const target = need(s.occurrences[c.targetOccurrenceId], "Målscenen");
      if (
        sourceScene.mergedIntoSceneId !== target.sceneId ||
        source.productionId !== c.productionId
      ) {
        fail("invalid", "Sammenslåingen stemmer ikke");
      }
      assertCanEditVariant(s, c.productionId, source.variantId);
      if (new Set(c.placements.map((p) => p.blockId)).size !== c.placements.length) {
        fail("invalid", "Blokker gjentas");
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
          fail("invalid", "Blokkene stemmer ikke med sammenslåingen");
        }
      }
      for (const p of c.placements) {
        const b = need(s.blocks[p.blockId], "Blokken");
        if (b.variantId !== target.variantId || p.variantId !== source.variantId) {
          fail("invalid", "Blokken var ikke en del av sammenslåingen");
        }
        assertKey(p.orderKey);
      }
      const blocksNext = { ...s.blocks };
      for (const p of c.placements) {
        const b = need(s.blocks[p.blockId], "Blokken");
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
          },
        },
        inverse: {
          type: "MergeScenes",
          productionId: c.productionId,
          targetOccurrenceId: c.targetOccurrenceId,
          sourceOccurrenceId: c.sourceOccurrenceId,
        },
        affected: [sourceScene.id, source.id, ...c.placements.map((p) => p.blockId)],
      };
    }

    case "SetStoryTime": {
      const sc = need(s.scenes[c.sceneId], "Scenen");
      if (c.storyTime.kind === "linear" && c.storyTime.anchorSceneId !== null)
        fail("invalid", "Lineære scener har ikke anker");
      if (c.storyTime.anchorSceneId !== null) {
        need(s.scenes[c.storyTime.anchorSceneId], "Ankerscenen");
        if (c.storyTime.anchorSceneId === sc.id)
          fail("invalid", "En scene kan ikke ankres til seg selv");
        // Ingen sykliske ankre (fortellingstiden må kunne beregnes, INV-09)
        let cur: string | null = c.storyTime.anchorSceneId;
        const seen = new Set<string>();
        while (cur !== null && !seen.has(cur)) {
          if (cur === sc.id) fail("invalid", "Ankeret ville gitt en sirkel i fortellingstiden");
          seen.add(cur);
          const anc: typeof sc | undefined = s.scenes[cur];
          cur = anc && anc.storyTime.kind !== "linear" ? anc.storyTime.anchorSceneId : null;
        }
      }
      if (!Number.isFinite(c.storyTime.offset)) fail("invalid", "Ugyldig forskyvning");
      return {
        state: {
          ...s,
          scenes: { ...s.scenes, [sc.id]: { ...sc, storyTime: c.storyTime, revision: rev(sc) } },
        },
        inverse: { type: "SetStoryTime", sceneId: sc.id, storyTime: sc.storyTime },
        affected: [sc.id],
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
            message: "Noen andre har endret dette i mellomtiden",
            details: stale,
          },
        };
      }
    }
    const { state: next, inverse, affected } = run(state, env);
    const violations = checkInvariants(next);
    if (violations.length > 0) {
      return {
        ok: false,
        error: {
          code: "invariant_violation",
          message: "Endringen ville brutt en systemregel",
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
