/**
 * «Hent videoen igjen» for en videojobb merket «Betalt, ikke lagret» (DEC-0086). Spør leverandøren på nytt
 * med jobb-ID-en; ingenting bestilles på nytt, så det koster ikke noe.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCw } from "lucide-react";
import { L, tm, type GenerationJob } from "@/core";
import { refetchVideoJob } from "@/adapters/ai/video.functions";
import { aiJobsKey } from "./use-ai-jobs";
import { Button } from "@/components/ui/button";

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
          L(
            "Leverandøren lager den fortsatt; den hentes inn når den er ferdig.",
            "The provider is still making it; it is fetched when finished.",
          ),
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
        title={L(
          "Spør leverandøren om den ferdige videoen på nytt. Ingenting bestilles på nytt, så det koster ikke noe.",
          "Ask the provider for the finished video again. Nothing is ordered again, so it costs nothing.",
        )}
      >
        {busy ? <Loader2 className="animate-spin" /> : <RotateCw />}
        {L("Hent videoen igjen", "Fetch the video again")}
      </Button>
      {msg ? <span className="text-[11px] text-text-secondary">{msg}</span> : null}
    </span>
  );
}
