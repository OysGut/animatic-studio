import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { ReturnUploader } from "@/app/handoff/ReturnUploader";
import { LanguageSwitch, useLanguage } from "@/app/i18n/language";
import { UiId } from "@/app/shared/UiId";
import { t } from "@/core/i18n/keyed";

/**
 * C-1 signed-in return page (/retur): for files that came back without the link. The file is recognized only
 * by the embedded hand-off marker (PSD XMP, PNG text, WAV bext/iXML), never by its name.
 */
export const Route = createFileRoute("/retur")({
  head: () => ({ meta: [
    { title: t("c1.return.page-title") },
    { name: "description", content: t("c1.return.page-description-signed") },
    { property: "og:title", content: t("c1.return.page-title") }, // i18n-ignore: metakode
    { property: "og:description", content: t("c1.return.page-description-signed") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
    { name: "robots", content: "noindex, nofollow" }, // i18n-ignore: metakode
  ] }),
  component: SignedInReturn,
});

function SignedInReturn() {
  useLanguage();
  const session = useSession();
  if (session.status === "loading") return null;
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <main className="min-h-screen bg-bg-app p-4 text-text-primary">
      <div className="mx-auto max-w-[560px] space-y-4">
        <div className="flex justify-end"><LanguageSwitch compact /></div>
        <h1 className="text-lg font-semibold">{t("c1.return.title")}</h1>
        <p className="text-sm">{t("c1.return.signed-intro")}</p>
        <ReturnUploader token={null} />
        <UiId id="V-182" page />
      </div>
    </main>
  );
}
