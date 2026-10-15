import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { AppHeader } from "@/app/shell/AppHeader";
import { SchemaBanner } from "@/app/shell/SchemaBanner";
import { AccountPage } from "@/app/account/AccountPage";
import { L } from "@/core";

/** Min konto (DEC-0086): profil, språk, passord, AI-forbruk, personvern og sletting. */
export const Route = createFileRoute("/konto")({
  head: () => ({
    meta: [{ title: L("Min konto – Animatic Studio", "My account – Animatic Studio") }],
  }),
  component: AccountRoute,
});

function AccountRoute() {
  const session = useSession();
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <div className="flex min-h-screen flex-col bg-bg-app">
      <AppHeader email={session.session.user.email} trail={L("Min konto", "My account")} />
      <SchemaBanner />
      <AccountPage email={session.session.user.email ?? ""} />
    </div>
  );
}
