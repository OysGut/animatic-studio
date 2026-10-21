/**
 * Oppdatering av materialet med AI ved manusavvik (M6, valg B, DEC-0054, REQ-0877–0879). Finner hva en
 * manusendring berører i 2D-scenen og bygger forslaget som sendes til tekst-AI. Resultatet er bare forslag:
 * - bildelag: en ny bildebeskrivelse; et nytt bilde blir en ny versjon som brukeren selv tar i bruk;
 * - replikker: røde replikker går til DV7 «Generer røde replikker»;
 * - handling/shot: et forslag til ny scenebeskrivelse eller shot, lagret som notat på linjen.
 * Ingen kommando herfra endrer manuset, ferdig film eller godkjente versjoner.
 */
import type { Command } from "../commands/types";
import type { ProjectState } from "../model";
import { assetNames } from "../library";
import { collation } from "../i18n";
import { lineDrift } from "../dialogue/drift";
import { dialogueSpeaker } from "../dialogue/characters";
import { nameKey } from "../library";
import { layerFieldsOf } from "../composition";
import type { ScriptChange } from "./discrepancy";

export interface ImageTarget {
  readonly layerId: string;
  readonly assetId: string;
  readonly variantId: string | null;
  readonly versionId: string | null;
  readonly name: string;
}
export interface ShotTarget {
  readonly blockId: string;
  readonly oldText: string | null;
  readonly newText: string;
}
export interface MaterialUpdateTargets {
  readonly images: readonly ImageTarget[];
  /** Karakterene med røde replikker blant de endrede (DV7). */
  readonly dialogueCharacters: readonly string[];
  readonly shots: readonly ShotTarget[];
}

const lower = (w: string) => w.toLocaleLowerCase(collation());

export function materialUpdateTargets(
  s: ProjectState,
  occurrenceId: string,
  changes: readonly ScriptChange[],
): MaterialUpdateTargets {
  const o = s.occurrences[occurrenceId];
  if (!o) return { images: [], dialogueCharacters: [], shots: [] };
  const changedText = changes.map((c) => `${c.oldText ?? ""} ${c.newText ?? ""}`).join(" \n ");
  const hay = lower(changedText);
  const mentioned = (assetId: string) => {
    const a = s.assets[assetId];
    if (!a) return false;
    return assetNames(a).some((n) => {
      const k = lower(n.trim());
      return k.length >= 2 && new RegExp(`(^|[^\\p{L}\\p{N}])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(hay);
    });
  };
  const comps = Object.values(s.compositions).filter(
    (c) => !c.removed && c.variantId === o.variantId,
  );
  const compIds = new Set(comps.map((c) => c.id as string));
  const images: ImageTarget[] = [];
  const seenAsset = new Set<string>();
  for (const l of Object.values(s.layers)) {
    if (l.removed || !compIds.has(l.compositionId) || l.kind === "group" || l.kind === "text" || !l.assetId) continue;
    if (seenAsset.has(l.assetId) || !mentioned(l.assetId)) continue;
    seenAsset.add(l.assetId);
    images.push({
      layerId: l.id,
      assetId: l.assetId,
      variantId: l.assetVariantId,
      versionId: l.versionId,
      name: s.assets[l.assetId]?.name ?? l.name,
    });
  }
  const chars = new Set<string>();
  for (const c of changes) {
    if (c.blockKind !== "dialogue" || c.newText === null) continue;
    if (lineDrift(s, occurrenceId, c.blockId).status !== "drift") continue;
    const clip = Object.values(s.audioClips).find(
      (a) => !a.removed && a.kind === "dialogue" && a.occurrenceId === occurrenceId && a.blockId === c.blockId,
    );
    let id = clip?.characterAssetId ?? null;
    if (!id) {
      const k = nameKey(dialogueSpeaker(s, occurrenceId, c.blockId));
      const m = Object.values(s.assets).filter((a) => !a.removed && assetNames(a).some((n) => nameKey(n) === k));
      id = m.length === 1 ? m[0]!.id : null;
    }
    if (id) chars.add(id);
  }
  const shots: ShotTarget[] = changes
    .filter((c) => (c.blockKind === "action" || c.blockKind === "shot") && c.newText !== null)
    .map((c) => ({ blockId: c.blockId, oldText: c.oldText, newText: c.newText! }));
  return { images, dialogueCharacters: [...chars], shots };
}

/** Engelsk prompt for tekst-AI. Bare endringene, de berørte ressursene og deres visuelle faktaark sendes. */
export function materialUpdatePrompt(
  s: ProjectState,
  targets: MaterialUpdateTargets,
  changes: readonly ScriptChange[],
): { system: string; user: string } {
  const system =
    "You help update animatic material after a screenplay change. Keep the existing visual identity of each " +
    "asset. Reply with JSON only: {\"images\":[{\"assetId\":string,\"prompt\":string}]," +
    "\"shots\":[{\"blockId\":string,\"text\":string}]}. Image prompts are concise English image descriptions " +
    "(max 600 characters) showing the asset as the changed action requires. Shot texts are a short suggested " +
    "shot or scene description (max 300 characters) for the changed line. Only use the ids given.";
  const lines = changes
    .slice(0, 30)
    .map((c) => `- ${c.blockKind} ${c.blockId}: "${(c.oldText ?? "").slice(0, 400)}" -> "${(c.newText ?? "(removed)").slice(0, 400)}"`)
    .join("\n");
  const imgs = targets.images
    .map((t) => {
      const a = s.assets[t.assetId];
      const brief = a?.visualBrief || a?.description || "";
      return `- assetId ${t.assetId}: ${t.name}. ${brief.slice(0, 500)}`;
    })
    .join("\n");
  const shots = targets.shots.map((t) => `- blockId ${t.blockId}`).join("\n");
  return {
    system,
    user: `SCRIPT CHANGES\n${lines}\n\nIMAGE ASSETS TO UPDATE\n${imgs || "(none)"}\n\nLINES THAT NEED A SHOT SUGGESTION\n${shots || "(none)"}`,
  };
}

export interface MaterialUpdateSuggestions {
  readonly images: readonly { readonly assetId: string; readonly prompt: string }[];
  readonly shots: readonly { readonly blockId: string; readonly text: string }[];
}

/** Validerer AI-svaret mot målene (ukjente ID-er og tomme tekster forkastes; lengder kuttes). */
export function materialUpdateFromJson(parsed: unknown, targets: MaterialUpdateTargets): MaterialUpdateSuggestions | null {
  if (!parsed || typeof parsed !== "object") return null;
  const x = parsed as Record<string, unknown>;
  const imgIds = new Set(targets.images.map((t) => t.assetId));
  const shotIds = new Set(targets.shots.map((t) => t.blockId));
  const images: { assetId: string; prompt: string }[] = [];
  const shots: { blockId: string; text: string }[] = [];
  for (const i of Array.isArray(x["images"]) ? x["images"] : []) {
    const r = i as Record<string, unknown>;
    const id = r?.["assetId"];
    const p = r?.["prompt"];
    if (typeof id === "string" && imgIds.has(id) && typeof p === "string" && p.trim() && !images.some((y) => y.assetId === id))
      images.push({ assetId: id, prompt: p.trim().slice(0, 1200) });
  }
  for (const i of Array.isArray(x["shots"]) ? x["shots"] : []) {
    const r = i as Record<string, unknown>;
    const id = r?.["blockId"];
    const t = r?.["text"];
    if (typeof id === "string" && shotIds.has(id) && typeof t === "string" && t.trim() && !shots.some((y) => y.blockId === id))
      shots.push({ blockId: id, text: t.trim().slice(0, 600) });
  }
  return images.length || shots.length ? { images, shots } : null;
}

/** Notatet et shotforslag lagres som (på linjen; manuset endres ikke). */
export function shotSuggestionNote(
  s: ProjectState,
  blockId: string,
  text: string,
  annotationId: string,
  prefix: string,
  authorName: string,
): Command | null {
  const b = s.blocks[blockId];
  if (!b) return null;
  return {
    type: "AddAnnotations",
    annotations: [
      {
        annotationId,
        variantId: null,
        blockId,
        start: 0,
        end: b.text.length,
        quote: b.text.slice(0, 200),
        text: `${prefix} ${text}`.slice(0, 2000),
        authorName,
      },
    ],
  } as unknown as Command;
}

/** Kommandoen som tar en ny bildeversjon i bruk på laget (eget, eksplisitt klikk; kan angres). */
export function useVersionOnLayerCommand(
  s: ProjectState,
  layerId: string,
  variantId: string,
  versionId: string,
): Command | null {
  const layer = s.layers[layerId];
  if (!layer || layer.removed) return null;
  // Hele feltsettet sendes (valideringen krever det); bare bildet byttes
  return {
    type: "UpdateLayers",
    layers: [{ layerId, fields: { ...layerFieldsOf(layer), assetVariantId: variantId, versionId } }],
  } as unknown as Command;
}
