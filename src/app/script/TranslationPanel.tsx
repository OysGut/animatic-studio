/**
 * Oversettelse av valgt linje eller scenehode i inspektøren (M7 del 2, DEC-0058, REQ-0329–0331, REQ-0335).
 * Den norske teksten vises ved siden av og endres aldri herfra.
 */
import { AlertTriangle, Check, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  L,
  LANGUAGE_LABEL,
  formatHeading,
  needsReview,
  newId,
  textAtRevision,
  translationOf,
  type Command,
  type ProjectState,
} from "@/core";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
            L(`Oversettelse (${langName})`, `Translation (${langName})`),
          )
        : run(
            {
              type: "AddTranslations",
              items: [{ translationId: newId<"translation">(), fields }],
            },
            L(`Oversettelse (${langName})`, `Translation (${langName})`),
          ),
    );
  }

  if (!block && !variant) return null;
  const dirty = draft.trim() !== (t?.text ?? "");
  const canSave = editable && !!draft.trim() && (dirty || review || t?.status === "uncertain");
  return (
    <section
      aria-label={L(`Oversettelse (${langName})`, `Translation (${langName})`)}
      className="mb-4 flex flex-col gap-2"
    >
      <h3 className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
        {block
          ? L("Norsk (hovedmanus)", "Norwegian (main script)")
          : L("Scenehode – norsk", "Scene heading – Norwegian")}
      </h3>
      <p className="whitespace-pre-wrap rounded-sm bg-surface-2 px-2 py-1.5 font-script text-[13px] text-text-secondary">
        {original || "—"}
      </p>
      {review ? (
        <div className="flex flex-col gap-1 rounded-sm border border-status-moved/50 bg-status-uncertain-bg p-2 text-xs text-text-primary">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 text-status-moved" aria-hidden />
            {L(
              "Den norske teksten er endret etter oversettelsen.",
              "The Norwegian text has changed since the translation.",
            )}
          </span>
          {oldText !== null ? (
            <span className="text-text-tertiary line-through">{oldText}</span>
          ) : null}
        </div>
      ) : null}
      {t?.status === "uncertain" ? (
        <p className="text-xs text-status-uncertain">
          {L(
            "Koblet automatisk ved import – kontroller og godkjenn.",
            "Linked automatically on import – check and approve.",
          )}
        </p>
      ) : null}
      <h3 className="mt-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
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
        placeholder={t ? "" : L("Ikke oversatt ennå", "Not translated yet")}
        className="min-h-[90px] bg-surface-3 font-script text-[13px]"
      />
      {editable ? (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => save()} disabled={!canSave}>
            <Check />
            {dirty
              ? L("Lagre", "Save")
              : review || t?.status === "uncertain"
                ? L("Godkjenn", "Approve")
                : L("Lagret", "Saved")}
          </Button>
          {t ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setErr(
                  run(
                    { type: "SetTranslationsRemoved", translationIds: [t.id], removed: true },
                    L(`Fjern oversettelse (${langName})`, `Remove translation (${langName})`),
                  ),
                )
              }
            >
              <Trash2 />
              {L("Fjern", "Remove")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <p className="text-[11px] text-text-tertiary">
        {L(
          "Oversettelsen endrer aldri det norske manuset. Bytt til «Norsk» øverst for å endre hovedmanuset.",
          "The translation never changes the Norwegian script. Switch to “Norwegian” at the top to change the main script.",
        )}
      </p>
      {err ? (
        <p role="alert" className="text-xs text-status-danger">
          {err}
        </p>
      ) : null}
    </section>
  );
}
