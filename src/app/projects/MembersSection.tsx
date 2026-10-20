/**
 * Medlemmer og invitasjoner på prosjektoversikten (DEC-0003, DEC-0063, REQ-0520/0521, REQ-0586).
 * Eieren kan endre rollen til et medlem etter at det er invitert inn, og endre rollen i eller trekke
 * tilbake en invitasjon som ikke er tatt imot ennå. Prosjektet har alltid minst én eier (kontrolleres
 * i databasen). Endringene skjer i databasefunksjoner (migrasjon 0020), ikke som kommandoer.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { UserMinus } from "lucide-react";
import {
  listPendingInvitations,
  removeMember,
  revokeInvitation,
  setInvitationRole as saveInvitationRole,
  setMemberRole,
} from "@/adapters/browser/members";
import type { MemberRow, ProfileRow } from "@/app/project/use-project";
import { Button } from "@/components/ui/button";
import { L, localized, locale, tm } from "@/core";
import { t, tLocalized } from "@/core/i18n/keyed";

const ROLE_LABEL: Record<string, string> = tLocalized({ owner: "app-projects-members-section.role-label.owner.2479f0cad1e9", editor: "app-projects-members-section.role-label.editor.66d469833732", commenter: "app-projects-members-section.role-label.commenter.0492a29e0284", viewer: "app-projects-members-section.role-label.viewer.27370640f10c" });

const ROLE_HELP: Record<string, string> = tLocalized({ owner: "app-projects-members-section.role-help.owner.a6db4c95085c", editor: "app-projects-members-section.role-help.editor.2f21316a51f7", commenter: "app-projects-members-section.role-help.commenter.fe93f990649d", viewer: "app-projects-members-section.role-help.viewer.cace12ddc020" });

const select =
  "h-7 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary disabled:opacity-60";

interface InvitationRow {
  id: string;
  email: string;
  role: string;
  expires_at: string;
}

/** Ventende invitasjoner (bare eieren kan lese dem). */
function useInvitations(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["project-invitations", projectId],
    enabled,
    queryFn: async (): Promise<InvitationRow[]> =>
      (await listPendingInvitations(projectId)) as InvitationRow[],
  });
}

/** Feilmeldingen fra databasen uten teknisk innpakning; manglende migrasjon forklares. */
function message(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/function .*remove_member|could not find the function .*remove_member/i.test(m))
    return t("app-projects-members-section.message.message.f5b9e1478f2b");
  if (
    /function .*(set_member_role|set_invitation_role|revoke_invitation)|could not find the function/i.test(
      m,
    )
  )
    return t("app-projects-members-section.message.message.9bf4e1d2979e");
  return tm(m);
}

export function MembersSection({
  projectId,
  userId,
  members,
  profiles,
  isOwner,
}: {
  projectId: string;
  userId: string;
  members: readonly MemberRow[];
  profiles: Readonly<Record<string, ProfileRow>> | undefined;
  isOwner: boolean;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const invitations = useInvitations(projectId, isOwner);
  const owners = members.filter((m) => m.role === "owner").length;
  const name = (id: string) => profiles?.[id]?.display_name || id.slice(0, 8);

  const setRole = useMutation({
    mutationFn: (v: { user: string; role: string }) => setMemberRole(projectId, v.user, v.role),
    onMutate: () => setError(null),
    onError: (e) => setError(message(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["project-members", projectId] }),
  });

  const setInvitationRole = useMutation({
    mutationFn: (v: { id: string; role: string }) => saveInvitationRole(v.id, v.role),
    onMutate: () => setError(null),
    onError: (e) => setError(message(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["project-invitations", projectId] }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvitation(id),
    onMutate: () => setError(null),
    onError: (e) => setError(message(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["project-invitations", projectId] }),
  });

  /** Fjerne et medlem (REQ-0529): bare medlemskapet avsluttes; det personen har laget, blir. */
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (user: string) => removeMember(projectId, user),
    onMutate: () => setError(null),
    onError: (e) => setError(message(e)),
    onSettled: () => {
      setConfirmRemove(null);
      return qc.invalidateQueries({ queryKey: ["project-members", projectId] });
    },
  });

  const busy = setRole.isPending || remove.isPending;
  return (
    <>
      <ul className="border border-border bg-surface-1" aria-label={t("app-projects-members-section.members-section.aria-label.9fbc1b4b4753")}>
        {members.map((m) => {
          const self = m.user_id === userId;
          // Eneste eier kan ikke miste eierrollen (databasen stopper det også)
          const lastOwner = m.role === "owner" && owners <= 1;
          return (
            <li
              key={m.user_id}
              className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 text-[13px] last:border-b-0"
            >
              <span className="min-w-0 truncate text-text-secondary">
                {profiles?.[m.user_id]?.display_name || (
                  <span className="font-mono text-xs">{m.user_id.slice(0, 8)}</span>
                )}
                {self ? (
                  <span className="ml-2 text-text-tertiary">{t("app-projects-members-section.members-section.span.f5709f3b14c5")}</span>
                ) : null}
              </span>
              {isOwner && confirmRemove === m.user_id ? (
                <span
                  role="alertdialog"
                  aria-label={t("app-projects-members-section.members-section.aria-label.3d6366f03169", { value1: String(name(m.user_id)) })}
                  className="flex items-center gap-2 text-xs text-text-secondary"
                >
                  {t("app-projects-members-section.members-section.span.e12b865c8de1", { value1: String(name(m.user_id)) })}
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => remove.mutate(m.user_id)}
                  >
                    {t("app-projects-members-section.members-section.button.de3a176abf52")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>
                    {t("app-projects-members-section.members-section.button.bee2a90b889c")}
                  </Button>
                </span>
              ) : isOwner ? (
                <span className="flex items-center gap-2">
                  <select
                    aria-label={t("app-projects-members-section.members-section.aria-label.94397bf095ab", { value1: String(name(m.user_id)) })}
                    value={m.role}
                    disabled={busy}
                    title={
                      lastOwner
                        ? t("app-projects-members-section.members-section.title.7b5d7c392cc1")
                        : ROLE_HELP[m.role]
                    }
                    onChange={(e) => {
                      const role = e.target.value;
                      if (
                        self &&
                        m.role === "owner" &&
                        !window.confirm(
                          t("app-projects-members-section.members-section.window-confirm.f37dca41d803", { value1: String(ROLE_LABEL[role]?.toLowerCase()) }),
                        )
                      )
                        return;
                      setRole.mutate({ user: m.user_id, role });
                    }}
                    className={select}
                  >
                    {Object.entries(ROLE_LABEL).map(([r, label]) => (
                      <option key={r} value={r} disabled={lastOwner && r !== "owner"}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {self ? null : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setConfirmRemove(m.user_id)}
                      aria-label={t("app-projects-members-section.members-section.aria-label.9d23f8499914", { value1: String(name(m.user_id)) })}
                      title={t("app-projects-members-section.members-section.title.7798df79b6a6")}
                    >
                      <UserMinus />
                    </Button>
                  )}
                </span>
              ) : (
                <span className="text-text-secondary" title={ROLE_HELP[m.role]}>
                  {ROLE_LABEL[m.role] ?? m.role}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {isOwner && (invitations.data?.length ?? 0) > 0 ? (
        <div className="mt-4">
          <h3 className="mb-1 text-xs font-medium text-text-secondary">
            {t("app-projects-members-section.members-section.h3.edd1ca021fa3")}
          </h3>
          <ul
            className="border border-border bg-surface-1"
            aria-label={t("app-projects-members-section.members-section.aria-label.358a0ca3a361")}
          >
            {invitations.data!.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 text-[13px] last:border-b-0"
              >
                <span className="min-w-0 truncate text-text-secondary">
                  {inv.email}
                  <span className="ml-2 text-xs text-text-tertiary">
                    {t("app-projects-members-section.members-section.span.19f6997c4992")}{" "}
                    {new Date(inv.expires_at).toLocaleDateString(locale())}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <select
                    aria-label={t("app-projects-members-section.members-section.aria-label.913be2b69e25", { email: String(inv.email) })}
                    value={inv.role}
                    disabled={setInvitationRole.isPending}
                    onChange={(e) => setInvitationRole.mutate({ id: inv.id, role: e.target.value })}
                    className={select}
                  >
                    <option value="editor">{t("app-projects-members-section.members-section.option.32bc26b65c5f")}</option>
                    <option value="commenter">{t("app-projects-members-section.members-section.option.2a2faad8fa5d")}</option>
                    <option value="viewer">{t("app-projects-members-section.members-section.option.b7d2fc552a29")}</option>
                  </select>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(inv.id)}
                    aria-label={t("app-projects-members-section.members-section.aria-label.19fbf4bf8df9", { email: String(inv.email) })}
                  >
                    {t("app-projects-members-section.members-section.button.dbe888c1ec1d")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-status-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}
