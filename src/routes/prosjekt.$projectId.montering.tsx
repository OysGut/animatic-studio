import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AssemblyWorkspace } from "@/app/assembly/AssemblyWorkspace";
import { L } from "@/core";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

const UUID = /^[0-9a-f-]{36}$/;

/**
 * Montering: den samlede filmen (M4 del 1, mandat kap. 15). ?scene=<forekomst-ID>&blokk=<blokk-ID> åpner
 * monteringen med avspillingshodet ved scenen eller replikken (fra manuset, DEC-0049).
 */
export const Route = createFileRoute("/prosjekt/$projectId/montering")({
  head: () => ({ meta: [
    { title: t("routes-prosjekt-project-id-montering.title.title.2bb3f430d9e2") },
    { name: "description", content: t("routes-prosjekt-project-id-montering.content.content.f41e7fb606ab") },
    { property: "og:title", content: t("routes-prosjekt-project-id-montering.content.content.d52ffc12ab1b") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-prosjekt-project-id-montering.content.content.f41e7fb606ab.2") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  validateSearch: (
    s: Record<string, unknown>,
  ): { scene?: string; blokk?: string; lastned?: "1" } => ({
    ...(typeof s["scene"] === "string" && UUID.test(s["scene"]) ? { scene: s["scene"] } : {}),
    ...(typeof s["blokk"] === "string" && UUID.test(s["blokk"]) ? { blokk: s["blokk"] } : {}),
    // Åpne nedlastingen av scenen (fra sceneeditoren, DEC-0085)
    ...(s["lastned"] === "1" || s["lastned"] === 1 ? { lastned: "1" as const } : {}),
  }),
  component: AssemblyRoute,
});

function AssemblyRoute() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const { projectId } = Route.useParams();
  const { scene, blokk, lastned } = Route.useSearch();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return (
    <AssemblyWorkspace
      projectId={projectId}
      userId={session.session.user.id}
      focus={
        scene ? { occurrenceId: scene, blockId: blokk ?? null, download: lastned === "1" } : null
      }
    />
  );
}
