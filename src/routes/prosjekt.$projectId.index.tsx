import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { ProjectOverview } from "@/app/projects/ProjectOverview";

export const Route = createFileRoute("/prosjekt/$projectId/")({
  component: OverviewRoute,
});

function OverviewRoute() {
  const { projectId } = Route.useParams();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return <ProjectOverview projectId={projectId} userId={session.session.user.id} />;
}
