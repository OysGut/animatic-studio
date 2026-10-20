/**
 * Varsel når tekstendringer ble avvist (KI-182, REQ-0522, UX-prinsipp P9 og P13): hver tekst brukeren skrev,
 * vises og kan kopieres, og en manuslinje kan legges oppå siste versjon med «Prøv igjen med min tekst».
 * Også tekst som ikke ble sendt fordi en tidligere endring feilet, tas vare på. Ved en konflikt vises den
 * andres tekst slik den står nå, før brukeren velger. Ingenting av den andres endring overskrives i stillhet.
 */
import { Check, Copy, RotateCcw, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { L } from "@/core";
import type { RejectedEdit } from "./use-commands";
import { copyText } from "./clipboard";
import { t } from "@/core/i18n/keyed";

/** Det varselet trenger fra useCommands. */
export interface RejectedTextSource {
  readonly rejected: readonly RejectedEdit[];
  readonly dismissRejected: (id?: string) => void;
  readonly retryRejected: (id?: string) => Promise<string | null>;
  /** Teksten som står i linjen nå (den andres versjon), eller null. */
  readonly currentTextOf?: (r: RejectedEdit) => string | null;
}

export function RejectedTextNotice({ cmds }: { cmds: RejectedTextSource }) {
  if (cmds.rejected.length === 0) return null;
  return (
    <div className="flex max-h-[40vh] shrink-0 flex-col overflow-y-auto">
      {cmds.rejected.map((r) => (
        <RejectedItem key={r.id} r={r} cmds={cmds} />
      ))}
    </div>
  );
}

function intro(r: RejectedEdit): string {
  if (r.conflict)
    return t("app-project-rejected-text-notice.intro.message.54438cd4c696");
  if (r.skipped)
    return t("app-project-rejected-text-notice.intro.message.1ea2cc01d541");
  return t("app-project-rejected-text-notice.intro.message.a281a928a65e");
}

function RejectedItem({ r, cmds }: { r: RejectedEdit; cmds: RejectedTextSource }) {
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Den andres tekst slik den står nå (bare når den er en annen enn din)
  const current = cmds.currentTextOf?.(r) ?? null;
  const theirs = current !== null && current !== r.text ? current : null;
  return (
    <section
      role="alert"
      aria-label={t("app-project-rejected-text-notice.rejected-item.aria-label.1bedc520ab11")}
      className="flex shrink-0 flex-col gap-1.5 border-b border-status-uncertain/40 bg-status-uncertain-bg px-3 py-2 text-xs"
    >
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-status-uncertain" aria-hidden />
        <p className="min-w-0 flex-1 text-text-primary">
          {r.label ? <span className="font-medium">{r.label}: </span> : null}
          {intro(r)}
        </p>
        <button
          type="button"
          onClick={() => cmds.dismissRejected(r.id)}
          aria-label={t("app-project-rejected-text-notice.rejected-item.aria-label.1d653eb5ba10")}
          title={t("app-project-rejected-text-notice.rejected-item.title.798f938c56f7")}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-3 hover:text-text-primary"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <blockquote
        aria-label={t("app-project-rejected-text-notice.rejected-item.aria-label.2fe8d352639e")}
        className="ml-5 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-sm border border-border bg-surface-2 px-2 py-1 font-mono text-[12px] text-text-primary"
      >
        {r.text}
      </blockquote>
      {theirs !== null && r.retryable ? (
        <>
          <p className="ml-5 text-text-secondary">
            {t("app-project-rejected-text-notice.rejected-item.p.b2ff90f9a0ce")}
          </p>
          <blockquote
            aria-label={t("app-project-rejected-text-notice.rejected-item.aria-label.bd30935b718a")}
            className="ml-5 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-sm border border-border bg-surface-1 px-2 py-1 font-mono text-[12px] text-text-secondary"
          >
            {theirs}
          </blockquote>
        </>
      ) : null}
      <div className="ml-5 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => setCopied((await copyText(r.text)) ? "ok" : "failed")}
          title={t("app-project-rejected-text-notice.rejected-item.title.59968396734c")}
        >
          {copied === "ok" ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied === "ok" ? t("app-project-rejected-text-notice.rejected-item.button.d9e0a43c813d") : t("app-project-rejected-text-notice.rejected-item.button.1be1638838ef")}
        </Button>
        {r.retryable ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                setError(await cmds.retryRejected(r.id));
              } finally {
                setBusy(false);
              }
            }}
            title={t("app-project-rejected-text-notice.rejected-item.title.97f9df50a2cf")}
          >
            <RotateCcw aria-hidden />
            {t("app-project-rejected-text-notice.rejected-item.button.325ef5f51448")}
          </Button>
        ) : null}
        {copied === "failed" ? (
          <span className="text-status-danger">
            {t("app-project-rejected-text-notice.rejected-item.span.cbcc0a024b75")}
          </span>
        ) : null}
        {error ? <span className="text-status-danger">{error}</span> : null}
      </div>
    </section>
  );
}
