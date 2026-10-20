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
  validateSearch: (s: Record<string, unknown>): { scene?: string; line?: string; at?: number; fane?: string } => {
    const id = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
    if (!id(s["scene"])) return {};
    const at = Number(s["at"]);
    return {
      scene: s["scene"] as string,
      ...(id(s["line"]) ? { line: s["line"] as string } : {}),
      ...(Number.isInteger(at) && at >= 0 && at < 1e9 ? { at } : {}),
      ...(s["fane"] === "animation" || s["fane"] === "scene" ? { fane: s["fane"] } : {}),
    };
  },
  component: SceneEditorRoute,
});

function SceneEditorRoute() {
  const { projectId } = Route.useParams();
  const { scene, line, at, fane } = Route.useSearch();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return (
    <SceneEditorWorkspace
      projectId={projectId}
      userId={session.session.user.id}
      initialOccurrenceId={scene ?? null}
      initialLineId={line ?? null}
      initialFrame={at ?? null}
      initialTab={fane ?? null}
    />
  );
}
