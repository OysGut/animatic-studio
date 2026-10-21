/**
 * Arbeidsliste for oppdaterte ressurser (DEC-0072): scenene som fortsatt viser en eldre versjon av en ressurs,
 * gått gjennom én og én med gammelt og nytt bilde side om side. «Bruk ny versjon her» (2D-lag og stillbilder),
 * «Behold» (posten forsvinner til neste versjon godkjennes) og «Åpne …». AI-video lages aldri på nytt
 * automatisk: «Lag ny video …» åpner scenen i monteringen, der brukeren starter genereringen selv.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Clapperboard, Layers } from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { useMemo, useState } from "react";
import { assetWorklist, filmClips, keepWorkItemCommand, newId, newVersionWorkItemCommands, type ProjectState, type WorkItem } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { useAiJobs } from "@/app/ai/use-ai-jobs";
import { useImageUrls } from "./asset-images";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t, tLocalized } from "@/core/i18n/keyed";

const KIND_LABEL: Record<WorkItem["kind"], string> = tLocalized({ layer: "app-library-asset-worklist-dialog.kind-label.layer.bd7ceeafaf98", still: "app-library-asset-worklist-dialog.kind-label.still.758a3b9fa8c2", ai: "app-library-asset-worklist-dialog.kind-label.ai.cfbffbe42ad7" });

/** Antall poster i arbeidslisten (for knapper og varsler). */
export function useWorklistCount(
  state: ProjectState,
  projectId: string,
  productionId: string,
  assetId?: string,
): number {
  const jobs = useAiJobs(projectId);
  return useMemo(
    () =>
      assetWorklist(state, productionId, {
        ...(assetId ? { assetId } : {}),
        jobs: jobs.data?.jobs ?? [],
      }).length,
    [state, productionId, assetId, jobs.data],
  );
}

export function AssetWorklistDialog({
  open,
  onOpenChange,
  state,
  projectId,
  productionId,
  assetId,
  editable,
  cmds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  projectId: string;
  productionId: string;
  /** Bare denne ressursen (fra biblioteket), ellers alle. */
  assetId?: string;
  editable: boolean;
  cmds: Commands;
}) {
  const jobs = useAiJobs(projectId, open);
  const items = useMemo(
    () =>
      assetWorklist(state, productionId, {
        ...(assetId ? { assetId } : {}),
        jobs: jobs.data?.jobs ?? [],
      }),
    [state, productionId, assetId, jobs.data],
  );
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const index = Math.max(
    0,
    items.findIndex((x) => x.key === currentKey),
  );
  const item = items[index] ?? null;
  const paths = item
    ? [
        state.assetVersions[item.oldVersionId]?.mediaPath,
        state.assetVersions[item.newVersionId]?.mediaPath,
      ].filter((p): p is string => !!p)
    : [];
  const urls = useImageUrls(open ? paths : []);
  const asset = item ? state.assets[item.assetId] : undefined;
  const oldV = item ? state.assetVersions[item.oldVersionId] : undefined;
  const newV = item ? state.assetVersions[item.newVersionId] : undefined;
  const clip = useMemo(
    () =>
      item?.occurrenceId
        ? (filmClips(state, productionId).find((c) => c.occurrenceId === item.occurrenceId) ?? null)
        : null,
    [state, productionId, item?.occurrenceId],
  );

  function next() {
    const after = items[index + 1] ?? items[index - 1] ?? null;
    setCurrentKey(after?.key ?? null);
  }

  function runAll(list: readonly unknown[] | null, label: string) {
    if (!list || list.length === 0) return;
    setErr(null);
    const group = newId();
    for (const c of list) {
      const e = cmds.run(c as never, label, group);
      if (e) {
        setErr(e);
        return;
      }
    }
    next();
  }

  const sceneText = (x: WorkItem) => {
    const o = x.occurrenceId ? state.occurrences[x.occurrenceId] : undefined;
    return o
      ? t("app-library-asset-worklist-dialog.scene-text.message.6cd9d9647af4", { value1: String(x.sceneNumber ?? "–") })
      : t("app-library-asset-worklist-dialog.scene-text.message.2f16d5a47a67");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {t("app-library-asset-worklist-dialog.asset-worklist-dialog.dialog-title.74df3dde3e9c")}
            {assetId ? ` (${state.assets[assetId]?.name ?? ""})` : ""}
          </DialogTitle>
          <DialogDescription>
            {t("app-library-asset-worklist-dialog.asset-worklist-dialog.dialog-description.bc895287bfcd")}
          </DialogDescription>
        </DialogHeader>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 text-[13px] text-text-secondary">
            <Check className="size-4 text-status-success" aria-hidden />{" "}
            {t("app-library-asset-worklist-dialog.asset-worklist-dialog.p.88938589a7a6")}
          </p>
        ) : (
          <div className="grid grid-cols-[minmax(220px,280px)_1fr] gap-4">
            <ol
              aria-label={t("app-library-asset-worklist-dialog.asset-worklist-dialog.aria-label.252d479eee48")}
              className="max-h-[60vh] overflow-y-auto border border-border bg-surface-1"
            >
              {items.map((x, i) => (
                <li key={x.key}>
                  <button
                    type="button"
                    onClick={() => setCurrentKey(x.key)}
                    aria-current={i === index ? "true" : undefined}
                    className={
                      "flex w-full flex-col items-start gap-0.5 border-b border-border px-2 py-1.5 text-left text-xs " +
                      (i === index ? "bg-accent-selection/40" : "hover:bg-surface-2")
                    }
                  >
                    <span className="text-text-primary">
                      {sceneText(x)} · {state.assets[x.assetId]?.name ?? t("app-library-asset-worklist-dialog.asset-worklist-dialog.span.c2a3e9453200")}
                    </span>
                    <span className="text-[11px] text-text-tertiary">
                      {KIND_LABEL[x.kind]}: {x.label}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {item ? (
              <div className="flex min-w-0 flex-col gap-3">
                <p className="text-[13px] text-text-primary">
                  <strong>{sceneText(item)}</strong> · {KIND_LABEL[item.kind]} «{item.label}»{" "}
                  {t("app-library-asset-worklist-dialog.asset-worklist-dialog.p.886aa844725b")} {asset?.name ?? t("app-library-asset-worklist-dialog.asset-worklist-dialog.p.4a0d1bc6b404")} v
                  {oldV?.number ?? "?"}. {t("app-library-asset-worklist-dialog.asset-worklist-dialog.p.c6800fb4cb6c")}
                  {newV?.number ?? "?"}.
                  <span className="ml-2 text-xs text-text-tertiary">
                    {index + 1} {t("app-library-asset-worklist-dialog.asset-worklist-dialog.span.eacc55c73d06")} {items.length}
                  </span>
                </p>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <figure className="flex flex-col gap-1">
                    <img
                      src={oldV ? urls.data?.[oldV.mediaPath] : undefined}
                      alt={t("app-library-asset-worklist-dialog.asset-worklist-dialog.alt.e259cc2e67bc", { value1: String(oldV?.number ?? "") })}
                      className="aspect-video w-full bg-media object-contain"
                    />
                    <figcaption className="text-[11px] text-text-tertiary">
                      {t("app-library-asset-worklist-dialog.asset-worklist-dialog.figcaption.b8549f730d8e")} (v{oldV?.number})
                    </figcaption>
                  </figure>
                  <ArrowRight className="size-4 text-text-tertiary" aria-hidden />
                  <figure className="flex flex-col gap-1">
                    <img
                      src={newV ? urls.data?.[newV.mediaPath] : undefined}
                      alt={t("app-library-asset-worklist-dialog.asset-worklist-dialog.alt.4c9b8b2ffea0", { value1: String(newV?.number ?? "") })}
                      className="aspect-video w-full bg-media object-contain"
                    />
                    <figcaption className="text-[11px] text-text-tertiary">
                      {t("app-library-asset-worklist-dialog.asset-worklist-dialog.figcaption.e05d24939499")} (v{newV?.number})
                    </figcaption>
                  </figure>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editable && item.kind !== "ai" ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        runAll(
                          newVersionWorkItemCommands(state, item, clip, () => newId()),
                          t("app-library-asset-worklist-dialog.use-version-in", { asset: asset?.name ?? t("app-library-asset-worklist-dialog.use-version-in-asset"), version: newV?.number ?? "", scene: sceneText(item).toLowerCase() }),
                        )
                      }
                    >
                      <Check /> {t("app-library-asset-worklist-dialog.asset-worklist-dialog.button.62f839c2a0f7")}
                    </Button>
                  ) : null}
                  {editable && item.kind === "ai" && item.occurrenceId ? (
                    <Button size="sm" variant="secondary" asChild>
                      <Link
                        to="/prosjekt/$projectId/montering"
                        params={{ projectId }}
                        search={{ scene: item.occurrenceId }}
                        title={t("app-library-asset-worklist-dialog.asset-worklist-dialog.title.55dd13100162")}
                      >
                        <AiGlyph /> {t("app-library-asset-worklist-dialog.asset-worklist-dialog.link.50aa0146475a")}
                      </Link>
                    </Button>
                  ) : null}
                  {editable ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const c = keepWorkItemCommand(state, item);
                        runAll(
                          c ? [c] : null,
                          t("app-library-asset-worklist-dialog.asset-worklist-dialog.run-all.e66660ceb126", { value1: String(sceneText(item).toLowerCase()) }),
                        );
                      }}
                      title={t("app-library-asset-worklist-dialog.asset-worklist-dialog.title.da3cac579a30")}
                    >
                      {t("app-library-asset-worklist-dialog.asset-worklist-dialog.button.043cc60ba630")}
                    </Button>
                  ) : null}
                  {item.occurrenceId && item.kind === "layer" ? (
                    <Button size="sm" variant="ghost" asChild>
                      <Link
                        to="/prosjekt/$projectId/scene"
                        params={{ projectId }}
                        search={{ scene: item.occurrenceId }}
                      >
                        <Layers /> {t("app-library-asset-worklist-dialog.asset-worklist-dialog.link.a2a875090ae1")}
                      </Link>
                    </Button>
                  ) : null}
                  {item.occurrenceId ? (
                    <Button size="sm" variant="ghost" asChild>
                      <Link
                        to="/prosjekt/$projectId/montering"
                        params={{ projectId }}
                        search={{ scene: item.occurrenceId }}
                      >
                        <Clapperboard /> {t("app-library-asset-worklist-dialog.asset-worklist-dialog.link.d2f3644f103f")}
                      </Link>
                    </Button>
                  ) : null}
                </div>
                {item.kind === "ai" ? (
                  <p className="text-[11px] text-text-tertiary">
                    {t("app-library-asset-worklist-dialog.asset-worklist-dialog.p.a9778864a253")}
                  </p>
                ) : null}
                {err ? (
                  <p role="alert" className="text-xs text-status-danger">
                    {err}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
