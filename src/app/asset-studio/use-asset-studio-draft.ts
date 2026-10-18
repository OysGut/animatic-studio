/**
 * Utkastet for scenen i Asset Studio (AS1, B5): alle endringer av scenen (laget, lydklippene, 2D-scenen) samles
 * lokalt og vises med applyCommand på en kopi. Ingenting sendes før «Oppdater scenen og lukk».
 *
 * Skille (B4): biblioteket og notatene skrives direkte med `cmds` og overlever «Avbryt»; scenen går bare hit.
 * Når den lagrede tilstanden endres (egne bibliotekslagringer eller andres endringer), legges utkastet oppå den
 * nye tilstanden, så lenge ingen av objektene utkastet endrer er endret av andre. Ellers beholdes utkastet, og
 * konflikten vises ved lagring (F3) – aldri stille overskriving.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createDraft,
  draftConflicts,
  isDraftEmpty,
  pushDraft,
  rebaseDraft,
  redoDraft,
  undoDraft,
  type Command,
  type ProjectState,
  type SceneDraft,
} from "@/core";

export interface AssetStudioDraft {
  readonly draft: SceneDraft;
  /** Tilstanden studioet viser (den lagrede tilstanden med utkastet). */
  readonly view: ProjectState;
  readonly empty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Objektene utkastet endrer som andre har endret siden utkastet ble laget. */
  readonly conflicts: readonly string[];
  push: (cmd: Command) => string | null;
  undo: () => void;
  redo: () => void;
  replace: (d: SceneDraft) => void;
}

export function useAssetStudioDraft(
  live: ProjectState,
  occurrenceId: string,
  compositionId: string,
): AssetStudioDraft {
  const [draft, setDraft] = useState<SceneDraft>(() =>
    createDraft(live, occurrenceId, compositionId),
  );

  // Legg utkastet oppå den nye lagrede tilstanden når det kan gjøres uten konflikt
  useEffect(() => {
    setDraft((d) => {
      if (d.base === live) return d;
      if (draftConflicts(d, live).length) return d;
      const r = rebaseDraft(d, live);
      return r.ok ? r.draft : d;
    });
  }, [live]);

  const conflicts = useMemo(() => draftConflicts(draft, live), [draft, live]);

  const push = useCallback(
    (cmd: Command): string | null => {
      const r = pushDraft(draft, cmd);
      if (!r.ok) return r.message;
      setDraft(r.draft);
      return null;
    },
    [draft],
  );

  return {
    draft,
    view: draft.state,
    empty: isDraftEmpty(draft),
    canUndo: draft.steps.length > 0,
    canRedo: draft.redo.length > 0,
    conflicts,
    push,
    undo: () => setDraft((d) => undoDraft(d)),
    redo: () => setDraft((d) => redoDraft(d)),
    replace: setDraft,
  };
}
