import { useMemo, useState } from "react";
import { L } from "@/core";
import { errorReport } from "./error-report";

/** «Vis teknisk feilmelding» med kopiering, så brukeren kan sende feilen videre (DEC-0091). */
export function ErrorDetails({ error }: { error: unknown }) {
  const report = useMemo(
    () => errorReport(error, typeof window === "undefined" ? "" : window.location.href, new Date()),
    [error],
  );
  const [copied, setCopied] = useState(false);
  return (
    <details className="mt-6 text-left">
      <summary className="cursor-pointer text-center text-xs text-muted-foreground hover:text-foreground">
        {L("Vis teknisk feilmelding", "Show technical error message")}
      </summary>
      <pre
        aria-label={L("Teknisk feilmelding", "Technical error message")}
        className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-input bg-muted p-3 font-mono text-[11px] text-foreground"
      >
        {report}
      </pre>
      <div className="mt-2 flex justify-center">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(report)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          {copied ? L("Kopiert", "Copied") : L("Kopier feilmeldingen", "Copy the error message")}
        </button>
      </div>
    </details>
  );
}
