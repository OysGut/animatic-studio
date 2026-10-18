/**
 * Adminsiden for én arbeidsgruppe (GP1): navn, medlemmer og roller, invitasjoner og koblede prosjekter.
 * Databasen håndhever rettighetene; siden viser bare valgene rollen har (workspaceRights).
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  L,
  tm,
  keepsAnOwner,
  workspaceRights,
  WORKSPACE_INVITE_ROLES,
  WORKSPACE_ROLES,
  WORKSPACE_ROLE_LABEL,
  type WorkspaceRole,
} from "@/core";
import {
  createWorkspaceInvitation,
  getWorkspace,
  leaveWorkspace,
  listMyOwnedProjects,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  listWorkspaceProjects,
  removeWorkspaceMember,
  renameWorkspace,
  revokeWorkspaceInvitation,
  setProjectWorkspace,
  setWorkspaceMemberRole,
} from "@/adapters/browser/workspaces";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import { Button } from "@/components/ui/button";
import { MY_WORKSPACES_KEY } from "./WorkspacesCard";

const input =
  "h-8 w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";
const select =
  "h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

function Card({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section
      data-testid={testId}
      className="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4"
    >
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

export function WorkspacePage({ workspaceId, myId }: { workspaceId: string; myId: string }) {
  const ready = useSchemaAtLeast(45);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const key = ["workspace", workspaceId] as const;
  const ws = useQuery({ queryKey: [...key, "info"], queryFn: () => getWorkspace(workspaceId), enabled: ready });
  const members = useQuery({
    queryKey: [...key, "members"],
    queryFn: () => listWorkspaceMembers(workspaceId),
    enabled: ready && !!ws.data,
  });
  const myRole = members.data?.find((m) => m.userId === myId)?.role ?? null;
  const rights = workspaceRights(myRole);
  const invitations = useQuery({
    queryKey: [...key, "invitations"],
    queryFn: () => listWorkspaceInvitations(workspaceId),
    enabled: ready && rights.manage,
  });
  const projects = useQuery({
    queryKey: [...key, "projects"],
    queryFn: () => listWorkspaceProjects(workspaceId),
    enabled: ready && !!ws.data,
  });
  const owned = useQuery({
    queryKey: [...key, "owned", myId],
    queryFn: () => listMyOwnedProjects(myId),
    enabled: ready && !!ws.data,
  });

  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [link, setLink] = useState<string | null>(null);
  const [linkProject, setLinkProject] = useState("");

  async function run(fn: () => Promise<unknown>) {
    setMsg(null);
    try {
      await fn();
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: MY_WORKSPACES_KEY });
    } catch (e) {
      setMsg(tm((e as Error).message));
    }
  }

  if (!ready)
    return (
      <main className="mx-auto w-full max-w-2xl p-6 text-[13px] text-text-secondary">
        {L(
          "Arbeidsgrupper krever en nyere databaseversjon.",
          "Workspaces require a newer database version.",
        )}
      </main>
    );
  if (ws.isSuccess && !ws.data)
    return (
      <main className="mx-auto w-full max-w-2xl p-6 text-[13px] text-text-secondary" role="alert">
        {L(
          "Gruppen finnes ikke, eller du er ikke medlem.",
          "The workspace does not exist, or you are not a member.",
        )}
      </main>
    );

  const memberList = members.data ?? [];
  const linkable = (owned.data ?? []).filter((p) => p.workspaceId !== workspaceId);
  const ownedIds = new Set((owned.data ?? []).map((p) => p.id));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6" data-testid="workspace-page">
      <Card title={L("Arbeidsgruppe", "Workspace")}>
        {rights.manage ? (
          <div className="flex gap-2">
            <input
              className={input}
              maxLength={200}
              aria-label={L("Navn", "Name")}
              value={name ?? ws.data?.name ?? ""}
              onChange={(e) => setName(e.target.value)}
              data-testid="workspace-name"
            />
            <Button
              size="sm"
              disabled={name === null || !name.trim()}
              onClick={() =>
                void run(async () => {
                  await renameWorkspace(workspaceId, name ?? "");
                  setName(null);
                })
              }
            >
              {L("Lagre", "Save")}
            </Button>
          </div>
        ) : (
          <p className="text-[13px] text-text-primary">{ws.data?.name}</p>
        )}
        {myRole ? (
          <p className="text-xs text-text-tertiary">
            {L("Din rolle:", "Your role:")} {WORKSPACE_ROLE_LABEL[myRole]}
          </p>
        ) : null}
      </Card>

      <Card title={L("Medlemmer", "Members")} testId="workspace-members">
        <ul className="flex flex-col gap-2">
          {memberList.map((m) => {
            const label = m.displayName || L("Uten navn", "No name");
            return (
              <li key={m.userId} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="text-text-primary">
                  {label}
                  {m.userId === myId ? ` (${L("deg", "you")})` : ""}
                </span>
                {rights.manage ? (
                  <span className="flex items-center gap-2">
                    <select
                      className={select}
                      aria-label={L(`Rolle for ${label}`, `Role for ${label}`)}
                      value={m.role}
                      onChange={(e) => {
                        const r = e.target.value as WorkspaceRole;
                        if (!keepsAnOwner(memberList, m.userId, r)) {
                          setMsg(L("Gruppen må ha minst én eier.", "The workspace must have at least one owner."));
                          return;
                        }
                        void run(() => setWorkspaceMemberRole(workspaceId, m.userId, r));
                      }}
                    >
                      {WORKSPACE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {WORKSPACE_ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                    {m.userId !== myId ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!keepsAnOwner(memberList, m.userId, null)}
                        onClick={() => void run(() => removeWorkspaceMember(workspaceId, m.userId))}
                      >
                        {L("Fjern", "Remove")}
                      </Button>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-xs text-text-tertiary">{WORKSPACE_ROLE_LABEL[m.role]}</span>
                )}
              </li>
            );
          })}
        </ul>
        {myRole ? (
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={!keepsAnOwner(memberList, myId, null)}
              onClick={() =>
                void run(async () => {
                  await leaveWorkspace(workspaceId);
                  void navigate({ to: "/konto" });
                })
              }
              data-testid="workspace-leave"
            >
              {L("Forlat gruppen", "Leave workspace")}
            </Button>
          </div>
        ) : null}
      </Card>

      {rights.manage ? (
        <Card title={L("Inviter", "Invite")} testId="workspace-invite">
          <div className="flex gap-2">
            <input
              className={input}
              type="email"
              aria-label={L("E-post", "Email")}
              placeholder={L("E-post", "Email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="workspace-invite-email"
            />
            <select
              className={select}
              aria-label={L("Rolle", "Role")}
              value={role}
              onChange={(e) => setRole(e.target.value as WorkspaceRole)}
            >
              {WORKSPACE_INVITE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {WORKSPACE_ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!email.includes("@")}
              onClick={() =>
                void run(async () => {
                  const token = await createWorkspaceInvitation(workspaceId, email, role);
                  setEmail("");
                  setLink(`${window.location.origin}/invitasjon?type=gruppe&token=${token}`);
                })
              }
              data-testid="workspace-invite-send"
            >
              {L("Lag invitasjon", "Create invitation")}
            </Button>
          </div>
          {link ? (
            <p className="break-all text-xs text-text-secondary" data-testid="workspace-invite-link">
              {L("Send denne lenken til personen (vises bare nå):", "Send this link to the person (shown only now):")}{" "}
              {link}
            </p>
          ) : null}
          {invitations.data?.length ? (
            <ul className="flex flex-col gap-1">
              {invitations.data.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-text-primary">
                    {i.email} · {WORKSPACE_ROLE_LABEL[i.role]}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void run(() => revokeWorkspaceInvitation(i.id))}
                  >
                    {L("Trekk tilbake", "Revoke")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      <Card title={L("Prosjekter i gruppen", "Projects in the workspace")} testId="workspace-projects">
        <p className="text-xs text-text-tertiary">
          {L(
            "Du ser bare prosjektene du selv er med i. Bare prosjektets eier kan koble det til eller fra.",
            "You only see the projects you are in yourself. Only the project owner can link or unlink it.",
          )}
        </p>
        <ul className="flex flex-col gap-1">
          {(projects.data ?? []).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="text-text-primary">{p.name}</span>
              {ownedIds.has(p.id) ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void run(() => setProjectWorkspace(p.id, null))}
                >
                  {L("Koble fra", "Unlink")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {myRole && linkable.length ? (
          <div className="flex gap-2">
            <select
              className={select}
              aria-label={L("Prosjekt å koble til", "Project to link")}
              value={linkProject}
              onChange={(e) => setLinkProject(e.target.value)}
              data-testid="workspace-link-project"
            >
              <option value="">{L("Velg et av dine prosjekter …", "Choose one of your projects …")}</option>
              {linkable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!linkProject}
              onClick={() =>
                void run(async () => {
                  await setProjectWorkspace(linkProject, workspaceId);
                  setLinkProject("");
                })
              }
            >
              {L("Koble til", "Link")}
            </Button>
          </div>
        ) : null}
      </Card>

      {msg ? (
        <p role="alert" className="text-xs text-status-danger">
          {msg}
        </p>
      ) : null}
    </main>
  );
}
