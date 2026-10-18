import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { acceptInvitation } from "@/adapters/browser/members";
import { acceptWorkspaceInvitation } from "@/adapters/browser/workspaces";
import { L } from "@/core";

export const Route = createFileRoute("/invitasjon")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
    type: search["type"] === "gruppe" ? ("gruppe" as const) : undefined,
  }),
  head: () => ({ meta: [
    { title: L("Invitasjon – Animatic Studio", "Invitation – Animatic Studio") },
    { name: "description", content: L("Godta en prosjektinvitasjon i Animatic Studio.", "Accept a project invitation in Animatic Studio.") },
    { property: "og:title", content: L("Invitasjon – Animatic Studio", "Invitation – Animatic Studio") }, // i18n-ignore: metakode
    { property: "og:description", content: L("Godta en prosjektinvitasjon i Animatic Studio.", "Accept a project invitation in Animatic Studio.") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  component: AcceptInvitation,
});

function AcceptInvitation() {
  const { token, type } = Route.useSearch();
  const session = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.status !== "signed-in" || !token) return;
    const invalid = L(
      "Invitasjonen er ugyldig, utløpt eller allerede brukt.",
      "The invitation is invalid, has expired or has already been used.",
    );
    // Gruppeinvitasjon (GP1): samme flyt, men til arbeidsgruppens side
    if (type === "gruppe") {
      void acceptWorkspaceInvitation(token).then(({ workspaceId, error: e }) => {
        if (e || !workspaceId) setError(invalid);
        else void navigate({ to: "/gruppe/$workspaceId", params: { workspaceId } });
      });
      return;
    }
    void acceptInvitation(token).then(({ projectId, error: e }) => {
      if (e || !projectId)
        setError(
          L(
            "Invitasjonen er ugyldig, utløpt eller allerede brukt.",
            "The invitation is invalid, has expired or has already been used.",
          ),
        );
      else void navigate({ to: "/prosjekt/$projectId", params: { projectId } });
    });
  }, [session.status, token, type, navigate]);

  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-app px-4">
      <p
        role={error ? "alert" : "status"}
        className={error ? "text-[13px] text-status-danger" : "text-[13px] text-text-secondary"}
      >
        {!token
          ? L("Lenken mangler invitasjonskode.", "The link is missing an invitation code.")
          : (error ?? L("Godtar invitasjonen …", "Accepting the invitation …"))}
      </p>
    </main>
  );
}
