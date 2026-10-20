import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { AppHeader } from "@/app/shell/AppHeader";
import { SchemaBanner } from "@/app/shell/SchemaBanner";
import { AdminPage } from "@/app/admin/AdminPage";
import { L } from "@/core";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

/** Adminsiden (DEC-0086). Tilgangen kontrolleres på serveren; andre ser bare «Bare for administrator». */
export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [
    { title: t("routes-admin.title.title.50274d57d4da") },
    { name: "description", content: t("routes-admin.content.content.4a28312072cc") },
    { property: "og:title", content: t("routes-admin.content.content.2838c73c64a0") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-admin.content.content.4a28312072cc.2") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  component: AdminRoute,
});

function AdminRoute() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const session = useSession();
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <div className="flex min-h-screen flex-col bg-bg-app">
      <AppHeader email={session.session.user.email} trail={t("routes-admin.admin-route.trail.a96adb8ff9c5")} />
      <SchemaBanner />
      <AdminPage myId={session.session.user.id} />
    </div>
  );
}
