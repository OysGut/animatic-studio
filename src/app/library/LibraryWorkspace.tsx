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
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AssetDetail } from "./AssetDetail";
import { useImageUrls } from "./asset-images";
import { SuggestionsDialog } from "./SuggestionsDialog";
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
    return <p className="p-6 text-[13px] text-text-tertiary">Henter biblioteket …</p>;
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        Biblioteket kunne ikke hentes.
        {query.error ? (
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            Teknisk detalj: {query.error.message}
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
type KindFilter = AssetKind | "all" | "style";

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
        a.kind === "main" ? -1 : b.kind === "main" ? 1 : a.name.localeCompare(b.name, "nb"),
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
  const [error, setError] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  // Nedlastede bilder lastes opp igjen (DEC-0064): kjennes igjen på navnet
  const reuploadInput = useRef<HTMLInputElement | null>(null);
  const [reupload, setReupload] = useState<{
    items: ReuploadItem[];
    unknown: File[];
  } | null>(null);
  const [zipOpen, setZipOpen] = useState(false);
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
  const q = search.trim().toLocaleLowerCase("nb");
  const shown = all.filter(
    (a) =>
      (kind === "all" || a.kind === kind) &&
      (showArchived || !a.archived) &&
      (origin === "all" || assetOrigins(state, a.id, provenance).has(origin)) &&
      (kind !== "sound" || !category || a.category.trim() === category) &&
      // Søket treffer også det en lyd er koblet til (REQ-0205, DEC-0070)
      (!q || assetSearchText(state, a).some((x) => x.toLocaleLowerCase("nb").includes(q))),
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
  const asset = kind !== "style" && selected ? state.assets[selected] : undefined;
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
      `Ny ressurs «${name}»`,
    );
    setError(err);
    if (!err) {
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
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-3">
        <span className="text-[13px] font-medium text-text-primary">Ressursbibliotek</span>
        <div className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button
          size="sm"
          variant="ghost"
          onClick={cmds.undo}
          disabled={!cmds.canUndo}
          title={cmds.undoLabel ? `Angre: ${cmds.undoLabel} (⌘Z)` : "Angre (⌘Z)"}
          aria-label={cmds.undoLabel ? `Angre: ${cmds.undoLabel}` : "Angre"}
        >
          <Undo2 />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={cmds.redo}
          disabled={!cmds.canRedo}
          title={cmds.redoLabel ? `Gjør om: ${cmds.redoLabel} (⇧⌘Z)` : "Gjør om (⇧⌘Z)"}
          aria-label={cmds.redoLabel ? `Gjør om: ${cmds.redoLabel}` : "Gjør om"}
        >
          <Redo2 />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setTrashOpen(true)}
          title="Slettede ressurser og bilder: hent inn igjen eller slett for godt"
        >
          <Trash2 />
          Slettede objekter{trashCount ? ` (${trashCount})` : ""}
        </Button>
        {editable ? (
          <Button
            size="sm"
            variant={suggestions.length ? "secondary" : "ghost"}
            onClick={() => setSuggestOpen(true)}
            disabled={suggestions.length === 0}
            title="Karakterer og steder i manuset som ikke er i biblioteket ennå"
          >
            <Lightbulb />
            Forslag fra manuset{suggestions.length ? ` (${suggestions.length})` : ""}
          </Button>
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
                    "Kjenner ikke igjen navnene. Bilder lastet ned fra biblioteket heter «Ressurs - Variant - vN»; andre bilder lastes opp fra varianten de hører til.",
                  );
                else setReupload({ items, unknown });
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => reuploadInput.current?.click()}
              title="Last opp bilder du har lastet ned og endret. De kjennes igjen på navnet («Ressurs - Variant - vN»)."
            >
              <Upload />
              Last opp endrede bilder …
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setZipOpen(true)}
          title="Last ned ressursene som zip, per kategori eller alt samlet"
        >
          <Download />
          Last ned som zip
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <SaveIndicator cmds={cmds} />
          {roleKnown && !editable ? (
            <span className="text-xs text-text-tertiary">Bare lesetilgang</span>
          ) : null}
          {productions.length > 1 ? (
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              Produksjon
              <select
                aria-label="Produksjon for bruk i scener og kontinuitet"
                title="Bruk i scener og kontinuitet gjelder denne produksjonen"
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
      </div>

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
            label="Bredde på ressurslisten"
          />
          <div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-2 py-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-tertiary"
                aria-hidden
              />
              <input
                type="search"
                aria-label="Søk i biblioteket"
                placeholder="Søk (navn, stikkord, hva lyd er koblet til)"
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
                <option value="all">Alle typer ({counts.get("all") ?? 0})</option>
                {ASSET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ASSET_KIND_PLURAL[k]} ({counts.get(k) ?? 0})
                  </option>
                ))}
                <option value="style">Stilprofiler ({styleProfiles.length})</option>
              </select>
              {kind === "sound" && categories.length ? (
                <select
                  aria-label="Kategori"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                >
                  <option value="">Alle kategorier</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            {kind !== "style" ? (
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Opphav"
                  title="Vis bare ressurser med versjoner som er lastet opp, laget med AI, frilagt eller harmonisert"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value as VersionOrigin | "all")}
                  className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                >
                  <option value="all">Alle opphav</option>
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
                  Arkiverte
                </label>
              </div>
            ) : null}
          </div>
          {editable && kind !== "style" ? (
            <form
              className="flex shrink-0 flex-col gap-1.5 border-b border-border px-2 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                create();
              }}
            >
              <div className="flex gap-1.5">
                <select
                  aria-label="Type ny ressurs"
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
                  aria-label="Navn på ny ressurs"
                  placeholder="Navn"
                  value={newName}
                  maxLength={200}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-7 min-w-0 flex-1 bg-surface-3 text-[13px]"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={!newName.trim()}
                  aria-label="Legg til ressurs"
                  title="Legg til ressurs"
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
          {kind === "style" ? (
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
                  ? "Ingen stilprofiler passer med søket."
                  : "Ingen stilprofiler ennå. Filmens visuelle stil beskriver stil, teknikk, farger og lys for alle bilder AI lager."
              }
            />
          ) : (
            <ul aria-label="Ressurser" className="min-h-0 flex-1 overflow-y-auto py-1">
              {shown.length === 0 ? (
                <li className="px-3 py-4 text-[13px] text-text-tertiary">
                  {all.length === 0
                    ? "Biblioteket er tomt. Legg til ressurser over, eller bruk «Forslag fra manuset»."
                    : origin !== "all"
                      ? `Ingen ressurser har versjoner som er «${VERSION_ORIGIN_LABEL[origin].toLocaleLowerCase("nb")}».`
                      : "Ingen ressurser passer med søket."}
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
                          <span className="tabular">· {n === 1 ? "1 scene" : `${n} scener`}</span>
                          {a.archived ? (
                            <span className="flex items-center gap-0.5">
                              <Archive className="size-3" aria-hidden />
                              Arkivert
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
          {kind === "style" ? (
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
                <p className="text-base font-medium text-text-primary">Velg en stilprofil</p>
                <p className="max-w-[460px] text-[13px] text-text-secondary">
                  Stilprofilene beskriver hvordan filmen skal se ut – stil, teknikk, farger, lys og
                  stemning – og sendes med i alle AI-beskrivelser. Standardprofilen gjelder alt;
                  egne profiler kan gjelde plakater, steder, AI-video og andre bruk.
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
              <p className="text-base font-medium text-text-primary">Velg en ressurs</p>
              <p className="max-w-[460px] text-[13px] text-text-secondary">
                Hver karakter, gjenstand og lokasjon finnes én gang i biblioteket og brukes i alle
                scener og produksjoner. Alternative navn (som «BESTEFAR» for «Halvard») gjør at den
                kjennes igjen i manuset.
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
