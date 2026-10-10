/**
 * Bilde for et lag (DEC-0044): dobbeltklikk på et lag i lerretet eller i lagslisten. Velg et annet bilde av
 * samme ressurs (alle varianter og versjoner), last opp et nytt (blir en ny versjon i biblioteket og tas i
 * bruk med én gang), eller generer et nytt med AI (DEC-0045: Lovable-kreditter, bekreftes for hver
 * generering).
 *
 * Lag uten ressurs (fargeflater) kan kobles til en ressurs fra biblioteket her.
 */
import { Link } from "@tanstack/react-router";
import { Check, ImageOff, Library, Loader2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  ASSET_KIND_LABEL,
  coverVersion,
  layerFieldsOf,
  layerVersion,
  newId,
  sortedAssets,
  variantsOf,
  versionsOf,
  type AssetMedia,
  type AssetVariant,
  type CompositionLayer,
  type LayerFields,
  type ProjectState,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { uploadAssetImage, useImageUrls } from "@/app/library/asset-images";
import { GenerateImagePanel } from "@/app/library/GenerateImagePanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STYLE_LABEL: Record<AssetVariant["style"], string> = {
  reference: "Referansebilde",
  illustrated: "Illustrert",
  realistic: "Filmrealistisk",
  animatic: "Animatic",
  poster: "Plakat",
  other: "Annet",
};

export function LayerImageDialog({
  open,
  onOpenChange,
  state,
  projectId,
  layer,
  editable,
  cmds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  projectId: string;
  layer: CompositionLayer | null;
  editable: boolean;
  cmds: Commands;
}) {
  return (
    <Dialog open={open && layer !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-[760px] overflow-y-auto border-border bg-surface-2">
        {layer ? (
          <Body
            state={state}
            projectId={projectId}
            layer={layer}
            editable={editable}
            cmds={cmds}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  state,
  projectId,
  layer,
  editable,
  cmds,
  onClose,
}: {
  state: ProjectState;
  projectId: string;
  layer: CompositionLayer;
  editable: boolean;
  cmds: Commands;
  onClose: () => void;
}) {
  const asset = layer.assetId ? state.assets[layer.assetId] : undefined;
  const variants = useMemo(
    () =>
      asset
        ? variantsOf(state, asset.id).filter((v) => !v.archived || v.id === layer.assetVariantId)
        : [],
    [state, asset, layer.assetVariantId],
  );
  const shown = layerVersion(state, layer);
  const cover = asset ? coverVersion(state, asset.id) : null;

  // Miniatyrer: alle versjoner av ressursen (eller forsidebildene når laget ikke har ressurs)
  const candidates = useMemo(
    () => (asset ? [] : sortedAssets(state).filter((a) => !a.archived && a.kind !== "sound")),
    [state, asset],
  );
  const paths = useMemo(() => {
    const out: string[] = [];
    if (asset) {
      for (const v of variants) for (const ver of versionsOf(state, v.id)) out.push(ver.mediaPath);
    } else {
      for (const a of candidates) {
        const c = coverVersion(state, a.id);
        if (c) out.push(c.mediaPath);
      }
    }
    return out;
  }, [state, asset, variants, candidates]);
  const urls = useImageUrls(paths).data ?? {};

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<string>(layer.assetVariantId ?? variants[0]?.id ?? "");
  const fileRef = useRef<HTMLInputElement | null>(null);

  function setLayer(label: string, patch: Partial<LayerFields>) {
    const err = cmds.run(
      {
        type: "UpdateLayers",
        layers: [{ layerId: layer.id, fields: { ...layerFieldsOf(layer), ...patch } }],
      },
      label,
    );
    setError(err);
    return err === null;
  }

  /** Lagrer et nytt bilde (opplastet eller generert) som versjon og tar det i bruk på laget. */
  async function saveVersion(
    versionId: string,
    media: AssetMedia,
    note: string,
    label: string,
  ): Promise<string | null> {
    if (!asset) return "Laget har ingen ressurs.";
    let variantId = target;
    if (!variantId || !state.assetVariants[variantId]) {
      // Ressursen har ingen variant ennå: lag en
      variantId = newId<"asset_variant">();
      const r = await cmds.runAndWait(
        {
          type: "CreateAssetVariant",
          variantId: variantId as never,
          assetId: asset.id,
          fields: { name: "Animatic", style: "animatic", appearance: "" },
        },
        `Ny variant for «${asset.name}»`,
      );
      if (r.error) return r.error;
      // Et nytt forsøk bruker den samme varianten
      setTarget(variantId);
    }
    const r = await cmds.runAndWait(
      {
        type: "AddAssetVersion",
        versionId: versionId as never,
        variantId: variantId as never,
        media,
        note,
      },
      label,
    );
    if (r.error) return r.error;
    const ok = setLayer("Bruk nytt bilde", {
      assetVariantId: variantId as LayerFields["assetVariantId"],
      versionId: versionId as LayerFields["versionId"],
    });
    return ok ? null : "Bildet ble lagret, men kunne ikke tas i bruk på laget.";
  }

  async function upload(file: File) {
    if (!asset) return;
    setError(null);
    setBusy(true);
    try {
      // Last opp først: feiler opplastingen, lages ingenting
      const { versionId, media } = await uploadAssetImage(projectId, asset.id, file);
      const err = await saveVersion(
        versionId,
        media,
        "Lastet opp fra sceneeditoren",
        `Nytt bilde av «${asset.name}»`,
      );
      if (err) setError(err);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const tile =
    "group relative flex flex-col overflow-hidden rounded-sm border bg-surface-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Bilde for «{layer.name}»</DialogTitle>
        <DialogDescription>
          {asset
            ? `${asset.name} – ${ASSET_KIND_LABEL[asset.kind]}. Velg et annet bilde, last opp et nytt eller generer et nytt.`
            : "Laget er en fargeflate. Velg en ressurs fra biblioteket for å vise bildet dens."}
        </DialogDescription>
      </DialogHeader>

      {asset ? (
        <div className="flex flex-col gap-4">
          {/* Standard: ressursens forsidebilde (følger godkjent bilde) */}
          <section aria-label="Standardbilde" className="flex flex-col gap-1.5">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
              Følger biblioteket
            </h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
              <button
                type="button"
                disabled={!editable}
                aria-pressed={layer.assetVariantId === null}
                onClick={() =>
                  setLayer("Bruk forsidebildet", { assetVariantId: null, versionId: null })
                }
                className={
                  tile +
                  (layer.assetVariantId === null
                    ? " border-accent-brand ring-1 ring-accent-brand"
                    : " border-border hover:border-border-strong")
                }
                title="Viser alltid ressursens forsidebilde (godkjent bilde)"
              >
                <Thumb url={cover ? urls[cover.mediaPath] : undefined} />
                <span className="px-1.5 pt-1 text-[12px] text-text-primary">Forsidebildet</span>
                <span className="px-1.5 pb-1 text-[10px] text-text-tertiary">
                  Endres når et nytt bilde godkjennes
                </span>
                {layer.assetVariantId === null ? <Selected /> : null}
              </button>
            </div>
          </section>

          {variants.length === 0 ? (
            <p className="text-xs text-text-tertiary">
              Ressursen har ingen bilder ennå. Last opp det første nedenfor.
            </p>
          ) : (
            variants.map((v) => {
              const versions = versionsOf(state, v.id);
              const followOn = layer.assetVariantId === v.id && layer.versionId === null;
              return (
                <section
                  key={v.id}
                  aria-label={`Variant ${v.name}`}
                  className="flex flex-col gap-1.5"
                >
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
                      {v.name || "Uten navn"}
                    </h3>
                    <span className="text-[11px] text-text-tertiary">
                      {STYLE_LABEL[v.style]}
                      {v.appearance ? ` · ${v.appearance}` : ""}
                      {v.archived ? " · arkivert" : ""}
                    </span>
                    {versions.length > 0 ? (
                      <button
                        type="button"
                        disabled={!editable}
                        aria-pressed={followOn}
                        onClick={() =>
                          setLayer("Følg godkjent bilde", {
                            assetVariantId: v.id as LayerFields["assetVariantId"],
                            versionId: null,
                          })
                        }
                        className={
                          "ml-auto rounded-sm px-1.5 text-[11px] " +
                          (followOn
                            ? "bg-accent-selection text-text-primary"
                            : "text-text-secondary hover:bg-surface-3 hover:text-text-primary")
                        }
                        title="Laget viser variantens godkjente (ellers nyeste) bilde, også når det kommer nye"
                      >
                        {followOn ? "Følger godkjent bilde" : "Følg godkjent bilde"}
                      </button>
                    ) : null}
                  </div>
                  {versions.length === 0 ? (
                    <p className="text-xs text-text-tertiary">Ingen bilder i denne varianten.</p>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                      {versions.map((ver) => {
                        const locked = layer.versionId === ver.id;
                        const on = locked || (followOn && shown?.id === ver.id);
                        return (
                          <button
                            key={ver.id}
                            type="button"
                            disabled={!editable}
                            aria-pressed={locked}
                            onClick={() =>
                              setLayer(`Bruk bilde v${ver.number}`, {
                                assetVariantId: v.id as LayerFields["assetVariantId"],
                                versionId: ver.id as LayerFields["versionId"],
                              })
                            }
                            className={
                              tile +
                              (on
                                ? " border-accent-brand ring-1 ring-accent-brand"
                                : " border-border hover:border-border-strong")
                            }
                            title={`Bruk versjon ${ver.number}${ver.note ? ` – ${ver.note}` : ""}`}
                          >
                            <Thumb url={urls[ver.mediaPath]} />
                            <span className="flex items-center gap-1 px-1.5 py-1 text-[12px] text-text-primary">
                              v{ver.number}
                              {v.approvedVersionId === ver.id ? (
                                <span className="rounded-sm bg-status-success-bg px-1 text-[10px] text-status-success">
                                  godkjent
                                </span>
                              ) : null}
                            </span>
                            {on ? <Selected /> : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
          )}

          {/* Nytt bilde */}
          <section
            aria-label="Nytt bilde"
            className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2"
          >
            <div className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-3">
              <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                <Upload className="size-4" aria-hidden /> Last opp et nytt bilde
              </h3>
              <p className="text-xs text-text-tertiary">
                Lagres som ny versjon i biblioteket og brukes på laget med én gang.
              </p>
              {variants.length > 0 ? (
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  Variant
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    disabled={!editable || busy}
                    className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                  >
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name || "Uten navn"}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                aria-label="Velg bildefil"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!editable || busy}
                onClick={() => fileRef.current?.click()}
                className="self-start"
              >
                {busy ? <Loader2 className="animate-spin" /> : <Upload />}
                {busy ? "Laster opp …" : "Velg fil …"}
              </Button>
            </div>
            <GenerateImagePanel
              projectId={projectId}
              filmTitle={state.project.name}
              asset={asset}
              variant={state.assetVariants[target] ?? null}
              reference={shown}
              editable={editable}
              disabled={busy}
              onGenerated={(img) =>
                saveVersion(
                  img.versionId,
                  img.media,
                  `Generert med AI (${img.model})`,
                  `AI-bilde av «${asset.name}»`,
                )
              }
            />
          </section>
        </div>
      ) : (
        <AssetPicker
          state={state}
          candidates={candidates}
          urls={urls}
          editable={editable}
          onPick={(assetId) =>
            setLayer("Koble lag til ressurs", {
              assetId: assetId as LayerFields["assetId"],
              assetVariantId: null,
              versionId: null,
            })
          }
        />
      )}

      {error ? (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      ) : null}

      <DialogFooter className="sm:justify-between">
        {asset ? (
          <Button variant="ghost" size="sm" asChild>
            <Link
              to="/prosjekt/$projectId/bibliotek"
              params={{ projectId }}
              search={{ asset: asset.id }}
            >
              <Library />
              Åpne i biblioteket
            </Link>
          </Button>
        ) : (
          <span />
        )}
        <Button variant="secondary" onClick={onClose}>
          Ferdig
        </Button>
      </DialogFooter>
    </>
  );
}

function AssetPicker({
  state,
  candidates,
  urls,
  editable,
  onPick,
}: {
  state: ProjectState;
  candidates: ReturnType<typeof sortedAssets>;
  urls: Readonly<Record<string, string>>;
  editable: boolean;
  onPick: (assetId: string) => void;
}) {
  const [q, setQ] = useState("");
  const list = candidates.filter((a) =>
    a.name.toLocaleLowerCase("nb").includes(q.trim().toLocaleLowerCase("nb")),
  );
  return (
    <div className="flex flex-col gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Søk i biblioteket …"
        aria-label="Søk i biblioteket"
        className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
      />
      {list.length === 0 ? (
        <p className="text-xs text-text-tertiary">Ingen ressurser passer.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
          {list.map((a) => {
            const c = coverVersion(state, a.id);
            return (
              <button
                key={a.id}
                type="button"
                disabled={!editable}
                onClick={() => onPick(a.id)}
                className="flex flex-col overflow-hidden rounded-sm border border-border bg-surface-1 text-left hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Thumb url={c ? urls[c.mediaPath] : undefined} />
                <span className="truncate px-1.5 pt-1 text-[12px] text-text-primary">{a.name}</span>
                <span className="truncate px-1.5 pb-1 text-[10px] text-text-tertiary">
                  {ASSET_KIND_LABEL[a.kind]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Thumb({ url }: { url: string | undefined }) {
  return (
    <span className="flex h-20 items-center justify-center bg-surface-3">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-contain" draggable={false} />
      ) : (
        <ImageOff className="size-5 text-text-tertiary" aria-hidden />
      )}
    </span>
  );
}

function Selected() {
  return (
    <span className="absolute right-1 top-1 rounded-full bg-accent-brand p-0.5 text-accent-fg">
      <Check className="size-3" aria-label="Valgt" />
    </span>
  );
}
