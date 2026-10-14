import { L } from "@/core";
import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { PosterWorkspace } from "@/app/release/PosterWorkspace";

export const Route = createFileRoute("/prosjekt/$projectId/utgivelse")({
  head: () => ({
    meta: [{ title: L("Utgivelse – Animatic Studio", "Release – Animatic Studio") }],
  }),
  component: ReleaseRoute,
});

function ReleaseRoute() {
  const { projectId } = Route.useParams();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return <PosterWorkspace projectId={projectId} userId={session.session.user.id} />;
}
