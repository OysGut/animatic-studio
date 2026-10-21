/**
 * DV8: hvor brukeren står akkurat nå (scene, avspillingshode og fane), slik at «Sett bokmerke» i toppmenyen
 * kan lagre det. Bare i minnet for denne fanen; selve bokmerket lagres personlig i databasen.
 */
export interface SceneBookmarkContext { readonly projectId: string; readonly occurrenceId: string | null; readonly frame: number; readonly tab: string }
let current: SceneBookmarkContext | null = null;
export function publishSceneBookmark(next: SceneBookmarkContext) { current = next; }
export function clearSceneBookmark(projectId: string) { if (current?.projectId === projectId) current = null; }
export function sceneBookmarkContext(projectId: string): SceneBookmarkContext | null { return current?.projectId === projectId ? current : null; }
