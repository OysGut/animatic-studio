import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { AppHeader } from "@/app/shell/AppHeader";
import { SchemaBanner } from "@/app/shell/SchemaBanner";
import { AdminPage } from "@/app/admin/AdminPage";
import { L } from "@/core";

/** Adminsiden (DEC-0086). Tilgangen kontrolleres på serveren; andre ser bare «Bare for administrator». */
export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: L("Administrasjon – Animatic Studio", "Administration – Animatic Studio") }],
  }),
  component: AdminRoute,
});

function AdminRoute() {
  const session = useSession();
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <div className="flex min-h-screen flex-col bg-bg-app">
      <AppHeader email={session.session.user.email} trail={L("Administrasjon", "Administration")} />
      <SchemaBanner />
      <AdminPage myId={session.session.user.id} />
    </div>
  );
}
