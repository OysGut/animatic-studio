import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AssemblyWorkspace } from "@/app/assembly/AssemblyWorkspace";
import { L } from "@/core";

const UUID = /^[0-9a-f-]{36}$/;

/**
 * Montering: den samlede filmen (M4 del 1, mandat kap. 15). ?scene=<forekomst-ID>&blokk=<blokk-ID> åpner
 * monteringen med avspillingshodet ved scenen eller replikken (fra manuset, DEC-0049).
 */
export const Route = createFileRoute("/prosjekt/$projectId/montering")({
  head: () => ({
    meta: [{ title: L("Montering – Animatic Studio", "Assembly – Animatic Studio") }],
  }),
  validateSearch: (s: Record<string, unknown>): { scene?: string; blokk?: string } => ({
    ...(typeof s["scene"] === "string" && UUID.test(s["scene"]) ? { scene: s["scene"] } : {}),
    ...(typeof s["blokk"] === "string" && UUID.test(s["blokk"]) ? { blokk: s["blokk"] } : {}),
  }),
  component: AssemblyRoute,
});

function AssemblyRoute() {
  const { projectId } = Route.useParams();
  const { scene, blokk } = Route.useSearch();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return (
    <AssemblyWorkspace
      projectId={projectId}
      userId={session.session.user.id}
      focus={scene ? { occurrenceId: scene, blockId: blokk ?? null } : null}
    />
  );
}
