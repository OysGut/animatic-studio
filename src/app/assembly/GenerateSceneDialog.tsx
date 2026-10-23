/**
 * «Generer scene» (M5 del 2, DEC-0053, REQ-0243–0256, REQ-0259–0267). Scenen deles i segmenter som følger
 * manusblokkene; hvert segment får en automatisk beskrivelse (engelsk, replikkene ordrett på norsk) som kan
 * leses, endres og lagres. Egne beskrivelser forsvinner aldri når den automatiske endres; det vises når
 * grunnlaget har endret seg. Videoen lages med en leverandør prosjektets eiere har koblet til (DEC-0069,
 * `SceneVideoSection`).
 */
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { AlertTriangle, Copy, Info, Loader2, RotateCcw, Save } from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SEGMENT_SECONDS, MAX_PROMPT_CHARS, SEGMENT_SECONDS, blocksOfVariant, buildScenePrompt, formatHeading, keysEvenly, missingDialogue, newId, planSegments, continuityCuts, planFitsScene, samePlan, segmentDialogue, segmentTimes, compareKeys, type FilmClip, type GenerationPrompt, type ProductionSegment, type ProjectState, type SegmentPlan, locale } from "@/core";
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
import { t as tk } from "@/core/i18n/keyed";

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
      <ResizableDialogContent sizeKey="generate-scene" className="max-h-[90vh] max-w-[860px] overflow-y-auto border-border bg-surface-2">
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
      </ResizableDialogContent>
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
        ? tk("app-assembly-generate-scene-dialog.r.cmds-run-and-wait.7ff9f39763e5")
        : stored.length
          ? tk("app-assembly-generate-scene-dialog.r.cmds-run-and-wait.9f1d77eb1780")
          : tk("app-assembly-generate-scene-dialog.r.cmds-run-and-wait.895c9e3c34ca"),
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
          ? tk("app-assembly-generate-scene-dialog.r.cmds-run-and-wait.4b627b7b3293")
          : tk("app-assembly-generate-scene-dialog.r.cmds-run-and-wait.80364961a80e"),
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
          ? tk("app-assembly-generate-scene-dialog.text.effective-map.5b31fc96873d", { value1: String(i + 1), length: String(plan.length), t: String(t) })
          : t,
      )
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(tk("app-assembly-generate-scene-dialog.copy-all.set-error.573b1e971e40"));
    }
  }

  const ms = (v: number) =>
    `${(Math.round(v / 100) / 10).toLocaleString(locale(), { minimumFractionDigits: 1 })} s`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          <AiGlyph className="mr-1 inline size-4" aria-hidden />
          {tk("app-assembly-generate-scene-dialog.body.dialog-title.37e37222fad0", { value1: String(clip.productionNumber ?? ""), value2: String(formatHeading(clip.heading)) })}
        </DialogTitle>
        <DialogDescription>
          {tk("app-assembly-generate-scene-dialog.body.dialog-description.2d6dd5207e8e")}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
        {storedPlan ? (
          <span>
            {tk("app-assembly-generate-scene-dialog.body.span.96f33ab8b694")}{" "}
            <strong className="text-text-primary">{plan.length}</strong>{" "}
            {plan.length === 1 ? tk("app-assembly-generate-scene-dialog.body.span.fd892f5e887b") : tk("app-assembly-generate-scene-dialog.body.span.ac87b29342ab")}.
          </span>
        ) : (
          <label className="flex items-center gap-1.5">
            {tk("app-assembly-generate-scene-dialog.body.label.1cb1f77a65d1")}
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
              {tk("app-assembly-generate-scene-dialog.segments-suggested", { count: plan.length })}
            </span>
          </label>
        )}
        {storedPlan && editable ? (
          <>
            <label className="flex items-center gap-1.5">
              {tk("app-assembly-generate-scene-dialog.body.label.247a3e174fa8")}
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
                  ? tk("app-assembly-generate-scene-dialog.body.title.9431792ed90e")
                  : tk("app-assembly-generate-scene-dialog.body.title.851fa7a81802")
              }
              onClick={() => {
                setError(null);
                setBusy(true);
                void savePlan(proposal).finally(() => setBusy(false));
              }}
            >
              <RotateCcw />
              {tk("app-assembly-generate-scene-dialog.body.button.8b736b9acefa")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || prompts.size > 0}
              title={
                prompts.size > 0
                  ? tk("app-assembly-generate-scene-dialog.body.title.df787748107d")
                  : tk("app-assembly-generate-scene-dialog.body.title.458bbebde8e0")
              }
              onClick={() => {
                setError(null);
                setBusy(true);
                void savePlan([]).finally(() => setBusy(false));
              }}
            >
              {tk("app-assembly-generate-scene-dialog.body.button.23bb6c18b4b8")}
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
            {tk("app-assembly-generate-scene-dialog.body.button.49f6d9ec6e59")}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void copyAll()}>
          <Copy />
          {copied ? tk("app-assembly-generate-scene-dialog.body.button.61d5dc3f172e") : tk("app-assembly-generate-scene-dialog.body.button.c98481725b26")}
        </Button>
      </div>

      {storedPlan && !planFitsScene(state, clip, storedPlan) ? (
        <p className="flex items-start gap-1 text-xs text-status-uncertain">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {tk("app-assembly-generate-scene-dialog.body.p.5d0e58a72f20")}
        </p>
      ) : null}
      {continuityCuts(state, clip).length ? (
        <p className="text-xs text-text-tertiary">
          {tk("app-assembly-generate-scene-dialog.body.p.f795d61ca6b8")}
        </p>
      ) : null}
      {!hasBlocks ? (
        <p className="text-xs text-text-tertiary">
          {tk("app-assembly-generate-scene-dialog.body.p.bd1277c13ec7")}
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
          {tk("app-assembly-generate-scene-dialog.body.span.70e51df845f8")}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            {tk("app-assembly-generate-scene-dialog.body.button.11401f4e30ac")}
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
            ? tk("app-assembly-generate-scene-dialog.segment-card.span.44c0faab0806", { value1: String(index + 1), count: String(count) })
            : tk("app-assembly-generate-scene-dialog.segment-card.span.172fbf6a273b")}
        </span>
        <span className="tabular text-text-tertiary">{span}</span>
        <span className="text-text-tertiary">
          {tk("app-assembly-generate-scene-dialog.segment-card.span.630822edb65d", { length: String(segment.blockIds.length) })}
        </span>
        <span
          className={
            "ml-auto rounded-sm px-1.5 py-0.5 text-[11px] " +
            (own ? "bg-accent-selection text-text-primary" : "bg-surface-3 text-text-secondary")
          }
        >
          {own ? tk("app-assembly-generate-scene-dialog.segment-card.span.8787ee31a8d0") : tk("app-assembly-generate-scene-dialog.segment-card.span.b218c1adf036")}
        </span>
      </div>
      {changedBase ? (
        <p className="flex items-start gap-1 text-xs text-status-uncertain">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {tk("app-assembly-generate-scene-dialog.segment-card.span.25290f0e163b")}{" "}
            <button type="button" className="underline" onClick={() => setShowAuto((v) => !v)}>
              {showAuto ? tk("app-assembly-generate-scene-dialog.segment-card.button.8a2de620a37d") : tk("app-assembly-generate-scene-dialog.segment-card.button.abf0945e28ef")}{" "}
              {tk("app-assembly-generate-scene-dialog.segment-card.button.5c2f50bd5f8d")}
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
            ? tk("app-assembly-generate-scene-dialog.segment-card.aria-label.4b448bc4b614", { value1: String(index + 1) })
            : tk("app-assembly-generate-scene-dialog.segment-card.aria-label.d447ceb13d3e")
        }
        className="resize-y rounded-sm border border-border-control bg-surface-3 p-2 font-mono text-[11px] leading-snug text-text-primary"
      />
      {missing.length ? (
        <p className="text-xs text-status-uncertain">
          {missing.length === 1
            ? tk("app-assembly-generate-scene-dialog.segment-card.p.fa2a87039620")
            : tk("app-assembly-generate-scene-dialog.segment-card.p.0b90adeb3e51", { length: String(missing.length) })}{" "}
          {tk("app-assembly-generate-scene-dialog.segment-card.p.025bdf937c2c")}{" "}
          {missing.map((d) => tk("app-assembly-generate-scene-dialog.segment-card.missing-map.977efe6f133c", { d: String(d) })).join(", ")}.{" "}
          {tk("app-assembly-generate-scene-dialog.segment-card.p.010185f7a14d")}
        </p>
      ) : null}
      {tooLong ? (
        <p className="text-xs text-status-danger">
          {tk("app-assembly-generate-scene-dialog.segment-card.p.b79c0819bcd7")} ({text.length} {tk("app-assembly-generate-scene-dialog.segment-card.p.84f550f9126d")} {MAX_PROMPT_CHARS}{" "}
          {tk("app-assembly-generate-scene-dialog.segment-card.p.41e3021cb13d")}).
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
            {tk("app-assembly-generate-scene-dialog.segment-card.button.cf25d042a631")}
          </Button>
          {draft !== null ? (
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              {tk("app-assembly-generate-scene-dialog.segment-card.button.67f6f3aba09c")}
            </Button>
          ) : null}
          {own ? (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => onSave(null)}
              title={tk("app-assembly-generate-scene-dialog.segment-card.title.87c9b7e1e318")}
            >
              <RotateCcw />
              {tk("app-assembly-generate-scene-dialog.segment-card.button.19e535cd53bc")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
