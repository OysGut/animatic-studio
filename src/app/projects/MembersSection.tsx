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

const ROLE_LABEL: Record<string, string> = localized({
  owner: ["Eier", "Owner"],
  editor: ["Redaktør", "Editor"],
  commenter: ["Kommentator", "Commenter"],
  viewer: ["Leser", "Viewer"],
});

const ROLE_HELP: Record<string, string> = localized({
  owner: [
    "Alt, også invitere, endre roller, godkjenne kostnader og slette prosjektet",
    "Everything, including inviting, changing roles, approving costs and deleting the project",
  ],
  editor: [
    "Kan endre manus, scener, bibliotek og film",
    "Can change script, scenes, library and film",
  ],
  commenter: ["Kan lese og skrive notater", "Can read and write notes"],
  viewer: ["Kan bare lese", "Can only read"],
});

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
    return L(
      "Databasen mangler fjerning av medlemmer. Kontakt administratoren for å oppdatere Animatic Studio.",
      "The database cannot remove members yet. Contact the administrator to update Animatic Studio.",
    );
  if (
    /function .*(set_member_role|set_invitation_role|revoke_invitation)|could not find the function/i.test(
      m,
    )
  )
    return L(
      "Databasen mangler endring av roller. Kontakt administratoren for å oppdatere Animatic Studio.",
      "The database cannot change roles yet. Contact the administrator to update Animatic Studio.",
    );
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
      <ul className="border border-border bg-surface-1" aria-label={L("Medlemmer", "Members")}>
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
                  <span className="ml-2 text-text-tertiary">{L("(deg)", "(you)")}</span>
                ) : null}
              </span>
              {isOwner && confirmRemove === m.user_id ? (
                <span
                  role="alertdialog"
                  aria-label={L(`Fjerne ${name(m.user_id)}?`, `Remove ${name(m.user_id)}?`)}
                  className="flex items-center gap-2 text-xs text-text-secondary"
                >
                  {L(
                    `Fjerne ${name(m.user_id)} fra prosjektet? Det hen har laget, blir værende.`,
                    `Remove ${name(m.user_id)} from the project? Anything they have made will stay.`,
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => remove.mutate(m.user_id)}
                  >
                    {L("Fjern", "Remove")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>
                    {L("Avbryt", "Cancel")}
                  </Button>
                </span>
              ) : isOwner ? (
                <span className="flex items-center gap-2">
                  <select
                    aria-label={L(`Rolle for ${name(m.user_id)}`, `Role for ${name(m.user_id)}`)}
                    value={m.role}
                    disabled={busy}
                    title={
                      lastOwner
                        ? L(
                            "Prosjektet må ha minst én eier. Gjør en annen til eier først.",
                            "The project must have at least one owner. Make someone else the owner first.",
                          )
                        : ROLE_HELP[m.role]
                    }
                    onChange={(e) => {
                      const role = e.target.value;
                      if (
                        self &&
                        m.role === "owner" &&
                        !window.confirm(
                          L(
                            `Vil du gjøre deg selv til ${ROLE_LABEL[role]?.toLowerCase()}? Da kan du ikke lenger endre roller.`,
                            `Do you want to make yourself ${ROLE_LABEL[role]?.toLowerCase()}? Then you can no longer change roles.`,
                          ),
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
                      aria-label={L(
                        `Fjern ${name(m.user_id)} fra prosjektet`,
                        `Remove ${name(m.user_id)} from the project`,
                      )}
                      title={L(
                        "Fjern fra prosjektet (det personen har laget, blir værende)",
                        "Remove from the project (anything they have made will stay)",
                      )}
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
            {L("Invitert, ikke tatt imot ennå", "Invited, not yet accepted")}
          </h3>
          <ul
            className="border border-border bg-surface-1"
            aria-label={L("Ventende invitasjoner", "Pending invitations")}
          >
            {invitations.data!.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 text-[13px] last:border-b-0"
              >
                <span className="min-w-0 truncate text-text-secondary">
                  {inv.email}
                  <span className="ml-2 text-xs text-text-tertiary">
                    {L("gjelder til", "valid until")}{" "}
                    {new Date(inv.expires_at).toLocaleDateString(locale())}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <select
                    aria-label={L(
                      `Rolle i invitasjonen til ${inv.email}`,
                      `Role in the invitation to ${inv.email}`,
                    )}
                    value={inv.role}
                    disabled={setInvitationRole.isPending}
                    onChange={(e) => setInvitationRole.mutate({ id: inv.id, role: e.target.value })}
                    className={select}
                  >
                    <option value="editor">{L("Redaktør", "Editor")}</option>
                    <option value="commenter">{L("Kommentator", "Commenter")}</option>
                    <option value="viewer">{L("Leser", "Viewer")}</option>
                  </select>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(inv.id)}
                    aria-label={L(
                      `Trekk tilbake invitasjonen til ${inv.email}`,
                      `Withdraw the invitation to ${inv.email}`,
                    )}
                  >
                    {L("Trekk tilbake", "Withdraw")}
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
