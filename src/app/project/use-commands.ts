/**
 * Kjør kommandoer fra grensesnittet (ADR-0005, DEC-0022, DEC-0025).
 * 1. Kommandoen kjøres lokalt i domenekjernen (umiddelbar respons, samme regler som serveren).
 * 2. Den sendes til serverfunksjonen runCommand, én om gangen og i rekkefølge, med revisjonene brukeren så,
 *    slik at ingen andres endringer overskrives i stillhet (INV-C1, REQ-0520–0522).
 * 3. Angre/gjør om er per bruker. En angring sendes med revisjonene i brukerens nåværende visning (serveren
 *    avviser hvis noen har endret noe brukeren ikke har sett), og angring av noe en annen bruker har endret
 *    etterpå, stoppes med forklaring (sanntidsvarsel fra change_log).
 * 4. Feiler en lagring, sendes ikke kommandoer som var bygget oppå den; siste versjon hentes når køen er tom.
 * 5. Avvises en tekstendring (revisjonskonflikt eller feil underveis), eller sendes den ikke fordi en
 *    tidligere endring feilet, beholdes teksten brukeren skrev (`rejected`, alle avviste tekster), så den kan
 *    kopieres eller – for en manuslinje – legges oppå siste versjon (KI-182).
 * 6. `whenIdle` venter til alt i køen er lagret (og siste versjon er hentet etter en feil), så noe som skal
 *    gjenspeile det lagrede manuset (versjon, lagret estimat), ikke bygger på endringer som ennå ikke er lagret.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyCommand, forkPlan, newId, revisionsOf, type Command, type ProjectState } from "@/core";
import { nfcDeep } from "@/core/nfc";
import { runCommand } from "@/adapters/storage/commands.functions";
import {
  commandQueue,
  foreignChangeListeners,
  ownCommandIds,
  projectStateKey,
} from "./use-project";
import { t as tk } from "@/core/i18n/keyed";

export interface HistoryEntry {
  readonly id: string;
  readonly label: string;
  readonly inverse: Command;
  /** Entiteter kommandoen endret (for å oppdage at noen andre har endret dem etterpå). */
  readonly affected: readonly string[];
  /**
   * Flere endringer som angres samlet (DEC-0049, f.eks. «Importer lang film»), i den rekkefølgen de ble
   * gjort. Angre kjører inversene i motsatt rekkefølge.
   */
  readonly steps?: readonly HistoryEntry[];
  /** Nøkkelen endringene ble samlet under (se `group` i run/runAndWait). */
  readonly group?: string;
  /**
   * Telleren for andres endringer da endringen ble gjort (se `touchedByOthers`): andres endringer som var
   * varslet før dette, var allerede med i det endringen bygde på, og stopper ikke angring.
   */
  readonly seenForeign?: number;
}

const stepsOf = (e: HistoryEntry): readonly HistoryEntry[] => e.steps ?? [e];

/** Legger en ny endring på angrelisten; med samme gruppe som den øverste slås de sammen til ett steg. */
export function pushEntry(
  list: HistoryEntry[],
  entry: HistoryEntry,
  group?: string,
): HistoryEntry[] {
  const top = list[list.length - 1];
  if (group && top?.group === group) {
    const steps = [...stepsOf(top), entry];
    return [
      ...list.slice(0, -1),
      {
        ...top,
        steps,
        affected: [...new Set(steps.flatMap((x) => x.affected))],
      },
    ];
  }
  return [...list.slice(-199), group ? { ...entry, group } : entry];
}

export type SaveStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "saving"; readonly pending: number }
  | { readonly kind: "error"; readonly message: string };

/**
 * En tekstendring serveren avviste (KI-182). Teksten forkastes ikke: den vises i varselet med «Kopier
 * teksten», og en manuslinje (EditBlockText) kan prøves igjen oppå siste versjon.
 */
export interface RejectedEdit {
  /** Id-en kommandoen fikk da den ble sendt. */
  readonly id: string;
  readonly label: string;
  /** Teksten brukeren skrev. */
  readonly text: string;
  readonly command: Command;
  /** «Prøv igjen med min tekst» er mulig (bare for manuslinjer, EditBlockText). */
  readonly retryable: boolean;
  /** Avvist fordi noen andre endret det samme (ellers feilet lagringen av en annen grunn). */
  readonly conflict: boolean;
  /** Ikke sendt fordi en tidligere endring feilet. */
  readonly skipped?: boolean;
}

/** Teksten brukeren skrev i en kommando, eller null hvis kommandoen ikke bærer egen tekst. */
export function rejectedText(command: Command): string | null {
  switch (command.type) {
    case "EditBlockText":
    case "EditAnnotation":
      return command.text;
    case "InsertBlock":
      return command.block.text;
    case "AddAnnotations": {
      const texts = command.annotations.map((a) => a.text).filter((t) => t.trim().length > 0);
      return texts.length ? texts.join("\n\n") : null;
    }
    default:
      return null;
  }
}

/**
 * K-1: en endring som ble avvist fordi noen andre endret det samme (revision_conflict). Brukeren velger selv
 * «Legg min endring oppå» eller «Forkast min endring»; ingenting skjer automatisk.
 */
export interface ConflictedEdit {
  readonly id: string;
  readonly label: string;
  readonly command: Command;
  /** Entitetene endringen gjaldt (for å finne scenen). */
  readonly affected: readonly string[];
}

/** Legger til en konflikt i listen (samme kommando bare én gang). */
export function addConflict(list: readonly ConflictedEdit[], c: ConflictedEdit): ConflictedEdit[] {
  return [...list.filter((x) => x.id !== c.id), c];
}

/** Beskrivelsen av en avvist endring for varselet, eller null når det ikke er tekst å ta vare på. */
export function rejectedEdit(
  id: string,
  command: Command,
  label: string,
  conflict: boolean,
): RejectedEdit | null {
  const text = rejectedText(command);
  if (text === null || text.trim().length === 0) return null;
  return { id, label, text, command, retryable: command.type === "EditBlockText", conflict };
}

const conflictUndo = () =>
  tk("app-project-use-commands.conflict-undo.message.b15a31c7cd3f");
const skipped = () =>
  tk("app-project-use-commands.skipped.message.a32bdb4eb7ad");

/**
 * Kjører inversene for et steg (en samlet endring baklengs) med `run`. Gir steget som angrer det igjen
 * (null hvis ingenting ble utført) og det som ikke ble kjørt fordi en endring ble avvist (blir stående på
 * listen, i opprinnelig rekkefølge).
 */
export function replayEntry(
  entry: HistoryEntry,
  run: (inverse: Command, step: HistoryEntry) => HistoryEntry | null,
): { back: HistoryEntry | null; rest: HistoryEntry | null } {
  const steps = [...stepsOf(entry)].reverse();
  const done: HistoryEntry[] = [];
  let i = 0;
  for (; i < steps.length; i++) {
    const e = run(steps[i]!.inverse, steps[i]!);
    if (!e) break;
    done.push(e);
  }
  const back: HistoryEntry | null =
    done.length === 0
      ? null
      : !entry.steps
        ? { ...done[0]!, label: entry.label }
        : {
            ...done[0]!,
            label: entry.label,
            steps: done,
            affected: [...new Set(done.flatMap((x) => x.affected))],
          };
  const rest = steps.slice(i).reverse();
  return {
    back,
    rest: rest.length === 0 ? null : entry.steps ? { ...entry, steps: rest } : entry,
  };
}

/**
 * Fjerner én endring (som ikke ble lagret) fra en liste. I en samlet endring fjernes bare det steget; resten
 * står igjen og kan fortsatt angres.
 */
export function withoutStep(list: readonly HistoryEntry[], id: string): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const e of list) {
    if (!e.steps) {
      if (e.id !== id) out.push(e);
      continue;
    }
    const steps = e.steps.filter((x) => x.id !== id);
    if (steps.length === e.steps.length) out.push(e);
    else if (steps.length > 0)
      out.push({ ...e, steps, affected: [...new Set(steps.flatMap((x) => x.affected))] });
  }
  return out;
}

/**
 * Stoppes angringen av et steg av andres endringer? Ja når noen andre har endret noe steget endret, etter at
 * steget ble gjort (`touched`: entitet → telleren da endringen ble varslet).
 */
export function blockedByOthers(
  entry: HistoryEntry,
  touched: ReadonlyMap<string, number>,
): boolean {
  return stepsOf(entry).some((step) =>
    step.affected.some((id) => (touched.get(id) ?? 0) > (step.seenForeign ?? 0)),
  );
}

/** Legger til en avvist tekst i listen (samme kommando bare én gang). */
function addRejected(list: readonly RejectedEdit[], r: RejectedEdit): RejectedEdit[] {
  return [...list.filter((x) => x.id !== r.id), r];
}

/**
 * R3: en virkning utenfor prosjektet som følger et angresteg (for eksempel å trekke en global versjon tilbake).
 * Knyttes til stegets gruppe; kjøres etter at selve kommandoen er lagret ved angre og gjør om. Feil vises som
 * lagringsfeil. Gjelder bare i økten, som resten av angrehistorikken.
 */
export interface HistoryEffect {
  undo(): Promise<string | null>;
  redo(): Promise<string | null>;
}
const historyEffects = new Map<string, HistoryEffect>();
export function registerHistoryEffect(group: string, effect: HistoryEffect): void {
  historyEffects.set(group, effect);
}

/**
 * DV5-rest (N3): et bakgrunnsresultat som serveren har lagt inn med apply_changes (kommandologgen har inversen).
 * Legges på brukerens lokale angreliste og angres deretter som en vanlig kommando (ingen nye betalte kall).
 */
export interface ServerHistoryRow {
  readonly group?: string;
  readonly commandId: string;
  readonly inverse: Command;
  readonly affected: readonly string[];
}

/** Gjør en rad fra serverhistorikken om til et vanlig angresteg. Ugyldige rader gir null. */
export function serverHistoryEntry(row: ServerHistoryRow, label: string, seenForeign: number): HistoryEntry | null {
  if (!row.commandId || !row.inverse || typeof (row.inverse as { type?: unknown }).type !== "string") return null;
  return { id: row.commandId, label, inverse: row.inverse, affected: [...row.affected], seenForeign, ...(row.group ? { group: row.group } : {}) };
}

/** Angrelistene per prosjekt som tar imot serverresultater (arbeidsflatenes hovedliste, sist montert vinner). */
const serverHistoryTargets = new Map<string, ((rows: readonly ServerHistoryRow[], label: string) => void)[]>();
const pendingServerHistory = new Map<string, { rows: ServerHistoryRow[]; label: string }[]>();
/** Kommandoer som allerede er lagt på en angreliste i denne fanen (samme resultat legges aldri inn to ganger). */
export const adoptedServerCommands = new Set<string>();

/**
 * N9 (KI-22): kilder som henter bakgrunnsresultater som ble ferdige mens panelet deres var lukket.
 * Kalles hver gang en arbeidsflate med serverHistory monteres; gjelder bare denne fanen og økten.
 */
const serverHistoryCatchUps = new Set<(projectId: string) => void>();
export function registerServerHistoryCatchUp(fn: (projectId: string) => void): void {
  serverHistoryCatchUps.add(fn);
}

/** Legg bakgrunnsresultater på angrelisten for prosjektet. Venter til en angreliste er montert. */
export function adoptServerHistory(projectId: string, rows: readonly ServerHistoryRow[], label: string): number {
  const fresh = rows.filter((r) => r.commandId && !adoptedServerCommands.has(r.commandId));
  if (fresh.length === 0) return 0;
  for (const r of fresh) {
    adoptedServerCommands.add(r.commandId);
    // Sanntidsekkoet regnes som eget, så resultatet ikke stopper sin egen angring som «andres endring»
    ownCommandIds.add(r.commandId);
  }
  const target = serverHistoryTargets.get(projectId)?.at(-1);
  if (target) target(fresh, label);
  else pendingServerHistory.set(projectId, [...(pendingServerHistory.get(projectId) ?? []), { rows: fresh, label }]);
  return fresh.length;
}

export function useCommands(projectId: string, actorId: string, enabled: boolean, onUndo?: (group: string | undefined) => void, keyboard = true, serverHistory = false) {
  const qc = useQueryClient();
  const [undoStack, setUndo] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedo] = useState<HistoryEntry[]>([]);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  /** Tekstendringer som ble avvist (KI-182); hver vises til brukeren lukker den eller prøver igjen. */
  const [rejected, setRejected] = useState<readonly RejectedEdit[]>([]);
  /** K-1: endringer avvist ved revisjonskonflikt; venter på brukerens valg. */
  const [conflicts, setConflicts] = useState<readonly ConflictedEdit[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const generation = useRef(0);
  const reloadWhenIdle = useRef(false);
  /** Hentingen av siste versjon etter en feil (whenIdle venter på den). */
  const reloading = useRef<Promise<unknown>>(Promise.resolve());
  /**
   * Entiteter andre har endret i denne økten, med telleren da endringen ble varslet. Et steg stoppes bare av
   * andres endringer som kom etter at steget ble gjort (se `blockedByOthers`).
   */
  const touchedByOthers = useRef(new Map<string, number>());
  const foreignSeq = useRef(0);

  useEffect(() => {
    const onForeign = (ids: readonly string[]) => {
      foreignSeq.current++;
      for (const id of ids) touchedByOthers.current.set(id, foreignSeq.current);
    };
    foreignChangeListeners.add(onForeign);
    return () => {
      foreignChangeListeners.delete(onForeign);
    };
  }, []);

  // DV5-rest (N3): arbeidsflatens hovedliste (serverHistory) tar imot bakgrunnsresultater fra serveren
  useEffect(() => {
    if (!serverHistory) return;
    const receive = (rows: readonly ServerHistoryRow[], label: string) => {
      const entries = rows.flatMap((r) => serverHistoryEntry(r, label, foreignSeq.current) ?? []);
      if (entries.length === 0) return;
      setUndo((u) => entries.reduce((list, e) => pushEntry(list, e, e.group), u));
      setRedo([]);
    };
    const list = serverHistoryTargets.get(projectId) ?? [];
    serverHistoryTargets.set(projectId, [...list, receive]);
    const waiting = pendingServerHistory.get(projectId);
    if (waiting) {
      pendingServerHistory.delete(projectId);
      for (const w of waiting) receive(w.rows, w.label);
    }
    for (const catchUp of serverHistoryCatchUps) catchUp(projectId);
    return () => {
      const rest = (serverHistoryTargets.get(projectId) ?? []).filter((f) => f !== receive);
      if (rest.length) serverHistoryTargets.set(projectId, rest);
      else serverHistoryTargets.delete(projectId);
    };
  }, [projectId, serverHistory]);

  const reload = useCallback(
    () => qc.invalidateQueries({ queryKey: projectStateKey(projectId) }),
    [qc, projectId],
  );

  const replaceInverse = useCallback((id: string, inverse: Command) => {
    const one = (e: HistoryEntry): HistoryEntry =>
      e.steps ? { ...e, steps: e.steps.map(one) } : e.id === id ? { ...e, inverse } : e;
    const swap = (list: HistoryEntry[]) => list.map(one);
    setUndo(swap);
    setRedo(swap);
  }, []);

  // En endring som feilet, fjernes fra listene (i en samlet endring bare det steget)
  const dropEntry = useCallback((id: string) => {
    setUndo((u) => withoutStep(u, id));
    setRedo((r) => withoutStep(r, id));
  }, []);

  const exec = useCallback(
    (
      rawCommand: Command,
      opts: { label: string; mode: "do" | "undo" | "redo"; keepText?: boolean },
    ):
      | { ok: true; entry: HistoryEntry; done: Promise<string | null> }
      | { ok: false; message: string } => {
      // G-4: all tekst lagres som NFC – normaliser kommandoen før lokal kjøring og lagring
      const command = nfcDeep(rawCommand);
      if (!enabled)
        return {
          ok: false,
          message: tk("app-project-use-commands.message.message.7d3a014eec1f"),
        };
      const before = qc.getQueryData<ProjectState>(projectStateKey(projectId));
      if (!before)
        return {
          ok: false,
          message: tk("app-project-use-commands.message.message.a0ff717da3c9"),
        };
      const commandId = newId<"command">();
      const local = applyCommand(before, {
        id: commandId,
        actor: actorId as never,
        at: new Date().toISOString(),
        command,
      });
      if (!local.ok) {
        const message =
          local.error.code === "revision_conflict" && opts.mode !== "do"
            ? conflictUndo()
            : local.error.message;
        setStatus({ kind: "error", message });
        return { ok: false, message };
      }
      // Forventede revisjoner: det brukeren så før endringen (nye entiteter har ingen)
      const baseRevisions = revisionsOf(before, local.affected);
      qc.setQueryData(projectStateKey(projectId), local.state);
      const entry: HistoryEntry = {
        id: commandId,
        label: opts.label,
        inverse: local.inverse,
        affected: local.affected,
        seenForeign: foreignSeq.current,
      };
      ownCommandIds.add(commandId);
      commandQueue.pending++;
      setStatus({ kind: "saving", pending: commandQueue.pending });
      const gen = generation.current;

      // Teksten brukeren skrev, går ikke tapt (KI-182). Angring/gjør om gjelder tidligere tekst og tas ikke
      // vare på; heller ikke tekst som ikke er skrevet nå (f.eks. fra en manusversjon, keepText: false).
      const keep = (conflict: boolean, skipped: boolean) => {
        if (opts.mode !== "do" || opts.keepText === false) return;
        const r = rejectedEdit(commandId, command, opts.label, conflict);
        if (r) setRejected((list) => addRejected(list, skipped ? { ...r, skipped } : r));
      };

      const fail = (message: string, conflict: boolean) => {
        keep(conflict, false);
        if (conflict && opts.mode === "do" && opts.keepText !== false)
          setConflicts((list) => addConflict(list, { id: commandId, label: opts.label, command, affected: local.affected }));
        setStatus({ kind: "error", message });
        dropEntry(commandId);
        generation.current++;
        reloadWhenIdle.current = true;
        return message;
      };

      const done = queue.current.then(async (): Promise<string | null> => {
        try {
          // Bygget oppå en endring som feilet: send ikke
          if (gen !== generation.current) {
            keep(false, true);
            dropEntry(commandId);
            reloadWhenIdle.current = true;
            return skipped();
          }
          const res = await runCommand({
            data: { projectId, command, baseRevisions: { ...baseRevisions }, commandId },
          });
          if (!res.ok) {
            // Avvist på grunn av tilgang: rollen kan være endret (KI-136) – hent medlemmene på nytt
            if (res.code === "forbidden")
              void qc.invalidateQueries({ queryKey: ["project-members", projectId] });
            return fail(
              res.code === "revision_conflict"
                ? opts.mode === "do"
                  ? tk("app-project-use-commands.done.fail.4e3270de049f")
                  : conflictUndo()
                : res.message,
              res.code === "revision_conflict",
            );
          }
          // Serverens invers er den som er lagret i change_log (og som serveren godtar ved angring)
          if (res.inverse) replaceInverse(commandId, res.inverse);
          return null;
        } catch (e) {
          return fail(
            tk("app-project-use-commands.done.fail.767f9794b133", { message: String((e as Error).message) }),
            false,
          );
        } finally {
          commandQueue.pending--;
          if (commandQueue.pending === 0) {
            if (reloadWhenIdle.current) {
              reloadWhenIdle.current = false;
              reloading.current = reload();
            }
            for (const f of [...commandQueue.onIdle]) {
              commandQueue.onIdle.delete(f);
              f();
            }
            setStatus((s) => (s.kind === "error" ? s : { kind: "idle" }));
          } else {
            setStatus((s) =>
              s.kind === "saving" ? { kind: "saving", pending: commandQueue.pending } : s,
            );
          }
        }
      });
      queue.current = done;
      return { ok: true, entry, done };
    },
    [enabled, qc, projectId, actorId, reload, dropEntry, replaceInverse],
  );

  /**
   * Utfør en ny endring. Returnerer feilmelding ved avvisning (for visning nær kontrollen).
   * `group`: endringer med samme nøkkel rett etter hverandre angres som ett steg.
   */
  /**
   * Endring i en avledet produksjon av en scene som deles med hovedfilmen: lag først en egen scenevariant
   * for produksjonen (DEC-0057, REQ-0365), så hovedfilmen ikke endres. Begge steg angres samlet.
   */
  const withOwnVariant = useCallback(
    (command: Command, group: string | undefined) => {
      const pid = (command as { productionId?: unknown }).productionId;
      if (typeof pid !== "string") return null;
      const before = qc.getQueryData<ProjectState>(projectStateKey(projectId));
      if (!before || before.productions[pid]?.kind === "main") return null;
      const plan = forkPlan(before, command);
      if (!plan) return null;
      const g = group ?? newId();
      for (const c of plan.fork) {
        const f = exec(c, {
          label: tk("app-project-use-commands.label.label.c88f7efd1c3c"),
          mode: "do",
        });
        if (!f.ok) return { error: f.message as string | null, done: null, group: g };
        setUndo((u) => pushEntry(u, f.entry, g));
      }
      setRedo([]);
      return { error: null, command: plan.command, group: g };
    },
    [exec, qc, projectId],
  );

  /**
   * Utfør en ny endring og få både svaret fra den lokale kjøringen (feilmelding eller null, med en gang) og
   * `done`, som avgjøres når serveren har lagret den (feilmelding eller null; avvist eller ikke sendt fordi en
   * tidligere endring feilet). Brukes for kjeder av endringer som må vite om alt ble lagret.
   * `keepText: false`: teksten tas ikke vare på i «Teksten din ble ikke lagret» (den er ikke skrevet nå).
   */
  const runQueued = useCallback(
    (
      command: Command,
      label: string,
      group?: string,
      options?: { keepText?: boolean },
    ): { error: string | null; done: Promise<string | null>; commandId: string | null } => {
      const own = withOwnVariant(command, group);
      if (own?.error)
        return { error: own.error, done: Promise.resolve(own.error), commandId: null };
      if (own && "command" in own && own.command) {
        command = own.command;
        group = own.group;
      }
      const r = exec(command, {
        label,
        mode: "do",
        ...(options?.keepText === false ? { keepText: false } : {}),
      });
      if (!r.ok) return { error: r.message, done: Promise.resolve(r.message), commandId: null };
      setUndo((u) => pushEntry(u, r.entry, group));
      setRedo([]);
      return { error: null, done: r.done, commandId: r.entry.id };
    },
    [exec, withOwnVariant],
  );

  const run = useCallback(
    (command: Command, label: string, group?: string): string | null =>
      runQueued(command, label, group).error,
    [runQueued],
  );

  /**
   * Som run, men utenfor angrelisten: for innstillinger som ikke er arbeid i filmen (f.eks. eksport-
   * innstillingene, DEC-0072), så Ctrl+Z ikke angrer dem i stedet for det siste arbeidet.
   */
  const runSilent = useCallback(
    (command: Command, label: string): string | null => {
      const r = exec(command, { label, mode: "do" });
      return r.ok ? null : r.message;
    },
    [exec],
  );

  /** Som run, men venter til serveren har lagret endringen. */
  const runAndWait = useCallback(
    async (
      command: Command,
      label: string,
      group?: string,
    ): Promise<{ error: string | null; commandId: string | null }> => {
      const r = runQueued(command, label, group);
      if (r.error) return { error: r.error, commandId: null };
      const error = await r.done;
      return { error, commandId: error ? null : r.commandId };
    },
    [runQueued],
  );

  /**
   * Venter til alt i køen er lagret, og – hvis noe feilet – til siste versjon er hentet. Etterpå er den lokale
   * tilstanden (`current()`) den samme som serverens, med mindre brukeren har gjort nye endringer imens.
   */
  const whenIdle = useCallback(async (): Promise<void> => {
    if (commandQueue.pending > 0)
      await new Promise<void>((resolve) => commandQueue.onIdle.add(resolve));
    await reloading.current;
  }, []);

  const blocked = (e: HistoryEntry) => blockedByOthers(e, touchedByOthers.current);

  const replay = useCallback(
    (entry: HistoryEntry, mode: "undo" | "redo") => {
      const pending: { step: HistoryEntry; done: Promise<string | null> }[] = [];
      const result = replayEntry(entry, (c, step) => {
        const r = exec(c, { label: entry.label, mode });
        if (!r.ok) return null;
        pending.push({ step, done: r.done });
        return r.entry;
      });
      // Avviser serveren et av stegene i en samlet endring, blir resten stående (sammen med det som ikke
      // ble lagret), så det fortsatt kan angres eller gjøres om
      if (entry.steps && pending.length > 0)
        void Promise.all(pending.map((p) => p.done)).then((errors) => {
          const failed = pending.filter((_, i) => errors[i] !== null).map((p) => p.step);
          if (failed.length === 0) return;
          const steps = [...failed].reverse();
          const back: HistoryEntry = {
            ...entry,
            steps,
            affected: [...new Set(steps.flatMap((x) => x.affected))],
          };
          if (mode === "undo") setUndo((u) => [...u, back]);
          else setRedo((r) => [...r, back]);
        });
      return { ...result, done: Promise.all(pending.map((p) => p.done)).then((errors) => errors.every((e) => e === null)) };
    },
    [exec],
  );

  const undo = useCallback(() => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndo((u) => u.slice(0, -1));
    if (blocked(last)) {
      setStatus({ kind: "error", message: conflictUndo() });
      return;
    }
    const replayed = replay(last, "undo");
    const { rest, done } = replayed;
    // R3: gruppen følger med, så en ekstern effekt (registerHistoryEffect) også kjører ved «gjør om»
    const back = replayed.back && last.group && !replayed.back.group ? { ...replayed.back, group: last.group } : replayed.back;
    if (back) setRedo((x) => [...x, back]);
    if (rest && back) setUndo((u) => [...u, rest]);
    if (back && !rest) void done.then((ok) => { if (ok) onUndo?.(last.group); });
    const fx = back && !rest && last.group ? historyEffects.get(last.group) : undefined;
    if (fx) void done.then(async (ok) => { if (!ok) return; const err = await fx.undo(); if (err) setStatus({ kind: "error", message: err }); });
  }, [undoStack, replay, onUndo]);

  const redo = useCallback(() => {
    const last = redoStack[redoStack.length - 1];
    if (!last) return;
    setRedo((x) => x.slice(0, -1));
    if (blocked(last)) {
      setStatus({
        kind: "error",
        message: tk("app-project-use-commands.message.message.e1ff01811ae3"),
      });
      return;
    }
    const replayed = replay(last, "redo");
    const { rest, done } = replayed;
    const back = replayed.back && last.group && !replayed.back.group ? { ...replayed.back, group: last.group } : replayed.back;
    if (back) setUndo((u) => [...u, back]);
    if (rest && back) setRedo((x) => [...x, rest]);
    const fx = back && !rest && last.group ? historyEffects.get(last.group) : undefined;
    if (fx) void done.then(async (ok) => { if (!ok) return; const err = await fx.redo(); if (err) setStatus({ kind: "error", message: err }); });
  }, [redoStack, replay]);

  // Tastatur: Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z og Ctrl+Y. I tekstfelt gjelder feltets egen angre.
  useEffect(() => {
    if (!keyboard) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, keyboard]);

  const clearError = useCallback(
    () => setStatus((s) => (s.kind === "error" ? { kind: "idle" } : s)),
    [],
  );

  /** Lukker varselet for én avvist tekst (uten id: alle). */
  const dismissRejected = useCallback(
    (id?: string) =>
      setRejected((list) => (id === undefined ? [] : list.filter((x) => x.id !== id))),
    [],
  );

  /**
   * Teksten som står i linjen nå (den andres versjon etter at siste versjon er hentet), eller null når den
   * avviste endringen ikke er en manuslinje eller linjen ikke finnes lenger.
   */
  const currentTextOf = useCallback(
    (r: RejectedEdit): string | null => {
      if (r.command.type !== "EditBlockText") return null;
      const now = qc.getQueryData<ProjectState>(projectStateKey(projectId));
      return now?.blocks[r.command.blockId]?.text ?? null;
    },
    [qc, projectId],
  );

  /**
   * «Prøv igjen med min tekst» (KI-182): henter siste versjon og legger den avviste teksten oppå den som en
   * ny endring (med revisjonene i den nye versjonen, så den andres endring ikke overskrives i stillhet – den
   * kan fortsatt angres med Angre, siden endringen bygger på den andres versjon). Gir feilmelding eller null.
   */
  const retryRejected = useCallback(
    async (id?: string): Promise<string | null> => {
      const r =
        id === undefined ? rejected[rejected.length - 1] : rejected.find((x) => x.id === id);
      if (!r || r.command.type !== "EditBlockText") return null;
      const blockId = r.command.blockId;
      // Vent til køen er tom og på siste versjon fra serveren før endringen bygges
      await whenIdle();
      await reload();
      const now = qc.getQueryData<ProjectState>(projectStateKey(projectId));
      const block = now?.blocks[blockId];
      if (!block) {
        const message = tk("app-project-use-commands.message.use-callback.f1243bbe5a7d");
        setStatus({ kind: "error", message });
        return message;
      }
      setRejected((list) => list.filter((x) => x.id !== r.id));
      setStatus((s) => (s.kind === "error" ? { kind: "idle" } : s));
      // Den nye endringen bygger på den andres versjon (som brukeren nå har sett): den får telleren for andres
      // endringer nå (seenForeign), så den andres tidligere endring av linjen ikke stopper angringen av den.
      // Eldre egne endringer av linjen er fortsatt stoppet (angring av dem ville overskrevet den andres tekst).
      // Den andre skrev det samme: ingenting å gjøre
      if (block.text === r.text) return null;
      const error = run({ ...r.command, text: r.text }, r.label);
      if (error) setRejected((list) => addRejected(list, r));
      return error;
    },
    [rejected, reload, whenIdle, qc, projectId, run],
  );

  /**
   * K-1: brukerens valg etter en revisjonskonflikt. «rebase» henter siste versjon og legger samme endring oppå
   * den som en ny endring (med de nye revisjonene, så den kan angres); «discard» forkaster den (siste versjon
   * er allerede hentet). Gir feilmelding eller null.
   */
  const resolveConflict = useCallback(
    async (id: string, choice: "rebase" | "discard"): Promise<string | null> => {
      const c = conflicts.find((x) => x.id === id);
      if (!c) return null;
      setConflicts((list) => list.filter((x) => x.id !== id));
      setRejected((list) => list.filter((x) => x.id !== id));
      setStatus((s) => (s.kind === "error" ? { kind: "idle" } : s));
      if (choice === "discard") return null;
      await whenIdle();
      await reload();
      const error = run(c.command, c.label);
      if (error) setConflicts((list) => addConflict(list, c));
      return error;
    },
    [conflicts, whenIdle, reload, run],
  );

  return {
    run,
    runSilent,
    runAndWait,
    runQueued,
    whenIdle,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoLabel: undoStack[undoStack.length - 1]?.label ?? null,
    undoGroup: undoStack[undoStack.length - 1]?.group ?? null,
    redoLabel: redoStack[redoStack.length - 1]?.label ?? null,
    status,
    clearError,
    /** Avviste tekstendringer (KI-182), eldste først. */
    rejected,
    dismissRejected,
    currentTextOf,
    retryRejected,
    /** K-1: endringer avvist ved revisjonskonflikt, eldste først. */
    conflicts,
    resolveConflict,
    /** Tilstanden slik den er nå (med egne endringer som ikke er lagret ennå), for kjeder av kommandoer. */
    current: () => qc.getQueryData<ProjectState>(projectStateKey(projectId)) ?? null,
  };
}

export type Commands = ReturnType<typeof useCommands>;
