/**
 * Story Lab (SL2/SL3): arbeidsflaten. Venstre: karakterer og økter. Midten: karakterflaten eller samtalen.
 * Høyre: kontekst (tidspunkt i fortellingen, hva karakteren vet, relasjoner) og fakta. Panelene kan lukkes
 * og endre bredde. All skriving i prosjektdata går via kommandoene (runCommand → apply_changes).
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PanelLeft, PanelRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  L,
  RELATION_LABEL,
  RELATION_LABEL_EN,
  knowledgeAt,
  locale,
  type Asset,
  type ProjectState,
} from "@/core";
import { listStorySessions } from "@/adapters/storylab/sessions.functions";
import { canEdit, useMembers, useProjectState } from "@/app/project/use-project";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { SaveIndicator } from "@/app/script/ScriptWorkspace";
import { PanelHeader, Toolbar, ToolbarButton, ToolbarSeparator } from "@/app/shell/workspace-chrome";
import { PaneResizer, usePaneSize, useStoredFlag } from "@/app/shell/pane-size";
import { AssetSymbolIcon } from "@/app/library/AssetSymbolIcon";
import { CharacterWorkspace } from "./CharacterWorkspace";
import { ConversationView, NewSessionForm } from "./ConversationView";
import { FactsPanel } from "./FactsPanel";
import { profileStatus, sceneIdFrom, scenesByStoryTime, storyCharacters } from "./storylab-data";

export function StoryLabWorkspace({
  projectId,
  userId,
  initialAssetId,
  initialSceneRef,
}: {
  projectId: string;
  userId: string;
  initialAssetId: string | null;
  initialSceneRef: string | null;
}) {
  const query = useProjectState(projectId);
  const members = useMembers(projectId);
  const editable = canEdit(members.data?.find((m) => m.user_id === userId)?.role);
  const cmds = useCommands(projectId, userId, editable);
  if (query.isLoading)
    return (
      <p className="p-6 text-[13px] text-text-tertiary">
        {L("Henter Story Lab …", "Loading Story Lab …")}
      </p>
    );
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        {L("Story Lab kunne ikke hentes.", "Story Lab could not be loaded.")}
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
    />
  );
}

type View = { kind: "character" } | { kind: "new" } | { kind: "session"; id: string };

function Lab({
  state,
  projectId,
  editable,
  cmds,
  initialAssetId,
  initialSceneRef,
}: {
  state: ProjectState;
  projectId: string;
  editable: boolean;
  cmds: Commands;
  initialAssetId: string | null;
  initialSceneRef: string | null;
}) {
  const characters = storyCharacters(state);
  const [assetId, setAssetId] = useState<string | null>(
    () =>
      (initialAssetId && characters.some((c) => c.id === initialAssetId) ? initialAssetId : null) ??
      characters[0]?.id ??
      null,
  );
  const [sceneId, setSceneId] = useState<string | null>(() => sceneIdFrom(state, initialSceneRef ?? undefined));
  const [view, setView] = useState<View>({ kind: "character" });
  useEffect(() => {
    if (initialAssetId && characters.some((c) => c.id === initialAssetId)) setAssetId(initialAssetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAssetId]);
  useEffect(() => {
    const s = sceneIdFrom(state, initialSceneRef ?? undefined);
    if (s) setSceneId(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSceneRef]);
  const asset = assetId ? state.assets[assetId] : undefined;

  const [leftW, setLeftW] = usePaneSize("storylab-left", 240, 180, 420);
  const [rightW, setRightW] = usePaneSize("storylab-right", 320, 240, 520);
  const [leftClosed, setLeftClosed] = useStoredFlag("storylab-left-closed", false);
  const [rightClosed, setRightClosed] = useStoredFlag("storylab-right-closed", false);

  const list = useServerFn(listStorySessions);
  const sessions = useQuery({
    queryKey: ["story-sessions", projectId],
    queryFn: () => list({ data: { projectId } }),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="storylab">
      <Toolbar title={L("Story Lab", "Story Lab")} status={<SaveIndicator cmds={cmds} />}>
        <ToolbarSeparator />
        <ToolbarButton
          variant="icon"
          active={!leftClosed}
          onClick={() => setLeftClosed(!leftClosed)}
          aria-label={leftClosed ? L("Vis karakterpanelet", "Show the character panel") : L("Skjul karakterpanelet", "Hide the character panel")}
          title={leftClosed ? L("Vis karakterpanelet", "Show the character panel") : L("Skjul karakterpanelet", "Hide the character panel")}
        >
          <PanelLeft />
        </ToolbarButton>
        <ToolbarButton
          variant="icon"
          active={!rightClosed}
          onClick={() => setRightClosed(!rightClosed)}
          aria-label={rightClosed ? L("Vis kontekstpanelet", "Show the context panel") : L("Skjul kontekstpanelet", "Hide the context panel")}
          title={rightClosed ? L("Vis kontekstpanelet", "Show the context panel") : L("Skjul kontekstpanelet", "Hide the context panel")}
        >
          <PanelRight />
        </ToolbarButton>
      </Toolbar>
      <div className="flex min-h-0 flex-1">
        {leftClosed ? null : (
          <aside
            className="relative flex shrink-0 flex-col border-r border-border bg-surface-1"
            style={{ width: leftW }}
          >
            <PaneResizer edge="right" size={leftW} onSize={setLeftW} min={180} max={420} label={L("Bredde på karakterpanelet", "Width of the character panel")} />
            <PanelHeader title={L("Karakterer", "Characters")} count={characters.length} />
            <ul className="min-h-0 flex-1 overflow-y-auto py-1" data-testid="storylab-characters">
              {characters.length === 0 ? (
                <li className="px-3 py-2 text-xs text-text-tertiary">
                  {L(
                    "Ingen karakterer eller dyr i biblioteket ennå.",
                    "No characters or animals in the library yet.",
                  )}
                </li>
              ) : null}
              {characters.map((c) => (
                <CharacterRow
                  key={c.id}
                  state={state}
                  asset={c}
                  selected={c.id === assetId}
                  onPick={() => {
                    setAssetId(c.id);
                    setView({ kind: "character" });
                  }}
                />
              ))}
            </ul>
            <PanelHeader
              title={L("Økter", "Sessions")}
              count={sessions.data && sessions.data.ok ? sessions.data.sessions.length : undefined}
              actions={
                editable && asset ? (
                  <ToolbarButton
                    variant="icon"
                    onClick={() => setView({ kind: "new" })}
                    aria-label={L("Ny økt", "New session")}
                    title={L("Ny økt", "New session")}
                    data-testid="storylab-new-session"
                  >
                    <Plus />
                  </ToolbarButton>
                ) : null
              }
            />
            <ul className="max-h-[40%] min-h-16 overflow-y-auto py-1" data-testid="storylab-sessions">
              {sessions.data && !sessions.data.ok ? (
                <li className="px-3 py-2 text-xs text-status-danger">{sessions.data.message}</li>
              ) : null}
              {sessions.data?.ok && sessions.data.sessions.length === 0 ? (
                <li className="px-3 py-2 text-xs text-text-tertiary">{L("Ingen økter ennå.", "No sessions yet.")}</li>
              ) : null}
              {sessions.data?.ok
                ? sessions.data.sessions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        data-testid="storylab-session"
                        data-session-id={s.id}
                        onClick={() => setView({ kind: "session", id: s.id })}
                        className={
                          "flex w-full flex-col items-start px-3 py-1.5 text-left text-[13px] hover:bg-surface-3 " +
                          (view.kind === "session" && view.id === s.id ? "bg-accent-selection text-text-primary" : "text-text-secondary")
                        }
                      >
                        <span className="w-full truncate">{s.title || L("Uten navn", "Untitled")}</span>
                        <span className="text-[11px] text-text-tertiary">
                          {new Date(s.updatedAt).toLocaleString()}
                          {s.parentSessionId ? ` · ${L("forgrening", "branch")}` : ""}
                        </span>
                      </button>
                    </li>
                  ))
                : null}
            </ul>
          </aside>
        )}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!asset && view.kind !== "session" ? (
            <p className="p-6 text-[13px] text-text-tertiary">
              {L("Velg en karakter til venstre.", "Choose a character on the left.")}
            </p>
          ) : view.kind === "session" ? (
            <ConversationView
              key={view.id}
              state={state}
              projectId={projectId}
              sessionId={view.id}
              editable={editable}
              onOpen={(id) => setView({ kind: "session", id })}
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
        {rightClosed ? null : (
          <aside
            className="relative flex shrink-0 flex-col border-l border-border bg-surface-1"
            style={{ width: rightW }}
          >
            <PaneResizer edge="left" size={rightW} onSize={setRightW} min={240} max={520} label={L("Bredde på kontekstpanelet", "Width of the context panel")} />
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
    </div>
  );
}

function CharacterRow({
  state,
  asset,
  selected,
  onPick,
}: {
  state: ProjectState;
  asset: Asset;
  selected: boolean;
  onPick: () => void;
}) {
  const st = profileStatus(state, asset.id);
  const mark =
    st === "active"
      ? { sign: "●", text: L("Har profil", "Has a profile") }
      : st === "removed"
        ? { sign: "⊘", text: L("Profilen er fjernet", "The profile has been removed") }
        : { sign: "○", text: L("Mangler profil", "No profile yet") };
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
          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-surface-3 " +
          (selected ? "bg-accent-selection text-text-primary" : "text-text-secondary")
        }
      >
        <AssetSymbolIcon state={state} assetId={asset.id} className="size-6 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{asset.name}</span>
        <span
          className={st === "active" ? "text-accent-brand" : "text-text-tertiary"}
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
        {tabBtn("context", L("Kontekst", "Context"))}
        {tabBtn("facts", L("Fakta og hemmeligheter", "Facts and secrets"))}
      </div>
      {tab === "facts" ? (
        <FactsPanel state={state} cmds={cmds} editable={editable} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PanelHeader title={L("Tidspunkt i fortellingen", "Point in the story")} />
          <div className="p-3">
            <select
              data-testid="storylab-time"
              aria-label={L("Tidspunkt i fortellingen", "Point in the story")}
              value={sceneId ?? ""}
              onChange={(e) => onScene(e.target.value || null)}
              className="h-8 w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
            >
              <option value="">{L("Uten tidspunkt", "No point in time")}</option>
              {scenes.map((s) => (
                <option key={s.sceneId} value={s.sceneId}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-text-tertiary">
              {L("Sortert etter fortellingstid.", "Sorted by story time.")}
            </p>
          </div>
          <PanelHeader title={asset ? L(`Hva ${asset.name} vet`, `What ${asset.name} knows`) : L("Kunnskap", "Knowledge")} />
          <div className="p-3 text-[13px]" data-testid="storylab-context-knowledge">
            {!asset || !knowledge ? (
              <p className="text-text-tertiary">{L("Velg en karakter.", "Choose a character.")}</p>
            ) : knowledge.facts.length + knowledge.ownSecrets.length === 0 ? (
              <p className="text-text-tertiary">
                {L("Ingen registrerte fakta på dette tidspunktet.", "No recorded facts at this point.")}
              </p>
            ) : (
              <ul className="space-y-1">
                {knowledge.facts.map((f) => (
                  <li key={f.id} className="text-text-secondary">• {f.text}</li>
                ))}
                {knowledge.ownSecrets.map((f) => (
                  <li key={f.id} className="text-text-secondary">
                    <span className="mr-1 text-[11px] uppercase text-status-warning">{L("Hemmelighet", "Secret")}</span>
                    {f.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <PanelHeader title={L("Relasjoner", "Relationships")} count={relations.length} />
          <ul className="space-y-1 p-3 text-[13px] text-text-secondary">
            {relations.length === 0 ? (
              <li className="text-text-tertiary">{L("Ingen relasjoner.", "No relationships.")}</li>
            ) : null}
            {relations.map((r) => {
              const other = state.assets[r.fromAssetId === asset!.id ? r.toAssetId : r.fromAssetId];
              return (
                <li key={r.id}>
                  <span className="text-text-primary">{other?.name ?? "?"}</span>
                  {` – ${r.label.trim() || (locale() === "en" ? RELATION_LABEL_EN : RELATION_LABEL)[r.kind]}`}
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
