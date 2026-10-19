/**
 * Medlemmer, roller og invitasjoner (DEC-0010, REQ-0529) for nettleseren (KI-181). Tilgangen håndheves i
 * databasen; funksjonene kaster med feilmeldingen derfra.
 */
import { db, plainError, type BackendResult } from "./client";

/** Aktive medlemmer i prosjektet. */
export async function listMembers(projectId: string): Promise<unknown[]> {
  const { data, error } = await db
    .from("project_members")
    .select("user_id, role, joined_at")
    .eq("project_id", projectId)
    .is("removed_at", null);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Visningsnavn (migrasjon 0002). Feilen gis tilbake (tabellen kan mangle). */
export async function listProfiles(
  userIds: readonly string[],
): Promise<BackendResult<unknown[] | null>> {
  const { data, error } = await db
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", [...userIds]);
  return { data, error: plainError(error) };
}

/** Ventende invitasjoner (bare eieren kan lese dem). */
export async function listPendingInvitations(projectId: string): Promise<unknown[]> {
  const { data, error } = await db
    .from("project_invitations")
    .select("id, email, role, expires_at")
    .eq("project_id", projectId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function setMemberRole(projectId: string, user: string, role: string): Promise<void> {
  const { error: e } = await db.rpc("set_member_role", {
    p_project: projectId,
    p_user: user,
    p_role: role,
  });
  if (e) throw new Error(e.message);
}

export async function setInvitationRole(invitationId: string, role: string): Promise<void> {
  const { error: e } = await db.rpc("set_invitation_role", {
    p_invitation: invitationId,
    p_role: role,
  });
  if (e) throw new Error(e.message);
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const { error: e } = await db.rpc("revoke_invitation", { p_invitation: invitationId });
  if (e) throw new Error(e.message);
}

/** Avslutter bare medlemskapet; det personen har laget, blir. */
export async function removeMember(projectId: string, user: string): Promise<void> {
  const { error: e } = await db.rpc("remove_member", { p_project: projectId, p_user: user });
  if (e) throw new Error(e.message);
}

/** Ny invitasjon. Gir invitasjonsnøkkelen (til lenken). */
export async function createInvitation(
  projectId: string,
  email: string,
  role: string,
): Promise<string> {
  const { data, error } = await db.rpc("create_invitation", {
    p_project: projectId,
    p_email: email,
    p_role: role,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Tar imot en invitasjon; gir prosjekt-ID eller feil. */
export async function acceptInvitation(
  token: string,
): Promise<{ projectId: string | null; error: boolean; wrongEmail?: boolean }> {
  const { data, error } = await db.rpc("accept_invitation", { p_token: token });
  // Ø-11 (0058): invitasjonen gjelder en annen e-postadresse enn den innloggede brukerens
  const wrongEmail = (error as { code?: string } | null)?.code === "AS403";
  return { projectId: error ? null : (data as string), error: Boolean(error), wrongEmail };
}
