/**
 * «Slettede objekter» (Mars 2026-10-13, DEC-0079): ressurser og bilder som er slettet. Alt kan hentes inn
 * igjen; prosjektets eier kan slette for godt (kan ikke angres). Det som fortsatt brukes i filmen, kan ikke
 * slettes for godt før bruken er fjernet.
 */
import { ArchiveRestore, Loader2, Trash2 } from "lucide-react";
import { Thumbnail } from "@/app/shared/Thumbnail";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ASSET_KIND_LABEL, assetUsageCounts, coverVersion, trashContents, tm, type ProjectState } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { projectStateKey } from "@/app/project/use-project";
import { purgeRemoved } from "@/adapters/storage/trash.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useImageUrls } from "./asset-images";
import { AssetSymbolIcon } from "./AssetSymbolIcon";
import { t } from "@/core/i18n/keyed";

export function TrashDialog({
  open,
  onOpenChange,
  state,
  cmds,
  editable,
  isOwner,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  cmds: Commands;
  editable: boolean;
  /** Bare eieren kan slette for godt. */
  isOwner: boolean;
}) {
  const trash = useMemo(() => trashContents(state), [state]);
  const paths = useMemo(
    () => [
      ...trash.versions.map((x) => x.version.mediaPath),
      ...trash.assets.flatMap((a) => {
        const v = coverVersion(state, a.id);
        return v ? [v.mediaPath] : [];
      }),
    ],
    [trash, state],
  );
  const urls = useImageUrls(open ? paths : []).data ?? {};
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [purging, setPurging] = useState<{
    assets: string[];
    versions: string[];
    label: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const empty = trash.assets.length === 0 && trash.versions.length === 0;

  function restore(kind: "asset" | "version", id: string, label: string) {
    const e = cmds.run(
      kind === "asset"
        ? { type: "SetAssetsRemoved", assetIds: [id as never], removed: false }
        : { type: "SetAssetVersionsRemoved", versionIds: [id as never], removed: false },
      t("app-library-trash-dialog.e.cmds-run.ecee4ab84b21", { label: String(label) }),
    );
    setMsg(
      e
        ? { kind: "error", text: e }
        : {
            kind: "ok",
            text: t("app-library-trash-dialog.text.text.494e31c60b51", { label: String(label) }),
          },
    );
  }

  async function purge() {
    if (!purging) return;
    setBusy(true);
    setMsg(null);
    try {
      // Vent til alt er lagret, så databasen og visningen er like før noe slettes for godt
      await cmds.whenIdle();
      const r = await purgeRemoved({
        data: {
          projectId: state.project.id,
          assetIds: purging.assets,
          versionIds: purging.versions,
        },
      });
      if (!r.ok) setMsg({ kind: "error", text: tm(r.message) });
      else {
        setMsg({
          kind: "ok",
          text: r.leftoverFiles ? t("app-library-trash-dialog.purged-leftover", { label: purging.label, files: r.leftoverFiles }) : t("app-library-trash-dialog.purged", { label: purging.label }),
        });
        void qc.invalidateQueries({ queryKey: projectStateKey(state.project.id) });
      }
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
      setPurging(null);
    }
  }

  // i18n-ignore: CSS-klasser
  const row = "flex items-center gap-2 border-b border-border px-2 py-1.5 last:border-b-0";
  const thumb =
    "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-3";

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Trash2 className="size-4" aria-hidden /> {t("app-library-trash-dialog.trash-dialog.dialog-title.f2a8a27f41db")}
          </DialogTitle>
          <DialogDescription>
            {t("app-library-trash-dialog.trash-dialog.dialog-description.b6ba1ef44a5b")}
          </DialogDescription>
        </DialogHeader>
        {empty ? (
          <p className="text-[13px] text-text-secondary">
            {t("app-library-trash-dialog.trash-dialog.p.31e0dfe9e6ec")}
          </p>
        ) : (
          <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto">
            {trash.assets.length ? (
              <section aria-label={t("app-library-trash-dialog.trash-dialog.aria-label.90ec75c45c44")}>
                <h3 className="pb-1 text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
                  {t("app-library-trash-dialog.trash-dialog.h3.8648af697b4d")} ({trash.assets.length})
                </h3>
                <ul className="border border-border bg-surface-1">
                  {trash.assets.map((a) => {
                    const v = coverVersion(state, a.id);
                    const use = assetUsageCounts(state, a.id);
                    return (
                      <li key={a.id} className={row}>
                        <span className={thumb}>
                          {v && urls[v.mediaPath] ? (
                            <Thumbnail
                              src={urls[v.mediaPath]}
                              />
                          ) : (
                            <AssetSymbolIcon state={state} assetId={a.id} className="size-7" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 text-xs">
                          <span className="block truncate text-[13px] text-text-primary">
                            {a.name}
                          </span>
                          <span className="text-text-tertiary">
                            {ASSET_KIND_LABEL[a.kind]}
                            {use.layers || use.audio
                              ? t("app-library-trash-dialog.still-used", { uses: [use.layers ? t("app-library-trash-dialog.still-used-layers", { count: use.layers }) : "", use.audio ? t("app-library-trash-dialog.still-used-audio", { count: use.audio }) : ""].filter(Boolean).join(t("app-library-trash-dialog.still-used-and")) })
                              : ""}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!editable || busy}
                          onClick={() => restore("asset", a.id, a.name)}
                        >
                          <ArchiveRestore /> {t("app-library-trash-dialog.trash-dialog.button.9cc51e982309")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!isOwner || busy}
                          title={
                            isOwner
                              ? t("app-library-trash-dialog.trash-dialog.title.4a79b7760cdc")
                              : t("app-library-trash-dialog.trash-dialog.title.49cc31ccf959")
                          }
                          onClick={() =>
                            setPurging({ assets: [a.id], versions: [], label: a.name })
                          }
                          className="text-status-danger"
                        >
                          <Trash2 /> {t("app-library-trash-dialog.trash-dialog.button.d54d45365f93")}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            {trash.versions.length ? (
              <section aria-label={t("app-library-trash-dialog.trash-dialog.aria-label.876d5f98d09b")}>
                <h3 className="pb-1 text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
                  {t("app-library-trash-dialog.trash-dialog.h3.a3003608f2f0")} ({trash.versions.length})
                </h3>
                <ul className="border border-border bg-surface-1">
                  {trash.versions.map(({ asset, version }) => {
                    const variant = state.assetVariants[version.variantId];
                    const label = `${asset.name} – ${variant?.name ?? ""} v${version.number}`;
                    return (
                      <li key={version.id} className={row}>
                        <span className={thumb}>
                          {urls[version.mediaPath] ? (
                            <Thumbnail
                              src={urls[version.mediaPath]}
                              />
                          ) : (
                            <AssetSymbolIcon state={state} assetId={asset.id} className="size-7" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
                          {label}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!editable || busy}
                          onClick={() => restore("version", version.id, label)}
                        >
                          <ArchiveRestore /> {t("app-library-trash-dialog.trash-dialog.button.9cc51e982309.2")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!isOwner || busy}
                          title={
                            isOwner
                              ? t("app-library-trash-dialog.trash-dialog.title.4a79b7760cdc.2")
                              : t("app-library-trash-dialog.trash-dialog.title.49cc31ccf959.2")
                          }
                          onClick={() => setPurging({ assets: [], versions: [version.id], label })}
                          className="text-status-danger"
                        >
                          <Trash2 /> {t("app-library-trash-dialog.trash-dialog.button.d54d45365f93.2")}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </div>
        )}
        {purging ? (
          <div
            role="alertdialog"
            aria-label={t("app-library-trash-dialog.trash-dialog.aria-label.21ac42b4bc3f")}
            className="flex flex-col gap-2 rounded-sm border border-status-danger/60 bg-surface-1 p-2 text-xs"
          >
            <p className="text-text-primary">
              {t("app-library-trash-dialog.trash-dialog.p.4218a851f3be", { label: String(purging.label) })}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => void purge()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}{" "}
                {t("app-library-trash-dialog.trash-dialog.button.4a79b7760cdc")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPurging(null)} disabled={busy}>
                {t("app-library-trash-dialog.trash-dialog.button.6074ad810e8f")}
              </Button>
            </div>
          </div>
        ) : null}
        {msg ? (
          <p
            role={msg.kind === "error" ? "alert" : "status"}
            className={
              "text-xs " + (msg.kind === "error" ? "text-status-danger" : "text-status-success")
            }
          >
            {msg.text}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("app-library-trash-dialog.trash-dialog.button.72f631a62c75")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
