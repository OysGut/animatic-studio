
import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { RigWorkspace } from "@/app/rig/RigWorkspace";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

export const Route = createFileRoute("/prosjekt/$projectId/rigg")({
  head: () => ({ meta: [
    { title: t("routes-prosjekt-rigg.head.title") },
    { name: "description", content: t("routes-prosjekt-rigg.head.description") },
    { property: "og:title", content: t("routes-prosjekt-rigg.head.title") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-prosjekt-rigg.head.description") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  component: RigRoute,
});

function RigRoute() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const { projectId } = Route.useParams();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return <RigWorkspace projectId={projectId} userId={session.session.user.id} />;
}
