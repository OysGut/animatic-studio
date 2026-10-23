/**
 * Avvik mellom manus og materiale (M6 del 1, DEC-0054, mandat kap. 21, REQ-0305/0306/0312/0485/0486).
 * Hvert materiale (2D-scene, importert film, senere AI-video) husker hvilke revisjoner av manusblokkene det
 * ble laget fra (`producedFrom`). Er manuset endret siden, flagges materialet. Endringene sammenlignes på
 * tekst (en endring som er angret, er ikke et avvik), og det berørte tidsrommet i scenen regnes ut, så bare
 * det området flagges (REQ-0312/0313). Ingenting endres automatisk: brukeren godkjenner, oppdaterer eller
 * angrer manusendringen (REQ-0026/0306).
 */
import type { Command } from "../commands/types";
import type { BlockKind, ProjectState, ScriptBlock } from "../model";
import { blocksOfVariant } from "../views";
import { compareKeys } from "../order-key";
import { blockSpans, type FilmClip } from "./film";

import { t as tk } from "@/core/i18n/keyed";

export type ScriptChangeKind = "changed" | "added" | "removed";

export interface ScriptChange {
  readonly blockId: string;
  readonly kind: ScriptChangeKind;
  readonly blockKind: BlockKind;
  /** Teksten materialet ble laget fra (null for nye blokker, eller når historikken mangler). */
  readonly oldText: string | null;
  /** Teksten nå (null for fjernede blokker). */
  readonly newText: string | null;
}

/** Materiale som kan avvike fra manuset. */
export interface Material {
  readonly kind: "composition" | "take";
  readonly id: string;
  readonly occurrenceId: string;
  readonly label: string;
  /** Revisjonene materialet ble laget fra (tomt = ukjent: laget før kontrollen fantes). */
  readonly baseline: Readonly<Record<string, number>>;
  /** Materialet vises i filmen nå. */
  readonly inUse: boolean;
}

export interface Discrepancy {
  readonly occurrenceId: string;
  readonly material: Material;
  readonly changes: readonly ScriptChange[];
  /** Berørte tidsrom (bilder i filmen); tomt når klippet ikke er i filmen. */
  readonly spans: readonly { readonly startFrame: number; readonly endFrame: number }[];
}

const revisionCache = new WeakMap<object, Map<string, string>>();

/** Teksten i en bestemt revisjon av en blokk (fra teksthistorikken; oppslaget bygges én gang per tilstand). */
export function textAtRevision(s: ProjectState, blockId: string, rev: number): string | null {
  let m = revisionCache.get(s.blockRevisions);
  if (!m) {
    m = new Map();
    for (const r of s.blockRevisions) m.set(`${r.blockId}:${r.rev}`, r.text);
    revisionCache.set(s.blockRevisions, m);
  }
  return m.get(`${blockId}:${rev}`) ?? null;
}

/** Revisjonene av blokkene i varianten nå (grunnlaget nytt materiale lages fra). */
export function currentRevisions(s: ProjectState, variantId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of Object.values(s.blocks))
    if (b.variantId === variantId && !b.removed) out[b.id] = b.currentRev;
  return out;
}

/**
 * Endringene i manuset siden grunnlaget, i manusrekkefølge. Scenehodet regnes ikke med (det endrer ikke
 * hva som skjer i bildet). Et tomt grunnlag gir ingen endringer (ukjent).
 */
export function scriptChanges(
  s: ProjectState,
  variantId: string,
  baseline: Readonly<Record<string, number>>,
): ScriptChange[] {
  if (Object.keys(baseline).length === 0) return [];
  const out: { change: ScriptChange; key: string }[] = [];
  const current = Object.values(s.blocks).filter(
    (b) => b.variantId === variantId && !b.removed && b.kind !== "heading",
  );
  const seen = new Set<string>();
  for (const b of current) {
    seen.add(b.id);
    const rev = baseline[b.id];
    if (rev === undefined) {
      out.push({
        change: { blockId: b.id, kind: "added", blockKind: b.kind, oldText: null, newText: b.text },
        key: b.orderKey,
      });
      continue;
    }
    if (rev === b.currentRev) continue;
    const old = textAtRevision(s, b.id, rev);
    if (old !== null && old === b.text) continue; // endret og endret tilbake
    out.push({
      change: { blockId: b.id, kind: "changed", blockKind: b.kind, oldText: old, newText: b.text },
      key: b.orderKey,
    });
  }
  for (const [id, rev] of Object.entries(baseline)) {
    if (seen.has(id)) continue;
    const b: ScriptBlock | undefined = s.blocks[id];
    // Finnes ikke lenger (innsetting som er angret) eller flyttet til en annen scene (deling): ikke et
    // avvik i denne scenen
    if (!b || b.kind === "heading") continue;
    if (b.variantId !== variantId && !b.removed) continue;
    out.push({
      change: {
        blockId: id,
        kind: "removed",
        blockKind: b?.kind ?? "action",
        oldText: textAtRevision(s, id, rev) ?? b.text,
        newText: null,
      },
      key: b.orderKey,
    });
  }
  return out.sort((a, b) => compareKeys(a.key, b.key)).map((x) => x.change);
}

/**
 * Materialet til en sceneforekomst: 2D-scenen (hvis den finnes) og versjonene (takes). `inUse`: vises i
 * filmen nå (aktiv versjon, eller delene klippet består av når det er kuttet).
 */
export function materialsOf(s: ProjectState, occurrenceId: string, clip?: FilmClip): Material[] {
  const o = s.occurrences[occurrenceId];
  if (!o) return [];
  const usedTakes = new Set<string>();
  let usesComposition = o.activeTakeId === null;
  if (clip && clip.occurrenceId === occurrenceId) {
    usesComposition = clip.parts.some((p) => p.source === "composition");
    for (const p of clip.parts) if (p.source === "take" && p.take) usedTakes.add(p.take.id);
  } else if (o.activeTakeId) usedTakes.add(o.activeTakeId);
  const out: Material[] = [];
  const comp = Object.values(s.compositions).find((c) => c.variantId === o.variantId && !c.removed && (c.kind ?? "scene") === "scene");
  if (comp)
    out.push({
      kind: "composition",
      id: comp.id,
      occurrenceId,
      label: tk("core-assembly-discrepancy.label.label.80e277b15d75"),
      baseline: comp.producedFrom?.blockRevisions ?? {},
      inUse: usesComposition,
    });
  // En spinoff som viser hovedfilmens film (DEC-0072), varsles også om den
  const owners = new Set<string>([occurrenceId]);
  if (clip && clip.occurrenceId === occurrenceId && clip.inheritedFrom)
    owners.add(clip.inheritedFrom);
  for (const t of Object.values(s.takes)) {
    if (!owners.has(t.occurrenceId) || t.kind === "composition2d") continue;
    out.push({
      kind: "take",
      id: t.id,
      occurrenceId,
      label:
        t.kind === "imported_film"
          ? tk("core-assembly-discrepancy.film-take", { file: t.media?.fileName ?? tk("core-assembly-discrepancy.film-take-imported") })
          : t.kind === "ai_video"
            ? "AI-video"
            : t.kind === "still"
              ? tk("core-assembly-discrepancy.label.label.a31351d4cc24")
              : tk("core-assembly-discrepancy.label.label.eabb354bd919"),
      baseline: (t.acceptedFrom ?? t.producedFrom).blockRevisions,
      inUse: usedTakes.has(t.id),
    });
  }
  return out;
}

/** Berørte tidsrom i klippet: blokkene som er endret eller nye, og stedet der fjernede blokker sto. */
export function changedSpans(
  s: ProjectState,
  clip: FilmClip,
  changes: readonly ScriptChange[],
): { startFrame: number; endFrame: number }[] {
  if (changes.length === 0) return [];
  const spans = blockSpans(s, clip);
  const byId = new Map(spans.map((b) => [b.blockId, b]));
  const ordered = blocksOfVariant(s, clip.variantId).filter((b) => b.kind !== "heading");
  const out: { startFrame: number; endFrame: number }[] = [];
  for (const c of changes) {
    const sp = byId.get(c.blockId);
    if (sp) {
      out.push({ startFrame: sp.startFrame, endFrame: Math.max(sp.startFrame + 1, sp.endFrame) });
      continue;
    }
    // Fjernet blokk: der den neste blokken begynner (et kort merke)
    const removed = s.blocks[c.blockId];
    const next = removed
      ? ordered.find((b) => compareKeys(b.orderKey, removed.orderKey) > 0)
      : undefined;
    const at = next ? byId.get(next.id)?.startFrame : clip.startFrame + clip.durationFrames - 1;
    if (at !== undefined) out.push({ startFrame: at, endFrame: at + 1 });
  }
  // Slå sammen overlappende
  out.sort((a, b) => a.startFrame - b.startFrame);
  const merged: { startFrame: number; endFrame: number }[] = [];
  for (const x of out) {
    const last = merged[merged.length - 1];
    if (last && x.startFrame <= last.endFrame) last.endFrame = Math.max(last.endFrame, x.endFrame);
    else merged.push({ ...x });
  }
  return merged;
}

/**
 * Alle avvik i en produksjon: materiale der manuset er endret siden det ble laget. Materiale med ukjent
 * grunnlag flagges ikke (det kan settes som kontrollert).
 */
export function discrepancies(
  s: ProjectState,
  clips: readonly FilmClip[],
  opts: { readonly spans?: boolean } = {},
): Discrepancy[] {
  const out: Discrepancy[] = [];
  for (const clip of clips) {
    const o = s.occurrences[clip.occurrenceId];
    if (!o) continue;
    // Bare materiale som vises i filmen (gamle versjoner som ikke er i bruk, flagges ikke)
    for (const m of materialsOf(s, clip.occurrenceId, clip)) {
      if (!m.inUse) continue;
      const changes = materialChanges(
        s,
        o.variantId,
        m.baseline,
        m.kind === "take" ? (s.takes[m.id]?.coverage ?? null) : null,
      );
      if (changes.length === 0) continue;
      out.push({
        occurrenceId: o.id,
        material: m,
        changes,
        spans: opts.spans === false ? [] : changedSpans(s, clip, changes),
      });
    }
  }
  return out;
}

/**
 * Manusendringer siden materialet ble laget. Film som bare dekker en del av manuset (REQ-0237): bare endringer
 * i den delen (fjernede linjer tas med, siden det ikke lenger kan avgjøres hvor de sto).
 */
export function materialChanges(
  s: ProjectState,
  variantId: string,
  baseline: Readonly<Record<string, number>>,
  coverage: { readonly startBlockId: string; readonly endBlockId: string } | null,
): ReturnType<typeof scriptChanges> {
  const all = scriptChanges(s, variantId, baseline);
  const inside = coverage ? coveredBlockIds(s, variantId, coverage) : null;
  if (!inside || !coverage) return all;
  // En fjernet linje beholder plassen sin (ordensnøkkelen): bare de som sto innenfor dekningen, telles
  // (KI-170). Er linjen helt borte, eller ligger den i en annen scenevariant, kan det ikke avgjøres – den telles.
  const a = s.blocks[coverage.startBlockId];
  const b = s.blocks[coverage.endBlockId];
  const lo = a && b ? (compareKeys(a.orderKey, b.orderKey) <= 0 ? a : b) : null;
  const hi = lo === a ? b : a;
  return all.filter((c) => {
    if (inside.has(c.blockId)) return true;
    const x = s.blocks[c.blockId];
    if (!x) return true;
    if (!x.removed) return false;
    if (!lo || !hi || x.variantId !== variantId) return true;
    return compareKeys(x.orderKey, lo.orderKey) >= 0 && compareKeys(x.orderKey, hi.orderKey) <= 0;
  });
}

/** Linjene en film dekker (fra første til siste, i manusets rekkefølge), REQ-0237. */
export function coveredBlockIds(
  s: ProjectState,
  variantId: string,
  cov: { readonly startBlockId: string; readonly endBlockId: string },
): Set<string> {
  const order = blocksOfVariant(s, variantId)
    .filter((b) => b.kind !== "heading")
    .map((b) => b.id as string);
  const a = order.indexOf(cov.startBlockId);
  const b = order.indexOf(cov.endBlockId);
  if (a < 0 || b < 0) return new Set(order);
  return new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1));
}

/** Blokker i manuset som er endret etter materiale som er laget (for merker i manusvisningen). */
export function changedBlockIds(found: readonly Discrepancy[]): Set<string> {
  const out = new Set<string>();
  for (const d of found) for (const c of d.changes) out.add(c.blockId);
  return out;
}

/**
 * Selektiv angring av manusendringer (valg C, REQ-0311, DEC-0075): kommandoene som setter akkurat disse
 * blokkene tilbake slik de var da materialet ble laget. Andre, uavhengige redigeringer i scenen røres ikke.
 * Endret tekst settes tilbake, ny blokk fjernes (deaktiveres), fjernet blokk gjenopprettes (med gammel tekst).
 */
export function scriptRevertCommands(
  state: Pick<ProjectState, "blocks">,
  productionId: string,
  items: readonly ScriptChange[],
): Command[] {
  const out: Command[] = [];
  const pid = productionId as never;
  for (const c of items) {
    const b = state.blocks[c.blockId];
    if (!b) continue;
    if (c.kind === "changed" && c.oldText !== null && !b.removed)
      out.push({
        type: "EditBlockText",
        productionId: pid,
        blockId: c.blockId as never,
        text: c.oldText,
      });
    else if (c.kind === "added" && !b.removed)
      out.push({ type: "RemoveBlock", productionId: pid, blockId: c.blockId as never });
    else if (c.kind === "removed" && b.removed) {
      out.push({ type: "RestoreBlock", productionId: pid, blockId: c.blockId as never });
      // Var blokken også endret før den ble fjernet, settes teksten tilbake også
      if (c.oldText !== null && c.oldText !== b.text)
        out.push({
          type: "EditBlockText",
          productionId: pid,
          blockId: c.blockId as never,
          text: c.oldText,
        });
    }
  }
  return out;
}
