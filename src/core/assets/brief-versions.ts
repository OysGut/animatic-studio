/**
 * Tekstversjoner av brukerens bildebeskrivelse for en ressurs (Øystein 23.10, migrasjon 0089). Rene regler:
 * hvilken versjon som vises, når en redigering blir en ny versjon, og hvilke bilder som er laget fra en tekst.
 * Bare brukerens beskrivelse lagres, aldri hele serverprompten.
 */
import type { Asset, AssetVersion, BriefVersion } from "../model";

export const BRIEF_MAX_VERSIONS = 50;
export const BRIEF_MAX_CHARS = 8000;

const norm = (t: string) => t.replace(/\r\n?/g, "\n").trim();

/** Versjonen som vises når dialogen åpnes: sist brukte/redigerte (aktiv), ellers den nyeste. */
export function shownBriefVersion(asset: Pick<Asset, "briefVersions" | "activeBriefId">): BriefVersion | null {
  const list = asset.briefVersions ?? [];
  return list.find((v) => v.id === asset.activeBriefId) ?? list.at(-1) ?? null;
}

/**
 * Lagring av teksten i feltet. Lik den aktive: ingenting. Lik en eksisterende: den blir aktiv. Ellers en ny
 * versjon bakerst (en eldre versjon overskrives aldri). Eldste faller ut over grensen, men aldri den nye.
 */
export function planBriefSave(
  asset: Pick<Asset, "briefVersions" | "activeBriefId">,
  text: string,
  newId: string,
  at: string,
): { versions: readonly BriefVersion[]; activeId: string } | null {
  const t = norm(text);
  if (!t) return null;
  const list = asset.briefVersions ?? [];
  const active = shownBriefVersion(asset);
  if (active && active.text === t) return active.id === asset.activeBriefId ? null : { versions: list, activeId: active.id };
  const same = list.find((v) => v.text === t);
  if (same) return { versions: list, activeId: same.id };
  const next = [...list, { id: newId, text: t.slice(0, BRIEF_MAX_CHARS), createdAt: at }];
  return { versions: next.slice(Math.max(0, next.length - BRIEF_MAX_VERSIONS)), activeId: newId };
}

export function briefVersionsError(versions: unknown, activeId: unknown): string | null {
  if (!Array.isArray(versions) || versions.length > BRIEF_MAX_VERSIONS) return "versions";
  const ids = new Set<string>();
  for (const v of versions) {
    if (!v || typeof v !== "object") return "version";
    const { id, text, createdAt } = v as Record<string, unknown>;
    if (typeof id !== "string" || !id || id.length > 64 || ids.has(id)) return "id";
    if (typeof text !== "string" || !text.trim() || text.length > BRIEF_MAX_CHARS) return "text";
    if (typeof createdAt !== "string" || createdAt.length > 40) return "createdAt";
    ids.add(id);
  }
  if (activeId !== null && (typeof activeId !== "string" || !ids.has(activeId))) return "active";
  return null;
}

/**
 * Fremheving i bildevisningen: «match» for bilder laget fra den aktive teksten, «dim» for de andre, og
 * «none» for alle når ingen bilder er laget fra teksten (da vises ingenting spesielt). Eldre bilder uten
 * referanse blir aldri «match».
 */
export function briefHighlight(
  versions: readonly Pick<AssetVersion, "id" | "briefVersionId">[],
  activeBriefId: string | null,
): Record<string, "match" | "dim" | "none"> {
  const out: Record<string, "match" | "dim" | "none"> = {};
  const any = activeBriefId !== null && versions.some((v) => v.briefVersionId === activeBriefId);
  for (const v of versions) out[v.id] = !any ? "none" : v.briefVersionId === activeBriefId ? "match" : "dim";
  return out;
}
