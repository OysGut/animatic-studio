import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { LibraryWorkspace } from "@/app/library/LibraryWorkspace";

export const Route = createFileRoute("/prosjekt/$projectId/bibliotek")({
  head: () => ({ meta: [{ title: "Ressursbibliotek – Animatic Studio" }] }),
  component: LibraryRoute,
});

function LibraryRoute() {
  const { projectId } = Route.useParams();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return <LibraryWorkspace projectId={projectId} userId={session.session.user.id} />;
}
