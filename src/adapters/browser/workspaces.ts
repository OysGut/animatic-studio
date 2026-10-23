/**
 * Arbeidsgrupper (GP1, migrasjon 0045) for nettleseren. Tilgangen håndheves i databasen; funksjonene kaster
 * med feilmeldingen derfra. Klienten skriver aldri direkte i tabellene.
 */
import { isWorkspaceRole, type WorkspaceRole } from "@/core";
import { backendMessage, db } from "./client";

export interface WorkspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly role: WorkspaceRole;
}
export interface WorkspaceMember {
  readonly userId: string;
  readonly role: WorkspaceRole;
  readonly joinedAt: string;
  readonly displayName: string | null;
}
export interface WorkspaceInvitation {
  readonly id: string;
  readonly email: string;
  readonly role: WorkspaceRole;
  readonly expiresAt: string;
}
export interface WorkspaceProject {
  readonly id: string;
  readonly name: string;
  readonly workspaceId: string | null;
}

function fail(e: { message: string; code?: string | null | undefined } | null): void {
  if (e) throw new Error(backendMessage(e));
}

/** Gruppene jeg er aktivt medlem av, med min rolle. */
export async function listMyWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const { data: mem, error: e1 } = await db
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .is("removed_at", null);
  fail(e1);
  const rows = (mem ?? []) as { workspace_id: string; role: string }[];
  if (!rows.length) return [];
  const { data: ws, error: e2 } = await db
    .from("workspaces")
    .select("id, name")
    .in(
      "id",
      rows.map((r) => r.workspace_id),
    )
    .is("archived_at", null);
  fail(e2);
  const role = new Map(rows.map((r) => [r.workspace_id, r.role]));
  return ((ws ?? []) as { id: string; name: string }[])
    .map((w) => ({ id: w.id, name: w.name, role: role.get(w.id) }))
    .filter((w): w is WorkspaceSummary => isWorkspaceRole(w.role));
}

export async function getWorkspace(id: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await db.from("workspaces").select("id, name").eq("id", id).maybeSingle();
  fail(error);
  return (data as { id: string; name: string } | null) ?? null;
}

export async function listWorkspaceMembers(id: string): Promise<WorkspaceMember[]> {
  const { data, error } = await db.rpc("list_workspace_members", { p_workspace: id });
  fail(error);
  return ((data ?? []) as { user_id: string; role: string; joined_at: string; display_name: string | null }[])
    .filter((r) => isWorkspaceRole(r.role))
    .map((r) => ({
      userId: r.user_id,
      role: r.role as WorkspaceRole,
      joinedAt: r.joined_at,
      displayName: r.display_name,
    }));
}

/** Ventende invitasjoner (bare eieren kan lese dem; andre får en tom liste). */
export async function listWorkspaceInvitations(id: string): Promise<WorkspaceInvitation[]> {
  const { data, error } = await db
    .from("workspace_invitations")
    .select("id, email, role, expires_at")
    .eq("workspace_id", id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  fail(error);
  return ((data ?? []) as { id: string; email: string; role: string; expires_at: string }[])
    .filter((r) => isWorkspaceRole(r.role))
    .map((r) => ({ id: r.id, email: r.email, role: r.role as WorkspaceRole, expiresAt: r.expires_at }));
}

/** Prosjektene i gruppen som jeg selv har tilgang til (RLS filtrerer). */
export async function listWorkspaceProjects(id: string): Promise<WorkspaceProject[]> {
  const { data, error } = await db
    .from("projects")
    .select("id, name, workspace_id")
    .eq("workspace_id", id)
    .is("deleted_at", null)
    .order("name");
  fail(error);
  return ((data ?? []) as { id: string; name: string; workspace_id: string | null }[]).map((p) => ({
    id: p.id,
    name: p.name,
    workspaceId: p.workspace_id,
  }));
}

/** Prosjektene der jeg er eier (bare de kan kobles til en gruppe). */
export async function listMyOwnedProjects(userId: string): Promise<WorkspaceProject[]> {
  const { data: mem, error: e1 } = await db
    .from("project_members")
    .select("project_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .is("removed_at", null);
  fail(e1);
  const ids = ((mem ?? []) as { project_id: string }[]).map((m) => m.project_id);
  if (!ids.length) return [];
  const { data, error } = await db
    .from("projects")
    .select("id, name, workspace_id")
    .in("id", ids)
    .is("deleted_at", null)
    .order("name");
  fail(error);
  return ((data ?? []) as { id: string; name: string; workspace_id: string | null }[]).map((p) => ({
    id: p.id,
    name: p.name,
    workspaceId: p.workspace_id,
  }));
}

export async function createWorkspace(name: string): Promise<string> {
  const { data, error } = await db.rpc("create_workspace", { p_name: name });
  fail(error);
  return data as string;
}
export async function renameWorkspace(id: string, name: string): Promise<void> {
  const { error } = await db.rpc("rename_workspace", { p_workspace: id, p_name: name });
  fail(error);
}
/** Ny invitasjon. Gir nøkkelen til lenken (vises én gang). */
export async function createWorkspaceInvitation(
  id: string,
  email: string,
  role: WorkspaceRole,
): Promise<string> {
  const { data, error } = await db.rpc("create_workspace_invitation", {
    p_workspace: id,
    p_email: email,
    p_role: role,
  });
  fail(error);
  return data as string;
}
export async function acceptWorkspaceInvitation(
  token: string,
): Promise<{ workspaceId: string | null; error: boolean; wrongEmail?: boolean }> {
  const { data, error } = await db.rpc("accept_workspace_invitation", { p_token: token });
  // Ø-11 (0058): invitasjonen gjelder en annen e-postadresse enn den innloggede brukerens
  const wrongEmail = (error as { code?: string } | null)?.code === "AS403";
  return { workspaceId: error ? null : (data as string), error: Boolean(error), wrongEmail };
}
export async function revokeWorkspaceInvitation(invitationId: string): Promise<void> {
  const { error } = await db.rpc("revoke_workspace_invitation", { p_invitation: invitationId });
  fail(error);
}
export async function setWorkspaceMemberRole(
  id: string,
  user: string,
  role: WorkspaceRole,
): Promise<void> {
  const { error } = await db.rpc("set_workspace_member_role", {
    p_workspace: id,
    p_user: user,
    p_role: role,
  });
  fail(error);
}
export async function removeWorkspaceMember(id: string, user: string): Promise<void> {
  const { error } = await db.rpc("remove_workspace_member", { p_workspace: id, p_user: user });
  fail(error);
}
export async function leaveWorkspace(id: string): Promise<void> {
  const { error } = await db.rpc("leave_workspace", { p_workspace: id });
  fail(error);
}
/** Kobler prosjektet til gruppen (null = frakoble). Gir ingen prosjekttilgang. */
export async function setProjectWorkspace(projectId: string, workspaceId: string | null): Promise<void> {
  const { error } = await db.rpc("set_project_workspace", {
    p_project: projectId,
    p_workspace: workspaceId,
  });
  fail(error);
}
