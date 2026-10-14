/**
 * Bildeskifte i et lag (DEC-0052, REQ-0579): fra et bestemt bilde viser laget et annet bilde (hardt kutt),
 * f.eks. en kaffekopp som blir tom eller en bakgrunn som skifter. Hvilket som helst bilde i biblioteket
 * kan brukes. Skiftet kan flyttes ved å dra markøren i tidslinjen.
 */
import { ArrowRightLeft, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  L,
  coverVersion,
  layerFieldsOf,
  locale,
  sortedAssets,
  variantsOf,
  type Command,
  type CompositionLayer,
  type ImageSwap,
  type ProjectState,
} from "@/core";
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
      L(
        `Bildeskifte til «${state.assets[assetId]?.name ?? "bilde"}»`,
        `Image swap to “${state.assets[assetId]?.name ?? "image"}”`,
      ),
      [...layer.swaps.filter((w) => w.frame !== frame), swap].sort((a, b) => a.frame - b.frame),
    );
  }

  function change(w: ImageSwap, patch: Partial<ImageSwap>) {
    setSwaps(
      L("Endre bildeskifte", "Change image swap"),
      layer.swaps.map((x) => (x.frame === w.frame ? { ...x, ...patch } : x)),
    );
  }

  return (
    <section className="mb-4" aria-label={L("Bildeskifte", "Image swap")}>
      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-[0.04em] text-text-tertiary">
        {L("Bildeskifte", "Image swap")}
      </h3>
      <div className="flex flex-col gap-2">
        {layer.swaps.length === 0 ? (
          <p className="text-xs text-text-tertiary">
            {L(
              "Laget kan bytte til et annet bilde midt i scenen (hardt kutt). Flytt avspillingshodet dit skiftet skal skje.",
              "The layer can switch to another image in the middle of the scene (a hard cut). Move the playhead to where the swap should happen.",
            )}
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
                      title={L("Gå til skiftet", "Go to the swap")}
                    >
                      {L("fra", "from")} {seconds(w.frame)}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
                      {asset?.name ?? L("Ukjent ressurs", "Unknown asset")}
                    </span>
                    {editable ? (
                      <button
                        type="button"
                        aria-label={L(
                          `Fjern bildeskiftet ved ${seconds(w.frame)}`,
                          `Remove the image swap at ${seconds(w.frame)}`,
                        )}
                        title={L("Fjern bildeskiftet", "Remove the image swap")}
                        onClick={() =>
                          setSwaps(
                            L("Fjern bildeskifte", "Remove image swap"),
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
                      {L("Variant", "Variant")}
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
                        <option value="">{L("Forsidebildet", "Cover image")}</option>
                        {variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name || L("Uten navn", "Untitled")}
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
                ? L(
                    "Flytt avspillingshodet forbi starten av scenen først",
                    "Move the playhead past the start of the scene first",
                  )
                : L(
                    "Laget viser et annet bilde fra dette bildet",
                    "The layer shows a different image from this point",
                  )
            }
            onClick={() => setPicking(true)}
          >
            <ArrowRightLeft className="size-3.5" />
            {here
              ? L("Bytt bildet her …", "Change the image here …")
              : L(`Bytt bilde ved ${seconds(frame)} …`, `Change image at ${seconds(frame)} …`)}
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
            {L(`Bildeskifte i «${layer.name}»`, `Image swap in “${layer.name}”`)}
          </DialogTitle>
          <DialogDescription>
            {L(
              `Fra ${when} viser laget bildet du velger. Plassering, størrelse og bevegelse beholdes.`,
              `From ${when} the layer shows the image you choose. Position, size and movement are kept.`,
            )}
          </DialogDescription>
        </DialogHeader>
        <AssetPicker state={state} candidates={candidates} urls={urls} editable onPick={onPick} />
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {L("Avbryt", "Cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
