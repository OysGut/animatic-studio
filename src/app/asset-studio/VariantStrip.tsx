/**
 * Variantstripen i Asset Studio (AS2, A1): alle versjoner av ressursen på tvers av varianter (opplastet, AI og
 * redigert), gruppert per variant og merket med vinkel. Dra en miniatyr til objektets tidslinje for et nytt
 * bildesegment, eller klikk for å sette den inn på avspillingshodet (eller erstatte valgt segment).
 */
import { useMemo } from "react";
import {
  L,
  VERSION_VIEW_LABEL,
  variantsOf,
  versionsOf,
  type ProjectState,
  type VersionView,
} from "@/core";
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { Thumb } from "@/app/scene-editor/LayerImageDialog";

export const STUDIO_VERSION_DRAG_TYPE = "application/x-asset-studio-version";

export interface StripImage {
  readonly assetId: string;
  readonly assetVariantId: string;
  readonly versionId: string;
}

export function VariantStrip({
  state,
  assetId,
  urls,
  editable,
  replacing,
  onPick,
}: {
  state: ProjectState;
  assetId: string | null;
  urls: Readonly<Record<string, string>>;
  editable: boolean;
  /** Et segment er valgt: klikk erstatter bildet i det. */
  replacing: boolean;
  onPick: (img: StripImage) => void;
}) {
  const groups = useMemo(
    () =>
      assetId
        ? variantsOf(state, assetId)
            .filter((v) => !v.archived)
            .map((v) => ({ variant: v, versions: versionsOf(state, v.id) }))
            .filter((g) => g.versions.length > 0)
        : [],
    [state, assetId],
  );
  return (
    <section className="flex min-h-0 flex-col" data-testid="asset-studio-variants">
      <PanelHeader title={L("Varianter og bilder", "Variants and images")} />
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {groups.length === 0 ? (
          <p className="text-xs text-text-tertiary">
            {L(
              "Ressursen har ingen bilder ennå. Last opp eller lag et bilde med verktøyene over.",
              "The asset has no images yet. Upload or create an image with the tools above.",
            )}
          </p>
        ) : null}
        {groups.map(({ variant, versions }) => (
          <div key={variant.id} className="mb-3">
            <p className="mb-1 truncate text-[11px] font-medium text-text-secondary">
              {variant.name || L("Uten navn", "Without name")}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {versions.map((ver) => {
                const img = { assetId: assetId!, assetVariantId: variant.id, versionId: ver.id };
                const view = ver.view as VersionView | null | undefined;
                return (
                  <button
                    key={ver.id}
                    type="button"
                    disabled={!editable}
                    draggable={editable}
                    data-testid="asset-studio-version"
                    data-version-id={ver.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(STUDIO_VERSION_DRAG_TYPE, JSON.stringify(img));
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onPick(img)}
                    title={
                      replacing
                        ? L("Erstatt bildet i valgt segment", "Replace the image in the selected segment")
                        : L(
                            "Dra til tidslinjen, eller klikk for å sette inn på avspillingshodet",
                            "Drag to the timeline, or click to insert at the playhead",
                          )
                    }
                    className="flex flex-col overflow-hidden rounded-sm border border-border bg-surface-1 text-left hover:border-accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
                  >
                    <Thumb url={urls[ver.mediaPath]} />
                    <span className="flex items-center justify-between gap-1 px-1 py-0.5 text-[11px] text-text-tertiary">
                      <span>v{ver.number}</span>
                      {view ? (
                        <span className="truncate" data-testid="asset-studio-version-view">
                          {VERSION_VIEW_LABEL[view] ?? view}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
