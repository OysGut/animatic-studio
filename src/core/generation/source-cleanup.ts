/** KI-207: bare gamle midlertidige MP4-kilder, aldri ferdige filmer eller aktive referanser. */
export const AI_SOURCE_RETENTION_MS = 30 * 86_400_000;
export function removableAiSource(projectId: string, path: string, createdAt: string | null, protectedPaths: ReadonlySet<string>, now: number): boolean {
  if (!createdAt || !Number.isFinite(Date.parse(createdAt))) return false;
  return (path.startsWith(`${projectId}/temp/ai-source/`) || path.startsWith(`${projectId}/ai-source/`))
    && !path.includes("..") && path.toLowerCase().endsWith(".mp4")
    && now - Date.parse(createdAt) >= AI_SOURCE_RETENTION_MS && !protectedPaths.has(path);
}