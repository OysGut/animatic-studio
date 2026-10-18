import { createFileRoute, Link } from "@tanstack/react-router";
import { useSession } from "@/app/auth/use-session";
import { AppHeader } from "@/app/shell/AppHeader";
import { LanguageSwitch } from "@/app/i18n/language";
import { PrivacyStatement } from "@/app/account/PrivacyStatement";
import { usePrivacyPolicy } from "@/app/account/use-account";
import { L } from "@/core";

/** Personvernerklæringen (DEC-0086): kan leses uten innlogging, fra forsiden og fra kontosiden. */
export const Route = createFileRoute("/personvern")({
  head: () => ({ meta: [
    { title: L("Personvern – Animatic Studio", "Privacy – Animatic Studio") },
    { name: "description", content: L("Les personvernerklæringen for Animatic Studio.", "Read the privacy statement for Animatic Studio.") },
    { property: "og:title", content: L("Personvern – Animatic Studio", "Privacy – Animatic Studio") }, // i18n-ignore: metakode
    { property: "og:description", content: L("Les personvernerklæringen for Animatic Studio.", "Read the privacy statement for Animatic Studio.") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const session = useSession();
  const policy = usePrivacyPolicy();
  return (
    <div className="flex min-h-screen flex-col bg-bg-app">
      {session.status === "signed-in" ? (
        <AppHeader email={session.session.user.email} trail={L("Personvern", "Privacy")} />
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
          <p className="text-sm text-text-tertiary">{L("Henter …", "Loading …")}</p>
        ) : (
          <PrivacyStatement policy={policy.data ?? null} />
        )}
        <Link
          to="/"
          className="mt-8 inline-block text-[13px] text-accent-brand underline-offset-2 hover:underline"
        >
          {session.status === "signed-in"
            ? L("Til prosjektlisten", "To the project list")
            : L("Til innloggingen", "To sign-in")}
        </Link>
      </main>
    </div>
  );
}
