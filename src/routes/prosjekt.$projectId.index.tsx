
import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { ProjectOverview } from "@/app/projects/ProjectOverview";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

export const Route = createFileRoute("/prosjekt/$projectId/")({
  head: () => ({ meta: [
    { title: t("routes-prosjekt-project-id-index.title.title.bc4dd593f1d1") },
    { name: "description", content: t("routes-prosjekt-project-id-index.content.content.6d70b69e5f67") },
    { property: "og:title", content: t("routes-prosjekt-project-id-index.content.content.de4fc568159e") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-prosjekt-project-id-index.content.content.6d70b69e5f67.2") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  component: OverviewRoute,
});

function OverviewRoute() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const { projectId } = Route.useParams();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return <ProjectOverview projectId={projectId} userId={session.session.user.id} />;
}
