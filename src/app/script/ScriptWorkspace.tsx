/**
 * Arbeidsflaten «Manus» (M2): import, sidevisning, scenenavigator, korrigering og redigering med angre.
 * Manus og film bygger på samme aktive struktur (INV-01); alt her er kommandoer mot domenekjernen.
 */
import { Download, FileUp, History, Loader2, Lock, Redo2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  charactersInProduction,
  filterPages,
  isFilterActive,
  mainProduction,
  matchingOccurrences,
  scriptPages,
  scriptView,
  type ProjectState,
  type SceneFilter,
} from "@/core";
import { canEdit, useMembers, useProfiles, useProjectState } from "@/app/project/use-project";
import { initials, usePresence, type PresentUser } from "@/app/project/use-presence";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ExportDialog } from "./ExportDialog";
import { ImportDialog } from "./ImportDialog";
import { VersionsDialog } from "./VersionsDialog";
import { Inspector } from "./Inspector";
import { SceneNavigator } from "./SceneNavigator";
import { ScriptPageView, type Selection } from "./ScriptPageView";

const ZOOMS = ["fit", "0.75", "1", "1.25", "1.5"] as const;
type Zoom = (typeof ZOOMS)[number];
const PAGE_PX = 51 * 16; // sidebredde ved 100 %

export function ScriptWorkspace({ projectId, userId }: { projectId: string; userId: string }) {
  const query = useProjectState(projectId);
  const members = useMembers(projectId);
  const role = members.data?.find((m) => m.user_id === userId)?.role;
  const editable = canEdit(role);
  const cmds = useCommands(projectId, userId, editable);

  if (query.isLoading) return <p className="p-6 text-[13px] text-text-tertiary">Henter manus …</p>;
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        Manuset kunne ikke hentes.
        {query.error ? (
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            Teknisk detalj: {query.error.message}
          </p>
        ) : null}
      </div>
    );
  return (
    <Workspace
      state={query.data}
      projectId={projectId}
      editable={editable}
      roleKnown={members.isSuccess}
      cmds={cmds}
      userId={userId}
    />
  );
}

function Workspace({
  state,
  projectId,
  editable,
  roleKnown,
  cmds,
  userId,
}: {
  state: ProjectState;
  projectId: string;
  editable: boolean;
  roleKnown: boolean;
  cmds: Commands;
  userId: string;
}) {
  const productions = useMemo(
    () =>
      Object.values(state.productions).sort((a, b) =>
        a.kind === "main" ? -1 : b.kind === "main" ? 1 : a.name.localeCompare(b.name, "nb"),
      ),
    [state.productions],
  );
  const [productionId, setProductionId] = useState<string>(
    () => mainProduction(state)?.id ?? productions[0]?.id ?? "",
  );
  const [selection, setSelection] = useState<Selection>({ occurrenceId: null, blockId: null });
  const [lockedPages, setLockedPages] = useState(true);
  const [zoomChoice, setZoom] = useState<Zoom>("fit");
  const [fitZoom, setFitZoom] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  // Visningsvalg (REQ-0531, REQ-0073–0075): endrer aldri produksjonen
  const [onlySelected, setOnlySelected] = useState(false);
  const [filter, setFilter] = useState<SceneFilter>({});
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Tilstedeværelse: hvem andre er i prosjektet, og hvilken scene de står i
  const me = useProfiles([userId]);
  const others = usePresence(
    projectId,
    userId,
    me.data?.[userId]?.display_name || "Medlem",
    selection.occurrenceId,
  );
  const presenceByOcc = useMemo(() => {
    const m = new Map<string, PresentUser[]>();
    for (const o of others)
      if (o.occurrenceId) m.set(o.occurrenceId, [...(m.get(o.occurrenceId) ?? []), o]);
    return m;
  }, [others]);

  const hasScenes = Object.values(state.occurrences).some((o) => o.productionId === productionId);
  // «Tilpass bredde»: siden fyller midtfeltet
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setFitZoom(Math.max(0.5, Math.min(1.5, (el.clientWidth - 48) / PAGE_PX))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasScenes]);
  const zoom = zoomChoice === "fit" ? fitZoom : Number(zoomChoice);

  const pagination = useMemo(
    () => scriptPages(state, productionId, { lockedPages }),
    [state, productionId, lockedPages],
  );
  const characters = useMemo(
    () => charactersInProduction(state, productionId),
    [state, productionId],
  );
  const matching = useMemo(
    () => (isFilterActive(filter) ? matchingOccurrences(state, productionId, filter) : null),
    [state, productionId, filter],
  );
  const showOnlySelected = onlySelected && selection.occurrenceId !== null;
  const visibleOcc = useMemo<ReadonlySet<string> | null>(
    () => (showOnlySelected ? new Set([selection.occurrenceId!]) : matching),
    [showOnlySelected, selection.occurrenceId, matching],
  );
  const shownPages = useMemo(
    () => (visibleOcc ? filterPages(pagination.pages, visibleOcc) : pagination.pages),
    [pagination, visibleOcc],
  );
  const uncertainCount = useMemo(() => {
    let n = 0;
    for (const sc of scriptView(state, productionId)) {
      if (state.variants[state.occurrences[sc.occurrenceId]!.variantId]?.uncertainty) n++;
      for (const b of sc.blocks) if (b.uncertainty) n++;
    }
    return n;
  }, [state, productionId]);

  // Valget kan forsvinne (angre, andres endringer): rydd opp
  useEffect(() => {
    if (
      selection.blockId &&
      (!state.blocks[selection.blockId] || state.blocks[selection.blockId]!.removed)
    ) {
      setSelection((s) => ({ ...s, blockId: null }));
    }
    if (selection.occurrenceId && !state.occurrences[selection.occurrenceId])
      setSelection({ occurrenceId: null, blockId: null });
  }, [state, selection]);

  const scrollTo = useCallback((sel: Selection) => {
    requestAnimationFrame(() => {
      const el = sel.blockId
        ? scrollRef.current?.querySelector(`[data-block="${sel.blockId}"]`)
        : sel.occurrenceId
          ? document.getElementById(`scene-${sel.occurrenceId}`)
          : null;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, []);

  const select = useCallback(
    (sel: Selection, scroll = false) => {
      setSelection(sel);
      if (scroll) scrollTo(sel);
    },
    [scrollTo],
  );

  // Rekkefølge av synlige blokker og overskrifter, for tastaturnavigasjon og «neste usikre»
  const order = useMemo(() => {
    const out: Selection[] = [];
    for (const sc of scriptView(state, productionId)) {
      if (visibleOcc && !visibleOcc.has(sc.occurrenceId)) continue;
      out.push({ occurrenceId: sc.occurrenceId, blockId: null });
      for (const b of sc.blocks) out.push({ occurrenceId: sc.occurrenceId, blockId: b.id });
    }
    return out;
  }, [state, productionId, visibleOcc]);

  function nextUncertain() {
    const at = order.findIndex(
      (x) => x.occurrenceId === selection.occurrenceId && x.blockId === selection.blockId,
    );
    for (let k = 1; k <= order.length; k++) {
      const s = order[(at + k + order.length) % order.length]!;
      const occ = state.occurrences[s.occurrenceId!]!;
      const unc = s.blockId
        ? state.blocks[s.blockId]?.uncertainty
        : state.variants[occ.variantId]?.uncertainty;
      if (unc) {
        select(s, true);
        return;
      }
    }
  }

  function onPagesKey(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    const at = order.findIndex(
      (x) => x.occurrenceId === selection.occurrenceId && x.blockId === selection.blockId,
    );
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n =
        order[Math.min(order.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
      if (n) select(n, true);
    } else if (e.key === "Enter" && selection.blockId) {
      e.preventDefault();
      textRef.current?.focus();
    }
  }

  const run = cmds.run;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Verktøylinje */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-3">
        {productions.length > 1 ? (
          <select
            aria-label="Produksjon"
            value={productionId}
            onChange={(e) => {
              setProductionId(e.target.value);
              setSelection({ occurrenceId: null, blockId: null });
            }}
            className="h-7 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
          >
            {productions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[13px] font-medium text-text-primary">{productions[0]?.name}</span>
        )}
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
        {editable ? (
          <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
            <FileUp />
            Importer manus
          </Button>
        ) : null}
        {hasScenes ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setVersionsOpen(true)}>
              <History />
              Versjoner
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExportOpen(true)}>
              <Download />
              Eksporter
            </Button>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          {others.length ? (
            <div
              className="flex -space-x-1.5"
              aria-label={`Også her nå: ${others.map((o) => o.name).join(", ")}`}
            >
              {others.slice(0, 5).map((o) => (
                <button
                  key={o.userId}
                  type="button"
                  title={`${o.name}${o.occurrenceId ? " – se hvor" : ""}`}
                  onClick={() =>
                    o.occurrenceId && select({ occurrenceId: o.occurrenceId, blockId: null }, true)
                  }
                  className="flex size-6 items-center justify-center rounded-full border-2 border-surface-2 bg-accent-brand text-[10px] font-semibold text-accent-fg"
                >
                  {initials(o.name)}
                </button>
              ))}
            </div>
          ) : null}
          <SaveIndicator cmds={cmds} />
          <label
            className="flex items-center gap-1.5 text-xs text-text-secondary"
            title="Vis bare scenen som er valgt i scenelisten. Endrer ikke filmen."
          >
            <input
              type="checkbox"
              checked={onlySelected}
              onChange={(e) => {
                setOnlySelected(e.target.checked);
                requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
              }}
              className="size-3.5 accent-[var(--accent-brand)]"
            />
            Vis kun valgt scene
          </label>
          {roleKnown && !editable ? (
            <span className="text-xs text-text-tertiary">Bare lesetilgang</span>
          ) : null}
          <label
            className="flex items-center gap-1.5 text-xs text-text-secondary"
            title="Følg originalens sideskift for importert tekst (låste sider)"
          >
            <Lock className="size-3.5" aria-hidden />
            Låste sider
            <Switch
              checked={lockedPages}
              onCheckedChange={setLockedPages}
              className="scale-75"
              aria-label="Låste sider"
            />
          </label>
          <select
            aria-label="Zoom"
            value={zoomChoice}
            onChange={(e) => setZoom(e.target.value as Zoom)}
            className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
          >
            {ZOOMS.map((z) => (
              <option key={z} value={z}>
                {z === "fit" ? "Tilpass bredde" : `${Math.round(Number(z) * 100)} %`}
              </option>
            ))}
          </select>
          <span className="tabular text-xs text-text-tertiary">
            {visibleOcc
              ? `${shownPages.length} av ${pagination.pages.length}`
              : pagination.pages.length}{" "}
            sider
          </span>
        </div>
      </div>

      {hasScenes ? (
        <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_320px]">
          <div className="flex min-h-0 flex-col border-r border-border bg-surface-1">
            <SceneNavigator
              state={state}
              productionId={productionId}
              startPages={pagination.sceneStartPage}
              selectedOcc={selection.occurrenceId}
              editable={editable}
              filter={filter}
              onFilterChange={setFilter}
              characters={characters}
              visible={matching}
              presence={presenceByOcc}
              onSelect={(id) => select({ occurrenceId: id, blockId: null }, true)}
              onMove={(id, orderKey, label) =>
                run({ type: "MoveOccurrence", occurrenceId: id as never, orderKey }, label)
              }
              onToggleActive={(id, active) =>
                run(
                  { type: "SetOccurrenceActive", occurrenceId: id as never, active },
                  active ? "Aktiver scene" : "Deaktiver scene",
                )
              }
            />
          </div>
          <div
            ref={scrollRef}
            tabIndex={0}
            aria-label="Manussider. Pil opp og ned velger linje, Enter redigerer."
            onKeyDown={onPagesKey}
            className="min-h-0 overflow-auto bg-bg-app outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
          >
            {onlySelected && !selection.occurrenceId ? (
              <p className="px-6 pt-4 text-xs text-text-tertiary">
                «Vis kun valgt scene» er på – velg en scene i listen til venstre. Hele manuset vises
                til da.
              </p>
            ) : null}
            {visibleOcc && shownPages.length === 0 ? (
              <p className="px-6 pt-6 text-[13px] text-text-secondary">
                {showOnlySelected && !state.occurrences[selection.occurrenceId!]?.active
                  ? "Den valgte scenen er deaktivert og står derfor ikke på manussidene. Slå den på i listen for å se den."
                  : "Ingen aktive scener passer med filteret. Deaktiverte scener vises ikke på sidene."}
              </p>
            ) : null}
            <ScriptPageView
              pages={shownPages}
              state={state}
              selection={selection}
              zoom={zoom}
              onSelect={(s) => select(s)}
              onActivate={(s) => {
                select(s);
                setTimeout(() => textRef.current?.focus(), 30);
              }}
            />
          </div>
          <div className="flex min-h-0 flex-col border-l border-border bg-surface-1">
            <Inspector
              state={state}
              productionId={productionId}
              selection={selection}
              editable={editable}
              startPages={pagination.sceneStartPage}
              textRef={textRef}
              run={run}
              onSelect={(s) => select(s, true)}
              onNextUncertain={nextUncertain}
              uncertainCount={uncertainCount}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-base font-medium text-text-primary">
            Ingen scener i «{state.productions[productionId]?.name}» ennå
          </p>
          <p className="max-w-[420px] text-[13px] text-text-secondary">
            Importer manuset som PDF (for eksempel fra Final Draft) eller Word. Du ser en
            forhåndsvisning før noe lagres, og importen kan angres.
          </p>
          {editable ? (
            <Button onClick={() => setImportOpen(true)}>
              <FileUp />
              Importer manus
            </Button>
          ) : null}
        </div>
      )}

      {hasScenes ? (
        <VersionsDialog
          open={versionsOpen}
          onOpenChange={setVersionsOpen}
          projectId={projectId}
          productionId={productionId}
          state={state}
          editable={editable}
          saving={cmds.status.kind === "saving"}
          onGoToScene={(occurrenceId) => {
            if (state.occurrences[occurrenceId]) select({ occurrenceId, blockId: null }, true);
          }}
        />
      ) : null}
      {hasScenes ? (
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          state={state}
          productionId={productionId}
          lockedPages={lockedPages}
        />
      ) : null}
      {editable ? (
        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          projectId={projectId}
          productionId={productionId}
          state={state}
          runAndWait={cmds.runAndWait}
        />
      ) : null}
      {/* Skjult for skjermlesere: varsler om lagring og feil */}
      <span className="sr-only" aria-live="polite">
        {cmds.status.kind === "error" ? cmds.status.message : ""}
      </span>
    </div>
  );
}

function SaveIndicator({ cmds }: { cmds: Commands }) {
  const s = cmds.status;
  if (s.kind === "saving")
    return (
      <span className="flex items-center gap-1 text-xs text-text-tertiary" role="status">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Lagrer …
      </span>
    );
  if (s.kind === "error")
    return (
      <button
        type="button"
        onClick={cmds.clearError}
        className="max-w-[420px] truncate text-left text-xs text-status-danger"
        title={s.message}
        role="alert"
      >
        {s.message}
      </button>
    );
  return <span className="text-xs text-text-tertiary">Lagret</span>;
}
