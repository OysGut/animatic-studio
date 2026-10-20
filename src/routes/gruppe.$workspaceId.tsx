import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { AppHeader } from "@/app/shell/AppHeader";
import { SchemaBanner } from "@/app/shell/SchemaBanner";
import { WorkspacePage } from "@/app/workspaces/WorkspacePage";
import { L } from "@/core";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

/** Adminsiden for en arbeidsgruppe (GP1). Tilgangen håndheves i databasen. */
export const Route = createFileRoute("/gruppe/$workspaceId")({
  head: () => ({ meta: [
    { title: t("routes-gruppe-workspace-id.title.title.73796e5fd612") },
    { name: "description", content: t("routes-gruppe-workspace-id.content.content.789e02872522") },
    { property: "og:title", content: t("routes-gruppe-workspace-id.content.content.d76669de2282") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-gruppe-workspace-id.content.content.789e02872522.2") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const { workspaceId } = Route.useParams();
  const session = useSession();
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <div className="flex min-h-screen flex-col bg-bg-app">
      <AppHeader email={session.session.user.email} trail={t("routes-gruppe-workspace-id.workspace-route.trail.16e3d36e939a")} />
      <SchemaBanner />
      <WorkspacePage workspaceId={workspaceId} myId={session.session.user.id} />
    </div>
  );
}
