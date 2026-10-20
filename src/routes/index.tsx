import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { ProjectsScreen } from "@/app/projects/ProjectsScreen";
import { AppHeader } from "@/app/shell/AppHeader";
import { SchemaBanner } from "@/app/shell/SchemaBanner";
import { L } from "@/core";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: t("routes-index.title.title.d34b816fe818") },
    { name: "description", content: t("routes-index.content.content.75201acaab45") },
    { property: "og:title", content: t("routes-index.content.content.d4c02791089e") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-index.content.content.75201acaab45.2") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  component: Index,
});

function Index() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const session = useSession();
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <div className="flex min-h-screen flex-col bg-bg-app">
      <AppHeader email={session.session.user.email} />
      <SchemaBanner />
      <ProjectsScreen userId={session.session.user.id} />
    </div>
  );
}
