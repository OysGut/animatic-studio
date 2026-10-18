import { L } from "@/core";
import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { ScriptWorkspace } from "@/app/script/ScriptWorkspace";

/**
 * ?scene=<forekomst-ID> åpner manuset med scenen valgt (f.eks. fra «Brukt i scener» i biblioteket);
 * &blokk=<blokk-ID> velger replikken eller handlingen (fra monteringen, DEC-0049).
 */
export const Route = createFileRoute("/prosjekt/$projectId/manus")({
  head: () => ({ meta: [
    { title: L("Manus – Animatic Studio", "Script – Animatic Studio") },
    { name: "description", content: L("Rediger filmmanuset og scenene i Animatic Studio.", "Edit your screenplay and scenes in Animatic Studio.") },
    { property: "og:title", content: L("Manus – Animatic Studio", "Script – Animatic Studio") }, // i18n-ignore: metakode
    { property: "og:description", content: L("Rediger filmmanuset og scenene i Animatic Studio.", "Edit your screenplay and scenes in Animatic Studio.") }, // i18n-ignore: metakode
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
