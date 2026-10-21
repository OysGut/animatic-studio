/**
 * Story Lab (SL2/SL3): arbeidsflaten. Venstre: karakterer og økter. Midten: karakterflaten eller samtalen.
 * Høyre: kontekst (tidspunkt i fortellingen, hva karakteren vet, relasjoner) og fakta. Panelene kan lukkes
 * og endre bredde. All skriving i prosjektdata går via kommandoene (runCommand → apply_changes).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LayoutGrid, List, PanelLeft, PanelRight, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RELATION_NAME, knowledgeAt, mainProduction, type Asset, type ProjectState } from "@/core";
import { listStorySessions, setSuggestionStatus, type StorySuggestion } from "@/adapters/storylab/sessions.functions";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { SuggestionsNavigation, suggestionKey, useStorySuggestions } from "./suggestions-data";
import { canEdit, useMembers, useProjectState } from "@/app/project/use-project";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { SaveIndicator } from "@/app/script/ScriptWorkspace";
import { PanelHeader, Toolbar, ToolbarButton, ToolbarSeparator, IconButton } from "@/app/shell/workspace-chrome";
import { PaneResizer, usePaneSize, useStoredFlag } from "@/app/shell/pane-size";
import { AssetThumb, useAssetCovers } from "@/app/library/AssetThumb";
import { CharacterWorkspace } from "./CharacterWorkspace";
import { ConversationView, NewSessionForm } from "./ConversationView";
import { FactsPanel } from "./FactsPanel";
import { NewGroupDialog } from "./NewGroupDialog";
import { SceneLab } from "./SceneLab";
import { LazyCanvasView } from "./canvas/LazyCanvasView";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { profileStatus, sceneIdFrom, scenesByStoryTime, storyCharacters } from "./storylab-data";
import { rememberScene } from "@/app/shell/current-scene";
import { t } from "@/core/i18n/keyed";

export function StoryLabWorkspace({
  projectId,
  userId,
  initialAssetId,
  initialSceneRef,
  initialSuggestions,
  initialSuggestionId,
  initialCanvas,
  initialInterview,
}: {
  projectId: string;
  /** GP4: start intervjuet for et nytt prosjekt med en gang. */
  initialInterview?: boolean;
  userId: string;
  initialCanvas?: boolean;
  initialAssetId: string | null;
  initialSceneRef: string | null;
  initialSuggestions?: boolean;
  initialSuggestionId?: string | null;
}) {
  const query = useProjectState(projectId);
  const members = useMembers(projectId);
  const editable = canEdit(members.data?.find((m) => m.user_id === userId)?.role);
  const qc = useQueryClient();
  const setStatus = useServerFn(setSuggestionStatus);
  const [undoError, setUndoError] = useState<string | null>(null);
  const onUndo = useCallback((group: string | undefined) => {
    const id = group?.startsWith("storylab:") ? group.split(":")[1] : undefined;
    if (!id) return;
    void setStatus({ data: { projectId, suggestionId: id, status: "open" } }).then((r) => {
      if (!r.ok) { setUndoError(r.message); return; }
      qc.setQueryData<StorySuggestion[]>(suggestionKey(projectId), (old) => old?.map((s) => s.id === id ? { ...s, status: "open" } : s));
      qc.setQueryData<Record<string, unknown>>(["story-suggestion-transfers", projectId], (old) => Object.fromEntries(Object.entries(old ?? {}).filter(([key]) => key !== id)));
      void qc.invalidateQueries({ queryKey: suggestionKey(projectId) });
    }).catch(() => setUndoError(t("app-storylab-story-lab-workspace.on-undo.set-undo-error.22b868d4d3b0")));
  }, [projectId, qc, setStatus]);
  const cmds = useCommands(projectId, userId, editable, onUndo);
  if (query.isLoading)
    return (
      <p className="p-6 text-[13px] text-text-tertiary">
        {t("app-storylab-story-lab-workspace.story-lab-workspace.p.08c966d820b5")}
      </p>
    );
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        {t("app-storylab-story-lab-workspace.story-lab-workspace.div.8d6aee233cc4")}
      </div>
    );
  return (
    <Lab
      state={query.data}
      projectId={projectId}
      editable={editable}
      cmds={cmds}
      initialAssetId={initialAssetId}
      initialSceneRef={initialSceneRef}
      initialSuggestions={initialSuggestions ?? false}
      initialSuggestionId={initialSuggestionId ?? null}
      initialCanvas={initialCanvas ?? false}
      initialInterview={initialInterview ?? false}
      undoError={undoError}
    />
  );
}

type View = { kind: "canvas"; interviewId: string | null } | { kind: "character" } | { kind: "new" } | { kind: "scene"; id: string } | { kind: "session"; id: string };

function Lab({
  state,
  projectId,
  editable,
  cmds,
  initialAssetId,
  initialSceneRef,
  initialSuggestions,
  initialSuggestionId,
  initialCanvas,
  initialInterview,
  undoError,
}: {
  initialCanvas: boolean;
  initialInterview: boolean;
  state: ProjectState;
  projectId: string;
  editable: boolean;
  cmds: Commands;
  initialAssetId: string | null;
  initialSceneRef: string | null;
  initialSuggestions: boolean;
  initialSuggestionId: string | null;
  undoError: string | null;
}) {
  const characters = storyCharacters(state);
  const covers = useAssetCovers(state, characters.map((c) => c.id));
  const [assetId, setAssetId] = useState<string | null>(
    () =>
      (initialAssetId && characters.some((c) => c.id === initialAssetId) ? initialAssetId : null) ??
      characters[0]?.id ??
      null,
  );
  const [sceneId, setSceneId] = useState<string | null>(() => sceneIdFrom(state, initialSceneRef ?? undefined));
  useEffect(() => {
    if (!sceneId) return;
    const production = mainProduction(state);
    const occurrence = Object.values(state.occurrences).find((o) => o.active && o.productionId === production?.id && o.sceneId === sceneId);
    if (occurrence) rememberScene(projectId, occurrence.id, occurrence.sceneId);
  }, [projectId, sceneId, state.occurrences, state.productions]);
  const [view, setView] = useState<View>(() => { if (initialCanvas) return { kind: "canvas", interviewId: null }; const id = sceneIdFrom(state, initialSceneRef ?? undefined); return id ? { kind: "scene", id } : { kind: "character" }; });
  const [leftTab, setLeftTab] = useState<"characters" | "scenes" | "suggestions" | "canvas">(initialCanvas ? "canvas" : initialSuggestions ? "suggestions" : initialSceneRef ? "scenes" : "characters");
  const hasScenes = Object.keys(state.scenes).length > 0;
  const openCanvas = (interviewId: string | null) => { setLeftTab("canvas"); setView({ kind: "canvas", interviewId }); };
  const [focusedSuggestion, setFocusedSuggestion] = useState<string | null>(initialSuggestionId);
  const [suggestionScene, setSuggestionScene] = useState<string | null>(initialSuggestions ? initialSceneRef : null);
  const [sourceTurn, setSourceTurn] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const suggestions = useStorySuggestions(projectId);
  useEffect(() => { if (initialSuggestions) { setLeftTab("suggestions"); setSuggestionScene(initialSceneRef); setFocusedSuggestion(initialSuggestionId); } }, [initialSuggestions, initialSuggestionId, initialSceneRef]);
  useEffect(() => {
    const root = mainRef.current;
    if (!root || !sourceTurn) return;
    const reveal = () => {
      const turn = [...root.querySelectorAll<HTMLElement>("[data-turn-id]")].find((el) => el.dataset["turnId"] === sourceTurn);
      if (!turn) return false;
      turn.scrollIntoView({ block: "center" }); turn.focus(); turn.classList.add("ring-1", "ring-accent-brand"); return true;
    };
    if (reveal()) return;
    const observer = new MutationObserver(() => { if (reveal()) observer.disconnect(); });
    observer.observe(root, { childList: true, subtree: true }); return () => observer.disconnect();
  }, [sourceTurn, view]);
  const [newGroup, setNewGroup] = useState(false);
  useEffect(() => {
    if (initialAssetId && characters.some((c) => c.id === initialAssetId)) setAssetId(initialAssetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAssetId]);
  useEffect(() => {
    const s = sceneIdFrom(state, initialSceneRef ?? undefined);
    if (s) { setSceneId(s); setView({ kind: "scene", id: s }); if (!initialSuggestions) setLeftTab("scenes"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSceneRef]);
  const asset = assetId ? state.assets[assetId] : undefined;

  const [leftW, setLeftW] = usePaneSize("storylab-left", 240, 180, 420);
  // U5: rutenett eller liste for karakterene, husket i nettleseren
  const [charGrid, setCharGrid] = useStoredFlag("storylab-characters-grid", false);
  const [rightW, setRightW] = usePaneSize("storylab-right", 320, 240, 520);
  const [leftClosed, setLeftClosed] = useStoredFlag("storylab-left-closed", false);
  const [rightClosed, setRightClosed] = useStoredFlag("storylab-right-closed", false);

  const list = useServerFn(listStorySessions);
  const sessions = useQuery({
    queryKey: ["story-sessions", projectId],
    queryFn: () => list({ data: { projectId } }),
  });

  return (
    <SuggestionsNavigation.Provider value={(id) => { setFocusedSuggestion(id); setSuggestionScene(null); setLeftTab("suggestions"); setLeftClosed(false); }}><div className="flex min-h-0 flex-1 flex-col" data-testid="storylab">
      {undoError ? <p role="alert" className="p-2 text-xs text-status-danger">{undoError}</p> : null}
      <Toolbar title={t("app-storylab-story-lab-workspace.lab.title.1bac86c16bc1")} status={<SaveIndicator cmds={cmds} />}>
        <ToolbarSeparator />
        <IconButton
          active={!leftClosed}
          onClick={() => setLeftClosed(!leftClosed)}
          label={leftClosed ? t("app-storylab-story-lab-workspace.lab.label.ac091583c03e") : t("app-storylab-story-lab-workspace.lab.label.40fd042d0c32")}
          title={leftClosed ? t("app-storylab-story-lab-workspace.lab.title.ac091583c03e") : t("app-storylab-story-lab-workspace.lab.title.40fd042d0c32")}
        >
          <PanelLeft />
        </IconButton>
        <IconButton
          active={!rightClosed}
          onClick={() => setRightClosed(!rightClosed)}
          label={rightClosed ? t("app-storylab-story-lab-workspace.lab.label.6e808c792db8") : t("app-storylab-story-lab-workspace.lab.label.b77acb5594ee")}
          title={rightClosed ? t("app-storylab-story-lab-workspace.lab.title.6e808c792db8") : t("app-storylab-story-lab-workspace.lab.title.b77acb5594ee")}
        >
          <PanelRight />
        </IconButton>
      </Toolbar>
      <div className="flex min-h-0 flex-1">
        {leftClosed ? null : (
          <aside
            className="relative flex shrink-0 flex-col border-r border-border bg-surface-1"
            style={{ width: leftW }}
          >
            <PaneResizer edge="right" size={leftW} onSize={setLeftW} min={180} max={420} label={t("app-storylab-story-lab-workspace.lab.label.f17aee671d92")} />
            <div role="tablist" className="flex flex-wrap border-b border-border"><ToolbarButton role="tab" aria-selected={leftTab === "characters"} active={leftTab === "characters"} onClick={() => setLeftTab("characters")}>{t("app-storylab-story-lab-workspace.lab.toolbar-button.f2f4c763c8aa")}</ToolbarButton><ToolbarButton role="tab" data-testid="storylab-tab-scenes" aria-selected={leftTab === "scenes"} active={leftTab === "scenes"} onClick={() => setLeftTab("scenes")}>{t("app-storylab-story-lab-workspace.lab.toolbar-button.249c91432f61")}</ToolbarButton><ToolbarButton role="tab" data-testid="storylab-tab-suggestions" aria-selected={leftTab === "suggestions"} active={leftTab === "suggestions"} onClick={() => { setLeftTab("suggestions"); setSuggestionScene(null); }}>{t("app-storylab-story-lab-workspace.lab.toolbar-button.d51198b5c9f6", { value1: String(suggestions.data?.filter((s) => s.status === "open").length ?? 0) })}</ToolbarButton><ToolbarButton role="tab" data-testid="storylab-tab-canvas" aria-selected={leftTab === "canvas"} active={leftTab === "canvas"} onClick={() => openCanvas(view.kind === "canvas" ? view.interviewId : null)}>{t("app-storylab-story-lab-workspace.lab.toolbar-button.ededc41881b9")}</ToolbarButton></div>
            {leftTab === "canvas" ? <div className="min-h-0 flex-1 overflow-y-auto p-3 text-[12px] text-text-secondary" data-testid="storylab-canvas-tab"><p>{t("app-storylab-story-lab-workspace.lab.p.b94805adb8ce")}</p>{editable ? <ToolbarButton className="mt-2" data-testid="storylab-new-interview-tab" onClick={() => openCanvas(null)}>{t("app-storylab-story-lab-workspace.lab.toolbar-button.3851eb3c0d15")}</ToolbarButton> : null}</div> : leftTab === "suggestions" ? <SuggestionsPanel state={state} projectId={projectId} cmds={cmds} editable={editable} focusedId={focusedSuggestion} sceneFilter={suggestionScene} onSource={(id, turnId) => { setView({ kind: "session", id }); setSourceTurn(turnId); }} /> : leftTab === "scenes" ? <ul className="min-h-0 flex-1 overflow-y-auto py-1" data-testid="storylab-scenes">{scenesByStoryTime(state).map((s) => <li key={s.sceneId}><ToolbarButton className="w-full justify-start" active={view.kind === "scene" && view.id === s.sceneId} data-testid="storylab-scene" data-scene-id={s.sceneId} onClick={() => { setSceneId(s.sceneId); setView({ kind: "scene", id: s.sceneId }); }}>{s.label}</ToolbarButton></li>)}</ul> : <><PanelHeader title={t("app-storylab-story-lab-workspace.lab.title.f2f4c763c8aa")} count={characters.length} actions={<IconButton data-testid="storylab-view-toggle" aria-pressed={charGrid} label={charGrid ? t("app-storylab-story-lab-workspace.lab.label.ea191768e024") : t("app-storylab-story-lab-workspace.lab.label.704c241ec475")} onClick={() => setCharGrid(!charGrid)}>{charGrid ? <List /> : <LayoutGrid />}</IconButton>} />
            <ul className={"min-h-0 flex-1 overflow-y-auto py-1" + (charGrid ? " grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1 px-1" : "")} data-testid="storylab-characters" data-view={charGrid ? "grid" : "list"}>
              {characters.length === 0 ? (
                <li className="px-3 py-2 text-xs text-text-tertiary">
                  {t("app-storylab-story-lab-workspace.lab.li.bdf4893711b8")}
                </li>
              ) : null}
              {characters.map((c) => (
                <CharacterRow
                  key={c.id}
                  state={state}
                  asset={c}
                  selected={c.id === assetId}
                  url={covers[c.id]}
                  grid={charGrid}
                  onPick={() => {
                    setAssetId(c.id);
                    setView({ kind: "character" });
                  }}
                />
              ))}
            </ul></>}
            <PanelHeader
              title={t("app-storylab-story-lab-workspace.lab.title.7ac108fdeec0")}
              count={sessions.data && sessions.data.ok ? sessions.data.sessions.length : undefined}
              actions={
                editable ? (
                  <DropdownMenu>
                  <DropdownMenuTrigger asChild><IconButton
                    label={t("app-storylab-story-lab-workspace.lab.label.6c2f6a706ea6")}
                    title={t("app-storylab-story-lab-workspace.lab.title.6c2f6a706ea6")}
                    data-testid="storylab-new-session"
                  >
                    <Plus data-testid="storylab-new-menu" />
                  </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => openCanvas(null)} data-testid="storylab-new-interview">{t("app-storylab-story-lab-workspace.lab.dropdown-menu-item.3851eb3c0d15")}</DropdownMenuItem>
                    {asset ? <DropdownMenuItem onSelect={() => setView({ kind: "new" })} data-testid="storylab-new-character">{t("app-storylab-story-lab-workspace.lab.dropdown-menu-item.6343c2cf3f24")}</DropdownMenuItem> : null}
                    <DropdownMenuItem onSelect={() => setNewGroup(true)} data-testid="storylab-new-group">{t("app-storylab-story-lab-workspace.lab.dropdown-menu-item.862f5b244068")}</DropdownMenuItem>
                  </DropdownMenuContent>
                  </DropdownMenu>
                ) : null
              }
            />
            <ul className="max-h-[40%] min-h-16 overflow-y-auto py-1" data-testid="storylab-sessions">
              {sessions.data && !sessions.data.ok ? (
                <li className="px-3 py-2 text-xs text-status-danger">{sessions.data.message}</li>
              ) : null}
              {sessions.data?.ok && sessions.data.sessions.length === 0 ? (
                <li className="px-3 py-2 text-xs text-text-tertiary">{t("app-storylab-story-lab-workspace.lab.li.3497120bae58")}</li>
              ) : null}
              {sessions.data?.ok
                ? sessions.data.sessions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        data-testid="storylab-session"
                        data-session-id={s.id}
                        onClick={() => (s.kind === "interview" ? openCanvas(s.id) : setView({ kind: "session", id: s.id }))}
                        className={
                          "flex w-full flex-col items-start px-3 py-1.5 text-left text-[13px] hover:bg-surface-3 " +
                          ((view.kind === "session" && view.id === s.id) || (view.kind === "canvas" && view.interviewId === s.id) ? "bg-accent-selection text-text-primary" : "text-text-secondary")
                        }
                      >
                        <span className="w-full truncate">{s.title || t("app-storylab-story-lab-workspace.lab.span.45e6c13282a2")}</span>
                        <span className="text-[11px] text-text-tertiary">
                          {new Date(s.updatedAt).toLocaleString()}
                          {s.parentSessionId ? ` · ${t("app-storylab-story-lab-workspace.lab.span.fab8322cdbca")}` : ""}
                        </span>
                      </button>
                    </li>
                  ))
                : null}
            </ul>
          </aside>
        )}
        <main ref={mainRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {view.kind === "canvas" ? <LazyCanvasView state={state} projectId={projectId} cmds={cmds} editable={editable} interviewId={view.interviewId} startInterview={initialInterview}
            onInterview={(id) => setView({ kind: "canvas", interviewId: id })}
            onOpenAsset={(id) => { setAssetId(id); setLeftTab("characters"); setView({ kind: "character" }); }}
            onOpenScene={(id) => { setSceneId(id); setLeftTab("scenes"); setView({ kind: "scene", id }); }} /> : view.kind === "scene" ? <SceneLab key={view.id} state={state} projectId={projectId} sceneId={view.id} editable={editable} onScene={setSceneId} onProfile={(id) => { setAssetId(id); setView({ kind: "character" }); }} /> : !asset && view.kind !== "session" ? (
            <div className="space-y-3 p-6 text-[13px] text-text-tertiary">
              <p>{t("app-storylab-story-lab-workspace.lab.p.7c25342a96e1")}</p>
              {!hasScenes && editable ? (
                <div className="max-w-md rounded-sm border border-border bg-surface-2 p-3 text-text-secondary" data-testid="storylab-interview-suggestion">
                  <p>{t("app-storylab-story-lab-workspace.lab.p.ab8137971870")}</p>
                  <ToolbarButton variant="primary" className="mt-2" onClick={() => openCanvas(null)}>{t("app-storylab-story-lab-workspace.lab.toolbar-button.3851eb3c0d15.2")}</ToolbarButton>
                </div>
              ) : null}
            </div>
          ) : view.kind === "session" ? (
            <ConversationView
              key={view.id}
              state={state}
              projectId={projectId}
              sessionId={view.id}
              editable={editable}
              onOpen={(id) => setView({ kind: "session", id })}
              onScene={setSceneId}
              onProfile={(id) => { setAssetId(id); setView({ kind: "character" }); }}
            />
          ) : view.kind === "new" && asset ? (
            <NewSessionForm
              state={state}
              projectId={projectId}
              asset={asset}
              sceneId={sceneId}
              onCancel={() => setView({ kind: "character" })}
              onCreated={(id) => setView({ kind: "session", id })}
            />
          ) : asset ? (
            <CharacterWorkspace
              key={asset.id}
              state={state}
              projectId={projectId}
              asset={asset}
              cmds={cmds}
              editable={editable}
              onTalk={() => setView({ kind: "new" })}
            />
          ) : null}
        </main>
        {rightClosed || view.kind === "canvas" ? null : (
          <aside
            className="relative flex shrink-0 flex-col border-l border-border bg-surface-1"
            style={{ width: rightW }}
          >
            <PaneResizer edge="left" size={rightW} onSize={setRightW} min={240} max={520} label={t("app-storylab-story-lab-workspace.lab.label.2f237e0e5295")} />
            <ContextPanel
              state={state}
              asset={asset}
              sceneId={sceneId}
              onScene={setSceneId}
              cmds={cmds}
              editable={editable}
            />
          </aside>
        )}
      </div>
      {newGroup ? <NewGroupDialog state={state} projectId={projectId} initialSceneId={sceneId}
        onClose={() => setNewGroup(false)} onCreated={(id) => { setNewGroup(false); setView({ kind: "session", id }); }} /> : null}
    </div></SuggestionsNavigation.Provider>
  );
}

function CharacterRow({
  state,
  asset,
  selected,
  onPick,
  url,
  grid,
}: {
  state: ProjectState;
  asset: Asset;
  selected: boolean;
  onPick: () => void;
  url?: string | undefined;
  grid?: boolean;
}) {
  const st = profileStatus(state, asset.id);
  const mark =
    st === "active"
      ? { sign: "●", text: t("app-storylab-story-lab-workspace.text.text.b7a167e8dee0") }
      : st === "removed"
        ? { sign: "⊘", text: t("app-storylab-story-lab-workspace.text.text.64c415bdd29a") }
        : { sign: "○", text: t("app-storylab-story-lab-workspace.text.text.6a60ace15222") };
  return (
    <li>
      <button
        type="button"
        data-testid="storylab-character"
        data-asset-id={asset.id}
        data-profile={st}
        aria-current={selected ? "true" : undefined}
        onClick={onPick}
        className={
          (grid
            ? "relative flex w-full flex-col items-stretch gap-1 rounded-sm p-1 text-left text-[12px] hover:bg-surface-3 "
            : "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-surface-3 ") +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
          (selected ? "bg-accent-selection text-text-primary" : "text-text-secondary")
        }
      >
        <AssetThumb state={state} assetId={asset.id} url={url} size={grid ? "lg" : "md"} />
        <span className={grid ? "min-w-0 truncate pr-4" : "min-w-0 flex-1 truncate"}>{asset.name}</span>
        <span
          className={(grid ? "absolute right-1.5 top-1.5 " : "") + (st === "active" ? "text-accent-brand" : "text-text-tertiary")}
          title={mark.text}
          aria-label={mark.text}
        >
          {mark.sign}
        </span>
      </button>
    </li>
  );
}

function ContextPanel({
  state,
  asset,
  sceneId,
  onScene,
  cmds,
  editable,
}: {
  state: ProjectState;
  asset: Asset | undefined;
  sceneId: string | null;
  onScene: (id: string | null) => void;
  cmds: Commands;
  editable: boolean;
}) {
  const [tab, setTab] = useState<"context" | "facts">("context");
  const scenes = useMemo(() => scenesByStoryTime(state), [state]);
  const knowledge = asset ? knowledgeAt(state, asset.id, sceneId as never) : null;
  const relations = asset
    ? Object.values(state.assetRelations).filter(
        (r) => !r.removed && r.status === "approved" && (r.fromAssetId === asset.id || r.toAssetId === asset.id),
      )
    : [];
  const tabBtn = (id: "context" | "facts", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      data-testid={`storylab-tab-${id}`}
      className={
        "relative h-8 px-3 text-[12px] " +
        (tab === id
          ? "font-medium text-text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent-brand"
          : "text-text-secondary hover:text-text-primary")
      }
    >
      {label}
    </button>
  );
  return (
    <>
      <div role="tablist" className="flex shrink-0 border-b border-border bg-surface-2">
        {tabBtn("context", t("app-storylab-story-lab-workspace.context-panel.tab-btn.2875f255e8ce"))}
        {tabBtn("facts", t("app-storylab-story-lab-workspace.context-panel.tab-btn.4a2bf9410da2"))}
      </div>
      {tab === "facts" ? (
        <FactsPanel state={state} cmds={cmds} editable={editable} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PanelHeader title={t("app-storylab-story-lab-workspace.context-panel.title.b24bdc22ae0b")} />
          <div className="p-3">
            <select
              data-testid="storylab-time"
              aria-label={t("app-storylab-story-lab-workspace.context-panel.aria-label.b24bdc22ae0b")}
              value={sceneId ?? ""}
              onChange={(e) => onScene(e.target.value || null)}
              className="h-8 w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
            >
              <option value="">{t("app-storylab-story-lab-workspace.context-panel.option.985e5369a714")}</option>
              {scenes.map((s) => (
                <option key={s.sceneId} value={s.sceneId}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-text-tertiary">
              {t("app-storylab-story-lab-workspace.context-panel.p.65138ead728f")}
            </p>
          </div>
          <PanelHeader title={asset ? t("app-storylab-story-lab-workspace.context-panel.title.82579b9559bf", { name: String(asset.name) }) : t("app-storylab-story-lab-workspace.context-panel.title.22ca649fc97b")} />
          <div className="p-3 text-[13px]" data-testid="storylab-context-knowledge">
            {!asset || !knowledge ? (
              <p className="text-text-tertiary">{t("app-storylab-story-lab-workspace.context-panel.p.c30dd57b4e9e")}</p>
            ) : knowledge.facts.length + knowledge.ownSecrets.length === 0 ? (
              <p className="text-text-tertiary">
                {t("app-storylab-story-lab-workspace.context-panel.p.3177f9ca1c14")}
              </p>
            ) : (
              <ul className="space-y-1">
                {knowledge.facts.map((f) => (
                  <li key={f.id} className="text-text-secondary">• {f.text}</li>
                ))}
                {knowledge.ownSecrets.map((f) => (
                  <li key={f.id} className="text-text-secondary">
                    <span className="mr-1 text-chrome-label uppercase text-status-warning">{t("app-storylab-story-lab-workspace.context-panel.span.d625352fcb0b")}</span>
                    {f.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <PanelHeader title={t("app-storylab-story-lab-workspace.context-panel.title.1621e71bdd6a")} count={relations.length} />
          <ul className="space-y-1 p-3 text-[13px] text-text-secondary">
            {relations.length === 0 ? (
              <li className="text-text-tertiary">{t("app-storylab-story-lab-workspace.context-panel.li.1baf8ff22e81")}</li>
            ) : null}
            {relations.map((r) => {
              const other = state.assets[r.fromAssetId === asset!.id ? r.toAssetId : r.fromAssetId];
              return (
                <li key={r.id}>
                  <span className="text-text-primary">{other?.name ?? "?"}</span>
                  {` – ${r.label.trim() || RELATION_NAME[r.kind]}`}
                  {r.description ? <p className="text-[12px] text-text-tertiary">{r.description}</p> : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
