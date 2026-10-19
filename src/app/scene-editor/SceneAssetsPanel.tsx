/**
 * «I denne scenen» (DEC-0037): karakterene, stedene og objektene fra biblioteket som er brukt i scenen.
 * Dra en ressurs inn på lerretet for å legge den øverst i lagene, eller bruk «+». Klikk på navnet åpner
 * ressursen i biblioteket, der bilder lastes opp (og senere genereres).
 * Navn fra manuset i scenen som ikke finnes i biblioteket ennå, vises under (KI-49), med «Legg til i
 * biblioteket» – samme forslag og samme dialog som «Forslag fra manuset» i biblioteket. Ingenting legges
 * til før brukeren velger det.
 */
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { useNavigate } from "@tanstack/react-router";
import { BookPlus, Check, ListPlus, Plus, X } from "lucide-react";
import { AssetSymbolIcon } from "@/app/library/AssetSymbolIcon";
import { memo, useMemo, useState } from "react";
import {
  L,
  ASSET_KIND_LABEL,
  REASON_LABEL,
  USAGE_LABEL,
  assetsInScene,
  coverVersion,
  librarySuggestions,
  pendingPlansFor,
  sceneContinuityVariant,
  versionsOf,
  type AssetVersion,
  type LibrarySuggestion,
  type ProjectState,
} from "@/core";
import { useImageUrls } from "@/app/library/asset-images";
import { SuggestionsDialog } from "@/app/library/SuggestionsDialog";
import { useAnalysisRows } from "@/app/library/entity-analysis-store";
import type { Commands } from "@/app/project/use-commands";
import { sceneSuggestions } from "./scene-suggestions";
import { AddElementDialog } from "./AddElementDialog";

/** Datatype for dra-og-slipp fra panelet til lerretet (verdien er ressursens ID). */
export const ASSET_DRAG_TYPE = "application/x-animatic-asset";

export const SceneAssetsPanel = memo(function SceneAssetsPanel({
  state,
  projectId,
  productionId,
  occurrenceId,
  editable,
  onAdd,
  cmds,
  layersByAsset,
  onOpenImage,
}: {
  state: ProjectState;
  projectId: string;
  productionId: string;
  occurrenceId: string;
  editable: boolean;
  /** Legg ressursen inn i scenen (øverst, midt i bildet). null = ingen 2D-scene ennå. */
  onAdd: ((assetId: string) => unknown) | null;
  /** Lagene hver ressurs har i 2D-scenen (DEC-0079): ressurser som alt er lagt inn, merkes. */
  layersByAsset?: ReadonlyMap<string, readonly string[]>;
  /** Dobbeltklikk: samme bildevalg som dobbeltklikk på laget i scenen (DEC-0079). */
  onOpenImage?: (assetId: string) => void;
  /** For «Legg til i biblioteket» (KI-49). Uten den vises navnene uten knapp. */
  cmds?: Commands;
}) {
  const navigate = useNavigate();
  const analysis = useAnalysisRows(projectId);
  // Elementer som skal inn i scenen fra en annen scene (DEC-0088): gul ramme til de er dratt inn
  const pending = useMemo(() => pendingPlansFor(state, occurrenceId), [state, occurrenceId]);
  const pendingById = useMemo(() => new Map(pending.map((p) => [p.asset.id, p])), [pending]);
  const items = useMemo(() => {
    const list = assetsInScene(state, productionId, occurrenceId);
    const seen = new Set(list.map((x) => x.asset.id));
    // Planlagte elementer som ikke nevnes i scenen, kommer først
    return [
      ...pending
        .filter((p) => !seen.has(p.asset.id))
        .map((p) => ({ asset: p.asset, how: "planned" as const })),
      ...list,
    ];
  }, [state, productionId, occurrenceId, pending]);
  const [addOpen, setAddOpen] = useState(false);
  // Bildet som vises: utseendet kontinuiteten gir i scenen (DEC-0055), ellers forsidebildet
  const sceneVariantId = state.occurrences[occurrenceId]?.variantId ?? null;
  const looks = useMemo(() => {
    const m = new Map<string, { variantId: string | null; version: AssetVersion | null }>();
    for (const { asset } of items) {
      const variantId = sceneVariantId
        ? sceneContinuityVariant(state, asset.id, sceneVariantId)
        : null;
      const va = variantId ? state.assetVariants[variantId] : undefined;
      const own = va
        ? va.approvedVersionId
          ? (state.assetVersions[va.approvedVersionId] ?? null)
          : (versionsOf(state, va.id)[0] ?? null)
        : null;
      m.set(asset.id, { variantId, version: own ?? coverVersion(state, asset.id) });
    }
    return m;
  }, [items, state, sceneVariantId]);
  const paths = useMemo(
    () => [...looks.values()].flatMap((l) => (l.version ? [l.version.mediaPath] : [])),
    [looks],
  );
  const urls = useImageUrls(paths);
  // Navn fra manuset i scenen som ikke er i biblioteket (KI-49). Avhenger bare av manus og bibliotek, så
  // redigering av lag og kamera regner ikke forslagene på nytt.
  const allSuggestions = useMemo(
    () => librarySuggestions(state, productionId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.assets, state.occurrences, state.blocks, state.variants, productionId],
  );
  const missing = useMemo(
    () => sceneSuggestions(state, productionId, occurrenceId, allSuggestions, analysis),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSuggestions, occurrenceId, analysis],
  );
  /** Forslagene som vises i dialogen (ett navn, eller alle i scenen). */
  const [adding, setAdding] = useState<readonly LibrarySuggestion[] | null>(null);
  const canAdd = editable && !!cmds;
  function dismissPlan(assetId: string, taskId: string) {
    cmds?.run(
      {
        type: "RemoveScenePlans",
        assetId: assetId as never,
        taskId,
        occurrenceIds: [occurrenceId],
      },
      L("Fjern fra listen over det som skal inn", "Remove from the list of what should be added"),
    );
  }

  return (
    <section
      aria-label={L("I denne scenen", "In this scene")}
      className="flex min-h-0 flex-col border-t border-border"
    >
      <PanelHeader as="h2" title={<>{L("I denne scenen", "In this scene")} ({items.length})</>} />
      {canAdd ? (
        <div className="px-2 pb-1">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            data-testid="add-element-open"
            className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-border-control px-2 py-1 text-xs text-text-secondary hover:border-accent-brand hover:text-text-primary"
            title={L(
              "Velg fra biblioteket, eller lag noe nytt som ikke står i manuset",
              "Choose from the library, or make something new that is not in the script",
            )}
          >
            <ListPlus className="size-3.5" aria-hidden />
            {L("Legg til element i scenen …", "Add element to the scene …")}
          </button>
          {addOpen && cmds ? (
            <AddElementDialog
              open
              onOpenChange={setAddOpen}
              state={state}
              productionId={productionId}
              occurrenceId={occurrenceId}
              cmds={cmds}
              onPlace={(assetId) =>
                onAdd
                  ? onAdd(assetId)
                    ? null
                    : L(
                        "Elementet kunne ikke legges inn i scenen.",
                        "The element could not be added to the scene.",
                      )
                  : null
              }
              onNeedsImage={(assetId) => onOpenImage?.(assetId)}
            />
          ) : null}
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-text-tertiary">
          {L(
            "Ingen ressurser fra biblioteket er funnet i scenen.",
            "No assets from the library were found in the scene.",
          )}
          {missing.length
            ? L(
                " Navnene fra manuset under kan legges til i biblioteket.",
                " The names from the script below can be added to the library.",
              )
            : L(
                " Legg dem til i Ressursbiblioteket (for eksempel med «Forslag fra manuset»).",
                " Add them in the Asset library (for example with “Suggestions from the script”).",
              )}
        </p>
      ) : (
        <>
          {onAdd && editable ? (
            <p className="px-3 pb-1 text-[11px] text-text-tertiary">
              {L("Dra inn på lerretet.", "Drag onto the canvas.")}
            </p>
          ) : null}
          <ul className="grid grid-cols-2 gap-1.5 overflow-y-auto px-2 pb-2">
            {items.map(({ asset, how }) => {
              const look = looks.get(asset.id);
              const v = look?.version ?? null;
              const url = v ? urls.data?.[v.mediaPath] : undefined;
              const lookName = look?.variantId
                ? state.assetVariants[look.variantId]?.name
                : undefined;
              const draggable = !!onAdd && editable;
              const inScene = layersByAsset?.get(asset.id)?.length ?? 0;
              const plan = inScene ? undefined : pendingById.get(asset.id);
              return (
                <li
                  key={asset.id}
                  draggable={draggable}
                  onDoubleClick={() => onOpenImage?.(asset.id)}
                  data-in-scene={inScene > 0 || undefined}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  title={L(
                    `${asset.name} – ${ASSET_KIND_LABEL[asset.kind]}, ${how === "planned" ? "planlagt fra en annen scene" : USAGE_LABEL[how]}${lookName ? `. Utseende i denne scenen (kontinuitet): ${lookName}` : ""}${inScene ? `. Lagt inn i scenen${inScene > 1 ? ` (${inScene} lag)` : ""}` : ". Ikke lagt inn i scenen ennå"}.\nDobbeltklikk: velg eller generer bilde`,
                    `${asset.name} – ${ASSET_KIND_LABEL[asset.kind]}, ${how === "planned" ? "planned from another scene" : USAGE_LABEL[how]}${lookName ? `. Look in this scene (continuity): ${lookName}` : ""}${inScene ? `. In the scene${inScene > 1 ? ` (${inScene} layers)` : ""}` : ". Not yet added to the scene"}.\nDouble-click: choose or generate an image`,
                  )}
                  data-planned={plan ? true : undefined}
                  className={
                    "group relative flex flex-col overflow-hidden rounded-sm border bg-surface-2 " +
                    (inScene
                      ? "border-accent-brand ring-1 ring-accent-brand/60 "
                      : plan
                        ? "border-accent-warm ring-2 ring-accent-warm "
                        : "border-border opacity-80 ") +
                    (draggable ? "cursor-grab active:cursor-grabbing" : "")
                  }
                >
                  {inScene ? (
                    <span
                      className="absolute left-1 top-1 z-[1] inline-flex items-center gap-0.5 rounded-sm bg-accent-brand px-1 text-[11px] font-medium text-accent-fg"
                      aria-label={L(
                        `I scenen${inScene > 1 ? `, ${inScene} lag` : ""}`,
                        `In the scene${inScene > 1 ? `, ${inScene} layers` : ""}`,
                      )}
                    >
                      <Check className="size-3" aria-hidden />
                      {L("I scenen", "In the scene")}
                      {inScene > 1 ? ` ×${inScene}` : ""}
                    </span>
                  ) : null}
                  {plan ? (
                    <span
                      className="absolute left-1 top-1 z-[1] rounded-sm bg-accent-warm px-1 text-[11px] font-medium text-accent-fg"
                      title={L(
                        `Skal inn i scenen: lagt til fra scene ${plan.fromNumber ?? "?"} (${new Date(plan.plan.at).toLocaleDateString()}). Dra det inn på lerretet.`,
                        `Should be in the scene: added from scene ${plan.fromNumber ?? "?"} (${new Date(plan.plan.at).toLocaleDateString()}). Drag it onto the canvas.`,
                      )}
                    >
                      {L("Skal inn", "To add")}
                    </span>
                  ) : null}
                  <div className="flex h-16 items-center justify-center bg-surface-3">
                    {url ? (
                      <img
                        src={url}
                        alt=""
                        draggable={false}
                        className="h-full w-full object-contain p-1"
                      />
                    ) : (
                      <AssetSymbolIcon state={state} assetId={asset.id} className="size-10" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void navigate({
                        to: "/prosjekt/$projectId/bibliotek",
                        params: { projectId },
                        search: { asset: asset.id },
                      })
                    }
                    className="truncate px-1.5 pt-1 text-left text-[12px] text-text-primary hover:text-accent-brand hover:underline"
                    title={L(
                      `Åpne «${asset.name}» i biblioteket (bilder og varianter)`,
                      `Open “${asset.name}” in the library (images and variants)`,
                    )}
                  >
                    <AssetSymbolIcon
                      state={state}
                      assetId={asset.id}
                      className="mr-1 inline size-3 align-[-1px]"
                    />
                    {asset.name}
                  </button>
                  <span className="truncate px-1.5 pb-1 text-[11px] text-text-tertiary">
                    {lookName ? lookName : ASSET_KIND_LABEL[asset.kind]}
                    {v ? "" : L(" · uten bilde", " · no image")}
                  </span>
                  {plan ? (
                    <span className="flex items-start gap-1 px-1.5 pb-1 text-[11px] leading-tight text-accent-warm">
                      <span className="min-w-0 flex-1">
                        {L(
                          `Skal inn fordi det ble lagt til i scene ${plan.fromNumber ?? "?"}`,
                          `To be added because it was added in scene ${plan.fromNumber ?? "?"}`,
                        )}
                      </span>
                      {canAdd ? (
                        <button
                          type="button"
                          onClick={() => dismissPlan(asset.id, plan.plan.taskId)}
                          aria-label={L(
                            `Skal ikke inn i denne scenen: fjern «${asset.name}» fra listen`,
                            `Should not be in this scene: remove “${asset.name}” from the list`,
                          )}
                          title={L("Skal ikke inn her", "Should not be here")}
                          className="shrink-0 rounded-sm text-text-tertiary hover:text-text-primary"
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                  {onAdd && editable ? (
                    <button
                      type="button"
                      onClick={() => onAdd(asset.id)}
                      aria-label={L(
                        `Legg «${asset.name}» inn i scenen`,
                        `Add “${asset.name}” to the scene`,
                      )}
                      title={L("Legg inn i scenen", "Add to the scene")}
                      className="absolute right-1 top-1 hidden rounded-sm bg-surface-1/90 p-0.5 text-text-secondary hover:text-text-primary focus-visible:flex group-hover:flex [@media(hover:none)]:flex"
                    >
                      <Plus className="size-3.5" aria-hidden />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {missing.length ? (
        <div className="px-2 pb-2" data-testid="scene-missing-assets">
          <div className="flex items-center gap-1 px-1 pb-1">
            <h3 className="min-w-0 flex-1 text-chrome-label font-medium uppercase tracking-label text-text-tertiary">
              {L("Fra manuset, ikke i biblioteket", "From the script, not in the library")} (
              {missing.length})
            </h3>
            {canAdd && missing.length > 1 ? (
              <button
                type="button"
                onClick={() => setAdding(missing)}
                className="shrink-0 rounded-sm px-1 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                title={L(
                  "Gå gjennom alle navnene fra denne scenen",
                  "Go through all the names from this scene",
                )}
              >
                {L("Alle …", "All …")}
              </button>
            ) : null}
          </div>
          <ul className="flex flex-col gap-0.5">
            {missing.map((x) => (
              <li
                key={`${x.reason}|${x.name}`}
                className="flex flex-col rounded-sm border border-dashed border-border px-1.5 py-0.5"
                title={L(
                  `${x.name} – ${ASSET_KIND_LABEL[x.kind]}${x.kindUncertain ? " (usikker type)" : ""}, ${REASON_LABEL[x.reason]}${x.possibleMatch ? `. Kanskje samme som «${x.possibleMatch.assetName}»` : ""}${x.uncertain ? ". Usikkert forslag" : ""}`,
                  `${x.name} – ${ASSET_KIND_LABEL[x.kind]}${x.kindUncertain ? " (uncertain type)" : ""}, ${REASON_LABEL[x.reason]}${x.possibleMatch ? `. Possibly the same as “${x.possibleMatch.assetName}”` : ""}${x.uncertain ? ". Uncertain suggestion" : ""}`,
                )}
              >
                <span
                  className={
                    "truncate text-[12px] " +
                    (x.uncertain ? "text-text-tertiary" : "text-text-secondary")
                  }
                >
                  {x.name}
                  <span className="text-[11px] text-text-tertiary">
                    {" "}
                    · {ASSET_KIND_LABEL[x.kind]}
                    {x.possibleMatch ? L(" · mulig treff", " · possible match") : ""}
                  </span>
                </span>
                <span className="text-[11px] text-text-tertiary">
                  {x.confidence === "high" ? L("Sikker", "Confident") : x.confidence === "medium" ? L("Trolig", "Likely") : L("Usikker", "Uncertain")}
                </span>
                {x.evidence ? <p className="break-words text-xs text-text-secondary">{x.evidence}</p> : null}
                {canAdd ? (
                  <button
                    type="button"
                    onClick={() => setAdding([x])}
                    aria-label={L(
                      `Legg «${x.name}» til i biblioteket`,
                      `Add “${x.name}” to the library`,
                    )}
                    title={L("Legg til i biblioteket", "Add to the library")}
                    className="inline-flex items-center gap-1 self-start rounded-sm px-0.5 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                  >
                    <BookPlus className="size-3.5" aria-hidden />
                    {L("Legg til i biblioteket", "Add to the library")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {cmds && adding ? (
        <SuggestionsDialog
          open
          onOpenChange={(o) => {
            if (!o) setAdding(null);
          }}
          state={state}
          suggestions={adding}
          cmds={cmds}
          projectId={projectId}
        />
      ) : null}
    </section>
  );
}, sameExceptCommands);

/**
 * `cmds` er et nytt objekt for hver tegning av sceneeditoren (også under avspilling). Panelet tegnes derfor
 * ikke om bare fordi det endres; dialogen bruker `runAndWait`, som er stabil.
 */
function sameExceptCommands(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === "cmds") {
      if (!a[k] !== !b[k]) return false;
    } else if (!Object.is(a[k], b[k])) return false;
  }
  return true;
}
