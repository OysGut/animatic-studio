import { LineLinkReview } from "./LineLinkReview";
/**
 * Oversettelse av valgt linje eller scenehode i inspektøren (M7 del 2, DEC-0058, REQ-0329–0331, REQ-0335).
 * Den norske teksten vises ved siden av og endres aldri herfra.
 */
import { AlertTriangle, Check, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { LANGUAGE_LABEL, languageLabel, reviewLanguagesForBlock, formatHeading, needsReview, newId, textAtRevision, translationOf, type Command, type ProjectState } from "@/core";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { t as tk } from "@/core/i18n/keyed";

export function TranslationPanel({
  state,
  language,
  blockId,
  variantId,
  editable,
  run,
}: {
  state: ProjectState;
  language: string;
  /** Linjen som oversettes; null = scenehodet (`variantId`). */
  blockId: string | null;
  variantId: string | null;
  editable: boolean;
  run: (command: Command, label: string) => string | null;
}) {
  const block = blockId ? state.blocks[blockId] : undefined;
  const variant = variantId ? state.variants[variantId] : undefined;
  const target = block?.id ?? variant?.id ?? "";
  const t = target ? translationOf(state, target, language) : null;
  const original = block ? block.text : variant ? formatHeading(variant.heading) : "";
  const [draft, setDraft] = useState(t?.text ?? "");
  const [err, setErr] = useState<string | null>(null);
  // Ny linje valgt, eller endret utenfra
  // Ny tekst utenfra (annen bruker, angre) tas inn bare når brukeren ikke har ulagrede endringer
  const [lastSaved, setLastSaved] = useState(t?.text ?? "");
  useEffect(() => {
    const now = t?.text ?? "";
    setLastSaved(now);
    setDraft((d) => (d.trim() === lastSaved.trim() ? now : d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, t?.text]);
  const review = t ? needsReview(state, t) : false;
  const oldText = t && block && review ? textAtRevision(state, block.id, t.basedOnRev) : null;
  const langName = LANGUAGE_LABEL[language] ?? language;

  function save(status: "approved" | "uncertain" = "approved") {
    const fields = {
      blockId: (block?.id ?? null) as never,
      variantId: (block ? null : (variant?.id ?? null)) as never,
      language,
      text: draft.trim(),
      basedOnRev: block ? block.currentRev : (variant?.revision ?? 0),
      status,
    };
    setErr(
      t
        ? run(
            { type: "UpdateTranslations", items: [{ translationId: t.id, fields }] },
            tk("app-script-translation-panel.save.run.3c8e90b789b8", { langName: String(langName) }),
          )
        : run(
            {
              type: "AddTranslations",
              items: [{ translationId: newId<"translation">(), fields }],
            },
            tk("app-script-translation-panel.save.run.3c8e90b789b8.2", { langName: String(langName) }),
          ),
    );
  }

  if (!block && !variant) return null;
  const dirty = draft.trim() !== (t?.text ?? "");
  const canSave = editable && !!draft.trim() && (dirty || review || t?.status === "uncertain");
  return (
    <section
      aria-label={tk("app-script-translation-panel.translation-panel.aria-label.d679587cc24e", { langName: String(langName) })}
      className="mb-4 flex flex-col gap-2"
    >
      <h3 className="text-chrome-label font-medium uppercase tracking-label text-text-tertiary">
        {block
          ? tk("app-script-translation-panel.translation-panel.h3.483ff179da30")
          : tk("app-script-translation-panel.translation-panel.h3.71328d6a925f")}
      </h3>
      <p className="whitespace-pre-wrap rounded-sm bg-surface-2 px-2 py-1.5 font-script text-[13px] text-text-secondary">
        {original || "—"}
      </p>
      {review ? (
        <div className="flex flex-col gap-1 rounded-sm border border-status-moved/50 bg-status-uncertain-bg p-2 text-xs text-text-primary">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 text-status-moved" aria-hidden />
            {tk("app-script-translation-panel.translation-panel.span.20ea3adffe37")}
          </span>
          {oldText !== null ? (
            <span className="text-text-tertiary line-through">{oldText}</span>
          ) : null}
        </div>
      ) : null}
      {t?.status === "uncertain" ? (
        <p className="text-xs text-status-uncertain">
          {tk("app-script-translation-panel.translation-panel.p.3381de071f0d")}
        </p>
      ) : null}
      <h3 className="mt-1 text-chrome-label font-medium uppercase tracking-label text-text-tertiary">
        {langName}
      </h3>
      <Textarea
        value={draft}
        readOnly={!editable}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (canSave) save();
          }
        }}
        placeholder={t ? "" : tk("app-script-translation-panel.translation-panel.placeholder.1c6aaff3beaa")}
        className="min-h-[90px] bg-surface-3 font-script text-[13px]"
      />
      {editable ? (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => save()} disabled={!canSave}>
            <Check />
            {dirty
              ? tk("app-script-translation-panel.translation-panel.button.b26882f93e4e")
              : review || t?.status === "uncertain"
                ? tk("app-script-translation-panel.translation-panel.button.fc04ba2adbff")
                : tk("app-script-translation-panel.translation-panel.button.30e626e26439")}
          </Button>
          {t ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setErr(
                  run(
                    { type: "SetTranslationsRemoved", translationIds: [t.id], removed: true },
                    tk("app-script-translation-panel.translation-panel.run.dff3e5573199", { langName: String(langName) }),
                  ),
                )
              }
            >
              <Trash2 />
              {tk("app-script-translation-panel.translation-panel.button.5d893a9834d5")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <p className="text-[11px] text-text-tertiary">
        {tk("app-script-translation-panel.translation-panel.p.34959a2df1f2")}
      </p>
      {block && reviewLanguagesForBlock(state, block.id).length ? (
        <p data-testid="translation-review-languages" className="text-[11px] text-status-uncertain">
          {tk("ml3-language-versions.review.languages", { languages: reviewLanguagesForBlock(state, block.id).map((l) => languageLabel(l)).join(", ") })}
        </p>
      ) : null}
      {(block?.variantId ?? variant?.id) && language !== "nb" ? <LineLinkReview state={state} variantId={block?.variantId ?? variant?.id ?? ""} language={language} editable={editable} run={run} /> : null}
      {err ? (
        <p role="alert" className="text-xs text-status-danger">
          {err}
        </p>
      ) : null}
    </section>
  );
}
