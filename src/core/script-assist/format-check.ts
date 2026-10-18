/**
 * Formatsjekk (T2): regelbasert og gratis, uten AI. Resultatet er et vanlig forslag med diff, så ingenting
 * endres før brukeren velger «Bruk».
 */
import { newId } from "../ids";
import type { BlockKind, ProjectState, SceneHeading } from "../model";
import type { Proposal, ProposalItem } from "./proposal";
import { sceneBlocks } from "./prompts";

export type FormatRule = "character_caps" | "parenthetical" | "spaces" | "quotes" | "heading";

/** Retter én linje; gir ny tekst og reglene som slo til. */
export function formatLine(kind: BlockKind, text: string): { text: string; rules: FormatRule[] } {
  const rules: FormatRule[] = [];
  let t = text;
  const spaced = t.replace(/[ \t]{2,}/g, " ").replace(/^[ \t]+|[ \t]+$/gm, "");
  if (spaced !== t) {
    rules.push("spaces");
    t = spaced;
  }
  const quoted = t.replace(/"([^"\n]+)"/g, "«$1»");
  if (quoted !== t) {
    rules.push("quotes");
    t = quoted;
  }
  if (kind === "character") {
    const up = t.replace(/:\s*$/, "").toLocaleUpperCase("nb");
    if (up !== t) {
      rules.push("character_caps");
      t = up;
    }
  }
  if (kind === "parenthetical" && t) {
    let p = t;
    if (!p.startsWith("(")) p = `(${p}`;
    if (!p.endsWith(")")) p = `${p})`;
    if (p !== t) {
      rules.push("parenthetical");
      t = p;
    }
  }
  return { text: t, rules };
}

const INT_EXT: Record<string, string> = {
  "INT": "INT.",
  "INT.": "INT.",
  "EXT": "EXT.",
  "EXT.": "EXT.",
  "INT/EXT": "INT./EXT.",
  "INT./EXT.": "INT./EXT.",
  "INT/EXT.": "INT./EXT.",
  "I/E": "INT./EXT.",
};

export function formatHeadingFix(h: SceneHeading): SceneHeading {
  const ie = h.intExt.trim().toUpperCase();
  return {
    intExt: INT_EXT[ie] ?? (h.intExt.trim() ? ie : h.intExt),
    location: h.location.replace(/\s{2,}/g, " ").trim().toLocaleUpperCase("nb"),
    time: h.time.replace(/\s{2,}/g, " ").trim().toLocaleUpperCase("nb"),
  };
}

const same = (a: SceneHeading, b: SceneHeading) => a.intExt === b.intExt && a.location === b.location && a.time === b.time;

/** Kjører reglene på scenen. Gir et forslag uten kostnad (tomt = ingenting å rette). */
export function formatCheck(s: ProjectState, productionId: string, occurrenceId: string): Proposal {
  const items: ProposalItem[] = [];
  for (const b of sceneBlocks(s, occurrenceId)) {
    if (b.kind === "heading") continue;
    const r = formatLine(b.kind, b.text);
    if (r.rules.length && r.text !== b.text)
      items.push({ key: b.id, blockId: b.id, kind: b.kind, oldText: b.text, newText: r.text, baseRevision: b.revision, baseText: b.text, rules: r.rules });
  }
  const occ = s.occurrences[occurrenceId];
  const v = occ ? s.variants[occ.variantId] : undefined;
  const scene = occ && (occ.kind === undefined || occ.kind === "scene");
  const fixed = v && scene ? formatHeadingFix(v.heading) : null;
  return {
    id: newId("proposal" as never),
    kind: "format",
    productionId,
    occurrenceId,
    items,
    ...(v && fixed && !same(fixed, v.heading)
      ? { headingFix: { variantId: v.id, revision: v.revision, heading: fixed, oldHeading: v.heading } }
      : {}),
    costUsd: 0,
    usedFallback: false,
  };
}
