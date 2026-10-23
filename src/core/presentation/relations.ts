/**
 * Relasjoner mellom karakterene (M8 del 1, DEC-0061, mandat 26.4, REQ-0393–0395).
 *
 * Relasjonene brukeren har godkjent, er fakta i prosjektet. Forslagene fra manuset er bare forslag (REQ-0394):
 * to karakterer som er sammen i scener, og ord i linjene der begge nevnes (mor, krangler, trøster …) gir typen.
 * Forslagene lagres ikke før de godkjennes; et avvist forslag lagres som «dismissed» og foreslås ikke igjen.
 */
import type { Asset, AssetRelation, ProjectState, RelationKind } from "../model";

import { blocksOfVariant, orderedOccurrences } from "../views";
import { allAssetUsage, assetNames, nameKey } from "../library";
import { characterName, mentions } from "../screenplay/filter";
import { tLocalized } from "@/core/i18n/keyed";

export const RELATION_LABEL: Record<RelationKind, string> = {
  family: "Familie",
  friendship: "Vennskap",
  conflict: "Konflikt",
  care: "Omsorg",
  romance: "Romantikk",
  mentor: "Mentor",
  hidden: "Skjult forbindelse",
  other: "Annen",
};

/** Navn på relasjonstypen i det språket brukeren har valgt (visning i appen). */
export const RELATION_NAME: Record<RelationKind, string> = tLocalized({ family: "core-presentation-relations.relation-name.family.f255082f3e75", friendship: "core-presentation-relations.relation-name.friendship.fa09f3a467bb", conflict: "core-presentation-relations.relation-name.conflict.af8efcc91dc4", care: "core-presentation-relations.relation-name.care.02ba5a5d5572", romance: "core-presentation-relations.relation-name.romance.430df5ad42ed", mentor: "core-presentation-relations.relation-name.mentor.c0eae1dc0711", hidden: "core-presentation-relations.relation-name.hidden.b8a2c8a2b5fe", other: "core-presentation-relations.relation-name.other.fba6f9802500" });

export const RELATION_LABEL_EN: Record<RelationKind, string> = {
  family: "Family",
  friendship: "Friendship",
  conflict: "Conflict",
  care: "Care",
  romance: "Romance",
  mentor: "Mentor",
  hidden: "Hidden connection",
  other: "Other",
};

/** Farge per relasjonstype (linjer i karakterkartet). */
export const RELATION_COLOR: Record<RelationKind, string> = {
  family: "#d9a441",
  friendship: "#5fb38a",
  conflict: "#d9534f",
  care: "#e08bb3",
  romance: "#c2185b",
  mentor: "#5b8def",
  hidden: "#8e8e9e",
  other: "#b0a58c",
};

/** Linjen er stiplet for skjulte forbindelser. */
export const RELATION_DASHED: Record<RelationKind, boolean> = {
  family: false,
  friendship: false,
  conflict: false,
  care: false,
  romance: false,
  mentor: false,
  hidden: true,
  other: false,
};

const KEYWORDS: readonly { kind: RelationKind; re: RegExp }[] = [
  {
    kind: "family",
    re: /\b(mor|mora|moren|mamma|far|faren|pappa|bestemor|bestefar|farmor|farfar|mormor|morfar|søster|søsteren|bror|broren|datter|dattera|datteren|sønn|sønnen|onkel|tante|fetter|kusine|barnebarn|familie)\b/iu,
  },
  {
    kind: "conflict",
    re: /\b(krangl\w*|sint|sinna|slåss|roper til|kjefter|truer|hater|fiende\w*|slår|dytter)\b/iu,
  },
  {
    kind: "care",
    re: /\b(trøster|klemmer|klem|stryker|passer på|tar vare|hjelper|bærer|holder rundt|dyner)\b/iu,
  },
  {
    kind: "romance",
    re: /\b(kysser|kyss|forelsk\w*|kjæreste|elsker|flørter)\b/iu,
  },
  {
    kind: "friendship",
    re: /\b(venn\w*|venninne\w*|leker|kompis\w*|ler sammen)\b/iu,
  },
  { kind: "mentor", re: /\b(lærer\w*|viser henne|viser ham|forklarer|lærer bort)\b/iu },
  { kind: "hidden", re: /\b(hemmelig\w*|i skjul|i smug|skjuler)\b/iu },
];

export interface RelationSuggestion {
  /** Stabil nøkkel: de to ressursene (sortert) og typen. */
  readonly key: string;
  readonly fromAssetId: string;
  readonly toAssetId: string;
  readonly kind: RelationKind;
  /** Scener begge er med i. */
  readonly together: number;
  /** Linjen som ga forslaget (null: bare at de er mye sammen). */
  readonly evidence: { readonly occurrenceId: string; readonly text: string } | null;
}

const isPerson = (a: Asset) =>
  (a.kind === "character" || a.kind === "animal") && !a.archived && !a.removed;

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Godkjente relasjoner som ikke er fjernet. */
export function approvedRelations(s: ProjectState): AssetRelation[] {
  return Object.values(s.assetRelations)
    .filter(
      (r) =>
        !r.removed &&
        r.status === "approved" &&
        !!s.assets[r.fromAssetId] &&
        !!s.assets[r.toAssetId],
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Navnet på relasjonen (eget navn, ellers typen) på språket. */
export function relationName(r: Pick<AssetRelation, "kind" | "label">, lang = "nb"): string {
  return r.label.trim() || (lang === "en" ? RELATION_LABEL_EN : RELATION_LABEL)[r.kind];
}

/**
 * Forslag til relasjoner fra manuset (REQ-0394): par av karakterer som er sammen i minst to scener, med type
 * fra ord i handling eller replikk der begge nevnes (eller der den ene snakker og den andre nevnes). Par uten
 * slike ord foreslås som «annen» bare når de er sammen i mange scener. Godkjente og avviste par foreslås ikke.
 */
export function relationSuggestions(s: ProjectState, productionId: string): RelationSuggestion[] {
  const usage = allAssetUsage(s, productionId);
  const people = Object.values(s.assets).filter(isPerson);
  const scenesOf = new Map<string, Set<string>>();
  for (const a of people)
    scenesOf.set(
      a.id,
      new Set((usage.get(a.id) ?? []).filter((u) => u.active).map((u) => u.occurrenceId)),
    );
  const known = new Set(
    Object.values(s.assetRelations)
      .filter((r) => !r.removed)
      .map((r) => pairKey(r.fromAssetId, r.toAssetId)),
  );
  const keysOf = (a: Asset) =>
    assetNames(a)
      .map((n) => nameKey(n))
      .filter((k) => k.length >= 2);
  const occs = orderedOccurrences(s, productionId).filter((o) => o.active);
  const out: RelationSuggestion[] = [];
  for (let i = 0; i < people.length; i++)
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i]!;
      const b = people[j]!;
      if (known.has(pairKey(a.id, b.id))) continue;
      const sa = scenesOf.get(a.id)!;
      const together = [...scenesOf.get(b.id)!].filter((x) => sa.has(x));
      if (together.length < 2) continue;
      const ka = keysOf(a);
      const kb = keysOf(b);
      // Linjer der begge er med: begge nevnt, eller den ene snakker og nevner den andre
      let evidence: RelationSuggestion["evidence"] = null;
      let kind: RelationKind | null = null;
      for (const o of occs) {
        if (!together.includes(o.id)) continue;
        let speaker = "";
        for (const blk of blocksOfVariant(s, o.variantId)) {
          if (blk.kind === "character") {
            speaker = characterName(blk.text);
            continue;
          }
          if (blk.kind !== "action" && blk.kind !== "dialogue") continue;
          const hasA =
            ka.some((k) => mentions(blk.text, k)) ||
            (blk.kind === "dialogue" && ka.includes(speaker));
          const hasB =
            kb.some((k) => mentions(blk.text, k)) ||
            (blk.kind === "dialogue" && kb.includes(speaker));
          if (!hasA || !hasB) continue;
          const hit = KEYWORDS.find((x) => x.re.test(blk.text));
          if (hit) {
            kind = hit.kind;
            evidence = { occurrenceId: o.id, text: blk.text.slice(0, 200) };
            break;
          }
        }
        if (kind) break;
      }
      // Familieord i navnet («BESTEMOR ANNE»): familie med den som er mest sammen med henne
      if (!kind) {
        const famName = [a, b].find((x) =>
          assetNames(x).some((n) => KEYWORDS[0]!.re.test(n.toLocaleLowerCase("und"))),
        );
        if (famName) kind = "family";
      }
      if (!kind && together.length < 3) continue;
      const k = kind ?? "other";
      out.push({
        key: `${pairKey(a.id, b.id)}|${k}`,
        fromAssetId: a.id,
        toAssetId: b.id,
        kind: k,
        together: together.length,
        evidence,
      });
    }
  return out.sort((x, y) => y.together - x.together || x.key.localeCompare(y.key));
}
