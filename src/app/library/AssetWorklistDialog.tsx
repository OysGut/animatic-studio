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
import {
  assetWorklist,
  filmClips,
  keepWorkItemCommand,
  L,
  localized,
  newId,
  newVersionWorkItemCommands,
  type ProjectState,
  type WorkItem,
} from "@/core";
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

const KIND_LABEL: Record<WorkItem["kind"], string> = localized({
  layer: ["2D-scene", "2D scene"],
  still: ["Stillbilde", "Still image"],
  ai: ["AI-video", "AI video"],
});

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
      ? L(`Scene ${x.sceneNumber ?? "–"}`, `Scene ${x.sceneNumber ?? "–"}`)
      : L("2D-scene uten scene i filmen", "2D scene with no scene in the film");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {L("Arbeidsliste – oppdaterte ressurser", "Worklist – updated assets")}
            {assetId ? ` (${state.assets[assetId]?.name ?? ""})` : ""}
          </DialogTitle>
          <DialogDescription>
            {L(
              "Scenene som fortsatt viser en eldre versjon. Gå gjennom én og én og velg om den nye versjonen skal brukes. Ingenting endres uten at du velger det, og AI-video lages aldri på nytt av seg selv.",
              "The scenes that still show an older version. Go through them one by one and choose whether the new version should be used. Nothing changes unless you choose it, and AI video is never made again by itself.",
            )}
          </DialogDescription>
        </DialogHeader>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 text-[13px] text-text-secondary">
            <Check className="size-4 text-status-success" aria-hidden />{" "}
            {L(
              "Ingen scener står igjen – alt viser den godkjente versjonen, eller du har valgt å beholde.",
              "No scenes are left – everything shows the approved version, or you have chosen to keep it.",
            )}
          </p>
        ) : (
          <div className="grid grid-cols-[minmax(220px,280px)_1fr] gap-4">
            <ol
              aria-label={L("Berørte scener", "Affected scenes")}
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
                      {sceneText(x)} · {state.assets[x.assetId]?.name ?? L("Ressurs", "Asset")}
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
                  {L("viser", "shows")} {asset?.name ?? L("ressursen", "the asset")} v
                  {oldV?.number ?? "?"}. {L("Godkjent nå: v", "Approved now: v")}
                  {newV?.number ?? "?"}.
                  <span className="ml-2 text-xs text-text-tertiary">
                    {index + 1} {L("av", "of")} {items.length}
                  </span>
                </p>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <figure className="flex flex-col gap-1">
                    <img
                      src={oldV ? urls.data?.[oldV.mediaPath] : undefined}
                      alt={L(
                        `Versjon ${oldV?.number ?? ""} nå i scenen`,
                        `Version ${oldV?.number ?? ""} now in the scene`,
                      )}
                      className="aspect-video w-full bg-media object-contain"
                    />
                    <figcaption className="text-[11px] text-text-tertiary">
                      {L("Nå i scenen", "Now in the scene")} (v{oldV?.number})
                    </figcaption>
                  </figure>
                  <ArrowRight className="size-4 text-text-tertiary" aria-hidden />
                  <figure className="flex flex-col gap-1">
                    <img
                      src={newV ? urls.data?.[newV.mediaPath] : undefined}
                      alt={L(
                        `Godkjent versjon ${newV?.number ?? ""}`,
                        `Approved version ${newV?.number ?? ""}`,
                      )}
                      className="aspect-video w-full bg-media object-contain"
                    />
                    <figcaption className="text-[11px] text-text-tertiary">
                      {L("Godkjent", "Approved")} (v{newV?.number})
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
                          L(
                            `Bruk ${asset?.name ?? "ressursen"} v${newV?.number ?? ""} i ${sceneText(item).toLowerCase()}`,
                            `Use ${asset?.name ?? "the asset"} v${newV?.number ?? ""} in ${sceneText(item).toLowerCase()}`,
                          ),
                        )
                      }
                    >
                      <Check /> {L("Bruk ny versjon her", "Use the new version here")}
                    </Button>
                  ) : null}
                  {editable && item.kind === "ai" && item.occurrenceId ? (
                    <Button size="sm" variant="secondary" asChild>
                      <Link
                        to="/prosjekt/$projectId/montering"
                        params={{ projectId }}
                        search={{ scene: item.occurrenceId }}
                        title={L(
                          "Åpner scenen i monteringen. Der starter du genereringen selv, med pris først.",
                          "Opens the scene in the assembly. There you start the generation yourself, with the price first.",
                        )}
                      >
                        <AiGlyph /> {L("Lag ny video …", "Make new video …")}
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
                          L(
                            `Behold eldre versjon i ${sceneText(item).toLowerCase()}`,
                            `Keep older version in ${sceneText(item).toLowerCase()}`,
                          ),
                        );
                      }}
                      title={L(
                        "Scenen beholder det gamle bildet og forsvinner fra listen til en ny versjon godkjennes",
                        "The scene keeps the old image and disappears from the list until a new version is approved",
                      )}
                    >
                      {L("Behold", "Keep")}
                    </Button>
                  ) : null}
                  {item.occurrenceId && item.kind === "layer" ? (
                    <Button size="sm" variant="ghost" asChild>
                      <Link
                        to="/prosjekt/$projectId/scene"
                        params={{ projectId }}
                        search={{ scene: item.occurrenceId }}
                      >
                        <Layers /> {L("Åpne i sceneeditoren", "Open in the scene editor")}
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
                        <Clapperboard /> {L("Åpne i monteringen", "Open in the assembly")}
                      </Link>
                    </Button>
                  ) : null}
                </div>
                {item.kind === "ai" ? (
                  <p className="text-[11px] text-text-tertiary">
                    {L(
                      "Videoen ble laget med den eldre versjonen som referanse. En video kan ikke byttes ut automatisk; lag en ny i monteringen hvis du vil, eller behold den.",
                      "The video was made with the older version as a reference. A video cannot be replaced automatically; make a new one in the assembly if you want, or keep it.",
                    )}
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
