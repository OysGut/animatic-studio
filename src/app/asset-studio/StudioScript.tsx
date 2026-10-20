/**
 * «Vis manus» i Asset Studio (AS3, C1–C3): scenens manus med karakterens replikker markert, og forsøksvise
 * manusredigeringer. En forsøksvis redigering lagres med en gang som notat (kind = trial_edit) med originalteksten
 * og forslaget; den endrer aldri manuset. «Bruk forslaget» finnes i notatene i manuset og krever bekreftelse.
 */
import { useMemo, useRef, useState } from "react";
import { annotationsOfVariant, newId, type FilmClip, type ProjectState } from "@/core";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { SceneScriptPanel } from "@/app/scene-editor/SceneScriptPanel";
import type { Commands } from "@/app/project/use-commands";
import { t as tk } from "@/core/i18n/keyed";

export function StudioScript({
  state,
  cmds,
  occurrenceId,
  clip,
  frame,
  playing,
  lineIds,
  editable,
  authorName,
}: {
  state: ProjectState;
  cmds: Commands;
  occurrenceId: string;
  clip: FilmClip | null;
  frame: number;
  playing: boolean;
  /** Karakterens replikker i scenen. */
  lineIds: readonly string[];
  editable: boolean;
  authorName: string;
}) {
  const [show, setShow] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const marked = useMemo(() => new Set(lineIds), [lineIds]);
  const variantId = state.occurrences[occurrenceId]?.variantId;
  const trials = useMemo(
    () =>
      variantId
        ? annotationsOfVariant(state, variantId).filter(
            (a) => a.kind === "trial_edit" && a.blockId && marked.has(a.blockId),
          )
        : [],
    [state, variantId, marked],
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col" data-testid="asset-studio-script">
      <PanelHeader
        title={tk("app-asset-studio-studio-script.studio-script.title.42741e7fffb0")}
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShow((v) => !v)}
            data-testid="asset-studio-show-script"
            aria-pressed={show}
          >
            {show ? tk("app-asset-studio-studio-script.studio-script.button.0dedaa06de6b") : tk("app-asset-studio-studio-script.studio-script.button.5da74397cacf")}
          </Button>
        }
      />
      {show ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <SceneScriptPanel
            state={state}
            occurrenceId={occurrenceId}
            clip={clip}
            frame={frame}
            playing={playing}
            editable={false}
            hideEditButton
            highlightBlockIds={marked}
            onOpenEditor={(blockId) => {
              if (blockId && marked.has(blockId) && editable) setEditing(blockId);
            }}
          />
          <div className="flex flex-col gap-2 border-t border-border p-2">
            <p className="text-[11px] text-text-tertiary">
              {tk("app-asset-studio-studio-script.studio-script.p.526d7b35df27")}
            </p>
            {lineIds.map((id) => {
              const b = state.blocks[id];
              if (!b) return null;
              return editing === id ? (
                <TrialEditForm
                  key={id}
                  state={state}
                  cmds={cmds}
                  blockId={id}
                  authorName={authorName}
                  onDone={() => setEditing(null)}
                />
              ) : (
                <div key={id} className="flex items-start gap-2 text-[12px]">
                  <span className="min-w-0 flex-1 text-text-secondary">{b.text}</span>
                  {editable ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(id)}
                      data-testid="asset-studio-trial-edit"
                    >
                      {tk("app-asset-studio-studio-script.studio-script.button.ff34fec65827")}
                    </Button>
                  ) : null}
                </div>
              );
            })}
            {trials.length ? (
              <div className="flex flex-col gap-1" data-testid="asset-studio-trial-list">
                <p className="text-[11px] font-medium text-text-secondary">
                  {tk("app-asset-studio-studio-script.studio-script.p.06f0bb1d3441")}
                </p>
                {trials.map((a) => (
                  <div key={a.id} className="border-l-2 border-note bg-surface-2 px-2 py-1 text-[12px]">
                    <span className="block text-text-tertiary line-through">{a.quote}</span>
                    <span className="block text-text-primary">{a.suggestedText}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TrialEditForm({
  state,
  cmds,
  blockId,
  authorName,
  onDone,
}: {
  state: ProjectState;
  cmds: Commands;
  blockId: string;
  authorName: string;
  onDone: () => void;
}) {
  const block = state.blocks[blockId]!;
  const original = useRef<HTMLTextAreaElement | null>(null);
  const [range, setRange] = useState({ start: 0, end: block.text.length });
  const [suggested, setSuggested] = useState(block.text);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const quote = block.text.slice(range.start, range.end);

  function save() {
    const e = cmds.run(
      {
        type: "AddAnnotations",
        annotations: [
          {
            annotationId: newId<"annotation">() as never,
            blockId: blockId as never,
            variantId: null,
            start: range.start,
            end: range.end,
            quote,
            text:
              comment.trim() ||
              tk("app-asset-studio-studio-script.text.text.3afdf2ec0b1e"),
            authorName,
            kind: "trial_edit",
            suggestedText: suggested,
          },
        ],
      },
      tk("app-asset-studio-studio-script.e.cmds-run.b41c46a253ab"),
    );
    setErr(e);
    if (!e) onDone();
  }

  return (
    <div className="flex flex-col gap-1.5 border border-note/40 bg-note-bg p-2" data-testid="asset-studio-trial-form">
      <label className="text-[11px] text-text-tertiary">
        {tk("app-asset-studio-studio-script.trial-edit-form.label.95d640f3aa9b")}
        <Textarea
          ref={original}
          readOnly
          value={block.text}
          rows={2}
          className="mt-0.5 bg-surface-3 text-[13px]"
          data-testid="asset-studio-trial-original"
          onSelect={(e) => {
            const t = e.currentTarget;
            if (t.selectionEnd > t.selectionStart) {
              setRange({ start: t.selectionStart, end: t.selectionEnd });
              setSuggested(block.text.slice(t.selectionStart, t.selectionEnd));
            }
          }}
        />
      </label>
      <label className="text-[11px] text-text-tertiary">
        {range.start === 0 && range.end === block.text.length
          ? tk("app-asset-studio-studio-script.trial-edit-form.label.1be6d9cf7209")
          : tk("app-asset-studio-studio-script.trial-edit-form.label.de0537a996b3", { quote: String(quote) })}
        <Textarea
          autoFocus
          value={suggested}
          maxLength={10000}
          rows={2}
          onChange={(e) => setSuggested(e.target.value)}
          className="mt-0.5 bg-surface-3 text-[13px]"
          data-testid="asset-studio-trial-suggestion"
        />
      </label>
      <label className="text-[11px] text-text-tertiary">
        {tk("app-asset-studio-studio-script.trial-edit-form.label.77ead0bd8108")}
        <Textarea
          value={comment}
          maxLength={10000}
          rows={1}
          onChange={(e) => setComment(e.target.value)}
          className="mt-0.5 bg-surface-3 text-[13px]"
        />
      </label>
      <div className="flex gap-1.5">
        <Button
          size="sm"
          onClick={save}
          disabled={suggested === quote}
          data-testid="asset-studio-trial-save"
        >
          {tk("app-asset-studio-studio-script.trial-edit-form.button.c07684c5f831")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {tk("app-asset-studio-studio-script.trial-edit-form.button.36e5dddb05c3")}
        </Button>
      </div>
      {err ? (
        <p role="alert" className="text-xs text-status-danger">
          {err}
        </p>
      ) : null}
    </div>
  );
}
