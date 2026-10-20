import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { AppHeader } from "@/app/shell/AppHeader";
import { SchemaBanner } from "@/app/shell/SchemaBanner";
import { AccountPage } from "@/app/account/AccountPage";
import { L } from "@/core";
import { useLanguage } from "@/app/i18n/language";

/** Min konto (DEC-0086): profil, språk, passord, AI-forbruk, personvern og sletting. */
export const Route = createFileRoute("/konto")({
  head: () => ({ meta: [
    { title: L("Min konto – Animatic Studio", "My account – Animatic Studio") },
    { name: "description", content: L("Administrer kontoen, språk og AI-valg i Animatic Studio.", "Manage your account, language and AI preferences in Animatic Studio.") },
    { property: "og:title", content: L("Min konto – Animatic Studio", "My account – Animatic Studio") }, // i18n-ignore: metakode
    { property: "og:description", content: L("Administrer kontoen, språk og AI-valg i Animatic Studio.", "Manage your account, language and AI preferences in Animatic Studio.") }, // i18n-ignore: metakode
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
      <AppHeader email={session.session.user.email} trail={L("Min konto", "My account")} />
      <SchemaBanner />
      <AccountPage email={session.session.user.email ?? ""} userId={session.session.user.id} />
    </div>
  );
}
