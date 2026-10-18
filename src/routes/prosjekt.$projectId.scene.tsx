import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { L } from "@/core";
import { SceneEditorWorkspace } from "@/app/scene-editor/SceneEditorWorkspace";

/** ?scene=<forekomst-ID> åpner sceneeditoren med scenen valgt. */
export const Route = createFileRoute("/prosjekt/$projectId/scene")({
  head: () => ({ meta: [
    { title: L("Sceneeditor – Animatic Studio", "Scene editor – Animatic Studio") },
    { name: "description", content: L("Rediger scenekomposisjoner og animatic i Animatic Studio.", "Edit scene compositions and animatic in Animatic Studio.") },
    { property: "og:title", content: L("Sceneeditor – Animatic Studio", "Scene editor – Animatic Studio") }, // i18n-ignore: metakode
    { property: "og:description", content: L("Rediger scenekomposisjoner og animatic i Animatic Studio.", "Edit scene compositions and animatic in Animatic Studio.") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
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
