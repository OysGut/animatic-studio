/**
 * Bilde for et lag (DEC-0044): dobbeltklikk på et lag i lerretet eller i lagslisten. Velg et annet bilde av
 * samme ressurs (alle varianter og versjoner), last opp et nytt (blir en ny versjon i biblioteket og tas i
 * bruk med én gang), eller generer et nytt med AI (DEC-0045: Lovable-kreditter, bekreftes for hver
 * generering).
 *
 * Lag uten ressurs (fargeflater) kan kobles til en ressurs fra biblioteket her.
 */
import { Link } from "@tanstack/react-router";
import {
  Check,
  ImageOff,
  Library,
  Loader2,
  Maximize2,
  Scissors,
  Trash2,
  Upload,
} from "lucide-react";
import { ImageLightbox } from "@/app/library/ImageLightbox";
import { useMemo, useRef, useState } from "react";
import {
  ASSET_KIND_LABEL,
  coverVersion,
  layerFieldsOf,
  layerVersion,
  newId,
  partLayers,
  sortedAssets,
  variantsOf,
  versionsOf,
  type AssetMedia,
  type AssetVariant,
  type AssetVersion,
  type CompositionLayer,
  type LayerFields,
  type ProjectState,
  workingImageMaxSide,
  L,
  collation,
  localized,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import {
  IMAGE_ACCEPT,
  type UploadedImage,
  uploadAssetImage,
  useImageUrls,
} from "@/app/library/asset-images";
import { GenerateImagePanel } from "@/app/library/GenerateImagePanel";
import { useActiveProduction } from "@/app/project/use-production";
import { MobileCameraButton } from "@/app/mobile/MobileImportDialog";
import { CutoutDialog } from "@/app/library/CutoutDialog";
import { StyleGuideDialog } from "@/app/projects/StyleGuideSection";
import { VisualBriefEditor } from "@/app/library/VisualBriefEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STYLE_LABEL: Record<AssetVariant["style"], string> = localized({
  reference: ["Referansebilde", "Reference image"],
  illustrated: ["Illustrert", "Illustrated"],
  realistic: ["Filmrealistisk", "Realistic"],
  animatic: ["Animatic", "Animatic"],
  poster: ["Plakat", "Poster"],
  other: ["Annet", "Other"],
});

export function LayerImageDialog({
  open,
  onOpenChange,
  state,
  projectId,
  layer,
  editable,
  cmds,
  openUpscale = false,
  sceneWrite,
}: {
  /**
   * Asset Studio (AS1, B4): endringer av laget går til utkastet i stedet for rett til scenen. Nye bilder og
   * versjoner lagres fortsatt med en gang i biblioteket. Med denne er «Legg delene i scenen» skjult.
   */
  sceneWrite?: ((patch: Partial<LayerFields>, label: string) => string | null) | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  projectId: string;
  layer: CompositionLayer | null;
  editable: boolean;
  cmds: Commands;
  /** Vis bildet laget bruker stort, med «Oppskaler» fremme (DEC-0080). */
  openUpscale?: boolean;
}) {
  return (
    <Dialog open={open && layer !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-[min(1120px,calc(100vw-64px))] overflow-y-auto border-border bg-surface-2">
        {layer ? (
          <Body
            state={state}
            projectId={projectId}
            layer={layer}
            editable={editable}
            cmds={cmds}
            onClose={() => onOpenChange(false)}
            openUpscale={openUpscale}
            sceneWrite={sceneWrite}
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
  openUpscale,
  sceneWrite,
}: {
  sceneWrite?: ((patch: Partial<LayerFields>, label: string) => string | null) | undefined;
  state: ProjectState;
  projectId: string;
  layer: CompositionLayer;
  editable: boolean;
  cmds: Commands;
  onClose: () => void;
  openUpscale: boolean;
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
  // Scenen laget hører til: gir sted, tid på døgnet og lys i AI-beskrivelsen (DEC-0065)
  const [activeProduction] = useActiveProduction(projectId, state);
  const promptContext = useMemo(() => {
    const comp = state.compositions[layer.compositionId];
    const occs = Object.values(state.occurrences).filter((o) => o.variantId === comp?.variantId);
    // Produksjonen som er valgt i sceneeditoren først (en spinoff), ellers hovedfilmen
    const occ =
      occs.find((o) => o.active && o.productionId === activeProduction) ??
      occs.find((o) => o.active && state.productions[o.productionId]?.kind === "main") ??
      occs.find((o) => o.active) ??
      occs[0];
    const productionId =
      occ?.productionId ??
      Object.values(state.productions).find((p) => p.kind === "main")?.id ??
      "";
    return { state, productionId, occurrenceId: occ?.id ?? null };
  }, [state, layer.compositionId, activeProduction]);

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
  /** Bildet som frilegges (det laget viser, eller et annet fra stor visning). */
  const [cutout, setCutout] = useState<AssetVersion | null>(null);
  /** Stor visning av et bilde (DEC-0079). */
  const [big, setBig] = useState<{ version: AssetVersion; variantName: string } | null>(() => {
    if (!openUpscale) return null;
    const v = layerVersion(state, layer);
    return v ? { version: v, variantName: state.assetVariants[v.variantId]?.name ?? "" } : null;
  });
  /** Bildet som er i ferd med å slettes (bekreftelse). */
  const [deleting, setDeleting] = useState<string | null>(null);
  /** «Sett inn denne beskrivelsen» fra den store visningen. */
  const [insert, setInsert] = useState<{ text: string; n: number } | null>(null);
  /** «Filmens visuelle stil» oppå denne dialogen; lukkes den, er brukeren tilbake her. */
  const [styleOpen, setStyleOpen] = useState(false);

  function setLayer(label: string, patch: Partial<LayerFields>) {
    if (sceneWrite) {
      const e = sceneWrite(patch, label);
      setError(e);
      return e === null;
    }
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
    original: UploadedImage["original"] = null,
  ): Promise<string | null> {
    if (!asset) return L("Laget har ingen ressurs.", "The layer has no asset.");
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
        L(`Ny variant for «${asset.name}»`, `New variant for “${asset.name}”`),
      );
      if (r.error) return r.error;
      // Et nytt forsøk bruker den samme varianten
      setTarget(variantId);
    }
    const group = `opplasting-${versionId}`;
    if (original) {
      const o = await cmds.runAndWait(
        {
          type: "AddAssetVersion",
          versionId: original.versionId as never,
          variantId: variantId as never,
          media: original.media,
          note: original.note,
        },
        label,
        group,
      );
      if (o.error) return o.error;
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
      group,
    );
    if (r.error) return r.error;
    const ok = setLayer(L("Bruk nytt bilde", "Use new image"), {
      assetVariantId: variantId as LayerFields["assetVariantId"],
      versionId: versionId as LayerFields["versionId"],
    });
    return ok
      ? null
      : L(
          "Bildet ble lagret, men kunne ikke tas i bruk på laget.",
          "The image was saved, but could not be used on the layer.",
        );
  }

  async function upload(file: File) {
    if (!asset) return;
    setError(null);
    setBusy(true);
    try {
      // Last opp først: feiler opplastingen, lages ingenting
      const up = await uploadAssetImage(
        projectId,
        asset.id,
        file,
        workingImageMaxSide(state.project.frameWidth, state.project.frameHeight),
      );
      // Originalen (når bildet er skalert ned) lagres som versjonen før arbeidskopien
      const err = await saveVersion(
        up.versionId,
        up.media,
        [L("Lastet opp fra sceneeditoren.", "Uploaded from the scene editor."), up.note]
          .filter(Boolean)
          .join(" "),
        L(`Nytt bilde av «${asset.name}»`, `New image of “${asset.name}”`),
        up.original,
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
        <div className="flex items-center gap-2 pr-8">
          <DialogTitle className="min-w-0 flex-1">
            {L(`Bilde for «${layer.name}»`, `Image for “${layer.name}”`)}
          </DialogTitle>
          {/* Kameraikonet øverst til høyre: bilder fra mobilen blir nye bilder av ressursen (DEC-0090) */}
          {editable && asset && asset.kind !== "sound" ? (
            <MobileCameraButton
              projectId={projectId}
              context={{
                type: "layer",
                layerId: layer.id,
                assetId: asset.id,
                ...(layer.assetVariantId ? { variantId: layer.assetVariantId } : {}),
              }}
              label={L(
                `Bilder av ${asset.name} (laget «${layer.name}»)`,
                `Pictures of ${asset.name} (layer “${layer.name}”)`,
              )}
            />
          ) : null}
        </div>
        <DialogDescription>
          {asset
            ? L(
                `${asset.name} – ${ASSET_KIND_LABEL[asset.kind]}. Velg et annet bilde, last opp et nytt eller generer et nytt.`,
                `${asset.name} – ${ASSET_KIND_LABEL[asset.kind]}. Choose another image, upload a new one or generate a new one.`,
              )
            : L(
                "Laget er en fargeflate. Velg en ressurs fra biblioteket for å vise bildet dens.",
                "The layer is a colour fill. Choose an asset from the library to show its image.",
              )}
        </DialogDescription>
      </DialogHeader>

      {asset ? (
        <div className="flex flex-col gap-4">
          {/* Standard: ressursens forsidebilde (følger godkjent bilde) */}
          <section
            aria-label={L("Standardbilde", "Default image")}
            className="flex flex-col gap-1.5"
          >
            <h3 className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
              {L("Følger biblioteket", "Follows the library")}
            </h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
              <button
                type="button"
                disabled={!editable}
                aria-pressed={layer.assetVariantId === null}
                onClick={() =>
                  setLayer(L("Bruk forsidebildet", "Use the cover image"), {
                    assetVariantId: null,
                    versionId: null,
                  })
                }
                className={
                  tile +
                  (layer.assetVariantId === null
                    ? " border-accent-brand ring-1 ring-accent-brand"
                    : " border-border hover:border-border-strong")
                }
                title={L(
                  "Viser alltid ressursens forsidebilde (godkjent bilde)",
                  "Always shows the asset's cover image (approved image)",
                )}
              >
                <Thumb url={cover ? urls[cover.mediaPath] : undefined} />
                <span className="px-1.5 pt-1 text-[12px] text-text-primary">
                  {L("Forsidebildet", "Cover image")}
                </span>
                <span className="px-1.5 pb-1 text-[11px] text-text-tertiary">
                  {L("Endres når et nytt bilde godkjennes", "Changes when a new image is approved")}
                </span>
                {layer.assetVariantId === null ? <Selected /> : null}
              </button>
            </div>
          </section>

          {variants.length === 0 ? (
            <p className="text-xs text-text-tertiary">
              {L(
                "Ressursen har ingen bilder ennå. Last opp det første nedenfor.",
                "The asset has no images yet. Upload the first one below.",
              )}
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
                      {v.name || L("Uten navn", "Without name")}
                    </h3>
                    <span className="text-[11px] text-text-tertiary">
                      {STYLE_LABEL[v.style]}
                      {v.appearance ? ` · ${v.appearance}` : ""}
                      {v.archived ? L(" · arkivert", " · archived") : ""}
                    </span>
                    {versions.length > 0 ? (
                      <button
                        type="button"
                        disabled={!editable}
                        aria-pressed={followOn}
                        onClick={() =>
                          setLayer(L("Følg godkjent bilde", "Follow approved image"), {
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
                        title={L(
                          "Laget viser variantens godkjente (ellers nyeste) bilde, også når det kommer nye",
                          "The layer shows the variant's approved (otherwise newest) image, including when new ones arrive",
                        )}
                      >
                        {followOn
                          ? L("Følger godkjent bilde", "Following approved image")
                          : L("Følg godkjent bilde", "Follow approved image")}
                      </button>
                    ) : null}
                  </div>
                  {deleting && versions.some((x) => x.id === deleting) ? (
                    <DeleteVersionConfirm
                      state={state}
                      versionId={deleting}
                      onCancel={() => setDeleting(null)}
                      onConfirm={() => {
                        const ver = state.assetVersions[deleting];
                        const err = cmds.run(
                          {
                            type: "SetAssetVersionsRemoved",
                            versionIds: [deleting as never],
                            removed: true,
                          },
                          L(
                            `Slett bilde v${ver?.number ?? ""}`,
                            `Delete image v${ver?.number ?? ""}`,
                          ),
                        );
                        setError(err);
                        if (!err) setDeleting(null);
                      }}
                    />
                  ) : null}
                  {versions.length === 0 ? (
                    <p className="text-xs text-text-tertiary">
                      {L("Ingen bilder i denne varianten.", "No images in this variant.")}
                    </p>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                      {versions.map((ver) => {
                        const locked = layer.versionId === ver.id;
                        const on = locked || (followOn && shown?.id === ver.id);
                        return (
                          <div key={ver.id} className="group/tile relative">
                            <button
                              type="button"
                              disabled={!editable}
                              aria-pressed={locked}
                              onClick={() =>
                                setLayer(
                                  L(`Bruk bilde v${ver.number}`, `Use image v${ver.number}`),
                                  {
                                    assetVariantId: v.id as LayerFields["assetVariantId"],
                                    versionId: ver.id as LayerFields["versionId"],
                                  },
                                )
                              }
                              // Dobbeltklikk åpner bildet stort (Mars 2026-10-13)
                              onDoubleClick={() => setBig({ version: ver, variantName: v.name })}
                              className={
                                tile +
                                (on
                                  ? " border-accent-brand ring-1 ring-accent-brand"
                                  : " border-border hover:border-border-strong")
                              }
                              title={L(
                                `Bruk versjon ${ver.number} (dobbeltklikk: stor visning)${ver.note ? ` – ${ver.note}` : ""}`,
                                `Use version ${ver.number} (double-click: large view)${ver.note ? ` – ${ver.note}` : ""}`,
                              )}
                            >
                              <Thumb url={urls[ver.mediaPath]} />
                              <span className="flex items-center gap-1 px-1.5 py-1 text-[12px] text-text-primary">
                                v{ver.number}
                                {v.approvedVersionId === ver.id ? (
                                  <span className="rounded-sm bg-status-success-bg px-1 text-[11px] text-status-success">
                                    {L("godkjent", "approved")}
                                  </span>
                                ) : null}
                              </span>
                              {on ? <Selected /> : null}
                            </button>
                            {/* Stor visning med beskrivelsen, og sletting (DEC-0079) */}
                            <span className="absolute left-1 top-1 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/tile:opacity-100 [@media(hover:none)]:opacity-100">
                              <button
                                type="button"
                                onClick={() => setBig({ version: ver, variantName: v.name })}
                                aria-label={L(
                                  `Vis v${ver.number} stort, med beskrivelsen`,
                                  `Show v${ver.number} large, with the description`,
                                )}
                                title={L(
                                  "Stor visning, zoom og beskrivelsen (prompten) som laget bildet",
                                  "Large view, zoom and the description (prompt) that made the image",
                                )}
                                className="rounded-sm bg-surface-1/90 p-0.5 text-text-secondary hover:text-text-primary"
                              >
                                <Maximize2 className="size-3.5" aria-hidden />
                              </button>
                              {editable ? (
                                <button
                                  type="button"
                                  onClick={() => setDeleting(ver.id)}
                                  aria-label={L(`Slett v${ver.number}`, `Delete v${ver.number}`)}
                                  title={L(
                                    "Slett bildet (flyttes til «Slettede objekter»)",
                                    "Delete the image (moved to “Deleted items”)",
                                  )}
                                  className="rounded-sm bg-surface-1/90 p-0.5 text-text-secondary hover:text-status-danger"
                                >
                                  <Trash2 className="size-3.5" aria-hidden />
                                </button>
                              ) : null}
                            </span>
                          </div>
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
            aria-label={L("Nytt bilde", "New image")}
            className="flex flex-col gap-3 border-t border-border pt-3"
          >
            {/* Opplasting på én linje over AI-panelet, så ingen kolonne står tom (DEC-0076 funn 8) */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm border border-border bg-surface-1 p-3">
              <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                <Upload className="size-4" aria-hidden />{" "}
                {L("Last opp et nytt bilde", "Upload a new image")}
              </h3>
              <p className="min-w-0 flex-1 text-xs text-text-tertiary">
                {L(
                  "Lagres som ny versjon i biblioteket og brukes på laget med én gang.",
                  "Saved as a new version in the library and used on the layer straight away.",
                )}
              </p>
              {variants.length > 0 ? (
                <label className="flex min-w-48 items-center gap-1.5 text-xs text-text-secondary">
                  Variant
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    disabled={!editable || busy}
                    className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                  >
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name || L("Uten navn", "Without name")}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept={IMAGE_ACCEPT}
                className="sr-only"
                aria-label={L("Velg bildefil", "Choose image file")}
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
                className="shrink-0"
              >
                {busy ? <Loader2 className="animate-spin" /> : <Upload />}
                {busy ? L("Laster opp …", "Uploading …") : L("Velg fil …", "Choose file …")}
              </Button>
            </div>
            <GenerateImagePanel
              insertPrompt={insert}
              projectId={projectId}
              filmTitle={state.project.name}
              asset={asset}
              variant={state.assetVariants[target] ?? null}
              reference={shown}
              editable={editable}
              disabled={busy}
              budget={state.project}
              context={promptContext}
              onOpenStyleGuide={() => setStyleOpen(true)}
              visualBrief={
                <VisualBriefEditor
                  state={state}
                  asset={asset}
                  cmds={cmds}
                  editable={editable}
                  compact
                />
              }
              onGenerated={(img) =>
                saveVersion(
                  img.versionId,
                  img.media,
                  L(`Generert med AI (${img.model})`, `Generated with AI (${img.model})`),
                  L(`AI-bilde av «${asset.name}»`, `AI image of “${asset.name}”`),
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
            setLayer(L("Koble lag til ressurs", "Connect layer to asset"), {
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

      {asset ? (
        <CutoutDialog
          open={cutout !== null}
          onOpenChange={(o) => !o && setCutout(null)}
          projectId={projectId}
          asset={asset}
          version={cutout}
          cmds={cmds}
          onSaved={(versionId, variantId) =>
            setLayer(L("Bruk frilagt bilde", "Use cut-out image"), {
              assetVariantId: variantId as LayerFields["assetVariantId"],
              versionId: versionId as LayerFields["versionId"],
            })
          }
        />
      ) : null}

      {styleOpen ? (
        <StyleGuideDialog
          state={state}
          cmds={cmds}
          editable={editable}
          profileId={null}
          onClose={() => setStyleOpen(false)}
        />
      ) : null}

      <ImageLightbox
        initialPanel={openUpscale ? "upscale" : null}
        open={big !== null}
        onOpenChange={(o) => !o && setBig(null)}
        projectId={projectId}
        version={big?.version ?? null}
        url={big ? urls[big.version.mediaPath] : undefined}
        title={
          big && asset
            ? L(
                `${asset.name} – ${big.variantName || "Uten navn"} v${big.version.number}`,
                `${asset.name} – ${big.variantName || "Without name"} v${big.version.number}`,
              )
            : ""
        }
        {...(editable
          ? { onInsertPrompt: (text: string) => setInsert((p) => ({ text, n: (p?.n ?? 0) + 1 })) }
          : {})}
        {...(asset
          ? {
              tools: {
                state,
                cmds,
                asset,
                editable,
                onCutout: (v: AssetVersion) => {
                  setBig(null);
                  setCutout(v);
                },
                // «Legg delene i scenen» (DEC-0088): der de lå i bildet; dørblad o.l. i egen gruppe med
                // ankerpunkt på hengselkanten. Alt i én angring.
                ...(editable && !sceneWrite
                  ? {
                      onPlaceParts: (
                        parts: readonly {
                          assetId: string;
                          versionId: string;
                          box: { x: number; y: number; w: number; h: number };
                          anchor: "left" | "center" | "right";
                        }[],
                        source: { width: number; height: number },
                      ) => {
                        const now = cmds.current() ?? state;
                        const original = now.layers[layer.id] ?? layer;
                        const plan = partLayers(now, original, parts, source, () =>
                          newId<"composition_layer">(),
                        );
                        if (!plan.layers.length) return;
                        const group = newId();
                        const label = L("Legg delene i scenen", "Put the parts in the scene");
                        const err = cmds.run(
                          { type: "AddLayers", layers: plan.layers },
                          label,
                          group,
                        );
                        if (!err && plan.hideOriginal)
                          cmds.run(
                            {
                              type: "UpdateLayers",
                              layers: [
                                {
                                  layerId: plan.hideOriginal.layerId as never,
                                  fields: plan.hideOriginal.fields,
                                },
                              ],
                            },
                            label,
                            group,
                          );
                        setBig(null);
                        onClose();
                      },
                    }
                  : {}),
              },
            }
          : {})}
      />

      <DialogFooter className="sm:justify-between">
        {asset ? (
          <Button variant="ghost" size="sm" asChild>
            <Link
              to="/prosjekt/$projectId/bibliotek"
              params={{ projectId }}
              search={{ asset: asset.id }}
            >
              <Library />
              {L("Åpne i biblioteket", "Open in library")}
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {asset && shown && editable ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCutout(shown)}
            title={L(
              "Fjern bakgrunnen i bildet som vises nå (gratis, ny versjon)",
              "Remove the background of the image shown now (free, new version)",
            )}
          >
            <Scissors />
            {L("Frilegg bildet …", "Cut out image …")}
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onClose}>
          {L("Ferdig", "Done")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function AssetPicker({
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
    a.name.toLocaleLowerCase(collation()).includes(q.trim().toLocaleLowerCase(collation())),
  );
  return (
    <div className="flex flex-col gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={L("Søk i biblioteket …", "Search the library …")}
        aria-label={L("Søk i biblioteket", "Search the library")}
        className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
      />
      {list.length === 0 ? (
        <p className="text-xs text-text-tertiary">
          {L("Ingen ressurser passer.", "No assets match.")}
        </p>
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
                <span className="truncate px-1.5 pb-1 text-[11px] text-text-tertiary">
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

export function Thumb({ url }: { url: string | undefined }) {
  return (
    <span className="flex h-20 items-center justify-center bg-surface-3">
      {url ? (
        // Litt luft rundt, så en tett beskåret figur ikke slår i kanten (DEC-0080)
        <img src={url} alt="" className="h-full w-full object-contain p-1.5" draggable={false} />
      ) : (
        <ImageOff className="size-5 text-text-tertiary" aria-hidden />
      )}
    </span>
  );
}

function Selected() {
  return (
    <span className="absolute right-1 top-1 rounded-full bg-accent-brand p-0.5 text-accent-fg">
      <Check className="size-3" aria-label={L("Valgt", "Selected")} />
    </span>
  );
}

/**
 * Bekreft sletting av et bilde (DEC-0079): hva som skjer, og at det kan hentes inn igjen fra «Slettede
 * objekter» i biblioteket.
 */
function DeleteVersionConfirm({
  state,
  versionId,
  onCancel,
  onConfirm,
}: {
  state: ProjectState;
  versionId: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const v = state.assetVersions[versionId];
  if (!v) return null;
  const approved = state.assetVariants[v.variantId]?.approvedVersionId === v.id;
  const lockedLayers = Object.values(state.layers).filter(
    (l) => !l.removed && l.versionId === v.id,
  ).length;
  return (
    <div
      role="alertdialog"
      aria-label={L(`Slett v${v.number}`, `Delete v${v.number}`)}
      className="flex flex-col gap-2 rounded-sm border border-status-danger/50 bg-surface-1 p-2 text-xs"
    >
      {approved ? (
        <p className="text-text-primary">
          {L(
            `v${v.number} er godkjent og brukes i scenene. Godkjenn et annet bilde først, så kan dette slettes.`,
            `v${v.number} is approved and used in the scenes. Approve another image first, then this can be deleted.`,
          )}
        </p>
      ) : (
        <p className="text-text-primary">
          {L(
            `v${v.number} flyttes til «Slettede objekter» i biblioteket. Der kan det hentes inn igjen eller slettes for godt.`,
            `v${v.number} is moved to “Deleted items” in the library. It can be restored from there or deleted for good.`,
          )}
          {lockedLayers
            ? L(
                ` ${lockedLayers === 1 ? "Ett lag" : `${lockedLayers} lag`} bruker akkurat dette bildet og beholder det til det slettes for godt.`,
                ` ${lockedLayers === 1 ? "One layer" : `${lockedLayers} layers`} uses this exact image and keeps it until it is deleted for good.`,
              )
            : L(" Ingen lag bruker akkurat dette bildet.", " No layer uses this exact image.")}
        </p>
      )}
      <div className="flex gap-2">
        {!approved ? (
          <Button size="sm" variant="destructive" onClick={onConfirm}>
            <Trash2 /> {L("Slett bildet", "Delete image")}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {L("Avbryt", "Cancel")}
        </Button>
      </div>
    </div>
  );
}
