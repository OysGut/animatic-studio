/**
 * «Generer scene» (M5 del 2, DEC-0053, REQ-0243–0256, REQ-0259–0267). Scenen deles i segmenter som følger
 * manusblokkene; hvert segment får en automatisk beskrivelse (engelsk, replikkene ordrett på norsk) som kan
 * leses, endres og lagres. Egne beskrivelser forsvinner aldri når den automatiske endres; det vises når
 * grunnlaget har endret seg. Videoen lages med en leverandør prosjektets eiere har koblet til (DEC-0069,
 * `SceneVideoSection`).
 */
import { AlertTriangle, Copy, Info, Loader2, RotateCcw, Save } from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SEGMENT_SECONDS,
  MAX_PROMPT_CHARS,
  SEGMENT_SECONDS,
  blocksOfVariant,
  buildScenePrompt,
  formatHeading,
  keysEvenly,
  missingDialogue,
  newId,
  planSegments,
  continuityCuts,
  planFitsScene,
  samePlan,
  segmentDialogue,
  segmentTimes,
  compareKeys,
  type FilmClip,
  type GenerationPrompt,
  type ProductionSegment,
  type ProjectState,
  type SegmentPlan,
  L,
  locale,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { SceneVideoSection } from "./SceneVideoSection";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function GenerateSceneDialog({
  open,
  onOpenChange,
  state,
  productionId,
  clip,
  editable,
  cmds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  productionId: string;
  clip: FilmClip | null;
  editable: boolean;
  cmds: Commands;
}) {
  return (
    <Dialog open={open && clip !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[860px] overflow-y-auto border-border bg-surface-2">
        {clip ? (
          <Body
            key={clip.occurrenceId}
            state={state}
            productionId={productionId}
            clip={clip}
            editable={editable}
            cmds={cmds}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  state,
  productionId,
  clip,
  editable,
  cmds,
  onClose,
}: {
  state: ProjectState;
  productionId: string;
  clip: FilmClip;
  editable: boolean;
  cmds: Commands;
  onClose: () => void;
}) {
  const [seconds, setSeconds] = useState<number>(DEFAULT_SEGMENT_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  /** Det du skriver i hvert segment (per plass), så teksten ikke går tapt hvis lagringen feiler. */
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  // Lagrede segmenter for generering (i rekkefølge)
  const stored = useMemo(
    () =>
      Object.values(state.segments)
        .filter((g) => g.occurrenceId === clip.occurrenceId && g.reason === "model_limit")
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey)),
    [state.segments, clip.occurrenceId],
  );
  const proposal = useMemo(() => planSegments(state, clip, seconds), [state, clip, seconds]);
  const storedPlan = useMemo(
    () => (stored.length ? segmentTimes(state, clip, stored) : null),
    [state, clip, stored],
  );
  const plan: readonly SegmentPlan[] = storedPlan ?? proposal;
  const differs = storedPlan !== null && !samePlan(storedPlan, proposal);
  const prompts = useMemo(() => {
    const m = new Map<string, GenerationPrompt>();
    for (const p of Object.values(state.generationPrompts))
      if (p.occurrenceId === clip.occurrenceId && !p.removed) m.set(p.segmentId, p);
    return m;
  }, [state.generationPrompts, clip.occurrenceId]);
  const autos = useMemo(
    () =>
      plan.map((segment, index) =>
        buildScenePrompt(state, { clip, productionId, segment, index, count: plan.length }),
      ),
    [state, clip, productionId, plan],
  );
  const hasBlocks = blocksOfVariant(state, clip.variantId).some((b) => b.kind !== "heading");

  /** Lagrer inndelingen (første gang, eller en ny når ingen segmenter har egne beskrivelser). */
  async function savePlan(
    next: readonly SegmentPlan[],
    group?: string,
  ): Promise<ProductionSegment["id"][] | null> {
    const keys = keysEvenly(Math.max(1, next.length));
    const segments = next.map((p, i) => ({
      segmentId: newId<"production_segment">(),
      orderKey: keys[i]!,
      startBlockId: null,
      endBlockId: null,
      startMs: p.startMs,
      endMs: p.endMs,
    }));
    const r = await cmds.runAndWait(
      {
        type: "ReplaceSegments",
        occurrenceId: clip.occurrenceId as never,
        reason: "model_limit",
        removeSegmentIds: stored.map((g) => g.id),
        segments,
      },
      next.length === 0
        ? L("Fjern inndeling for generering", "Remove breakdown for generation")
        : stored.length
          ? L("Ny inndeling for generering", "New breakdown for generation")
          : L("Inndeling for generering", "Breakdown for generation"),
      group,
    );
    if (r.error) {
      setError(r.error);
      return null;
    }
    return segments.map((g) => g.segmentId);
  }

  async function savePrompt(index: number, text: string | null) {
    setError(null);
    setBusy(true);
    try {
      let ids = stored.map((g) => g.id);
      // Inndelingen og den første egne beskrivelsen lagres sammen og angres som ett steg
      const group = storedPlan ? undefined : newId();
      if (!storedPlan) {
        const made = await savePlan(proposal, group);
        if (!made) return;
        ids = made;
      }
      const segmentId = ids[index];
      if (!segmentId) return;
      const existing =
        prompts.get(segmentId) ??
        Object.values(state.generationPrompts).find((p) => p.segmentId === segmentId);
      const r = await cmds.runAndWait(
        {
          type: "SetGenerationPrompt",
          promptId: (existing?.id ?? newId<"generation_prompt">()) as never,
          occurrenceId: clip.occurrenceId as never,
          segmentId: segmentId as never,
          text,
          basedOn: text === null ? "" : (autos[index] ?? ""),
        },
        text === null
          ? L("Bruk automatisk beskrivelse", "Use automatic description")
          : L("Lagre egen beskrivelse", "Save own description"),
        group,
      );
      if (r.error) setError(r.error);
      else
        setDrafts((d) => {
          const { [index]: _gone, ...rest } = d;
          return rest;
        });
    } finally {
      setBusy(false);
    }
  }

  const effective = plan.map((_, i) => {
    const id = stored[i]?.id;
    const own = id ? prompts.get(id) : undefined;
    return own?.text ?? autos[i] ?? "";
  });

  async function copyAll() {
    const text = effective
      .map((t, i) =>
        plan.length > 1
          ? L(
              `### Segment ${i + 1} av ${plan.length}\n${t}`,
              `### Segment ${i + 1} of ${plan.length}\n${t}`,
            )
          : t,
      )
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(L("Kunne ikke kopiere til utklippstavlen.", "Could not copy to the clipboard."));
    }
  }

  const ms = (v: number) =>
    `${(Math.round(v / 100) / 10).toLocaleString(locale(), { minimumFractionDigits: 1 })} s`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          <AiGlyph className="mr-1 inline size-4" aria-hidden />
          {L(
            `Generer scene ${clip.productionNumber ?? ""} – ${formatHeading(clip.heading)}`,
            `Generate scene ${clip.productionNumber ?? ""} – ${formatHeading(clip.heading)}`,
          )}
        </DialogTitle>
        <DialogDescription>
          {L(
            "Scenen deles i segmenter som følger manuset. Hvert segment får en beskrivelse på engelsk med replikkene ordrett på norsk. Du kan lese og endre hver beskrivelse; det du skriver selv, lagres og overskrives aldri. Manuset endres ikke.",
            "The scene is divided into segments that follow the script. Each segment gets a description in English with the dialogue word for word in Norwegian. You can read and change each description; what you write yourself is saved and never overwritten. The script is not changed.",
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
        {storedPlan ? (
          <span>
            {L("Lagret inndeling:", "Saved breakdown:")}{" "}
            <strong className="text-text-primary">{plan.length}</strong>{" "}
            {plan.length === 1 ? L("segment", "segment") : L("segmenter", "segments")}.
          </span>
        ) : (
          <label className="flex items-center gap-1.5">
            {L("Segmentlengde høyst", "Maximum segment length")}
            <select
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
              className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
            >
              {SEGMENT_SECONDS.map((n) => (
                <option key={n} value={n}>
                  {n} s
                </option>
              ))}
            </select>
            <span className="text-text-tertiary">
              {L(
                `→ ${plan.length} ${plan.length === 1 ? "segment" : "segmenter"} (forslag)`,
                `→ ${plan.length} ${plan.length === 1 ? "segment" : "segments"} (suggested)`,
              )}
            </span>
          </label>
        )}
        {storedPlan && editable ? (
          <>
            <label className="flex items-center gap-1.5">
              {L("Ny lengde", "New length")}
              <select
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
                className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
              >
                {SEGMENT_SECONDS.map((n) => (
                  <option key={n} value={n}>
                    {n} s
                  </option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || !differs}
              title={
                differs
                  ? L(
                      "Del scenen på nytt (går bare når ingen segmenter har egen beskrivelse)",
                      "Split the scene again (only works when no segment has its own description)",
                    )
                  : L(
                      "Den nye lengden gir samme inndeling",
                      "The new length gives the same breakdown",
                    )
              }
              onClick={() => {
                setError(null);
                setBusy(true);
                void savePlan(proposal).finally(() => setBusy(false));
              }}
            >
              <RotateCcw />
              {L("Del på nytt", "Split again")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || prompts.size > 0}
              title={
                prompts.size > 0
                  ? L(
                      "Tilbakestill de egne beskrivelsene først",
                      "Reset the own descriptions first",
                    )
                  : L(
                      "Fjern inndelingen (scenen kan da slås sammen eller splittes i manuset)",
                      "Remove the breakdown (the scene can then be merged or split in the script)",
                    )
              }
              onClick={() => {
                setError(null);
                setBusy(true);
                void savePlan([]).finally(() => setBusy(false));
              }}
            >
              {L("Fjern inndelingen", "Remove the breakdown")}
            </Button>
          </>
        ) : null}
        {!storedPlan && editable ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setError(null);
              setBusy(true);
              void savePlan(proposal).finally(() => setBusy(false));
            }}
          >
            <Save />
            {L("Lagre inndelingen", "Save the breakdown")}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void copyAll()}>
          <Copy />
          {copied ? L("Kopiert", "Copied") : L("Kopier alle beskrivelser", "Copy all descriptions")}
        </Button>
      </div>

      {storedPlan && !planFitsScene(state, clip, storedPlan) ? (
        <p className="flex items-start gap-1 text-xs text-status-uncertain">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {L(
            "Scenen har fått en annen lengde siden inndelingen ble lagret. Del på nytt når det passer (segmenter med egen beskrivelse må tilbakestilles først).",
            "The scene has got a different length since the breakdown was saved. Split again when it suits (segments with their own description must be reset first).",
          )}
        </p>
      ) : null}
      {continuityCuts(state, clip).length ? (
        <p className="text-xs text-text-tertiary">
          {L(
            "Utseendet til en karakter endres midt i scenen (kontinuitet). Forslaget deler segmentene der, så hvert segment får riktig utseende i beskrivelsen. Manuset og scenen endres ikke.",
            "A character's appearance changes in the middle of the scene (continuity). The suggestion splits the segments there, so each segment gets the right appearance in the description. The script and scene are not changed.",
          )}
        </p>
      ) : null}
      {!hasBlocks ? (
        <p className="text-xs text-text-tertiary">
          {L(
            "Scenen har ingen tekst i manuset; beskrivelsen bygges bare fra scenehode, ressurser og kamera.",
            "The scene has no text in the script; the description is built only from the scene heading, assets and camera.",
          )}
        </p>
      ) : null}

      <ol className="flex flex-col gap-3">
        {plan.map((segment, i) => (
          <SegmentCard
            key={i}
            draft={drafts[i] ?? null}
            onDraft={(t) =>
              setDrafts((d) => {
                if (t !== null) return { ...d, [i]: t };
                const { [i]: _gone, ...rest } = d;
                return rest;
              })
            }
            index={i}
            count={plan.length}
            segment={segment}
            auto={autos[i] ?? ""}
            own={stored[i] ? (prompts.get(stored[i]!.id) ?? null) : null}
            dialogue={segmentDialogue(state, clip.variantId, segment.blockIds)}
            editable={editable && !busy}
            onSave={(text) => void savePrompt(i, text)}
            span={`${ms(segment.startMs)}–${ms(segment.endMs)}`}
          />
        ))}
      </ol>

      {error ? (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      ) : null}

      <SceneVideoSection
        state={state}
        productionId={productionId}
        clip={clip}
        plan={plan}
        stored={stored}
        prompts={effective}
        editable={editable}
        cmds={cmds}
      />

      <DialogFooter className="sm:justify-between">
        <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {L(
            "Generert video legges til som en ny versjon av scenen og erstatter aldri 2D-scenen.",
            "Generated video is added as a new version of the scene and never replaces the 2D scene.",
          )}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            {L("Lukk", "Close")}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

function SegmentCard({
  draft,
  onDraft,
  index,
  count,
  segment,
  auto,
  own,
  dialogue,
  editable,
  onSave,
  span,
}: {
  draft: string | null;
  onDraft: (text: string | null) => void;
  index: number;
  count: number;
  segment: SegmentPlan;
  auto: string;
  own: GenerationPrompt | null;
  dialogue: readonly string[];
  editable: boolean;
  onSave: (text: string | null) => void;
  span: string;
}) {
  const setDraft = onDraft;
  // En ny egen beskrivelse (lagret av deg, en annen bruker eller angre) erstatter utkastet
  useEffect(() => {
    if (own) onDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own?.text, own?.id]);
  const text = draft ?? own?.text ?? auto;
  const changedBase = own !== null && own.basedOn !== "" && own.basedOn !== auto;
  const missing = own || draft !== null ? missingDialogue(text, dialogue) : [];
  const tooLong = text.length > MAX_PROMPT_CHARS;
  const dirty = draft !== null && draft.trim() !== (own?.text ?? auto).trim();
  const [showAuto, setShowAuto] = useState(false);

  return (
    <li className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface-1 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-text-primary">
          {count > 1
            ? L(`Segment ${index + 1} av ${count}`, `Segment ${index + 1} of ${count}`)
            : L("Hele scenen", "Whole scene")}
        </span>
        <span className="tabular text-text-tertiary">{span}</span>
        <span className="text-text-tertiary">
          {L(
            `· ${segment.blockIds.length} blokker i manuset`,
            `· ${segment.blockIds.length} blocks in the script`,
          )}
        </span>
        <span
          className={
            "ml-auto rounded-sm px-1.5 py-0.5 text-[11px] " +
            (own ? "bg-accent-selection text-text-primary" : "bg-surface-3 text-text-secondary")
          }
        >
          {own ? L("Egen beskrivelse", "Own description") : L("Automatisk", "Automatic")}
        </span>
      </div>
      {changedBase ? (
        <p className="flex items-start gap-1 text-xs text-status-uncertain">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {L(
              "Manus, ressurser eller kamera er endret siden du skrev denne. Din beskrivelse brukes fortsatt.",
              "The script, assets or camera have changed since you wrote this. Your description is still used.",
            )}{" "}
            <button type="button" className="underline" onClick={() => setShowAuto((v) => !v)}>
              {showAuto ? L("Skjul", "Hide") : L("Vis", "Show")}{" "}
              {L("den nye automatiske", "the new automatic one")}
            </button>
          </span>
        </p>
      ) : null}
      {showAuto ? (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-sm bg-surface-3 p-2 font-mono text-[11px] text-text-secondary">
          {auto}
        </pre>
      ) : null}
      <textarea
        value={text}
        onChange={(e) => setDraft(e.target.value)}
        readOnly={!editable}
        rows={Math.min(16, Math.max(6, text.split("\n").length + 1))}
        aria-label={
          count > 1
            ? L(`Beskrivelse for segment ${index + 1}`, `Description for segment ${index + 1}`)
            : L("Beskrivelse for scenen", "Description for the scene")
        }
        className="resize-y rounded-sm border border-border-control bg-surface-3 p-2 font-mono text-[11px] leading-snug text-text-primary"
      />
      {missing.length ? (
        <p className="text-xs text-status-uncertain">
          {missing.length === 1
            ? L("En replikk", "One line")
            : L(`${missing.length} replikker`, `${missing.length} lines`)}{" "}
          {L(
            "står ikke ordrett i beskrivelsen:",
            "are not quoted word for word in the description:",
          )}{" "}
          {missing.map((d) => L(`«${d}»`, `“${d}”`)).join(", ")}.{" "}
          {L("Replikkene skal være med uendret.", "The lines must be kept unchanged.")}
        </p>
      ) : null}
      {tooLong ? (
        <p className="text-xs text-status-danger">
          {L("For lang", "Too long")} ({text.length} {L("av", "of")} {MAX_PROMPT_CHARS}{" "}
          {L("tegn", "characters")}).
        </p>
      ) : null}
      {editable ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!dirty || tooLong || text.trim() === ""}
            onClick={() => onSave(text)}
          >
            <Save />
            {L("Lagre egen beskrivelse", "Save own description")}
          </Button>
          {draft !== null ? (
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              {L("Forkast endringene", "Discard changes")}
            </Button>
          ) : null}
          {own ? (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => onSave(null)}
              title={L(
                "Bruk den automatiske beskrivelsen igjen (kan angres)",
                "Use the automatic description again (can be undone)",
              )}
            >
              <RotateCcw />
              {L("Bruk automatisk", "Use automatic")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
