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

const ROLE_LABEL: Record<string, string> = {
  owner: "Eier",
  editor: "Redaktør",
  commenter: "Kommentator",
  viewer: "Leser",
};

const ROLE_HELP: Record<string, string> = {
  owner: "Alt, også invitere, endre roller, godkjenne kostnader og slette prosjektet",
  editor: "Kan endre manus, scener, bibliotek og film",
  commenter: "Kan lese og skrive notater",
  viewer: "Kan bare lese",
};

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
    return "Databasen mangler fjerning av medlemmer. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0023.";
  if (
    /function .*(set_member_role|set_invitation_role|revoke_invitation)|could not find the function/i.test(
      m,
    )
  )
    return "Databasen mangler endring av roller. Lim inn meldingen i LOVABLE_SYNC.md i Lovable for å kjøre migrasjon 0020.";
  return m;
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
      <ul className="border border-border bg-surface-1" aria-label="Medlemmer">
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
                {self ? <span className="ml-2 text-text-tertiary">(deg)</span> : null}
              </span>
              {isOwner && confirmRemove === m.user_id ? (
                <span
                  role="alertdialog"
                  aria-label={`Fjerne ${name(m.user_id)}?`}
                  className="flex items-center gap-2 text-xs text-text-secondary"
                >
                  Fjerne {name(m.user_id)} fra prosjektet? Det hen har laget, blir værende.
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => remove.mutate(m.user_id)}
                  >
                    Fjern
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>
                    Avbryt
                  </Button>
                </span>
              ) : isOwner ? (
                <span className="flex items-center gap-2">
                  <select
                    aria-label={`Rolle for ${name(m.user_id)}`}
                    value={m.role}
                    disabled={busy}
                    title={
                      lastOwner
                        ? "Prosjektet må ha minst én eier. Gjør en annen til eier først."
                        : ROLE_HELP[m.role]
                    }
                    onChange={(e) => {
                      const role = e.target.value;
                      if (
                        self &&
                        m.role === "owner" &&
                        !window.confirm(
                          `Vil du gjøre deg selv til ${ROLE_LABEL[role]?.toLowerCase()}? Da kan du ikke lenger endre roller.`,
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
                      aria-label={`Fjern ${name(m.user_id)} fra prosjektet`}
                      title="Fjern fra prosjektet (det personen har laget, blir værende)"
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
            Invitert, ikke tatt imot ennå
          </h3>
          <ul className="border border-border bg-surface-1" aria-label="Ventende invitasjoner">
            {invitations.data!.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 text-[13px] last:border-b-0"
              >
                <span className="min-w-0 truncate text-text-secondary">
                  {inv.email}
                  <span className="ml-2 text-xs text-text-tertiary">
                    gjelder til {new Date(inv.expires_at).toLocaleDateString("nb-NO")}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <select
                    aria-label={`Rolle i invitasjonen til ${inv.email}`}
                    value={inv.role}
                    disabled={setInvitationRole.isPending}
                    onChange={(e) => setInvitationRole.mutate({ id: inv.id, role: e.target.value })}
                    className={select}
                  >
                    <option value="editor">Redaktør</option>
                    <option value="commenter">Kommentator</option>
                    <option value="viewer">Leser</option>
                  </select>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(inv.id)}
                    aria-label={`Trekk tilbake invitasjonen til ${inv.email}`}
                  >
                    Trekk tilbake
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
