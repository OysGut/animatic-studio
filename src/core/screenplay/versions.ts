/**
 * Manusversjoner (mandat 2.2, 5.1; REQ-0032, REQ-0069, REQ-0076–REQ-0078).
 * Et øyeblikksbilde er uforanderlig. Databasen lager det (private.script_snapshot i migrasjon 0003) i samme
 * format som snapshotFromState, slik at det kan testes og sammenlignes i kjernen.
 */
import type { Asset, BlockKind, ProjectState, SceneHeading } from "../model";
import { blocksOfVariant, orderedOccurrences } from "../views";
import { characterName, mentions } from "./filter";
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
  | "objects" // objekter fra ressursbiblioteket som nevnes i scenen (REQ-0078)
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
  /** Linjene som er endret (dialog/handling, og innholdet i nye/fjernede scener) – REQ-0534. */
  readonly lines?: readonly LineChange[];
  /** Karakterer eller objekter som er kommet til eller borte i scenen (REQ-0078). */
  readonly names?: { readonly added: readonly string[]; readonly removed: readonly string[] };
}

/**
 * Ressursene i biblioteket som brukes til å kjenne igjen karakterer og objekter i manusteksten (REQ-0078).
 * Øyeblikksbildet har bare teksten, så navnene matches mot den (samme regler som ressursbruk i biblioteket).
 */
export type ScriptLibraryAsset = Pick<Asset, "kind" | "name" | "names"> & {
  readonly archived?: boolean;
  /** Slettet (DEC-0079): regnes som ikke i biblioteket. */
  readonly removed?: boolean;
};

/** Én endret linje (manusblokk) i en scene (REQ-0534). */
export interface LineChange {
  readonly op: "changed" | "added" | "removed";
  readonly kind: BlockKind;
  /** Hvem som snakker (for replikk og parentes). */
  readonly speaker: string | null;
  readonly before: string | null;
  readonly after: string | null;
}

/** Ord-for-ord-forskjell for uthevelse (REQ-0534). */
export interface WordPart {
  readonly op: "same" | "added" | "removed";
  readonly text: string;
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
  objects: "Endrede objekter",
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

/** Tekst der karakterer og objekter kan nevnes: handling og bildeutsnitt (ikke replikker). */
function actionText(sc: SnapshotScene): string {
  return sc.blocks
    .filter((b) => b.kind === "action" || b.kind === "shot")
    .map((b) => b.text)
    .join("\n");
}

const keyOf = (name: string) => characterName(name);
const namesOf = (a: ScriptLibraryAsset) =>
  [a.name, ...a.names.map((n) => n.name)].map((n) => n.trim()).filter(Boolean);

/**
 * Karakterene i scenen: alle med replikk (karakterbetegnelsen), og karakterer fra biblioteket som nevnes i
 * handlingen uten å snakke (stor forbokstav eller store bokstaver, som i biblioteket). Navn med store bokstaver.
 */
export function charactersOf(
  sc: SnapshotScene,
  library: readonly ScriptLibraryAsset[] = [],
): Set<string> {
  const out = new Set(
    sc.blocks
      .filter((b) => b.kind === "character")
      .map((b) => characterName(b.text))
      .filter(Boolean),
  );
  const text = actionText(sc);
  for (const a of library) {
    if (a.kind !== "character" || a.archived || a.removed) continue;
    const names = namesOf(a);
    // Har replikk under et av navnene: allerede med
    if (names.some((n) => out.has(keyOf(n)))) continue;
    if (names.some((n) => mentions(text, keyOf(n)))) out.add(keyOf(a.name));
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Ord som begynner med navnet, uansett store/små bokstaver («vase» treffer «vasen»); flere ord i sammenheng. */
function hasWordPrefix(text: string, name: string): boolean {
  const key = name.toLocaleLowerCase("nb").trim();
  if (key.length < 2) return false;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(key)}`, "iu");
  return re.test(text);
}

/** Objektene fra biblioteket som nevnes i scenen (handling, replikker og overskrift). Foretrukket navn. */
export function objectsOf(sc: SnapshotScene, library: readonly ScriptLibraryAsset[]): Set<string> {
  const out = new Set<string>();
  const text = [formatHeading(sc.heading), ...sc.blocks.map((b) => b.text)].join("\n");
  for (const a of library) {
    if (a.kind !== "object" || a.archived || a.removed) continue;
    if (namesOf(a).some((n) => hasWordPrefix(text, n))) out.add(a.name);
  }
  return out;
}

/** Hva som er kommet til og borte mellom to mengder navn, sortert. */
function setChange(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): { added: string[]; removed: string[] } {
  const sort = (xs: string[]) => xs.sort((x, y) => x.localeCompare(y, "nb"));
  return {
    added: sort([...after].filter((x) => !before.has(x))),
    removed: sort([...before].filter((x) => !after.has(x))),
  };
}

function setChangeText(c: { added: readonly string[]; removed: readonly string[] }): string {
  return [
    c.added.length ? `+ ${c.added.join(", ")}` : "",
    c.removed.length ? `− ${c.removed.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("  ");
}

function textOf(sc: SnapshotScene, pick: (k: BlockKind) => boolean): string {
  // Hvem som sier replikken, hører til replikken (byttet taler eller «(V.O.)» er en endring)
  const who = rawSpeakers(sc);
  return sc.blocks
    .filter((b) => pick(b.kind) && b.kind !== "character")
    .map((b) => `${b.kind}:${who.get(b.id) ?? ""}:${b.text}`)
    .join("\n");
}

/** Talerlinjen slik den står (med utvidelse som «(V.O.)»), per replikk- og parentesblokk. */
function rawSpeakers(sc: SnapshotScene): Map<string, string | null> {
  const out = new Map<string, string | null>();
  let who: string | null = null;
  for (const b of sc.blocks) {
    if (b.kind === "character") who = b.text.trim() || null;
    else if (b.kind !== "dialogue" && b.kind !== "parenthetical") who = null;
    out.set(b.id, b.kind === "dialogue" || b.kind === "parenthetical" ? who : null);
  }
  return out;
}

function countText(lines: readonly LineChange[]): string {
  const n = (op: LineChange["op"]) => lines.filter((l) => l.op === op).length;
  const parts: string[] = [];
  const c = n("changed");
  const a = n("added");
  const r = n("removed");
  if (c) parts.push(`${c} ${c === 1 ? "linje endret" : "linjer endret"}`);
  if (a) parts.push(`${a} ny${a === 1 ? "" : "e"}`);
  if (r) parts.push(`${r} fjernet`);
  return parts.join(", ");
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

/**
 * Forekomster som er flyttet fra `older` til `newer` (REQ-0533). Samme regel som «Flyttet scene» i sammenligningen:
 * bare scener utenfor lengste felles rekkefølge, så én flyttet scene ikke får alle mellom til å se flyttet ut.
 */
export function movedOccurrences(
  older: Pick<ScriptSnapshot, "scenes">,
  newerOrder: readonly string[],
): Set<string> {
  const inNewer = new Set(newerOrder);
  const oldIds = older.scenes.map((x) => x.occurrenceId);
  const inOlder = new Set(oldIds);
  const stay = lcs(
    oldIds.filter((id) => inNewer.has(id)),
    newerOrder.filter((id) => inOlder.has(id)),
  );
  return new Set(newerOrder.filter((id) => inOlder.has(id) && !stay.has(id)));
}

function speakers(sc: SnapshotScene): Map<string, string | null> {
  const out = new Map<string, string | null>();
  let who: string | null = null;
  for (const b of sc.blocks) {
    if (b.kind === "character") who = characterName(b.text) || null;
    else if (b.kind !== "dialogue" && b.kind !== "parenthetical") who = null;
    out.set(b.id, b.kind === "dialogue" || b.kind === "parenthetical" ? who : null);
  }
  return out;
}

/**
 * Linjeforskjeller i en scene, i rekkefølgen de står i den nyeste versjonen (fjernede linjer der de sto).
 * Blokkene sammenlignes på permanent ID, så en endret replikk er «endret», ikke «fjernet + ny».
 */
export function sceneLineChanges(
  older: SnapshotScene | null,
  newer: SnapshotScene | null,
  pick: (k: BlockKind) => boolean = () => true,
): LineChange[] {
  const oldBlocks = older?.blocks ?? [];
  const newBlocks = newer?.blocks ?? [];
  const oldById = new Map(oldBlocks.map((b) => [b.id, b]));
  const newIds = new Set(newBlocks.map((b) => b.id));
  const sOld = older ? speakers(older) : new Map<string, string | null>();
  const sNew = newer ? speakers(newer) : new Map<string, string | null>();
  const rOld = older ? rawSpeakers(older) : new Map<string, string | null>();
  const rNew = newer ? rawSpeakers(newer) : new Map<string, string | null>();
  // Fjernede linjer plasseres etter siste felles linje før dem
  const removedAfter = new Map<string | null, LineChange[]>();
  let lastCommon: string | null = null;
  for (const b of oldBlocks) {
    if (newIds.has(b.id)) lastCommon = b.id;
    else if (pick(b.kind)) {
      const list = removedAfter.get(lastCommon) ?? [];
      list.push({
        op: "removed",
        kind: b.kind,
        speaker: sOld.get(b.id) ?? null,
        before: b.text,
        after: null,
      });
      removedAfter.set(lastCommon, list);
    }
  }
  const out: LineChange[] = [...(removedAfter.get(null) ?? [])];
  for (const b of newBlocks) {
    const o = oldById.get(b.id);
    if (!o) {
      if (pick(b.kind))
        out.push({
          op: "added",
          kind: b.kind,
          speaker: sNew.get(b.id) ?? null,
          before: null,
          after: b.text,
        });
    } else {
      const speakerChanged = (rOld.get(b.id) ?? null) !== (rNew.get(b.id) ?? null);
      if (
        (o.text !== b.text || o.kind !== b.kind || speakerChanged) &&
        (pick(b.kind) || pick(o.kind))
      )
        out.push({
          op: "changed",
          kind: b.kind,
          speaker: sNew.get(b.id) ?? null,
          // Byttet taler vises som en del av teksten (før → etter)
          before: speakerChanged ? `${rOld.get(b.id) ?? "–"}: ${o.text}` : o.text,
          after: speakerChanged ? `${rNew.get(b.id) ?? "–"}: ${b.text}` : b.text,
        });
      out.push(...(removedAfter.get(b.id) ?? []));
    }
  }
  return out;
}

/** Ord-for-ord-forskjell mellom to tekster (lengste felles delsekvens av ord og mellomrom). */
export function wordDiff(before: string, after: string): WordPart[] {
  const a = before.split(/(\s+)/).filter((x) => x !== "");
  const b = after.split(/(\s+)/).filter((x) => x !== "");
  // Svært lange tekster: vis bare gammel og ny i sin helhet
  if (a.length * b.length > 250_000)
    return [
      { op: "removed", text: before },
      { op: "added", text: after },
    ];
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: WordPart[] = [];
  const push = (op: WordPart["op"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) out[out.length - 1] = { op, text: last.text + text };
    else out.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("same", a[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) push("removed", a[i++]!);
    else push("added", b[j++]!);
  }
  while (i < n) push("removed", a[i++]!);
  while (j < m) push("added", b[j++]!);
  return out;
}

function placeText(snap: ScriptSnapshot, index: number): string {
  const prev = index > 0 ? snap.scenes[index - 1] : undefined;
  const where = prev
    ? `etter scene ${prev.number ?? `uten nummer (${formatHeading(prev.heading)})`}`
    : "først";
  return `plass ${index + 1}, ${where}`;
}

/**
 * Endringer fra `older` til `newer`, i rekkefølgen scenene står i `newer` (fjernede til slutt). Med
 * `library` (ressursbiblioteket) kjennes også karakterer som bare nevnes i handlingen og objekter igjen
 * (REQ-0078).
 */
export function diffSnapshots(
  older: ScriptSnapshot,
  newer: ScriptSnapshot,
  library: readonly ScriptLibraryAsset[] = [],
): SceneChange[] {
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
      out.push({
        type: "added",
        sceneId: sc.sceneId,
        ...label(sc),
        detail: `${placeText(newer, newer.scenes.indexOf(sc))}${sc.active ? "" : " (deaktivert)"}`,
        lines: sceneLineChanges(null, sc),
      });
      continue;
    }
    if (old.active && !sc.active)
      out.push({ type: "deactivated", sceneId: sc.sceneId, ...label(sc) });
    if (!old.active && sc.active)
      out.push({ type: "activated", sceneId: sc.sceneId, ...label(sc) });
    if (!stay.has(sc.occurrenceId))
      out.push({
        type: "moved",
        sceneId: sc.sceneId,
        ...label(sc),
        detail: `Sto på ${placeText(older, older.scenes.indexOf(old))}. Står nå på ${placeText(newer, newer.scenes.indexOf(sc))}.`,
      });
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
    if (textOf(old, (k) => DIALOGUE_KINDS.has(k)) !== textOf(sc, (k) => DIALOGUE_KINDS.has(k))) {
      const lines = sceneLineChanges(old, sc, (k) => DIALOGUE_KINDS.has(k));
      out.push({
        type: "dialogue",
        sceneId: sc.sceneId,
        ...label(sc),
        detail: countText(lines),
        lines,
      });
    }
    if (textOf(old, (k) => !DIALOGUE_KINDS.has(k)) !== textOf(sc, (k) => !DIALOGUE_KINDS.has(k))) {
      const lines = sceneLineChanges(old, sc, (k) => !DIALOGUE_KINDS.has(k) && k !== "character");
      out.push({
        type: "action",
        sceneId: sc.sceneId,
        ...label(sc),
        detail: countText(lines),
        lines,
      });
    }
    const chars = setChange(charactersOf(old, library), charactersOf(sc, library));
    if (chars.added.length || chars.removed.length)
      out.push({
        type: "characters",
        sceneId: sc.sceneId,
        ...label(sc),
        detail: setChangeText(chars),
        names: chars,
      });
    if (library.length) {
      const objs = setChange(objectsOf(old, library), objectsOf(sc, library));
      if (objs.added.length || objs.removed.length)
        out.push({
          type: "objects",
          sceneId: sc.sceneId,
          ...label(sc),
          detail: setChangeText(objs),
          names: objs,
        });
    }
  }
  for (const sc of older.scenes)
    if (!b.has(sc.occurrenceId))
      out.push({
        type: "removed",
        sceneId: sc.sceneId,
        ...label(sc),
        detail: `Sto på ${placeText(older, older.scenes.indexOf(sc))}`,
        lines: sceneLineChanges(sc, null),
      });
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
