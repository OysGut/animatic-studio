import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { db } from "@/app/db";

export const Route = createFileRoute("/invitasjon")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
  }),
  head: () => ({ meta: [{ title: "Invitasjon – Animatic Studio" }] }),
  component: AcceptInvitation,
});

function AcceptInvitation() {
  const { token } = Route.useSearch();
  const session = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.status !== "signed-in" || !token) return;
    void db.rpc("accept_invitation", { p_token: token }).then(({ data, error: e }) => {
      if (e) setError("Invitasjonen er ugyldig, utløpt eller allerede brukt.");
      else void navigate({ to: "/prosjekt/$projectId", params: { projectId: data as string } });
    });
  }, [session.status, token, navigate]);

  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-app px-4">
      <p
        role={error ? "alert" : "status"}
        className={error ? "text-[13px] text-status-danger" : "text-[13px] text-text-secondary"}
      >
        {!token ? "Lenken mangler invitasjonskode." : (error ?? "Godtar invitasjonen …")}
      </p>
    </main>
  );
}
