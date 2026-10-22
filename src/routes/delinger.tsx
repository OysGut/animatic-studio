import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { AppHeader } from "@/app/shell/AppHeader";
import { SchemaBanner } from "@/app/shell/SchemaBanner";
import { MyShowcasePage } from "@/app/community/MyShowcasePage";

import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

/** B-116: «Mine delinger» – alt brukeren har delt i utstillingsvinduet, med status. */
export const Route = createFileRoute("/delinger")({
  head: () => ({ meta: [
    { title: t("b116.route.title") },
    { name: "description", content: t("b116.route.description") },
    { property: "og:title", content: t("b116.route.title") }, // i18n-ignore: metakode
    { property: "og:description", content: t("b116.route.description") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  component: DelingerRoute,
});

function DelingerRoute() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const session = useSession();
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <div className="flex min-h-screen flex-col bg-bg-app">
      <AppHeader email={session.session.user.email} />
      <SchemaBanner />
      <MyShowcasePage />
    </div>
  );
}
