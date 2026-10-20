
import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { StoryLabWorkspace } from "@/app/storylab/StoryLabWorkspace";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

const UUID = /^[0-9a-f-]{36}$/;

/**
 * Story Lab (SL2/SL3). ?karakter=<ressurs-ID> velger karakteren (fra biblioteket); ?scene=<scene- eller
 * forekomst-ID> velger tidspunktet i fortellingen (fra manus og sceneeditoren).
 */
export const Route = createFileRoute("/prosjekt/$projectId/storylab")({
  head: () => ({ meta: [{ title: "Story Lab – Animatic Studio" },
    { name: "description", content: t("routes-prosjekt-project-id-storylab.content.content.01bee122f398") },
    // i18n-ignore: standard metadata keys
    { property: "og:title", content: "Story Lab – Animatic Studio" },
    // i18n-ignore: standard metadata keys
    { property: "og:description", content: t("routes-prosjekt-project-id-storylab.content.content.bb77d3e1ff88") },
    // i18n-ignore: standard metadata keys
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (s: Record<string, unknown>): { karakter?: string; scene?: string; forslag?: string; visning?: "canvas"; intervju?: "ny" } => ({
    ...(s["visning"] === "canvas" ? { visning: "canvas" as const } : {}),
    ...(s["intervju"] === "ny" ? { intervju: "ny" as const } : {}),
    ...(typeof s["forslag"] === "string" && (s["forslag"] === "open" || UUID.test(s["forslag"])) ? { forslag: s["forslag"] } : {}),
    ...(typeof s["karakter"] === "string" && UUID.test(s["karakter"])
      ? { karakter: s["karakter"] }
      : {}),
    ...(typeof s["scene"] === "string" && UUID.test(s["scene"]) ? { scene: s["scene"] } : {}),
  }),
  component: StoryLabRoute,
});

function StoryLabRoute() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const { projectId } = Route.useParams();
  const { karakter, scene, forslag, visning, intervju } = Route.useSearch();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return (
    <StoryLabWorkspace
      projectId={projectId}
      userId={session.session.user.id}
      initialAssetId={karakter ?? null}
      initialSceneRef={scene ?? null}
      initialSuggestions={!!forslag}
      initialSuggestionId={forslag && forslag !== "open" ? forslag : null}
      initialCanvas={visning === "canvas" || intervju === "ny"}
      initialInterview={intervju === "ny"}
    />
  );
}
