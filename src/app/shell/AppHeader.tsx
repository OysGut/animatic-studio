import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { Globe, LogOut, Shield, UserRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { signOut } from "@/adapters/browser/auth";
import { Button } from "@/components/ui/button";
import { BackButton, useCloseToPrevious } from "./back-navigation";
import { ShortcutsButton, ShortcutsDialog } from "@/app/shortcuts/ShortcutsDialog";
import { CompactLanguageSwitch } from "@/app/i18n/language";

import { GenerationStatus } from "@/app/ai/GenerationStatus";
import { TaskNav } from "./TaskNav";
import { BookmarkMenu } from "./BookmarkMenu";
import { AccountWatcher, useMyAccount } from "@/app/account/use-account";
import { ScriptExplorerPanel } from "@/app/script-explorer/ScriptExplorerPanel";
import { t } from "@/core/i18n/keyed";

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
  // Klikk på brukernavnet igjen på «Min konto» lukker siden (tilbake dit man kom fra)
  const onAccount = useRouterState({ select: (s) => s.location.pathname }) === "/konto";
  const closeAccount = useCloseToPrevious();
  const [explorerOpen, setExplorerOpen] = useState(false);
  useEffect(() => {
    if (!params.projectId) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") { e.preventDefault(); setExplorerOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [params.projectId]);
  return (
    <header className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-surface-1 px-4">
      <Link
        to="/"
        className="text-[13px] font-semibold tracking-[0.02em] text-text-primary hover:text-accent-brand"
      >
        From Pen to Glass
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
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {params.projectId ? <Button variant="ghost" size="icon" data-testid="script-explorer-button" title={t("app-shell-app-header.app-header.title.226fbea0a428")} aria-label={t("app-shell-app-header.app-header.aria-label.226fbea0a428")} onClick={() => setExplorerOpen(true)}><Globe className="size-4" /></Button> : null}
        {params.projectId && email ? <BookmarkMenu projectId={params.projectId} /> : null}
        {params.projectId ? <TaskNav projectId={params.projectId} /> : null}
        {params.projectId ? <GenerationStatus projectId={params.projectId} /> : null}
        <CompactLanguageSwitch />
        <ShortcutsButton onClick={() => setShortcutsOpen(true)} />
        {/* i18n-ignore: gruppe-ID for hurtigtaster, ikke synlig tekst */}
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} current="alle" />
        {email ? <AccountWatcher /> : null}
        {email && account.data?.isAdmin ? (
          <Link
            to="/admin"
            data-testid="header-admin"
            className="flex h-7 items-center gap-1 rounded-sm px-2 text-xs text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title={t("app-shell-app-header.app-header.title.bbf114892f89")}
          >
            <Shield className="size-3.5" aria-hidden />
            <span className="hidden md:inline">{t("app-shell-app-header.app-header.span.d9df6d2f7af1")}</span>
          </Link>
        ) : null}
        {email ? (
          <Link
            to="/konto"
            onClick={(e) => {
              if (!onAccount) return;
              e.preventDefault();
              closeAccount();
            }}
            aria-current={onAccount ? "page" : undefined}
            data-testid="header-account"
            className={
              "flex h-7 max-w-[220px] items-center gap-1.5 rounded-sm px-2 text-xs hover:bg-surface-3 hover:text-text-primary " +
              (onAccount ? "bg-accent-selection text-text-primary" : "text-text-secondary")
            }
            title={
              onAccount
                ? t("app-shell-app-header.app-header.title.1edf5c4e8789")
                : t("app-shell-app-header.app-header.title.13b0f7b3c913")
            }
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
            aria-label={t("app-shell-app-header.app-header.aria-label.23c7aa0a7071")}
            title={t("app-shell-app-header.app-header.title.23c7aa0a7071")}
          >
            <LogOut />
            <span>{t("app-shell-app-header.app-header.span.23c7aa0a7071")}</span>
          </Button>
        ) : null}
      </div>
      {params.projectId && explorerOpen ? <ScriptExplorerPanel key={params.projectId} projectId={params.projectId} onClose={() => setExplorerOpen(false)} /> : null}
    </header>
  );
}
