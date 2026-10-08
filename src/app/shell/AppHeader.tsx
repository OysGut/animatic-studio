import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface AppHeaderProps {
  readonly email?: string | undefined;
  readonly trail?: ReactNode;
}

/** Smal toppstripe (40 px). Ordmerke som tekst – ingen dekor (DESIGN_SYSTEM §1). */
export function AppHeader({ email, trail }: AppHeaderProps) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-surface-1 px-4">
      <Link
        to="/"
        className="text-[13px] font-semibold tracking-[0.02em] text-text-primary hover:text-accent-brand"
      >
        Animatic Studio
      </Link>
      {trail ? (
        <>
          <span aria-hidden className="text-text-tertiary">
            /
          </span>
          <div className="min-w-0 truncate text-[13px] text-text-secondary">{trail}</div>
        </>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {email ? (
          <span className="hidden text-xs text-text-tertiary sm:inline">{email}</span>
        ) : null}
        {email ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void supabase.auth.signOut()}
            aria-label="Logg ut"
            title="Logg ut"
          >
            <LogOut />
            <span>Logg ut</span>
          </Button>
        ) : null}
      </div>
    </header>
  );
}
