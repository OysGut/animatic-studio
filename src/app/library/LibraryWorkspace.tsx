/**
 * Arbeidsflaten «Ressursbibliotek» (M3 del 1; mandat kap. 8–9, REQ-0121–0136, REQ-0146, REQ-0149).
 * Karakterer, objekter, lokasjoner m.m. med permanente ID-er, alternative navn, visuelle varianter og
 * bildeversjoner. Alt er kommandoer som kan angres (ADR-0005); forslag fra manuset gjennomføres bare
 * når brukeren velger det (REQ-0128).
 */
import { TrashDialog } from "./TrashDialog";
import { AssetSymbolIcon } from "./AssetSymbolIcon";
import { AssetThumb } from "./AssetThumb";
import { useActiveProduction } from "@/app/project/use-production";
import { useNavigate } from "@tanstack/react-router";
import {
  Archive,
  Download,
  Lightbulb,
  Plus,
  Redo2,
  Search,
  Trash2,
  Undo2,
  Upload,
  Globe,
  LayoutGrid,
  List,
} from "lucide-react";
import { useStoredFlag } from "@/app/shell/pane-size";
import { useEffect, useMemo, useRef, useState } from "react";
import { collation, ASSET_MIME_TYPES, versionFromFileName, ASSET_KIND_LABEL, ASSET_KIND_PLURAL, ASSET_KINDS, assetNames, assetSearchText, soundCategories, allAssetUsage, coverVersion, librarySuggestions, newId, sortedAssets, trashContents, VERSION_ORIGINS, VERSION_ORIGIN_LABEL, assetOrigins, libraryStyleProfiles, styleProfileMatches, versionProvenances, type AssetKind, type ProjectState, type VersionOrigin } from "@/core";
import { canEdit, useMembers, useProjectState } from "@/app/project/use-project";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { SaveIndicator } from "@/app/script/ScriptWorkspace";
import { MobileCameraButton } from "@/app/mobile/MobileImportDialog";
import { MobileImportLibrary } from "@/app/mobile/MobileImportLibrary";
import { attachMobileDraft } from "@/adapters/browser/mobile-import";
import { Button } from "@/components/ui/button";
import { Toolbar, ToolbarButton, ToolbarSeparator, ToolbarGroup, IconButton } from "@/app/shell/workspace-chrome";
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
import { t as tk } from "@/core/i18n/keyed";

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
        {tk("app-library-library-workspace.library-workspace.p.f27dd2df9ebf")}
      </p>
    );
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        {tk("app-library-library-workspace.library-workspace.div.01d5f9ff8f71")}
        {query.error ? (
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            {tk("app-library-library-workspace.library-workspace.p.04bfaf0d222f")}: {query.error.message}
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
  // U5: rutenett eller liste, husket i nettleseren
  const [grid, setGrid] = useStoredFlag("library-assets-grid", false);
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
      tk("app-library-library-workspace.err.cmds-run.b46182ed5bd4", { name: String(name) }),
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
      <Toolbar overflow="menu">
        <span className="text-chrome font-medium text-text-primary">
          {tk("app-library-library-workspace.library.span.6025b8998b1b")}
        </span>
        <ToolbarSeparator />
        <ToolbarGroup priority={7}>
        <IconButton
          onClick={cmds.undo}
          shortcut="⌘Z"
          disabled={!cmds.canUndo}
          title={
            cmds.undoLabel
              ? tk("app-library-library-workspace.library.title.e35759c47e4f", { undoLabel: String(cmds.undoLabel) })
              : tk("app-library-library-workspace.library.title.ca0a2e5c972a")
          }
          label={
            cmds.undoLabel
              ? tk("app-library-library-workspace.library.label.a260dd6cd078", { undoLabel: String(cmds.undoLabel) })
              : tk("app-library-library-workspace.library.label.48caa80636d5")
          }
        >
          <Undo2 />
        </IconButton>
        <IconButton
          onClick={cmds.redo}
          shortcut="⇧⌘Z"
          disabled={!cmds.canRedo}
          title={
            cmds.redoLabel
              ? tk("app-library-library-workspace.library.title.84d8c1f28714", { redoLabel: String(cmds.redoLabel) })
              : tk("app-library-library-workspace.library.title.a7fec591843b")
          }
          label={
            cmds.redoLabel
              ? tk("app-library-library-workspace.library.label.75e912ea5d1b", { redoLabel: String(cmds.redoLabel) })
              : tk("app-library-library-workspace.library.label.8c0de1564304")
          }
        >
          <Redo2 />
        </IconButton>
        </ToolbarGroup>
        <ToolbarGroup priority={1}>
        <ToolbarButton
          onClick={() => setTrashOpen(true)}
          title={tk("app-library-library-workspace.library.title.6b6d4bce062b")}
        >
          <Trash2 />
          {tk("app-library-library-workspace.library.toolbar-button.4758091a8bfe")}
          {trashCount ? ` (${trashCount})` : ""}
        </ToolbarButton>
        {editable ? (
          <ToolbarButton
            data-testid="library-suggestions-open"
            active={suggestions.length > 0}
            onClick={() => setSuggestOpen(true)}
            disabled={suggestions.length === 0}
            title={tk("app-library-library-workspace.library.title.c6e0d220ff93")}
          >
            <Lightbulb />
            {tk("app-library-library-workspace.library.toolbar-button.5a8949c8780e")}
            {suggestions.length ? ` (${suggestions.length})` : ""}
            {analysis.kind === "running" ? (
              <span data-testid="library-analysis-status" className="text-text-tertiary">
                {tk("app-library-library-workspace.library.span.9e2d3f7cde9f")}
              </span>
            ) : analysis.kind === "done" && analysis.newSuggestions > 0 ? (
              <span data-testid="library-analysis-status" className="text-text-tertiary">
                {tk("app-library-library-workspace.library.span.8ea825c6f57e", { newSuggestions: String(analysis.newSuggestions) })}
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
                    tk("app-library-library-workspace.library.set-error.c5d9763042c4"),
                  );
                else setReupload({ items, unknown });
              }}
            />
            <ToolbarButton
              onClick={() => reuploadInput.current?.click()}
              title={tk("app-library-library-workspace.library.title.4ff0e6a37602")}
            >
              <Upload />
              {tk("app-library-library-workspace.library.toolbar-button.1688610f3296")}
            </ToolbarButton>
          </>
        ) : null}
        <ToolbarButton
          onClick={() => setGlobalOpen(true)}
          data-testid="open-global-library"
          title={tk("app-library-library-workspace.library.title.47d6040f76f4")}
        >
          <Globe />
          {tk("app-library-library-workspace.library.toolbar-button.3bf626f47d18")}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => setZipOpen(true)}
          title={tk("app-library-library-workspace.library.title.6376b982ae11")}
        >
          <Download />
          {tk("app-library-library-workspace.library.toolbar-button.403e2946e466")}
        </ToolbarButton>
        </ToolbarGroup>
        <div data-toolbar-fixed className="ml-auto flex items-center gap-3">
          <SaveIndicator cmds={cmds} />
          {roleKnown && !editable ? (
            <span className="text-xs text-text-tertiary">
              {tk("app-library-library-workspace.library.span.f3b713687829")}
            </span>
          ) : null}
          {productions.length > 1 ? (
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              {tk("app-library-library-workspace.library.label.9239d48ae2c9")}
              <select
                aria-label={tk("app-library-library-workspace.library.aria-label.e82860dc407f")}
                title={tk("app-library-library-workspace.library.title.2d28889aa63d")}
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
            label={tk("app-library-library-workspace.library.label.72d50cda2209")}
          />
          <div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-2 py-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-tertiary"
                aria-hidden
              />
              <input
                type="search"
                aria-label={tk("app-library-library-workspace.library.aria-label.162b7ff202cc")}
                placeholder={tk("app-library-library-workspace.library.placeholder.a05f5d82e583")}
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
                  {tk("app-library-library-workspace.library.option.059f794cdfdd")} ({counts.get("all") ?? 0})
                </option>
                {ASSET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ASSET_KIND_PLURAL[k]} ({counts.get(k) ?? 0})
                  </option>
                ))}
                <option value="style">
                  {tk("app-library-library-workspace.library.option.784e9884bbd0")} ({styleProfiles.length})
                </option>
                {/* Filer fra mobilen (DEC-0090, REQ-0676) */}
                <option value="mobile">{tk("app-library-library-workspace.library.option.f8079c3f80bf")}</option>
              </select>
              {kind === "sound" && categories.length ? (
                <select
                  aria-label={tk("app-library-library-workspace.library.aria-label.4f79a8292ae4")}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                >
                  <option value="">{tk("app-library-library-workspace.library.option.7c234a45d5a6")}</option>
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
                  aria-label={tk("app-library-library-workspace.library.aria-label.2b2cb74d92e1")}
                  title={tk("app-library-library-workspace.library.title.950f3f9f7cc6")}
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value as VersionOrigin | "all")}
                  className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                >
                  <option value="all">{tk("app-library-library-workspace.library.option.6f1e2ae21936")}</option>
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
                  {tk("app-library-library-workspace.library.label.79e5c6814aa8")}
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
                  aria-label={tk("app-library-library-workspace.library.aria-label.9b0279529371")}
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
                  aria-label={tk("app-library-library-workspace.library.aria-label.53efbd1a807f")}
                  placeholder={tk("app-library-library-workspace.library.placeholder.b0a9d6007a22")}
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
                        ? tk("app-library-library-workspace.library.label.701f98b70bfb", { value1: String(newName.trim()) })
                        : tk("app-library-library-workspace.library.label.942889a14db3")
                    }
                  />
                ) : null}
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={!newName.trim()}
                  aria-label={tk("app-library-library-workspace.library.aria-label.97cd5fd15268")}
                  title={tk("app-library-library-workspace.library.title.97cd5fd15268")}
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
              {tk("app-library-library-workspace.library.p.2d48d5bcf6e4")}
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
                  ? tk("app-library-library-workspace.library.empty-text.1584aed53577")
                  : tk("app-library-library-workspace.library.empty-text.db772fbcaf8d")
              }
            />
          ) : (
            <>
            <div className="flex h-7 shrink-0 items-center justify-end border-b border-border px-1">
              <IconButton
                data-testid="library-view-toggle"
                aria-pressed={grid}
                label={grid ? tk("app-library-library-workspace.library.label.cd3dff65bacf") : tk("app-library-library-workspace.library.label.9273ab8d6b80")}
                onClick={() => setGrid(!grid)}
              >
                {grid ? <List /> : <LayoutGrid />}
              </IconButton>
            </div>
            <ul
              aria-label={tk("app-library-library-workspace.library.aria-label.bac7695a5b26")}
              data-view={grid ? "grid" : "list"}
              className={
                "min-h-0 flex-1 overflow-y-auto py-1" +
                (grid ? " grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1 px-1" : "")
              }
            >
              {shown.length === 0 ? (
                <li className="px-3 py-4 text-[13px] text-text-tertiary">
                  {all.length === 0
                    ? tk("app-library-library-workspace.library.li.5d71942c524a")
                    : origin !== "all"
                      ? tk("app-library-library-workspace.library.li.37c63eec73f1", { value1: String(VERSION_ORIGIN_LABEL[origin].toLocaleLowerCase(collation())) })
                      : tk("app-library-library-workspace.library.li.9a3080a24e75")}
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
                        (grid
                          ? "flex w-full flex-col items-stretch gap-1 rounded-sm p-1 text-left "
                          : "grid w-full grid-cols-[36px_1fr] items-center gap-2 px-2 py-1.5 text-left ") +
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
                        (a.id === selected ? "bg-accent-selection" : "hover:bg-surface-3") +
                        (a.archived ? " opacity-60" : "")
                      }
                    >
                      <AssetThumb state={state} assetId={a.id} url={url} size={grid ? "lg" : "md"} />
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
                            · {n === 1 ? "1 scene" : tk("app-library-library-workspace.library.span.b968134af4b6", { n: String(n) })}
                          </span>
                          {a.archived ? (
                            <span className="flex items-center gap-0.5">
                              <Archive className="size-3" aria-hidden />
                              {tk("app-library-library-workspace.library.span.887241f39012")}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            </>
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
                  {tk("app-library-library-workspace.library.p.dda7b1033a83")}
                </p>
                <p className="max-w-[460px] text-[13px] text-text-secondary">
                  {tk("app-library-library-workspace.library.p.fa7dc25ea847")}
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
                {tk("app-library-library-workspace.library.p.4e747c850714")}
              </p>
              <p className="max-w-[460px] text-[13px] text-text-secondary">
                {tk("app-library-library-workspace.library.p.5f48e21eaafb")}
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
