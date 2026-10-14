/**
 * Språkversjon av filmen (M7 del 3, DEC-0059, REQ-0341–0347): status scene for scene – oversatte replikker,
 * dialoglyd i språket, materialtype og råd om leppesynk, importert film med blandet lyd, og timingkonflikter
 * med forslag. Bare råd: ingenting lages på nytt automatisk, og hovedfilmen endres ikke. Forslaget «start
 * tidligere» flytter bare språkets eget lydklipp.
 */
import { AlertTriangle, CheckCircle2, Info, Play } from "lucide-react";
import { useMemo } from "react";
import {
  L,
  LANGUAGE_LABEL,
  MATERIAL_LABEL,
  audioClipFieldsOf,
  formatHeading,
  languageReport,
  locale,
  type Command,
  type ProjectState,
  type TimingConflict,
  languageWord,
} from "@/core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const sec = (ms: number) => `${(Math.round(ms / 100) / 10).toLocaleString(locale())} s`;

export function LanguageVersionDialog({
  open,
  onOpenChange,
  state,
  productionId,
  language,
  editable,
  run,
  onSeek,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  productionId: string;
  /** Språkversjonen som vurderes (ikke hovedspråket). */
  language: string;
  editable: boolean;
  run: (command: Command, label: string) => boolean;
  /** Gå til et sted i en scene (ms fra scenens start). */
  onSeek: (occurrenceId: string, ms: number) => void;
}) {
  const report = useMemo(
    () => (open ? languageReport(state, productionId, language) : []),
    [open, state, productionId, language],
  );
  const name = LANGUAGE_LABEL[language] ?? language;
  const lines = report.reduce((a, r) => a + r.lines, 0);
  const translated = report.reduce((a, r) => a + r.translated, 0);
  const voiced = report.reduce((a, r) => a + r.withAudio, 0);
  const conflicts = report.reduce(
    (a, r) => a + r.conflicts.filter((c) => c.kind === "long").length,
    0,
  );
  const mixed = report.filter((r) => r.mixedDialogue).length;
  const lipsync = report.filter((r) => r.lines > 0 && r.advice.action !== "direct").length;
  const shown = report.filter((r) => r.lines > 0 || r.mixedDialogue || r.conflicts.length > 0);

  function applyEarlier(c: TimingConflict, clipId: string, offsetMs: number) {
    const a = state.audioClips[clipId];
    if (!a) return;
    run(
      {
        type: "UpdateAudioClips",
        clips: [{ clipId: a.id, fields: { ...audioClipFieldsOf(a), offsetMs } }],
      },
      L(`Flytt ${name.toLowerCase()} replikk`, `Move ${name} line`),
    );
    onSeek(c.occurrenceId, offsetMs);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[860px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>
            {L("Språkversjon", "Language version")}: {name}
          </DialogTitle>
          <DialogDescription>
            {L(
              `Samme film, scener og bilder som den norske. Her ser du hva som mangler eller må sjekkes i den ${name.toLowerCase()}e versjonen. Ingenting lages på nytt automatisk, og hovedfilmens timing endres ikke.`,
              `The same film, scenes and images as the Norwegian one. Here you can see what is missing or needs checking in the ${name} version. Nothing is regenerated automatically, and the timing of the main film is not changed.`,
            )}
          </DialogDescription>
        </DialogHeader>
        <ul
          aria-label={L("Sammendrag", "Summary")}
          className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3"
        >
          <Summary
            ok={translated === lines}
            text={L(
              `${translated} av ${lines} replikker oversatt`,
              `${translated} of ${lines} lines translated`,
            )}
          />
          <Summary
            ok={voiced === lines}
            neutral={voiced === 0}
            text={L(
              `${voiced} av ${lines} replikker med ${name.toLowerCase()} lyd`,
              `${voiced} of ${lines} lines with ${name} audio`,
            )}
          />
          <Summary
            ok={conflicts === 0}
            text={L(
              `${conflicts} ${conflicts === 1 ? "timingkonflikt" : "timingkonflikter"}`,
              `${conflicts} ${conflicts === 1 ? "timing conflict" : "timing conflicts"}`,
            )}
          />
          <Summary
            ok={mixed === 0}
            text={L(
              `${mixed} ${mixed === 1 ? "scene" : "scener"} med blandet filmlyd`,
              `${mixed} ${mixed === 1 ? "scene" : "scenes"} with mixed film audio`,
            )}
          />
          <Summary
            ok={lipsync === 0}
            neutral
            text={L(
              `${lipsync} ${lipsync === 1 ? "scene" : "scener"} der munnbevegelser bør sjekkes`,
              `${lipsync} ${lipsync === 1 ? "scene" : "scenes"} where mouth movements should be checked`,
            )}
          />
        </ul>
        {shown.length === 0 ? (
          <p className="text-[13px] text-text-tertiary">
            {L("Ingen scener med replikker.", "No scenes with lines.")}
          </p>
        ) : (
          <ul aria-label={L("Scener", "Scenes")} className="flex flex-col border border-border">
            {shown.map((r) => (
              <li
                key={r.clip.occurrenceId}
                className="flex flex-col gap-1 border-b border-border px-3 py-2 text-xs last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                    {r.clip.productionNumber ? `${r.clip.productionNumber}. ` : ""}
                    {formatHeading(r.clip.heading)}
                  </span>
                  <span className="shrink-0 text-text-tertiary">
                    {r.translated}/{r.lines} {L("oversatt", "translated")} · {r.withAudio}/{r.lines}{" "}
                    {L("med lyd", "with audio")}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={L("Gå til scenen", "Go to the scene")}
                    title={L("Gå til scenen", "Go to the scene")}
                    onClick={() => onSeek(r.clip.occurrenceId, 0)}
                  >
                    <Play />
                  </Button>
                </div>
                {r.lines > 0 ? (
                  <p
                    className={
                      "flex items-start gap-1.5 " +
                      (r.advice.action === "direct" ? "text-text-tertiary" : "text-text-secondary")
                    }
                  >
                    {r.advice.action === "direct" ? (
                      <CheckCircle2
                        className="mt-px size-3.5 shrink-0 text-status-success"
                        aria-hidden
                      />
                    ) : (
                      <Info className="mt-px size-3.5 shrink-0 text-status-uncertain" aria-hidden />
                    )}
                    <span>
                      {MATERIAL_LABEL[r.material]}: {r.advice.text}
                    </span>
                  </p>
                ) : null}
                {r.mixedDialogue ? (
                  <p className="flex items-start gap-1.5 text-status-uncertain">
                    <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                    <span>
                      {L(
                        `Den importerte filmen har ${languageWord(r.mixedDialogue)} dialog blandet inn i lyden. Den kan ikke byttes helt ut: filmlyden spilles som den er, og ${name.toLowerCase()} dialog legges oppå. Er lyden bare musikk og effekter, kan du angi det i scenepanelet.`,
                        `The imported film has ${languageWord(r.mixedDialogue)} dialogue mixed into the audio. It cannot be swapped out completely: the film audio is played as it is, and ${name} dialogue is laid on top. If the audio is only music and effects, you can say so in the scene panel.`,
                      )}
                    </span>
                  </p>
                ) : null}
                {r.conflicts.map((c) => (
                  <Conflict
                    key={`${c.blockId}:${c.kind}`}
                    c={c}
                    text={state.blocks[c.blockId]?.text ?? ""}
                    editable={editable}
                    onSeek={() => onSeek(c.occurrenceId, c.startMs)}
                    onEarlier={(clipId, ms) => applyEarlier(c, clipId, ms)}
                  />
                ))}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Summary({ ok, neutral = false, text }: { ok: boolean; neutral?: boolean; text: string }) {
  return (
    <li className="flex items-center gap-1.5 text-text-secondary">
      {ok ? (
        <CheckCircle2 className="size-3.5 text-status-success" aria-hidden />
      ) : neutral ? (
        <Info className="size-3.5 text-text-tertiary" aria-hidden />
      ) : (
        <AlertTriangle className="size-3.5 text-status-uncertain" aria-hidden />
      )}
      {text}
    </li>
  );
}

function Conflict({
  c,
  text,
  editable,
  onSeek,
  onEarlier,
}: {
  c: TimingConflict;
  text: string;
  editable: boolean;
  onSeek: () => void;
  onEarlier: (clipId: string, offsetMs: number) => void;
}) {
  const long = c.kind === "long";
  return (
    <div
      className={
        "ml-5 flex flex-col gap-1 rounded-sm border p-2 " +
        (long ? "border-status-moved/50 bg-status-uncertain-bg" : "border-border bg-surface-1")
      }
    >
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-text-primary">
          <span className="font-script">
            {L("«", "“")}
            {text.length > 80 ? `${text.slice(0, 80)} …` : text}
            {L("»", "”")}
          </span>
          <span className="block text-text-tertiary">
            {long
              ? L(
                  `For lang: ${sec(c.lengthMs)} mot ${sec(c.windowEndMs - c.windowStartMs)} til neste replikk (${sec(c.overflowMs)} over).`,
                  `Too long: ${sec(c.lengthMs)} against ${sec(c.windowEndMs - c.windowStartMs)} until the next line (${sec(c.overflowMs)} over).`,
                )
              : L(
                  `Kort: ${sec(c.lengthMs)} mot ${sec(c.windowEndMs - c.windowStartMs)}.`,
                  `Short: ${sec(c.lengthMs)} against ${sec(c.windowEndMs - c.windowStartMs)}.`,
                )}{" "}
            {c.source === "audio"
              ? L("Målt fra lydfilen.", "Measured from the audio file.")
              : L("Beregnet fra oversettelsen.", "Calculated from the translation.")}
            {c.windowEstimated
              ? L(
                  " Tiden i den norske filmen er beregnet fra manuset.",
                  " The time in the Norwegian film is calculated from the script.",
                )
              : ""}
          </span>
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={onSeek}
          title={L("Gå til replikken", "Go to the line")}
        >
          <Play />
          {L("Vis", "Show")}
        </Button>
      </div>
      <ul className="flex flex-col gap-0.5 text-text-secondary">
        {c.suggestions.map((sg, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="min-w-0 flex-1">• {sg.text}</span>
            {sg.kind === "earlier" && editable ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onEarlier(sg.clipId, sg.offsetMs)}
              >
                {L("Flytt", "Move")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
