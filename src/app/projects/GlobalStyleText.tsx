/**
 * Den globale beskrivelsen for hele prosjektet (DEC-0085, Mars 15.10.2026): filmens visuelle stil satt
 * sammen til én tekst som brukeren ser i sin helhet og kan redigere. Den redigerte teksten er den ene
 * versjonen som sendes til all AI (bilder og video); «Tilbake til feltene» setter den sammen på nytt.
 * Brukes i «AI-video av scenen» (med avkrysning for å ta den med) og under «Filmens visuelle stil».
 */
import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import {
  L,
  STYLE_TOTAL_LIMIT,
  emptyStyleGuide,
  newId,
  styleProfileFor,
  styleText,
  styleTextEdited,
  tm,
  type ProjectState,
  type StyleProfile,
  type StyleUse,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";

export function GlobalStyleText({
  state,
  cmds,
  editable,
  use = "ai_video",
  include,
  profileOverride,
}: {
  state: ProjectState;
  cmds: Commands;
  editable: boolean;
  /** Stilprofilen for denne bruken (standard: AI-video); endringen gjelder profilen, dvs. hele prosjektet. */
  use?: StyleUse | "ai_video";
  /** Avkrysning for å ta teksten med (i AI-video av scenen); utelatt = vises uten avkrysning. */
  include?: { readonly value: boolean; readonly onChange: (on: boolean) => void };
  /** Bestemt stilprofil (f.eks. standardprofilen under «Filmens visuelle stil»). */
  profileOverride?: StyleProfile | null;
}) {
  const profile = profileOverride !== undefined ? profileOverride : styleProfileFor(state, use);
  const text = styleText(profile?.guide);
  const edited = styleTextEdited(profile?.guide);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(null), [profile?.id]);
  const off = include ? !include.value : false;

  function save(next: string | null) {
    const guide = { ...(profile?.guide ?? emptyStyleGuide()) };
    if (next && next.trim()) (guide as { prompt?: string }).prompt = next.trim();
    else delete (guide as { prompt?: string }).prompt;
    const err = profile
      ? cmds.run(
          {
            type: "UpdateStyleProfile",
            profileId: profile.id,
            fields: { name: profile.name, isDefault: profile.isDefault, guide },
          },
          next
            ? L("Endre den globale beskrivelsen", "Change the global description")
            : L(
                "Global beskrivelse satt sammen av feltene igjen",
                "Global description put together from the fields again",
              ),
        )
      : cmds.run(
          {
            type: "CreateStyleProfile",
            profileId: newId<"style_profile">() as never,
            // i18n-ignore – lagret standardnavn (som i «Filmens visuelle stil»)
            fields: { name: "Filmens visuelle stil", isDefault: true, guide },
          },
          L("Lag den globale beskrivelsen", "Make the global description"),
        );
    setError(err);
    if (!err) setDraft(null);
  }

  return (
    <div className="flex flex-col gap-1" data-testid="global-style">
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        {include ? (
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={include.value}
              onChange={(e) => include.onChange(e.target.checked)}
              className="size-3.5 accent-[var(--accent-brand)]"
            />
            {L(
              "Generell beskrivelse for hele prosjektet",
              "General description for the whole project",
            )}
          </label>
        ) : (
          <span>
            {L("Samlet beskrivelse som sendes til AI", "Combined description sent to AI")}
          </span>
        )}
        <span className="text-[11px] text-text-tertiary">
          {edited
            ? L("(redigert tekst)", "(edited text)")
            : L(
                "(satt sammen av filmens visuelle stil)",
                "(put together from the film's visual style)",
              )}
        </span>
        {editable && draft === null ? (
          <button
            type="button"
            onClick={() => setDraft(text)}
            className="ml-auto flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title={L(
              "Rediger teksten. Endringen gjelder hele prosjektet.",
              "Edit the text. The change applies to the whole project.",
            )}
          >
            <Pencil className="size-3" aria-hidden />
            {L("Rediger …", "Edit …")}
          </button>
        ) : null}
      </div>
      {draft !== null ? (
        <div className="flex flex-col gap-1.5 rounded-sm border border-status-discrepancy/50 bg-surface-1 p-2">
          <p className="text-[11px] text-status-discrepancy">
            {L(
              "Endres globalt for hele prosjektet: alle AI-bilder og -videoer bruker denne teksten fra nå av.",
              "Changed globally for the whole project: all AI images and videos use this text from now on.",
            )}
          </p>
          <textarea
            value={draft}
            rows={8}
            maxLength={STYLE_TOTAL_LIMIT}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={L(
              "Generell beskrivelse for hele prosjektet",
              "General description for the whole project",
            )}
            className="resize-y rounded-sm border border-border-control bg-surface-3 px-2 py-1.5 font-mono text-[11px] text-text-primary"
          />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => save(draft)}>
              {L("Lagre for hele prosjektet", "Save for the whole project")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              {L("Avbryt", "Cancel")}
            </Button>
            {edited ? (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => save(null)}
                title={L(
                  "Bruk teksten som settes sammen av feltene i «Filmens visuelle stil» igjen",
                  "Use the text put together from the fields in “The film's visual style” again",
                )}
              >
                {L("Tilbake til feltene", "Back to the fields")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <pre
          className={
            "max-h-40 overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-surface-1 p-2 font-mono text-[11px] " +
            (off ? "text-text-tertiary opacity-50" : "text-text-secondary")
          }
          aria-disabled={off}
        >
          {text ||
            L(
              "Prosjektet har ingen visuell stil ennå. Fyll ut «Filmens visuelle stil» på prosjektoversikten, eller skriv en beskrivelse her.",
              "The project has no visual style yet. Fill in “The film's visual style” on the project overview, or write a description here.",
            )}
        </pre>
      )}
      {error ? <p className="text-[11px] text-status-danger">{tm(error)}</p> : null}
    </div>
  );
}
