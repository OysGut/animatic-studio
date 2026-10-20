/**
 * Detaljer for én ressurs: navn og alternative navn (REQ-0126), kategori og stikkord (REQ-0124),
 * visuelle varianter med bildeversjoner og godkjenning (REQ-0135, REQ-0136, REQ-0146, REQ-0149)
 * og scenene der ressursen er brukt (REQ-0131). Kontinuitet (DEC-0055) i ContinuityPanel.
 */
import { NoteFlagControl } from "@/app/dialogue/NoteFlagControl";
import { Link } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  Check,
  Crop,
  Drama,
  ImagePlus,
  Loader2,
  Music,
  Plus,
  Scissors,
  Trash2,
  X,
} from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { CutoutDialog } from "./CutoutDialog";
import { ImageLightbox } from "./ImageLightbox";
import { VisualBriefEditor } from "./VisualBriefEditor";
import { ContinuityPanel } from "./ContinuityPanel";
import { ApproveImpactDialog } from "./ApproveImpactDialog";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SaveToGlobalButton } from "@/app/global/SaveToGlobalButton";
import { ASSET_KIND_LABEL, ASSET_KINDS, ASSET_MIME_TYPES, USAGE_LABEL, VISUAL_STYLES, allAssetUsage, assetVersionImpact, contentSyncByScene, contentSyncText, provenanceDetail, provenanceLabel, formatHeading, hasContinuity, newId, variantsOf, versionsOf, versionFromFileName, type Asset, type AssetFields, type AssetNameKind, type AssetVariant, type AssetVersion, type GenerationJob, type ProjectState, type SceneContentSync, type VersionOrigin, type VersionProvenance, type VisualStyle, workingImageMaxSide, assetUsageCounts, locale } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { useProfiles } from "@/app/project/use-project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IMAGE_ACCEPT, addUploadedImage, uploadAssetImage, useImageUrls } from "./asset-images";
import { ImageViewer } from "./ImageViewer";
import { ReuploadDialog, type ReuploadItem } from "./ReuploadDialog";
import { uploadAssetAudio } from "./asset-audio";
import { GenerateSoundPanel } from "./GenerateSoundPanel";
import { ImageCompareDialog } from "./ImageCompareDialog";
import { SoundLinksSection } from "./SoundLinksSection";
import { MobileCameraButton } from "@/app/mobile/MobileImportDialog";
import { TakesMicButton } from "@/app/audio/AudioTakesDialog";
import { CharacterVoiceSection } from "./CharacterVoiceSection";
import { ContextNamesSection } from "./ContextNamesSection";
import { ContextLinkSuggestions } from "./ContextLinkSuggestions";
import { AssetWorklistDialog, useWorklistCount } from "./AssetWorklistDialog";
import { PaneResizer, usePaneSize } from "@/app/shell/pane-size";
import { t as tk, tLocalized } from "@/core/i18n/keyed";

const NAME_KIND_LABEL: Record<AssetNameKind, string> = tLocalized({ alias: "app-library-asset-detail.name-kind-label.alias.cac9be61c339", nickname: "app-library-asset-detail.name-kind-label.nickname.e5701b662546", former: "app-library-asset-detail.name-kind-label.former.9fc0ac08b353", language: "app-library-asset-detail.name-kind-label.language.995433f0237d" });

const STYLE_LABEL: Record<VisualStyle, string> = tLocalized({ reference: "app-library-asset-detail.style-label.reference.c54657cb5bf2", illustrated: "app-library-asset-detail.style-label.illustrated.505a87f8e201", realistic: "app-library-asset-detail.style-label.realistic.efa6eba6f907", animatic: "app-library-asset-detail.style-label.animatic.802b1cb19d83", poster: "app-library-asset-detail.style-label.poster.40ef2d563219", other: "app-library-asset-detail.style-label.other.346620e2dc3d" });

interface Props {
  readonly state: ProjectState;
  readonly projectId: string;
  readonly productionId: string;
  readonly asset: Asset;
  readonly editable: boolean;
  readonly cmds: Commands;
  readonly onGoToScene: (occurrenceId: string) => void;
  /** Opphav per versjon (REQ-0121, DEC-0078); mangler = vises ikke. */
  readonly provenance?: ReadonlyMap<string, VersionProvenance>;
  /** Filteret i biblioteket: vis bare versjoner med dette opphavet. */
  readonly origin?: VersionOrigin | "all";
  /** AI-jobbene (for innholdsmessig synk av AI-video, REQ-0022). */
  readonly jobs?: readonly GenerationJob[] | undefined;
}

const ORIGIN_CLASS: Record<VersionOrigin, string> = {
  upload: "border-border text-text-tertiary",
  ai: "border-accent-brand/50 text-text-primary",
  cutout: "border-border-control text-text-secondary",
  harmonized: "border-status-uncertain/50 text-text-primary",
};

function fieldsOf(a: Asset): AssetFields {
  return {
    kind: a.kind,
    name: a.name,
    names: a.names,
    description: a.description,
    category: a.category,
    tags: a.tags,
  };
}

const same = (x: AssetFields, y: AssetFields) => JSON.stringify(x) === JSON.stringify(y);

export function AssetDetail(props: Props) {
  const { state, asset, editable, cmds, productionId } = props;
  const [draft, setDraft] = useState<AssetFields>(() => fieldsOf(asset));
  const [tagsText, setTagsText] = useState(asset.tags.join(", "));
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [usedWidth, setUsedWidth] = usePaneSize("asset-used-in", 280, 200, 520);
  const last = useRef(fieldsOf(asset));
  // Ta inn endringer utenfra (andre brukere, angre) bare hvis brukeren ikke har ulagrede endringer.
  // Lagres bare når innholdet faktisk er endret (ny innlasting gir nye objekter med samme innhold).
  useEffect(() => {
    const now = fieldsOf(asset);
    const prev = last.current;
    if (same(now, prev)) return;
    last.current = now;
    const untouched = same(draft, prev) && tagsText === prev.tags.join(", ");
    if (untouched) {
      setDraft(now);
      setTagsText(now.tags.join(", "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset]);

  const withTags: AssetFields = {
    ...draft,
    tags: tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
  const dirty = !same(withTags, fieldsOf(asset));
  const usage = useMemo(
    () => allAssetUsage(state, productionId).get(asset.id) ?? [],
    [state, productionId, asset],
  );
  // Innholdsmessig synk (REQ-0022, DEC-0078): scener laget med en eldre versjon enn den som er godkjent nå
  const syncFlags = useMemo(
    () =>
      contentSyncByScene(state, productionId, {
        assetId: asset.id,
        ...(props.jobs ? { jobs: props.jobs } : {}),
      }),
    [state, productionId, asset.id, props.jobs],
  );
  const flaggedOnly = [...syncFlags.values()].filter(
    (f) => !usage.some((u) => u.occurrenceId === f.occurrenceId),
  );

  function save() {
    setErr(
      cmds.run(
        { type: "UpdateAsset", assetId: asset.id, fields: withTags },
        tk("app-library-asset-detail.save.cmds-run.2326823c276c", { name: String(asset.name) }),
      ),
    );
  }

  const setName = (i: number, patch: Partial<AssetFields["names"][number]>) =>
    setDraft((d) => ({
      ...d,
      names: d.names.map((n, j) => (j === i ? { ...n, ...patch } : n)),
    }));

  return (
    <div className="mx-auto flex max-w-[1100px] gap-6 p-6">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {/* Navn og beskrivelse */}
        <section className="flex flex-col gap-3 border border-border bg-surface-1 p-4">
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor="a-name" className="text-xs text-text-tertiary">
                {tk("app-library-asset-detail.asset-detail.label.075c2e80f75b")}
              </label>
              <Input
                id="a-name"
                value={draft.name}
                maxLength={200}
                disabled={!editable}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="h-9 bg-surface-3 text-base font-medium"
              />
            </div>
            <div className="flex w-[180px] flex-col gap-1">
              <label htmlFor="a-kind" className="text-xs text-text-tertiary">
                {tk("app-library-asset-detail.asset-detail.label.8ca55f16aea7")}
              </label>
              <select
                id="a-kind"
                value={draft.kind}
                disabled={!editable}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as Asset["kind"] })}
                className="h-9 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
              >
                {ASSET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ASSET_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            {asset.kind === "character" || asset.kind === "animal" ? (
              <Link
                to="/prosjekt/$projectId/storylab"
                params={{ projectId: props.projectId }}
                search={{ karakter: asset.id }}
                data-testid="asset-storylab"
                className="mt-5 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-sm px-2 text-[13px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                title={tk("app-library-asset-detail.asset-detail.title.e40ad82c4f1d", { name: String(asset.name) })}
              >
                <Drama className="size-4" aria-hidden />
                {tk("app-library-asset-detail.asset-detail.link.e40ad82c4f1d", { name: String(asset.name) })}
              </Link>
            ) : null}
            {/* Kameraikonet øverst til høyre: bilder og video fra mobilen havner her (DEC-0090) */}
            {editable && asset.kind !== "sound" ? (
              <MobileCameraButton
                className="mt-5"
                projectId={props.projectId}
                context={{ type: "asset", assetId: asset.id }}
                label={tk("app-library-asset-detail.asset-detail.label.c3b02881db89", { name: String(asset.name) })}
              />
            ) : editable ? (
              /* Mikrofonikonet for lyd (DEC-0093): opptak på datamaskinen og mobilen, som takes */
              <TakesMicButton
                className="mt-5"
                projectId={props.projectId}
                state={state}
                cmds={cmds}
                target={{ kind: "sound", assetId: asset.id }}
                label={tk("app-library-asset-detail.asset-detail.label.506f5e544ce4", { name: String(asset.name) })}
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-text-tertiary">
              {tk("app-library-asset-detail.asset-detail.span.43af31a1858e")}
            </span>
            {draft.names.length === 0 ? (
              <p className="text-xs text-text-tertiary">
                {tk("app-library-asset-detail.asset-detail.p.bebf67b5d211")}
              </p>
            ) : null}
            {draft.names.map((n, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  aria-label={tk("app-library-asset-detail.asset-detail.aria-label.67f83ae3e22f", { value1: String(i + 1) })}
                  value={n.name}
                  maxLength={200}
                  disabled={!editable}
                  onChange={(e) => setName(i, { name: e.target.value })}
                  className="h-8 min-w-0 flex-1 bg-surface-3 text-[13px]"
                />
                <select
                  aria-label={tk("app-library-asset-detail.asset-detail.aria-label.45f8ba674b84", { value1: String(i + 1) })}
                  value={n.kind}
                  disabled={!editable}
                  onChange={(e) =>
                    setName(i, {
                      kind: e.target.value as AssetNameKind,
                      language: e.target.value === "language" ? (n.language ?? "en") : null,
                    })
                  }
                  className="h-8 w-[150px] rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                >
                  {(Object.keys(NAME_KIND_LABEL) as AssetNameKind[]).map((k) => (
                    <option key={k} value={k}>
                      {NAME_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                {n.kind === "language" ? (
                  <Input
                    aria-label={tk("app-library-asset-detail.asset-detail.aria-label.da622ec81dfa", { value1: String(i + 1) })}
                    title={tk("app-library-asset-detail.asset-detail.title.d34d9105bf66")}
                    value={n.language ?? ""}
                    maxLength={12}
                    disabled={!editable}
                    onChange={(e) => setName(i, { language: e.target.value.toLowerCase() })}
                    className="h-8 w-[56px] bg-surface-3 text-xs"
                  />
                ) : null}
                {editable ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={tk("app-library-asset-detail.asset-detail.aria-label.219d8b430a93", { name: String(n.name) })}
                    onClick={() =>
                      setDraft((d) => ({ ...d, names: d.names.filter((_, j) => j !== i) }))
                    }
                  >
                    <X />
                  </Button>
                ) : null}
              </div>
            ))}
            {editable ? (
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    names: [...d.names, { name: "", kind: "alias", language: null }],
                  }))
                }
              >
                <Plus />
                {tk("app-library-asset-detail.asset-detail.button.996f073f4a91")}
              </Button>
            ) : null}
          </div>
          {asset.kind !== "sound" ? (
            <ContextNamesSection
              state={state}
              asset={asset}
              productionId={productionId}
              editable={editable}
              cmds={cmds}
            />
          ) : null}
          {asset.kind !== "sound" ? (
            <ContextLinkSuggestions
              state={state}
              asset={asset}
              productionId={productionId}
              editable={editable}
              cmds={cmds}
            />
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="a-cat" className="text-xs text-text-tertiary">
                {tk("app-library-asset-detail.asset-detail.label.46055f39de45")}
              </label>
              <Input
                id="a-cat"
                value={draft.category}
                maxLength={100}
                disabled={!editable}
                placeholder={tk("app-library-asset-detail.asset-detail.placeholder.b0a32a6006a8")}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className="h-8 bg-surface-3 text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="a-tags" className="text-xs text-text-tertiary">
                {tk("app-library-asset-detail.asset-detail.label.d696fb1ac9af")}
              </label>
              <Input
                id="a-tags"
                value={tagsText}
                disabled={!editable}
                placeholder={tk("app-library-asset-detail.asset-detail.placeholder.e4da71a6752b")}
                onChange={(e) => setTagsText(e.target.value)}
                className="h-8 bg-surface-3 text-[13px]"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="a-desc" className="text-xs text-text-tertiary">
              {tk("app-library-asset-detail.asset-detail.label.3efe11b63666")}
            </label>
            <Textarea
              id="a-desc"
              value={draft.description}
              maxLength={5000}
              disabled={!editable}
              rows={3}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className="bg-surface-3 text-[13px]"
            />
          </div>
          {editable ? (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={save} disabled={!dirty}>
                <Check />
                {tk("app-library-asset-detail.asset-detail.button.e290da0f2adb")}
              </Button>
              {dirty ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(fieldsOf(asset));
                    setTagsText(asset.tags.join(", "));
                  }}
                >
                  {tk("app-library-asset-detail.asset-detail.button.1f0e12b0590b")}
                </Button>
              ) : null}
              {editable ? <SaveToGlobalButton projectId={props.projectId} asset={asset} /> : null}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() =>
                  setErr(
                    cmds.run(
                      { type: "SetAssetArchived", assetId: asset.id, archived: !asset.archived },
                      asset.archived
                        ? tk("app-library-asset-detail.asset-detail.cmds-run.91f8f799d264", { name: String(asset.name) })
                        : tk("app-library-asset-detail.asset-detail.cmds-run.9f250eebb497", { name: String(asset.name) }),
                    ),
                  )
                }
                title={
                  asset.archived
                    ? tk("app-library-asset-detail.asset-detail.title.bb7f8eb3f520")
                    : tk("app-library-asset-detail.asset-detail.title.1c3012b76027")
                }
              >
                {asset.archived ? <ArchiveRestore /> : <Archive />}
                {asset.archived ? tk("app-library-asset-detail.asset-detail.button.db5b5e70e536") : tk("app-library-asset-detail.asset-detail.button.4053891f330a")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                title={tk("app-library-asset-detail.asset-detail.title.4629da3ff13a")}
                className="text-status-danger"
              >
                <Trash2 />
                {tk("app-library-asset-detail.asset-detail.button.4023b5954313")}
              </Button>
            </div>
          ) : null}
          {confirmDelete ? (
            <DeleteAssetConfirm
              state={state}
              assetId={asset.id}
              onCancel={() => setConfirmDelete(false)}
              onConfirm={() => {
                const e = cmds.run(
                  { type: "SetAssetsRemoved", assetIds: [asset.id], removed: true },
                  tk("app-library-asset-detail.e.cmds-run.2d765dbd6ed4", { name: String(asset.name) }),
                );
                setErr(e);
                setConfirmDelete(false);
              }}
            />
          ) : null}
          {err ? (
            <p role="alert" className="text-xs text-status-danger">
              {err}
            </p>
          ) : null}
        </section>

        {["character", "animal", "other"].includes(asset.kind) ? <CharacterVoiceSection state={state} asset={asset} projectId={props.projectId} cmds={cmds} editable={editable} /> : null}
        {asset.kind !== "sound" ? (
          <section className="border border-border bg-surface-1 p-4">
            <VisualBriefEditor state={state} asset={asset} cmds={cmds} editable={editable} />
          </section>
        ) : null}
        {asset.kind === "sound" ? (
          <SoundLinksSection
            state={state}
            asset={asset}
            productionId={productionId}
            editable={editable}
            cmds={cmds}
          />
        ) : null}
        <Variants {...props} />
        {hasContinuity(asset) ? (
          <ContinuityPanel
            state={state}
            asset={asset}
            editable={editable}
            cmds={cmds}
            productionId={productionId}
            onGoToScene={props.onGoToScene}
          />
        ) : null}
      </div>

      {/* Bruk i manuset */}
      <aside
        aria-label={tk("app-library-asset-detail.asset-detail.aria-label.7310e816d7b2")}
        style={{ width: usedWidth }}
        className="relative shrink-0"
      >
        <PaneResizer
          edge="left"
          size={usedWidth}
          onSize={setUsedWidth}
          min={200}
          max={520}
          label={tk("app-library-asset-detail.asset-detail.label.9c0585a0436d")}
        />
        <div className="border border-border bg-surface-1">
          <div className="flex h-8 items-center justify-between border-b border-border bg-surface-2 px-2 text-chrome-label font-medium uppercase tracking-label text-text-tertiary">
            <span>{tk("app-library-asset-detail.asset-detail.span.7310e816d7b2")}</span>
            <span className="font-mono tabular-nums normal-case tracking-normal">{usage.length}</span>
          </div>
          {usage.length === 0 ? (
            <p className="px-3 py-3 text-xs text-text-tertiary">
              {tk("app-library-asset-detail.asset-detail.p.c6bdef082565")}
            </p>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto py-1">
              {usage.map((u) => {
                const occ = state.occurrences[u.occurrenceId]!;
                const v = state.variants[occ.variantId];
                return (
                  <li key={u.occurrenceId}>
                    <button
                      type="button"
                      onClick={() => props.onGoToScene(u.occurrenceId)}
                      title={tk("app-library-asset-detail.asset-detail.title.7bbe30bef638")}
                      className={
                        "grid w-full grid-cols-[34px_1fr] gap-1.5 px-3 py-1 text-left hover:bg-surface-3" +
                        (u.active ? "" : " opacity-60")
                      }
                    >
                      <span className="tabular truncate text-right font-mono text-xs text-text-secondary">
                        {u.number ?? "–"}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs text-text-primary">
                          {v ? formatHeading(v.heading) : "—"}
                        </span>
                        <span className="block truncate text-[11px] text-text-tertiary">
                          {USAGE_LABEL[u.how]}
                          {u.matchedName !== asset.name
                            ? tk("app-library-asset-detail.asset-detail.span.4721799db868", { matchedName: String(u.matchedName) })
                            : ""}
                          {u.active ? "" : tk("app-library-asset-detail.asset-detail.span.d016421103b8")}
                        </span>
                        <SyncFlag state={state} flag={syncFlags.get(u.occurrenceId)} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {flaggedOnly.length ? (
            <ul
              aria-label={tk("app-library-asset-detail.asset-detail.aria-label.92a5eab98df3")}
              className="border-t border-border py-1"
            >
              {flaggedOnly.map((f) => {
                const occ = state.occurrences[f.occurrenceId];
                const v = occ ? state.variants[occ.variantId] : undefined;
                return (
                  <li key={f.occurrenceId}>
                    <button
                      type="button"
                      onClick={() => props.onGoToScene(f.occurrenceId)}
                      title={tk("app-library-asset-detail.asset-detail.title.7bbe30bef638.2")}
                      className="grid w-full grid-cols-[34px_1fr] gap-1.5 px-3 py-1 text-left hover:bg-surface-3"
                    >
                      <span className="tabular truncate text-right font-mono text-xs text-text-secondary">
                        {f.sceneNumber ?? "–"}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs text-text-primary">
                          {v ? formatHeading(v.heading) : "—"}
                        </span>
                        <span className="block truncate text-[11px] text-text-tertiary">
                          {tk("app-library-asset-detail.asset-detail.span.9708afcf546f")}
                        </span>
                        <SyncFlag state={state} flag={f} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {asset.kind !== "character" && asset.kind !== "location" && usage.length ? (
            <p className="border-t border-border px-3 py-2 text-[11px] text-text-tertiary">
              {tk("app-library-asset-detail.asset-detail.p.b8422fc38d18")}
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

/** «Ressursen er oppdatert etter at scenen ble laget» (REQ-0022, DEC-0078). */
function SyncFlag({ state, flag }: { state: ProjectState; flag: SceneContentSync | undefined }) {
  if (!flag) return null;
  const text = contentSyncText(state, flag);
  const steps = [
    ...new Set(
      flag.items.map((it) => {
        const a = state.assetVersions[it.oldVersionId]?.number;
        const b = state.assetVersions[it.newVersionId]?.number;
        return a && b ? `v${a} → v${b}` : "";
      }),
    ),
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <span
      className="mt-0.5 block text-[11px] leading-snug text-status-uncertain"
      title={tk("app-library-asset-detail.sync-flag.title.43bd508edfc5", { text: String(text) })}
    >
      {tk("app-library-asset-detail.sync-flag.span.c00bb140fb6c")}
      {steps ? ` (${steps})` : ""}
    </span>
  );
}

// ---------- Visuelle varianter og bildeversjoner ----------

function Variants({
  state,
  projectId,
  productionId,
  asset,
  editable,
  cmds,
  provenance,
  origin = "all",
}: Props) {
  const variants = variantsOf(state, asset.id);
  const [name, setName] = useState("");
  const [style, setStyle] = useState<VisualStyle>("animatic");
  const [appearance, setAppearance] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const paths = variants.flatMap((v) => versionsOf(state, v.id).map((x) => x.mediaPath));
  const urls = useImageUrls(paths);
  const shown = variants.filter((v) => showArchived || !v.archived);
  const archivedCount = variants.length - variants.filter((v) => !v.archived).length;
  // Arbeidslisten (DEC-0072): scener som fortsatt viser en eldre versjon av ressursen
  const behind = useWorklistCount(state, projectId, productionId, asset.id);
  const [worklistOpen, setWorklistOpen] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      {behind > 0 ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-sm border border-status-uncertain/40 bg-status-uncertain/10 px-3 py-2 text-xs text-text-primary"
        >
          <span>
            {behind}{" "}
            {behind === 1
              ? tk("app-library-asset-detail.variants.span.0992ba5bae33")
              : tk("app-library-asset-detail.variants.span.363469830023")}{" "}
            {tk("app-library-asset-detail.variants.span.98f6f95cb137")} {asset.name}.
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={() => setWorklistOpen(true)}
          >
            {tk("app-library-asset-detail.variants.button.527e1706f5c2")}
          </Button>
          {worklistOpen ? (
            <AssetWorklistDialog
              open={worklistOpen}
              onOpenChange={setWorklistOpen}
              state={state}
              projectId={projectId}
              productionId={productionId}
              assetId={asset.id}
              editable={editable}
              cmds={cmds}
            />
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <h2 className="shrink-0 whitespace-nowrap text-sm font-medium text-text-primary">
          {asset.kind === "sound"
            ? tk("app-library-asset-detail.variants.h2.f460b5b5c7d3")
            : tk("app-library-asset-detail.variants.h2.03537eeb3e9c")}
        </h2>
        <span className="text-xs text-text-tertiary">
          {asset.kind === "sound"
            ? tk("app-library-asset-detail.variants.span.fcdc36659688")
            : tk("app-library-asset-detail.variants.span.2b4a38427761")}
        </span>
        {archivedCount ? (
          <label className="ml-auto flex items-center gap-1 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="size-3.5 accent-[var(--accent-brand)]"
            />
            {tk("app-library-asset-detail.variants.label.66219fb0ed5f")} ({archivedCount})
          </label>
        ) : null}
      </div>
      {shown.map((v) => (
        <VariantCard
          key={v.id}
          state={state}
          projectId={projectId}
          productionId={productionId}
          asset={asset}
          variant={v}
          editable={editable}
          cmds={cmds}
          urls={urls.data ?? {}}
          provenance={provenance}
          origin={origin}
        />
      ))}
      {variants.length === 0 ? (
        <p className="text-[13px] text-text-secondary">
          {tk("app-library-asset-detail.variants.p.9295e143c1f3")}
        </p>
      ) : null}
      {editable ? (
        <form
          className="flex flex-wrap items-end gap-2 border border-dashed border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim() || STYLE_LABEL[style];
            const r = cmds.run(
              {
                type: "CreateAssetVariant",
                variantId: newId<"asset_variant">(),
                assetId: asset.id,
                fields: { name: n, style, appearance },
              },
              tk("app-library-asset-detail.r.cmds-run.763e8f23e6fd", { n: String(n) }),
            );
            setErr(r);
            if (!r) {
              setName("");
              setAppearance("");
            }
          }}
        >
          <Field label={tk("app-library-asset-detail.variants.label.c2624a75b433")}>
            <Input
              value={name}
              maxLength={200}
              placeholder={STYLE_LABEL[style]}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-[180px] bg-surface-3 text-[13px]"
            />
          </Field>
          <Field label={tk("app-library-asset-detail.variants.label.661274bdd067")}>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as VisualStyle)}
              className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
            >
              {VISUAL_STYLES.map((s) => (
                <option key={s} value={s}>
                  {STYLE_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tk("app-library-asset-detail.variants.label.f5ea4f263706")}>
            <Input
              value={appearance}
              maxLength={500}
              placeholder={tk("app-library-asset-detail.variants.placeholder.09f52ed30bcd")}
              onChange={(e) => setAppearance(e.target.value)}
              className="h-8 w-[220px] bg-surface-3 text-[13px]"
            />
          </Field>
          <Button type="submit" size="sm" variant="secondary">
            <Plus />
            {tk("app-library-asset-detail.variants.button.3c1dc4f7fee7")}
          </Button>
          {err ? (
            <p role="alert" className="w-full text-xs text-status-danger">
              {err}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-tertiary">
      {label}
      {children}
    </label>
  );
}

function VariantCard({
  state,
  projectId,
  productionId,
  asset,
  variant,
  editable,
  cmds,
  urls,
  provenance,
  origin,
}: {
  state: ProjectState;
  projectId: string;
  productionId: string;
  asset: Asset;
  variant: AssetVariant;
  editable: boolean;
  cmds: Commands;
  urls: Readonly<Record<string, string>>;
  provenance: ReadonlyMap<string, VersionProvenance> | undefined;
  origin: VersionOrigin | "all";
}) {
  const versions = versionsOf(state, variant.id);
  // Filteret på opphav (REQ-0121, DEC-0078): de andre versjonene skjules bare i visningen
  const shownVersions =
    origin === "all" || !provenance
      ? versions
      : versions.filter((v) => provenance.get(v.id)?.origin === origin);
  const hiddenByFilter = versions.length - shownVersions.length;
  const profiles = useProfiles([...new Set(versions.map((v) => v.createdBy).filter(Boolean))]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [vName, setVName] = useState(variant.name);
  const [vStyle, setVStyle] = useState(variant.style);
  const [vAppearance, setVAppearance] = useState(variant.appearance);
  const input = useRef<HTMLInputElement | null>(null);
  const [cutoutId, setCutoutId] = useState<string | null>(null);
  /** Stor visning med bildeverktøy (DEC-0080): utsnitt, ruter, vinkel, oppskalering. */
  const [toolsId, setToolsId] = useState<string | null>(null);
  const toolsVersion = toolsId ? (versions.find((v) => v.id === toolsId) ?? null) : null;
  // Godkjenning med konsekvenser (DEC-0056): berørte scener vises først
  const [approving, setApproving] = useState<AssetVersion | null>(null);
  // Fullskjerm (DEC-0064): indeksen i `versions`
  const [viewingId, setViewingId] = useState<string | null>(null);
  // Versjons-ID, ikke plass i listen: nye bilder forskyver listen mens visningen er åpen
  const viewing = viewingId ? versions.findIndex((v) => v.id === viewingId) : -1;
  const setViewing = (i: number | null) =>
    setViewingId(i === null ? null : (versions[i]?.id ?? null));
  // Et nedlastet bilde lastes opp igjen (DEC-0064): spør om det skal erstatte eller legges til
  const [reupload, setReupload] = useState<ReuploadItem | null>(null);
  // Lyd med AI (DEC-0069)
  const [soundAi, setSoundAi] = useState(false);
  // Sammenligning av to versjoner (DEC-0070)
  const [compareIds, setCompareIds] = useState<readonly string[]>([]);
  const [comparing, setComparing] = useState(false);
  const compareVersions = versions.filter((v) => compareIds.includes(v.id));

  function approve(ver: AssetVersion) {
    if (assetVersionImpact(state, productionId, variant.id, ver.id).length) {
      setApproving(ver);
      return;
    }
    setErr(
      cmds.run(
        { type: "ApproveAssetVersion", variantId: variant.id, versionId: ver.id },
        tk("app-library-asset-detail.approve.cmds-run.b7a861a8849b", { number: String(ver.number), name: String(variant.name) }),
      ),
    );
  }

  async function upload(file: File) {
    setErr(null);
    // Samme navn som et bilde i prosjektet («Ressurs - Variant - vN»): spør først
    const match = asset.kind === "sound" ? null : versionFromFileName(state, file.name);
    if (match) {
      setReupload({ file, match });
      if (input.current) input.current.value = "";
      return;
    }
    setUploading(true);
    try {
      // Lydfiler (DEC-0044) og bilder lastes opp hver for seg
      if (asset.kind === "sound") {
        const { versionId, media } = await uploadAssetAudio(projectId, asset.id, file);
        const r = await cmds.runAndWait(
          {
            type: "AddAssetVersion",
            versionId: versionId as never,
            variantId: variant.id,
            media,
            note: "",
          },
          tk("app-library-asset-detail.r.cmds-run-and-wait.64b373c83b93", { name: String(variant.name) }),
        );
        if (r.error) setErr(r.error);
      } else {
        // Store bilder får en nedskalert arbeidskopi; originalen lagres som versjonen før (Mars 2026-10-13)
        const up = await uploadAssetImage(
          projectId,
          asset.id,
          file,
          workingImageMaxSide(state.project.frameWidth, state.project.frameHeight),
        );
        const e = await addUploadedImage(
          cmds.runAndWait,
          variant.id,
          up,
          tk("app-library-asset-detail.e.add-uploaded-image.af8d6ad653c3", { name: String(variant.name) }),
        );
        if (e) setErr(e);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div
      className={
        "flex flex-col gap-2 border border-border bg-surface-1 p-3" +
        (variant.archived ? " opacity-70" : "")
      }
    >
      <div className="flex items-start gap-2">
        {editing ? (
          <form
            className="flex flex-1 flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const r = cmds.run(
                {
                  type: "UpdateAssetVariant",
                  variantId: variant.id,
                  fields: { name: vName, style: vStyle, appearance: vAppearance },
                },
                tk("app-library-asset-detail.r.cmds-run.438fb9f5784f", { name: String(variant.name) }),
              );
              setErr(r);
              if (!r) setEditing(false);
            }}
          >
            <Field label={tk("app-library-asset-detail.variant-card.label.3d6c88f64c0c")}>
              <Input
                value={vName}
                maxLength={200}
                onChange={(e) => setVName(e.target.value)}
                className="h-8 w-[180px] bg-surface-3 text-[13px]"
              />
            </Field>
            <Field label={tk("app-library-asset-detail.variant-card.label.73f742aea38f")}>
              <select
                value={vStyle}
                onChange={(e) => setVStyle(e.target.value as VisualStyle)}
                className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
              >
                {VISUAL_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {STYLE_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={tk("app-library-asset-detail.variant-card.label.59207152ae60")}>
              <Input
                value={vAppearance}
                maxLength={500}
                onChange={(e) => setVAppearance(e.target.value)}
                className="h-8 w-[220px] bg-surface-3 text-[13px]"
              />
            </Field>
            <Button type="submit" size="sm">
              {tk("app-library-asset-detail.variant-card.button.c0f139e159f6")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {tk("app-library-asset-detail.variant-card.button.6214e4f3fc43")}
            </Button>
          </form>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[13px] font-medium text-text-primary">
              {variant.name}
              <NoteFlagControl state={state} kind="asset_variant" targetId={variant.id} run={cmds.run} editable={editable} />
              {variant.archived ? (
                <span className="ml-2 text-xs font-normal text-text-tertiary">
                  {tk("app-library-asset-detail.variant-card.span.a3d0e9f090f0")}
                </span>
              ) : null}
            </p>
            <p className="text-xs text-text-tertiary">
              {STYLE_LABEL[variant.style]}
              {variant.appearance ? ` · ${variant.appearance}` : ""}
            </p>
          </div>
        )}
        {editable && !editing ? (
          <div className="flex shrink-0 items-center gap-1">
            <input
              ref={input}
              type="file"
              accept={
                asset.kind === "sound"
                  ? "audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
                  : IMAGE_ACCEPT
              }
              className="hidden"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={uploading}
              onClick={() => input.current?.click()}
            >
              {uploading ? (
                <Loader2 className="animate-spin" />
              ) : asset.kind === "sound" ? (
                <Music />
              ) : (
                <ImagePlus />
              )}
              {uploading
                ? tk("app-library-asset-detail.variant-card.button.58d7a798f223")
                : asset.kind === "sound"
                  ? tk("app-library-asset-detail.variant-card.button.8d5f1eb48e4d")
                  : tk("app-library-asset-detail.variant-card.button.62a4e4606338")}
            </Button>
            {asset.kind === "sound" ? (
              <Button
                size="sm"
                variant="secondary"
                aria-expanded={soundAi}
                onClick={() => setSoundAi((x) => !x)}
              >
                <AiGlyph /> {tk("app-library-asset-detail.variant-card.button.3eca50599a04")}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setVName(variant.name);
                setVStyle(variant.style);
                setVAppearance(variant.appearance);
                setEditing(true);
              }}
            >
              {tk("app-library-asset-detail.variant-card.button.cb1547eeee81")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={
                variant.archived
                  ? tk("app-library-asset-detail.variant-card.aria-label.609d497c1f2e")
                  : tk("app-library-asset-detail.variant-card.aria-label.d4f49e061073")
              }
              title={
                variant.archived
                  ? tk("app-library-asset-detail.variant-card.title.fed0e3ebd92f")
                  : tk("app-library-asset-detail.variant-card.title.c51dd4e56bb5")
              }
              onClick={() =>
                setErr(
                  cmds.run(
                    {
                      type: "SetAssetVariantArchived",
                      variantId: variant.id,
                      archived: !variant.archived,
                    },
                    variant.archived
                      ? tk("app-library-asset-detail.variant-card.cmds-run.42942bd7d0c8")
                      : tk("app-library-asset-detail.variant-card.cmds-run.72744cb221f3"),
                  ),
                )
              }
            >
              {variant.archived ? <ArchiveRestore /> : <Archive />}
            </Button>
          </div>
        ) : null}
      </div>

      {soundAi && editable && asset.kind === "sound" ? (
        <GenerateSoundPanel
          projectId={projectId}
          asset={asset}
          variant={variant}
          cmds={cmds}
          onClose={() => setSoundAi(false)}
        />
      ) : null}
      {compareVersions.length === 2 ? (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={() => setComparing(true)}
        >
          {tk("app-library-asset-detail.variant-card.button.78487407b667")} v{compareVersions[0]!.number} {tk("app-library-asset-detail.variant-card.button.2f8b713cd5b3")} v
          {compareVersions[1]!.number}
        </Button>
      ) : null}
      {versions.length === 0 ? (
        <p className="text-xs text-text-tertiary">
          {asset.kind === "sound"
            ? tk("app-library-asset-detail.variant-card.p.3999408ab611")
            : tk("app-library-asset-detail.variant-card.p.c5a23afb4e26")}
        </p>
      ) : (
        <ul
          className="flex gap-2 overflow-x-auto pb-1"
          aria-label={tk("app-library-asset-detail.variant-card.aria-label.f94499f2a6b1", { name: String(variant.name) })}
        >
          {shownVersions.map((ver) => {
            const approved = variant.approvedVersionId === ver.id;
            const url = urls[ver.mediaPath];
            const prov = provenance?.get(ver.id);
            return (
              <li
                key={ver.id}
                className={
                  "flex w-[148px] shrink-0 flex-col gap-1 border p-1.5 " +
                  (approved ? "border-status-success bg-status-success-bg" : "border-border")
                }
              >
                <div className="flex justify-end"><NoteFlagControl state={state} kind="asset_version" targetId={ver.id} run={cmds.run} editable={editable} /></div>
                {asset.kind === "sound" ? (
                  <div className="flex h-[120px] flex-col items-center justify-center gap-2 bg-surface-3 px-1">
                    <Music className="size-6 text-text-tertiary" aria-hidden />
                    {url ? (
                      <audio
                        src={url}
                        controls
                        preload="none"
                        className="h-7 w-full"
                        aria-label={tk("app-library-asset-detail.variant-card.aria-label.91f3bc1bd842", { name: String(asset.name), number: String(ver.number) })}
                      />
                    ) : (
                      <Loader2 className="size-4 animate-spin text-text-tertiary" aria-hidden />
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onDoubleClick={() => setViewing(versions.indexOf(ver))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setViewing(versions.indexOf(ver));
                      }
                    }}
                    className="flex h-[120px] cursor-zoom-in items-center justify-center overflow-hidden bg-surface-3 p-1.5 focus-visible:outline-2 focus-visible:outline-focus-ring"
                    title={tk("app-library-asset-detail.variant-card.title.846abe9e17f7")}
                    aria-label={tk("app-library-asset-detail.variant-card.aria-label.f1e9196cc8ac", { name: String(asset.name), name2: String(variant.name), number: String(ver.number) })}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={tk("app-library-asset-detail.variant-card.alt.8a3a225c63c0", { name: String(asset.name), name2: String(variant.name), number: String(ver.number) })}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <Loader2 className="size-4 animate-spin text-text-tertiary" aria-hidden />
                    )}
                  </button>
                )}
                <div className="flex items-center justify-between text-[11px]">
                  <span className="tabular font-mono text-text-secondary">v{ver.number}</span>
                  {approved ? (
                    <span className="flex items-center gap-0.5 font-medium text-status-success">
                      <Check className="size-3" aria-hidden />
                      {tk("app-library-asset-detail.variant-card.span.e79d8716cb7d")}
                    </span>
                  ) : null}
                </div>
                {prov ? (
                  <span
                    className={
                      "self-start truncate rounded-sm border px-1 text-[11px] leading-4 " +
                      ORIGIN_CLASS[prov.origin]
                    }
                    style={{ maxWidth: "100%" }}
                    title={provenanceDetail(prov) + (ver.note ? `\n${ver.note}` : "")}
                    data-origin={prov.origin}
                  >
                    {prov.origin === "ai" ? (
                      <AiGlyph className="mr-0.5 inline size-2.5 align-[-1px]" aria-hidden />
                    ) : prov.origin === "cutout" ? (
                      <Scissors className="mr-0.5 inline size-2.5 align-[-1px]" aria-hidden />
                    ) : null}
                    {provenanceLabel(prov)}
                  </span>
                ) : null}
                <span
                  className="truncate text-[11px] text-text-tertiary"
                  title={ver.note || undefined}
                >
                  {new Date(ver.createdAt).toLocaleDateString(locale())}
                  {profiles.data?.[ver.createdBy]?.display_name
                    ? ` · ${profiles.data[ver.createdBy]!.display_name}`
                    : ""}
                  {ver.width && ver.height ? ` · ${ver.width}×${ver.height}` : ""}
                  {ver.durationMs
                    ? ` · ${(ver.durationMs / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 })} s`
                    : ""}
                </span>
                {editable && asset.kind !== "sound" ? (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-left text-[11px] text-text-tertiary hover:text-text-primary"
                    onClick={() => setCutoutId(ver.id)}
                    title={tk("app-library-asset-detail.variant-card.title.ecfdfb66fca2")}
                  >
                    <Scissors className="size-3" aria-hidden />
                    {tk("app-library-asset-detail.variant-card.button.9353f50f023d")}
                  </button>
                ) : null}
                {asset.kind !== "sound" && ver.mimeType.startsWith("image/") ? (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-left text-[11px] text-text-tertiary hover:text-text-primary"
                    onClick={() => setToolsId(ver.id)}
                    title={tk("app-library-asset-detail.variant-card.title.23c7fb729258")}
                  >
                    <Crop className="size-3" aria-hidden />
                    {tk("app-library-asset-detail.variant-card.button.da6c5c6da990")}
                  </button>
                ) : null}
                {asset.kind !== "sound" && versions.length > 1 ? (
                  <label className="flex items-center gap-1 text-[11px] text-text-tertiary">
                    <input
                      type="checkbox"
                      checked={compareIds.includes(ver.id)}
                      onChange={(e) =>
                        setCompareIds((cur) =>
                          e.target.checked
                            ? [...cur.filter((x) => x !== ver.id), ver.id].slice(-2)
                            : cur.filter((x) => x !== ver.id),
                        )
                      }
                    />
                    {tk("app-library-asset-detail.variant-card.label.78487407b667")}
                  </label>
                ) : null}
                {editable ? (
                  approved ? (
                    <button
                      type="button"
                      className="text-left text-[11px] text-text-tertiary hover:text-text-primary"
                      onClick={() =>
                        setErr(
                          cmds.run(
                            { type: "ApproveAssetVersion", variantId: variant.id, versionId: null },
                            tk("app-library-asset-detail.variant-card.cmds-run.133ed166ac52"),
                          ),
                        )
                      }
                    >
                      {tk("app-library-asset-detail.variant-card.button.133ed166ac52")}
                    </button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 justify-start px-1 text-xs"
                      onClick={() => approve(ver)}
                    >
                      {tk("app-library-asset-detail.variant-card.button.641237cfdd7d")}
                    </Button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {hiddenByFilter > 0 ? (
        <p className="text-[11px] text-text-tertiary">
          {hiddenByFilter === 1
            ? tk("app-library-asset-detail.variant-card.p.5c02ded0c664")
            : tk("app-library-asset-detail.variant-card.p.beaaec641337", { hiddenByFilter: String(hiddenByFilter) })}
        </p>
      ) : null}
      {versions.length > 1 ? (
        <p className="text-[11px] text-text-tertiary">
          {tk("app-library-asset-detail.variant-card.p.c16784746589")}
        </p>
      ) : null}
      {err ? (
        <p role="alert" className="text-xs text-status-danger">
          {err}
        </p>
      ) : null}
      {viewing >= 0 ? (
        <ImageViewer
          state={state}
          versions={versions}
          index={viewing}
          urls={urls}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {reupload ? (
        <ReuploadDialog
          state={state}
          projectId={projectId}
          cmds={cmds}
          items={[reupload]}
          onClose={() => setReupload(null)}
        />
      ) : null}
      <ApproveImpactDialog
        state={state}
        productionId={productionId}
        variant={variant}
        version={approving}
        cmds={cmds}
        onClose={() => setApproving(null)}
      />
      <ImageCompareDialog
        open={comparing && compareVersions.length === 2}
        onOpenChange={setComparing}
        title={`${asset.name} – ${variant.name}`}
        versions={compareVersions}
        urls={urls}
        approvedId={variant.approvedVersionId}
        editable={editable}
        onApprove={(v) => {
          approve(v);
          setComparing(false);
        }}
      />
      <ImageLightbox
        open={toolsVersion !== null}
        onOpenChange={(o) => !o && setToolsId(null)}
        projectId={projectId}
        version={toolsVersion}
        url={toolsVersion ? urls[toolsVersion.mediaPath] : undefined}
        title={
          toolsVersion
            ? `${asset.name} – ${variant.name || tk("app-library-asset-detail.variant-card.title.82f05d970b0a")} v${toolsVersion.number}`
            : ""
        }
        tools={{
          state,
          cmds,
          asset,
          editable,
          onCutout: (v) => {
            setToolsId(null);
            setCutoutId(v.id);
          },
        }}
      />
      <CutoutDialog
        open={cutoutId !== null}
        onOpenChange={(o) => {
          if (!o) setCutoutId(null);
        }}
        projectId={projectId}
        asset={asset}
        version={cutoutId ? (versions.find((v) => v.id === cutoutId) ?? null) : null}
        cmds={cmds}
      />
    </div>
  );
}

/** Advarselen før en ressurs slettes (DEC-0079): hva som skjer med scenene og lyden som bruker den. */
function DeleteAssetConfirm({
  state,
  assetId,
  onCancel,
  onConfirm,
}: {
  state: ProjectState;
  assetId: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const a = state.assets[assetId];
  if (!a) return null;
  const use = assetUsageCounts(state, assetId);
  return (
    <div
      role="alertdialog"
      aria-label={tk("app-library-asset-detail.delete-asset-confirm.aria-label.56e2a7dbe5da", { name: String(a.name) })}
      className="flex flex-col gap-2 rounded-sm border border-status-danger/60 bg-surface-1 p-2 text-xs"
    >
      <p className="text-text-primary">
        {tk("app-library-asset-detail.delete-asset-confirm.p.06dfebdebf71", { name: String(a.name) })}
        {use.layers || use.audio
          ? " " +
            tk("app-library-asset-detail.in-use", {
                uses: [
                  use.layers ? tk("app-library-asset-detail.in-use-layers", { count: use.layers, scenes: tk("app-library-asset-detail.in-use-scenes", { count: use.scenes }) }) : "",
                  use.audio ? tk("app-library-asset-detail.in-use-audio", { count: use.audio }) : "",
                ].filter(Boolean).join(tk("app-library-asset-detail.in-use-and")),
              })
          : tk("app-library-asset-detail.delete-asset-confirm.p.839ad620f73d")}{" "}
        {tk("app-library-asset-detail.delete-asset-confirm.p.b75f480fd5f0")}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" onClick={onConfirm}>
          <Trash2 /> {tk("app-library-asset-detail.delete-asset-confirm.button.9277c6792009")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {tk("app-library-asset-detail.delete-asset-confirm.button.5d261badec96")}
        </Button>
      </div>
    </div>
  );
}
