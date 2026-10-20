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
import { L } from "@/core";
import { useLanguage } from "@/app/i18n/language";

export const Route = createFileRoute("/prosjekt/$projectId")({
  head: () => ({ meta: [
    { title: L("Prosjekt – Animatic Studio", "Project – Animatic Studio") },
    { name: "description", content: L("Arbeidsflater for filmprosjektet i Animatic Studio.", "Workspaces for your film project in Animatic Studio.") },
    { property: "og:title", content: L("Prosjekt – Animatic Studio", "Project – Animatic Studio") }, // i18n-ignore: metakode
    { property: "og:description", content: L("Arbeidsflater for filmprosjektet i Animatic Studio.", "Workspaces for your film project in Animatic Studio.") }, // i18n-ignore: metakode
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
                {L("Prosjektet er låst", "The project is locked")}
              </h1>
              <p className="mt-2 text-[13px] text-text-secondary">
                {lock.data.lock === "owner_blocked"
                  ? L(
                      `Eieren av prosjektet er blokkert. Kontakt ${lock.data.ownerName ? `eieren (${lock.data.ownerName}) eller ` : ""}administrator på ${lock.data.adminEmail ?? ""}.`,
                      `The owner of the project is blocked. Contact ${lock.data.ownerName ? `the owner (${lock.data.ownerName}) or ` : ""}the administrator at ${lock.data.adminEmail ?? ""}.`,
                    )
                  : lock.data.lock === "no_owner"
                    ? L(
                        `Prosjektet har ingen eier. Kontakt administrator på ${lock.data.adminEmail ?? ""}.`,
                        `The project has no owner. Contact the administrator at ${lock.data.adminEmail ?? ""}.`,
                      )
                    : L(
                        `Eieren av prosjektet har slettet kontoen sin. Administrator kan gi prosjektet en ny eier: kontakt ${lock.data.adminEmail ?? ""}.`,
                        `The owner of the project has deleted their account. The administrator can give the project a new owner: contact ${lock.data.adminEmail ?? ""}.`,
                      )}
              </p>
              <p className="mt-2 text-xs text-text-tertiary">
                {L(
                  "Ingenting i prosjektet er slettet. Det åpnes igjen når eieren låses opp eller prosjektet får en ny eier.",
                  "Nothing in the project has been deleted. It opens again when the owner is unlocked or the project gets a new owner.",
                )}
              </p>
              <Link
                to="/"
                className="mt-4 inline-block text-[13px] text-accent-brand underline-offset-2 hover:underline"
              >
                {L("Til prosjektlisten", "To the project list")}
              </Link>
            </div>
          ) : name.data?.deleted ? (
            // Slettet prosjekt (DEC-0046): bare ressursene finnes, og de håndteres fra prosjektlisten
            <div className="mx-auto mt-16 max-w-[460px] px-6 text-center">
              <h1 className="text-lg font-semibold text-text-primary">
                {L("Prosjektet er slettet", "The project has been deleted")}
              </h1>
              <p className="mt-2 text-[13px] text-text-secondary">
                {L(
                  "Ressursene (bilder og lyd) er tatt vare på. Du finner dem under «Ressurser fra slettede prosjekter» i prosjektlisten.",
                  "The assets (images and audio) have been kept. You will find them under “Assets from deleted projects” in the project list.",
                )}
              </p>
              <Link
                to="/"
                className="mt-4 inline-block text-[13px] text-accent-brand underline-offset-2 hover:underline"
              >
                {L("Til prosjektlisten", "To the project list")}
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
