import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { AppHeader } from "@/app/shell/AppHeader";
import { SchemaBanner } from "@/app/shell/SchemaBanner";
import { ProjectOverview } from "@/app/projects/ProjectOverview";
import { db } from "@/app/db";

export const Route = createFileRoute("/prosjekt/$projectId")({
  head: () => ({ meta: [{ title: "Prosjekt – Animatic Studio" }] }),
  component: ProjectRoute,
});

function ProjectRoute() {
  const { projectId } = Route.useParams();
  const session = useSession();
  const name = useQuery({
    queryKey: ["project-name", projectId],
    enabled: session.status === "signed-in",
    queryFn: async () => {
      const { data } = await db.from("projects").select("name").eq("id", projectId).maybeSingle();
      return (data as { name: string } | null)?.name ?? "";
    },
  });
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <div className="flex h-screen flex-col bg-bg-app">
      <AppHeader email={session.session.user.email} trail={name.data} />
      <SchemaBanner />
      <ProjectOverview projectId={projectId} userId={session.session.user.id} />
    </div>
  );
}
