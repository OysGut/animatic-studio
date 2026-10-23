import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { StoryboardWorkspace } from "@/app/storyboard/StoryboardWorkspace";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

/** SB-2: storyboardgalleriet. ?panel=<panel-ID> velger et panel; ?scene=<forekomst-ID> velger produksjonen. */
export const Route = createFileRoute("/prosjekt/$projectId/storyboard")({
  head: () => ({ meta: [
    { title: t("sb2.route.title") },
    { name: "description", content: t("sb2.route.description") },
    { property: "og:title", content: t("sb2.route.title") }, // i18n-ignore: metakode
    { property: "og:description", content: t("sb2.route.description") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  validateSearch: (s: Record<string, unknown>): { panel?: string; scene?: string } => {
    const id = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
    return {
      ...(id(s["panel"]) ? { panel: s["panel"] as string } : {}),
      ...(id(s["scene"]) ? { scene: s["scene"] as string } : {}),
    };
  },
  component: StoryboardRoute,
});

function StoryboardRoute() {
  useLanguage();
  const { projectId } = Route.useParams();
  const { panel, scene } = Route.useSearch();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return <StoryboardWorkspace projectId={projectId} userId={session.session.user.id} initialPanelId={panel ?? null} initialOccurrenceId={scene ?? null} />;
}
