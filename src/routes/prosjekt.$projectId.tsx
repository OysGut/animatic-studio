import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { AppHeader } from "@/app/shell/AppHeader";
import { SchemaBanner } from "@/app/shell/SchemaBanner";
import { ProjectNav } from "@/app/shell/ProjectNav";
import { fetchProjectName, upsertMyProfile } from "@/adapters/browser/projects";
import { fetchProjectLock } from "@/adapters/browser/account";
import { AiJobsWatcher } from "@/app/ai/video-jobs";
import { MobileImportWatcher } from "@/app/mobile/use-mobile-imports";
import { EntityAnalysisWatcher } from "@/app/library/use-entity-analysis";
import { canEdit, useMembers } from "@/app/project/use-project";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

export const Route = createFileRoute("/prosjekt/$projectId")({
  head: () => ({ meta: [
    { title: t("routes-prosjekt-project-id.title.title.d35e8c26f18a") },
    { name: "description", content: t("routes-prosjekt-project-id.content.content.323705133be5") },
    { property: "og:title", content: t("routes-prosjekt-project-id.content.content.05f369d5fe5c") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-prosjekt-project-id.content.content.323705133be5.2") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  component: ProjectLayout,
});

function ProjectLayout() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const { projectId } = Route.useParams();
  const session = useSession();
  const signedIn = session.status === "signed-in";
  const name = useQuery({
    queryKey: ["project-name", projectId],
    enabled: signedIn,
    queryFn: () => fetchProjectName(projectId),
  });
  const members = useMembers(projectId);
  // Låst prosjekt (DEC-0086): eieren er blokkert eller har slettet kontoen; medlemmene ser bare en melding
  const lock = useQuery({
    queryKey: ["project-lock", projectId],
    enabled: signedIn,
    queryFn: () => fetchProjectLock(projectId),
    staleTime: 60_000,
  });
  // Visningsnavn for medlemslisten (migrasjon 0002). Feiler stille hvis migrasjonen ikke er kjørt.
  useEffect(() => {
    if (signedIn) void upsertMyProfile().catch(() => undefined);
  }, [signedIn]);
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <div className="flex h-screen flex-col bg-bg-app">
      <AppHeader email={session.session.user.email} trail={name.data?.name} />
      <SchemaBanner />
      <div className="flex min-h-0 flex-1 flex-col">
        <ProjectNav projectId={projectId} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {lock.data?.lock ? (
            <div
              className="mx-auto mt-16 max-w-[520px] px-6 text-center"
              data-testid="project-locked"
            >
              <h1 className="text-lg font-semibold text-text-primary">
                {t("routes-prosjekt-project-id.project-layout.h1.83c2e8141203")}
              </h1>
              <p className="mt-2 text-[13px] text-text-secondary">
                {lock.data.lock === "owner_blocked"
                  ? lock.data.ownerName
                    ? t("routes-prosjekt-project-id.owner-blocked-with-owner", { ownerName: lock.data.ownerName, adminEmail: lock.data.adminEmail ?? "" })
                    : t("routes-prosjekt-project-id.owner-blocked", { adminEmail: lock.data.adminEmail ?? "" })
                  : lock.data.lock === "no_owner"
                    ? t("routes-prosjekt-project-id.project-layout.p.aba08d0d2b17", { value1: String(lock.data.adminEmail ?? "") })
                    : t("routes-prosjekt-project-id.project-layout.p.f6f3bd8e7d04", { value1: String(lock.data.adminEmail ?? "") })}
              </p>
              <p className="mt-2 text-xs text-text-tertiary">
                {t("routes-prosjekt-project-id.project-layout.p.5622c808d147")}
              </p>
              <Link
                to="/"
                className="mt-4 inline-block text-[13px] text-accent-brand underline-offset-2 hover:underline"
              >
                {t("routes-prosjekt-project-id.project-layout.link.015885f8011d")}
              </Link>
            </div>
          ) : name.data?.deleted ? (
            // Slettet prosjekt (DEC-0046): bare ressursene finnes, og de håndteres fra prosjektlisten
            <div className="mx-auto mt-16 max-w-[460px] px-6 text-center">
              <h1 className="text-lg font-semibold text-text-primary">
                {t("routes-prosjekt-project-id.project-layout.h1.034a12e7f5db")}
              </h1>
              <p className="mt-2 text-[13px] text-text-secondary">
                {t("routes-prosjekt-project-id.project-layout.p.9cb6096fbb82")}
              </p>
              <Link
                to="/"
                className="mt-4 inline-block text-[13px] text-accent-brand underline-offset-2 hover:underline"
              >
                {t("routes-prosjekt-project-id.project-layout.link.015885f8011d.2")}
              </Link>
            </div>
          ) : (
            <>
              <AiJobsWatcher
                projectId={projectId}
                userId={session.session.user.id}
                editable={canEdit(
                  members.data?.find((m) => m.user_id === session.session.user.id)?.role,
                )}
              />
              {/* Bilder fra mobilen blir versjoner i ressursen de ble tatt for (DEC-0090) */}
              <MobileImportWatcher
                projectId={projectId}
                userId={session.session.user.id}
                editable={canEdit(
                  members.data?.find((m) => m.user_id === session.session.user.id)?.role,
                )}
              />
              {/* Automatisk gjenkjenning med den innebygde AI-en (OG2, B-047) */}
              <EntityAnalysisWatcher
                projectId={projectId}
                editable={canEdit(
                  members.data?.find((m) => m.user_id === session.session.user.id)?.role,
                )}
              />
              <Outlet />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
