import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { LanguageSwitch, useLanguage } from "@/app/i18n/language";
import { CopyCodeEntry } from "@/app/print/CopyCodeEntry";
import { resolveCopyCode } from "@/adapters/browser/copy-lookup";
import { t } from "@/core/i18n/keyed";

/**
 * Rigg R5 (B-087 §1 punkt 10): QR-koden på en utskrevet figur. Etter innlogging slås koden opp, og brukeren
 * lander i riktig prosjekt, scene og frame med laget valgt. Ukjent kode eller manglende tilgang gir en nøytral side.
 */
export const Route = createFileRoute("/k/$code")({
  head: () => ({ meta: [
    { title: t("print-job.route-title") },
    { name: "description", content: t("print-job.route-description") },
    { property: "og:title", content: t("print-job.route-title") }, // i18n-ignore: metakode
    { property: "og:description", content: t("print-job.route-description") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
    { name: "robots", content: "noindex, nofollow" }, // i18n-ignore: metakode
    { name: "referrer", content: "no-referrer" }, // i18n-ignore: metakode
  ] }),
  component: CopyRoute,
});

function CopyRoute() {
  useLanguage(); // ML2a
  const { code } = Route.useParams();
  const session = useSession();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (session.status !== "signed-in") return;
    let alive = true;
    void resolveCopyCode(code)
      .catch(() => null)
      .then((d) => {
        if (!alive) return;
        if (!d) return setFailed(true);
        void navigate({ to: "/prosjekt/$projectId/scene", params: { projectId: d.projectId }, search: { scene: d.occurrenceId, at: d.frame, lag: d.layerId }, replace: true });
      });
    return () => {
      alive = false;
    };
  }, [session.status, code, navigate]);
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-app px-4">
      <LanguageSwitch compact />
      {failed ? (
        <>
          <p role="alert" data-testid="copy-route-failed" className="text-[13px] text-text-secondary">
            {t("print-job.code-unknown")}
          </p>
          <CopyCodeEntry />
        </>
      ) : (
        <p role="status" className="text-[13px] text-text-secondary">
          {t("print-job.code-opening")}
        </p>
      )}
    </main>
  );
}
