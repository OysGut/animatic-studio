/**
 * Gjør en tidligere manusversjon gjeldende (REQ-0077, KI-27). Ingenting slettes: kommandoene setter teksten,
 * elementtypene, overskriftene, synligheten og rekkefølgen tilbake slik de var i versjonens øyeblikksbilde.
 * Linjer som er kommet til siden, fjernes (RemoveBlock – teksten og historikken beholdes), fjernede linjer
 * gjenopprettes, og scener som er kommet til, deaktiveres. Resultatet er en ny endring som kan angres samlet,
 * og som kan lagres som en ny versjon. Materiale laget fra nyere tekst flagges som avvik som vanlig (DEC-0054).
 *
 * Det som ikke kan settes tilbake med vanlige kommandoer (en scene som er borte fra produksjonen, en scene som
 * nå bruker en annen scenevariant, linjer som er flyttet til en annen scene ved deling eller sammenslåing),
 * hoppes over og rapporteres, så brukeren ser det før hun bekrefter. Scenenumre og aktiv filmversjon er ikke
 * manustekst og endres ikke.
 */
import { applyCommand } from "../commands/apply";
import type { Command } from "../commands/types";
import type { ProjectState, SceneOccurrence } from "../model";
import { compareKeys, keyBetween } from "../order-key";
import { blocksOfVariant, orderedOccurrences } from "../views";
import { scriptRevertCommands, type ScriptChange } from "../assembly/discrepancy";
import { formatHeading } from "./paginate";
import {
  diffSnapshots,
  snapshotFromState,
  type SceneChange,
  type ScriptSnapshot,
  type SnapshotScene,
} from "./versions";

/** Noe som ikke kan settes tilbake, med forklaring (vises før brukeren bekrefter). */
export interface RestoreIssue {
  readonly occurrenceId: string;
  readonly number: string | null;
  readonly heading: string;
  readonly reason: string;
}

export interface RestorePlan {
  readonly commands: readonly Command[];
  readonly issues: readonly RestoreIssue[];
}

const sameHeading = (a: SnapshotScene["heading"], b: SnapshotScene["heading"]) =>
  a.intExt === b.intExt && a.location === b.location && a.time === b.time;

/** Kommandoene som gjør versjonen gjeldende (se restoreVersionPlan for det som hoppes over). */
export function restoreVersionCommands(
  state: ProjectState,
  productionId: string,
  snapshot: ScriptSnapshot,
): Command[] {
  return [...restoreVersionPlan(state, productionId, snapshot).commands];
}

export function restoreVersionPlan(
  state: ProjectState,
  productionId: string,
  snapshot: ScriptSnapshot,
): RestorePlan {
  const pid = productionId as never;
  const issues: RestoreIssue[] = [];
  const issue = (sc: SnapshotScene | null, o: SceneOccurrence | null, reason: string) => {
    const v = o ? state.variants[o.variantId] : null;
    issues.push({
      occurrenceId: sc?.occurrenceId ?? o?.id ?? "",
      number: sc?.number ?? o?.productionNumber ?? null,
      heading: sc ? formatHeading(sc.heading) : v ? formatHeading(v.heading) : "",
      reason,
    });
  };
  if (snapshot.productionId !== productionId) return { commands: [], issues };

  const current = orderedOccurrences(state, productionId);
  const byId = new Map(current.map((o) => [o.id as string, o]));
  // Linjene i versjonen og scenevarianten de sto i (for å kjenne igjen linjer som er flyttet til en annen scene)
  const snapVariantOf = new Map<string, string>();
  for (const sc of snapshot.scenes)
    for (const b of sc.blocks) snapVariantOf.set(b.id, sc.variantId);
  const segmentBound = new Set<string>();
  for (const g of Object.values(state.segments)) {
    if (g.startBlockId) segmentBound.add(g.startBlockId);
    if (g.endBlockId) segmentBound.add(g.endBlockId);
  }

  const textCmds: Command[] = [];
  const otherCmds: Command[] = [];
  const doneVariants = new Set<string>();
  const present: { sc: SnapshotScene; o: SceneOccurrence }[] = [];

  for (const sc of snapshot.scenes) {
    const o = byId.get(sc.occurrenceId);
    if (!o) {
      issue(
        sc,
        null,
        "Scenen finnes ikke lenger i produksjonen og kan ikke hentes tilbake herfra.",
      );
      continue;
    }
    present.push({ sc, o });
    if (o.active !== sc.active)
      otherCmds.push({ type: "SetOccurrenceActive", occurrenceId: o.id, active: sc.active });
    if (o.variantId !== sc.variantId) {
      issue(
        sc,
        o,
        "Scenen bruker en annen versjon av scenen nå (egen versjon eller tilbakeføring). Teksten er ikke endret.",
      );
      continue;
    }
    // Samme scene kan brukes flere ganger i produksjonen: teksten settes tilbake én gang per variant
    if (doneVariants.has(sc.variantId)) continue;
    doneVariants.add(sc.variantId);
    const v = state.variants[sc.variantId];
    if (v && !sameHeading(v.heading, sc.heading))
      textCmds.push({
        type: "EditSceneHeading",
        productionId: pid,
        variantId: v.id,
        heading: {
          intExt: sc.heading.intExt,
          location: sc.heading.location,
          time: sc.heading.time,
        },
      });

    const changes: ScriptChange[] = [];
    let moved = 0;
    let missing = 0;
    for (const sb of sc.blocks) {
      const b = state.blocks[sb.id];
      if (!b) {
        missing++;
        continue;
      }
      if (b.variantId !== sc.variantId) {
        moved++;
        continue;
      }
      if (b.kind !== sb.kind)
        textCmds.push({ type: "SetBlockKind", productionId: pid, blockId: b.id, kind: sb.kind });
      if (b.removed)
        changes.push({
          blockId: b.id,
          kind: "removed",
          blockKind: sb.kind,
          oldText: sb.text,
          newText: null,
        });
      else if (b.text !== sb.text)
        changes.push({
          blockId: b.id,
          kind: "changed",
          blockKind: sb.kind,
          oldText: sb.text,
          newText: b.text,
        });
    }
    const inSnap = new Set(sc.blocks.map((b) => b.id));
    let kept = 0;
    for (const b of blocksOfVariant(state, sc.variantId)) {
      if (inSnap.has(b.id)) continue;
      // Linjen sto i en annen scene i versjonen (sammenslåing): den fjernes ikke, så teksten ikke forsvinner
      if (snapVariantOf.has(b.id) || segmentBound.has(b.id)) {
        kept++;
        continue;
      }
      changes.push({
        blockId: b.id,
        kind: "added",
        blockKind: b.kind,
        oldText: null,
        newText: b.text,
      });
    }
    textCmds.push(...scriptRevertCommands(state, productionId, changes));
    if (moved)
      issue(
        sc,
        o,
        `${moved} ${moved === 1 ? "linje er" : "linjer er"} flyttet til en annen scene (deling eller sammenslåing) og settes ikke tilbake her.`,
      );
    if (missing)
      issue(sc, o, `${missing} ${missing === 1 ? "linje finnes" : "linjer finnes"} ikke lenger.`);
    if (kept)
      issue(
        sc,
        o,
        `${kept} ${kept === 1 ? "linje" : "linjer"} som er kommet til, beholdes (de brukes av en annen scene i versjonen eller som grense for et produksjonssegment).`,
      );
  }

  // Scener som er kommet til siden versjonen: deaktiveres (slettes aldri). Har scenen linjer som sto i en
  // annen scene i versjonen (deling), beholdes den aktiv, så teksten ikke forsvinner fra manuset.
  const inSnapshot = new Set(snapshot.scenes.map((sc) => sc.occurrenceId));
  for (const o of current) {
    if (inSnapshot.has(o.id) || !o.active) continue;
    const holdsVersionText = blocksOfVariant(state, o.variantId).some((b) =>
      snapVariantOf.has(b.id),
    );
    if (holdsVersionText) {
      issue(
        null,
        o,
        "Scenen er laget etter versjonen (ved deling) og har tekst fra versjonen. Den beholdes aktiv.",
      );
      continue;
    }
    otherCmds.push({ type: "SetOccurrenceActive", occurrenceId: o.id, active: false });
  }

  return {
    commands: [
      ...textCmds,
      ...otherCmds,
      ...orderCommands(present, new Set(current.map((o) => o.orderKey))),
    ],
    issues,
  };
}

/**
 * Rekkefølgen fra versjonen. Bare scener utenfor lengste stigende rekkefølge flyttes (så én flyttet scene
 * ikke gir flytting av alle mellom); nye nøkler legges mellom naboene i versjonens rekkefølge.
 */
function orderCommands(
  present: readonly { sc: SnapshotScene; o: SceneOccurrence }[],
  taken: Set<string>,
): Command[] {
  const keys = present.map((p) => p.o.orderKey);
  const n = keys.length;
  if (n < 2) return [];
  // Lengste strengt stigende delsekvens av nøklene (O(n²) – manus har noen hundre scener)
  const len = new Array<number>(n).fill(1);
  const prev = new Array<number>(n).fill(-1);
  let best = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++)
      if (compareKeys(keys[j]!, keys[i]!) < 0 && len[j]! + 1 > len[i]!) {
        len[i] = len[j]! + 1;
        prev[i] = j;
      }
    if (len[i]! > len[best]!) best = i;
  }
  const stay = new Set<number>();
  for (let i = best; i >= 0; i = prev[i]!) stay.add(i);
  if (stay.size === n) return [];

  const out: Command[] = [];
  const finalKeys = [...keys];
  for (let i = 0; i < n; i++) {
    if (stay.has(i)) continue;
    const before = i > 0 ? finalKeys[i - 1]! : null;
    let after: string | null = null;
    for (let j = i + 1; j < n; j++)
      if (stay.has(j)) {
        after = finalKeys[j]!;
        break;
      }
    // Nøkkelen må være ledig i produksjonen (også blant scener som ikke var med i versjonen)
    let key = keyBetween(before, after);
    while (taken.has(key)) key = keyBetween(key, after);
    taken.add(key);
    finalKeys[i] = key;
    out.push({ type: "MoveOccurrence", occurrenceId: present[i]!.o.id, orderKey: key });
  }
  return out;
}

export interface RestorePreview extends RestorePlan {
  /** Det som endres i det gjeldende manuset (samme format som sammenligningen av versjoner). */
  readonly changes: readonly SceneChange[];
  /** Feilmelding når kommandoene ikke kan utføres (f.eks. delt scene i en avledet produksjon). */
  readonly error: string | null;
}

const PREVIEW_ACTOR = "00000000-0000-7000-8000-000000000000";

/**
 * Prøver kommandoene på en kopi av tilstanden og viser hva som endres (forhåndsvisning før bekreftelse), så
 * en gjenoppretting aldri blir halvveis.
 */
export function previewRestore(
  state: ProjectState,
  productionId: string,
  snapshot: ScriptSnapshot,
): RestorePreview {
  const plan = restoreVersionPlan(state, productionId, snapshot);
  let s = state;
  for (const c of plan.commands) {
    const r = applyCommand(s, {
      id: PREVIEW_ACTOR as never,
      actor: PREVIEW_ACTOR as never,
      at: "1970-01-01T00:00:00.000Z",
      command: c,
    });
    if (!r.ok) return { ...plan, changes: [], error: r.error.message };
    s = r.state;
  }
  const changes = diffSnapshots(
    snapshotFromState(state, productionId),
    snapshotFromState(s, productionId),
  );
  return { ...plan, changes, error: null };
}

/** Er rekkefølgen av nøkler fortsatt stigende (hjelper for tester og kontroll)? */
export function isAscending(keys: readonly string[]): boolean {
  for (let i = 1; i < keys.length; i++) if (compareKeys(keys[i - 1]!, keys[i]!) >= 0) return false;
  return true;
}
