/**
 * «Slettede objekter» (Mars 2026-10-13, DEC-0079): ressurser og bilder som er slettet. Alt kan hentes inn
 * igjen; prosjektets eier kan slette for godt (kan ikke angres). Det som fortsatt brukes i filmen, kan ikke
 * slettes for godt før bruken er fjernet.
 */
import { ArchiveRestore, Loader2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ASSET_KIND_LABEL,
  assetUsageCounts,
  coverVersion,
  trashContents,
  type ProjectState,
} from "@/core";
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
      `Hent inn igjen «${label}»`,
    );
    setMsg(
      e ? { kind: "error", text: e } : { kind: "ok", text: `«${label}» er hentet inn igjen.` },
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
      if (!r.ok) setMsg({ kind: "error", text: r.message });
      else {
        setMsg({
          kind: "ok",
          text: `Slettet for godt: ${purging.label}.${r.leftoverFiles ? ` ${r.leftoverFiles} filer ble liggende i lagringen.` : ""}`,
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

  const row = "flex items-center gap-2 border-b border-border px-2 py-1.5 last:border-b-0";
  const thumb =
    "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-3";

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Trash2 className="size-4" aria-hidden /> Slettede objekter
          </DialogTitle>
          <DialogDescription>
            Hent inn igjen det du trenger. Eieren kan slette for godt – det kan ikke angres, og
            filene forsvinner fra lagringen.
          </DialogDescription>
        </DialogHeader>
        {empty ? (
          <p className="text-[13px] text-text-secondary">Ingenting er slettet.</p>
        ) : (
          <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto">
            {trash.assets.length ? (
              <section aria-label="Slettede ressurser">
                <h3 className="pb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
                  Ressurser ({trash.assets.length})
                </h3>
                <ul className="border border-border bg-surface-1">
                  {trash.assets.map((a) => {
                    const v = coverVersion(state, a.id);
                    const use = assetUsageCounts(state, a.id);
                    return (
                      <li key={a.id} className={row}>
                        <span className={thumb}>
                          {v && urls[v.mediaPath] ? (
                            <img
                              src={urls[v.mediaPath]}
                              alt=""
                              className="size-full object-cover"
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
                              ? ` · brukes fortsatt i ${[
                                  use.layers ? `${use.layers} lag` : "",
                                  use.audio ? `${use.audio} lydklipp` : "",
                                ]
                                  .filter(Boolean)
                                  .join(" og ")}`
                              : ""}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!editable || busy}
                          onClick={() => restore("asset", a.id, a.name)}
                        >
                          <ArchiveRestore /> Hent inn igjen
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!isOwner || busy}
                          title={
                            isOwner ? "Slett for godt" : "Bare prosjektets eier kan slette for godt"
                          }
                          onClick={() =>
                            setPurging({ assets: [a.id], versions: [], label: a.name })
                          }
                          className="text-status-danger"
                        >
                          <Trash2 /> For godt …
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            {trash.versions.length ? (
              <section aria-label="Slettede bilder">
                <h3 className="pb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
                  Bilder ({trash.versions.length})
                </h3>
                <ul className="border border-border bg-surface-1">
                  {trash.versions.map(({ asset, version }) => {
                    const variant = state.assetVariants[version.variantId];
                    const label = `${asset.name} – ${variant?.name ?? ""} v${version.number}`;
                    return (
                      <li key={version.id} className={row}>
                        <span className={thumb}>
                          {urls[version.mediaPath] ? (
                            <img
                              src={urls[version.mediaPath]}
                              alt=""
                              className="size-full object-cover"
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
                          <ArchiveRestore /> Hent inn igjen
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!isOwner || busy}
                          title={
                            isOwner ? "Slett for godt" : "Bare prosjektets eier kan slette for godt"
                          }
                          onClick={() => setPurging({ assets: [], versions: [version.id], label })}
                          className="text-status-danger"
                        >
                          <Trash2 /> For godt …
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
            aria-label="Bekreft sletting for godt"
            className="flex flex-col gap-2 rounded-sm border border-status-danger/60 bg-surface-1 p-2 text-xs"
          >
            <p className="text-text-primary">
              «{purging.label}» slettes for godt, med alle filene. Det kan ikke angres.
              AI-jobbloggen beholdes. Vil du slette?
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => void purge()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Slett for godt
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPurging(null)} disabled={busy}>
                Avbryt
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
            Lukk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
