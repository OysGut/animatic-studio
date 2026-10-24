import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AuthScreen } from "@/app/auth/AuthScreen";
import { useSession } from "@/app/auth/use-session";
import { LanguageSwitch, useLanguage } from "@/app/i18n/language";
import { fetchProjectLock } from "@/adapters/browser/account";
import { useProjectState } from "@/app/project/use-project";
import { StoryboardReferencePanel } from "@/app/scene-editor/StoryboardReferencePanel";
import { UiId } from "@/app/shared/UiId";
import { t } from "@/core/i18n/keyed";
import { useStoryboardRefPopupGeometry } from "@/app/scene-editor/storyboard-ref-popup";

/** SB-5: storyboard-referansen i eget popup-vindu. ?scene=<forekomst-ID>, ?kilde=<vindus-ID>. */
export const Route = createFileRoute("/prosjekt/$projectId/storyboardref")({
  head: () => ({ meta: [
    { title: t("sb5.route.title") },
    { name: "description", content: t("sb5.route.description") },
    { property: "og:title", content: t("sb5.route.title") }, // i18n-ignore: metakode
    { property: "og:description", content: t("sb5.route.description") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  validateSearch: (s: Record<string, unknown>): { scene?: string; kilde?: string } => {
    const id = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
    return {
      ...(id(s["scene"]) ? { scene: s["scene"] as string } : {}),
      ...(typeof s["kilde"] === "string" && s["kilde"] ? { kilde: s["kilde"] as string } : {}),
    };
  },
  component: StoryboardRefRoute,
});

function StoryboardRefRoute() {
  useLanguage();
  const { projectId } = Route.useParams();
  const { scene, kilde } = Route.useSearch();
  const session = useSession();
  useStoryboardRefPopupGeometry(session.status === "signed-in");
  const lock = useQuery({ queryKey: ["project-lock", projectId], enabled: session.status === "signed-in", queryFn: () => fetchProjectLock(projectId), staleTime: 60_000 });
  const query = useProjectState(projectId);
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  if (lock.isLoading || query.isLoading) return <p aria-busy className="p-4 text-xs text-text-tertiary">{t("sb5.loading")}</p>;
  if (lock.isError || lock.data?.lock || query.isError || !query.data) return <p role="alert" className="p-4 text-xs text-status-danger">{t("sb5.load-error")}</p>;
  const occurrence = scene ? query.data.occurrences[scene as never] : undefined;
  const productionId = occurrence?.productionId ?? "";
  return (
    <div className="flex h-screen flex-col bg-bg-app" data-testid="storyboard-ref-popup">
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-surface-2 px-3 text-xs font-semibold text-text-primary">
        <span>{t("sb5.reference-title")}</span>
        <LanguageSwitch compact />
      </header>
      {occurrence ? (
        <StoryboardReferencePanel
          state={query.data}
          projectId={projectId}
          productionId={productionId}
          occurrenceId={occurrence.id}
          sourceWindow={kilde}
          large
        />
      ) : (
        <p className="p-4 text-xs text-text-tertiary">{t("sb5.no-scene")}</p>
      )}
      <UiId id="V-172" />
    </div>
  );
}
