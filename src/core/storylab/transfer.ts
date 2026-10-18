/** SL6: explicit, reversible transfer plans. No persistence or mutation of the source state. */
import type { Command } from "../commands/types";
import { applyCommand } from "../commands/apply";
import { L } from "../i18n";
import { newId, type ProductionId, type VariantId, type UserId } from "../ids";
import { mainProduction, type ProjectState } from "../model";
import { keyBetween } from "../order-key";
import { blocksOfVariant } from "../views";
import { activeProfileOf } from "./stages";
import { canHaveStoryProfile, emptyStoryProfile, mergeProfile, profilePatchError, type StoryProfilePatch } from "./profile";

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
    if (!("assetId" in target)) return fail(L("Velg en karakterprofil.", "Choose a character profile."));
    const asset = state.assets[target.assetId];
    if (!asset || asset.removed || !canHaveStoryProfile(asset.kind)) return fail(L("Karakteren finnes ikke.", "The character does not exist."));
    const patch = suggestionProfilePatch(p);
    if (!patch) return fail(L("Forslaget inneholder ingen gyldige profilfelt.", "The suggestion contains no valid profile fields."));
    const current = activeProfileOf(state, asset.id);
    commands.push({ type: "SetStoryProfile", assetId: asset.id, profileId: current?.id ?? newId<"story_profile">(), profile: mergeProfile(current?.profile ?? emptyStoryProfile(), patch) });
  } else {
    if (!("variantId" in target)) return fail(L("Velg en scene i hovedproduksjonen.", "Choose a scene in the main production."));
    const main = mainProduction(state);
    const variant = state.variants[target.variantId];
    const occurrence = Object.values(state.occurrences).find((o) => o.active && o.productionId === target.productionId && o.variantId === target.variantId);
    if (!main || main.id !== target.productionId || !variant || !occurrence || !state.scenes[variant.sceneId]) return fail(L("Scenen finnes ikke i hovedproduksjonen.", "The scene does not exist in the main production."));
    if (typeof p["sceneId"] === "string" && !state.scenes[p["sceneId"]]) return fail(L("Kildescenen finnes ikke.", "The source scene does not exist."));
    const blocks = blocksOfVariant(state, target.variantId);
    const after = target.afterBlockId === null ? undefined : blocks.find((b) => b.id === target.afterBlockId);
    if (target.afterBlockId !== null && !after) return fail(L("Blokken finnes ikke i denne scenen.", "The block does not exist in this scene."));
    const productionId = target.productionId as ProductionId;
    const variantId = target.variantId as VariantId;
    if (suggestion.kind === "line" && typeof p["blockId"] === "string") {
      const block = blocks.find((b) => b.id === p["blockId"]);
      if (!block || block.kind !== "dialogue") return fail(L("Replikken finnes ikke i denne scenen.", "The line does not exist in this scene."));
      if (p["sceneId"] && p["sceneId"] !== variant.sceneId) return fail(L("Forslaget hører til en annen scene.", "The suggestion belongs to another scene."));
      commands.push({ type: "EditBlockText", productionId, blockId: block.id, text: suggestionText(suggestion) });
    } else if (suggestion.kind === "line" || suggestion.kind === "scene_draft") {
      const raw = suggestion.kind === "line" ? [p] : p["turns"] ?? p["lines"];
      if (!Array.isArray(raw) || raw.length === 0) return fail(L("Utkastet har ingen replikker.", "The draft has no lines."));
      // Removed blocks still occupy keys in InsertBlock; include them when finding the next key.
      const occupied = Object.values(state.blocks).filter((b) => b.variantId === variantId).sort((a, b) => a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0);
      let previous = after?.orderKey ?? null;
      const next = occupied.find((b) => previous === null || b.orderKey > previous)?.orderKey ?? null;
      for (const value of raw) {
        if (!value || typeof value !== "object") return fail(L("Ugyldig replikk i utkastet.", "Invalid line in the draft."));
        const line = value as Record<string, unknown>;
        const speaker = textOf(line, "speakerAssetId") || textOf(line, "speaker") || textOf(line, "assetId");
        const asset = state.assets[speaker];
        if (!asset || asset.removed || !canHaveStoryProfile(asset.kind)) return fail(L("Taleren finnes ikke i biblioteket.", "The speaker does not exist in the library."));
        const text = textOf(line, "text");
        if (!text.trim()) return fail(L("Replikken er tom.", "The line is empty."));
        for (const [kind, content] of [["character", asset.name.toUpperCase()], ["dialogue", text]] as const) {
          previous = keyBetween(previous, next);
          commands.push({ type: "InsertBlock", productionId, variantId, block: { blockId: newId<"script_block">(), kind, text: content, orderKey: previous } });
        }
      }
    } else {
      const evidence = Array.isArray(p["evidence"]) ? p["evidence"][0] : undefined;
      const block = blocks.find((b) => b.id === evidence) ?? blocks[0];
      if (!block) return fail(L("Scenen har ingen blokk å feste notatet til.", "The scene has no block to attach the note to."));
      const source = L(`Fra Story Lab, økt ${suggestion.sessionId ?? "–"}, tur ${suggestion.turnId ?? "–"}.`, `From Story Lab, session ${suggestion.sessionId ?? "–"}, turn ${suggestion.turnId ?? "–"}.`);
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