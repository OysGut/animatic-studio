import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { AppHeader } from "@/app/shell/AppHeader";
import { ConnectorConsent, type ConsentSearch } from "@/app/account/ConnectorConsent";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : undefined);

/** C-0: godkjenning av eksterne programmer (PKCE og enhetskode). Innlogging skjer på samme adresse. */
export const Route = createFileRoute("/koble")({
  validateSearch: (s: Record<string, unknown>): ConsentSearch => {
    const out: Record<string, string> = {};
    for (const [k, max] of [["client_id", 64], ["redirect_uri", 500], ["code_challenge", 43], ["code_challenge_method", 10], ["scope", 300], ["state", 500], ["user_code", 9]] as const) {
      const v = str(s[k], max); if (v !== undefined) out[k] = v;
    }
    return out as ConsentSearch;
  },
  head: () => ({ meta: [
    { title: t("c0.consent.page-title") },
    { name: "description", content: t("c0.consent.page-description") },
    { property: "og:title", content: t("c0.consent.page-title") }, // i18n-ignore: metakode
    { property: "og:description", content: t("c0.consent.page-description") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
    { name: "robots", content: "noindex, nofollow" }, // i18n-ignore: metakode
    { name: "referrer", content: "no-referrer" }, // i18n-ignore: metakode
  ] }),
  component: ConnectRoute,
});

function ConnectRoute() {
  useLanguage();
  const session = useSession();
  const search = Route.useSearch();
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  // Innloggingen vises på samme URL, så PKCE-parametrene og enhetskoden beholdes.
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <div className="flex min-h-screen flex-col bg-bg-app">
      <AppHeader email={session.session.user.email} trail={t("c0.consent.trail")} />
      <ConnectorConsent search={search} email={session.session.user.email ?? ""} />
    </div>
  );
}
