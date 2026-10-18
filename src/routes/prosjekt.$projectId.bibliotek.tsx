import { L } from "@/core";
import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { LibraryWorkspace } from "@/app/library/LibraryWorkspace";

export const Route = createFileRoute("/prosjekt/$projectId/bibliotek")({
  head: () => ({ meta: [
    { title: L("Ressursbibliotek – Animatic Studio", "Asset library – Animatic Studio") },
    { name: "description", content: L("Arbeid med karakterer og ressurser i Animatic Studio.", "Work with characters and assets in Animatic Studio.") },
    { property: "og:title", content: L("Ressursbibliotek – Animatic Studio", "Asset library – Animatic Studio") }, // i18n-ignore: metakode
    { property: "og:description", content: L("Arbeid med karakterer og ressurser i Animatic Studio.", "Work with characters and assets in Animatic Studio.") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  /** ?asset=<ressurs-ID> åpner biblioteket med ressursen valgt (f.eks. fra sceneeditoren). */
  validateSearch: (s: Record<string, unknown>): { asset?: string } =>
    typeof s["asset"] === "string" && /^[0-9a-f-]{36}$/i.test(s["asset"])
      ? { asset: s["asset"] }
      : {},
  component: LibraryRoute,
});

function LibraryRoute() {
  const { projectId } = Route.useParams();
  const { asset } = Route.useSearch();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return (
    <LibraryWorkspace
      projectId={projectId}
      userId={session.session.user.id}
      initialAssetId={asset ?? null}
    />
  );
}
