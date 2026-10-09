import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { SceneEditorWorkspace } from "@/app/scene-editor/SceneEditorWorkspace";

/** ?scene=<forekomst-ID> åpner sceneeditoren med scenen valgt. */
export const Route = createFileRoute("/prosjekt/$projectId/scene")({
  head: () => ({ meta: [{ title: "Sceneeditor – Animatic Studio" }] }),
  validateSearch: (s: Record<string, unknown>): { scene?: string } =>
    typeof s["scene"] === "string" && /^[0-9a-f-]{36}$/i.test(s["scene"])
      ? { scene: s["scene"] }
      : {},
  component: SceneEditorRoute,
});

function SceneEditorRoute() {
  const { projectId } = Route.useParams();
  const { scene } = Route.useSearch();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return (
    <SceneEditorWorkspace
      projectId={projectId}
      userId={session.session.user.id}
      initialOccurrenceId={scene ?? null}
    />
  );
}
