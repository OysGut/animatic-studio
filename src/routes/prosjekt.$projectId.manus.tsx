
import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { ScriptWorkspace } from "@/app/script/ScriptWorkspace";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

/**
 * ?scene=<forekomst-ID> åpner manuset med scenen valgt (f.eks. fra «Brukt i scener» i biblioteket);
 * &blokk=<blokk-ID> velger replikken eller handlingen (fra monteringen, DEC-0049).
 */
export const Route = createFileRoute("/prosjekt/$projectId/manus")({
  head: () => ({ meta: [
    { title: t("routes-prosjekt-project-id-manus.title.title.fd507ce55a58") },
    { name: "description", content: t("routes-prosjekt-project-id-manus.content.content.6918ed5f9558") },
    { property: "og:title", content: t("routes-prosjekt-project-id-manus.content.content.a5f21f0482ff") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-prosjekt-project-id-manus.content.content.6918ed5f9558.2") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  validateSearch: (s: Record<string, unknown>): { scene?: string; blokk?: string } => ({
    ...(typeof s["scene"] === "string" && /^[0-9a-f-]{36}$/.test(s["scene"])
      ? { scene: s["scene"] }
      : {}),
    ...(typeof s["blokk"] === "string" && /^[0-9a-f-]{36}$/.test(s["blokk"])
      ? { blokk: s["blokk"] }
      : {}),
  }),
  component: ScriptRoute,
});

function ScriptRoute() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const { projectId } = Route.useParams();
  const { scene, blokk } = Route.useSearch();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return (
    <ScriptWorkspace
      projectId={projectId}
      userId={session.session.user.id}
      initialOccurrenceId={scene ?? null}
      initialBlockId={blokk ?? null}
    />
  );
}
