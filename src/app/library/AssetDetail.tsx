/**
 * Detaljer for én ressurs: navn og alternative navn (REQ-0126), kategori og stikkord (REQ-0124),
 * visuelle varianter med bildeversjoner og godkjenning (REQ-0135, REQ-0136, REQ-0146, REQ-0149)
 * og scenene der ressursen er brukt (REQ-0131). Kontinuitet (DEC-0055) i ContinuityPanel.
 */
import {
  Archive,
  ArchiveRestore,
  Check,
  Crop,
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
import {
  ASSET_KIND_LABEL,
  ASSET_KINDS,
  ASSET_MIME_TYPES,
  USAGE_LABEL,
  VISUAL_STYLES,
  allAssetUsage,
  assetVersionImpact,
  contentSyncByScene,
  contentSyncText,
  provenanceDetail,
  provenanceLabel,
  formatHeading,
  hasContinuity,
  newId,
  variantsOf,
  versionsOf,
  versionFromFileName,
  type Asset,
  type AssetFields,
  type AssetNameKind,
  type AssetVariant,
  type AssetVersion,
  type GenerationJob,
  type ProjectState,
  type SceneContentSync,
  type VersionOrigin,
  type VersionProvenance,
  type VisualStyle,
  workingImageMaxSide,
  assetUsageCounts,
  L,
  locale,
  localized,
} from "@/core";
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
import { ContextNamesSection } from "./ContextNamesSection";
import { AssetWorklistDialog, useWorklistCount } from "./AssetWorklistDialog";
import { PaneResizer, usePaneSize } from "@/app/shell/pane-size";

const NAME_KIND_LABEL: Record<AssetNameKind, string> = localized({
  alias: ["Alternativt navn", "Alternative name"],
  nickname: ["Kallenavn", "Nickname"],
  former: ["Tidligere navn", "Former name"],
  language: ["Annet språk", "Other language"],
});

const STYLE_LABEL: Record<VisualStyle, string> = localized({
  reference: ["Originalt referansebilde", "Original reference image"],
  illustrated: ["Illustrert", "Illustrated"],
  realistic: ["Filmrealistisk", "Film-realistic"],
  animatic: ["Animatic", "Animatic"],
  poster: ["Plakat", "Poster"],
  other: ["Annet", "Other"],
});

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
        L(`Endre «${asset.name}»`, `Edit “${asset.name}”`),
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
                {L("Foretrukket navn", "Preferred name")}
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
                {L("Type", "Type")}
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
            {/* Kameraikonet øverst til høyre: bilder og video fra mobilen havner her (DEC-0090) */}
            {editable && asset.kind !== "sound" ? (
              <MobileCameraButton
                className="mt-5"
                projectId={props.projectId}
                context={{ type: "asset", assetId: asset.id }}
                label={L(`Bilder av ${asset.name}`, `Pictures of ${asset.name}`)}
              />
            ) : editable ? (
              /* Mikrofonikonet for lyd (DEC-0093): opptak på datamaskinen og mobilen, som takes */
              <TakesMicButton
                className="mt-5"
                projectId={props.projectId}
                state={state}
                cmds={cmds}
                target={{ kind: "sound", assetId: asset.id }}
                label={L(`Opptak til «${asset.name}»`, `Recordings for “${asset.name}”`)}
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-text-tertiary">
              {L(
                "Alternative navn – brukes for å kjenne igjen ressursen i manuset",
                "Alternative names – used to recognise the asset in the script",
              )}
            </span>
            {draft.names.length === 0 ? (
              <p className="text-xs text-text-tertiary">
                {L("Ingen alternative navn.", "No alternative names.")}
              </p>
            ) : null}
            {draft.names.map((n, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  aria-label={L(`Alternativt navn ${i + 1}`, `Alternative name ${i + 1}`)}
                  value={n.name}
                  maxLength={200}
                  disabled={!editable}
                  onChange={(e) => setName(i, { name: e.target.value })}
                  className="h-8 min-w-0 flex-1 bg-surface-3 text-[13px]"
                />
                <select
                  aria-label={L(`Type navn ${i + 1}`, `Name type ${i + 1}`)}
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
                    aria-label={L(`Språkkode for navn ${i + 1}`, `Language code for name ${i + 1}`)}
                    title={L(
                      "Språkkode, f.eks. en for engelsk",
                      "Language code, e.g. en for English",
                    )}
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
                    aria-label={L(`Fjern navnet ${n.name}`, `Remove the name ${n.name}`)}
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
                {L("Legg til navn", "Add name")}
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

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="a-cat" className="text-xs text-text-tertiary">
                {L("Kategori", "Category")}
              </label>
              <Input
                id="a-cat"
                value={draft.category}
                maxLength={100}
                disabled={!editable}
                placeholder={L("F.eks. Familie, Rekvisitt, Gården", "E.g. Family, Props, The farm")}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className="h-8 bg-surface-3 text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="a-tags" className="text-xs text-text-tertiary">
                {L("Stikkord (skill med komma)", "Keywords (separated by commas)")}
              </label>
              <Input
                id="a-tags"
                value={tagsText}
                disabled={!editable}
                placeholder={L("F.eks. hovedrolle, vinter", "E.g. lead role, winter")}
                onChange={(e) => setTagsText(e.target.value)}
                className="h-8 bg-surface-3 text-[13px]"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="a-desc" className="text-xs text-text-tertiary">
              {L("Beskrivelse", "Description")}
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
                {L("Lagre endringer", "Save changes")}
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
                  {L("Forkast", "Discard")}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() =>
                  setErr(
                    cmds.run(
                      { type: "SetAssetArchived", assetId: asset.id, archived: !asset.archived },
                      asset.archived
                        ? L(`Hent fram «${asset.name}»`, `Restore “${asset.name}”`)
                        : L(`Arkiver «${asset.name}»`, `Archive “${asset.name}”`),
                    ),
                  )
                }
                title={
                  asset.archived
                    ? L("Vis ressursen i biblioteket igjen", "Show the asset in the library again")
                    : L(
                        "Skjul ressursen fra listen. Ingenting slettes, og scener som bruker den, påvirkes ikke.",
                        "Hide the asset from the list. Nothing is deleted, and scenes that use it are not affected.",
                      )
                }
              >
                {asset.archived ? <ArchiveRestore /> : <Archive />}
                {asset.archived ? L("Hent fram", "Restore") : L("Arkiver", "Archive")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                title={L(
                  "Flytt ressursen til «Slettede objekter» (kan hentes inn igjen)",
                  "Move the asset to “Deleted items” (it can be restored)",
                )}
                className="text-status-danger"
              >
                <Trash2 />
                {L("Slett …", "Delete …")}
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
                  L(`Slett «${asset.name}»`, `Delete “${asset.name}”`),
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
        aria-label={L("Brukt i scener", "Used in scenes")}
        style={{ width: usedWidth }}
        className="relative shrink-0"
      >
        <PaneResizer
          edge="left"
          size={usedWidth}
          onSize={setUsedWidth}
          min={200}
          max={520}
          label={L("Bredde på «Brukt i scener»", "Width of “Used in scenes”")}
        />
        <div className="border border-border bg-surface-1">
          <div className="flex h-8 items-center justify-between border-b border-border bg-surface-2 px-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
            <span>{L("Brukt i scener", "Used in scenes")}</span>
            <span className="font-mono tabular-nums normal-case tracking-normal">{usage.length}</span>
          </div>
          {usage.length === 0 ? (
            <p className="px-3 py-3 text-xs text-text-tertiary">
              {L(
                "Ikke funnet i manuset under noen av navnene.",
                "Not found in the script under any of the names.",
              )}
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
                      title={L("Vis scenen i manus", "Show the scene in the script")}
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
                            ? L(` som «${u.matchedName}»`, ` as “${u.matchedName}”`)
                            : ""}
                          {u.active ? "" : L(" · deaktivert", " · inactive")}
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
              aria-label={L("Scener med eldre versjon", "Scenes with an older version")}
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
                      title={L("Vis scenen i manus", "Show the scene in the script")}
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
                          {L("brukt i scenens materiale", "used in the scene’s material")}
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
              {L(
                "Mulige treff: ord i teksten som begynner med navnet. Sjekk at de stemmer.",
                "Possible matches: words in the text that begin with the name. Check that they are right.",
              )}
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
      title={L(
        `${text}. Scenen er ikke endret; gå gjennom scenene for å bruke den nye versjonen.`,
        `${text}. The scene has not changed; review the scenes to use the new version.`,
      )}
    >
      {L(
        "Ressursen er oppdatert etter at scenen ble laget",
        "The asset was updated after the scene was made",
      )}
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
              ? L("sted i filmen viser", "place in the film still shows")
              : L("steder i filmen viser", "places in the film still show")}{" "}
            {L("fortsatt en eldre versjon av", "an older version of")} {asset.name}.
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={() => setWorklistOpen(true)}
          >
            {L("Gå gjennom scenene …", "Review the scenes …")}
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
            ? L("Varianter av lyden", "Sound variants")
            : L("Visuelle varianter", "Visual variants")}
        </h2>
        <span className="text-xs text-text-tertiary">
          {asset.kind === "sound"
            ? L(
                "Én lyd – flere utgaver. Hver variant har egne versjoner og egen godkjenning.",
                "One sound – several versions. Each variant has its own versions and approval.",
              )
            : L(
                "Én identitet – flere utseender og stiler. Hver variant har egne versjoner og egen godkjenning.",
                "One identity – several looks and styles. Each variant has its own versions and approval.",
              )}
        </span>
        {archivedCount ? (
          <label className="ml-auto flex items-center gap-1 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="size-3.5 accent-[var(--accent-brand)]"
            />
            {L("Arkiverte", "Archived")} ({archivedCount})
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
          {L(
            "Ingen varianter ennå. En variant er for eksempel «Animatic», «Plakat» eller «Vinterklær». Last opp bilder til den – hvert bilde blir en versjon.",
            "No variants yet. A variant is, for example, “Animatic”, “Poster” or “Winter clothes”. Upload images to it – each image becomes a version.",
          )}
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
              L(`Ny variant «${n}»`, `New variant “${n}”`),
            );
            setErr(r);
            if (!r) {
              setName("");
              setAppearance("");
            }
          }}
        >
          <Field label={L("Navn på variant", "Variant name")}>
            <Input
              value={name}
              maxLength={200}
              placeholder={STYLE_LABEL[style]}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-[180px] bg-surface-3 text-[13px]"
            />
          </Field>
          <Field label={L("Stil", "Style")}>
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
          <Field label={L("Utseende (valgfritt)", "Appearance (optional)")}>
            <Input
              value={appearance}
              maxLength={500}
              placeholder={L("F.eks. kort hår, vinterklær", "E.g. short hair, winter clothes")}
              onChange={(e) => setAppearance(e.target.value)}
              className="h-8 w-[220px] bg-surface-3 text-[13px]"
            />
          </Field>
          <Button type="submit" size="sm" variant="secondary">
            <Plus />
            {L("Ny variant", "New variant")}
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
        L(
          `Godkjenn v${ver.number} av «${variant.name}»`,
          `Approve v${ver.number} of “${variant.name}”`,
        ),
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
          L(`Ny lyd i «${variant.name}»`, `New sound in “${variant.name}”`),
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
          L(`Nytt bilde i «${variant.name}»`, `New image in “${variant.name}”`),
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
                L(`Endre variant «${variant.name}»`, `Edit variant “${variant.name}”`),
              );
              setErr(r);
              if (!r) setEditing(false);
            }}
          >
            <Field label={L("Navn", "Name")}>
              <Input
                value={vName}
                maxLength={200}
                onChange={(e) => setVName(e.target.value)}
                className="h-8 w-[180px] bg-surface-3 text-[13px]"
              />
            </Field>
            <Field label={L("Stil", "Style")}>
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
            <Field label={L("Utseende", "Appearance")}>
              <Input
                value={vAppearance}
                maxLength={500}
                onChange={(e) => setVAppearance(e.target.value)}
                className="h-8 w-[220px] bg-surface-3 text-[13px]"
              />
            </Field>
            <Button type="submit" size="sm">
              {L("Lagre", "Save")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {L("Avbryt", "Cancel")}
            </Button>
          </form>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-text-primary">
              {variant.name}
              {variant.archived ? (
                <span className="ml-2 text-xs font-normal text-text-tertiary">
                  {L("Arkivert", "Archived")}
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
                ? L("Laster opp …", "Uploading …")
                : asset.kind === "sound"
                  ? L("Last opp lyd", "Upload sound")
                  : L("Last opp bilde", "Upload image")}
            </Button>
            {asset.kind === "sound" ? (
              <Button
                size="sm"
                variant="secondary"
                aria-expanded={soundAi}
                onClick={() => setSoundAi((x) => !x)}
              >
                <AiGlyph /> {L("Lag med AI", "Generate with AI")}
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
              {L("Endre", "Edit")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={
                variant.archived
                  ? L("Hent fram varianten", "Restore the variant")
                  : L("Arkiver varianten", "Archive the variant")
              }
              title={
                variant.archived
                  ? L("Hent fram", "Restore")
                  : L("Arkiver (ingenting slettes)", "Archive (nothing is deleted)")
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
                      ? L("Hent fram variant", "Restore variant")
                      : L("Arkiver variant", "Archive variant"),
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
          {L("Sammenlign", "Compare")} v{compareVersions[0]!.number} {L("og", "and")} v
          {compareVersions[1]!.number}
        </Button>
      ) : null}
      {versions.length === 0 ? (
        <p className="text-xs text-text-tertiary">
          {asset.kind === "sound"
            ? L("Ingen lyder ennå.", "No sounds yet.")
            : L("Ingen bilder ennå.", "No images yet.")}
        </p>
      ) : (
        <ul
          className="flex gap-2 overflow-x-auto pb-1"
          aria-label={L(`Versjoner av ${variant.name}`, `Versions of ${variant.name}`)}
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
                {asset.kind === "sound" ? (
                  <div className="flex h-[120px] flex-col items-center justify-center gap-2 bg-surface-3 px-1">
                    <Music className="size-6 text-text-tertiary" aria-hidden />
                    {url ? (
                      <audio
                        src={url}
                        controls
                        preload="none"
                        className="h-7 w-full"
                        aria-label={L(
                          `${asset.name}, versjon ${ver.number}`,
                          `${asset.name}, version ${ver.number}`,
                        )}
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
                    title={L(
                      "Dobbeltklikk for fullskjerm, zoom og nedlasting",
                      "Double-click for full screen, zoom and download",
                    )}
                    aria-label={L(
                      `Vis ${asset.name} – ${variant.name}, versjon ${ver.number} i fullskjerm`,
                      `Show ${asset.name} – ${variant.name}, version ${ver.number} in full screen`,
                    )}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={L(
                          `${asset.name} – ${variant.name}, versjon ${ver.number}`,
                          `${asset.name} – ${variant.name}, version ${ver.number}`,
                        )}
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
                      {L("Godkjent", "Approved")}
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
                    title={L(
                      "Fjern bakgrunnen (gratis, lagres som ny versjon)",
                      "Remove the background (free, saved as a new version)",
                    )}
                  >
                    <Scissors className="size-3" aria-hidden />
                    {L("Frilegg …", "Cut out …")}
                  </button>
                ) : null}
                {asset.kind !== "sound" && ver.mimeType.startsWith("image/") ? (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-left text-[11px] text-text-tertiary hover:text-text-primary"
                    onClick={() => setToolsId(ver.id)}
                    title={L(
                      "Stor visning med beskrivelsen og bildeverktøy: utsnitt, del opp i ruter, vinkel, andre vinkler, oppskalering",
                      "Large view with the description and image tools: crop, split into tiles, angle, other angles, upscale",
                    )}
                  >
                    <Crop className="size-3" aria-hidden />
                    {L("Bildeverktøy …", "Image tools …")}
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
                    {L("Sammenlign", "Compare")}
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
                            L("Fjern godkjenning", "Remove approval"),
                          ),
                        )
                      }
                    >
                      {L("Fjern godkjenning", "Remove approval")}
                    </button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 justify-start px-1 text-xs"
                      onClick={() => approve(ver)}
                    >
                      {L("Godkjenn", "Approve")}
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
            ? L(
                "1 versjon er skjult av filteret på opphav.",
                "1 version is hidden by the origin filter.",
              )
            : L(
                `${hiddenByFilter} versjoner er skjult av filteret på opphav.`,
                `${hiddenByFilter} versions are hidden by the origin filter.`,
              )}
        </p>
      ) : null}
      {versions.length > 1 ? (
        <p className="text-[11px] text-text-tertiary">
          {L(
            "Når du godkjenner et bilde, ser du hvilke scener som berøres, og velger selv hvilke som skal få det. Uten godkjent bilde viser scenene det nyeste.",
            "When you approve an image, you see which scenes are affected and choose yourself which of them get it. Without an approved image, the scenes show the newest one.",
          )}
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
            ? `${asset.name} – ${variant.name || L("Uten navn", "Untitled")} v${toolsVersion.number}`
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
      aria-label={L(`Slett ${a.name}`, `Delete ${a.name}`)}
      className="flex flex-col gap-2 rounded-sm border border-status-danger/60 bg-surface-1 p-2 text-xs"
    >
      <p className="text-text-primary">
        {L(
          `«${a.name}» flyttes til «Slettede objekter» og forsvinner fra biblioteket og lagvalgene.`,
          `“${a.name}” is moved to “Deleted items” and disappears from the library and layer choices.`,
        )}
        {use.layers || use.audio
          ? " " +
            L(
              `Den brukes i ${[
                use.layers
                  ? `${use.layers} lag i ${use.scenes} ${use.scenes === 1 ? "scene" : "scener"}`
                  : "",
                use.audio ? `${use.audio} lydklipp` : "",
              ]
                .filter(Boolean)
                .join(
                  " og ",
                )}; de beholder bildet og lyden til ressursen slettes for godt, og den kan ikke slettes for godt før de er fjernet.`,
              `It is used in ${[
                use.layers
                  ? `${use.layers} ${use.layers === 1 ? "layer" : "layers"} in ${use.scenes} ${use.scenes === 1 ? "scene" : "scenes"}`
                  : "",
                use.audio ? `${use.audio} audio ${use.audio === 1 ? "clip" : "clips"}` : "",
              ]
                .filter(Boolean)
                .join(
                  " and ",
                )}; they keep the image and sound of the asset until it is deleted for good, and it cannot be deleted for good until they are removed.`,
            )
          : L(" Den brukes ikke i noen scene.", " It is not used in any scene.")}{" "}
        {L(
          "Du kan hente den inn igjen, og endringen kan angres.",
          "You can restore it, and the change can be undone.",
        )}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" onClick={onConfirm}>
          <Trash2 /> {L("Slett", "Delete")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {L("Avbryt", "Cancel")}
        </Button>
      </div>
    </div>
  );
}
