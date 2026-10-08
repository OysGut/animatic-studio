/**
 * Utfører én kommando mot prosjekttilstanden. Ren funksjon: (tilstand, kommando) → ny tilstand + invers.
 * Samme funksjon brukes i klienten (rask tilbakemelding) og på serveren (autoritativ, DEC-0022).
 */
import { isUuid, type BlockId, type TakeId, type VariantId } from "../ids";
import { checkInvariants } from "../invariants";
import { isValidOrderKey } from "../order-key";
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
  for (const b of Object.values(s.blocks)) if (b.variantId === variantId) out[b.id] = b.currentRev;
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
      if (otherUse || otherVariants || hasTakes || hasSegments) {
        fail("referenced", "Scenen er tatt i bruk og kan ikke angres. Deaktiver den i stedet.");
      }
      const occ = need(s.occurrences[c.occurrenceId], "Forekomsten");
      const variant = need(s.variants[c.variantId], "Varianten");
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
          })),
          storyTime: scene!.storyTime,
          productionNumber: occ.productionNumber,
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
          block: { blockId: b.id, kind: b.kind, text: b.text, orderKey: b.orderKey },
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
