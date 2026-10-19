import { Toolbar, ToolbarButton, ToolbarSeparator, IconButton } from "@/app/shell/workspace-chrome";
/**
 * Arbeidsflaten «Utgivelse» (M8 del 1, DEC-0061; mandat kap. 26, REQ-0384–0399, REQ-0403/0404,
 * REQ-0501/0502): plakater og karakterkart per produksjon, med førsteutkast fra prosjektet, direkte
 * redigering, kontroll av lesbarhet og eksport til trykk-PDF og PNG. Relasjonene mellom karakterene
 * redigeres her. Alt er kommandoer som kan angres.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Download,
  GitFork,
  ImagePlus,
  Plus,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import {
  L,
  collation,
  POSTER_KIND_LABEL,
  ROLE_LABEL,
  posterDraft,
  posterKindBase,
  renderPoster,
  sortedAssets,
  type Poster,
  type PosterDocument,
  type PosterElement,
  type ProjectState,
} from "@/core";
import { canEdit, useMembers, useProjectState } from "@/app/project/use-project";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { useActiveProduction } from "@/app/project/use-production";
import { useImageUrls } from "@/app/library/asset-images";
import { SaveIndicator } from "@/app/script/ScriptWorkspace";
import { PaneResizer, usePaneSize } from "@/app/shell/pane-size";
import { Button } from "@/components/ui/button";
import { PosterCanvas } from "./PosterCanvas";
import { ElementInspector, PosterChecksList, PosterSettings } from "./PosterInspector";
import { ExportPosterDialog, NewPosterDialog } from "./PosterDialogs";
import { RelationsDialog } from "./RelationsDialog";
import {
  editElement,
  relayout,
  resetElement,
  savePoster,
  scaleElements,
  withElement,
} from "./poster-edit";

/** Navnet på et element i listen (øverst først): rolle, ressurs eller begynnelsen av teksten. */
function elementLabel(state: ProjectState, e: PosterElement): string {
  const role = ROLE_LABEL[e.role] ?? e.role;
  const asset = e.assetId ? state.assets[e.assetId]?.name : undefined;
  if (asset) return `${role}: ${asset}`;
  const rel = e.relationId ? state.assetRelations[e.relationId] : undefined;
  if (rel)
    return `${role}: ${state.assets[rel.fromAssetId]?.name ?? "?"} – ${state.assets[rel.toAssetId]?.name ?? "?"}`;
  const t = e.text?.nb.trim();
  if (t) return `${role}: ${t.length > 30 ? `${t.slice(0, 30)}…` : t}`;
  // Kortene og bildene har ressursen i ID-en
  const m = /^(?:char|place|obj):([0-9a-f-]{36})/.exec(e.id);
  const named = m ? state.assets[m[1]!]?.name : undefined;
  return named ? `${role}: ${named}` : role;
}

export function PosterWorkspace({ projectId, userId }: { projectId: string; userId: string }) {
  const query = useProjectState(projectId);
  const members = useMembers(projectId);
  const role = members.data?.find((m) => m.user_id === userId)?.role;
  const editable = canEdit(role);
  const cmds = useCommands(projectId, userId, editable);
  if (query.isLoading)
    return (
      <p className="p-6 text-[13px] text-text-tertiary">
        {L("Henter prosjektet …", "Loading the project …")}
      </p>
    );
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        {L("Prosjektet kunne ikke hentes.", "The project could not be loaded.")}
        {query.error ? (
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            {L("Teknisk detalj", "Technical detail")}: {query.error.message}
          </p>
        ) : null}
      </div>
    );
  return (
    <Release
      state={query.data}
      projectId={projectId}
      editable={editable}
      roleKnown={members.isSuccess}
      cmds={cmds}
    />
  );
}

type Tab = "poster" | "element" | "checks";

function Release({
  state,
  projectId,
  editable,
  roleKnown,
  cmds,
}: {
  state: ProjectState;
  projectId: string;
  editable: boolean;
  roleKnown: boolean;
  cmds: Commands;
}) {
  const productions = useMemo(
    () =>
      Object.values(state.productions).sort((a, b) =>
        a.kind === "main" ? -1 : b.kind === "main" ? 1 : a.name.localeCompare(b.name, collation()),
      ),
    [state.productions],
  );
  const [productionId, setProductionId] = useActiveProduction(projectId, state);
  const posters = useMemo(
    () =>
      Object.values(state.posters)
        .filter((p) => !p.removed && p.productionId === productionId)
        .sort((a, b) => a.name.localeCompare(b.name, collation()) || a.id.localeCompare(b.id)),
    [state.posters, productionId],
  );
  const [posterId, setPosterId] = useState<string | null>(null);
  const poster: Poster | undefined = (posterId ? state.posters[posterId] : undefined) ?? posters[0];
  const shownPoster =
    poster && !poster.removed && poster.productionId === productionId ? poster : posters[0];
  const [selected, setSelected] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<readonly string[]>([]);
  const [tab, setTab] = useState<Tab>("poster");
  const [preview, setPreview] = useState<"nb" | "en" | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [relOpen, setRelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listWidth, setListWidth] = usePaneSize("release-list", 220, 160, 360);
  const [sideWidth, setSideWidth] = usePaneSize("release-inspector", 320, 260, 520);

  const lang = preview ?? shownPoster?.language ?? "nb";
  const element =
    shownPoster && selected
      ? shownPoster.document.elements.find((e) => e.id === selected)
      : undefined;

  // Valget kan forsvinne (angre, andres endringer, ny komposisjon)
  useEffect(() => {
    if (selected && !element) setSelected(null);
  }, [selected, element]);
  useEffect(() => {
    setSelected(null);
    setHighlight([]);
    setPreview(null);
  }, [shownPoster?.id]);

  const paths = useMemo(() => {
    if (!shownPoster) return [];
    return renderPoster(state, shownPoster, lang).flatMap((o) =>
      o.op === "image" ? [o.mediaPath] : [],
    );
  }, [state, shownPoster, lang]);
  const urls = useImageUrls(paths);

  const save = (
    p: Poster,
    patch: Parameters<typeof savePoster>[2],
    label: string,
    group?: string,
  ) => setError(savePoster(cmds, p, patch, label, group));

  const changeElement = (
    id: string,
    patch: Partial<PosterElement>,
    label: string,
    group?: string,
  ) => {
    if (!shownPoster) return;
    save(shownPoster, { document: withElement(shownPoster.document, id, patch) }, label, group);
  };

  const addElement = (e: PosterElement, label: string) => {
    if (!shownPoster) return;
    save(
      shownPoster,
      { document: { ...shownPoster.document, elements: [...shownPoster.document.elements, e] } },
      label,
    );
    setSelected(e.id);
    setTab("element");
  };

  const newCustom = (kind: "text" | "image" | "rect") => {
    if (!shownPoster) return;
    const W = shownPoster.widthMm;
    const H = shownPoster.heightMm;
    const id = `custom:${crypto.randomUUID()}`;
    const pal = shownPoster.document.palette;
    const base = { id, role: "custom", rotation: 0, visible: true, auto: false } as const;
    if (kind === "text")
      addElement(
        {
          ...base,
          kind: "text",
          x: W * 0.2,
          y: H * 0.45,
          w: W * 0.6,
          h: H * 0.05,
          text: { nb: "Ny tekst", en: "New text" }, // i18n-ignore – tospråklig tekst (nb og en)
          font: "serif",
          bold: false,
          italic: false,
          size: Math.round(36 * (W / 700)),
          color: pal.text,
          align: "center",
          uppercase: false,
          tracking: 0,
          lineHeight: 1.2,
        },
        L("Ny tekst", "New text"),
      );
    else if (kind === "rect")
      addElement(
        {
          ...base,
          kind: "rect",
          x: W * 0.3,
          y: H * 0.4,
          w: W * 0.4,
          h: H * 0.2,
          fill: pal.accent,
          stroke: null,
          strokeWidth: 0,
          opacity: 0.8,
          radius: 0,
        },
        L("Ny flate", "New shape"),
      );
    else {
      const a = sortedAssets(state).find((x) => !x.archived && x.kind !== "sound");
      if (!a) {
        setError(
          L(
            "Biblioteket har ingen ressurser med bilder ennå.",
            "The library has no assets with images yet.",
          ),
        );
        return;
      }
      addElement(
        {
          ...base,
          kind: "image",
          x: W * 0.35,
          y: H * 0.35,
          w: W * 0.3,
          h: W * 0.3,
          assetId: a.id,
          assetVariantId: null,
          versionId: null,
          fit: "contain",
          opacity: 1,
        },
        L("Nytt bilde", "New image"),
      );
    }
  };

  const onDocument = (doc: PosterDocument, label: string, group?: string) => {
    if (!shownPoster) return;
    save(shownPoster, { document: relayout(state, shownPoster, doc) }, label, group);
  };

  const onPoster = (
    patch: Partial<Pick<Poster, "name" | "language" | "kind" | "widthMm" | "heightMm">>,
    label: string,
  ) => {
    if (!shownPoster) return;
    if (patch.kind || patch.widthMm || patch.heightMm) {
      const w = patch.widthMm ?? shownPoster.widthMm;
      const h = patch.heightMm ?? shownPoster.heightMm;
      const kindChange = !!patch.kind && patch.kind !== shownPoster.kind;
      // Annen type: programmets elementer lages på nytt i den nye komposisjonen; brukerens endringer på
      // dem står (også om typen byttes tilbake), og egne elementer står (KI-133). Ett steg å angre.
      const base = kindChange
        ? posterKindBase(shownPoster.document, patch.kind!)
        : shownPoster.document;
      const scaled = scaleElements(base, w / shownPoster.widthMm, h / shownPoster.heightMm);
      const doc = relayout(state, shownPoster, scaled, {
        ...(patch.kind ? { kind: patch.kind } : {}),
        widthMm: w,
        heightMm: h,
      });
      save(shownPoster, { ...patch, document: doc }, label);
    } else save(shownPoster, patch, label);
  };

  const onRedraft = () => {
    if (!shownPoster) return;
    const d = shownPoster.document;
    const fresh = posterDraft(
      state,
      shownPoster.productionId,
      shownPoster.kind,
      shownPoster.widthMm,
      shownPoster.heightMm,
    );
    // Tekstene, stilen, innholdsvalgene og utvalget beholdes; elementene lages på nytt
    const doc = relayout(state, shownPoster, {
      ...fresh,
      title: d.title,
      logline: d.logline,
      genre: d.genre,
      tagline: d.tagline,
      palette: d.palette,
      options: d.options,
      characters: d.characters,
      places: d.places,
      objects: d.objects,
      elements: [],
    });
    save(shownPoster, { document: doc }, L("Lag utkastet på nytt", "Redraft the poster"));
    setSelected(null);
  };

  const order = (dir: "front" | "back") => {
    if (!shownPoster || !element) return;
    const rest = shownPoster.document.elements.filter((e) => e.id !== element.id);
    const e = editElement(element, {});
    const z =
      e.role === "custom"
        ? e
        : { ...e, overrides: [...new Set([...(e.overrides ?? []), "z"])].sort() };
    // Bakgrunnen ligger alltid nederst
    const bg = rest.findIndex((x) => x.role === "background");
    const elements =
      dir === "front" ? [...rest, z] : [...rest.slice(0, bg + 1), z, ...rest.slice(bg + 1)];
    save(
      shownPoster,
      { document: { ...shownPoster.document, elements } },
      dir === "front" ? L("Flytt fram", "Bring forward") : L("Flytt bak", "Send back"),
    );
  };

  const reset = () => {
    if (!shownPoster || !element) return;
    const doc = shownPoster.document;
    save(
      shownPoster,
      {
        document: relayout(state, shownPoster, {
          ...doc,
          elements: doc.elements.map((e) => (e.id === element.id ? resetElement(e) : e)),
        }),
      },
      L("Tilbakestill element", "Reset element"),
    );
  };

  const remove = () => {
    if (!shownPoster || !element) return;
    save(
      shownPoster,
      {
        document: {
          ...shownPoster.document,
          elements: shownPoster.document.elements.filter((e) => e.id !== element.id),
        },
      },
      L("Fjern element", "Remove element"),
    );
    setSelected(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar>
        <span className="text-[13px] font-medium text-text-primary">
          {L("Utgivelse", "Release")}
        </span>
        <ToolbarSeparator />
        <IconButton
          onClick={cmds.undo}
          shortcut="⌘Z"
          disabled={!cmds.canUndo}
          title={
            cmds.undoLabel
              ? L(`Angre: ${cmds.undoLabel} (⌘Z)`, `Undo: ${cmds.undoLabel} (⌘Z)`)
              : L("Angre (⌘Z)", "Undo (⌘Z)")
          }
          label={
            cmds.undoLabel
              ? L(`Angre: ${cmds.undoLabel}`, `Undo: ${cmds.undoLabel}`)
              : L("Angre", "Undo")
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
              ? L(`Gjør om: ${cmds.redoLabel} (⇧⌘Z)`, `Redo: ${cmds.redoLabel} (⇧⌘Z)`)
              : L("Gjør om (⇧⌘Z)", "Redo (⇧⌘Z)")
          }
          label={
            cmds.redoLabel
              ? L(`Gjør om: ${cmds.redoLabel}`, `Redo: ${cmds.redoLabel}`)
              : L("Gjør om", "Redo")
          }
        >
          <Redo2 />
        </IconButton>
        <ToolbarButton
          variant="default"
          onClick={() => setRelOpen(true)}
          title={L("Relasjoner mellom karakterene", "Relations between the characters")}
        >
          <GitFork />
          <span className="hidden xl:inline">{L("Relasjoner", "Relations")}</span>
        </ToolbarButton>
        {shownPoster && editable ? (
          <>
            <ToolbarSeparator />
            <IconButton
              onClick={() => newCustom("text")}
              label={L("Legg til tekst", "Add text")}
              title={L("Legg til tekst", "Add text")}
            >
              <Type />
            </IconButton>
            <IconButton
              onClick={() => newCustom("image")}
              label={L("Legg til bilde", "Add image")}
              title={L("Legg til bilde", "Add image")}
            >
              <ImagePlus />
            </IconButton>
            <IconButton
              onClick={() => newCustom("rect")}
              label={L("Legg til flate", "Add shape")}
              title={L("Legg til flate", "Add shape")}
            >
              <Square />
            </IconButton>
          </>
        ) : null}
        {shownPoster ? (
          <>
            <ToolbarSeparator />
            <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-text-secondary">
              <span className="hidden xl:inline">{L("Vis på", "Show in")}</span>
              <select
                aria-label={L("Språk i forhåndsvisningen", "Language of the preview")}
                value={lang}
                onChange={(e) => setPreview(e.target.value as "nb" | "en")}
                className="h-7 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary"
              >
                <option value="nb">{L("Norsk", "Norwegian")}</option>
                <option value="en">{L("Engelsk", "English")}</option>
              </select>
            </label>
            <ToolbarButton variant="primary" onClick={() => setExportOpen(true)}>
              <Download />
              {L("Eksporter", "Export")}
            </ToolbarButton>
          </>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-3">
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
                aria-label={L("Produksjon", "Production")}
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
      {error ? (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-border bg-status-danger-bg px-3 py-1.5 text-xs text-status-danger"
        >
          {error}
          <button type="button" className="ml-auto underline" onClick={() => setError(null)}>
            {L("Lukk", "Close")}
          </button>
        </div>
      ) : null}

      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: `${listWidth}px minmax(0,1fr) ${shownPoster ? sideWidth : 0}px`,
        }}
      >
        {/* Plakatene */}
        <div className="relative flex min-h-0 flex-col border-r border-border bg-surface-1">
          <PaneResizer
            edge="right"
            size={listWidth}
            onSize={setListWidth}
            min={160}
            max={360}
            label={L("Bredde på plakatlisten", "Width of the poster list")}
          />
          <div className="group flex h-8 shrink-0 items-center justify-between gap-1.5 border-b border-border bg-surface-2 px-2">
            <span className="text-chrome-label font-medium uppercase tracking-label text-text-tertiary">
              {L(`Plakater (${posters.length})`, `Posters (${posters.length})`)}
            </span>
            {editable ? (
              <ToolbarButton className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setNewOpen(true)}>
                <Plus />
                {L("Ny", "New")}
              </ToolbarButton>
            ) : null}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto p-1" aria-label={L("Plakater", "Posters")}>
            {posters.map((p) => (
              <li key={p.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => setPosterId(p.id)}
                  aria-current={p.id === shownPoster?.id ? "true" : undefined}
                  className={
                    "flex min-w-0 flex-1 flex-col rounded-sm px-2 py-1.5 text-left hover:bg-surface-3 " +
                    (p.id === shownPoster?.id ? "bg-accent-selection" : "")
                  }
                >
                  <span className="truncate text-[13px] text-text-primary">{p.name}</span>
                  <span className="truncate text-[11px] text-text-tertiary">
                    {POSTER_KIND_LABEL[p.kind]} · {p.widthMm / 10} × {p.heightMm / 10} cm ·{" "}
                    {p.language === "en" ? L("engelsk", "English") : L("norsk", "Norwegian")}
                  </span>
                </button>
                {editable ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={L(`Fjern plakaten «${p.name}»`, `Remove the poster “${p.name}”`)}
                    title={L("Fjern plakaten (kan angres)", "Remove the poster (can be undone)")}
                    onClick={() =>
                      setError(
                        cmds.run(
                          { type: "SetPosterRemoved", posterId: p.id, removed: true },
                          L(`Fjern plakaten «${p.name}»`, `Remove the poster “${p.name}”`),
                        ),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        {/* Plakaten */}
        <div className="flex min-h-0 min-w-0 items-center justify-center bg-surface-0 p-6">
          {shownPoster ? (
            <PosterCanvas
              state={state}
              poster={shownPoster}
              lang={lang}
              urls={urls.data ?? {}}
              selectedId={selected}
              onSelect={(id) => {
                setSelected(id);
                setHighlight([]);
                if (id) setTab("element");
              }}
              editable={editable}
              onCommit={(id, patch, label, group) => changeElement(id, patch, label, group)}
              highlight={highlight}
            />
          ) : (
            <div className="max-w-md text-center">
              <p className="text-base font-medium text-text-primary">
                {L("Ingen plakater ennå", "No posters yet")}
              </p>
              <p className="mt-2 text-[13px] text-text-secondary">
                {L(
                  "Lag en kinopitch-plakat eller et karakter- og universkart. Programmet lager et førsteutkast fra manuset og biblioteket, som du kan endre fritt og eksportere til trykk.",
                  "Make a cinema pitch poster or a character and universe map. The app makes a first draft from the script and the library, which you can change freely and export for print.",
                )}
              </p>
              {editable ? (
                <Button className="mt-4" onClick={() => setNewOpen(true)}>
                  <Plus />
                  {L("Ny plakat", "New poster")}
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {/* Innstillinger */}
        {shownPoster ? (
          <aside
            className="relative flex min-h-0 flex-col border-l border-border bg-surface-1"
            aria-label={L("Innstillinger for plakaten", "Settings for the poster")}
          >
            <PaneResizer
              edge="left"
              size={sideWidth}
              onSize={setSideWidth}
              min={260}
              max={520}
              label={L("Bredde på innstillingene", "Width of the settings")}
            />
            <div
              role="tablist"
              aria-label={L("Innstillinger", "Settings")}
              className="flex shrink-0 border-b border-border"
            >
              {(
                [
                  ["poster", L("Plakat", "Poster")],
                  ["element", L("Element", "Element")],
                  ["checks", L("Kontroll", "Checks")],
                ] as const
              ).map(([t, label]) => (
                <button
                  key={t}
                  id={`release-tab-${t}`}
                  role="tab"
                  type="button"
                  aria-selected={tab === t}
                  aria-controls="release-tabpanel"
                  tabIndex={tab === t ? 0 : -1}
                  onClick={() => setTab(t)}
                  onKeyDown={(e) => {
                    const all = ["poster", "element", "checks"] as const;
                    const i = all.indexOf(t);
                    const next =
                      e.key === "ArrowRight"
                        ? all[(i + 1) % 3]
                        : e.key === "ArrowLeft"
                          ? all[(i + 2) % 3]
                          : null;
                    if (!next) return;
                    e.preventDefault();
                    setTab(next);
                    document.getElementById(`release-tab-${next}`)?.focus();
                  }}
                  className={
                    "h-9 flex-1 text-xs " +
                    (tab === t
                      ? "border-b-2 border-accent-brand font-medium text-text-primary"
                      : "text-text-secondary hover:text-text-primary")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              id="release-tabpanel"
              className="min-h-0 flex-1 overflow-y-auto"
              role="tabpanel"
              aria-labelledby={`release-tab-${tab}`}
            >
              {tab === "element" ? (
                <div className="border-b border-border px-3 py-2">
                  <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
                    {L("Element", "Element")}
                    <select
                      value={element?.id ?? ""}
                      onChange={(e) => {
                        setSelected(e.target.value || null);
                        setHighlight([]);
                      }}
                      className="h-7 w-full rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                    >
                      <option value="">{L("Velg et element …", "Choose an element …")}</option>
                      {[...shownPoster.document.elements].reverse().map((el) => (
                        <option key={el.id} value={el.id}>
                          {elementLabel(state, el)}
                          {el.visible ? "" : L(" (skjult)", " (hidden)")}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
              {tab === "poster" ? (
                <PosterSettings
                  key={`${shownPoster.id}`}
                  state={state}
                  poster={shownPoster}
                  editable={editable}
                  onPoster={onPoster}
                  onDocument={onDocument}
                  onRedraft={onRedraft}
                />
              ) : tab === "element" ? (
                element ? (
                  <ElementInspector
                    key={element.id}
                    state={state}
                    poster={shownPoster}
                    element={element}
                    editable={editable}
                    onChange={(patch, label, group) =>
                      changeElement(element.id, patch, label, group)
                    }
                    onReset={reset}
                    onRemove={remove}
                    onOrder={order}
                  />
                ) : (
                  <p className="px-3 py-4 text-xs text-text-tertiary">
                    {L(
                      "Klikk på noe i plakaten, eller velg i listen over. Piltastene flytter valgt element.",
                      "Click something in the poster, or choose from the list above. The arrow keys move the selected element.",
                    )}
                  </p>
                )
              ) : (
                <PosterChecksList
                  state={state}
                  poster={shownPoster}
                  lang={lang}
                  onShow={(ids) => {
                    setHighlight(ids);
                    if (ids.length === 1) setSelected(ids[0]!);
                  }}
                />
              )}
            </div>
          </aside>
        ) : (
          <div />
        )}
      </div>

      {newOpen ? (
        <NewPosterDialog
          state={state}
          cmds={cmds}
          productionId={productionId}
          open={newOpen}
          onOpenChange={setNewOpen}
          onCreated={(id) => setPosterId(id)}
        />
      ) : null}
      {exportOpen && shownPoster ? (
        <ExportPosterDialog
          state={state}
          poster={shownPoster}
          open={exportOpen}
          onOpenChange={setExportOpen}
        />
      ) : null}
      {relOpen ? (
        <RelationsDialog
          state={state}
          cmds={cmds}
          productionId={productionId}
          editable={editable}
          open={relOpen}
          onOpenChange={setRelOpen}
        />
      ) : null}
    </div>
  );
}
