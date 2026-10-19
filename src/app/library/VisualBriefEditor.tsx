/**
 * Visuelt faktaark for en ressurs (DEC-0080): kort, engelsk liste over det som synes – alder, kropp, hår,
 * klær, farger, kjennetegn. Lages én gang fra manuset med AI (koster litt, bekreftes), rettes av brukeren og
 * brukes i alle bildebeskrivelser i stedet for rå manusutdrag med replikker og handling.
 */
import { Loader2, NotebookPen } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  L,
  tm,
  ASSET_KIND_LABEL,
  coverVersion,
  mainProduction,
  scriptMentions,
  visualBriefUserText,
  type Asset,
  type ProjectState,
} from "@/core";
import { writeImagePrompt } from "@/adapters/ai/write-prompt.functions";
import { aiJobsKey } from "@/app/ai/use-ai-jobs";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";

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
      const main = mainProduction(state);
      const mentions = main
        ? scriptMentions(state, main.id, asset, 10, 2500).map((m) =>
            m.dialogue ? `${m.speaker}: "${m.text}"` : m.text,
          )
        : [];
      const cover = coverVersion(state, asset.id);
      const img = cover && cover.mimeType.startsWith("image/") ? cover : null;
      const variant = img ? state.assetVariants[img.variantId] : undefined;
      const r = await writeImagePrompt({
        data: {
          projectId: state.project.id,
          assetId: asset.id,
          task: "visual",
          brief: visualBriefUserText({
            name: asset.name,
            kind: ASSET_KIND_LABEL[asset.kind],
            description: asset.description,
            appearance: variant?.appearance ?? "",
            mentions,
            imageLabels: img ? [`the current design of ${asset.name} (v${img.number})`] : [],
          }),
          purpose: "cutout",
          images: img
            ? [{ path: img.mediaPath, label: `the current design of ${asset.name}` }]
            : [],
          approved: true,
        },
      });
      if (!r.ok) return setMsg({ kind: "error", text: tm(r.message) });
      setText(r.prompt);
      setOpen(true);
      setMsg({
        kind: "ok",
        text: L(
          "Utkast laget. Les gjennom, rett det som ikke stemmer, og lagre.",
          "Draft made. Read it through, correct anything that is wrong, and save.",
        ),
      });
    } catch (e) {
      setMsg({
        kind: "error",
        text:
          (e as Error).message || L("Faktaarket ble ikke laget.", "The visual brief was not made."),
      });
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: aiJobsKey(state.project.id) });
    }
  }

  function save() {
    const err = cmds.run(
      { type: "SetAssetVisualBrief", assetId: asset.id, text: text.trim() },
      L(`Faktaark for «${asset.name}»`, `Visual brief for “${asset.name}”`),
    );
    setMsg(
      err
        ? { kind: "error", text: err }
        : { kind: "ok", text: L("Faktaarket er lagret.", "The visual brief is saved.") },
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
          ? L("Vis eller rett faktaarket …", "View or correct the visual brief …")
          : L("Lag et visuelt faktaark (bedre treff) …", "Make a visual brief (better matches) …")}
      </button>
    );

  return (
    <section
      aria-label={L(`Visuelt faktaark for ${asset.name}`, `Visual brief for ${asset.name}`)}
      className="flex flex-col gap-1.5 text-xs text-text-secondary"
    >
      <div className="flex items-center gap-2">
        <h4 className="flex items-center gap-1 font-medium text-text-primary">
          <NotebookPen className="size-3.5" aria-hidden /> {L("Visuelt faktaark", "Visual brief")}
        </h4>
        <span className="text-[11px] text-text-tertiary">
          {L("engelsk, ett kjennetegn per linje", "English, one feature per line")}
        </span>
      </div>
      <p className="text-[11px] text-text-tertiary">
        {L(
          "Det som synes: alder, kropp, ansikt, hår, klær, farger, kjennetegn. Brukes i alle bildebeskrivelser i stedet for manusutdrag.",
          "What can be seen: age, body, face, hair, clothes, colours, distinguishing marks. Used in all image descriptions instead of script excerpts.",
        )}
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
        aria-label={L("Visuelt faktaark", "Visual brief")}
        className="w-full rounded-sm border border-border-control bg-surface-3 p-1.5 font-mono text-[11px] leading-snug text-text-primary placeholder:text-text-tertiary"
      />
      {confirm ? (
        <div
          role="alertdialog"
          aria-label={L("Bekreft faktaark med AI", "Confirm visual brief with AI")}
          className="flex flex-col gap-1.5 rounded-sm border border-accent-warm/50 bg-surface-1 p-2"
        >
          <p>
            {L(
              `Manusets omtale av ${asset.name} (og forsidebildet) sendes til en språkmodell i innebygd AI, som lager et utkast. Det bruker litt kreditter (langt mindre enn et bilde).`,
              `The script's mentions of ${asset.name} (and the cover image) are sent to a language model in built-in AI, which makes a draft. It uses a few credits (far less than an image).`,
            )}
            {text.trim()
              ? L(
                  " Utkastet erstatter teksten i feltet (ikke lagret før du lagrer).",
                  " The draft replaces the text in the field (not saved until you save).",
                )
              : ""}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void generate()}>
              {L("Ja, lag utkast", "Yes, make a draft")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              {L("Avbryt", "Cancel")}
            </Button>
          </div>
        </div>
      ) : null}
      {editable ? (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirm(true)}>
            {busy ? <Loader2 className="animate-spin" /> : <NotebookPen />}
            {busy
              ? L("Lager utkast …", "Making draft …")
              : L("Lag utkast fra manuset med AI …", "Make draft from the script with AI …")}
          </Button>
          <Button size="sm" disabled={!dirty || busy} onClick={save}>
            {L("Lagre faktaarket", "Save visual brief")}
          </Button>
          {dirty ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setText(saved)}>
              {L("Angre endringene", "Undo changes")}
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
