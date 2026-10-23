
import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { LibraryWorkspace } from "@/app/library/LibraryWorkspace";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

export const Route = createFileRoute("/prosjekt/$projectId/bibliotek")({
  head: () => ({ meta: [
    { title: t("routes-prosjekt-project-id-bibliotek.title.title.84464307719a") },
    { name: "description", content: t("routes-prosjekt-project-id-bibliotek.content.content.3f4837976c3c") },
    { property: "og:title", content: t("routes-prosjekt-project-id-bibliotek.content.content.ec20bfd8489a") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-prosjekt-project-id-bibliotek.content.content.3f4837976c3c.2") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  /** ?asset=<ressurs-ID> åpner biblioteket med ressursen valgt; &version=<ID> ruller resultatet inn i synet. */
  validateSearch: (s: Record<string, unknown>): { asset?: string; version?: string } => {
    const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
    return uuid(s["asset"]) ? { asset: s["asset"], ...(uuid(s["version"]) ? { version: s["version"] } : {}) } : {};
  },
  component: LibraryRoute,
});

function LibraryRoute() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const { projectId } = Route.useParams();
  const { asset, version } = Route.useSearch();
  const session = useSession();
  if (session.status !== "signed-in") return null;
  return (
    <LibraryWorkspace
      projectId={projectId}
      userId={session.session.user.id}
      initialAssetId={asset ?? null}
      initialVersionId={version ?? null}
    />
  );
}
