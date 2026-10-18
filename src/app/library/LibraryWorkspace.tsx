/**
 * Arbeidsflaten «Ressursbibliotek» (M3 del 1; mandat kap. 8–9, REQ-0121–0136, REQ-0146, REQ-0149).
 * Karakterer, objekter, lokasjoner m.m. med permanente ID-er, alternative navn, visuelle varianter og
 * bildeversjoner. Alt er kommandoer som kan angres (ADR-0005); forslag fra manuset gjennomføres bare
 * når brukeren velger det (REQ-0128).
 */
import { TrashDialog } from "./TrashDialog";
import { AssetSymbolIcon } from "./AssetSymbolIcon";
import { useActiveProduction } from "@/app/project/use-production";
import { useNavigate } from "@tanstack/react-router";
import {
  Archive,
  Download,
  Lightbulb,
  Music,
  Plus,
  Redo2,
  Search,
  Trash2,
  Undo2,
  Upload,
  Globe,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  L,
  collation,
  ASSET_MIME_TYPES,
  versionFromFileName,
  ASSET_KIND_LABEL,
  ASSET_KIND_PLURAL,
  ASSET_KINDS,
  assetNames,
  assetSearchText,
  soundCategories,
  allAssetUsage,
  coverVersion,
  librarySuggestions,
  newId,
  sortedAssets,
  trashContents,
  VERSION_ORIGINS,
  VERSION_ORIGIN_LABEL,
  assetOrigins,
  libraryStyleProfiles,
  styleProfileMatches,
  versionProvenances,
  type AssetKind,
  type ProjectState,
  type VersionOrigin,
} from "@/core";
import { canEdit, useMembers, useProjectState } from "@/app/project/use-project";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { SaveIndicator } from "@/app/script/ScriptWorkspace";
import { MobileCameraButton } from "@/app/mobile/MobileImportDialog";
import { MobileImportLibrary } from "@/app/mobile/MobileImportLibrary";
import { attachMobileDraft } from "@/adapters/browser/mobile-import";
import { Button } from "@/components/ui/button";
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@/app/shell/workspace-chrome";
import { Input } from "@/components/ui/input";
import { AssetDetail } from "./AssetDetail";
import { GlobalLibraryDialog } from "@/app/global/GlobalLibraryDialog";
import { useImageUrls } from "./asset-images";
import { SuggestionsDialog } from "./SuggestionsDialog";
import { useAnalysisStatus } from "./entity-analysis-store";
import { AssetZipDialog } from "./AssetZip";
import { ReuploadDialog, type ReuploadItem } from "./ReuploadDialog";
import { PaneResizer, usePaneSize } from "@/app/shell/pane-size";
import { useAiJobs } from "@/app/ai/use-ai-jobs";
import { LibraryStyleDialog, StyleProfileDetail, StyleProfileList } from "./StyleProfilesPanel";

export function LibraryWorkspace({
  projectId,
  userId,
  initialAssetId = null,
}: {
  projectId: string;
  userId: string;
  initialAssetId?: string | null;
}) {
  const query = useProjectState(projectId);
  const members = useMembers(projectId);
  const role = members.data?.find((m) => m.user_id === userId)?.role;
  const editable = canEdit(role);
  const cmds = useCommands(projectId, userId, editable);
  if (query.isLoading)
    return (
      <p className="p-6 text-[13px] text-text-tertiary">
        {L("Henter biblioteket …", "Loading the library …")}
      </p>
    );
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        {L("Biblioteket kunne ikke hentes.", "The library could not be loaded.")}
        {query.error ? (
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            {L("Teknisk detalj", "Technical detail")}: {query.error.message}
          </p>
        ) : null}
      </div>
    );
  return (
    <Library
      state={query.data}
      projectId={projectId}
      editable={editable}
      roleKnown={members.isSuccess}
      isOwner={role === "owner"}
      cmds={cmds}
      initialAssetId={initialAssetId}
    />
  );
}

/** «style» = visuelle stilprofiler (REQ-0121, DEC-0078). */
type KindFilter = AssetKind | "all" | "style" | "mobile";

function Library({
  state,
  projectId,
  editable,
  roleKnown,
  isOwner,
  cmds,
  initialAssetId,
}: {
  state: ProjectState;
  projectId: string;
  editable: boolean;
  roleKnown: boolean;
  isOwner: boolean;
  cmds: Commands;
  initialAssetId: string | null;
}) {
  const navigate = useNavigate();
  const productions = useMemo(
    () =>
      Object.values(state.productions).sort((a, b) =>
        a.kind === "main" ? -1 : b.kind === "main" ? 1 : a.name.localeCompare(b.name, collation()),
      ),
    [state.productions],
  );
  const [productionId, setProductionId] = useActiveProduction(projectId, state);
  const [kind, setKind] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");
  /** Kategori for lyd (dialog, musikk, effekter …), REQ-0205. */
  const [category, setCategory] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [listWidth, setListWidth] = usePaneSize("library-list", 300, 220, 560);
  const [selected, setSelected] = useState<string | null>(() =>
    initialAssetId && state.assets[initialAssetId] ? initialAssetId : null,
  );
  // Ny ?asset= mens biblioteket er åpent (f.eks. fra sceneeditoren)
  useEffect(() => {
    if (initialAssetId && state.assets[initialAssetId]) setSelected(initialAssetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAssetId]);
  const [newKind, setNewKind] = useState<AssetKind>("character");
  const [newName, setNewName] = useState("");
  // Utkast for bilder fra mobilen før ressursen er lagret (DEC-0090, REQ-0672)
  const [draftKey, setDraftKey] = useState(() => newId<"draft">() as string);
  const [error, setError] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  // Nedlastede bilder lastes opp igjen (DEC-0064): kjennes igjen på navnet
  const reuploadInput = useRef<HTMLInputElement | null>(null);
  const [reupload, setReupload] = useState<{
    items: ReuploadItem[];
    unknown: File[];
  } | null>(null);
  const [zipOpen, setZipOpen] = useState(false);
  const [globalOpen, setGlobalOpen] = useState(false);
  // «Slettede objekter» (DEC-0079)
  const [trashOpen, setTrashOpen] = useState(false);
  const trashCount = useMemo(() => {
    const t = trashContents(state);
    return t.assets.length + t.versions.length;
  }, [state]);
  // Opphav per versjon (REQ-0121, DEC-0078): lastet opp, AI, frilagt, harmonisert – fra AI-jobbene og merknaden
  const [origin, setOrigin] = useState<VersionOrigin | "all">("all");
  const jobs = useAiJobs(projectId);
  const provenance = useMemo(
    () => versionProvenances(state, jobs.data?.jobs ?? []),
    [state, jobs.data],
  );
  // Stilprofiler i biblioteket (samme profiler som «Filmens visuelle stil»)
  const styleProfiles = useMemo(() => libraryStyleProfiles(state), [state]);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [styleDialog, setStyleDialog] = useState<string | null>(null);
  const styleItem = styleProfiles.find((p) => p.profile.id === selectedStyle) ?? null;

  const all = useMemo(() => sortedAssets(state), [state]);
  const usageCount = useMemo(() => {
    const all = allAssetUsage(state, productionId);
    return new Map([...all].map(([id, u]) => [id, u.length]));
  }, [state, productionId]);
  const suggestions = useMemo(() => librarySuggestions(state, productionId), [state, productionId]);
  const analysis = useAnalysisStatus(projectId);
  const q = search.trim().toLocaleLowerCase(collation());
  const shown = all.filter(
    (a) =>
      (kind === "all" || a.kind === kind) &&
      (showArchived || !a.archived) &&
      (origin === "all" || assetOrigins(state, a.id, provenance).has(origin)) &&
      (kind !== "sound" || !category || a.category.trim() === category) &&
      // Søket treffer også det en lyd er koblet til (REQ-0205, DEC-0070)
      (!q || assetSearchText(state, a).some((x) => x.toLocaleLowerCase(collation()).includes(q))),
  );
  const categories = useMemo(() => soundCategories(state), [state]);
  const covers = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of all) {
      const v = coverVersion(state, a.id);
      if (v) m.set(a.id, v.mediaPath);
    }
    return m;
  }, [all, state]);
  const urls = useImageUrls([...covers.values()]);

  // Valget kan forsvinne (angre, andres endringer)
  useEffect(() => {
    if (selected && !state.assets[selected]) setSelected(null);
  }, [state, selected]);
  const asset =
    kind !== "style" && kind !== "mobile" && selected ? state.assets[selected] : undefined;
  const shownStyles = styleProfiles.filter((p) => styleProfileMatches(p, search));

  function create() {
    const name = newName.trim();
    if (!name) return;
    const assetId = newId<"asset">();
    const err = cmds.run(
      {
        type: "CreateAssets",
        assets: [
          {
            assetId,
            fields: { kind: newKind, name, names: [], description: "", category: "", tags: [] },
          },
        ],
      },
      L(`Ny ressurs «${name}»`, `New asset “${name}”`),
    );
    setError(err);
    if (!err) {
      // Bilder tatt med mobilen for den nye ressursen knyttes til den (de blir versjoner når de er behandlet)
      void attachMobileDraft(projectId, draftKey, assetId);
      setDraftKey(newId<"draft">());
      setNewName("");
      setSelected(assetId);
      if (kind !== "all" && kind !== newKind) setKind(newKind);
    }
  }

  const counts = useMemo(() => {
    const m = new Map<KindFilter, number>([["all", 0]]);
    for (const a of all) {
      if (a.archived && !showArchived) continue;
      m.set("all", (m.get("all") ?? 0) + 1);
      m.set(a.kind, (m.get(a.kind) ?? 0) + 1);
    }
    return m;
  }, [all, showArchived]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar>
        <span className="text-[13px] font-medium text-text-primary">
          {L("Ressursbibliotek", "Asset library")}
        </span>
        <ToolbarSeparator />
        <ToolbarButton
          variant="icon"
          onClick={cmds.undo}
          disabled={!cmds.canUndo}
          title={
            cmds.undoLabel
              ? L(`Angre: ${cmds.undoLabel} (⌘Z)`, `Undo: ${cmds.undoLabel} (⌘Z)`)
              : L("Angre (⌘Z)", "Undo (⌘Z)")
          }
          aria-label={
            cmds.undoLabel
              ? L(`Angre: ${cmds.undoLabel}`, `Undo: ${cmds.undoLabel}`)
              : L("Angre", "Undo")
          }
        >
          <Undo2 />
        </ToolbarButton>
        <ToolbarButton
          variant="icon"
          onClick={cmds.redo}
          disabled={!cmds.canRedo}
          title={
            cmds.redoLabel
              ? L(`Gjør om: ${cmds.redoLabel} (⇧⌘Z)`, `Redo: ${cmds.redoLabel} (⇧⌘Z)`)
              : L("Gjør om (⇧⌘Z)", "Redo (⇧⌘Z)")
          }
          aria-label={
            cmds.redoLabel
              ? L(`Gjør om: ${cmds.redoLabel}`, `Redo: ${cmds.redoLabel}`)
              : L("Gjør om", "Redo")
          }
        >
          <Redo2 />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => setTrashOpen(true)}
          title={L(
            "Slettede ressurser og bilder: hent inn igjen eller slett for godt",
            "Deleted assets and images: restore them or delete them for good",
          )}
        >
          <Trash2 />
          {L("Slettede objekter", "Deleted items")}
          {trashCount ? ` (${trashCount})` : ""}
        </ToolbarButton>
        {editable ? (
          <ToolbarButton
            active={suggestions.length > 0}
            onClick={() => setSuggestOpen(true)}
            disabled={suggestions.length === 0}
            title={L(
              "Karakterer og steder i manuset som ikke er i biblioteket ennå",
              "Characters and locations in the script that are not in the library yet",
            )}
          >
            <Lightbulb />
            {L("Forslag fra manuset", "Suggestions from the script")}
            {suggestions.length ? ` (${suggestions.length})` : ""}
            {analysis.kind === "running" ? (
              <span data-testid="library-analysis-status" className="text-text-tertiary">
                {L(" · Analyserer manuset …", " · Analysing the script …")}
              </span>
            ) : analysis.kind === "done" && analysis.newSuggestions > 0 ? (
              <span data-testid="library-analysis-status" className="text-text-tertiary">
                {L(` · ${analysis.newSuggestions} nye forslag`, ` · ${analysis.newSuggestions} new suggestions`)}
              </span>
            ) : null}
          </ToolbarButton>
        ) : null}
        {editable ? (
          <>
            <input
              ref={reuploadInput}
              type="file"
              multiple
              accept={ASSET_MIME_TYPES.join(",")}
              className="hidden"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                if (!files.length) return;
                const items: ReuploadItem[] = [];
                const unknown: File[] = [];
                for (const file of files) {
                  const match = versionFromFileName(state, file.name);
                  // Bare bilder kan lastes opp her (lyd lastes opp i lydressursen)
                  if (match && match.mimeType.startsWith("image/")) items.push({ file, match });
                  else unknown.push(file);
                }
                if (!items.length)
                  setError(
                    L(
                      "Kjenner ikke igjen navnene. Bilder lastet ned fra biblioteket heter «Ressurs - Variant - vN»; andre bilder lastes opp fra varianten de hører til.",
                      "The names are not recognised. Images downloaded from the library are called “Asset - Variant - vN”; other images are uploaded from the variant they belong to.",
                    ),
                  );
                else setReupload({ items, unknown });
              }}
            />
            <ToolbarButton
              onClick={() => reuploadInput.current?.click()}
              title={L(
                "Last opp bilder du har lastet ned og endret. De kjennes igjen på navnet («Ressurs - Variant - vN»).",
                "Upload images you have downloaded and changed. They are recognised by their name (“Asset - Variant - vN”).",
              )}
            >
              <Upload />
              {L("Last opp endrede bilder …", "Upload changed images …")}
            </ToolbarButton>
          </>
        ) : null}
        <ToolbarButton
          onClick={() => setGlobalOpen(true)}
          data-testid="open-global-library"
          title={L(
            "Ressurser som deles i arbeidsgruppen: logoer, figurer, lyd og maler",
            "Assets shared in the workspace: logos, figures, sound and templates",
          )}
        >
          <Globe />
          {L("Globalt bibliotek", "Global library")}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => setZipOpen(true)}
          title={L(
            "Last ned ressursene som zip, per kategori eller alt samlet",
            "Download the assets as a zip, per category or all together",
          )}
        >
          <Download />
          {L("Last ned som zip", "Download as zip")}
        </ToolbarButton>
        <div className="ml-auto flex items-center gap-3">
          <SaveIndicator cmds={cmds} />
          {roleKnown && !editable ? (
            <span className="text-xs text-text-tertiary">
              {L("Bare lesetilgang", "Read-only access")}
            </span>
          ) : null}
          {productions.length > 1 ? (
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              {L("Produksjon", "Production")}
              <select
                aria-label={L(
                  "Produksjon for bruk i scener og kontinuitet",
                  "Production for use in scenes and continuity",
                )}
                title={L(
                  "Bruk i scener og kontinuitet gjelder denne produksjonen",
                  "Use in scenes and continuity applies to this production",
                )}
                value={productionId}
                onChange={(e) => setProductionId(e.target.value)}
                className="h-7 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary"
              >
                {productions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </Toolbar>

      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `${listWidth}px minmax(0,1fr)` }}
      >
        {/* Liste */}
        <div className="relative flex min-h-0 flex-col border-r border-border bg-surface-1">
          <PaneResizer
            edge="right"
            size={listWidth}
            onSize={setListWidth}
            min={220}
            max={560}
            label={L("Bredde på ressurslisten", "Width of the asset list")}
          />
          <div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-2 py-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-tertiary"
                aria-hidden
              />
              <input
                type="search"
                aria-label={L("Søk i biblioteket", "Search the library")}
                placeholder={L(
                  "Søk (navn, stikkord, hva lyd er koblet til)",
                  "Search (name, keywords, what sound is linked to)",
                )}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 w-full rounded-sm border border-border-control bg-surface-3 pl-7 pr-2 text-[13px] text-text-primary placeholder:text-text-tertiary"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <select
                aria-label="Type"
                value={kind}
                onChange={(e) => setKind(e.target.value as KindFilter)}
                className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
              >
                <option value="all">
                  {L("Alle typer", "All types")} ({counts.get("all") ?? 0})
                </option>
                {ASSET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ASSET_KIND_PLURAL[k]} ({counts.get(k) ?? 0})
                  </option>
                ))}
                <option value="style">
                  {L("Stilprofiler", "Style profiles")} ({styleProfiles.length})
                </option>
                {/* Filer fra mobilen (DEC-0090, REQ-0676) */}
                <option value="mobile">{L("Mobilimport", "Mobile import")}</option>
              </select>
              {kind === "sound" && categories.length ? (
                <select
                  aria-label={L("Kategori", "Category")}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                >
                  <option value="">{L("Alle kategorier", "All categories")}</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            {kind !== "style" && kind !== "mobile" ? (
              <div className="flex items-center gap-1.5">
                <select
                  aria-label={L("Opphav", "Origin")}
                  title={L(
                    "Vis bare ressurser med versjoner som er lastet opp, laget med AI, frilagt eller harmonisert",
                    "Show only assets with versions that are uploaded, made with AI, cut out or harmonised",
                  )}
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value as VersionOrigin | "all")}
                  className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                >
                  <option value="all">{L("Alle opphav", "All origins")}</option>
                  {VERSION_ORIGINS.map((o) => (
                    <option key={o} value={o}>
                      {VERSION_ORIGIN_LABEL[o]}
                    </option>
                  ))}
                </select>
                <label className="flex shrink-0 items-center gap-1 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                    className="size-3.5 accent-[var(--accent-brand)]"
                  />
                  {L("Arkiverte", "Archived")}
                </label>
              </div>
            ) : null}
          </div>
          {editable && kind !== "style" && kind !== "mobile" ? (
            <form
              className="flex shrink-0 flex-col gap-1.5 border-b border-border px-2 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                create();
              }}
            >
              <div className="flex gap-1.5">
                <select
                  aria-label={L("Type ny ressurs", "Type of new asset")}
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as AssetKind)}
                  className="h-7 w-[112px] rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                >
                  {ASSET_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ASSET_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label={L("Navn på ny ressurs", "Name of new asset")}
                  placeholder={L("Navn", "Name")}
                  value={newName}
                  maxLength={200}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-7 min-w-0 flex-1 bg-surface-3 text-[13px]"
                />
                {newKind !== "sound" ? (
                  <MobileCameraButton
                    projectId={projectId}
                    context={{ type: "draft", draftKey, assetKind: newKind }}
                    label={
                      newName.trim()
                        ? L(
                            `Bilder av ${newName.trim()} (ny)`,
                            `Pictures of ${newName.trim()} (new)`,
                          )
                        : L("Bilder til en ny ressurs", "Pictures for a new asset")
                    }
                  />
                ) : null}
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={!newName.trim()}
                  aria-label={L("Legg til ressurs", "Add asset")}
                  title={L("Legg til ressurs", "Add asset")}
                >
                  <Plus />
                </Button>
              </div>
              {error ? (
                <p role="alert" className="text-xs text-status-danger">
                  {error}
                </p>
              ) : null}
            </form>
          ) : null}
          {kind === "mobile" ? (
            <p className="px-3 py-3 text-xs text-text-tertiary">
              {L(
                "Filene fra mobilen vises til høyre. Bilder tatt for en ressurs blir nye versjoner av den.",
                "The files from the phone are shown on the right. Pictures taken for an asset become new versions of it.",
              )}
            </p>
          ) : kind === "style" ? (
            <StyleProfileList
              items={shownStyles}
              selected={selectedStyle}
              onSelect={setSelectedStyle}
              editable={editable}
              onNew={() =>
                setStyleDialog(styleProfiles.some((p) => p.isDefault) ? "new" : "default")
              }
              emptyText={
                styleProfiles.length
                  ? L("Ingen stilprofiler passer med søket.", "No style profiles match the search.")
                  : L(
                      "Ingen stilprofiler ennå. Filmens visuelle stil beskriver stil, teknikk, farger og lys for alle bilder AI lager.",
                      "No style profiles yet. The film's visual style describes style, technique, colours and light for all images that AI makes.",
                    )
              }
            />
          ) : (
            <ul
              aria-label={L("Ressurser", "Assets")}
              className="min-h-0 flex-1 overflow-y-auto py-1"
            >
              {shown.length === 0 ? (
                <li className="px-3 py-4 text-[13px] text-text-tertiary">
                  {all.length === 0
                    ? L(
                        "Biblioteket er tomt. Legg til ressurser over, eller bruk «Forslag fra manuset».",
                        "The library is empty. Add assets above, or use “Suggestions from the script”.",
                      )
                    : origin !== "all"
                      ? L(
                          `Ingen ressurser har versjoner som er «${VERSION_ORIGIN_LABEL[origin].toLocaleLowerCase(collation())}».`,
                          `No assets have versions that are “${VERSION_ORIGIN_LABEL[origin].toLocaleLowerCase(collation())}”.`,
                        )
                      : L("Ingen ressurser passer med søket.", "No assets match the search.")}
                </li>
              ) : null}
              {shown.map((a) => {
                const cover = covers.get(a.id);
                const url = cover ? urls.data?.[cover] : undefined;
                const n = usageCount.get(a.id) ?? 0;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(a.id)}
                      data-asset-row={a.id}
                      aria-current={a.id === selected ? "true" : undefined}
                      className={
                        "grid w-full grid-cols-[36px_1fr] items-center gap-2 px-2 py-1.5 text-left " +
                        (a.id === selected ? "bg-accent-selection" : "hover:bg-surface-3") +
                        (a.archived ? " opacity-60" : "")
                      }
                    >
                      <span className="flex size-9 items-center justify-center overflow-hidden rounded-sm bg-surface-3 text-[11px] font-medium text-text-tertiary">
                        {a.kind === "sound" ? (
                          <Music className="size-4" aria-hidden />
                        ) : url ? (
                          <img src={url} alt="" className="size-full object-cover" />
                        ) : (
                          <AssetSymbolIcon state={state} assetId={a.id} className="size-7" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 truncate text-[13px] text-text-primary">
                          {a.kind !== "sound" ? (
                            <AssetSymbolIcon
                              state={state}
                              assetId={a.id}
                              className="size-3 shrink-0"
                            />
                          ) : null}
                          <span className="truncate">{a.name}</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                          {ASSET_KIND_LABEL[a.kind]}
                          <span className="tabular">
                            · {n === 1 ? "1 scene" : L(`${n} scener`, `${n} scenes`)}
                          </span>
                          {a.archived ? (
                            <span className="flex items-center gap-0.5">
                              <Archive className="size-3" aria-hidden />
                              {L("Arkivert", "Archived")}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Detaljer */}
        <div className="min-h-0 overflow-y-auto bg-bg-app">
          {kind === "mobile" ? (
            <MobileImportLibrary
              state={state}
              projectId={projectId}
              editable={editable}
              onOpenAsset={(id) => {
                setKind("all");
                setSelected(id);
              }}
            />
          ) : kind === "style" ? (
            styleItem ? (
              <StyleProfileDetail
                state={state}
                item={styleItem}
                editable={editable}
                onEdit={() =>
                  setStyleDialog(styleItem.isDefault ? "default" : styleItem.profile.id)
                }
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                <p className="text-base font-medium text-text-primary">
                  {L("Velg en stilprofil", "Choose a style profile")}
                </p>
                <p className="max-w-[460px] text-[13px] text-text-secondary">
                  {L(
                    "Stilprofilene beskriver hvordan filmen skal se ut – stil, teknikk, farger, lys og stemning – og sendes med i alle AI-beskrivelser. Standardprofilen gjelder alt; egne profiler kan gjelde plakater, steder, AI-video og andre bruk.",
                    "Style profiles describe how the film should look – style, technique, colours, light and mood – and are sent with every AI description. The default profile applies to everything; your own profiles can apply to posters, locations, AI video and other uses.",
                  )}
                </p>
              </div>
            )
          ) : asset ? (
            <AssetDetail
              key={asset.id}
              state={state}
              projectId={projectId}
              productionId={productionId}
              asset={asset}
              editable={editable}
              cmds={cmds}
              provenance={provenance}
              origin={origin}
              jobs={jobs.data?.jobs}
              onGoToScene={(occurrenceId) =>
                void navigate({
                  to: "/prosjekt/$projectId/manus",
                  params: { projectId },
                  search: { scene: occurrenceId },
                })
              }
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="text-base font-medium text-text-primary">
                {L("Velg en ressurs", "Choose an asset")}
              </p>
              <p className="max-w-[460px] text-[13px] text-text-secondary">
                {L(
                  "Hver karakter, gjenstand og lokasjon finnes én gang i biblioteket og brukes i alle scener og produksjoner. Alternative navn (som «BESTEFAR» for «Halvard») gjør at den kjennes igjen i manuset.",
                  "Each character, object and location exists once in the library and is used in all scenes and productions. Alternative names (such as “GRANDPA” for “Halvard”) let it be recognised in the script.",
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      {styleDialog ? (
        <LibraryStyleDialog
          state={state}
          cmds={cmds}
          editable={editable}
          target={styleDialog}
          onClose={() => setStyleDialog(null)}
        />
      ) : null}
      {reupload ? (
        <ReuploadDialog
          state={state}
          projectId={projectId}
          cmds={cmds}
          items={reupload.items}
          unknown={reupload.unknown}
          onClose={() => setReupload(null)}
        />
      ) : null}
      <TrashDialog
        open={trashOpen}
        onOpenChange={setTrashOpen}
        state={state}
        cmds={cmds}
        editable={editable}
        isOwner={isOwner}
      />
      <GlobalLibraryDialog
        open={globalOpen}
        onOpenChange={setGlobalOpen}
        state={state}
        cmds={cmds}
        editable={editable}
        onUsed={(id) => setSelected(id)}
      />
      <AssetZipDialog
        open={zipOpen}
        onOpenChange={setZipOpen}
        projectId={projectId}
        projectName={state.project.name}
        state={state}
      />
      {editable ? (
        <SuggestionsDialog
          open={suggestOpen}
          onOpenChange={setSuggestOpen}
          state={state}
          suggestions={suggestions}
          cmds={cmds}
          projectId={projectId}
        />
      ) : null}
    </div>
  );
}
