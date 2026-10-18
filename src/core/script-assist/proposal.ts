/**
 * Skrivehjelp i manuset (T2): forslagene. Et forslag finnes bare i minnet til brukeren velger «Bruk»,
 * «Bruk valgte», «Lagre som forsøksvis redigering» eller «Forkast». Ingenting skrives uten bekreftelse; «Bruk»
 * planlegges her som vanlige kommandoer i én angregruppe. Er en linje endret siden forslaget ble laget, er
 * den i konflikt og kan ikke brukes.
 */
import type { Command, NewAnnotation, NewBlock } from "../commands/types";
import { L } from "../i18n";
import { newId } from "../ids";
import type { BlockKind, ProjectState, SceneHeading } from "../model";
import { keyBetween } from "../order-key";
import { parseJsonLoose } from "../storylab/prompts";
import { activeStructure, orderedOccurrences } from "../views";
import { MAX_ASSIST_BLOCK_CHARS, sceneBlocks, type AssistKind, type AssistPrompt, type AssistRequest } from "./prompts";

export type ProposalKind = AssistKind | "format";

export interface ProposalItem {
  readonly key: string;
  /** Linjen som endres (null = ny linje). */
  readonly blockId: string | null;
  readonly kind: BlockKind;
  readonly oldText: string;
  readonly newText: string;
  readonly baseRevision: number | null;
  readonly baseText: string | null;
  /** Formatsjekken: hvilke regler som slo til. */
  readonly rules?: readonly string[];
}

export interface Proposal {
  readonly id: string;
  readonly kind: ProposalKind;
  readonly productionId: string;
  readonly occurrenceId: string | null;
  readonly items: readonly ProposalItem[];
  /** Neste replikk: linjen det settes inn etter, med revisjonen da forslaget ble laget. */
  readonly anchor?: { readonly variantId: string; readonly blockId: string | null; readonly revision: number | null };
  /** Ny scene: overskrift, plassering og eventuell canvasnode. */
  readonly scene?: {
    readonly heading: SceneHeading;
    readonly afterOccurrenceId: string | null;
    readonly canvasNodeId: string | null;
  };
  /** Formatsjekken: rettet sceneoverskrift. */
  readonly headingFix?: {
    readonly variantId: string;
    readonly revision: number;
    readonly heading: SceneHeading;
    readonly oldHeading: SceneHeading;
  };
  readonly costUsd: number;
  readonly usedFallback: boolean;
}

type Ids = (kind: string) => string;
const defaultIds: Ids = (k) => newId(k as never);
const NEW_KINDS: readonly BlockKind[] = ["action", "character", "parenthetical", "dialogue", "transition", "shot"];
const clip = (t: string) => t.trim().slice(0, MAX_ASSIST_BLOCK_CHARS);

/** Leser svaret og lager forslaget. null = svaret kunne ikke leses. */
export function proposalFromReply(
  s: ProjectState,
  r: AssistRequest,
  prompt: AssistPrompt,
  raw: string,
  meta: { readonly costUsd: number; readonly usedFallback: boolean },
  ids: Ids = defaultIds,
): Proposal | null {
  const j = parseJsonLoose(raw) as Record<string, unknown> | null;
  if (!j || typeof j !== "object") return null;
  const base = { id: ids("proposal"), kind: r.kind, productionId: r.productionId, occurrenceId: r.occurrenceId, ...meta };
  if (r.kind === "rewrite" || r.kind === "polish" || r.kind === "translate") {
    const list = j["blocks"];
    if (!Array.isArray(list)) return null;
    const items: ProposalItem[] = [];
    const seen = new Set<string>();
    for (const e of list) {
      if (!e || typeof e !== "object") return null;
      const ref = (e as Record<string, unknown>)["ref"];
      const text = (e as Record<string, unknown>)["text"];
      const blockId = typeof ref === "string" ? prompt.refs[ref] : undefined;
      if (!blockId || typeof text !== "string" || seen.has(blockId)) continue; // ukjente referanser brukes ikke
      seen.add(blockId);
      const b = s.blocks[blockId];
      if (!b || !clip(text)) continue;
      const newText = clip(text);
      if (r.kind !== "translate" && newText === b.text) continue;
      items.push({ key: blockId, blockId, kind: b.kind, oldText: b.text, newText, baseRevision: b.revision, baseText: b.text });
    }
    return { ...base, items };
  }
  if (r.kind === "next_line") {
    const lineText = typeof j["line"] === "string" ? clip(j["line"]) : "";
    if (!lineText || !r.occurrenceId) return null;
    const asset = r.characterAssetId ? s.assets[r.characterAssetId] : undefined;
    const occ = s.occurrences[r.occurrenceId];
    if (!asset || !occ) return null;
    const par = typeof j["parenthetical"] === "string" ? clip(j["parenthetical"]) : "";
    const anchorBlock = r.afterBlockId ? s.blocks[r.afterBlockId] : undefined;
    const items: ProposalItem[] = [
      { key: "n0", blockId: null, kind: "character", oldText: "", newText: asset.name.toUpperCase(), baseRevision: null, baseText: null },
      ...(par
        ? [{ key: "n1", blockId: null, kind: "parenthetical" as const, oldText: "", newText: par.startsWith("(") ? par : `(${par})`, baseRevision: null, baseText: null }]
        : []),
      { key: "n2", blockId: null, kind: "dialogue", oldText: "", newText: lineText, baseRevision: null, baseText: null },
    ];
    return {
      ...base,
      items,
      anchor: { variantId: occ.variantId, blockId: anchorBlock?.id ?? null, revision: anchorBlock?.revision ?? null },
    };
  }
  // scene
  const h = j["heading"] as Record<string, unknown> | undefined;
  const list = j["blocks"];
  if (!h || typeof h !== "object" || !Array.isArray(list)) return null;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const heading: SceneHeading = {
    intExt: str(h["intExt"], 20) || "INT.",
    location: (str(h["location"], 200) || "NY SCENE").toUpperCase(),
    time: str(h["time"], 60).toUpperCase(),
  };
  const items: ProposalItem[] = [];
  for (const e of list.slice(0, 200)) {
    if (!e || typeof e !== "object") continue;
    const kind = (e as Record<string, unknown>)["kind"];
    const text = (e as Record<string, unknown>)["text"];
    if (!NEW_KINDS.includes(kind as BlockKind) || typeof text !== "string" || !clip(text)) continue;
    items.push({
      key: `s${items.length}`,
      blockId: null,
      kind: kind as BlockKind,
      oldText: "",
      newText: kind === "character" ? clip(text).toUpperCase() : clip(text),
      baseRevision: null,
      baseText: null,
    });
  }
  if (items.length === 0) return null;
  return {
    ...base,
    items,
    scene: { heading, afterOccurrenceId: r.occurrenceId, canvasNodeId: r.canvasNodeId ?? null },
  };
}

/** Elementene som er i konflikt: linjen er endret eller fjernet siden forslaget ble laget. */
export function proposalConflicts(s: ProjectState, p: Proposal): Set<string> {
  const out = new Set<string>();
  const all = () => p.items.forEach((i) => out.add(i.key));
  for (const i of p.items) {
    if (!i.blockId) continue;
    const b = s.blocks[i.blockId];
    if (!b || b.removed || b.revision !== i.baseRevision || b.text !== i.baseText) out.add(i.key);
    else if (p.kind === "translate" && Object.values(s.translations).some((t) => !t.removed && t.blockId === i.blockId && t.language === "en"))
      out.add(i.key);
  }
  if (p.anchor) {
    if (p.anchor.blockId) {
      const b = s.blocks[p.anchor.blockId];
      if (!b || b.removed || b.revision !== p.anchor.revision) all();
    } else if (!s.variants[p.anchor.variantId]) all();
  }
  if (p.scene?.afterOccurrenceId) {
    const o = s.occurrences[p.scene.afterOccurrenceId];
    if (!o || !o.active) all();
  }
  if (p.headingFix) {
    const v = s.variants[p.headingFix.variantId];
    if (!v || v.revision !== p.headingFix.revision) out.add("heading");
  }
  return out;
}

export const canSaveAsTrial = (p: Proposal): boolean =>
  p.kind === "rewrite" || p.kind === "polish" || p.kind === "format";

export type PlannedApply =
  | { readonly ok: true; readonly commands: readonly Command[]; readonly occurrenceId: string | null }
  | { readonly ok: false; readonly message: string };

/** «Bruk» / «Bruk valgte»: vanlige kommandoer som kjøres som én angregruppe. */
export function planApplyProposal(s: ProjectState, p: Proposal, keys: ReadonlySet<string>, ids: Ids = defaultIds): PlannedApply {
  const conflicts = proposalConflicts(s, p);
  const chosen = p.items.filter((i) => keys.has(i.key));
  const heading = p.headingFix && keys.has("heading");
  if (chosen.length === 0 && !heading) return { ok: false, message: L("Velg minst én linje", "Select at least one line") };
  if (chosen.some((i) => conflicts.has(i.key)) || (heading && conflicts.has("heading")))
    return {
      ok: false,
      message: L(
        "Noen andre har endret teksten siden forslaget ble laget. Lag forslaget på nytt.",
        "Someone else changed the text after the suggestion was made. Create the suggestion again.",
      ),
    };
  const pid = p.productionId as never;
  const commands: Command[] = [];
  if (p.kind === "rewrite" || p.kind === "polish" || p.kind === "format") {
    if (heading)
      commands.push({ type: "EditSceneHeading", productionId: pid, variantId: p.headingFix!.variantId as never, heading: p.headingFix!.heading });
    for (const i of chosen) commands.push({ type: "EditBlockText", productionId: pid, blockId: i.blockId as never, text: i.newText });
    return { ok: true, commands, occurrenceId: p.occurrenceId };
  }
  if (p.kind === "translate") {
    commands.push({
      type: "AddTranslations",
      items: chosen.map((i) => ({
        translationId: ids("translation") as never,
        fields: {
          blockId: i.blockId as never,
          variantId: null,
          language: "en",
          text: i.newText,
          basedOnRev: s.blocks[i.blockId!]!.currentRev,
          // Utkastet må godkjennes (REQ-0335); norsk endres aldri (REQ-0331)
          status: "uncertain",
        },
      })),
    });
    return { ok: true, commands, occurrenceId: p.occurrenceId };
  }
  if (p.kind === "next_line") {
    const a = p.anchor!;
    const occ = p.occurrenceId ? s.occurrences[p.occurrenceId] : undefined;
    if (!occ) return { ok: false, message: L("Scenen finnes ikke", "The scene was not found") };
    const blocks = sceneBlocks(s, occ.id);
    const at = a.blockId ? blocks.findIndex((b) => b.id === a.blockId) : blocks.length - 1;
    let prev = at >= 0 ? blocks[at]!.orderKey : null;
    const next = blocks[at + 1]?.orderKey ?? null;
    for (const i of chosen) {
      const key = keyBetween(prev, next);
      prev = key;
      commands.push({
        type: "InsertBlock",
        productionId: pid,
        variantId: a.variantId as never,
        block: { blockId: ids("script_block") as never, kind: i.kind, text: i.newText, orderKey: key },
      });
    }
    return { ok: true, commands, occurrenceId: occ.id };
  }
  // Ny scene: etter valgt scene, ellers til slutt. Den eksisterende scenen endres aldri.
  const sc = p.scene!;
  const occs = orderedOccurrences(s, p.productionId);
  const structure = activeStructure(s, p.productionId);
  const afterId = sc.afterOccurrenceId ?? structure[structure.length - 1]?.id ?? null;
  const i = afterId ? occs.findIndex((o) => o.id === afterId) : -1;
  const prevKey = i >= 0 ? occs[i]!.orderKey : (occs[occs.length - 1]?.orderKey ?? null);
  const nextKey = i >= 0 ? (occs[i + 1]?.orderKey ?? null) : null;
  let k: string | null = null;
  const blocks: NewBlock[] = chosen.map((it) => {
    k = keyBetween(k, null);
    return { blockId: ids("script_block") as never, kind: it.kind, text: it.newText, orderKey: k };
  });
  const sceneId = ids("scene");
  const occurrenceId = ids("scene_occurrence");
  commands.push({
    type: "CreateScene",
    productionId: pid,
    sceneId: sceneId as never,
    variantId: ids("scene_variant") as never,
    occurrenceId: occurrenceId as never,
    orderKey: keyBetween(prevKey, nextKey),
    heading: sc.heading,
    blocks,
    productionNumber: null,
  });
  const node = sc.canvasNodeId ? s.canvasNodes[sc.canvasNodeId] : undefined;
  if (node && !node.removed && !node.sceneId)
    commands.push({ type: "UpdateCanvasNode", nodeId: node.id, patch: { sceneId: sceneId as never } });
  return { ok: true, commands, occurrenceId };
}

/** «Lagre som forsøksvis redigering»: ett notat (trial_edit) per valgt linje, med original og forslag. */
export function planTrialNotes(
  s: ProjectState,
  p: Proposal,
  keys: ReadonlySet<string>,
  authorName: string,
  ids: Ids = defaultIds,
): PlannedApply {
  if (!canSaveAsTrial(p))
    return { ok: false, message: L("Dette forslaget kan ikke lagres som forsøksvis redigering", "This suggestion cannot be saved as a trial edit") };
  const conflicts = proposalConflicts(s, p);
  const chosen = p.items.filter((i) => keys.has(i.key) && i.blockId && !conflicts.has(i.key));
  if (chosen.length === 0) return { ok: false, message: L("Velg minst én linje", "Select at least one line") };
  const annotations: NewAnnotation[] = chosen.map((i) => ({
    annotationId: ids("annotation") as never,
    blockId: i.blockId as never,
    variantId: null,
    start: 0,
    end: i.oldText.length,
    quote: i.oldText.slice(0, 5000),
    text: L("Forslag fra skrivehjelpen", "Suggestion from the writing assistant"),
    authorName,
    kind: "trial_edit",
    suggestedText: i.newText,
  }));
  return { ok: true, commands: [{ type: "AddAnnotations", annotations }], occurrenceId: p.occurrenceId };
}
