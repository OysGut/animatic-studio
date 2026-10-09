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
import { applyCommand, newId, revisionsOf, type Command, type ProjectState } from "@/core";
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
}

export type SaveStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "saving"; readonly pending: number }
  | { readonly kind: "error"; readonly message: string };

const CONFLICT_UNDO =
  "Kan ikke angre: noen andre har endret det samme etterpå. Endringen deres er beholdt.";
const SKIPPED = "Ikke lagret fordi en tidligere endring feilet. Siste versjon er hentet.";

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
    const swap = (list: HistoryEntry[]) => list.map((e) => (e.id === id ? { ...e, inverse } : e));
    setUndo(swap);
    setRedo(swap);
  }, []);

  const dropEntry = useCallback((id: string) => {
    setUndo((u) => u.filter((e) => e.id !== id));
    setRedo((r) => r.filter((e) => e.id !== id));
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

  /** Utfør en ny endring. Returnerer feilmelding ved avvisning (for visning nær kontrollen). */
  const run = useCallback(
    (command: Command, label: string): string | null => {
      const r = exec(command, { label, mode: "do" });
      if (!r.ok) return r.message;
      setUndo((u) => [...u.slice(-199), r.entry]);
      setRedo([]);
      return null;
    },
    [exec],
  );

  /** Som run, men venter til serveren har lagret endringen. */
  const runAndWait = useCallback(
    async (
      command: Command,
      label: string,
    ): Promise<{ error: string | null; commandId: string | null }> => {
      const r = exec(command, { label, mode: "do" });
      if (!r.ok) return { error: r.message, commandId: null };
      setUndo((u) => [...u.slice(-199), r.entry]);
      setRedo([]);
      const error = await r.done;
      return { error, commandId: error ? null : r.entry.id };
    },
    [exec],
  );

  const blocked = (e: HistoryEntry) => e.affected.some((id) => touchedByOthers.current.has(id));

  const undo = useCallback(() => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndo((u) => u.slice(0, -1));
    if (blocked(last)) {
      setStatus({ kind: "error", message: CONFLICT_UNDO });
      return;
    }
    const r = exec(last.inverse, { label: last.label, mode: "undo" });
    if (r.ok) setRedo((x) => [...x, { ...r.entry, label: last.label }]);
  }, [undoStack, exec]);

  const redo = useCallback(() => {
    const last = redoStack[redoStack.length - 1];
    if (!last) return;
    setRedo((x) => x.slice(0, -1));
    if (blocked(last)) {
      setStatus({ kind: "error", message: CONFLICT_UNDO.replace("angre", "gjøre om") });
      return;
    }
    const r = exec(last.inverse, { label: last.label, mode: "redo" });
    if (r.ok) setUndo((u) => [...u, { ...r.entry, label: last.label }]);
  }, [redoStack, exec]);

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
  };
}

export type Commands = ReturnType<typeof useCommands>;
