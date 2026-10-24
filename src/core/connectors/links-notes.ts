/**
 * C-0 rester: API for connector_links (ekstern ID ↔ prosjekt-ID) og notater (scope notes:write).
 * Delt validering og billige takhøyder per prosjekt; serveren håndhever dem på nytt for hver forespørsel.
 */
export const LINK_ENTITIES = ["asset", "panel", "clip"] as const;
export type LinkEntity = (typeof LINK_ENTITIES)[number];
export const LINK_MAX_EXTERNAL_ID = 500;
export const LINKS_MAX_PER_PROJECT = 5000;
export const NOTE_MAX_CHARS = 2000;
export const NOTES_MAX_PER_PROJECT = 10000;
const ID_RE = /^[0-9a-zA-Z_-]{1,80}$/;

export type LinkCheck = { ok: true } | { ok: false; reason: "entity" | "external_id" | "entity_id" };
export function checkLink(l: { entity: string; entityId: string; externalId: string }): LinkCheck {
  if (!(LINK_ENTITIES as readonly string[]).includes(l.entity)) return { ok: false, reason: "entity" };
  if (typeof l.externalId !== "string" || l.externalId.length < 1 || l.externalId.length > LINK_MAX_EXTERNAL_ID) return { ok: false, reason: "external_id" };
  if (typeof l.entityId !== "string" || !ID_RE.test(l.entityId)) return { ok: false, reason: "entity_id" };
  return { ok: true };
}

export type NoteCheck = { ok: true } | { ok: false; reason: "text" | "target" };
export function checkNote(n: { targetKind: string; targetId: string; text: string }): NoteCheck {
  if (!["occurrence", "asset_version", "asset_variant", "audio_clip", "dialogue_version"].includes(n.targetKind)) return { ok: false, reason: "target" };
  if (typeof n.targetId !== "string" || !ID_RE.test(n.targetId)) return { ok: false, reason: "target" };
  if (typeof n.text !== "string" || n.text.trim().length < 1 || n.text.length > NOTE_MAX_CHARS) return { ok: false, reason: "text" };
  return { ok: true };
}
