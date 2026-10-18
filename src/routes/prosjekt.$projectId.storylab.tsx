import { L } from "@/core";
import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { StoryLabWorkspace } from "@/app/storylab/StoryLabWorkspace";

const UUID = /^[0-9a-f-]{36}$/;

/**
 * Story Lab (SL2/SL3). ?karakter=<ressurs-ID> velger karakteren (fra biblioteket); ?scene=<scene- eller
 * forekomst-ID> velger tidspunktet i fortellingen (fra manus og sceneeditoren).
 */
export const Route = createFileRoute("/prosjekt/$projectId/storylab")({
  head: () => ({ meta: [{ title: "Story Lab – Animatic Studio" },
    { name: "description", content: L("Karakterarbeid, scenelaboratorium og dialoganalyse i Animatic Studio.", "Character work, scene laboratory and dialogue analysis in Animatic Studio.") },
    // i18n-ignore: standard metadata keys
    { property: "og:title", content: "Story Lab – Animatic Studio" },
    // i18n-ignore: standard metadata keys
    { property: "og:description", content: L("Utforsk karakterer, analyser scener og prøv dialogvarianter i Animatic Studio.", "Explore characters, analyze scenes and try dialogue variants in Animatic Studio.") },
    // i18n-ignore: standard metadata keys
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (s: Record<string, unknown>): { karakter?: string; scene?: string } => ({
    ...(typeof s["karakter"] === "string" && UUID.test(s["karakter"])
      ? { karakter: s["karakter"] }
      : {}),
    ...(typeof s["scene"] === "string" && UUID.test(s["scene"]) ? { scene: s["scene"] } : {}),
  }),
  component: StoryLabRoute,
});

function StoryLabRoute() {
  const { projectId } = Route.useParams();
  const { karakter, scene } = Route.useSearch();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return (
    <StoryLabWorkspace
      projectId={projectId}
      userId={session.session.user.id}
      initialAssetId={karakter ?? null}
      initialSceneRef={scene ?? null}
    />
  );
}
