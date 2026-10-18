/**
 * Arbeidsgrupper (GP1, Fase 3 global pakke, B-044, spes. §15). Ren logikk for roller og rettigheter.
 * Databasen håndhever reglene (migrasjon 0045); dette er speilet som UI-et bruker for å vise riktige valg.
 */
import { localized } from "./i18n";

export type WorkspaceRole = "owner" | "editor" | "member";
export const WORKSPACE_ROLES: readonly WorkspaceRole[] = ["owner", "editor", "member"];
/** Roller en invitasjon kan gi (eier gis bare ved rolleendring). */
export const WORKSPACE_INVITE_ROLES: readonly WorkspaceRole[] = ["editor", "member"];

export const WORKSPACE_ROLE_LABEL: Record<WorkspaceRole, string> = localized({
  owner: ["Eier", "Owner"],
  editor: ["Redaktør", "Editor"],
  member: ["Medlem", "Member"],
});

export function workspaceRoleRank(role: WorkspaceRole | null | undefined): number {
  return role === "owner" ? 3 : role === "editor" ? 2 : role === "member" ? 1 : 0;
}

export function isWorkspaceRole(v: unknown): v is WorkspaceRole {
  return v === "owner" || v === "editor" || v === "member";
}

export interface WorkspaceRights {
  /** Se gruppen og bruke det globale biblioteket (GP2). */
  readonly use: boolean;
  /** Legge til og publisere nye versjoner i det globale biblioteket (GP2). */
  readonly publish: boolean;
  /** Arkivere og slette i det globale biblioteket (GP2). */
  readonly archive: boolean;
  /** Invitere, endre roller, fjerne medlemmer og gi nytt navn. */
  readonly manage: boolean;
}

export function workspaceRights(role: WorkspaceRole | null | undefined): WorkspaceRights {
  const r = workspaceRoleRank(role);
  return { use: r >= 1, publish: r >= 2, archive: r >= 3, manage: r >= 3 };
}

/**
 * Om en eier kan endres eller fjernes uten at gruppen står uten eier (samme regel som i databasen).
 * `members` er de aktive medlemmene.
 */
export function keepsAnOwner(
  members: readonly { readonly userId: string; readonly role: WorkspaceRole }[],
  userId: string,
  newRole: WorkspaceRole | null,
): boolean {
  const target = members.find((m) => m.userId === userId);
  if (!target || target.role !== "owner" || newRole === "owner") return true;
  return members.some((m) => m.userId !== userId && m.role === "owner");
}
