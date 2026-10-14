/**
 * Legg til lag i 2D-scenen: bilder fra ressursbiblioteket (ett eller flere samtidig) eller en fargeflate.
 */
import { AssetSymbolIcon } from "@/app/library/AssetSymbolIcon";
import { Check, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ASSET_KIND_LABEL,
  coverVersion,
  defaultLayerFields,
  assetNames,
  collation,
  L,
  newId,
  sortedAssets,
  variantsOf,
  type AssetKind,
  type Command,
  type Composition,
  type NewLayer,
  type ProjectState,
  sceneContinuityVariant,
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

type Tab = "library" | "fill";

const control =
  "h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary placeholder:text-text-tertiary";

export function AddLayerDialog({
  open,
  onOpenChange,
  state,
  composition,
  run,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  composition: Composition;
  run: (command: Command, label: string) => string | null;
  onAdded: (layerId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("library");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AssetKind | "all">("all");
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [variantChoice, setVariantChoice] = useState<Readonly<Record<string, string>>>({});
  const [fill, setFill] = useState("#2b3a55");
  const [fillName, setFillName] = useState(() => L("Fargeflate", "Colour fill"));
  const [error, setError] = useState<string | null>(null);

  // Lyd kan ikke være et lag (DEC-0044)
  const assets = useMemo(
    () => sortedAssets(state).filter((a) => !a.archived && a.kind !== "sound"),
    [state],
  );
  const kinds = useMemo(() => {
    const present = new Set(assets.map((a) => a.kind));
    return (Object.keys(ASSET_KIND_LABEL) as AssetKind[]).filter((k) => present.has(k));
  }, [assets]);
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(collation());
    return assets.filter(
      (a) =>
        (kind === "all" || a.kind === kind) &&
        (!q || assetNames(a).some((n) => n.toLocaleLowerCase(collation()).includes(q))),
    );
  }, [assets, kind, query]);

  const covers = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assets) {
      const v = coverVersion(state, a.id);
      if (v) m.set(a.id, v.mediaPath);
    }
    return m;
  }, [state, assets]);
  const urls = useImageUrls([...covers.values()]).data;

  /** Variantene som kan velges, og standardvalget: første med godkjent versjon, ellers «Standard». */
  function variantsFor(assetId: string) {
    return variantsOf(state, assetId).filter((v) => !v.archived);
  }
  function chosenVariant(assetId: string): string {
    const explicit = variantChoice[assetId];
    if (explicit !== undefined) return explicit;
    // Kontinuiteten bestemmer utseendet i denne scenen (DEC-0055)
    const fromContinuity = sceneContinuityVariant(state, assetId, composition.variantId);
    if (fromContinuity) return fromContinuity;
    return variantsFor(assetId).find((v) => v.approvedVersionId)?.id ?? "";
  }

  function toggle(assetId: string) {
    setPicked((p) => (p.includes(assetId) ? p.filter((x) => x !== assetId) : [...p, assetId]));
  }

  function close(next: boolean) {
    if (!next) {
      setPicked([]);
      setVariantChoice({});
      setQuery("");
      setKind("all");
      setError(null);
    }
    onOpenChange(next);
  }

  function submit(layers: NewLayer[], label: string) {
    const last = layers[layers.length - 1];
    if (!last) return;
    const err = run({ type: "AddLayers", layers }, label);
    if (err) {
      setError(err);
      return;
    }
    onAdded(last.layerId);
    close(false);
  }

  function addFromLibrary() {
    const chosen = picked.filter((id) => assets.some((a) => a.id === id));
    const layers: NewLayer[] = chosen.map((assetId, i) => {
      const f = defaultLayerFields(state, composition, {
        assetId,
        assetVariantId: chosenVariant(assetId) || null,
      });
      return {
        layerId: newId<"composition_layer">(),
        compositionId: composition.id,
        fields: {
          ...f,
          transform: {
            ...f.transform,
            x: f.transform.x + i * 30,
            y: f.transform.y + i * 30,
          },
        },
      };
    });
    const first = chosen[0] ? state.assets[chosen[0]] : undefined;
    submit(
      layers,
      layers.length === 1 && first
        ? L(`Nytt lag «${first.name}»`, `New layer “${first.name}”`)
        : L(`Nye lag (${layers.length})`, `New layers (${layers.length})`),
    );
  }

  function addFill() {
    const name = fillName.trim() || L("Fargeflate", "Colour fill");
    submit(
      [
        {
          layerId: newId<"composition_layer">(),
          compositionId: composition.id,
          fields: defaultLayerFields(state, composition, { fill, name }),
        },
      ],
      L(`Nytt lag «${name}»`, `New layer “${name}”`),
    );
  }

  const tabClass = (on: boolean) =>
    "h-7 rounded-sm px-3 text-xs " +
    (on
      ? "bg-accent-selection text-text-primary"
      : "text-text-secondary hover:bg-surface-3 hover:text-text-primary");

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-[720px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>{L("Legg til lag", "Add layer")}</DialogTitle>
          <DialogDescription>
            {L(
              "Velg bilder fra biblioteket, eller lag en ensfarget flate.",
              "Choose images from the library, or make a solid colour fill.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div role="tablist" aria-label={L("Type lag", "Layer type")} className="flex gap-1">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "library"}
            onClick={() => setTab("library")}
            className={tabClass(tab === "library")}
          >
            {L("Fra biblioteket", "From the library")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "fill"}
            onClick={() => setTab("fill")}
            className={tabClass(tab === "fill")}
          >
            {L("Fargeflate", "Colour fill")}
          </button>
        </div>

        {tab === "library" ? (
          assets.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-text-tertiary">
              {L(
                "Biblioteket er tomt. Legg til ressurser i Ressursbiblioteket først.",
                "The library is empty. Add assets to the asset library first.",
              )}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[160px] flex-1">
                  <Search
                    className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-tertiary"
                    aria-hidden
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={L("Søk i biblioteket", "Search the library")}
                    aria-label={L("Søk i biblioteket", "Search the library")}
                    className={control + " w-full pl-7"}
                  />
                </div>
                <div
                  className="flex flex-wrap gap-1"
                  role="group"
                  aria-label={L("Filtrer på type", "Filter by type")}
                >
                  {(["all", ...kinds] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={kind === k}
                      onClick={() => setKind(k)}
                      className={
                        "h-6 rounded-sm border px-2 text-xs " +
                        (kind === k
                          ? "border-accent-brand bg-accent-selection text-text-primary"
                          : "border-border-control text-text-secondary hover:bg-surface-3")
                      }
                    >
                      {k === "all" ? L("Alle", "All") : ASSET_KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
              </div>

              {shown.length === 0 ? (
                <p className="py-4 text-center text-xs text-text-tertiary">
                  {L("Ingen ressurser passer med søket.", "No assets match the search.")}
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {shown.map((a) => {
                    const on = picked.includes(a.id);
                    const path = covers.get(a.id);
                    const url = path ? urls?.[path] : undefined;
                    const variants = variantsFor(a.id);
                    return (
                      <li
                        key={a.id}
                        className={
                          "flex flex-col gap-1 rounded-sm border p-1.5 " +
                          (on
                            ? "border-accent-brand bg-accent-selection"
                            : "border-border bg-surface-1 hover:bg-surface-3")
                        }
                      >
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(a.id)}
                          className="flex flex-col gap-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <span className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-sm bg-surface-3">
                            {url ? (
                              <img src={url} alt="" className="size-full object-contain" />
                            ) : (
                              <AssetSymbolIcon
                                state={state}
                                assetId={a.id}
                                className="size-12"
                                title={L(`${a.name} – uten bilde`, `${a.name} – no image`)}
                              />
                            )}
                            {on ? (
                              <span
                                aria-hidden
                                className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-sm bg-accent-brand text-surface-0"
                              >
                                <Check className="size-3" />
                              </span>
                            ) : null}
                          </span>
                          <span className="truncate text-[13px] text-text-primary">{a.name}</span>
                          <span className="truncate text-[11px] text-text-tertiary">
                            {ASSET_KIND_LABEL[a.kind]}
                          </span>
                        </button>
                        {on && variants.length > 1 ? (
                          <select
                            aria-label={L(`Variant av ${a.name}`, `Variant of ${a.name}`)}
                            value={chosenVariant(a.id)}
                            onChange={(e) =>
                              setVariantChoice((c) => ({ ...c, [a.id]: e.target.value }))
                            }
                            className={control + " w-full"}
                          >
                            <option value="">{L("Standard", "Default")}</option>
                            {variants.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name || L("Uten navn", "Untitled")}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {L("Farge", "Colour")}
              <input
                type="color"
                value={fill}
                onChange={(e) => setFill(e.target.value)}
                className="h-8 w-16 cursor-pointer rounded-sm border border-border-control bg-surface-3 p-0.5"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {L("Navn", "Name")}
              <input
                type="text"
                value={fillName}
                maxLength={200}
                onChange={(e) => setFillName(e.target.value)}
                className={control + " w-full"}
              />
            </label>
          </div>
        )}

        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            {L("Avbryt", "Cancel")}
          </Button>
          {tab === "library" ? (
            <Button onClick={addFromLibrary} disabled={picked.length === 0}>
              {picked.length > 1
                ? L(`Legg til (${picked.length})`, `Add (${picked.length})`)
                : L("Legg til", "Add")}
            </Button>
          ) : (
            <Button onClick={addFill}>{L("Legg til", "Add")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
