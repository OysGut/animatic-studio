/**
 * Visuelt faktaark for en ressurs (DEC-0080): kort, engelsk liste over det som synes – alder, kropp, hår,
 * klær, farger, kjennetegn. Lages én gang fra manuset med AI (koster litt, bekreftes), rettes av brukeren og
 * brukes i alle bildebeskrivelser i stedet for rå manusutdrag med replikker og handling.
 */
import { UiId } from "@/app/shared/UiId";
import { Loader2, NotebookPen } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tm, factSheetStudy, type Asset, type ProjectState } from "@/core";
import { writeImagePrompt } from "@/adapters/ai/write-prompt.functions";
import { aiJobsKey } from "@/app/ai/use-ai-jobs";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";

export function VisualBriefEditor({
  state,
  asset,
  cmds,
  editable,
  compact = false,
}: {
  state: ProjectState;
  asset: Asset;
  cmds: Commands;
  editable: boolean;
  /** I bildedialogen: lukket til brukeren åpner det. */
  compact?: boolean;
}) {
  const saved = asset.visualBrief ?? "";
  const [text, setText] = useState(saved);
  const [open, setOpen] = useState(!compact);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const qc = useQueryClient();
  // Endret av andre (eller lagret): følg med så lenge feltet ikke er endret her
  const [base, setBase] = useState(saved);
  useEffect(() => {
    if (saved !== base) {
      if (text === base) setText(saved);
      setBase(saved);
    }
  }, [saved, base, text]);
  const dirty = text.trim() !== saved;

  async function generate() {
    setConfirm(false);
    setBusy(true);
    setMsg(null);
    try {
      // Samme studie som serveren lager når «Skriv med AI» mangler faktaark (Øystein 23.10)
      const study = factSheetStudy(state, asset);
      const r = await writeImagePrompt({
        data: {
          projectId: state.project.id,
          assetId: asset.id,
          task: "visual",
          brief: study.text,
          purpose: "cutout",
          images: [...study.images],
          approved: true,
        },
      });
      if (!r.ok) return setMsg({ kind: "error", text: tm(r.message) });
      setText(r.prompt);
      setOpen(true);
      setMsg({
        kind: "ok",
        text: t("app-library-visual-brief-editor.text.text.a12946bd1ab7"),
      });
    } catch (e) {
      setMsg({
        kind: "error",
        text:
          (e as Error).message || t("app-library-visual-brief-editor.text.text.5011a43d9907"),
      });
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: aiJobsKey(state.project.id) });
    }
  }

  function save() {
    const err = cmds.run(
      { type: "SetAssetVisualBrief", assetId: asset.id, text: text.trim() },
      t("app-library-visual-brief-editor.err.cmds-run.cb6354778352", { name: String(asset.name) }),
    );
    setMsg(
      err
        ? { kind: "error", text: err }
        : { kind: "ok", text: t("app-library-visual-brief-editor.text.text.f85a5f54d28d") },
    );
  }

  if (compact && !open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-left text-[11px] text-text-secondary underline underline-offset-2 hover:text-text-primary"
      >
        <NotebookPen className="size-3" aria-hidden />
        {saved
          ? t("app-library-visual-brief-editor.visual-brief-editor.button.cf5f2b835d36")
          : t("app-library-visual-brief-editor.visual-brief-editor.button.b8daa3d0196e")}
      </button>
    );

  return (
    <section
      aria-label={t("app-library-visual-brief-editor.visual-brief-editor.aria-label.3cc045016ca3", { name: String(asset.name) })}
      className="flex flex-col gap-1.5 text-xs text-text-secondary"
    >
      <div className="flex items-center gap-2">
        <h4 className="flex items-center gap-1 font-medium text-text-primary">
          <NotebookPen className="size-3.5" aria-hidden /> {t("app-library-visual-brief-editor.visual-brief-editor.h4.1cff9f90ebf2")}
        </h4>
        <span className="text-[11px] text-text-tertiary">
          {t("app-library-visual-brief-editor.visual-brief-editor.span.5625b5f8c54a")}
        </span>
      </div>
      {asset.visualBriefAuto && saved ? (
        <p className="text-[11px] text-text-secondary" data-testid="fact-sheet-auto">
          {t("factSheet.auto.label", { date: asset.visualBriefAuto.slice(0, 10) })}
        </p>
      ) : null}
      <p className="text-[11px] text-text-tertiary">
        {t("app-library-visual-brief-editor.visual-brief-editor.p.92ad57e47d88")}
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setMsg(null);
        }}
        disabled={!editable || busy}
        rows={compact ? 5 : 7}
        maxLength={4000}
        placeholder={
          "- nine-year-old girl, slim, a bit small for her age\n- long dark-blond braid\n- fashionable winter coat with fur trim on the collar and cuffs"
        }
        aria-label={t("app-library-visual-brief-editor.visual-brief-editor.aria-label.1cff9f90ebf2")}
        className="w-full rounded-sm border border-border-control bg-surface-3 p-1.5 font-mono text-[11px] leading-snug text-text-primary placeholder:text-text-tertiary"
      />
      {confirm ? (
        <div
          role="alertdialog"
          aria-label={t("app-library-visual-brief-editor.visual-brief-editor.aria-label.346a0c7c9ee9")}
          className="relative flex flex-col gap-1.5 rounded-sm border border-accent-warm/50 bg-surface-1 p-2"
        ><UiId id="V-157" />
          <p>
            {t("app-library-visual-brief-editor.visual-brief-editor.p.426532648c23", { name: String(asset.name) })}
            {text.trim()
              ? t("app-library-visual-brief-editor.visual-brief-editor.p.5c1a3e670206")
              : ""}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void generate()}>
              {t("app-library-visual-brief-editor.visual-brief-editor.button.cfdadd9909c8")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              {t("app-library-visual-brief-editor.visual-brief-editor.button.fa309cd73b32")}
            </Button>
          </div>
        </div>
      ) : null}
      {editable ? (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirm(true)}>
            {busy ? <Loader2 className="animate-spin" /> : <NotebookPen />}
            {busy
              ? t("app-library-visual-brief-editor.visual-brief-editor.button.b9844dfe3943")
              : t("app-library-visual-brief-editor.visual-brief-editor.button.da460559f93a")}
          </Button>
          <Button size="sm" disabled={!dirty || busy} onClick={save}>
            {t("app-library-visual-brief-editor.visual-brief-editor.button.9e81bd81f145")}
          </Button>
          {dirty ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setText(saved)}>
              {t("app-library-visual-brief-editor.visual-brief-editor.button.aef759f94131")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {msg ? (
        <p
          role={msg.kind === "error" ? "alert" : "status"}
          className={msg.kind === "error" ? "text-status-danger" : "text-status-success"}
        >
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
