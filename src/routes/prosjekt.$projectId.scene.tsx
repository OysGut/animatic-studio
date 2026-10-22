import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";

import { SceneEditorWorkspace } from "@/app/scene-editor/SceneEditorWorkspace";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

/** ?scene=<forekomst-ID> åpner sceneeditoren med scenen valgt. */
export const Route = createFileRoute("/prosjekt/$projectId/scene")({
  head: () => ({ meta: [
    { title: t("routes-prosjekt-project-id-scene.title.title.e56d614cb23c") },
    { name: "description", content: t("routes-prosjekt-project-id-scene.content.content.65f619722830") },
    { property: "og:title", content: t("routes-prosjekt-project-id-scene.content.content.867bd9fdb846") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-prosjekt-project-id-scene.content.content.65f619722830.2") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  validateSearch: (s: Record<string, unknown>): { scene?: string; line?: string; at?: number; fane?: string; lag?: string } => {
    const id = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
    if (!id(s["scene"])) return {};
    const at = Number(s["at"]);
    return {
      scene: s["scene"] as string,
      ...(id(s["line"]) ? { line: s["line"] as string } : {}),
      ...(Number.isInteger(at) && at >= 0 && at < 1e9 ? { at } : {}),
      ...(s["fane"] === "animation" || s["fane"] === "scene" ? { fane: s["fane"] } : {}),
      ...(id(s["lag"]) ? { lag: s["lag"] as string } : {}),
    };
  },
  component: SceneEditorRoute,
});

function SceneEditorRoute() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const { projectId } = Route.useParams();
  const { scene, line, at, fane, lag } = Route.useSearch();
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
      initialLayerId={lag ?? null}
    />
  );
}
