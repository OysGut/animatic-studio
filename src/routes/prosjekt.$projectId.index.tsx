import { L } from "@/core";
import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { ProjectOverview } from "@/app/projects/ProjectOverview";
import { useLanguage } from "@/app/i18n/language";

export const Route = createFileRoute("/prosjekt/$projectId/")({
  head: () => ({ meta: [
    { title: L("Prosjektoversikt – Animatic Studio", "Project overview – Animatic Studio") },
    { name: "description", content: L("Se filmprosjektets produksjoner i Animatic Studio.", "View your film project productions in Animatic Studio.") },
    { property: "og:title", content: L("Prosjektoversikt – Animatic Studio", "Project overview – Animatic Studio") }, // i18n-ignore: metakode
    { property: "og:description", content: L("Se filmprosjektets produksjoner i Animatic Studio.", "View your film project productions in Animatic Studio.") }, // i18n-ignore: metakode
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
