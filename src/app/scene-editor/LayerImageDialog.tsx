/**
 * Bilde for et lag (DEC-0044): dobbeltklikk på et lag i lerretet eller i lagslisten. Velg et annet bilde av
 * samme ressurs (alle varianter og versjoner), last opp et nytt (blir en ny versjon i biblioteket og tas i
 * bruk med én gang), eller generer et nytt med AI (DEC-0045: Lovable-kreditter, bekreftes for hver
 * generering).
 *
 * Lag uten ressurs (fargeflater) kan kobles til en ressurs fra biblioteket her.
 */
import { Thumbnail } from "@/app/shared/Thumbnail";
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
import { ASSET_KIND_LABEL, coverVersion, layerFieldsOf, layerVersion, newId, partLayers, sortedAssets, variantsOf, versionsOf, type AssetMedia, type AssetVariant, type AssetVersion, type CompositionLayer, type LayerFields, type ProjectState, workingImageMaxSide, collation } from "@/core";
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
import { t, tLocalized } from "@/core/i18n/keyed";

const STYLE_LABEL: Record<AssetVariant["style"], string> = tLocalized({ reference: "app-scene-editor-layer-image-dialog.style-label.reference.6b95333c3619", illustrated: "app-scene-editor-layer-image-dialog.style-label.illustrated.701bc499562c", realistic: "app-scene-editor-layer-image-dialog.style-label.realistic.a26816eb11fb", animatic: "app-scene-editor-layer-image-dialog.style-label.animatic.937840e58a95", poster: "app-scene-editor-layer-image-dialog.style-label.poster.2a25a52bdea4", other: "app-scene-editor-layer-image-dialog.style-label.other.064c18ba948a" });

export function LayerImageDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  state,
  projectId,
  layer,
  editable,
  cmds,
  openUpscale = false,
  openHarmonize = false,
  sceneWrite,
}: {
  /**
   * Asset Studio (AS1, B4): endringer av laget går til utkastet i stedet for rett til scenen. Nye bilder og
   * versjoner lagres fortsatt med en gang i biblioteket. Med denne er «Legg delene i scenen» skjult.
   */
  sceneWrite?: ((patch: Partial<LayerFields>, label: string) => string | null) | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  state: ProjectState;
  projectId: string;
  layer: CompositionLayer | null;
  editable: boolean;
  cmds: Commands;
  /** Vis bildet laget bruker stort, med «Oppskaler» fremme (DEC-0080). */
  openUpscale?: boolean;
  /** P8: vis bildet laget bruker stort, med «Harmoniser stil» fremme. */
  openHarmonize?: boolean;
}) {
  return (
    <Dialog open={open && layer !== null} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus} className="max-h-[86vh] max-w-[min(1120px,calc(100vw-64px))] overflow-y-auto border-border bg-surface-2">
        {layer ? (
          <Body
            state={state}
            projectId={projectId}
            layer={layer}
            editable={editable}
            cmds={cmds}
            onClose={() => onOpenChange(false)}
            openUpscale={openUpscale || openHarmonize}
            initialPanel={openHarmonize ? "harmonize" : openUpscale ? "upscale" : null}
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
  initialPanel,
  sceneWrite,
}: {
  initialPanel: "upscale" | "harmonize" | null;
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
  // Tekstversjonen i feltet: bildene laget fra den lyser opp (Øystein 23.10)
  const [activeBrief, setActiveBrief] = useState<string | null>(null);
  const highlight = useMemo(
    () =>
      briefHighlight(
        variants.flatMap((v) => versionsOf(state, v.id)),
        activeBrief,
      ),
    [variants, state, activeBrief],
  );
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

  function setLayer(label: string, patch: Partial<LayerFields>, group?: string) {
    if (sceneWrite) {
      const e = sceneWrite(patch, label);
      setError(e);
      return e === null;
    }
    // Plassholder → bilde (23.10): feltene leses fra gjeldende tilstand, så tilpasningen et nytt bilde
    // nettopp fikk (egne proporsjoner rundt samme senter), ikke overskrives av lagets gamle størrelse
    const fresh = cmds.current()?.layers[layer.id] ?? layer;
    const err = cmds.run(
      {
        type: "UpdateLayers",
        layers: [{ layerId: layer.id, fields: { ...layerFieldsOf(fresh), ...patch } }],
      },
      label,
      group,
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
    briefVersionId?: string,
  ): Promise<string | null> {
    if (!asset) return t("app-scene-editor-layer-image-dialog.save-version.message.0eb54ac8c57d");
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
        t("app-scene-editor-layer-image-dialog.r.cmds-run-and-wait.5636f7ea3607", { name: String(asset.name) }),
      );
      if (r.error) return r.error;
      // Et nytt forsøk bruker den samme varianten
      setTarget(variantId);
    }
    const group = `opplasting-${versionId}`;
    const r = await cmds.runAndWait(
      {
        type: "AddAssetVersion",
        versionId: versionId as never,
        variantId: variantId as never,
        media,
        note,
        ...(briefVersionId ? { briefVersionId } : {}),
      },
      label,
      group,
    );
    if (r.error) return r.error;
    const ok = setLayer(t("app-scene-editor-layer-image-dialog.ok.set-layer.0e6e799ff30c"), {
      assetVariantId: variantId as LayerFields["assetVariantId"],
      versionId: versionId as LayerFields["versionId"],
    }, group);
    return ok
      ? null
      : t("app-scene-editor-layer-image-dialog.save-version.message.7a4f87dfc982");
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
      const err = await saveVersion(
        up.versionId,
        up.media,
        [t("app-scene-editor-layer-image-dialog.err.l-lastet-opp-fra-sceneeditoren-uploaded-from-the-scene-editor-up-note-filter.e2670a2f5805"), up.note]
          .filter(Boolean)
          .join(" "),
        t("app-scene-editor-layer-image-dialog.err.save-version.88337b4ddfd9", { name: String(asset.name) }),
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
            {t("app-scene-editor-layer-image-dialog.body.dialog-title.e77f922ac080", { name: String(layer.name) })}
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
              label={t("app-scene-editor-layer-image-dialog.body.label.54007d9b85d4", { name: String(asset.name), name2: String(layer.name) })}
            />
          ) : null}
        </div>
        <DialogDescription>
          {asset
            ? t("app-scene-editor-layer-image-dialog.body.dialog-description.649e4c194560", { name: String(asset.name), value2: String(ASSET_KIND_LABEL[asset.kind]) })
            : t("app-scene-editor-layer-image-dialog.body.dialog-description.04da70c619f2")}
        </DialogDescription>
      </DialogHeader>

      {asset ? (
        <div className="flex flex-col gap-4">
          {/* Standard: ressursens forsidebilde (følger godkjent bilde) */}
          <section
            aria-label={t("app-scene-editor-layer-image-dialog.body.aria-label.e3605750a023")}
            className="flex flex-col gap-1.5"
          >
            <h3 className="text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
              {t("app-scene-editor-layer-image-dialog.body.h3.8052b7ca5d08")}
            </h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
              <button
                type="button"
                disabled={!editable}
                aria-pressed={layer.assetVariantId === null}
                onClick={() =>
                  setLayer(t("app-scene-editor-layer-image-dialog.body.set-layer.9a26ce4898ea"), {
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
                title={t("app-scene-editor-layer-image-dialog.body.title.bb0efe14f110")}
              >
                <Thumb url={cover ? urls[cover.mediaPath] : undefined} />
                <span className="px-1.5 pt-1 text-[12px] text-text-primary">
                  {t("app-scene-editor-layer-image-dialog.body.span.56a15cee702b")}
                </span>
                <span className="px-1.5 pb-1 text-[11px] text-text-tertiary">
                  {t("app-scene-editor-layer-image-dialog.body.span.a3eda72b2ac6")}
                </span>
                {layer.assetVariantId === null ? <Selected /> : null}
              </button>
            </div>
          </section>

          {variants.length === 0 ? (
            <p className="text-xs text-text-tertiary">
              {t("app-scene-editor-layer-image-dialog.body.p.26389a909457")}
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
                    <h3 className="text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
                      {v.name || t("app-scene-editor-layer-image-dialog.body.h3.66b83752ff74")}
                    </h3>
                    <span className="text-[11px] text-text-tertiary">
                      {STYLE_LABEL[v.style]}
                      {v.appearance ? ` · ${v.appearance}` : ""}
                      {v.archived ? t("app-scene-editor-layer-image-dialog.body.span.8b03bafdaca5") : ""}
                    </span>
                    {versions.length > 0 ? (
                      <button
                        type="button"
                        disabled={!editable}
                        aria-pressed={followOn}
                        onClick={() =>
                          setLayer(t("app-scene-editor-layer-image-dialog.body.set-layer.0afbc6a4a2e4"), {
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
                        title={t("app-scene-editor-layer-image-dialog.body.title.0bf8ebf61c5d")}
                      >
                        {followOn
                          ? t("app-scene-editor-layer-image-dialog.body.button.b67c79709b66")
                          : t("app-scene-editor-layer-image-dialog.body.button.0afbc6a4a2e4")}
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
                          t("app-scene-editor-layer-image-dialog.err.cmds-run.3cf2a41b3bb8", { value1: String(ver?.number ?? "") }),
                        );
                        setError(err);
                        if (!err) setDeleting(null);
                      }}
                    />
                  ) : null}
                  {versions.length === 0 ? (
                    <p className="text-xs text-text-tertiary">
                      {t("app-scene-editor-layer-image-dialog.body.p.139e32706cb4")}
                    </p>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                      {versions.map((ver) => {
                        const glow = highlight[ver.id] ?? "none";
                        const locked = layer.versionId === ver.id;
                        const on = locked || (followOn && shown?.id === ver.id);
                        return (
                          <div
                            key={ver.id}
                            data-brief-highlight={glow}
                            className={
                              "group/tile relative rounded-sm transition-opacity " +
                              (glow === "match"
                                ? "shadow-[0_0_0_2px_var(--accent-brand),0_0_12px_var(--accent-brand)]"
                                : glow === "dim"
                                  ? "opacity-60"
                                  : "")
                            }
                            title={glow === "match" ? t("brief.versions.fromText") : undefined}
                          >
                            <button
                              type="button"
                              disabled={!editable}
                              aria-pressed={locked}
                              onClick={() =>
                                setLayer(
                                  t("app-scene-editor-layer-image-dialog.body.set-layer.3cbbbbbe87aa", { number: String(ver.number) }),
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
                              title={t("app-scene-editor-layer-image-dialog.body.title.9b6b3d5ecad2", { number: String(ver.number), value2: String(ver.note ? ` – ${ver.note}` : "") })}
                            >
                              <Thumb url={urls[ver.mediaPath]} />
                              <span className="flex items-center gap-1 px-1.5 py-1 text-[12px] text-text-primary">
                                v{ver.number}
                                {v.approvedVersionId === ver.id ? (
                                  <span className="rounded-sm bg-status-success-bg px-1 text-[11px] text-status-success">
                                    {t("app-scene-editor-layer-image-dialog.body.span.de2f6af6c508")}
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
                                aria-label={t("app-scene-editor-layer-image-dialog.body.aria-label.9a2ff6c64427", { number: String(ver.number) })}
                                title={t("app-scene-editor-layer-image-dialog.body.title.092211641dfd")}
                                className="rounded-sm bg-surface-1/90 p-0.5 text-text-secondary hover:text-text-primary"
                              >
                                <Maximize2 className="size-3.5" aria-hidden />
                              </button>
                              {editable ? (
                                <button
                                  type="button"
                                  onClick={() => setDeleting(ver.id)}
                                  aria-label={t("app-scene-editor-layer-image-dialog.body.aria-label.6abd63eacb7b", { number: String(ver.number) })}
                                  title={t("app-scene-editor-layer-image-dialog.body.title.5e4b0d928963")}
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
            aria-label={t("app-scene-editor-layer-image-dialog.body.aria-label.6c1193abf401")}
            className="flex flex-col gap-3 border-t border-border pt-3"
          >
            {/* Opplasting på én linje over AI-panelet, så ingen kolonne står tom (DEC-0076 funn 8) */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm border border-border bg-surface-1 p-3">
              <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                <Upload className="size-4" aria-hidden />{" "}
                {t("app-scene-editor-layer-image-dialog.body.h3.e1d574d7fba3")}
              </h3>
              <p className="min-w-0 flex-1 text-xs text-text-tertiary">
                {t("app-scene-editor-layer-image-dialog.body.p.a78999adf0aa")}
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
                        {v.name || t("app-scene-editor-layer-image-dialog.body.option.66b83752ff74")}
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
                aria-label={t("app-scene-editor-layer-image-dialog.body.aria-label.4d4c8a4fe30b")}
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
                {busy ? t("app-scene-editor-layer-image-dialog.body.button.4644de1a142c") : t("app-scene-editor-layer-image-dialog.body.button.31c38b9619fa")}
              </Button>
            </div>
            <GenerateImagePanel
              saveBriefVersions={(versions, activeId) =>
                cmds.run(
                  { type: "SetAssetBriefVersions", assetId: asset.id, versions, activeId },
                  t("brief.versions.save", { name: String(asset.name) }),
                )
              }
              onBriefShown={setActiveBrief}
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
                  t("app-scene-editor-layer-image-dialog.body.save-version.7051f127d1d4", { model: String(img.model) }),
                  t("app-scene-editor-layer-image-dialog.body.save-version.a78661091aa0", { name: String(asset.name) }),
                  img.briefVersionId,
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
            setLayer(t("app-scene-editor-layer-image-dialog.body.set-layer.d6541bc17acd"), {
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
            setLayer(t("app-scene-editor-layer-image-dialog.body.set-layer.fba9a181adf6"), {
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
        initialPanel={initialPanel}
        open={big !== null}
        onOpenChange={(o) => !o && setBig(null)}
        projectId={projectId}
        version={big?.version ?? null}
        url={big ? urls[big.version.mediaPath] : undefined}
        title={
          big && asset
            ? t("app-scene-editor-layer-image-dialog.big-title", { asset: asset.name, variant: big.variantName || t("app-scene-editor-layer-image-dialog.big-title-unnamed"), version: big.version.number })
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
                // P8 «Bruk bare her» (REQ-0141): bare dette laget viser det harmoniserte bildet
                ...(editable
                  ? {
                      onUseHere: (versionId: string) => {
                        const now = cmds.current() ?? state;
                        const v = now.assetVersions[versionId];
                        if (!v) return;
                        setLayer(t("app-scene-editor-layer-image-dialog.on-use-here.set-layer.043a3896c91b"), {
                          assetVariantId: v.variantId as LayerFields["assetVariantId"],
                          versionId: versionId as LayerFields["versionId"],
                        });
                      },
                    }
                  : {}),
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
                        const label = t("app-scene-editor-layer-image-dialog.label.on-place-parts.b718f27659ed");
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
              {t("app-scene-editor-layer-image-dialog.body.link.769abd72f77b")}
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
            title={t("app-scene-editor-layer-image-dialog.body.title.96ffb697c0d9")}
          >
            <Scissors />
            {t("app-scene-editor-layer-image-dialog.body.button.7958c1ef5871")}
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onClose}>
          {t("app-scene-editor-layer-image-dialog.body.button.a5c7f5180f75")}
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
        placeholder={t("app-scene-editor-layer-image-dialog.asset-picker.placeholder.750cd0de9dee")}
        aria-label={t("app-scene-editor-layer-image-dialog.asset-picker.aria-label.5206b6737078")}
        className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
      />
      {list.length === 0 ? (
        <p className="text-xs text-text-tertiary">
          {t("app-scene-editor-layer-image-dialog.asset-picker.p.fe014759b96f")}
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
        <Thumbnail src={url} alt="" className="h-full w-full p-1.5" draggable={false} />
      ) : (
        <ImageOff className="size-5 text-text-tertiary" aria-hidden />
      )}
    </span>
  );
}

function Selected() {
  return (
    <span className="absolute right-1 top-1 rounded-full bg-accent-brand p-0.5 text-accent-fg">
      <Check className="size-3" aria-label={t("app-scene-editor-layer-image-dialog.selected.aria-label.030197fbd738")} />
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
      aria-label={t("app-scene-editor-layer-image-dialog.delete-version-confirm.aria-label.cf8fc3213c1e", { number: String(v.number) })}
      className="flex flex-col gap-2 rounded-sm border border-status-danger/50 bg-surface-1 p-2 text-xs"
    >
      {approved ? (
        <p className="text-text-primary">
          {t("app-scene-editor-layer-image-dialog.delete-version-confirm.p.6380696bd3dc", { number: String(v.number) })}
        </p>
      ) : (
        <p className="text-text-primary">
          {t("app-scene-editor-layer-image-dialog.delete-version-confirm.p.03cb6e977c56", { number: String(v.number) })}
          {lockedLayers
            ? lockedLayers === 1 ? t("app-scene-editor-layer-image-dialog.locked-layer") : t("app-scene-editor-layer-image-dialog.locked-layers", { count: lockedLayers })
            : t("app-scene-editor-layer-image-dialog.delete-version-confirm.p.b9d43c5be592")}
        </p>
      )}
      <div className="flex gap-2">
        {!approved ? (
          <Button size="sm" variant="destructive" onClick={onConfirm}>
            <Trash2 /> {t("app-scene-editor-layer-image-dialog.delete-version-confirm.button.606860c55a99")}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t("app-scene-editor-layer-image-dialog.delete-version-confirm.button.79918e567ea6")}
        </Button>
      </div>
    </div>
  );
}
