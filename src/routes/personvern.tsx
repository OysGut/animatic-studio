import { createFileRoute, Link } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AppHeader } from "@/app/shell/AppHeader";
import { LanguageSwitch, useLanguage } from "@/app/i18n/language";
import { PrivacyStatement } from "@/app/account/PrivacyStatement";
import { usePrivacyPolicy } from "@/app/account/use-account";
import { L } from "@/core";
import { t } from "@/core/i18n/keyed";

/** Personvernerklæringen (DEC-0086): kan leses uten innlogging, fra forsiden og fra kontosiden. */
export const Route = createFileRoute("/personvern")({
  head: () => ({ meta: [
    { title: t("routes-personvern.title.title.c03602ed60a1") },
    { name: "description", content: t("routes-personvern.content.content.c2cd1c6e5143") },
    { property: "og:title", content: t("routes-personvern.content.content.87755ed805a8") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-personvern.content.content.c2cd1c6e5143.2") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const session = useSession();
  const policy = usePrivacyPolicy();
  return (
    <div className="flex min-h-screen flex-col bg-bg-app">
      {session.status === "signed-in" ? (
        <AppHeader email={session.session.user.email} trail={t("routes-personvern.privacy-page.trail.5e18a18818de")} />
      ) : (
        <header className="flex h-10 items-center gap-3 border-b border-border bg-surface-1 px-4">
          <Link
            to="/"
            className="text-[13px] font-semibold text-text-primary hover:text-accent-brand"
          >
            Animatic Studio
          </Link>
          <div className="ml-auto">
            <LanguageSwitch compact />
          </div>
        </header>
      )}
      <main className="mx-auto w-full max-w-[760px] px-6 py-8">
        {policy.isLoading ? (
          <p className="text-sm text-text-tertiary">{t("routes-personvern.privacy-page.p.c061de21bb96")}</p>
        ) : (
          <PrivacyStatement policy={policy.data ?? null} />
        )}
        <Link
          to="/"
          className="mt-8 inline-block text-[13px] text-accent-brand underline-offset-2 hover:underline"
        >
          {session.status === "signed-in"
            ? t("routes-personvern.privacy-page.link.591dcf692023")
            : t("routes-personvern.privacy-page.link.27b98f24370c")}
        </Link>
      </main>
    </div>
  );
}
