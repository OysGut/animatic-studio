import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { AppHeader } from "@/app/shell/AppHeader";
import { SchemaBanner } from "@/app/shell/SchemaBanner";
import { AccountPage } from "@/app/account/AccountPage";

import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

/** Min konto (DEC-0086): profil, språk, passord, AI-forbruk, personvern og sletting. */
export const Route = createFileRoute("/konto")({
  head: () => ({ meta: [
    { title: t("routes-konto.title.title.0ad1dbde485e") },
    { name: "description", content: t("routes-konto.content.content.b01c4654387c") },
    { property: "og:title", content: t("routes-konto.content.content.f63ad82751ab") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-konto.content.content.b01c4654387c.2") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  component: AccountRoute,
});

function AccountRoute() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const session = useSession();
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <div className="flex min-h-screen flex-col bg-bg-app">
      <AppHeader email={session.session.user.email} trail={t("routes-konto.account-route.trail.3c7458431283")} />
      <SchemaBanner />
      <AccountPage email={session.session.user.email ?? ""} userId={session.session.user.id} />
    </div>
  );
}
