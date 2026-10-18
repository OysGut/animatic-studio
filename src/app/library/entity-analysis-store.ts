/**
 * Delt tilstand for den automatiske gjenkjenningen (OG2): status, lagret analyse og forespørsler til
 * watcheren. Ingen serverkall her – watcheren i prosjektskallet (use-entity-analysis.ts) gjør kallene, så
 * forslagsdialogen og Story Lab bare leser og ber om analyse.
 */
import { useSyncExternalStore } from "react";
import type { StoredSceneAnalysis } from "@/core/library/analysis-hash";

export type AnalysisStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "running" }
  | { readonly kind: "done"; readonly newSuggestions: number }
  | { readonly kind: "error"; readonly message: string };

const IDLE: AnalysisStatus = { kind: "idle" };
const EMPTY: readonly StoredSceneAnalysis[] = [];
const statusBy = new Map<string, AnalysisStatus>();
const rowsBy = new Map<string, readonly StoredSceneAnalysis[]>();
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function setAnalysisStatus(projectId: string, s: AnalysisStatus): void {
  statusBy.set(projectId, s);
  emit();
}
export function setAnalysisRows(projectId: string, rows: readonly StoredSceneAnalysis[]): void {
  rowsBy.set(projectId, rows);
  emit();
}
export function useAnalysisStatus(projectId: string): AnalysisStatus {
  return useSyncExternalStore(subscribe, () => statusBy.get(projectId) ?? IDLE, () => IDLE);
}
export function useAnalysisRows(projectId: string): readonly StoredSceneAnalysis[] {
  return useSyncExternalStore(subscribe, () => rowsBy.get(projectId) ?? EMPTY, () => EMPTY);
}

export const NOW_EVENT = "animatic:analyze-now";
export const REANALYZE_EVENT = "animatic:reanalyze";

/** Be om analyse straks (etter overføringer som lager manustekst). */
export function requestAnalysisNow(projectId: string): void {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(NOW_EVENT, { detail: { projectId } }));
}

/** «Analyser på nytt»: hele manuset. Svarer med feilmelding eller null. */
export interface ReanalyzeDetail {
  readonly projectId: string;
  accepted: boolean;
  readonly resolve: (message: string | null) => void;
}

export function requestReanalyze(projectId: string): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const detail: ReanalyzeDetail = { projectId, accepted: false, resolve };
    window.dispatchEvent(new CustomEvent(REANALYZE_EVENT, { detail }));
    // Ingen watcher (for eksempel en leser): ingenting å gjøre
    if (!detail.accepted) resolve(null);
  });
}
