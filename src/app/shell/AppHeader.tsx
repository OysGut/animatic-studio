import { Link, useParams } from "@tanstack/react-router";
import { LogOut, Shield, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { signOut } from "@/adapters/browser/auth";
import { Button } from "@/components/ui/button";
import { BackButton } from "./back-navigation";
import { ShortcutsButton, ShortcutsDialog } from "@/app/shortcuts/ShortcutsDialog";
import { LanguageSwitch } from "@/app/i18n/language";
import { L } from "@/core";
import { GenerationStatus } from "@/app/ai/GenerationStatus";
import { AccountWatcher, useMyAccount } from "@/app/account/use-account";

interface AppHeaderProps {
  readonly email?: string | undefined;
  readonly trail?: ReactNode;
}

/** Smal toppstripe (40 px). Ordmerke som tekst – ingen dekor (DESIGN_SYSTEM §1). */
export function AppHeader({ email, trail }: AppHeaderProps) {
  // Hurtigtastoversikt tilgjengelig overalt (UX-gjennomgang DEC-0076/0078)
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Inne i et prosjekt: status for AI-genereringene (DEC-0085)
  const params = useParams({ strict: false }) as { projectId?: string };
  // Min konto og adminsiden (DEC-0086)
  const account = useMyAccount(!!email);
  return (
    <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-surface-1 px-4">
      <Link
        to="/"
        className="text-[13px] font-semibold tracking-[0.02em] text-text-primary hover:text-accent-brand"
      >
        Animatic Studio
      </Link>
      <BackButton />
      {trail ? (
        <>
          <span aria-hidden className="text-text-tertiary">
            /
          </span>
          <div className="min-w-0 truncate text-[13px] text-text-secondary">{trail}</div>
        </>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {params.projectId ? <GenerationStatus projectId={params.projectId} /> : null}
        <LanguageSwitch compact />
        <ShortcutsButton onClick={() => setShortcutsOpen(true)} />
        {/* i18n-ignore: gruppe-ID for hurtigtaster, ikke synlig tekst */}
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} current="alle" />
        {email ? <AccountWatcher /> : null}
        {email && account.data?.isAdmin ? (
          <Link
            to="/admin"
            data-testid="header-admin"
            className="flex h-7 items-center gap-1 rounded-sm px-2 text-xs text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title={L(
              "Administrasjon: brukere, prosjekter og personvern",
              "Administration: users, projects and privacy",
            )}
          >
            <Shield className="size-3.5" aria-hidden />
            <span className="hidden md:inline">{L("Admin", "Admin")}</span>
          </Link>
        ) : null}
        {email ? (
          <Link
            to="/konto"
            data-testid="header-account"
            className="flex h-7 max-w-[220px] items-center gap-1.5 rounded-sm px-2 text-xs text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title={L(
              "Min konto: språk, passord, AI-forbruk og personvern",
              "My account: language, password, AI usage and privacy",
            )}
          >
            <UserRound className="size-3.5 shrink-0" aria-hidden />
            <span className="hidden truncate sm:inline">{account.data?.displayName || email}</span>
          </Link>
        ) : null}
        {email ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void signOut()}
            aria-label={L("Logg ut", "Sign out")}
            title={L("Logg ut", "Sign out")}
          >
            <LogOut />
            <span>{L("Logg ut", "Sign out")}</span>
          </Button>
        ) : null}
      </div>
    </header>
  );
}
