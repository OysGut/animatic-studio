import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AssemblyWorkspace } from "@/app/assembly/AssemblyWorkspace";

/** Montering: den samlede filmen (M4 del 1, mandat kap. 15). */
export const Route = createFileRoute("/prosjekt/$projectId/montering")({
  head: () => ({ meta: [{ title: "Montering – Animatic Studio" }] }),
  component: AssemblyRoute,
});

function AssemblyRoute() {
  const { projectId } = Route.useParams();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return <AssemblyWorkspace projectId={projectId} userId={session.session.user.id} />;
}
