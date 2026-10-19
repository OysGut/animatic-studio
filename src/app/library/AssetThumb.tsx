/**
 * U5 (punkt 3): miniatyrbilde av ressursen (godkjent bilde, ellers nyeste) i lister. Uten bilde vises
 * ressursens symbol (DEC-0079), og lyd får notesymbol. Lenkene hentes samlet med useAssetCovers.
 */
import { useMemo } from "react";
import { Music } from "lucide-react";
import { coverVersion, type ProjectState } from "@/core";
import { cn } from "@/lib/utils";
import { AssetSymbolIcon } from "./AssetSymbolIcon";
import { useImageUrls } from "./asset-images";

/** Midlertidige lenker til forsidebildene for ressursene (assetId → URL). */
export function useAssetCovers(state: ProjectState, assetIds: readonly string[]) {
  const key = assetIds.join("|");
  const paths = useMemo(() => {
    const m = new Map<string, string>();
    for (const id of assetIds) {
      const v = coverVersion(state, id);
      if (v && v.mimeType.startsWith("image/")) m.set(id, v.mediaPath);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.assetVersions, state.assetVariants, key]);
  const urls = useImageUrls([...paths.values()]);
  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, p] of paths) {
      const u = urls.data?.[p];
      if (u) out[id] = u;
    }
    return out;
  }, [paths, urls.data]);
}

export function AssetThumb({
  state,
  assetId,
  url,
  size = "md",
  className,
}: {
  state: ProjectState;
  assetId: string;
  url?: string | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const asset = state.assets[assetId];
  const box = size === "sm" ? "size-6" : size === "md" ? "size-9" : "aspect-square w-full";
  return (
    <span
      data-testid="asset-thumb"
      data-has-image={url ? "true" : "false"}
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-surface-3",
        box,
        className,
      )}
    >
      {asset?.kind === "sound" ? (
        <Music className="size-4 text-text-tertiary" aria-hidden />
      ) : url ? (
        <img src={url} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <AssetSymbolIcon state={state} assetId={assetId} className={size === "lg" ? "size-1/2" : "size-[80%]"} />
      )}
    </span>
  );
}
