import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { returnInfo } from "@/adapters/handoff/handoff.functions";
import { ReturnUploader } from "@/app/handoff/ReturnUploader";
import { LanguageSwitch, useLanguage } from "@/app/i18n/language";
import { UiId } from "@/app/shared/UiId";
import { t } from "@/core/i18n/keyed";

/**
 * C-1 return page with a short-lived token (no account), like /m/$token. The token only allows returning a
 * file for its own hand-off; the result is always a new candidate version that the team approves.
 */
export const Route = createFileRoute("/r/$token")({
  head: () => ({ meta: [
    { title: t("c1.return.page-title") },
    { name: "description", content: t("c1.return.page-description") },
    { property: "og:title", content: t("c1.return.page-title") }, // i18n-ignore: metakode
    { property: "og:description", content: t("c1.return.page-description") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
    { name: "robots", content: "noindex, nofollow" }, // i18n-ignore: metakode
    { name: "referrer", content: "no-referrer" }, // i18n-ignore: metakode
  ] }),
  component: ReturnRoute,
});

function ReturnRoute() {
  useLanguage();
  const { token } = Route.useParams();
  const info = useServerFn(returnInfo);
  const q = useQuery({ queryKey: ["handoff-return", token], queryFn: () => info({ data: { token } }), retry: false });
  return (
    <main className="min-h-screen bg-bg-app p-4 text-text-primary">
      <div className="mx-auto max-w-[560px] space-y-4">
        <div className="flex justify-end"><LanguageSwitch compact /></div>
        <h1 className="text-lg font-semibold">{t("c1.return.title")}</h1>
        {q.isLoading ? <p role="status">{t("c1.return.loading")}</p> : q.isError || !q.data ? (
          <p role="alert" data-testid="return-unavailable" className="text-sm text-destructive">{t("c1.return.err-unavailable")}</p>
        ) : (
          <>
            <p className="text-sm" data-testid="return-info">{t("c1.return.for", { file: q.data.fileName })}</p>
            <p className="text-xs text-muted-foreground">{t("c1.send.expires", { date: new Date(q.data.expiresAt).toLocaleString() })}</p>
            <ReturnUploader token={token} />
          </>
        )}
        <UiId id="V-181" page />
      </div>
    </main>
  );
}
