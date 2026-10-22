/** Rigg R5: skriv inn den korte koden fra en utskrift (prosjektsiden og telefonen). */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { normalizeShortCode } from "@/core/print/job";
import { t } from "@/core/i18n/keyed";
import { Button } from "@/components/ui/button";
import { resolveCopyCode } from "./copy-lookup";

export function CopyCodeEntry({ projectId }: { projectId?: string }) {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const valid = normalizeShortCode(code) !== null;
  const go = async () => {
    setBusy(true);
    setFailed(false);
    const d = await resolveCopyCode(code, projectId).catch(() => null);
    setBusy(false);
    if (!d) return setFailed(true);
    void navigate({ to: "/prosjekt/$projectId/scene", params: { projectId: d.projectId }, search: { scene: d.occurrenceId, at: d.frame, lag: d.layerId } });
  };
  return (
    <form
      data-testid="copy-code-entry"
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) void go();
      }}
    >
      <label className="text-[13px] text-text-secondary">
        {t("print-job.code-label")}
        <input
          data-testid="copy-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={12}
          className="ml-2 w-32 rounded border border-border bg-surface-3 p-1 font-mono uppercase text-text-primary"
        />
      </label>
      <Button type="submit" data-testid="copy-code-go" disabled={!valid || busy}>
        {t("print-job.code-open")}
      </Button>
      {failed && (
        <p role="alert" data-testid="copy-code-failed" className="w-full text-[13px] text-status-danger">
          {t("print-job.code-unknown")}
        </p>
      )}
    </form>
  );
}
