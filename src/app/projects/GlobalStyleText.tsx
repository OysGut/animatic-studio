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
import { t } from "@/core/i18n/keyed";

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
            ? t("app-projects-global-style-text.err.cmds-run.db04ed2474bc")
            : t("app-projects-global-style-text.err.cmds-run.e78996ab910f"),
        )
      : cmds.run(
          {
            type: "CreateStyleProfile",
            profileId: newId<"style_profile">() as never,
            // i18n-ignore – lagret standardnavn (som i «Filmens visuelle stil»)
            fields: { name: "Filmens visuelle stil", isDefault: true, guide },
          },
          t("app-projects-global-style-text.err.cmds-run.725b6bc7ba81"),
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
            {t("app-projects-global-style-text.global-style-text.label.ec2563bc4ab8")}
          </label>
        ) : (
          <span>
            {t("app-projects-global-style-text.global-style-text.span.f98d478e6a6c")}
          </span>
        )}
        <span className="text-[11px] text-text-tertiary">
          {edited
            ? t("app-projects-global-style-text.global-style-text.span.68d55ce4d416")
            : t("app-projects-global-style-text.global-style-text.span.4e49826f64ae")}
        </span>
        {editable && draft === null ? (
          <button
            type="button"
            onClick={() => setDraft(text)}
            className="ml-auto flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title={t("app-projects-global-style-text.global-style-text.title.04e3a9bc65d8")}
          >
            <Pencil className="size-3" aria-hidden />
            {t("app-projects-global-style-text.global-style-text.button.4cc4a94131b4")}
          </button>
        ) : null}
      </div>
      {draft !== null ? (
        <div className="flex flex-col gap-1.5 rounded-sm border border-status-discrepancy/50 bg-surface-1 p-2">
          <p className="text-[11px] text-status-discrepancy">
            {t("app-projects-global-style-text.global-style-text.p.d0e4e3b22454")}
          </p>
          <textarea
            value={draft}
            rows={8}
            maxLength={STYLE_TOTAL_LIMIT}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={t("app-projects-global-style-text.global-style-text.aria-label.ec2563bc4ab8")}
            className="resize-y rounded-sm border border-border-control bg-surface-3 px-2 py-1.5 font-mono text-[11px] text-text-primary"
          />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => save(draft)}>
              {t("app-projects-global-style-text.global-style-text.button.60beae1563f6")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              {t("app-projects-global-style-text.global-style-text.button.f37f45af9edb")}
            </Button>
            {edited ? (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => save(null)}
                title={t("app-projects-global-style-text.global-style-text.title.53e47c7e97cc")}
              >
                {t("app-projects-global-style-text.global-style-text.button.1b699d4efaea")}
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
            t("app-projects-global-style-text.global-style-text.pre.17a64c1afd9b")}
        </pre>
      )}
      {error ? <p className="text-[11px] text-status-danger">{tm(error)}</p> : null}
    </div>
  );
}
