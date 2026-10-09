import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { LibraryWorkspace } from "@/app/library/LibraryWorkspace";

export const Route = createFileRoute("/prosjekt/$projectId/bibliotek")({
  head: () => ({ meta: [{ title: "Ressursbibliotek – Animatic Studio" }] }),
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
