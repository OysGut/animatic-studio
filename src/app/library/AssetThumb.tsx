/**
 * U5 (punkt 3): miniatyrbilde av ressursen (godkjent bilde, ellers nyeste) i lister. Uten bilde vises
 * initial og typeikon for karakter/dyr, og typeikon ellers. Lenkene hentes samlet med useAssetCovers.
 */
import { useEffect, useMemo, useState } from "react";
import { Music, UserRound, PawPrint, Package, Mountain } from "lucide-react";
import { coverVersion, type ProjectState } from "@/core";
import { cn } from "@/lib/utils";
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
  // Reserven vises mens bildet lastes og når det feiler; bildet legges over først når det er lastet
  const [load, setLoad] = useState<"loading" | "ok" | "error">("loading");
  useEffect(() => setLoad("loading"), [url]);
  const showImage = asset?.kind !== "sound" && !!url && load !== "error";
  const box = size === "sm" ? "size-6" : size === "md" ? "size-9" : "aspect-square w-full";
  const character = asset?.kind === "character" || asset?.kind === "animal";
  const Fallback = asset?.kind === "animal" ? PawPrint : character ? UserRound : asset?.kind === "sound" ? Music : asset?.kind === "location" || asset?.kind === "environment" ? Mountain : Package;
  return (
    <span
      data-testid="asset-thumb"
      data-has-image={showImage ? "true" : "false"}
      data-image-state={showImage ? load : "none"}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-surface-3",
        box,
        className,
      )}
    >
      {!showImage || load !== "ok" ? (
        <span data-testid="asset-thumb-fallback" data-asset-kind={asset?.kind ?? "prop"} aria-hidden className="flex size-full items-center justify-center text-text-secondary">
          {character ? <span data-testid="asset-thumb-initial" className={cn("font-semibold leading-none", size === "lg" ? "text-4xl" : size === "sm" ? "text-sm" : "text-xl")}>{asset.name.trim().slice(0, 1).toLocaleUpperCase()}</span> : null}
          <Fallback className={character ? cn("absolute bottom-0 right-0", size === "lg" ? "m-1 size-5" : "size-2") : size === "lg" ? "size-1/2" : "size-4"} />
        </span>
      ) : null}
      {showImage ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          ref={(img) => {
            // Bildet kan være ferdig (eller feilet) før React kobler på hendelsene
            if (img?.complete && load === "loading") setLoad(img.naturalWidth > 0 ? "ok" : "error");
          }}
          onLoad={() => setLoad("ok")}
          onError={() => setLoad("error")}
          className={cn("size-full object-cover", load === "ok" ? "" : "absolute inset-0 opacity-0")}
        />
      ) : null}
    </span>
  );
}
