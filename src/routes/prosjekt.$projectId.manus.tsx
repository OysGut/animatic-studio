import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { ScriptWorkspace } from "@/app/script/ScriptWorkspace";

/** ?scene=<forekomst-ID> åpner manuset med scenen valgt (f.eks. fra «Brukt i scener» i biblioteket). */
export const Route = createFileRoute("/prosjekt/$projectId/manus")({
  head: () => ({ meta: [{ title: "Manus – Animatic Studio" }] }),
  validateSearch: (s: Record<string, unknown>): { scene?: string } =>
    typeof s["scene"] === "string" && /^[0-9a-f-]{36}$/.test(s["scene"])
      ? { scene: s["scene"] }
      : {},
  component: ScriptRoute,
});

function ScriptRoute() {
  const { projectId } = Route.useParams();
  const { scene } = Route.useSearch();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return (
    <ScriptWorkspace
      projectId={projectId}
      userId={session.session.user.id}
      initialOccurrenceId={scene ?? null}
    />
  );
}
