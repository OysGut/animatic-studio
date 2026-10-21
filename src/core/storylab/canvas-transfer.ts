/**
 * Overføring fra skrivecanvaset til prosjektet (SL7 §5): ren planlegging av kommandoene. Ingenting skjer
 * automatisk; brukerflaten viser forhåndsvisningen og kjører kommandoene som én angregruppe.
 * - Karakter eller dyr: CreateAssets (+ valgfri tom profil med teksten som notat) og kobling av noden.
 * - Sted: CreateAssets (location) og kobling.
 * - Scene: CreateScene i hovedproduksjonen etter valgt scene, med overskrift og en handlingsblokk, og kobling.
 */
import type { Command } from "../commands/types";

import { newId } from "../ids";
import { mainProduction, type CanvasNode, type ProjectState } from "../model";
import { compareKeys, keyBetween } from "../order-key";
import { parseHeading } from "../screenplay/parse";
import { emptyStoryProfile } from "./profile";
import { t } from "@/core/i18n/keyed";

export type CanvasTransferTarget =
  | { readonly kind: "asset"; readonly assetKind: "character" | "animal" | "location"; readonly withProfile?: boolean }
  /** `afterOccurrenceId` null = først i filmen. */
  | { readonly kind: "scene"; readonly afterOccurrenceId: string | null };

export type CanvasTransfer =
  | {
      readonly ok: true;
      readonly commands: readonly Command[];
      /** Det som ble laget (for lenken til resultatet). */
      readonly result:
        | { readonly kind: "asset"; readonly assetId: string }
        | { readonly kind: "scene"; readonly occurrenceId: string; readonly sceneId: string };
    }
  | { readonly ok: false; readonly message: string };

export type IdMaker = (kind: string) => string;
const defaultIds: IdMaker = (k) => newId(k as never);

/** Hvilke overføringer passer for noden? */
export function canvasTransferKinds(n: Pick<CanvasNode, "kind" | "assetId" | "sceneId">): ("character" | "animal" | "location" | "scene")[] {
  if (n.assetId || n.sceneId) return [];
  if (n.kind === "character") return ["character", "animal"];
  if (n.kind === "location") return ["location"];
  if (n.kind === "scene") return ["scene"];
  return [];
}

export function canvasNodeToCommands(
  state: ProjectState,
  nodeId: string,
  target: CanvasTransferTarget,
  ids: IdMaker = defaultIds,
): CanvasTransfer {
  const n = state.canvasNodes[nodeId];
  if (!n || n.removed) return { ok: false, message: t("core-storylab-canvas-transfer.message.message.7c429b6b9b98") };
  if (n.assetId || n.sceneId)
    return { ok: false, message: t("core-storylab-canvas-transfer.message.message.f305644f6e77") };
  const name = n.title.trim();
  if (!name) return { ok: false, message: t("core-storylab-canvas-transfer.message.message.c9e7ded51821") };

  if (target.kind === "asset") {
    const allowed = canvasTransferKinds(n);
    if (!allowed.includes(target.assetKind))
      return { ok: false, message: t("core-storylab-canvas-transfer.message.message.69ed2900865c") };
    const assetId = ids("asset");
    const commands: Command[] = [
      {
        type: "CreateAssets",
        assets: [
          {
            assetId: assetId as never,
            fields: { kind: target.assetKind, name: name.slice(0, 200), names: [], description: target.assetKind === "location" ? n.body : "", category: "", tags: [] },
          },
        ],
      },
    ];
    if (target.withProfile && target.assetKind !== "location")
      commands.push({
        type: "SetStoryProfile",
        profileId: ids("story_profile") as never,
        assetId: assetId as never,
        profile: { ...emptyStoryProfile(), notes: n.body.slice(0, 8000) },
      });
    commands.push({ type: "UpdateCanvasNode", nodeId: n.id, patch: { assetId: assetId as never } });
    return { ok: true, commands, result: { kind: "asset", assetId } };
  }

  if (n.kind !== "scene")
    return { ok: false, message: t("core-storylab-canvas-transfer.message.message.4d676b0723ab") };
  const main = mainProduction(state);
  if (!main) return { ok: false, message: t("core-storylab-canvas-transfer.message.message.13d3f8f4ba0b") };
  const occ = Object.values(state.occurrences)
    .filter((o) => o.productionId === main.id)
    .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
  let prev: string | null = null;
  let next: string | null = occ[0]?.orderKey ?? null;
  if (target.afterOccurrenceId !== null) {
    const i = occ.findIndex((o) => o.id === target.afterOccurrenceId);
    if (i < 0 || !occ[i]!.active)
      return { ok: false, message: t("core-storylab-canvas-transfer.message.message.105cb913d896") };
    prev = occ[i]!.orderKey;
    next = occ[i + 1]?.orderKey ?? null;
  }
  const heading = parseHeading(name);
  const sceneId = ids("scene");
  const occurrenceId = ids("scene_occurrence");
  return {
    ok: true,
    commands: [
      {
        type: "CreateScene",
        productionId: main.id,
        sceneId: sceneId as never,
        variantId: ids("scene_variant") as never,
        occurrenceId: occurrenceId as never,
        orderKey: keyBetween(prev, next),
        heading: {
          intExt: heading.intExt || "INT.",
          location: (heading.location || name).toUpperCase(),
          time: heading.time,
        },
        blocks: [{ blockId: ids("script_block") as never, kind: "action", text: n.body, orderKey: "i" }],
        productionNumber: null,
      },
      { type: "UpdateCanvasNode", nodeId: n.id, patch: { sceneId: sceneId as never } },
    ],
    result: { kind: "scene", occurrenceId, sceneId },
  };
}
