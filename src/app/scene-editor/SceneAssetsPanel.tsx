/**
 * «I denne scenen» (DEC-0037): karakterene, stedene og objektene fra biblioteket som er brukt i scenen.
 * Dra en ressurs inn på lerretet for å legge den øverst i lagene, eller bruk «+». Klikk på navnet åpner
 * ressursen i biblioteket, der bilder lastes opp (og senere genereres).
 * Navn fra manuset i scenen som ikke finnes i biblioteket ennå, vises under (KI-49), med «Legg til i
 * biblioteket» – samme forslag og samme dialog som «Forslag fra manuset» i biblioteket. Ingenting legges
 * til før brukeren velger det.
 */
import { useNavigate } from "@tanstack/react-router";
import { BookPlus, Check, Plus } from "lucide-react";
import { AssetSymbolIcon } from "@/app/library/AssetSymbolIcon";
import { memo, useMemo, useState } from "react";
import {
  ASSET_KIND_LABEL,
  REASON_LABEL,
  USAGE_LABEL,
  assetsInScene,
  coverVersion,
  librarySuggestions,
  sceneContinuityVariant,
  versionsOf,
  type AssetVersion,
  type LibrarySuggestion,
  type ProjectState,
} from "@/core";
import { useImageUrls } from "@/app/library/asset-images";
import { SuggestionsDialog } from "@/app/library/SuggestionsDialog";
import type { Commands } from "@/app/project/use-commands";
import { sceneSuggestions } from "./scene-suggestions";

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
  const items = useMemo(
    () => assetsInScene(state, productionId, occurrenceId),
    [state, productionId, occurrenceId],
  );
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
    () => sceneSuggestions(state, productionId, occurrenceId, allSuggestions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSuggestions, occurrenceId],
  );
  /** Forslagene som vises i dialogen (ett navn, eller alle i scenen). */
  const [adding, setAdding] = useState<readonly LibrarySuggestion[] | null>(null);
  const canAdd = editable && !!cmds;

  return (
    <section aria-label="I denne scenen" className="flex min-h-0 flex-col border-t border-border">
      <h2 className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-[0.04em] text-text-tertiary">
        I denne scenen ({items.length})
      </h2>
      {items.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-text-tertiary">
          Ingen ressurser fra biblioteket er funnet i scenen.
          {missing.length
            ? " Navnene fra manuset under kan legges til i biblioteket."
            : " Legg dem til i Ressursbiblioteket (for eksempel med «Forslag fra manuset»)."}
        </p>
      ) : (
        <>
          {onAdd && editable ? (
            <p className="px-3 pb-1 text-[11px] text-text-tertiary">Dra inn på lerretet.</p>
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
                  title={`${asset.name} – ${ASSET_KIND_LABEL[asset.kind]}, ${USAGE_LABEL[how]}${lookName ? `. Utseende i denne scenen (kontinuitet): ${lookName}` : ""}${inScene ? `. Lagt inn i scenen${inScene > 1 ? ` (${inScene} lag)` : ""}` : ". Ikke lagt inn i scenen ennå"}.\nDobbeltklikk: velg eller generer bilde`}
                  className={
                    "group relative flex flex-col overflow-hidden rounded-sm border bg-surface-2 " +
                    (inScene
                      ? "border-accent-brand ring-1 ring-accent-brand/60 "
                      : "border-border opacity-80 ") +
                    (draggable ? "cursor-grab active:cursor-grabbing" : "")
                  }
                >
                  {inScene ? (
                    <span
                      className="absolute left-1 top-1 z-[1] inline-flex items-center gap-0.5 rounded-sm bg-accent-brand px-1 text-[11px] font-medium text-accent-fg"
                      aria-label={`I scenen${inScene > 1 ? `, ${inScene} lag` : ""}`}
                    >
                      <Check className="size-3" aria-hidden />I scenen
                      {inScene > 1 ? ` ×${inScene}` : ""}
                    </span>
                  ) : null}
                  <div className="flex h-16 items-center justify-center bg-surface-3">
                    {url ? (
                      <img
                        src={url}
                        alt=""
                        draggable={false}
                        className="h-full w-full object-contain"
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
                    title={`Åpne «${asset.name}» i biblioteket (bilder og varianter)`}
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
                    {v ? "" : " · uten bilde"}
                  </span>
                  {onAdd && editable ? (
                    <button
                      type="button"
                      onClick={() => onAdd(asset.id)}
                      aria-label={`Legg «${asset.name}» inn i scenen`}
                      title="Legg inn i scenen"
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
            <h3 className="min-w-0 flex-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
              Fra manuset, ikke i biblioteket ({missing.length})
            </h3>
            {canAdd && missing.length > 1 ? (
              <button
                type="button"
                onClick={() => setAdding(missing)}
                className="shrink-0 rounded-sm px-1 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                title="Gå gjennom alle navnene fra denne scenen"
              >
                Alle …
              </button>
            ) : null}
          </div>
          <ul className="flex flex-col gap-0.5">
            {missing.map((x) => (
              <li
                key={`${x.reason}|${x.name}`}
                className="flex flex-col rounded-sm border border-dashed border-border px-1.5 py-0.5"
                title={`${x.name} – ${ASSET_KIND_LABEL[x.kind]}${x.kindUncertain ? " (usikker type)" : ""}, ${REASON_LABEL[x.reason]}${x.possibleMatch ? `. Kanskje samme som «${x.possibleMatch.assetName}»` : ""}${x.uncertain ? ". Usikkert forslag" : ""}`}
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
                    {x.possibleMatch ? " · mulig treff" : ""}
                  </span>
                </span>
                {canAdd ? (
                  <button
                    type="button"
                    onClick={() => setAdding([x])}
                    aria-label={`Legg «${x.name}» til i biblioteket`}
                    title="Legg til i biblioteket"
                    className="inline-flex items-center gap-1 self-start rounded-sm px-0.5 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                  >
                    <BookPlus className="size-3.5" aria-hidden />
                    Legg til i biblioteket
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
