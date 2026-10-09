/**
 * Manusversjoner (mandat 2.2, 5.1; REQ-0032, REQ-0069, REQ-0076–REQ-0078).
 * Et øyeblikksbilde er uforanderlig. Databasen lager det (private.script_snapshot i migrasjon 0003) i samme
 * format som snapshotFromState, slik at det kan testes og sammenlignes i kjernen.
 */
import type { BlockKind, ProjectState, SceneHeading } from "../model";
import { blocksOfVariant, orderedOccurrences } from "../views";
import { characterName } from "./filter";
import { formatHeading, type PaginationScene } from "./paginate";

export interface SnapshotBlock {
  readonly id: string;
  readonly kind: BlockKind;
  readonly text: string;
  readonly rev: number;
}

export interface SnapshotScene {
  readonly occurrenceId: string;
  readonly sceneId: string;
  readonly variantId: string;
  readonly number: string | null;
  readonly active: boolean;
  readonly activeTakeId: string | null;
  readonly heading: SceneHeading;
  readonly blocks: readonly SnapshotBlock[];
}

export interface ScriptSnapshot {
  readonly format: 1;
  readonly productionId: string;
  readonly scenes: readonly SnapshotScene[];
}

/** Lagret manusversjon (rad i script_versions). */
export interface ScriptVersion {
  readonly id: string;
  readonly productionId: string;
  readonly number: number;
  readonly name: string;
  readonly note: string | null;
  readonly parentVersionId: string | null;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly snapshot: ScriptSnapshot;
}

export function snapshotFromState(s: ProjectState, productionId: string): ScriptSnapshot {
  return {
    format: 1,
    productionId,
    scenes: orderedOccurrences(s, productionId).map((o) => {
      const v = s.variants[o.variantId];
      return {
        occurrenceId: o.id,
        sceneId: o.sceneId,
        variantId: o.variantId,
        number: o.productionNumber,
        active: o.active,
        activeTakeId: o.activeTakeId,
        heading: v
          ? { intExt: v.heading.intExt, location: v.heading.location, time: v.heading.time }
          : { intExt: "", location: "", time: "" },
        blocks: blocksOfVariant(s, o.variantId).map((b) => ({
          id: b.id,
          kind: b.kind,
          text: b.text,
          rev: b.currentRev,
        })),
      };
    }),
  };
}

/** Sidebrytingsinndata for en versjon (aktive scener), for visning og eksport av versjonen (REQ-0032). */
export function snapshotPaginationInput(snap: ScriptSnapshot): PaginationScene[] {
  return snap.scenes
    .filter((sc) => sc.active)
    .map((sc) => ({
      occurrenceId: sc.occurrenceId,
      number: sc.number,
      headingText: formatHeading(sc.heading),
      blocks: sc.blocks.map((b) => ({ id: b.id, kind: b.kind, text: b.text })),
    }));
}

/**
 * Nummer per sceneforekomst i en versjon (for «bevar valgt historisk nummerering», REQ-0083).
 * Forekomst-ID-en er permanent i produksjonen, også når samme scene brukes flere ganger.
 */
export function numbersByOccurrence(snap: ScriptSnapshot): Map<string, string> {
  const out = new Map<string, string>();
  for (const sc of snap.scenes) if (sc.number !== null) out.set(sc.occurrenceId, sc.number);
  return out;
}

// ---------- Sammenligning (REQ-0069, REQ-0078) ----------

export type ChangeType =
  | "added" // ny scene
  | "removed" // scenen finnes ikke lenger i produksjonen
  | "deactivated" // skjult/deaktivert
  | "activated"
  | "moved"
  | "renumbered" // bare nytt nummer – ikke en ny scene (mandat 5.1)
  | "heading"
  | "dialogue"
  | "action"
  | "characters"
  | "take" // annen aktiv versjon av produsert materiale
  | "variant"; // scenen bruker en annen variant (f.eks. egen versjon i en spinoff)

export interface SceneChange {
  readonly type: ChangeType;
  readonly sceneId: string;
  readonly occurrenceId: string;
  /** Nummer og overskrift slik scenen står i den nyeste av de to versjonene (ellers den eldste). */
  readonly number: string | null;
  readonly heading: string;
  readonly detail?: string;
}

export const CHANGE_LABEL: Record<ChangeType, string> = {
  added: "Ny scene",
  removed: "Fjernet scene",
  deactivated: "Deaktivert scene",
  activated: "Aktivert scene",
  moved: "Flyttet scene",
  renumbered: "Nytt scenenummer",
  heading: "Endret sceneoverskrift",
  dialogue: "Endret dialog",
  action: "Endret handling",
  characters: "Endrede karakterer",
  take: "Ny aktiv filmversjon",
  variant: "Ny scenevariant",
};

/** Replikk og parentes. Karakternavn rapporteres som egen type («Endrede karakterer»). */
const DIALOGUE_KINDS: ReadonlySet<BlockKind> = new Set(["dialogue", "parenthetical"]);

function byOccurrence(snap: ScriptSnapshot): Map<string, SnapshotScene> {
  const m = new Map<string, SnapshotScene>();
  for (const sc of snap.scenes) m.set(sc.occurrenceId, sc);
  return m;
}

function charactersOf(sc: SnapshotScene): Set<string> {
  return new Set(
    sc.blocks
      .filter((b) => b.kind === "character")
      .map((b) => characterName(b.text))
      .filter(Boolean),
  );
}

function textOf(sc: SnapshotScene, pick: (k: BlockKind) => boolean): string {
  return sc.blocks
    .filter((b) => pick(b.kind) && b.kind !== "character")
    .map((b) => `${b.kind}:${b.text}`)
    .join("\n");
}

/** Lengste felles delsekvens (for å finne hvilke scener som faktisk er flyttet). */
function lcs(a: readonly string[], b: readonly string[]): Set<string> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const keep = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      keep.add(a[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  return keep;
}

/** Endringer fra `older` til `newer`, i rekkefølgen scenene står i `newer` (fjernede til slutt). */
export function diffSnapshots(older: ScriptSnapshot, newer: ScriptSnapshot): SceneChange[] {
  // Sammenlignes per sceneforekomst (permanent i produksjonen; samme scene kan brukes flere ganger)
  const a = byOccurrence(older);
  const b = byOccurrence(newer);
  const out: SceneChange[] = [];
  const label = (sc: SnapshotScene) => ({
    occurrenceId: sc.occurrenceId,
    number: sc.number,
    heading: formatHeading(sc.heading),
  });
  // Flytting vurderes blant scener som finnes i begge
  const common = (snap: ScriptSnapshot, other: Map<string, SnapshotScene>) =>
    snap.scenes.map((x) => x.occurrenceId).filter((id) => other.has(id));
  const stay = lcs(common(older, b), common(newer, a));

  for (const sc of newer.scenes) {
    const old = a.get(sc.occurrenceId);
    if (!old) {
      out.push({ type: "added", sceneId: sc.sceneId, ...label(sc) });
      continue;
    }
    if (old.active && !sc.active)
      out.push({ type: "deactivated", sceneId: sc.sceneId, ...label(sc) });
    if (!old.active && sc.active)
      out.push({ type: "activated", sceneId: sc.sceneId, ...label(sc) });
    if (!stay.has(sc.occurrenceId)) out.push({ type: "moved", sceneId: sc.sceneId, ...label(sc) });
    if (old.number !== sc.number)
      out.push({
        type: "renumbered",
        sceneId: sc.sceneId,
        ...label(sc),
        detail: `${old.number ?? "uten nummer"} → ${sc.number ?? "uten nummer"}`,
      });
    if (old.activeTakeId !== sc.activeTakeId)
      out.push({ type: "take", sceneId: sc.sceneId, ...label(sc) });
    if (old.variantId !== sc.variantId)
      out.push({ type: "variant", sceneId: sc.sceneId, ...label(sc) });
    if (formatHeading(old.heading) !== formatHeading(sc.heading))
      out.push({
        type: "heading",
        sceneId: sc.sceneId,
        ...label(sc),
        detail: `${formatHeading(old.heading)} → ${formatHeading(sc.heading)}`,
      });
    if (textOf(old, (k) => DIALOGUE_KINDS.has(k)) !== textOf(sc, (k) => DIALOGUE_KINDS.has(k)))
      out.push({ type: "dialogue", sceneId: sc.sceneId, ...label(sc) });
    if (textOf(old, (k) => !DIALOGUE_KINDS.has(k)) !== textOf(sc, (k) => !DIALOGUE_KINDS.has(k)))
      out.push({ type: "action", sceneId: sc.sceneId, ...label(sc) });
    const ca = charactersOf(old);
    const cb = charactersOf(sc);
    const added = [...cb].filter((x) => !ca.has(x));
    const gone = [...ca].filter((x) => !cb.has(x));
    if (added.length || gone.length)
      out.push({
        type: "characters",
        sceneId: sc.sceneId,
        ...label(sc),
        detail: [
          added.length ? `+ ${added.join(", ")}` : "",
          gone.length ? `− ${gone.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("  "),
      });
  }
  for (const sc of older.scenes)
    if (!b.has(sc.occurrenceId)) out.push({ type: "removed", sceneId: sc.sceneId, ...label(sc) });
  return out;
}

/** Sammenligner snapshot-innhold uavhengig av nøkkelrekkefølge (for test av at databasen gir samme bilde). */
export function sameSnapshot(x: ScriptSnapshot, y: ScriptSnapshot): boolean {
  const norm = (s: ScriptSnapshot) =>
    JSON.stringify({
      p: s.productionId,
      s: s.scenes.map((c) => [
        c.occurrenceId,
        c.sceneId,
        c.variantId,
        c.number,
        c.active,
        c.activeTakeId,
        c.heading.intExt,
        c.heading.location,
        c.heading.time,
        c.blocks.map((b) => [b.id, b.kind, b.text, b.rev]),
      ]),
    });
  return norm(x) === norm(y);
}
