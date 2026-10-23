/**
 * Utkast av en bevegelsesbane under redigering (ease-glidebrytere, tempokurven, spacing-draget).
 * Lite lager (som bildelageret i N8): inspektøren, scenen og avstandssporet på tidslinjen leser det samme
 * utkastet, så alle oppdateres for hvert dra-steg uten at hele arbeidsflaten tegnes på nytt.
 * Utkastet skrives aldri; først slipp kjører én kommando.
 */
import { useSyncExternalStore } from "react";
import type { MotionPath } from "@/core";

export interface MotionDraft { readonly layerId: string; readonly path: MotionPath | null }

let current: MotionDraft | null = null;
const subs = new Set<() => void>();

export const motionDraftStore = {
  get: (): MotionDraft | null => current,
  set(d: MotionDraft | null) {
    if (d === current) return;
    current = d;
    for (const s of [...subs]) s();
  },
  /** Fjerner utkastet bare når det gjelder dette laget. */
  clear(layerId: string) { if (current?.layerId === layerId) motionDraftStore.set(null); },
  subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; },
};

/** Banen som skal vises for laget: utkastet når det finnes, ellers den lagrede. */
export function useShownPath(layerId: string | null, saved: MotionPath | null): MotionPath | null {
  const d = useSyncExternalStore(motionDraftStore.subscribe, motionDraftStore.get, () => null);
  return layerId && d && d.layerId === layerId ? d.path : saved;
}
