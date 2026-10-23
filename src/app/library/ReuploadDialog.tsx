/**
 * Et nedlastet bilde lastes opp igjen (DEC-0064, REQ-0588). Filnavnet («Ressurs - Variant - vN.png»)
 * viser hvilken versjon det kommer fra, og brukeren velger per fil:
 * - «Erstatt»: filen blir ny versjon og tar over overalt den gamle ble brukt (godkjenning, scener, plakater).
 * - «Legg til»: filen blir ny versjon ved siden av, med eget nummer (og eget filnavn ved neste nedlasting).
 * - «Hopp over».
 * Den gamle versjonen slettes aldri, og alt kan angres samlet per fil.
 */
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { newId, replaceVersionCommands, reuploadNote, versionFileBase, versionUse, allVersionsOf, type AssetVersion, type ProjectState } from "@/core";
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
import { t } from "@/core/i18n/keyed";

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
        c === "replace"
          ? t("app-library-reupload-dialog.label.message.baa3974e3ad8", { number: String(old.number), name: String(va.name) })
          : t("app-library-reupload-dialog.label.message.bd51b265b852", { name: String(va.name) });
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
              // REQ-0037: versjonen som erstattes, som permanent ID
              derivedFromVersionId: old.id,
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
                t("app-library-reupload-dialog.run.message.9cb38d8ad01e", { number: String(old.number), e: String(e) }),
              );
          }
        }
        next[i] = { done: true, versionId };
        ok.push(
          `${it.file.name}: ${c === "replace" ? t("app-library-reupload-dialog.run.ok-push.fabe2150f9ba", { number: String(old.number) }) : t("app-library-reupload-dialog.run.ok-push.15da85a7d4b3")}`,
        );
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
      <ResizableDialogContent uiId="V-071" sizeKey="reupload" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {items.length === 1
              ? t("app-library-reupload-dialog.reupload-dialog.dialog-title.f37e7d1477d3")
              : t("app-library-reupload-dialog.reupload-dialog.dialog-title.0b2e6d46d9c6")}
          </DialogTitle>
          <DialogDescription>
            {t("app-library-reupload-dialog.reupload-dialog.dialog-description.664f811e51fe")}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {items.map((it, i) => {
            const old = it.match;
            const use = versionUse(state, old.id);
            const next =
              Math.max(0, ...allVersionsOf(state, old.variantId).map((v) => v.number)) + 1;
            const where = [
              use.approved ? t("app-library-reupload-dialog.where.use-approved-l-godkjent-approved-use-layers-l-vises-i-use-layers-lag-i-2d-scener-shown-in-use-layers-layers-in-2d-scenes-use-posters-l-use-posters-use-posters-1-plakat-plakater-use-posters-use-posters-1-poster-posters-filter.393cfc4ff298") : "",
              use.layers
                ? t("app-library-reupload-dialog.where.use-approved-l-godkjent-approved-use-layers-l-vises-i-use-layers-lag-i-2d-scener-shown-in-use-layers-layers-in-2d-scenes-use-posters-l-use-posters-use-posters-1-plakat-plakater-use-posters-use-posters-1-poster-posters-filter.3956706bd9af", { layers: String(use.layers) })
                : "",
              use.posters
                ? t("app-library-reupload-dialog.posters", { count: use.posters })
                : "",
            ].filter(Boolean);
            return (
              <li
                key={i}
                className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface-2 p-2.5"
              >
                <span className="text-[13px] text-text-primary">{it.file.name}</span>
                <span className="text-xs text-text-tertiary">
                  {t("app-library-reupload-dialog.reupload-dialog.span.1ac1345cb768")}
                  {versionFileBase(state, old)}
                  {t("app-library-reupload-dialog.reupload-dialog.span.8c2e223d9167")}{" "}
                  {where.length
                    ? where.join(", ")
                    : t("app-library-reupload-dialog.reupload-dialog.span.d895e6189804")}
                </span>
                <fieldset
                  className="flex flex-wrap gap-3"
                  aria-label={t("app-library-reupload-dialog.reupload-dialog.aria-label.cdd83739e2ad", { name: String(it.file.name) })}
                >
                  {(
                    [
                      [
                        "replace",
                        t("app-library-reupload-dialog.reupload-dialog.replace-l-erstatt-v-old-number-blir-v-next-brukes-overalt-replace-v-old-number-becomes-v-next-used-everywhere-add-l-legg-til-som-v-next-add-as-v-next-skip-l-hopp-over-skip-as-const-map.e14e84a954cd", { number: String(old.number), next: String(next) }),
                      ],
                      ["add", t("app-library-reupload-dialog.reupload-dialog.replace-l-erstatt-v-old-number-blir-v-next-brukes-overalt-replace-v-old-number-becomes-v-next-used-everywhere-add-l-legg-til-som-v-next-add-as-v-next-skip-l-hopp-over-skip-as-const-map.bee71e072ad3", { next: String(next) })],
                      ["skip", t("app-library-reupload-dialog.reupload-dialog.replace-l-erstatt-v-old-number-blir-v-next-brukes-overalt-replace-v-old-number-becomes-v-next-used-everywhere-add-l-legg-til-som-v-next-add-as-v-next-skip-l-hopp-over-skip-as-const-map.49041b5ce931")],
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
                    {t("app-library-reupload-dialog.reupload-dialog.span.0b10bd7992b3", { number: String(old.number) })}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {unknown.length ? (
          <p className="text-xs text-text-secondary">
            {t("app-library-reupload-dialog.reupload-dialog.p.078a77a07bb6")}{" "}
            {unknown.length === 1 ? t("app-library-reupload-dialog.reupload-dialog.p.8bd50b34a65a") : t("app-library-reupload-dialog.reupload-dialog.p.787a23f07b8b")}{" "}
            {unknown.map((f) => t("app-library-reupload-dialog.reupload-dialog.unknown-map.f736cf26e0c2", { name: String(f.name) })).join(", ")}. {t("app-library-reupload-dialog.reupload-dialog.p.2bc5414bfb8f")}{" "}
            {unknown.length === 1 ? t("app-library-reupload-dialog.reupload-dialog.p.acce0ba63f8f") : t("app-library-reupload-dialog.reupload-dialog.p.1dd34831542e")}{" "}
            {t("app-library-reupload-dialog.reupload-dialog.p.0f43beb5061f")}
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
            {errors.length ? t("app-library-reupload-dialog.reupload-dialog.button.0add2e0fc14e") : t("app-library-reupload-dialog.reupload-dialog.button.04a9cab2334f")}
          </Button>
          <Button onClick={run} disabled={busy || items.length === 0}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy
              ? t("app-library-reupload-dialog.reupload-dialog.button.65fe2d2949bc")
              : errors.length
                ? t("app-library-reupload-dialog.reupload-dialog.button.3a1262b5e2e8")
                : t("app-library-reupload-dialog.reupload-dialog.button.db13cc4ddbb8")}
          </Button>
        </DialogFooter>
      </ResizableDialogContent>
    </Dialog>
  );
}
