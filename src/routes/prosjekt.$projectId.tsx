import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { AppHeader } from "@/app/shell/AppHeader";
import { SchemaBanner } from "@/app/shell/SchemaBanner";
import { ProjectNav } from "@/app/shell/ProjectNav";
import { fetchProjectName, upsertMyProfile } from "@/adapters/browser/projects";
import { AiJobsWatcher } from "@/app/ai/video-jobs";
import { canEdit, useMembers } from "@/app/project/use-project";

export const Route = createFileRoute("/prosjekt/$projectId")({
  head: () => ({ meta: [{ title: "Prosjekt – Animatic Studio" }] }),
  component: ProjectLayout,
});

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const session = useSession();
  const signedIn = session.status === "signed-in";
  const name = useQuery({
    queryKey: ["project-name", projectId],
    enabled: signedIn,
    queryFn: () => fetchProjectName(projectId),
  });
  const members = useMembers(projectId);
  // Visningsnavn for medlemslisten (migrasjon 0002). Feiler stille hvis migrasjonen ikke er kjørt.
  useEffect(() => {
    if (signedIn) void upsertMyProfile().catch(() => undefined);
  }, [signedIn]);
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <div className="flex h-screen flex-col bg-bg-app">
      <AppHeader email={session.session.user.email} trail={name.data?.name} />
      <SchemaBanner />
      <div className="flex min-h-0 flex-1">
        <ProjectNav projectId={projectId} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {name.data?.deleted ? (
            // Slettet prosjekt (DEC-0046): bare ressursene finnes, og de håndteres fra prosjektlisten
            <div className="mx-auto mt-16 max-w-[460px] px-6 text-center">
              <h1 className="text-lg font-semibold text-text-primary">Prosjektet er slettet</h1>
              <p className="mt-2 text-[13px] text-text-secondary">
                Ressursene (bilder og lyd) er tatt vare på. Du finner dem under «Ressurser fra
                slettede prosjekter» i prosjektlisten.
              </p>
              <Link
                to="/"
                className="mt-4 inline-block text-[13px] text-accent-brand underline-offset-2 hover:underline"
              >
                Til prosjektlisten
              </Link>
            </div>
          ) : (
            <>
              <AiJobsWatcher
                projectId={projectId}
                userId={session.session.user.id}
                editable={canEdit(
                  members.data?.find((m) => m.user_id === session.session.user.id)?.role,
                )}
              />
              <Outlet />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
