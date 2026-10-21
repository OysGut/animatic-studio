import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { acceptInvitation } from "@/adapters/browser/members";
import { acceptWorkspaceInvitation } from "@/adapters/browser/workspaces";

import { LanguageSwitch, useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

export const Route = createFileRoute("/invitasjon")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
    type: search["type"] === "gruppe" ? ("gruppe" as const) : undefined,
  }),
  head: () => ({ meta: [
    { title: t("routes-invitasjon.title.title.15d2852cc7b6") },
    { name: "description", content: t("routes-invitasjon.content.content.2b66322361d6") },
    { property: "og:title", content: t("routes-invitasjon.content.content.167a3d5e4f4c") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-invitasjon.content.content.2b66322361d6.2") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  component: AcceptInvitation,
});

function AcceptInvitation() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const { token, type } = Route.useSearch();
  const session = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.status !== "signed-in" || !token) return;
    const invalid = t("routes-invitasjon.invalid.use-effect.a4bd36ee329e");
    const wrong = t("routes-invitasjon.wrong.use-effect.09d63b5cc3ae");
    // Gruppeinvitasjon (GP1): samme flyt, men til arbeidsgruppens side
    if (type === "gruppe") {
      void acceptWorkspaceInvitation(token).then(({ workspaceId, error: e, wrongEmail }) => {
        if (wrongEmail) setError(wrong);
        else if (e || !workspaceId) setError(invalid);
        else void navigate({ to: "/gruppe/$workspaceId", params: { workspaceId } });
      });
      return;
    }
    void acceptInvitation(token).then(({ projectId, error: e, wrongEmail }) => {
      if (wrongEmail) setError(wrong);
      else if (e || !projectId)
        setError(
          t("routes-invitasjon.accept-invitation.set-error.fa937f90fc5d"),
        );
      else void navigate({ to: "/prosjekt/$projectId", params: { projectId } });
    });
  }, [session.status, token, type, navigate]);

  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen invited />;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-app px-4">
      <LanguageSwitch compact />
      <p
        role={error ? "alert" : "status"}
        className={error ? "text-[13px] text-status-danger" : "text-[13px] text-text-secondary"}
      >
        {!token
          ? t("routes-invitasjon.accept-invitation.p.78d02d70a626")
          : (error ?? t("routes-invitasjon.accept-invitation.p.e3ae379101ad"))}
      </p>
    </main>
  );
}
