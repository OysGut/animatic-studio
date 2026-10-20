import { L } from "@/core";
import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { PosterWorkspace } from "@/app/release/PosterWorkspace";
import { useLanguage } from "@/app/i18n/language";

export const Route = createFileRoute("/prosjekt/$projectId/utgivelse")({
  head: () => ({ meta: [
    { title: L("Utgivelse – Animatic Studio", "Release – Animatic Studio") },
    { name: "description", content: L("Arbeid med plakater og utgivelse i Animatic Studio.", "Work with posters and release in Animatic Studio.") },
    { property: "og:title", content: L("Utgivelse – Animatic Studio", "Release – Animatic Studio") }, // i18n-ignore: metakode
    { property: "og:description", content: L("Arbeid med plakater og utgivelse i Animatic Studio.", "Work with posters and release in Animatic Studio.") }, // i18n-ignore: metakode
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
