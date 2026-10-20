/**
 * U5 (punkt 8): felles tomme tilstander, lastetilstander (skjelett) og feilmeldinger i samme stil på alle
 * skjermene. Bare utseende; teksten sendes inn av skjermen (med L()), så eksisterende tekster beholdes.
 */
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";

/** Lite, tokenfarget filmruteillustrasjon for tomme tilstander (ingen bildefil, følger temaet). */
export function EmptyIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 64" aria-hidden className={cn("h-16 w-24", className)} data-testid="empty-illustration">
      <rect x="4" y="8" width="88" height="48" rx="3" className="fill-surface-2 stroke-border-control" strokeWidth="1.5" />
      {[12, 28, 44, 60, 76].map((x) => (
        <rect key={`t${x}`} x={x} y="11" width="8" height="4" rx="1" className="fill-surface-3" />
      ))}
      {[12, 28, 44, 60, 76].map((x) => (
        <rect key={`b${x}`} x={x} y="49" width="8" height="4" rx="1" className="fill-surface-3" />
      ))}
      <path d="M40 24 L58 32 L40 40 Z" className="fill-accent-brand" opacity="0.85" />
    </svg>
  );
}

export function EmptyState({
  title,
  hint,
  action,
  className,
  compact,
  ...rest
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
  "data-testid"?: string;
}) {
  return (
    <div
      data-testid={rest["data-testid"] ?? "screen-empty"}
      className={cn(
        "flex flex-col items-center justify-center gap-2 border border-dashed border-border-control bg-surface-1 text-center",
        compact ? "px-3 py-5" : "px-4 py-10",
        className,
      )}
    >
      {compact ? null : <EmptyIllustration />}
      <div className="text-[13px] text-text-secondary">{title}</div>
      {hint ? <div className="max-w-md text-xs text-text-tertiary">{hint}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/** Skjelett med en tilgjengelig statustekst (skjermlesere hører teksten, seende ser skjelettet). */
export function LoadingState({
  label,
  rows = 3,
  variant = "rows",
  className,
}: {
  label: ReactNode;
  rows?: number;
  variant?: "rows" | "cards";
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" data-testid="screen-loading" className={cn("w-full", className)}>
      <span className="sr-only">{label}</span>
      <div aria-hidden className={variant === "cards" ? "grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3" : "flex flex-col gap-2"}>
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className={cn(
              "animate-pulse rounded-sm border border-border bg-surface-2",
              variant === "cards" ? "h-40" : "h-12",
            )}
          />
        ))}
      </div>
      <p aria-hidden className="mt-2 text-xs text-text-tertiary">{label}</p>
    </div>
  );
}

export function ErrorState({
  message,
  detail,
  onRetry,
  className,
}: {
  message: ReactNode;
  detail?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      data-testid="screen-error"
      className={cn("flex items-start gap-3 border border-status-danger/50 bg-status-danger-bg px-4 py-3", className)}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-status-danger">{message}</div>
        {detail ? <div className="mt-1 text-xs text-text-tertiary">{detail}</div> : null}
      </div>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {t("app-shell-screen-states.error-state.button.9bfe1dbb8700")}
        </Button>
      ) : null}
    </div>
  );
}
