/**
 * Story Lab (SL3): samtale med én karakter. To moduser: «I rollen» (karakteren svarer, vet bare det
 * knowledgeAt gir) og «Analyse» (analytikeren utenfor rollen). Regi med gyldighet, forgrening og forslag.
 * Turene lagres i økten (appendStoryTurns); regi lagres som turer (ID-en sier gyldigheten), og fjerning
 * av regi som en tom tur «r:<id>». Systemprompten lagres aldri.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GitBranch, Loader2, Send, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ANALYST,
  L,
  activeDirections,
  analystSystemPrompt,
  characterSystemPrompt,
  emptyStoryProfile,
  factsUntil,
  groupTurnMessages,
  knowledgeAt,
  newId,
  profileAt,
  replayTurns,
  type Asset,
  type DirectionScope,
  type ProjectState,
  type StoryProfile,
} from "@/core";
import { generateText } from "@/adapters/ai/text.functions";
import { useLanguage } from "@/app/i18n/language";
import {
  appendStoryTurns,
  createStorySession,
  forkStorySession,
  getStorySession,
  saveStorySuggestion,
  type JsonValue,
  type StoredTurn,
} from "@/adapters/storylab/sessions.functions";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@/app/shell/workspace-chrome";
import { names as nameMap, sceneLabel, usd, useTextEstimate } from "./storylab-data";
import { GroupConversationView } from "./GroupConversationView";
import { SceneLab } from "./SceneLab";
import { SavedSuggestion, useSuggestionSaved } from "./suggestions-data";

const OUT_TOKENS = 800;
type Mode = "role" | "analysis";

interface Ctx {
  assetId: string;
  sceneId: string | null;
  situation: string;
  profile: StoryProfile | null;
}
function ctxOf(c: Record<string, unknown>): Ctx {
  return {
    assetId: String(c["assetId"] ?? ""),
    sceneId: typeof c["sceneId"] === "string" ? c["sceneId"] : null,
    situation: typeof c["situation"] === "string" ? c["situation"] : "",
    profile: (c["profile"] as StoryProfile | null) ?? null,
  };
}

/** Ny økt: karakter, tidspunkt, situasjon og et øyeblikksbilde av profilen. */
export function NewSessionForm({
  state,
  projectId,
  asset,
  sceneId,
  onCreated,
  onCancel,
}: {
  state: ProjectState;
  projectId: string;
  asset: Asset;
  sceneId: string | null;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [situation, setSituation] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const create = useServerFn(createStorySession);
  const qc = useQueryClient();
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const profile = profileAt(state, asset.id, sceneId as never);
      const r = await create({
        data: {
          projectId,
          kind: "character",
          title: L(`Samtale med ${asset.name}`, `Conversation with ${asset.name}`),
          context: { assetId: asset.id, sceneId, situation, profile: profile as unknown as JsonValue },
        },
      });
      if (!r.ok) return setErr(r.message);
      await qc.invalidateQueries({ queryKey: ["story-sessions", projectId] });
      onCreated(r.session.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-xl space-y-3 p-6 text-[13px]" data-testid="storylab-new-session-form">
      <h2 className="text-sm font-medium text-text-primary">{L(`Ny samtale med ${asset.name}`, `New conversation with ${asset.name}`)}</h2>
      <p className="text-text-secondary">
        {L("Tidspunkt", "Point in time")}: {sceneLabel(state, sceneId)}
      </p>
      <label className="block space-y-1">
        <span className="text-text-secondary">{L("Situasjon (valgfritt)", "Situation (optional)")}</span>
        <Textarea rows={3} value={situation} onChange={(e) => setSituation(e.target.value)} data-testid="storylab-situation" />
      </label>
      {err ? (
        <p role="alert" className="text-status-danger">
          {err}
        </p>
      ) : null}
      <div className="flex gap-2">
        <ToolbarButton onClick={onCancel}>{L("Avbryt", "Cancel")}</ToolbarButton>
        <ToolbarButton variant="primary" disabled={busy} onClick={go} data-testid="storylab-session-create">
          {busy ? <Loader2 className="animate-spin" /> : null}
          {L("Start samtalen", "Start the conversation")}
        </ToolbarButton>
      </div>
    </div>
  );
}

export function ConversationView({
  state,
  projectId,
  sessionId,
  editable,
  onOpen,
  onScene,
  onProfile,
}: {
  state: ProjectState;
  projectId: string;
  sessionId: string;
  editable: boolean;
  onOpen: (id: string) => void;
  onScene?: (id: string) => void;
  onProfile?: (id: string) => void;
}) {
  const get = useServerFn(getStorySession);
  const q = useQuery({
    queryKey: ["story-session", projectId, sessionId],
    queryFn: () => get({ data: { projectId, sessionId } }),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  if (q.isLoading || !q.isFetchedAfterMount) return <p className="p-6 text-[13px] text-text-tertiary">{L("Henter økten …", "Loading the session …")}</p>;
  if (!q.data || !q.data.ok)
    return (
      <p role="alert" className="p-6 text-[13px] text-status-danger">
        {q.data && !q.data.ok ? q.data.message : L("Økten kunne ikke hentes.", "The session could not be loaded.")}
      </p>
    );
  if (q.data.session.kind === "scene_analysis" || q.data.session.kind === "scene_improv") {
    const sceneId = q.data.session.context["sceneId"];
    if (typeof sceneId !== "string") return <p role="alert">{L("Økten mangler en scene.", "The session has no scene.")}</p>;
    return <SceneLab key={sessionId} state={state} projectId={projectId} sceneId={sceneId} initialSession={q.data.session} editable={editable} {...(onScene ? { onScene } : {})} {...(onProfile ? { onProfile } : {})} />;
  }
  if (q.data.session.kind === "group")
    return <GroupConversationView state={state} projectId={projectId} session={q.data.session} editable={editable} onOpen={onOpen} />;
  return (
    <Conversation
      state={state}
      projectId={projectId}
      sessionId={sessionId}
      editable={editable}
      onOpen={onOpen}
      initialTurns={q.data.session.turns}
      initialCost={q.data.session.costUsd}
      ctx={ctxOf(q.data.session.context)}
    />
  );
}

function Conversation({
  state,
  projectId,
  sessionId,
  editable,
  onOpen,
  initialTurns,
  initialCost,
  ctx,
}: {
  state: ProjectState;
  projectId: string;
  sessionId: string;
  editable: boolean;
  onOpen: (id: string) => void;
  initialTurns: readonly StoredTurn[];
  initialCost: number;
  ctx: Ctx;
}) {
  const [turns, setTurns] = useState<StoredTurn[]>([...initialTurns]);
  const [cost, setCost] = useState(initialCost);
  const [mode, setMode] = useState<Mode>("role");
  const [text, setText] = useState("");
  const [dirText, setDirText] = useState("");
  const [dirScope, setDirScope] = useState<DirectionScope>("next");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const gen = useServerFn(generateText);
  const append = useServerFn(appendStoryTurns);
  const fork = useServerFn(forkStorySession);
  const suggest = useServerFn(saveStorySuggestion);
  const saved = useSuggestionSaved(projectId);
  const [savedId, setSavedId] = useState<string | null>(null);
  const qc = useQueryClient();

  const asset = state.assets[ctx.assetId];
  const name = asset?.name ?? L("Karakteren", "The character");
  const names = nameMap(state);
  const engine = useMemo(() => replayTurns(ctx.assetId, turns), [ctx.assetId, turns]);
  const directions = activeDirections(engine, ctx.assetId);
  const knowledge = knowledgeAt(state, ctx.assetId, ctx.sceneId as never);
  const profile = ctx.profile ?? profileAt(state, ctx.assetId, ctx.sceneId as never) ?? emptyStoryProfile();
  const replies = turns.filter((t) => t.kind === "line" || t.kind === "analysis").length;
  const language = "nb";
  const uiLang = useLanguage() === "en" ? "en" : "nb";

  const build = (question: string, m: Mode) => {
    const at = new Date().toISOString();
    const qTurn: StoredTurn = { id: newId<"turn">(), speaker: "director", text: question, kind: "question", at, to: ctx.assetId };
    const next = replayTurns(ctx.assetId, [...turns, qTurn]);
    if (m === "role") {
      const system = characterSystemPrompt({
        name,
        profile,
        knowledge,
        situation: ctx.situation,
        directions: activeDirections(next, ctx.assetId),
        language,
        names,
      });
      return { qTurn, system, messages: groupTurnMessages(next, ctx.assetId, names).messages };
    }
    const transcript = turns
      .filter((t) => t.kind === "line" || t.kind === "question")
      .map((t) => `${t.kind === "question" ? "Director" : (names[t.speaker] ?? name)}: ${t.text}`)
      .join("\n");
    const system = analystSystemPrompt({
      characters: [{ name, profile }],
      facts: factsUntil(state, ctx.sceneId).map((f) => ({
        text: f.text,
        kind: f.kind,
        knownBy: f.knownBy.map((k) => names[k.assetId] ?? "?"),
      })),
      sceneContext: ctx.situation,
      language: uiLang,
    });
    return {
      qTurn,
      system,
      messages: [{ role: "user" as const, content: `${transcript ? `# Conversation so far\n${transcript}\n\n` : ""}# Director's question\n${question}` }],
    };
  };

  const preview = build(text || "…", mode);
  const est = useTextEstimate(
    mode === "role" ? "storylab_character" : "storylab_analysis",
    preview.system.length + preview.messages.reduce((n, m) => n + m.content.length, 0),
    OUT_TOKENS,
  );

  const send = async (question: string) => {
    if (!question.trim()) return;
    setBusy(true);
    setErr(null);
    setConfirming(false);
    const m = mode;
    try {
      const b = build(question, m);
      const r = await gen({
        data: {
          projectId,
          task: m === "role" ? "storylab_character" : "storylab_analysis",
          system: b.system,
          messages: b.messages,
          maxTokens: OUT_TOKENS,
        },
      });
      if (!r.ok) {
        setFailed(question);
        return setErr(r.message);
      }
      const reply: StoredTurn = {
        id: newId<"turn">(),
        speaker: m === "role" ? ctx.assetId : ANALYST,
        text: r.text,
        kind: m === "role" ? "line" : "analysis",
        at: new Date().toISOString(),
      };
      const saved = await append({ data: { projectId, sessionId, turns: [b.qTurn, reply], addCostUsd: r.costUsd } });
      if (!saved.ok) {
        setFailed(question);
        return setErr(saved.message);
      }
      setTurns((t) => [...t, b.qTurn, reply]);
      setCost(saved.costUsd);
      qc.setQueryData<Awaited<ReturnType<typeof getStorySession>>>(["story-session", projectId, sessionId], (old) =>
        old?.ok ? { ...old, session: { ...old.session, turns: [...old.session.turns, b.qTurn, reply], costUsd: saved.costUsd } } : old,
      );
      setText("");
      setFailed(null);
      if (r.usedFallback)
        setNote(L("Den innebygde AI-en ble brukt fordi ingen egen tekstleverandør kunne brukes.", "The built-in AI was used because no own text provider could be used."));
      void qc.invalidateQueries({ queryKey: ["story-sessions", projectId] });
    } catch (e) {
      setFailed(question);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const persist = async (t: StoredTurn) => {
    const r = await append({ data: { projectId, sessionId, turns: [t], addCostUsd: 0 } });
    if (!r.ok) return setErr(r.message);
    setTurns((x) => [...x, t]);
    setCost(r.costUsd);
    qc.setQueryData<Awaited<ReturnType<typeof getStorySession>>>(["story-session", projectId, sessionId], (old) =>
      old?.ok ? { ...old, session: { ...old.session, turns: [...old.session.turns, t], costUsd: r.costUsd } } : old,
    );
  };

  const addDirection = () => {
    if (!dirText.trim()) return;
    void persist({ id: `d:${dirScope}:${newId<"direction">()}`, speaker: "director", text: dirText.trim(), kind: "direction", at: new Date().toISOString(), to: ctx.assetId });
    setDirText("");
  };

  const modeOf = (i: number): string => {
    const t = turns[i]!;
    if (t.kind === "analysis") return "analysis";
    if (t.kind === "line") return "role";
    if (t.kind === "direction") return "direction";
    const nxt = turns.slice(i + 1).find((x) => x.kind === "line" || x.kind === "analysis");
    return nxt ? (nxt.kind === "analysis" ? "analysis" : "role") : mode;
  };

  const scopeLabel = (s: DirectionScope) =>
    s === "next" ? L("neste replikk", "next line") : s === "scene" ? L("scenen", "the scene") : L("økten", "the session");

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="storylab-conversation">
      <Toolbar
        title={L(`Samtale med ${name}`, `Conversation with ${name}`)}
        status={
          <span className="text-xs text-text-tertiary" data-testid="storylab-cost">
            {L(`Brukt i økten: ${usd(cost)}`, `Spent in the session: ${usd(cost)}`)}
          </span>
        }
      >
        <ToolbarSeparator />
        <div role="radiogroup" aria-label={L("Modus", "Mode")} className="flex">
          {(["role", "analysis"] as const).map((m) => (
            <ToolbarButton
              key={m}
              role="radio"
              aria-checked={mode === m}
              active={mode === m}
              onClick={() => setMode(m)}
              data-testid={`storylab-mode-${m}`}
            >
              {m === "role" ? L("I rollen", "In character") : L("Analyse", "Analysis")}
            </ToolbarButton>
          ))}
        </div>
        <span className="text-[12px] text-text-tertiary">{sceneLabel(state, ctx.sceneId)}</span>
      </Toolbar>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {ctx.situation ? (
          <p className="text-[12px] text-text-tertiary">
            {L("Situasjon", "Situation")}: {ctx.situation}
          </p>
        ) : null}
        {turns.map((t, i) =>
          t.id.startsWith("r:") ? null : (
            <TurnView
              key={t.id}
              turn={t}
              mode={modeOf(i)}
              speaker={t.speaker === "director" ? L("Regissør", "Director") : t.speaker === ANALYST ? L("Analyse", "Analysis") : (names[t.speaker] ?? name)}
              editable={editable}
              scopeText={t.kind === "direction" ? scopeLabel((/^d:(next|scene|session):/.exec(t.id)?.[1] ?? "session") as DirectionScope) : null}
              onFork={async () => {
                const r = await fork({ data: { projectId, sessionId, fromTurn: i } });
                if (!r.ok) return setErr(r.message);
                qc.setQueryData(["story-session", projectId, r.session.id], r);
                await qc.invalidateQueries({ queryKey: ["story-sessions", projectId] });
                onOpen(r.session.id);
              }}
              onSuggest={async (kind) => {
                const r = await suggest({ data: { projectId, sessionId, turnId: t.id, kind, payload: { text: t.text, speaker: t.speaker, assetId: ctx.assetId, sceneId: ctx.sceneId } } });
                if (r.ok) setSavedId(saved(r.id)); else setNote(r.message);
              }}
            />
          ),
        )}
        {busy ? (
          <p className="flex items-center gap-2 text-[12px] text-text-tertiary">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {mode === "role" ? L(`${name} svarer …`, `${name} is answering …`) : L("Analyserer …", "Analysing …")}
          </p>
        ) : null}
        {err ? (
          <div role="alert" className="rounded-sm border border-status-danger/40 p-2 text-[13px] text-status-danger" data-testid="storylab-error">
            <p>{L("Svaret kunne ikke hentes.", "The reply could not be fetched.")}</p>
            <p className="text-[12px]">{err}</p>
            {failed ? (
              <ToolbarButton onClick={() => void send(failed)} data-testid="storylab-retry">
                {L("Prøv igjen", "Try again")}
              </ToolbarButton>
            ) : null}
          </div>
        ) : null}
        {note ? <p className="text-[12px] text-text-tertiary" data-testid="storylab-note">{note}</p> : null}
        {savedId ? <SavedSuggestion id={savedId} /> : null}
      </div>
      {editable ? (
        <div className="shrink-0 space-y-2 border-t border-border bg-surface-1 p-3">
          <details className="text-[12px]" data-testid="storylab-knowledge">
            <summary className="cursor-pointer text-text-secondary">{L(`Hva vet ${name} nå?`, `What does ${name} know now?`)}</summary>
            <ul className="mt-1 space-y-0.5 text-text-secondary">
              {knowledge.facts.length + knowledge.ownSecrets.length === 0 ? (
                <li className="text-text-tertiary">{L("Ingen registrerte fakta.", "No recorded facts.")}</li>
              ) : null}
              {knowledge.facts.map((f) => (
                <li key={f.id}>• {f.text}</li>
              ))}
              {knowledge.ownSecrets.map((f) => (
                <li key={f.id}>
                  <span className="mr-1 uppercase text-status-warning">{L("Egen hemmelighet", "Own secret")}</span>
                  {f.text}
                </li>
              ))}
            </ul>
          </details>
          <div className="flex flex-wrap items-center gap-1">
            {directions.map((d) => (
              <span key={d.id} className="flex items-center gap-1 rounded-sm bg-surface-3 py-0.5 pl-2 pr-1 text-[12px] text-text-primary" data-testid="storylab-direction" data-scope={d.scope}>
                {d.text} <span className="text-text-tertiary">({scopeLabel(d.scope)})</span>
                <button
                  type="button"
                  aria-label={L(`Fjern regien «${d.text}»`, `Remove the direction “${d.text}”`)}
                  onClick={() => void persist({ id: `r:${d.id}`, speaker: "director", text: "", kind: "direction", at: new Date().toISOString() })}
                  className="rounded-sm p-0.5 text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <Input
              value={dirText}
              onChange={(e) => setDirText(e.target.value)}
              placeholder={L("Regi / tilstand, f.eks. «er bakfull»", "Direction / state, e.g. “is hungover”")}
              aria-label={L("Regi / tilstand", "Direction / state")}
              data-testid="storylab-direction-text"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDirection();
                }
              }}
            />
            <select
              value={dirScope}
              onChange={(e) => setDirScope(e.target.value as DirectionScope)}
              aria-label={L("Gjelder", "Applies to")}
              data-testid="storylab-direction-scope"
              className="h-9 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
            >
              {(["next", "scene", "session"] as const).map((s) => (
                <option key={s} value={s}>
                  {scopeLabel(s)}
                </option>
              ))}
            </select>
            <ToolbarButton onClick={addDirection} disabled={!dirText.trim()} data-testid="storylab-direction-add">
              {L("Legg til regi", "Add direction")}
            </ToolbarButton>
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={mode === "role" ? L(`Si noe til ${name} …`, `Say something to ${name} …`) : L("Spør analytikeren …", "Ask the analyst …")}
              aria-label={L("Melding", "Message")}
              data-testid="storylab-input"
            />
            <ToolbarButton
              variant="primary"
              disabled={busy || !text.trim() || !!est.error}
              data-testid="storylab-send"
              onClick={() => (replies === 0 && !confirming ? setConfirming(true) : void send(text))}
            >
              <Send />
              {L("Send", "Send")}
            </ToolbarButton>
          </div>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-surface-2 p-2 text-[12px]" data-testid="storylab-confirm">
              <span className="text-text-secondary">
                {est.loading
                  ? L("Finner tekst-AI …", "Finding text AI …")
                  : L(`${est.label} · anslått ${usd(est.usd)} per melding`, `${est.label} · estimated ${usd(est.usd)} per message`)}
              </span>
              <ToolbarButton variant="primary" onClick={() => void send(text)} data-testid="storylab-confirm-send">
                {L("Godta og send", "Accept and send")}
              </ToolbarButton>
              <ToolbarButton onClick={() => setConfirming(false)}>{L("Avbryt", "Cancel")}</ToolbarButton>
            </div>
          ) : null}
          {est.error ? <p className="text-[12px] text-status-danger">{est.error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function TurnView({
  turn,
  mode,
  speaker,
  editable,
  scopeText,
  onFork,
  onSuggest,
}: {
  turn: StoredTurn;
  mode: string;
  speaker: string;
  editable: boolean;
  scopeText: string | null;
  onFork: () => void;
  onSuggest: (kind: "line" | "motivation" | "profile_change") => void;
}) {
  const tone =
    mode === "analysis"
      ? "border-l-2 border-status-info bg-surface-2"
      : mode === "direction"
        ? "border-l-2 border-status-warning bg-surface-1 italic"
        : turn.kind === "question"
          ? "border-l-2 border-border-strong bg-surface-1"
          : "border-l-2 border-accent-brand bg-surface-2";
  return (
    <div className={"rounded-sm px-3 py-2 text-[13px] " + tone} data-testid="storylab-turn" data-mode={mode} data-kind={turn.kind} data-turn-id={turn.id} tabIndex={-1}>
      <div className="mb-0.5 flex items-center gap-2 text-[11px] text-text-tertiary">
        <span className="font-medium uppercase tracking-wide">{speaker}</span>
        {mode === "analysis" ? <span>{L("utenfor rollen", "out of character")}</span> : null}
        {scopeText ? <span>({L("regi", "direction")}: {scopeText})</span> : null}
        {editable ? (
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={onFork}
              data-testid="storylab-fork"
              title={L("Forgren herfra (ny økt med turene til og med denne)", "Branch from here (new session with the turns up to this one)")}
              aria-label={L("Forgren herfra", "Branch from here")}
              className="rounded-sm p-0.5 hover:bg-surface-3 hover:text-text-primary"
            >
              <GitBranch className="size-3.5" aria-hidden />
            </button>
            {turn.kind === "line" || turn.kind === "analysis" ? (
              <select
                value=""
                data-testid="storylab-suggest"
                aria-label={L("Lagre som forslag", "Save as suggestion")}
                onChange={(e) => {
                  if (e.target.value) onSuggest(e.target.value as "line");
                }}
                className="h-6 rounded-sm border border-border-control bg-surface-3 px-1 text-[11px] text-text-secondary"
              >
                <option value="">{L("Lagre som forslag …", "Save as suggestion …")}</option>
                <option value="line">{L("Replikk", "Line")}</option>
                <option value="motivation">{L("Motivasjon", "Motivation")}</option>
                <option value="profile_change">{L("Profilendring", "Profile change")}</option>
              </select>
            ) : null}
          </span>
        ) : null}
      </div>
      <p className="whitespace-pre-wrap text-text-primary">{turn.text}</p>
    </div>
  );
}
