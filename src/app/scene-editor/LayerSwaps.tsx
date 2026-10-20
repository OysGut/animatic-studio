/**
 * Bildeskifte i et lag (DEC-0052, REQ-0579): fra et bestemt bilde viser laget et annet bilde (hardt kutt),
 * f.eks. en kaffekopp som blir tom eller en bakgrunn som skifter. Hvilket som helst bilde i biblioteket
 * kan brukes. Skiftet kan flyttes ved å dra markøren i tidslinjen.
 */
import { ArrowRightLeft, X } from "lucide-react";
import { useMemo, useState } from "react";
import { coverVersion, layerFieldsOf, locale, sortedAssets, variantsOf, type Command, type CompositionLayer, type ImageSwap, type ProjectState } from "@/core";
import { useImageUrls } from "@/app/library/asset-images";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AssetPicker } from "./LayerImageDialog";
import { t } from "@/core/i18n/keyed";

type Run = (command: Command, label: string) => string | null;

const selectClass =
  "h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary disabled:opacity-50";

export function LayerSwaps({
  state,
  layer,
  editable,
  frame,
  run,
  onSeek,
}: {
  state: ProjectState;
  layer: CompositionLayer;
  editable: boolean;
  frame: number;
  run: Run;
  onSeek?: (frame: number) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fps = state.project.fps.num / state.project.fps.den;
  const seconds = (f: number) =>
    `${(Math.round((f / fps) * 100) / 100).toLocaleString(locale())} s`;
  const here = layer.swaps.find((w) => w.frame === frame);

  function setSwaps(label: string, swaps: readonly ImageSwap[]) {
    setError(
      run(
        {
          type: "UpdateLayers",
          layers: [{ layerId: layer.id, fields: { ...layerFieldsOf(layer), swaps } }],
        },
        label,
      ),
    );
  }

  function add(assetId: string) {
    setPicking(false);
    const swap: ImageSwap = {
      frame,
      assetId: assetId as ImageSwap["assetId"],
      assetVariantId: null,
      versionId: null,
    };
    setSwaps(
      t("app-scene-editor-layer-swaps.swap-to", { name: state.assets[assetId]?.name ?? t("app-scene-editor-layer-swaps.swap-to-image") }),
      [...layer.swaps.filter((w) => w.frame !== frame), swap].sort((a, b) => a.frame - b.frame),
    );
  }

  function change(w: ImageSwap, patch: Partial<ImageSwap>) {
    setSwaps(
      t("app-scene-editor-layer-swaps.change.set-swaps.413416e19e67"),
      layer.swaps.map((x) => (x.frame === w.frame ? { ...x, ...patch } : x)),
    );
  }

  return (
    <section className="mb-4" aria-label={t("app-scene-editor-layer-swaps.layer-swaps.aria-label.0b4eec48b78a")}>
      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-[0.04em] text-text-tertiary">
        {t("app-scene-editor-layer-swaps.layer-swaps.h3.0b4eec48b78a")}
      </h3>
      <div className="flex flex-col gap-2">
        {layer.swaps.length === 0 ? (
          <p className="text-xs text-text-tertiary">
            {t("app-scene-editor-layer-swaps.layer-swaps.p.02bdec36beb6")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {layer.swaps.map((w) => {
              const asset = state.assets[w.assetId];
              const variants = asset
                ? variantsOf(state, asset.id).filter(
                    (v) => !v.archived || v.id === w.assetVariantId,
                  )
                : [];
              return (
                <li
                  key={w.frame}
                  className={
                    "flex flex-col gap-1 rounded-sm border p-1.5 " +
                    (w.frame === frame ? "border-accent-brand" : "border-border")
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSeek?.(w.frame)}
                      className="shrink-0 rounded-sm px-1 text-xs tabular-nums text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                      title={t("app-scene-editor-layer-swaps.layer-swaps.title.cd6e38779c42")}
                    >
                      {t("app-scene-editor-layer-swaps.layer-swaps.button.0290f4fdc1d6")} {seconds(w.frame)}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
                      {asset?.name ?? t("app-scene-editor-layer-swaps.layer-swaps.span.523c4fc01bca")}
                    </span>
                    {editable ? (
                      <button
                        type="button"
                        aria-label={t("app-scene-editor-layer-swaps.layer-swaps.aria-label.7e2927cb0565", { value1: String(seconds(w.frame)) })}
                        title={t("app-scene-editor-layer-swaps.layer-swaps.title.f6e6e9e6e9fe")}
                        onClick={() =>
                          setSwaps(
                            t("app-scene-editor-layer-swaps.layer-swaps.set-swaps.6546adfe3876"),
                            layer.swaps.filter((x) => x.frame !== w.frame),
                          )
                        }
                        className="rounded-sm p-0.5 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                  {variants.length > 0 ? (
                    <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                      {t("app-scene-editor-layer-swaps.layer-swaps.label.94701a2511ee")}
                      <select
                        value={w.assetVariantId ?? ""}
                        disabled={!editable}
                        onChange={(e) =>
                          change(w, {
                            assetVariantId: (e.target.value || null) as ImageSwap["assetVariantId"],
                            versionId: null,
                          })
                        }
                        className={selectClass}
                      >
                        <option value="">{t("app-scene-editor-layer-swaps.layer-swaps.option.b44c486909b6")}</option>
                        {variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name || t("app-scene-editor-layer-swaps.layer-swaps.option.de77847b6a91")}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {editable ? (
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            disabled={frame < 1}
            title={
              frame < 1
                ? t("app-scene-editor-layer-swaps.layer-swaps.title.ff186e3ff61a")
                : t("app-scene-editor-layer-swaps.layer-swaps.title.52295238f3b8")
            }
            onClick={() => setPicking(true)}
          >
            <ArrowRightLeft className="size-3.5" />
            {here
              ? t("app-scene-editor-layer-swaps.layer-swaps.button.69b5c6b96c22")
              : t("app-scene-editor-layer-swaps.layer-swaps.button.1adb77ea529b", { value1: String(seconds(frame)) })}
          </Button>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}
      </div>
      <SwapPicker
        open={picking}
        onOpenChange={setPicking}
        state={state}
        layer={layer}
        when={seconds(frame)}
        onPick={add}
      />
    </section>
  );
}

function SwapPicker({
  open,
  onOpenChange,
  state,
  layer,
  when,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  state: ProjectState;
  layer: CompositionLayer;
  when: string;
  onPick: (assetId: string) => void;
}) {
  const candidates = useMemo(
    () => (open ? sortedAssets(state).filter((a) => !a.archived && a.kind !== "sound") : []),
    [state, open],
  );
  const paths = useMemo(
    () =>
      candidates.flatMap((a) => {
        const c = coverVersion(state, a.id);
        return c ? [c.mediaPath] : [];
      }),
    [state, candidates],
  );
  const urls = useImageUrls(paths).data ?? {};
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-[760px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>
            {t("app-scene-editor-layer-swaps.swap-picker.dialog-title.8e6db16c2d82", { name: String(layer.name) })}
          </DialogTitle>
          <DialogDescription>
            {t("app-scene-editor-layer-swaps.swap-picker.dialog-description.9188382115ca", { when: String(when) })}
          </DialogDescription>
        </DialogHeader>
        <AssetPicker state={state} candidates={candidates} urls={urls} editable onPick={onPick} />
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("app-scene-editor-layer-swaps.swap-picker.button.0b3fb7353ea5")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
