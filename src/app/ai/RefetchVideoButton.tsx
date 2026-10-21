/**
 * «Hent videoen igjen» for en videojobb merket «Betalt, ikke lagret» (DEC-0086). Spør leverandøren på nytt
 * med jobb-ID-en; ingenting bestilles på nytt, så det koster ikke noe.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCw } from "lucide-react";
import { tm, type GenerationJob } from "@/core";
import { refetchVideoJob } from "@/adapters/ai/video.functions";
import { aiJobsKey } from "./use-ai-jobs";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";

/** Kan jobben hentes på nytt? */
export function canRefetchVideo(j: GenerationJob | null | undefined): boolean {
  return !!j && j.kind === "video" && j.status === "lost" && !!j.externalId;
}

export function RefetchVideoButton({
  projectId,
  job,
  size = "sm",
}: {
  projectId: string;
  job: GenerationJob;
  size?: "sm" | "xs";
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await refetchVideoJob({ data: { projectId, jobId: job.id } });
      if (r.state === "failed") setMsg(tm(r.message));
      else if (r.state === "running")
        setMsg(
          t("app-ai-refetch-video-button.go.set-msg.0ed74b029be8"),
        );
    } catch (e) {
      setMsg(tm((e as Error).message));
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    }
  }
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Button
        size="sm"
        variant="secondary"
        className={size === "xs" ? "h-6 px-2 text-[11px]" : undefined}
        disabled={busy}
        onClick={() => void go()}
        data-testid="refetch-video"
        title={t("app-ai-refetch-video-button.refetch-video-button.title.66b34691db69")}
      >
        {busy ? <Loader2 className="animate-spin" /> : <RotateCw />}
        {t("app-ai-refetch-video-button.refetch-video-button.button.19b9fa1a5058")}
      </Button>
      {msg ? <span className="text-[11px] text-text-secondary">{msg}</span> : null}
    </span>
  );
}
