/**
 * Språkversjon av filmen (M7 del 3, DEC-0059, REQ-0341–0347): status scene for scene – oversatte replikker,
 * dialoglyd i språket, materialtype og råd om leppesynk, importert film med blandet lyd, og timingkonflikter
 * med forslag. Bare råd: ingenting lages på nytt automatisk, og hovedfilmen endres ikke. Forslaget «start
 * tidligere» flytter bare språkets eget lydklipp.
 */
import { AlertTriangle, CheckCircle2, Info, Play } from "lucide-react";
import { useMemo } from "react";
import {
  LANGUAGE_LABEL,
  MATERIAL_LABEL,
  audioClipFieldsOf,
  formatHeading,
  languageReport,
  type Command,
  type ProjectState,
  type TimingConflict,
} from "@/core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const sec = (ms: number) => `${(Math.round(ms / 100) / 10).toLocaleString("nb-NO")} s`;

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
      `Flytt ${name.toLowerCase()} replikk`,
    );
    onSeek(c.occurrenceId, offsetMs);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[860px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>Språkversjon: {name}</DialogTitle>
          <DialogDescription>
            Samme film, scener og bilder som den norske. Her ser du hva som mangler eller må sjekkes
            i den {name.toLowerCase()}e versjonen. Ingenting lages på nytt automatisk, og
            hovedfilmens timing endres ikke.
          </DialogDescription>
        </DialogHeader>
        <ul
          aria-label="Sammendrag"
          className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3"
        >
          <Summary
            ok={translated === lines}
            text={`${translated} av ${lines} replikker oversatt`}
          />
          <Summary
            ok={voiced === lines}
            neutral={voiced === 0}
            text={`${voiced} av ${lines} replikker med ${name.toLowerCase()} lyd`}
          />
          <Summary
            ok={conflicts === 0}
            text={`${conflicts} ${conflicts === 1 ? "timingkonflikt" : "timingkonflikter"}`}
          />
          <Summary
            ok={mixed === 0}
            text={`${mixed} ${mixed === 1 ? "scene" : "scener"} med blandet filmlyd`}
          />
          <Summary
            ok={lipsync === 0}
            neutral
            text={`${lipsync} ${lipsync === 1 ? "scene" : "scener"} der munnbevegelser bør sjekkes`}
          />
        </ul>
        {shown.length === 0 ? (
          <p className="text-[13px] text-text-tertiary">Ingen scener med replikker.</p>
        ) : (
          <ul aria-label="Scener" className="flex flex-col border border-border">
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
                    {r.translated}/{r.lines} oversatt · {r.withAudio}/{r.lines} med lyd
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Gå til scenen"
                    title="Gå til scenen"
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
                      Den importerte filmen har{" "}
                      {(LANGUAGE_LABEL[r.mixedDialogue] ?? r.mixedDialogue).toLowerCase()} dialog
                      blandet inn i lyden. Den kan ikke byttes helt ut: filmlyden spilles som den
                      er, og {name.toLowerCase()} dialog legges oppå. Er lyden bare musikk og
                      effekter, kan du angi det i scenepanelet.
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
            «{text.length > 80 ? `${text.slice(0, 80)} …` : text}»
          </span>
          <span className="block text-text-tertiary">
            {long
              ? `For lang: ${sec(c.lengthMs)} mot ${sec(c.windowEndMs - c.windowStartMs)} til neste replikk (${sec(c.overflowMs)} over).`
              : `Kort: ${sec(c.lengthMs)} mot ${sec(c.windowEndMs - c.windowStartMs)}.`}{" "}
            {c.source === "audio" ? "Målt fra lydfilen." : "Beregnet fra oversettelsen."}
            {c.windowEstimated ? " Tiden i den norske filmen er beregnet fra manuset." : ""}
          </span>
        </span>
        <Button size="sm" variant="ghost" onClick={onSeek} title="Gå til replikken">
          <Play />
          Vis
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
                Flytt
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
