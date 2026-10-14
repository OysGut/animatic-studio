/**
 * Undertekster for filmen (M7 del 2, DEC-0058, REQ-0351/0352): replikkene med tiden de har i filmen, på
 * norsk eller et oversatt språk, som SubRip (.srt) eller WebVTT (.vtt). Språket velges uavhengig av manusets
 * visningsspråk.
 */
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { L, LANGUAGE_LABEL, subtitleCues, toSrt, toVtt, type ProjectState } from "@/core";
import { prepareDownload, type ReadyFile } from "@/app/download";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRecordExport } from "@/app/projects/use-history-records";

const control =
  "h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

export function SubtitleDialog({
  state,
  productionId,
  open,
  onOpenChange,
}: {
  state: ProjectState;
  productionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [lang, setLang] = useState("nb");
  const [format, setFormat] = useState<"srt" | "vtt">("srt");
  const [ready, setReady] = useState<ReadyFile | null>(null);
  // Eksportloggen (REQ-0037, DEC-0078)
  const recordExport = useRecordExport(state.project.id);
  const result = useMemo(
    () => (open ? subtitleCues(state, productionId, lang) : { cues: [], missing: 0 }),
    [open, state, productionId, lang],
  );
  // i18n-ignore: filnavn
  const name = `${state.productions[productionId]?.name ?? state.project.name} – undertekster ${lang}.${format}`;

  function download() {
    const text = format === "srt" ? toSrt(result.cues) : toVtt(result.cues);
    setReady(
      prepareDownload(
        new TextEncoder().encode(text),
        name.replace(/[\\/:*?"<>|]+/g, "-"),
        format === "srt" ? "application/x-subrip" : "text/vtt",
      ),
    );
    recordExport({
      productionId,
      kind: "subtitles",
      fileName: name.replace(/[\\/:*?"<>|]+/g, "-"),
      settings: { format, language: lang },
      occurrenceIds: [],
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReady(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-[480px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>{L("Undertekster", "Subtitles")}</DialogTitle>
          <DialogDescription>
            {L(
              "Replikkene med tiden de har i filmen (koblet lyd eller anslått etter tekstmengden).",
              "The lines with the time they have in the film (linked audio, or estimated from the amount of text).",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-tertiary">
            {L("Språk", "Language")}
            <select
              value={lang}
              onChange={(e) => {
                setLang(e.target.value);
                setReady(null);
              }}
              className={control}
            >
              {Object.entries(LANGUAGE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-tertiary">
            Format
            <select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value as "srt" | "vtt");
                setReady(null);
              }}
              className={control}
            >
              <option value="srt">SubRip (.srt)</option>
              <option value="vtt">WebVTT (.vtt)</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-text-secondary">
          {L(`${result.cues.length} undertekster.`, `${result.cues.length} subtitles.`)}
          {result.missing
            ? L(
                ` ${result.missing} replikker er ikke oversatt og tas ikke med.`,
                ` ${result.missing} lines are not translated and are left out.`,
              )
            : ""}
        </p>
        {ready ? (
          <a href={ready.url} download={ready.name} className="text-xs text-accent-brand underline">
            {L("Last ned", "Download")} {ready.name}
          </a>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {L("Lukk", "Close")}
          </Button>
          <Button onClick={download} disabled={result.cues.length === 0}>
            <Download />
            {L("Last ned", "Download")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
