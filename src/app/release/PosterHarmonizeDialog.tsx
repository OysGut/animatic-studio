/**
 * P8 (REQ-0400): «Harmoniser stil …» fra plakatmodulen. Viser bildet elementet bruker stort, med
 * harmoniseringen fremme; «Bruk bare her» setter versjonen på dette plakatelementet alene (REQ-0141).
 */
import { coverVersion, type PosterElement, type ProjectState } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { ImageLightbox } from "@/app/library/ImageLightbox";
import { useImageUrls } from "@/app/library/asset-images";

export function PosterHarmonizeDialog({
  state,
  cmds,
  projectId,
  editable,
  element,
  onUseHere,
  onClose,
}: {
  state: ProjectState;
  cmds: Commands;
  projectId: string;
  editable: boolean;
  element: PosterElement | null;
  onUseHere: (patch: Partial<PosterElement>) => void;
  onClose: () => void;
}) {
  const asset = element?.assetId ? state.assets[element.assetId] : undefined;
  const version =
    (element?.versionId ? state.assetVersions[element.versionId] : undefined) ??
    (asset ? coverVersion(state, asset.id) : null) ??
    null;
  const urls = useImageUrls(version ? [version.mediaPath] : []);
  return (
    <ImageLightbox
      initialPanel="harmonize"
      open={!!version && !!asset}
      onOpenChange={(o) => !o && onClose()}
      projectId={projectId}
      version={version}
      url={version ? urls.data?.[version.mediaPath] : undefined}
      title={asset?.name ?? ""}
      {...(asset
        ? {
            tools: {
              state,
              cmds,
              asset,
              editable,
              ...(editable
                ? {
                    onUseHere: (versionId: string) => {
                      const v = (cmds.current() ?? state).assetVersions[versionId];
                      if (v) onUseHere({ assetVariantId: v.variantId as never, versionId: versionId as never });
                    },
                  }
                : {}),
            },
          }
        : {})}
    />
  );
}
