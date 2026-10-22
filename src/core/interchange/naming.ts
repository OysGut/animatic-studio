import type { ExportRecord } from "../export-records";

/** A suffix is display data, never identity. Unnumbered scenes get a deterministic export ordinal. */
export function sceneCode(number: string | null, ordinal: number): string {
  const match = /^(\d+)([A-Za-z]*)$/.exec(number ?? "");
  return match ? `SC${String(Number(match[1])).padStart(3, "0")}${(match[2] ?? "").toUpperCase()}`
    : `SC${String(ordinal).padStart(3, "0")}`;
}
export function shotName(code: string, scene: string, shot: number, version: number): string {
  return `${code}_${scene}_SH${String(shot).padStart(3, "0")}_v${String(version).padStart(3, "0")}`;
}
/** Shared across languages and formats: a shot is its permanent occurrence ID. */
export function nextShotVersion(records: readonly ExportRecord[], occurrenceId: string): number {
  let version = 0;
  for (const r of records) {
    if (!r.occurrenceIds.includes(occurrenceId) || r.settings["interchange"] !== true) continue;
    const n = r.settings["shotVersion"];
    if (typeof n === "number" && Number.isInteger(n)) version = Math.max(version, n);
  }
  return version + 1;
}