/**
 * Kontekstuell kobling av betegnelser (M6, mandat 8.2, REQ-0127, REQ-0874–0876). Når manuset omtaler en
 * ressurs med en betegnelse som ikke er entydig («bestemor», «gamla», «hun»), foreslår kjernen hvilken
 * ressurs linjen gjelder ut fra konteksten: hvem som er til stede i scenen, kjente kontekstnavn og hvem som
 * sist ble nevnt. Regler først; usikre forslag kan vurderes av AI (med kostnadsport i brukerflaten).
 *
 * Bygger på samme data som gjenkjenningen (ressursnavn, alias og `contextNames`), ikke et eget register.
 * Ingenting lagres automatisk: godkjente forslag blir `SetContextNames` (angrbart, via apply_changes).
 */
import type { Asset, ContextName, ProjectState } from "../model";
import type { Command } from "../commands/types";
import { blocksOfVariant, orderedOccurrences } from "../views";
import { allAssetUsage, assetNames, nameKey } from "./index";
import { collation } from "../i18n";

export type ContextLinkConfidence = "sure" | "uncertain";
export type ContextLinkRule = "present" | "known_context" | "pronoun";

export interface ContextLinkSuggestion {
  /** Stabil nøkkel: blokk + ord. */
  readonly key: string;
  readonly occurrenceId: string;
  readonly blockId: string;
  readonly word: string;
  readonly assetId: string;
  readonly confidence: ContextLinkConfidence;
  readonly rule: ContextLinkRule;
  /** Andre mulige ressurser (for AI-vurdering og visning). */
  readonly candidates: readonly string[];
}

/** Pronomen som kan peke på en karakter (bokmål og engelsk). */
export const CONTEXT_PRONOUNS: ReadonlySet<string> = new Set([
  "hun", "han", "henne", "ham", "hennes", "hans",
  "she", "he", "her", "him", "his", "hers",
]);

const PERSON_KINDS = new Set(["character", "animal"]);
const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

const lower = (w: string) => w.toLocaleLowerCase(collation());

function covered(assets: readonly Asset[], blockId: string, word: string): boolean {
  const w = lower(word);
  return assets.some((a) =>
    (a.contextNames ?? []).some((n) => lower(n.name) === w && n.blockIds.includes(blockId)),
  );
}

/**
 * Forslagene for en produksjon (valgfritt bare én scene). Regler:
 * 1. «present»: en betegnelse som er navn/alias for flere ressurser, og bare én av dem er i scenen → sikker.
 * 2. «known_context»: betegnelsen er allerede et kontekstnavn for én ressurs andre steder → sikker når
 *    ressursen er i scenen, ellers usikker.
 * 3. «pronoun»: et pronomen i en handlingslinje → sist nevnte karakter i scenen (alltid usikker).
 * Linjer som allerede er koblet for ordet, foreslås ikke igjen.
 */
export function contextLinkSuggestions(
  s: ProjectState,
  productionId: string,
  occurrenceId?: string,
): ContextLinkSuggestion[] {
  const assets = Object.values(s.assets).filter((a) => !a.removed && !a.archived && a.kind !== "sound");
  // Navn → ressurser (mer enn én = tvetydig)
  const byName = new Map<string, Set<string>>();
  for (const a of assets)
    for (const n of assetNames(a)) {
      const k = lower(n.trim());
      if (k.length < 2) continue;
      (byName.get(k) ?? byName.set(k, new Set()).get(k)!).add(a.id);
    }
  // Kontekstnavn → ressurser
  const byContext = new Map<string, Set<string>>();
  for (const a of assets)
    for (const n of a.contextNames ?? []) {
      const k = lower(n.name.trim());
      (byContext.get(k) ?? byContext.set(k, new Set()).get(k)!).add(a.id);
    }
  const speakerKey = new Map<string, string | null>();
  for (const a of assets)
    if (PERSON_KINDS.has(a.kind))
      for (const n of assetNames(a)) {
        const k = nameKey(n);
        if (k) speakerKey.set(k, speakerKey.has(k) && speakerKey.get(k) !== a.id ? null : a.id);
      }

  const out: ContextLinkSuggestion[] = [];
  for (const o of orderedOccurrences(s, productionId)) {
    if (occurrenceId && o.id !== occurrenceId) continue;
    const blocks = blocksOfVariant(s, o.variantId);
    // Til stede: bruk i scenen som ikke bare skyldes en tvetydig betegnelse (ellers blir det sirkulært)
    const present = new Set<string>();
    for (const [assetId, uses] of allAssetUsage(s, productionId)) {
      const u = uses.find((x) => x.occurrenceId === o.id);
      if (!u) continue;
      const k = lower(u.matchedName.trim());
      if ((byName.get(k)?.size ?? 0) > 1 && u.how !== "speaks") continue;
      present.add(assetId);
    }
    for (const b of blocks)
      if (b.kind === "character") {
        const id = speakerKey.get(nameKey(b.text));
        if (id) present.add(id);
      }
    let lastNamed: string | null = null;
    for (const b of blocks) {
      if (b.kind === "heading") continue;
      if (b.kind === "character") {
        lastNamed = speakerKey.get(nameKey(b.text)) ?? lastNamed;
        continue;
      }
      const seen = new Set<string>();
      let firstNamedInBlock: string | null = null;
      for (const m of b.text.matchAll(TOKEN)) {
        const word = m[0];
        const w = lower(word);
        if (seen.has(w)) continue;
        // Entydig navn: oppdaterer «sist nevnt», trenger ingen kobling
        const named = byName.get(w);
        if (named && named.size === 1) {
          const id = [...named][0]!;
          if (PERSON_KINDS.has(s.assets[id]?.kind ?? "")) firstNamedInBlock ??= id;
          continue;
        }
        const push = (assetId: string, confidence: ContextLinkConfidence, rule: ContextLinkRule, candidates: string[]) => {
          if (covered(assets, b.id, word)) return;
          seen.add(w);
          out.push({ key: `${b.id}:${w}`, occurrenceId: o.id, blockId: b.id, word, assetId, confidence, rule, candidates });
        };
        if (named && named.size > 1) {
          const here = [...named].filter((id) => present.has(id));
          if (here.length === 1) push(here[0]!, "sure", "present", [...named]);
          else if (here.length > 1) push(here[0]!, "uncertain", "present", here);
          continue;
        }
        const ctx = byContext.get(w);
        if (ctx && ctx.size === 1) {
          const id = [...ctx][0]!;
          push(id, present.has(id) ? "sure" : "uncertain", "known_context", [id]);
          continue;
        }
        if (ctx && ctx.size > 1) {
          const here = [...ctx].filter((id) => present.has(id));
          if (here.length >= 1) push(here[0]!, here.length === 1 ? "sure" : "uncertain", "known_context", here);
          continue;
        }
        if (b.kind === "action" && CONTEXT_PRONOUNS.has(w)) {
          const target = firstNamedInBlock ?? lastNamed;
          if (target && present.has(target)) {
            const others = [...present].filter((id) => PERSON_KINDS.has(s.assets[id]?.kind ?? ""));
            push(target, "uncertain", "pronoun", others.length ? others : [target]);
          }
        }
      }
      if (firstNamedInBlock) lastNamed = firstNamedInBlock;
    }
  }
  return out;
}

/**
 * Kommandoene for de godkjente forslagene: én `SetContextNames` per ressurs, med linjene lagt til
 * eksisterende kontekstnavn (ingenting fjernes). Kjøres som én angregruppe.
 */
export function contextLinkCommands(
  s: ProjectState,
  accepted: readonly Pick<ContextLinkSuggestion, "assetId" | "blockId" | "word">[],
): Command[] {
  const byAsset = new Map<string, Pick<ContextLinkSuggestion, "assetId" | "blockId" | "word">[]>();
  for (const a of accepted) {
    if (!s.assets[a.assetId]) continue;
    (byAsset.get(a.assetId) ?? byAsset.set(a.assetId, []).get(a.assetId)!).push(a);
  }
  const cmds: Command[] = [];
  for (const [assetId, list] of byAsset) {
    const asset = s.assets[assetId]!;
    const next: ContextName[] = (asset.contextNames ?? []).map((n) => ({ name: n.name, blockIds: [...n.blockIds] }));
    for (const x of list) {
      const w = lower(x.word);
      let entry = next.find((n) => lower(n.name) === w);
      if (!entry) {
        entry = { name: w, blockIds: [] };
        next.push(entry);
      }
      if (!entry.blockIds.includes(x.blockId)) (entry.blockIds as string[]).push(x.blockId);
    }
    cmds.push({ type: "SetContextNames", assetId, contextNames: next } as unknown as Command);
  }
  return cmds;
}

/** Engelsk prompt for AI-vurdering av de usikre forslagene. Bare scenelinjene og kandidatene sendes. */
export function contextLinkPrompt(
  s: ProjectState,
  items: readonly ContextLinkSuggestion[],
): { system: string; user: string } {
  const system =
    "You resolve references in a film screenplay. For each item decide which candidate asset the word refers to, " +
    "using only the scene text given. Reply with JSON only: {\"links\":[{\"key\":string,\"assetId\":string|null}]}. " +
    "Use null when the text does not make it clear. Never invent ids.";
  const parts: string[] = [];
  for (const it of items.slice(0, 40)) {
    const o = s.occurrences[it.occurrenceId];
    const blocks = o ? blocksOfVariant(s, o.variantId) : [];
    const i = blocks.findIndex((b) => b.id === it.blockId);
    const ctx = blocks
      .slice(Math.max(0, i - 4), i + 1)
      .map((b) => `${b.kind.toUpperCase()}: ${b.text}`)
      .join("\n")
      .slice(-1500);
    const cands = it.candidates
      .map((id) => s.assets[id])
      .filter((a): a is Asset => !!a)
      .map((a) => `${a.id} = ${assetNames(a).join(" / ")}`)
      .join("; ");
    parts.push(`ITEM key=${it.key}\nWORD: ${it.word}\nCANDIDATES: ${cands}\nTEXT:\n${ctx}`);
  }
  return { system, user: parts.join("\n\n") };
}

/** Leser AI-svaret: bare nøkler som finnes og ressurser blant kandidatene godtas. */
export function contextLinksFromJson(
  parsed: unknown,
  items: readonly ContextLinkSuggestion[],
): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const links = (parsed as { links?: unknown } | null)?.links;
  if (!Array.isArray(links)) return out;
  const byKey = new Map(items.map((i) => [i.key, i]));
  for (const l of links) {
    if (!l || typeof l !== "object") continue;
    const key = (l as Record<string, unknown>)["key"];
    const id = (l as Record<string, unknown>)["assetId"];
    const it = typeof key === "string" ? byKey.get(key) : undefined;
    if (!it) continue;
    if (id === null) out.set(it.key, null);
    else if (typeof id === "string" && it.candidates.includes(id)) out.set(it.key, id);
  }
  return out;
}
