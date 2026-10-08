import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { ProjectsScreen } from "@/app/projects/ProjectsScreen";
import { AppHeader } from "@/app/shell/AppHeader";
import { SchemaBanner } from "@/app/shell/SchemaBanner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Animatic Studio" },
      { name: "description", content: "Animatic Studio – fra manus til ferdig film." },
    ],
  }),
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
