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
import { collation, POSTER_KIND_LABEL, ROLE_LABEL, posterDraft, posterKindBase, renderPoster, sortedAssets, type Poster, type PosterDocument, type PosterElement, type ProjectState } from "@/core";
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
import { PosterHarmonizeDialog } from "./PosterHarmonizeDialog";
import {
  editElement,
  relayout,
  resetElement,
  savePoster,
  scaleElements,
  withElement,
} from "./poster-edit";
import { t as tk } from "@/core/i18n/keyed";

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
        {tk("app-release-poster-workspace.poster-workspace.p.157c9664a3d1")}
      </p>
    );
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        {tk("app-release-poster-workspace.poster-workspace.div.f000d65e1831")}
        {query.error ? (
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            {tk("app-release-poster-workspace.poster-workspace.p.373f0ad179c9")}: {query.error.message}
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
  /** P8: elementet som harmoniseres (stor visning med «Harmoniser stil» fremme). */
  const [harmonize, setHarmonize] = useState<string | null>(null);
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
        tk("app-release-poster-workspace.new-custom.add-element.cda2df5a0013"),
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
        tk("app-release-poster-workspace.new-custom.add-element.4c4cbdb804c9"),
      );
    else {
      const a = sortedAssets(state).find((x) => !x.archived && x.kind !== "sound");
      if (!a) {
        setError(
          tk("app-release-poster-workspace.new-custom.set-error.a1dff6d89f59"),
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
        tk("app-release-poster-workspace.new-custom.add-element.0e158e6bff1d"),
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
    save(shownPoster, { document: doc }, tk("app-release-poster-workspace.on-redraft.save.70f5b46eb2ac"));
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
      dir === "front" ? tk("app-release-poster-workspace.order.save.a9339cab828f") : tk("app-release-poster-workspace.order.save.9f30e66093ba"),
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
      tk("app-release-poster-workspace.reset.save.e63a3e554439"),
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
      tk("app-release-poster-workspace.remove.save.61782ea14e37"),
    );
    setSelected(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar>
        <span className="text-[13px] font-medium text-text-primary">
          {tk("app-release-poster-workspace.release.span.2250797ea93d")}
        </span>
        <ToolbarSeparator />
        <IconButton
          onClick={cmds.undo}
          shortcut="⌘Z"
          disabled={!cmds.canUndo}
          title={
            cmds.undoLabel
              ? tk("app-release-poster-workspace.release.title.fba85a87562d", { undoLabel: String(cmds.undoLabel) })
              : tk("app-release-poster-workspace.release.title.9e9c617110c6")
          }
          label={
            cmds.undoLabel
              ? tk("app-release-poster-workspace.release.label.0884e98d32ef", { undoLabel: String(cmds.undoLabel) })
              : tk("app-release-poster-workspace.release.label.e43f0316bc07")
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
              ? tk("app-release-poster-workspace.release.title.f9640d5db842", { redoLabel: String(cmds.redoLabel) })
              : tk("app-release-poster-workspace.release.title.f4052e8ed488")
          }
          label={
            cmds.redoLabel
              ? tk("app-release-poster-workspace.release.label.0065aef473b7", { redoLabel: String(cmds.redoLabel) })
              : tk("app-release-poster-workspace.release.label.5b58d96eb2d9")
          }
        >
          <Redo2 />
        </IconButton>
        <ToolbarButton
          variant="default"
          onClick={() => setRelOpen(true)}
          title={tk("app-release-poster-workspace.release.title.54dae3e577b2")}
        >
          <GitFork />
          <span className="hidden xl:inline">{tk("app-release-poster-workspace.release.span.5380daa70605")}</span>
        </ToolbarButton>
        {shownPoster && editable ? (
          <>
            <ToolbarSeparator />
            <IconButton
              onClick={() => newCustom("text")}
              label={tk("app-release-poster-workspace.release.label.bc5e159f3115")}
              title={tk("app-release-poster-workspace.release.title.bc5e159f3115")}
            >
              <Type />
            </IconButton>
            <IconButton
              onClick={() => newCustom("image")}
              label={tk("app-release-poster-workspace.release.label.b184f6f16bae")}
              title={tk("app-release-poster-workspace.release.title.b184f6f16bae")}
            >
              <ImagePlus />
            </IconButton>
            <IconButton
              onClick={() => newCustom("rect")}
              label={tk("app-release-poster-workspace.release.label.6d38691f9c43")}
              title={tk("app-release-poster-workspace.release.title.6d38691f9c43")}
            >
              <Square />
            </IconButton>
          </>
        ) : null}
        {shownPoster ? (
          <>
            <ToolbarSeparator />
            <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-text-secondary">
              <span className="hidden xl:inline">{tk("app-release-poster-workspace.release.span.557f279fecfa")}</span>
              <select
                aria-label={tk("app-release-poster-workspace.release.aria-label.616d74b4a361")}
                value={lang}
                onChange={(e) => setPreview(e.target.value as "nb" | "en")}
                className="h-7 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary"
              >
                <option value="nb">{tk("app-release-poster-workspace.release.option.c8bb36bc83a1")}</option>
                <option value="en">{tk("app-release-poster-workspace.release.option.cad6bb633625")}</option>
              </select>
            </label>
            <ToolbarButton variant="primary" data-testid="poster-export-open" onClick={() => setExportOpen(true)}>
              <Download />
              {tk("app-release-poster-workspace.release.toolbar-button.9802b5d3d4f2")}
            </ToolbarButton>
          </>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <SaveIndicator cmds={cmds} />
          {roleKnown && !editable ? (
            <span className="text-xs text-text-tertiary">
              {tk("app-release-poster-workspace.release.span.0c4f34e87941")}
            </span>
          ) : null}
          {productions.length > 1 ? (
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              {tk("app-release-poster-workspace.release.label.ce76d0602807")}
              <select
                aria-label={tk("app-release-poster-workspace.release.aria-label.ce76d0602807")}
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
            {tk("app-release-poster-workspace.release.button.c8683396b684")}
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
            label={tk("app-release-poster-workspace.release.label.67d99d6e5d5c")}
          />
          <div className="group flex h-8 shrink-0 items-center justify-between gap-1.5 border-b border-border bg-surface-2 px-2">
            <span className="text-chrome-label font-medium uppercase tracking-label text-text-tertiary">
              {tk("app-release-poster-workspace.release.span.c1d9e794dcc3", { length: String(posters.length) })}
            </span>
            {editable ? (
              <ToolbarButton className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setNewOpen(true)}>
                <Plus />
                {tk("app-release-poster-workspace.release.toolbar-button.fc935ac5452b")}
              </ToolbarButton>
            ) : null}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto p-1" aria-label={tk("app-release-poster-workspace.release.aria-label.47d18629b8d4")}>
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
                    {p.language === "en" ? tk("app-release-poster-workspace.release.span.ae207c8e6671") : tk("app-release-poster-workspace.release.span.52832472a5b7")}
                  </span>
                </button>
                {editable ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={tk("app-release-poster-workspace.release.aria-label.f0b64d62bbf2", { name: String(p.name) })}
                    title={tk("app-release-poster-workspace.release.title.af69fc49c826")}
                    onClick={() =>
                      setError(
                        cmds.run(
                          { type: "SetPosterRemoved", posterId: p.id, removed: true },
                          tk("app-release-poster-workspace.release.cmds-run.f0b64d62bbf2", { name: String(p.name) }),
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
                {tk("app-release-poster-workspace.release.p.f21a622cb97b")}
              </p>
              <p className="mt-2 text-[13px] text-text-secondary">
                {tk("app-release-poster-workspace.release.p.619a05121915")}
              </p>
              {editable ? (
                <Button className="mt-4" onClick={() => setNewOpen(true)}>
                  <Plus />
                  {tk("app-release-poster-workspace.release.button.fbcb86b61afd")}
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {/* Innstillinger */}
        {shownPoster ? (
          <aside
            className="relative flex min-h-0 flex-col border-l border-border bg-surface-1"
            aria-label={tk("app-release-poster-workspace.release.aria-label.8e8faa1f0f31")}
          >
            <PaneResizer
              edge="left"
              size={sideWidth}
              onSize={setSideWidth}
              min={260}
              max={520}
              label={tk("app-release-poster-workspace.release.label.757a61b1be69")}
            />
            <div
              role="tablist"
              aria-label={tk("app-release-poster-workspace.release.aria-label.cf3990f06b50")}
              className="flex shrink-0 border-b border-border"
            >
              {(
                [
                  ["poster", tk("app-release-poster-workspace.release.poster-l-plakat-poster-element-l-element-element-checks-l-kontroll-checks-as-const-map.92521107769a")],
                  ["element", tk("app-release-poster-workspace.release.poster-l-plakat-poster-element-l-element-element-checks-l-kontroll-checks-as-const-map.7c31d3b73122")],
                  ["checks", tk("app-release-poster-workspace.release.poster-l-plakat-poster-element-l-element-element-checks-l-kontroll-checks-as-const-map.41201bd03653")],
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
                    {tk("app-release-poster-workspace.release.label.7c31d3b73122")}
                    <select
                      data-testid="poster-element-select"
                      value={element?.id ?? ""}
                      onChange={(e) => {
                        setSelected(e.target.value || null);
                        setHighlight([]);
                      }}
                      className="h-7 w-full rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                    >
                      <option value="">{tk("app-release-poster-workspace.release.option.125b57011f77")}</option>
                      {[...shownPoster.document.elements].reverse().map((el) => (
                        <option key={el.id} value={el.id}>
                          {elementLabel(state, el)}
                          {el.visible ? "" : tk("app-release-poster-workspace.release.option.7b256a3b37c8")}
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
                    onHarmonize={() => setHarmonize(element.id)}
                  />
                ) : (
                  <p className="px-3 py-4 text-xs text-text-tertiary">
                    {tk("app-release-poster-workspace.release.p.f2100588b6d9")}
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
      {harmonize && shownPoster ? (
        <PosterHarmonizeDialog
          state={state}
          cmds={cmds}
          projectId={projectId}
          editable={editable}
          element={shownPoster.document.elements.find((x) => x.id === harmonize) ?? null}
          onUseHere={(patch) => changeElement(harmonize, patch, tk("app-release-poster-workspace.release.change-element.596dd3816a3b"))}
          onClose={() => setHarmonize(null)}
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
