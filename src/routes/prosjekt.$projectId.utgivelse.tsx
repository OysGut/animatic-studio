
import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { PosterWorkspace } from "@/app/release/PosterWorkspace";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

export const Route = createFileRoute("/prosjekt/$projectId/utgivelse")({
  head: () => ({ meta: [
    { title: t("routes-prosjekt-project-id-utgivelse.title.title.a5e29f16a42d") },
    { name: "description", content: t("routes-prosjekt-project-id-utgivelse.content.content.5b4e0564c64a") },
    { property: "og:title", content: t("routes-prosjekt-project-id-utgivelse.content.content.548965c72889") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-prosjekt-project-id-utgivelse.content.content.5b4e0564c64a.2") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  component: ReleaseRoute,
});

function ReleaseRoute() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const { projectId } = Route.useParams();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return <PosterWorkspace projectId={projectId} userId={session.session.user.id} />;
}
