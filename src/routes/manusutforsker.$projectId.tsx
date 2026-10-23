import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AuthScreen } from "@/app/auth/AuthScreen";
import { useSession } from "@/app/auth/use-session";
import { LanguageSwitch, useLanguage } from "@/app/i18n/language";
import { fetchProjectLock } from "@/adapters/browser/account";
import { ScriptExplorer } from "@/app/script-explorer/ScriptExplorer";
import { validateExplorerSearch } from "@/app/script-explorer/explorer-state";
import { usePopupGeometry } from "@/app/script-explorer/popup-geometry";
import { t } from "@/core/i18n/keyed";

export const Route = createFileRoute("/manusutforsker/$projectId")({
  validateSearch: validateExplorerSearch,
  head: () => ({ meta: [
    { title: t("routes-manusutforsker-project-id.title.title.2a8a985b7a16") },
    { name: "description", content: t("routes-manusutforsker-project-id.content.content.ff977692e1ef") },
    { property: "og:title", content: t("routes-manusutforsker-project-id.content.content.4c3010f3f3fb") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-manusutforsker-project-id.content.content.8a248c24cf99") }, // i18n-ignore: metakode
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
  usePopupGeometry(session.status === "signed-in");
  const lock = useQuery({ queryKey: ["project-lock", projectId], enabled: session.status === "signed-in", queryFn: () => fetchProjectLock(projectId), staleTime: 60_000 });
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  if (lock.isLoading) return <p aria-busy className="p-4 text-xs text-text-tertiary">{t("routes-manusutforsker-project-id.explorer-route.p.6701ac4df175")}</p>;
  if (lock.isError || lock.data?.lock) return <p role="alert" className="p-4 text-xs text-status-danger">{t("routes-manusutforsker-project-id.explorer-route.p.00bc51371ac2")}</p>;
  return <div className="flex h-screen flex-col bg-bg-app" data-testid="script-explorer">
    <header className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-surface-2 px-3 text-xs font-semibold text-text-primary"><span>{t("routes-manusutforsker-project-id.explorer-route.span.1bf9101e457f")}</span><LanguageSwitch compact /></header>
    <ScriptExplorer projectId={projectId} userId={session.session.user.id} authorName={session.session.user.email ?? ""} source={search.kilde} initial={search} />
  </div>;
}