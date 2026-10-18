import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { ProjectsScreen } from "@/app/projects/ProjectsScreen";
import { AppHeader } from "@/app/shell/AppHeader";
import { SchemaBanner } from "@/app/shell/SchemaBanner";
import { L } from "@/core";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: L("Animatic Studio – Prosjekter", "Animatic Studio – Projects") },
    { name: "description", content: L("Animatic Studio – fra manus til ferdig film.", "Animatic Studio – from script to finished film.") },
    { property: "og:title", content: L("Animatic Studio – Prosjekter", "Animatic Studio – Projects") }, // i18n-ignore: metakode
    { property: "og:description", content: L("Animatic Studio – fra manus til ferdig film.", "Animatic Studio – from script to finished film.") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  component: Index,
});

function Index() {
  const session = useSession();
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <div className="flex min-h-screen flex-col bg-bg-app">
      <AppHeader email={session.session.user.email} />
      <SchemaBanner />
      <ProjectsScreen userId={session.session.user.id} />
    </div>
  );
}
