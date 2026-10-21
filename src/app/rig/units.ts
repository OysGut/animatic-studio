/**
 * Lengdeenheter i riggvisningen (B-090 pkt 1): all geometri regnes i millimeter i kjernen; tommer er
 * bare visning. Valget huskes per bruker (useUiPref) med mm som standard.
 */
import { useUiPref } from "@/app/account/ui-prefs";

export type RigUnit = "mm" | "in";

export const MM_PER_INCH = 25.4;

export function useRigUnits(): [RigUnit, (next: RigUnit) => void] {
  return useUiPref<RigUnit>("rig.units", "mm", (v): v is RigUnit => v === "mm" || v === "in");
}

/** Én desimal i mm, to i tommer – nok til platejustering uten støy. */
export function formatLength(mm: number, unit: RigUnit): string {
  if (unit === "in") return `${(mm / MM_PER_INCH).toFixed(2)}″`;
  return `${Math.round(mm * 10) / 10} mm`;
}

/** Fra brukerens enhet tilbake til mm for lagring (null ved ugyldig tall). */
export function parseLength(text: string, unit: RigUnit): number | null {
  const n = Number(text.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return unit === "in" ? n * MM_PER_INCH : n;
}
