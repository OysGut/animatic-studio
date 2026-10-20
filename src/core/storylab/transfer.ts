/** SL6: explicit, reversible transfer plans. No persistence or mutation of the source state. */
import type { Command } from "../commands/types";
import { applyCommand } from "../commands/apply";

import { newId, type ProductionId, type VariantId, type UserId } from "../ids";
import { mainProduction, type ProjectState } from "../model";
import { keyBetween } from "../order-key";
import { blocksOfVariant } from "../views";
import { activeProfileOf } from "./stages";
import { canHaveStoryProfile, emptyStoryProfile, mergeProfile, profilePatchError, type StoryProfilePatch } from "./profile";
import { t } from "@/core/i18n/keyed";

export type SuggestionKind = "line" | "scene_draft" | "profile_change" | "analysis" | "motivation" | "plot_point";
export interface TransferSuggestion {
  readonly id: string;
  readonly kind: SuggestionKind;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly sessionId?: string | null;
  readonly turnId?: string | null;
}
export type SuggestionTarget = { readonly productionId: string; readonly variantId: string; readonly afterBlockId: string | null } | { readonly assetId: string };
export type SuggestionTransfer = { readonly ok: true; readonly commands: readonly Command[] } | { readonly ok: false; readonly message: string };
const textOf = (p: Readonly<Record<string, unknown>>, key: string) => typeof p[key] === "string" ? p[key] as string : "";

/** Accept full profiles or validated partial profiles; never infer personality from free text. */
export function suggestionProfilePatch(p: Readonly<Record<string, unknown>>): StoryProfilePatch | null {
  let value = p["profile"] ?? p["patch"];
  if (!value && typeof p["text"] === "string") {
    try { value = JSON.parse(p["text"]); } catch { return null; }
  }
  return value && !profilePatchError(value) ? value as StoryProfilePatch : null;
}

export function suggestionText(s: Pick<TransferSuggestion, "payload">): string {
  const p = s.payload;
  return textOf(p, "text") || [textOf(p, "finding"), textOf(p, "suggestion"), textOf(p, "motivation")].filter(Boolean).join("\n") || JSON.stringify(p);
}

export function suggestionToCommands(state: ProjectState, suggestion: TransferSuggestion, target: SuggestionTarget): SuggestionTransfer {
  const fail = (message: string): SuggestionTransfer => ({ ok: false, message });
  const p = suggestion.payload;
  const commands: Command[] = [];
  if (suggestion.kind === "profile_change") {
    if (!("assetId" in target)) return fail(t("core-storylab-transfer.suggestion-to-commands.fail.80765abd2eac"));
    const asset = state.assets[target.assetId];
    if (!asset || asset.removed || !canHaveStoryProfile(asset.kind)) return fail(t("core-storylab-transfer.suggestion-to-commands.fail.d2f3a11d5d5d"));
    const patch = suggestionProfilePatch(p);
    if (!patch) return fail(t("core-storylab-transfer.suggestion-to-commands.fail.5227eb7e2b39"));
    const current = activeProfileOf(state, asset.id);
    commands.push({ type: "SetStoryProfile", assetId: asset.id, profileId: current?.id ?? newId<"story_profile">(), profile: mergeProfile(current?.profile ?? emptyStoryProfile(), patch) });
  } else {
    if (!("variantId" in target)) return fail(t("core-storylab-transfer.suggestion-to-commands.fail.e5e73b546e44"));
    const main = mainProduction(state);
    const variant = state.variants[target.variantId];
    const occurrence = Object.values(state.occurrences).find((o) => o.active && o.productionId === target.productionId && o.variantId === target.variantId);
    if (!main || main.id !== target.productionId || !variant || !occurrence || !state.scenes[variant.sceneId]) return fail(t("core-storylab-transfer.suggestion-to-commands.fail.852626d343a1"));
    if (typeof p["sceneId"] === "string" && !state.scenes[p["sceneId"]]) return fail(t("core-storylab-transfer.suggestion-to-commands.fail.c2d776717e6e"));
    const blocks = blocksOfVariant(state, target.variantId);
    const after = target.afterBlockId === null ? undefined : blocks.find((b) => b.id === target.afterBlockId);
    if (target.afterBlockId !== null && !after) return fail(t("core-storylab-transfer.suggestion-to-commands.fail.8b8d2a674221"));
    const productionId = target.productionId as ProductionId;
    const variantId = target.variantId as VariantId;
    if (suggestion.kind === "line" && typeof p["blockId"] === "string") {
      const block = blocks.find((b) => b.id === p["blockId"]);
      if (!block || block.kind !== "dialogue") return fail(t("core-storylab-transfer.suggestion-to-commands.fail.c7530381cb7e"));
      if (p["sceneId"] && p["sceneId"] !== variant.sceneId) return fail(t("core-storylab-transfer.suggestion-to-commands.fail.f75108e116b8"));
      commands.push({ type: "EditBlockText", productionId, blockId: block.id, text: suggestionText(suggestion) });
    } else if (suggestion.kind === "line" || suggestion.kind === "scene_draft") {
      const raw = suggestion.kind === "line" ? [p] : p["turns"] ?? p["lines"];
      if (!Array.isArray(raw) || raw.length === 0) return fail(t("core-storylab-transfer.suggestion-to-commands.fail.8bfa3786e1b8"));
      // Removed blocks still occupy keys in InsertBlock; include them when finding the next key.
      const occupied = Object.values(state.blocks).filter((b) => b.variantId === variantId).sort((a, b) => a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0);
      let previous = after?.orderKey ?? null;
      const next = occupied.find((b) => previous === null || b.orderKey > previous)?.orderKey ?? null;
      for (const value of raw) {
        if (!value || typeof value !== "object") return fail(t("core-storylab-transfer.suggestion-to-commands.fail.118622112c65"));
        const line = value as Record<string, unknown>;
        const speaker = textOf(line, "speakerAssetId") || textOf(line, "speaker") || textOf(line, "assetId");
        const asset = state.assets[speaker];
        if (!asset || asset.removed || !canHaveStoryProfile(asset.kind)) return fail(t("core-storylab-transfer.suggestion-to-commands.fail.528ee8ac38d8"));
        const text = textOf(line, "text");
        if (!text.trim()) return fail(t("core-storylab-transfer.suggestion-to-commands.fail.fad8ed846920"));
        for (const [kind, content] of [["character", asset.name.toUpperCase()], ["dialogue", text]] as const) {
          previous = keyBetween(previous, next);
          commands.push({ type: "InsertBlock", productionId, variantId, block: { blockId: newId<"script_block">(), kind, text: content, orderKey: previous } });
        }
      }
    } else {
      const evidence = Array.isArray(p["evidence"]) ? p["evidence"][0] : undefined;
      const block = blocks.find((b) => b.id === evidence) ?? blocks[0];
      if (!block) return fail(t("core-storylab-transfer.suggestion-to-commands.fail.f848b72c387e"));
      const source = t("core-storylab-transfer.source.message.d6d308540381", { value1: String(suggestion.sessionId ?? "–"), value2: String(suggestion.turnId ?? "–") });
      commands.push({ type: "AddAnnotations", annotations: [{ annotationId: newId<"annotation">(), blockId: block.id, variantId: null, start: 0, end: 0, quote: "", text: `${suggestionText(suggestion)}\n\n${source}`, authorName: "Animatic Studio", source: "system" }] });
    }
  }
  // Reuse command validation (including INV-04), without altering the caller's state.
  let next = state;
  for (const command of commands) {
    const r = applyCommand(next, { id: newId<"command">(), actor: "00000000-0000-7000-8000-000000000000" as UserId, at: "2026-01-01T00:00:00.000Z", command });
    if (!r.ok) return fail(r.error.message);
    next = r.state;
  }
  return { ok: true, commands };
}