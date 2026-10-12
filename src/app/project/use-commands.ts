/**
 * Kjør kommandoer fra grensesnittet (ADR-0005, DEC-0022, DEC-0025).
 * 1. Kommandoen kjøres lokalt i domenekjernen (umiddelbar respons, samme regler som serveren).
 * 2. Den sendes til serverfunksjonen runCommand, én om gangen og i rekkefølge, med revisjonene brukeren så,
 *    slik at ingen andres endringer overskrives i stillhet (INV-C1, REQ-0520–0522).
 * 3. Angre/gjør om er per bruker. En angring sendes med revisjonene i brukerens nåværende visning (serveren
 *    avviser hvis noen har endret noe brukeren ikke har sett), og angring av noe en annen bruker har endret
 *    etterpå, stoppes med forklaring (sanntidsvarsel fra change_log).
 * 4. Feiler en lagring, sendes ikke kommandoer som var bygget oppå den; siste versjon hentes når køen er tom.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyCommand,
  forkPlan,
  newId,
  revisionsOf,
  type Command,
  type ProjectState,
} from "@/core";
import { runCommand } from "@/adapters/storage/commands.functions";
import {
  commandQueue,
  foreignChangeListeners,
  ownCommandIds,
  projectStateKey,
} from "./use-project";

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

const CONFLICT_UNDO =
  "Kan ikke angre: noen andre har endret det samme etterpå. Endringen deres er beholdt.";
const SKIPPED = "Ikke lagret fordi en tidligere endring feilet. Siste versjon er hentet.";

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

export function useCommands(projectId: string, actorId: string, enabled: boolean) {
  const qc = useQueryClient();
  const [undoStack, setUndo] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedo] = useState<HistoryEntry[]>([]);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const generation = useRef(0);
  const reloadWhenIdle = useRef(false);
  /** Entiteter andre har endret i denne økten. */
  const touchedByOthers = useRef(new Set<string>());

  useEffect(() => {
    const onForeign = (ids: readonly string[]) => {
      for (const id of ids) touchedByOthers.current.add(id);
    };
    foreignChangeListeners.add(onForeign);
    return () => {
      foreignChangeListeners.delete(onForeign);
    };
  }, []);

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
      command: Command,
      opts: { label: string; mode: "do" | "undo" | "redo" },
    ):
      | { ok: true; entry: HistoryEntry; done: Promise<string | null> }
      | { ok: false; message: string } => {
      if (!enabled) return { ok: false, message: "Du har bare lesetilgang i dette prosjektet." };
      const before = qc.getQueryData<ProjectState>(projectStateKey(projectId));
      if (!before) return { ok: false, message: "Prosjektet er ikke lastet ennå." };
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
            ? CONFLICT_UNDO
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
      };
      ownCommandIds.add(commandId);
      commandQueue.pending++;
      setStatus({ kind: "saving", pending: commandQueue.pending });
      const gen = generation.current;

      const fail = (message: string) => {
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
            dropEntry(commandId);
            reloadWhenIdle.current = true;
            return SKIPPED;
          }
          const res = await runCommand({
            data: { projectId, command, baseRevisions: { ...baseRevisions }, commandId },
          });
          if (!res.ok) {
            return fail(
              res.code === "revision_conflict"
                ? opts.mode === "do"
                  ? "Noen andre endret dette samtidig. Siste versjon er hentet – prøv igjen."
                  : CONFLICT_UNDO
                : res.message,
            );
          }
          // Serverens invers er den som er lagret i change_log (og som serveren godtar ved angring)
          if (res.inverse) replaceInverse(commandId, res.inverse);
          return null;
        } catch (e) {
          return fail(
            `Endringen ble ikke lagret (${(e as Error).message}). Siste versjon er hentet.`,
          );
        } finally {
          commandQueue.pending--;
          if (commandQueue.pending === 0) {
            if (reloadWhenIdle.current) {
              reloadWhenIdle.current = false;
              void reload();
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
        const f = exec(c, { label: "Egen versjon av scenen", mode: "do" });
        if (!f.ok) return { error: f.message as string | null, done: null, group: g };
        setUndo((u) => pushEntry(u, f.entry, g));
      }
      setRedo([]);
      return { error: null, command: plan.command, group: g };
    },
    [exec, qc, projectId],
  );

  const run = useCallback(
    (command: Command, label: string, group?: string): string | null => {
      const own = withOwnVariant(command, group);
      if (own?.error) return own.error;
      if (own && "command" in own && own.command) {
        command = own.command;
        group = own.group;
      }
      const r = exec(command, { label, mode: "do" });
      if (!r.ok) return r.message;
      setUndo((u) => pushEntry(u, r.entry, group));
      setRedo([]);
      return null;
    },
    [exec, withOwnVariant],
  );

  /** Som run, men venter til serveren har lagret endringen. */
  const runAndWait = useCallback(
    async (
      command: Command,
      label: string,
      group?: string,
    ): Promise<{ error: string | null; commandId: string | null }> => {
      const own = withOwnVariant(command, group);
      if (own?.error) return { error: own.error, commandId: null };
      if (own && "command" in own && own.command) {
        command = own.command;
        group = own.group;
      }
      const r = exec(command, { label, mode: "do" });
      if (!r.ok) return { error: r.message, commandId: null };
      setUndo((u) => pushEntry(u, r.entry, group));
      setRedo([]);
      const error = await r.done;
      return { error, commandId: error ? null : r.entry.id };
    },
    [exec, withOwnVariant],
  );

  const blocked = (e: HistoryEntry) => e.affected.some((id) => touchedByOthers.current.has(id));

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
      return result;
    },
    [exec],
  );

  const undo = useCallback(() => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndo((u) => u.slice(0, -1));
    if (blocked(last)) {
      setStatus({ kind: "error", message: CONFLICT_UNDO });
      return;
    }
    const { back, rest } = replay(last, "undo");
    if (back) setRedo((x) => [...x, back]);
    if (rest && back) setUndo((u) => [...u, rest]);
  }, [undoStack, replay]);

  const redo = useCallback(() => {
    const last = redoStack[redoStack.length - 1];
    if (!last) return;
    setRedo((x) => x.slice(0, -1));
    if (blocked(last)) {
      setStatus({ kind: "error", message: CONFLICT_UNDO.replace("angre", "gjøre om") });
      return;
    }
    const { back, rest } = replay(last, "redo");
    if (back) setUndo((u) => [...u, back]);
    if (rest && back) setRedo((x) => [...x, rest]);
  }, [redoStack, replay]);

  // Tastatur: Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z og Ctrl+Y. I tekstfelt gjelder feltets egen angre.
  useEffect(() => {
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
  }, [undo, redo]);

  const clearError = useCallback(
    () => setStatus((s) => (s.kind === "error" ? { kind: "idle" } : s)),
    [],
  );

  return {
    run,
    runAndWait,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoLabel: undoStack[undoStack.length - 1]?.label ?? null,
    redoLabel: redoStack[redoStack.length - 1]?.label ?? null,
    status,
    clearError,
    /** Tilstanden slik den er nå (med egne endringer som ikke er lagret ennå), for kjeder av kommandoer. */
    current: () => qc.getQueryData<ProjectState>(projectStateKey(projectId)) ?? null,
  };
}

export type Commands = ReturnType<typeof useCommands>;
