/**
 * Et nedlastet bilde lastes opp igjen (DEC-0064, REQ-0588). Filnavnet («Ressurs - Variant - vN.png»)
 * viser hvilken versjon det kommer fra, og brukeren velger per fil:
 * - «Erstatt»: filen blir ny versjon og tar over overalt den gamle ble brukt (godkjenning, scener, plakater).
 * - «Legg til»: filen blir ny versjon ved siden av, med eget nummer (og eget filnavn ved neste nedlasting).
 * - «Hopp over».
 * Den gamle versjonen slettes aldri, og alt kan angres samlet per fil.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  newId,
  replaceVersionCommands,
  reuploadNote,
  versionFileBase,
  versionUse,
  versionsOf,
  type AssetVersion,
  type ProjectState,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadAssetImage } from "./asset-images";

export interface ReuploadItem {
  readonly file: File;
  readonly match: AssetVersion;
}

type Choice = "replace" | "add" | "skip";

export function ReuploadDialog({
  state,
  projectId,
  cmds,
  items,
  unknown = [],
  onClose,
}: {
  state: ProjectState;
  projectId: string;
  cmds: Commands;
  items: readonly ReuploadItem[];
  /** Filer med navn programmet ikke kjenner igjen (bare ved opplasting av flere filer fra biblioteket). */
  unknown?: readonly File[];
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<Record<number, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const pick = (i: number): Choice => choice[i] ?? "replace";

  /** Per fil: ferdig, eller ny versjon lagt til men ikke tatt over (kan prøves igjen uten ny opplasting). */
  const [progress, setProgress] = useState<Record<number, { done: boolean; versionId?: string }>>(
    {},
  );

  async function run() {
    setBusy(true);
    const ok: string[] = [];
    const bad: string[] = [];
    const next = { ...progress };
    for (const [i, it] of items.entries()) {
      const c = pick(i);
      if (c === "skip" || next[i]?.done) continue;
      const old = it.match;
      const va = state.assetVariants[old.variantId];
      if (!va) continue;
      const group = newId();
      const label =
        c === "replace" ? `Erstatt v${old.number} av «${va.name}»` : `Nytt bilde i «${va.name}»`;
      try {
        // Lastet opp tidligere (erstattingen feilet): bruk samme versjon, ikke en ny
        let versionId = next[i]?.versionId;
        if (!versionId) {
          const up = await uploadAssetImage(projectId, va.assetId, it.file);
          const r = await cmds.runAndWait(
            {
              type: "AddAssetVersion",
              versionId: up.versionId as never,
              variantId: va.id,
              media: up.media,
              note: reuploadNote(old, c),
            },
            label,
            group,
          );
          if (r.error) throw new Error(r.error);
          versionId = up.versionId;
          next[i] = { done: false, versionId };
        }
        if (c === "replace") {
          // Fra tilstanden slik den er nå (etter forrige fil og andres endringer), ikke da dialogen åpnet
          const now = cmds.current() ?? state;
          for (const cmd of replaceVersionCommands(now, old.id, versionId)) {
            const e = cmds.run(cmd, label, group);
            if (e)
              throw new Error(
                `v${old.number} ble lagt til som ny versjon, men tok ikke over: ${e}`,
              );
          }
        }
        next[i] = { done: true, versionId };
        ok.push(`${it.file.name}: ${c === "replace" ? `erstatter v${old.number}` : "lagt til"}`);
      } catch (e) {
        bad.push(`${it.file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setProgress(next);
    setDone(ok);
    setErrors(bad);
    setBusy(false);
    if (bad.length === 0) onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {items.length === 1 ? "Bildet finnes i prosjektet" : "Bildene finnes i prosjektet"}
          </DialogTitle>
          <DialogDescription>
            Navnet viser hvilket bilde filen kommer fra. «Erstatt» gjør filen til ny versjon som tar
            over overalt det gamle bildet er brukt; det gamle tas vare på. «Legg til» gjør den til
            en ny versjon med eget nummer.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {items.map((it, i) => {
            const old = it.match;
            const use = versionUse(state, old.id);
            const next = Math.max(0, ...versionsOf(state, old.variantId).map((v) => v.number)) + 1;
            const where = [
              use.approved ? "godkjent" : "",
              use.layers ? `vises i ${use.layers} lag i 2D-scener` : "",
              use.posters ? `${use.posters} ${use.posters === 1 ? "plakat" : "plakater"}` : "",
            ].filter(Boolean);
            return (
              <li
                key={i}
                className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface-2 p-2.5"
              >
                <span className="text-[13px] text-text-primary">{it.file.name}</span>
                <span className="text-xs text-text-tertiary">
                  Fra «{versionFileBase(state, old)}» ·{" "}
                  {where.length ? where.join(", ") : "vises ikke i scener eller på plakater nå"}
                </span>
                <fieldset
                  className="flex flex-wrap gap-3"
                  aria-label={`Hva skal skje med ${it.file.name}?`}
                >
                  {(
                    [
                      ["replace", `Erstatt v${old.number} (blir v${next}, brukes overalt)`],
                      ["add", `Legg til som v${next}`],
                      ["skip", "Hopp over"],
                    ] as const
                  ).map(([c, text]) => (
                    <label key={c} className="flex items-center gap-1.5 text-xs text-text-primary">
                      <input
                        type="radio"
                        name={`reupload-${i}`}
                        checked={pick(i) === c}
                        disabled={busy || !!progress[i]?.done || !!progress[i]?.versionId}
                        onChange={() => setChoice((x) => ({ ...x, [i]: c }))}
                        className="accent-[var(--accent-brand)]"
                      />
                      {text}
                    </label>
                  ))}
                </fieldset>
                {pick(i) === "add" && !state.assetVariants[old.variantId]?.approvedVersionId ? (
                  <span className="text-[11px] text-text-tertiary">
                    Varianten har ingen godkjent versjon, så scener som følger den viser det nyeste
                    bildet – også det du legger til. Godkjenn v{old.number} først hvis scenene skal
                    beholde den.
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {unknown.length ? (
          <p className="text-xs text-text-secondary">
            Kjenner ikke igjen {unknown.length === 1 ? "filen" : "filene"}{" "}
            {unknown.map((f) => `«${f.name}»`).join(", ")}. Last{" "}
            {unknown.length === 1 ? "den" : "dem"} opp fra varianten den hører til.
          </p>
        ) : null}
        {done.length ? (
          <p className="text-xs text-status-success" role="status">
            {done.join(" · ")}
          </p>
        ) : null}
        {errors.length ? (
          <p role="alert" className="text-xs text-status-danger">
            {errors.join(" · ")}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {errors.length ? "Lukk" : "Avbryt"}
          </Button>
          <Button onClick={run} disabled={busy || items.length === 0}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? "Laster opp …" : errors.length ? "Prøv igjen for resten" : "Last opp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
