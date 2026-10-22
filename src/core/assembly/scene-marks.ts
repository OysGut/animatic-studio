/**
 * B-118 (Øystein 22.10): arbeidsstatus og farge per sceneforekomst. Begge hører til produksjonen, ikke
 * til scenen, og lagres som nøkler (aldri hex). Rekkefølgen her er rekkefølgen i menyene.
 */
export const WORK_STATUSES = ["setup", "animating", "review", "retake", "approved", "post", "done"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const SCENE_COLORS = ["red", "orange", "yellow", "green", "teal", "blue", "indigo", "purple", "pink", "gray"] as const;
export type SceneColor = (typeof SCENE_COLORS)[number];

export function isWorkStatus(v: unknown): v is WorkStatus {
  return typeof v === "string" && (WORK_STATUSES as readonly string[]).includes(v);
}

export function isSceneColor(v: unknown): v is SceneColor {
  return typeof v === "string" && (SCENE_COLORS as readonly string[]).includes(v);
}

/** Filterverdi: en nøkkel, eller «none» for scener uten status/farge. */
export const MARK_FILTER_NONE = "none";

export function markMatches(value: string | undefined, filter: string | undefined): boolean {
  if (!filter) return true;
  if (filter === MARK_FILTER_NONE) return value === undefined;
  return value === filter;
}
