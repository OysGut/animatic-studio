import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { L } from "@/core";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { useSession } from "@/app/auth/use-session";
import { LanguageSwitch, useLanguage } from "@/app/i18n/language";
import { fetchProjectLock } from "@/adapters/browser/account";
import { ScriptExplorer } from "@/app/script-explorer/ScriptExplorer";
import { validateExplorerSearch } from "@/app/script-explorer/explorer-state";

export const Route = createFileRoute("/manusutforsker/$projectId")({
  validateSearch: validateExplorerSearch,
  head: () => ({ meta: [
    { title: L("Manusutforskeren – Animatic Studio", "Script explorer – Animatic Studio") },
    { name: "description", content: L("Utforsk manuset og følg aktiv scene i et eget vindu.", "Explore the screenplay and follow the active scene in a separate window.") },
    { property: "og:title", content: L("Manusutforskeren – Animatic Studio", "Script explorer – Animatic Studio") }, // i18n-ignore: metakode
    { property: "og:description", content: L("Søk i manuset og legg til notater i Animatic Studio.", "Search the screenplay and add notes in Animatic Studio.") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  component: ExplorerRoute,
});
function ExplorerRoute() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const session = useSession();
  const lock = useQuery({ queryKey: ["project-lock", projectId], enabled: session.status === "signed-in", queryFn: () => fetchProjectLock(projectId), staleTime: 60_000 });
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  if (lock.isLoading) return <p aria-busy className="p-4 text-xs text-text-tertiary">{L("Henter prosjekt …", "Loading project …")}</p>;
  if (lock.isError || lock.data?.lock) return <p role="alert" className="p-4 text-xs text-status-danger">{L("Prosjektet er låst eller kunne ikke åpnes.", "The project is locked or could not be opened.")}</p>;
  return <div className="flex h-screen flex-col bg-bg-app" data-testid="script-explorer">
    <header className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-surface-2 px-3 text-xs font-semibold text-text-primary"><span>{L("Manusutforskeren", "Script explorer")}</span><LanguageSwitch compact /></header>
    <ScriptExplorer projectId={projectId} userId={session.session.user.id} authorName={session.session.user.email ?? ""} source={search.kilde} initial={search} />
  </div>;
}