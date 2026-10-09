import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { ScriptWorkspace } from "@/app/script/ScriptWorkspace";

export const Route = createFileRoute("/prosjekt/$projectId/manus")({
  head: () => ({ meta: [{ title: "Manus – Animatic Studio" }] }),
  component: ScriptRoute,
});

function ScriptRoute() {
  const { projectId } = Route.useParams();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return <ScriptWorkspace projectId={projectId} userId={session.session.user.id} />;
}
