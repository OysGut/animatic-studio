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
import { tm, ASSET_KIND_LABEL, REASON_LABEL, USAGE_LABEL, assetsInScene, coverVersion, librarySuggestions, pendingPlansFor, sceneContinuityVariant, versionsOf, type AssetVersion, type LibrarySuggestion, type ProjectState } from "@/core";
import { useImageUrls } from "@/app/library/asset-images";
import { SuggestionsDialog } from "@/app/library/SuggestionsDialog";
import { useAnalysisRows } from "@/app/library/entity-analysis-store";
import type { Commands } from "@/app/project/use-commands";
import { sceneSuggestions } from "./scene-suggestions";
import { AddElementDialog } from "./AddElementDialog";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

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
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
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
      t("app-scene-editor-scene-assets-panel.dismiss-plan.cmds-run.b0839a2c65bb"),
    );
  }

  return (
    <section
      aria-label={t("app-scene-editor-scene-assets-panel.scene-assets-panel.aria-label.c216e5855e18")}
      className="flex min-h-0 flex-col border-t border-border"
    >
      <PanelHeader as="h2" title={<>{t("app-scene-editor-scene-assets-panel.scene-assets-panel.title.c216e5855e18")} ({items.length})</>} />
      {canAdd ? (
        <div className="px-2 pb-1">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            data-testid="add-element-open"
            className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-border-control px-2 py-1 text-xs text-text-secondary hover:border-accent-brand hover:text-text-primary"
            title={t("app-scene-editor-scene-assets-panel.scene-assets-panel.title.49a0015491c5")}
          >
            <ListPlus className="size-3.5" aria-hidden />
            {t("app-scene-editor-scene-assets-panel.scene-assets-panel.button.c6f6d85cd670")}
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
                    : t("app-scene-editor-scene-assets-panel.scene-assets-panel.on-place.dffcfe73d28e")
                  : null
              }
              onNeedsImage={(assetId) => onOpenImage?.(assetId)}
            />
          ) : null}
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-text-tertiary">
          {t("app-scene-editor-scene-assets-panel.scene-assets-panel.p.75d0195185b5")}
          {missing.length
            ? t("app-scene-editor-scene-assets-panel.scene-assets-panel.p.f120d7837393")
            : t("app-scene-editor-scene-assets-panel.scene-assets-panel.p.9b456bec51ec")}
        </p>
      ) : (
        <>
          {onAdd && editable ? (
            <p className="px-3 pb-1 text-[11px] text-text-tertiary">
              {t("app-scene-editor-scene-assets-panel.scene-assets-panel.p.10f8674dcc1f")}
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
                  title={t("app-scene-editor-scene-assets-panel.asset-tooltip", {
  name: asset.name,
  kind: ASSET_KIND_LABEL[asset.kind],
  usage: how === "planned" ? t("app-scene-editor-scene-assets-panel.asset-tooltip-planned") : USAGE_LABEL[how],
  look: lookName ? t("app-scene-editor-scene-assets-panel.asset-tooltip-look", { look: lookName }) : "",
  scene: inScene ? (inScene > 1 ? t("app-scene-editor-scene-assets-panel.asset-tooltip-in-scene-layers", { count: inScene }) : t("app-scene-editor-scene-assets-panel.asset-tooltip-in-scene")) : t("app-scene-editor-scene-assets-panel.asset-tooltip-not-in-scene"),
})}
                  data-planned={plan ? true : undefined}
                  className={
                    "group relative flex flex-col overflow-hidden rounded-sm border bg-surface-2 " +
                    (inScene
                      ? "border-accent-brand ring-1 ring-accent-brand/60 "
                      : plan
                        ? "border-accent-warm ring-2 ring-accent-warm "
                        : "border-border ") +
                    (draggable ? "cursor-grab active:cursor-grabbing" : "")
                  }
                >
                  {inScene ? (
                    <span
                      className="absolute left-1 top-1 z-[1] inline-flex items-center gap-0.5 rounded-sm bg-accent-brand px-1 text-[11px] font-medium text-accent-fg"
                      aria-label={inScene > 1 ? t("app-scene-editor-scene-assets-panel.in-scene-layers", { count: inScene }) : t("app-scene-editor-scene-assets-panel.in-scene")}
                    >
                      <Check className="size-3" aria-hidden />
                      {t("app-scene-editor-scene-assets-panel.scene-assets-panel.span.84081f3271ac")}
                      {inScene > 1 ? ` ×${inScene}` : ""}
                    </span>
                  ) : null}
                  {plan ? (
                    <span
                      className="absolute left-1 top-1 z-[1] rounded-sm bg-accent-warm px-1 text-[11px] font-medium text-accent-fg"
                      title={t("app-scene-editor-scene-assets-panel.scene-assets-panel.title.501fbbe5c1d6", { value1: String(plan.fromNumber ?? "?"), value2: String(new Date(plan.plan.at).toLocaleDateString()) })}
                    >
                      {t("app-scene-editor-scene-assets-panel.scene-assets-panel.span.2e00be8d554d")}
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
                    title={t("app-scene-editor-scene-assets-panel.scene-assets-panel.title.2ba113735f61", { name: String(asset.name) })}
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
                    {v ? "" : t("app-scene-editor-scene-assets-panel.scene-assets-panel.span.a8687a2115f9")}
                  </span>
                  {plan ? (
                    <span className="flex items-start gap-1 px-1.5 pb-1 text-[11px] leading-tight text-accent-warm">
                      <span className="min-w-0 flex-1">
                        {t("app-scene-editor-scene-assets-panel.scene-assets-panel.span.c668abfe3087", { value1: String(plan.fromNumber ?? "?") })}
                      </span>
                      {canAdd ? (
                        <button
                          type="button"
                          onClick={() => dismissPlan(asset.id, plan.plan.taskId)}
                          aria-label={t("app-scene-editor-scene-assets-panel.scene-assets-panel.aria-label.24e20a199d4b", { name: String(asset.name) })}
                          title={t("app-scene-editor-scene-assets-panel.scene-assets-panel.title.1e5e305b7c6c")}
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
                      aria-label={t("app-scene-editor-scene-assets-panel.scene-assets-panel.aria-label.43094da3ff38", { name: String(asset.name) })}
                      title={t("app-scene-editor-scene-assets-panel.scene-assets-panel.title.5ed0f640b38d")}
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
              {t("app-scene-editor-scene-assets-panel.scene-assets-panel.h3.694c49902c4a")} (
              {missing.length})
            </h3>
            {canAdd && missing.length > 1 ? (
              <button
                type="button"
                onClick={() => setAdding(missing)}
                className="shrink-0 rounded-sm px-1 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                title={t("app-scene-editor-scene-assets-panel.scene-assets-panel.title.dc7d1cea43de")}
              >
                {t("app-scene-editor-scene-assets-panel.scene-assets-panel.button.1ec1737703b3")}
              </button>
            ) : null}
          </div>
          <ul className="flex flex-col gap-0.5">
            {missing.map((x) => (
              <li
                key={`${x.reason}|${x.name}`}
                className="flex flex-col rounded-sm border border-dashed border-border px-1.5 py-0.5"
                title={t("app-scene-editor-scene-assets-panel.suggestion-tooltip", {
  name: x.name,
  kind: ASSET_KIND_LABEL[x.kind],
  uncertainKind: x.kindUncertain ? t("app-scene-editor-scene-assets-panel.suggestion-tooltip-uncertain-kind") : "",
  reason: REASON_LABEL[x.reason],
  match: x.possibleMatch ? t("app-scene-editor-scene-assets-panel.suggestion-tooltip-match", { name: x.possibleMatch.assetName }) : "",
  uncertain: x.uncertain ? t("app-scene-editor-scene-assets-panel.suggestion-tooltip-uncertain") : "",
})}
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
                    {x.possibleMatch ? t("app-scene-editor-scene-assets-panel.scene-assets-panel.span.de5c64015780") : ""}
                  </span>
                </span>
                <span className="text-[11px] text-text-tertiary">
                  {x.confidence === "high" ? t("app-scene-editor-scene-assets-panel.scene-assets-panel.span.fd6c14246164") : x.confidence === "medium" ? t("app-scene-editor-scene-assets-panel.scene-assets-panel.span.3b503adb6eba") : t("app-scene-editor-scene-assets-panel.scene-assets-panel.span.17379c38fb01")}
                </span>
                {x.evidence ? <p className="break-words text-xs text-text-secondary">{tm(x.evidence)}</p> : null}
                {canAdd ? (
                  <button
                    type="button"
                    onClick={() => setAdding([x])}
                    aria-description={t("app-scene-editor-scene-assets-panel.scene-assets-panel.aria-label.7de2fa32ce9f", { name: String(x.name) })}
                    title={t("app-scene-editor-scene-assets-panel.scene-assets-panel.title.c66cc4a70eec")}
                    className="inline-flex items-center gap-1 self-start rounded-sm px-0.5 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                  >
                    <BookPlus className="size-3.5" aria-hidden />
                    {t("app-scene-editor-scene-assets-panel.scene-assets-panel.button.c66cc4a70eec")}
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
