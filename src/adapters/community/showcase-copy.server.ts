/** B-116: kompensasjon ved kopierings-/innsettingsfeil; bare RPC-reserverte mål brukes. */
import type { AnyClient } from "@/adapters/storage/project-rows";

export async function completeShowcaseCopy(
  admin: AnyClient, actor: string, projectId: string,
  reservation: { id: string; sourceKey: string | null; storageKey: string | null },
): Promise<void> {
  const { id, sourceKey, storageKey } = reservation;
  const validTarget = storageKey !== null && storageKey.startsWith(`${projectId}/shares/${id}/`)
    && !storageKey.includes("..") && storageKey.length <= 500;
  const storage = admin.storage.from("assets");
  let finalizationStarted = false;
  try {
    if (sourceKey !== null || storageKey !== null) {
      if (!sourceKey?.startsWith(`${projectId}/`) || sourceKey.includes("..") || !validTarget || !storageKey)
        throw new Error("showcase.error.media");
      const copied = await storage.copy(sourceKey, storageKey);
      if (copied.error) throw new Error("showcase.error.media");
    }
    finalizationStarted = true;
    const result = await admin.rpc("create_showcase_item", { p_reservation: id, p_actor: actor });
    if (result.error || result.data !== id) throw new Error("showcase.error.media");
  } catch (error) {
    if (finalizationStarted) {
      // Tapt svar kan bety at raden allerede er lagret. Ikke slett brukt media.
      const outcome = await admin.rpc("showcase_item_outcome", { p_item: id, p_actor: actor });
      if (outcome.error || typeof outcome.data !== "boolean") throw error;
      if (outcome.data) return;
    }
    // Forsøk begge oppryddinger selv om én feiler; behold reservasjonen når filsletting feiler.
    let removed = true;
    if (validTarget && storageKey) {
      try { removed = !(await storage.remove([storageKey])).error; } catch { removed = false; }
    }
    if (removed) {
      const cancelled = await admin.rpc("cancel_showcase_item", { p_reservation: id, p_actor: actor });
      if (cancelled.error) throw new Error("showcase.error.media");
    }
    throw error;
  }
}