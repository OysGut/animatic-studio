/** SL4: brukerstartede, sekvensielle grupperunder. Hver replikk lagres før neste AI-kall. */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GitBranch, Pause, Play, Square, X } from "lucide-react";
import { ANALYST, activeDirections, analystSystemPrompt, characterSystemPrompt, emptyStoryProfile, factsUntil, groupTurnMessages, knowledgeAt, newId, reduceEngine, replayTurns, suggestSpeaker, type DirectionScope, type EngineMode, type ProjectState, type StoryProfile } from "@/core";
import { useLanguage } from "@/app/i18n/language";
import { generateText } from "@/adapters/ai/text.functions";
import { appendStoryTurns, forkStorySession, getStorySession, saveStorySuggestion,
  type StoredTurn, type StorySession, type StorySessionStatus } from "@/adapters/storylab/sessions.functions";
import { Toolbar, ToolbarButton, IconButton } from "@/app/shell/workspace-chrome";
import { AssetThumb, useAssetCovers } from "@/app/library/AssetThumb";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { names as nameMap, sceneLabel, usd, useTextEstimate } from "./storylab-data";
import { SavedSuggestion, useSuggestionSaved } from "./suggestions-data";
import { t as tk } from "@/core/i18n/keyed";

const OUT_TOKENS = 800;
const tones = ["border-accent-brand", "border-status-success", "border-status-moved", "border-status-discrepancy", "border-status-running", "border-status-uncertain"];

export function GroupConversationView({ state, projectId, session, editable, onOpen, onUpdate, onBusy }: {
  state: ProjectState; projectId: string; session: StorySession; editable: boolean; onOpen: (id: string) => void; onUpdate?: (session: StorySession) => void; onBusy?: (busy: boolean) => void;
}) {
  const raw = session.context;
  const participants = Array.isArray(raw["participants"]) ? raw["participants"].filter((id): id is string =>
    typeof id === "string" && (state.assets[id]?.kind === "character" || state.assets[id]?.kind === "animal")) : [];
  if (participants.length < 2 || participants.length > 6 || new Set(participants).size !== participants.length)
    return <p role="alert" className="p-4 text-status-danger">{tk("app-storylab-group-conversation-view.group-conversation-view.p.f7ef42db81ff")}</p>;
  return <GroupConversation key={session.id} state={state} projectId={projectId} session={session} participants={participants} editable={editable} onOpen={onOpen} {...(onUpdate ? { onUpdate } : {})} {...(onBusy ? { onBusy } : {})} />;
}

function GroupConversation({ state, projectId, session, participants, editable, onOpen, onUpdate, onBusy }: {
  state: ProjectState; projectId: string; session: StorySession; participants: string[]; editable: boolean; onOpen: (id: string) => void; onUpdate?: (session: StorySession) => void; onBusy?: (busy: boolean) => void;
}) {
  const sceneId = typeof session.context["sceneId"] === "string" ? session.context["sceneId"] : null;
  const covers = useAssetCovers(state, participants);
  const situation = typeof session.context["situation"] === "string" ? session.context["situation"] : "";
  const seed = typeof session.context["seed"] === "number" ? session.context["seed"] : 1;
  const profiles = (session.context["profiles"] ?? {}) as Record<string, StoryProfile | null>;
  const names = nameMap(state);
  const uiLang = useLanguage() === "en" ? "en" : "nb";
  const [mode, setMode] = useState<EngineMode>(session.context["mode"] === "improv" ? "improv" : "qa");
  const [turns, setTurns] = useState<StoredTurn[]>(session.turns);
  const turnsRef = useRef(turns);
  const [cost, setCost] = useState(session.costUsd);
  const [status, setStatus] = useState<StorySessionStatus>(session.status);
  const statusRef = useRef(status);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const halt = useRef<"pause" | "stop" | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; halt.current = "pause"; }; }, []);
  const [next, setNext] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState(false);
  const [text, setText] = useState("");
  const [direction, setDirection] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [scope, setScope] = useState<DirectionScope>("next");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [batchApproved, setBatchApproved] = useState(false);
  const retry = useRef<(() => Promise<void>) | null>(null);
  const pendingSave = useRef<{ turns: StoredTurn[]; costUsd: number } | null>(null);
  const serviceError = useRef<string | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "qa" | "batch" | "analysis"; question?: string; focus?: string }>(null);
  const append = useServerFn(appendStoryTurns);
  const gen = useServerFn(generateText);
  const fork = useServerFn(forkStorySession);
  const suggest = useServerFn(saveStorySuggestion);
  const saved = useSuggestionSaved(projectId);
  const [savedId, setSavedId] = useState<string | null>(null);
  const qc = useQueryClient();
  const engineOf = (ts: readonly StoredTurn[]) => replayTurns({ participants, mode, seed }, ts);
  const engine = reduceEngine(engineOf(turns), { type: "nextSpeaker", assetId: next });
  const speaker = suggestSpeaker(engine, names) ?? participants[0] ?? "";
  const knowledge = knowledgeAt(state, speaker, sceneId as never);
  const directions = engine.directions;
  const locked = !editable || status === "stopped" || status === "archived";

  const characterInput = (id: string, ts: readonly StoredTurn[]) => {
    const e = engineOf(ts);
    return {
      system: characterSystemPrompt({ name: names[id] ?? "?", profile: profiles[id] ?? emptyStoryProfile(),
        knowledge: knowledgeAt(state, id, sceneId as never), situation, directions: activeDirections(e, id), language: "nb", names }),
      messages: groupTurnMessages(e, id, names).messages,
    };
  };
  const analysisInput = (question: string, focus?: string) => ({
    system: analystSystemPrompt({ characters: participants.map((id) => ({ name: names[id] ?? "?", profile: profiles[id] ?? null })),
      facts: factsUntil(state, sceneId).map((f) => ({ text: f.text, kind: f.kind, knownBy: f.knownBy.map((k) => names[k.assetId] ?? "?") })),
      sceneContext: situation, language: uiLang, ...(focus ? { focus: names[focus] ?? "?" } : {}) }) +
      (focus ? "\nExplain this character's motivation from the profile, in the third person. Separate interpretation from established facts." : ""),
    messages: [{ role: "user" as const, content: turnsRef.current.filter((t) => t.kind === "line" || t.kind === "question")
      .map((t) => `${names[t.speaker] ?? "Director"}: ${t.text}`).join("\n") + `\nDirector's question: ${question}` }],
  });
  const p = confirm?.kind === "analysis" || analysis ? analysisInput(confirm?.question ?? text, confirm?.focus) : characterInput(speaker, turns);
  const est = useTextEstimate(confirm?.kind === "analysis" || analysis ? "storylab_analysis" : "storylab_group",
    p.system.length + p.messages.reduce((n, m) => n + m.content.length, 0) + text.length, OUT_TOKENS);

  const save = async (added: StoredTurn[], addCostUsd = 0, newStatus?: StorySessionStatus) => {
    const r = await append({ data: { projectId, sessionId: session.id, turns: added, addCostUsd, ...(newStatus ? { status: newStatus } : {}) } });
    if (!r.ok) { serviceError.current = r.message; throw new Error("Session save failed"); }
    const known = new Set(turnsRef.current.map((t) => t.id));
    turnsRef.current = [...turnsRef.current, ...added.filter((t) => !known.has(t.id))];
    if (mounted.current) { setTurns(turnsRef.current); setCost(r.costUsd); }
    if (newStatus) { statusRef.current = newStatus; if (mounted.current) setStatus(newStatus); }
    qc.setQueryData<Awaited<ReturnType<typeof getStorySession>>>(["story-session", projectId, session.id], (old) =>
      ({ ok: true, session: { ...(old?.ok ? old.session : session), turns: turnsRef.current, costUsd: r.costUsd, status: statusRef.current } }));
    onUpdate?.({ ...session, turns: turnsRef.current, costUsd: r.costUsd, status: statusRef.current });
    void qc.invalidateQueries({ queryKey: ["story-sessions", projectId] });
  };
  const withLock = async (action: () => Promise<void>) => {
    if (working.current || locked) return;
    working.current = true; setBusy(true); onBusy?.(true); setError(null); halt.current = null; serviceError.current = null; retry.current = action;
    try {
      const pending = pendingSave.current;
      if (pending) { await save(pending.turns, pending.costUsd, "paused"); pendingSave.current = null; }
      else await action();
    }
    catch {
      const message = serviceError.current ?? tk("app-storylab-group-conversation-view.message.message.e2736ee2d835");
      const stopped = halt.current === "stop";
      try { await save([], 0, stopped ? "stopped" : "paused"); } catch { /* Meldingen vises; ingen nye AI-kall startes. */ }
      if (mounted.current) setError(message);
    }
    finally { working.current = false; if (mounted.current) { setBusy(false); onBusy?.(false); } }
  };
  const oneLine = async (ts: readonly StoredTurn[], chosen: string | null, added: StoredTurn[] = []) => {
    const e = reduceEngine(engineOf(ts), { type: "nextSpeaker", assetId: chosen });
    const id = suggestSpeaker(e, names);
    if (!id) throw new Error("No speaker");
    const r = await gen({ data: { projectId, task: "storylab_group", ...characterInput(id, ts), maxTokens: OUT_TOKENS } });
    if (!r.ok) { serviceError.current = r.message; throw new Error("Generation failed"); }
    const turn: StoredTurn = { id: newId<"turn">(), speaker: id, kind: "line", text: r.text, at: new Date().toISOString() };
    pendingSave.current = { turns: [...added, turn], costUsd: r.costUsd };
    await save(pendingSave.current.turns, r.costUsd);
    pendingSave.current = null;
    if (mounted.current) {
      setNext(null);
      if (r.usedFallback) setNote(tk("app-storylab-group-conversation-view.one-line.set-note.ac3e312ff8d9"));
    }
  };
  const finish = async (fallback: StorySessionStatus) => {
    await save([], 0, halt.current === "stop" ? "stopped" : halt.current === "pause" || !mounted.current ? "paused" : fallback);
  };
  const batch = () => withLock(async () => {
    await save([], 0, "active");
    for (let i = 0; i < 8; i++) {
      if (halt.current || !mounted.current) break;
      await oneLine(turnsRef.current, i === 0 ? next : null);
    }
    await finish("paused");
  });
  const ask = (question: string) => withLock(async () => {
    const q: StoredTurn = { id: newId<"turn">(), speaker: "director", kind: "question", text: question, to: next, at: new Date().toISOString() };
    await oneLine([...turnsRef.current, q], next, [q]);
    setText("");
    await finish(statusRef.current);
  });
  const analyse = (question: string, focus?: string) => withLock(async () => {
    const r = await gen({ data: { projectId, task: "storylab_analysis", ...analysisInput(question, focus), maxTokens: OUT_TOKENS } });
    if (!r.ok) { serviceError.current = r.message; throw new Error("Analysis failed"); }
    pendingSave.current = { turns: [{ id: newId<"turn">(), speaker: ANALYST, text: r.text, kind: "analysis", to: focus ?? null, at: new Date().toISOString() }], costUsd: r.costUsd };
    await save(pendingSave.current.turns, r.costUsd);
    pendingSave.current = null;
    setText("");
    if (r.usedFallback) setNote(tk("app-storylab-group-conversation-view.analyse.set-note.59c1e8919bad"));
    await finish(statusRef.current);
  });
  const execute = (action: NonNullable<typeof confirm>) => {
    setConfirm(null);
    if (action.kind === "batch") void batch();
    else if (action.kind === "analysis") void analyse(action.question ?? "", action.focus);
    else void ask(action.question ?? "");
  };
  const request = (action: NonNullable<typeof confirm>) => {
    if (locked || busy) return;
    if (!approved || (action.kind === "batch" && !batchApproved)) setConfirm(action); else execute(action);
  };
  const pauseOrStop = (stop: boolean) => {
    halt.current = stop ? "stop" : "pause";
    if (!working.current) void withLock(async () => { await save([], 0, stop ? "stopped" : "paused"); });
  };
  const persistDirection = (turn: StoredTurn) => void withLock(async () => { await save([turn]); });

  return <div className="flex min-h-0 flex-1 flex-col" data-testid="storylab-group">
    <Toolbar title={session.title || tk("app-storylab-group-conversation-view.group-conversation.title.932104100a24")} status={<span className="text-xs text-text-tertiary" data-testid="storylab-cost">{tk("app-storylab-group-conversation-view.group-conversation.span.9020483225c4", { value1: String(usd(cost)) })}</span>}>
      <div role="radiogroup" aria-label={tk("app-storylab-group-conversation-view.group-conversation.aria-label.87c173dd984a")} className="flex flex-wrap">
        {(["qa", "improv"] as const).map((m) => <ToolbarButton key={m} role="radio" aria-checked={m === mode} active={m === mode}
          disabled={busy || locked} data-testid={`storylab-group-mode-${m}`} onClick={() => setMode(m)}>{m === "qa" ? tk("app-storylab-group-conversation-view.group-conversation.toolbar-button.83da90780369") : tk("app-storylab-group-conversation-view.group-conversation.toolbar-button.10152ec2e5a4")}</ToolbarButton>)}
      </div>
      <span className="text-xs text-text-tertiary" role="status" data-testid="storylab-group-status">{status === "stopped" || status === "archived" ? tk("app-storylab-group-conversation-view.group-conversation.span.e2f97b3b37fd") : busy ? tk("app-storylab-group-conversation-view.group-conversation.span.64b6963bb82c") : status === "paused" ? tk("app-storylab-group-conversation-view.group-conversation.span.1dcf9c0e9b72") : tk("app-storylab-group-conversation-view.group-conversation.span.35625c18fe5d")}</span>
      <ToolbarButton disabled={locked || !busy} onClick={() => pauseOrStop(false)} data-testid="storylab-pause"><Pause />{tk("app-storylab-group-conversation-view.group-conversation.toolbar-button.553fee10a2dc")}</ToolbarButton>
      <ToolbarButton disabled={locked || busy || status !== "paused"} onClick={() => mode === "improv" ? request({ kind: "batch" }) : void withLock(async () => { await save([], 0, "active"); })} data-testid="storylab-resume"><Play />{tk("app-storylab-group-conversation-view.group-conversation.toolbar-button.91fb8f7ee591")}</ToolbarButton>
      <ToolbarButton disabled={locked} onClick={() => pauseOrStop(true)} data-testid="storylab-stop"><Square />{tk("app-storylab-group-conversation-view.group-conversation.toolbar-button.e9ab8e1c727e")}</ToolbarButton>
    </Toolbar>
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-surface-1 p-2">
      <ToolbarButton active={next === null} disabled={busy || locked} onClick={() => setNext(null)} data-testid="storylab-auto">{tk("app-storylab-group-conversation-view.group-conversation.toolbar-button.71a5f296b929")}</ToolbarButton>
      {participants.map((id, i) => <ToolbarButton key={id} active={id === speaker} disabled={busy || locked} onClick={() => setNext(id)}
        data-testid="storylab-participant" data-asset-id={id} aria-pressed={id === speaker} className={`border-b-2 ${tones[i] ?? tones[0]}`}>
        <AssetThumb state={state} assetId={id} url={covers[id]} size="sm" />{names[id] ?? "?"}
      </ToolbarButton>)}
      <span className="text-xs text-text-secondary" data-testid="storylab-next-speaker" data-asset-id={speaker}>{tk("app-storylab-group-conversation-view.group-conversation.span.e2d53f4280e4", { value1: String(names[speaker] ?? "?") })}</span>
      <span className="text-xs text-text-tertiary">{sceneLabel(state, sceneId)}</span>
    </div>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      {turns.filter((t) => !t.id.startsWith("r:")).map((t) => <div key={t.id} data-testid="storylab-turn" data-kind={t.kind} data-mode={t.kind === "line" ? "role" : t.kind === "analysis" ? "analysis" : t.kind === "direction" ? "direction" : "role"}
        data-speaker={t.speaker} data-turn-id={t.id} tabIndex={-1} className={`rounded-sm border-l-2 bg-surface-2 p-2 text-sm ${t.kind === "analysis" ? "border-status-running" : t.kind === "direction" ? "border-status-uncertain" : tones[participants.indexOf(t.speaker)] ?? "border-border-strong"}`}>
        <div className="flex flex-wrap items-center gap-1 text-xs text-text-tertiary">
          <span className="font-medium">{t.speaker === "director" ? tk("app-storylab-group-conversation-view.group-conversation.span.a8bd86dcd160") : t.speaker === ANALYST ? tk("app-storylab-group-conversation-view.group-conversation.span.83342986aacb") : names[t.speaker] ?? "?"}</span>
          {t.kind === "analysis" ? <span>{tk("app-storylab-group-conversation-view.group-conversation.span.a03f7558e27b")}</span> : null}
          {editable ? <div className="ml-auto flex flex-wrap gap-1">
            <IconButton disabled={busy} data-testid="storylab-fork" title={tk("app-storylab-group-conversation-view.group-conversation.title.0d285dc52a0f")} label={tk("app-storylab-group-conversation-view.group-conversation.label.0d285dc52a0f")}
              onClick={async () => { try { const r = await fork({ data: { projectId, sessionId: session.id, fromTurnId: t.id } });
                if (!r.ok) { setError(r.message); return; } qc.setQueryData(["story-session", projectId, r.session.id], r);
                await qc.invalidateQueries({ queryKey: ["story-sessions", projectId] }); onOpen(r.session.id);
              } catch { setError(tk("app-storylab-group-conversation-view.group-conversation.set-error.7ebfb0a38660")); } }}><GitBranch /></IconButton>
            {t.kind === "line" ? <ToolbarButton disabled={busy || locked} data-testid="storylab-explain" onClick={() => request({ kind: "analysis", focus: t.speaker, question: `Explain why ${names[t.speaker] ?? "this character"} said: ${t.text}` })}>{tk("app-storylab-group-conversation-view.group-conversation.toolbar-button.c0264c6ada29")}</ToolbarButton> : null}
            <select className="h-7" value="" disabled={busy} aria-label={tk("app-storylab-group-conversation-view.group-conversation.aria-label.8686bd1794a5")} data-testid="storylab-suggest"
              onChange={async (e) => { if (!e.target.value) return; try { const r = await suggest({ data: { projectId, sessionId: session.id, turnId: t.id,
                kind: e.target.value as "line" | "motivation" | "analysis", payload: { text: t.text, speaker: t.speaker, sceneId } } });
                if (r.ok) setSavedId(saved(r.id)); else setNote(r.message);
              } catch { setError(tk("app-storylab-group-conversation-view.group-conversation.set-error.9e92230a560d")); } }}>
              <option value="">{tk("app-storylab-group-conversation-view.group-conversation.option.ebeadeacc4c8")}</option>
              <option value="line">{tk("app-storylab-group-conversation-view.group-conversation.option.850b68a70f75")}</option><option value="motivation">{tk("app-storylab-group-conversation-view.group-conversation.option.346d3360728d")}</option><option value="analysis">{tk("app-storylab-group-conversation-view.group-conversation.option.83342986aacb")}</option>
            </select>
          </div> : null}
        </div><p className="whitespace-pre-wrap text-text-primary">{t.text}</p>
      </div>)}
      {error ? <div role="alert" data-testid="storylab-error" className="text-sm text-status-danger">{error}<ToolbarButton disabled={busy || locked} onClick={() => { const action = retry.current; if (action) void withLock(action); }} data-testid="storylab-retry">{tk("app-storylab-group-conversation-view.group-conversation.toolbar-button.c2e369e2c8a4")}</ToolbarButton></div> : null}
      {note ? <p className="text-xs text-text-tertiary" data-testid="storylab-note">{note}</p> : null}
      {savedId ? <SavedSuggestion id={savedId} /> : null}
    </div>
    <div className="shrink-0 space-y-2 border-t border-border bg-surface-1 p-3">
      <details data-testid="storylab-knowledge" className="text-xs text-text-secondary"><summary>{tk("app-storylab-group-conversation-view.group-conversation.summary.32774e77dc89", { value1: String(names[speaker] ?? "?") })}</summary>
        <ul>{[...knowledge.facts, ...knowledge.ownSecrets].map((f) => <li key={f.id}>{f.text}</li>)}</ul>
      </details>
      <div className="flex flex-wrap gap-1">{directions.map((d) => <span key={d.id} data-testid="storylab-direction" data-target={d.target ?? "all"} className="flex items-center gap-1 rounded-sm bg-surface-3 px-2 text-xs">
        {d.target ? names[d.target] ?? "?" : tk("app-storylab-group-conversation-view.group-conversation.span.d779194edb6c")}: {d.text}
        <IconButton disabled={busy || locked} title={tk("app-storylab-group-conversation-view.group-conversation.title.c61b53c7e59a")} label={tk("app-storylab-group-conversation-view.group-conversation.label.c61b53c7e59a")} onClick={() => persistDirection({ id: `r:${d.id}`, speaker: "director", text: "", kind: "direction", at: new Date().toISOString() })}><X /></IconButton>
      </span>)}</div>
      <div className="flex flex-wrap gap-1">
        <Input className="min-w-0 flex-1" disabled={busy || locked} value={direction} onChange={(e) => setDirection(e.target.value)} data-testid="storylab-direction-text" aria-label={tk("app-storylab-group-conversation-view.group-conversation.aria-label.2b2a96d6de7e")} placeholder={tk("app-storylab-group-conversation-view.group-conversation.placeholder.2b2a96d6de7e")} />
        <select value={target ?? ""} disabled={busy || locked} onChange={(e) => setTarget(e.target.value || null)} data-testid="storylab-direction-target" aria-label={tk("app-storylab-group-conversation-view.group-conversation.aria-label.5b651b8e9ff5")}><option value="">{tk("app-storylab-group-conversation-view.group-conversation.option.d779194edb6c")}</option>{participants.map((id) => <option key={id} value={id}>{names[id]}</option>)}</select>
        <select value={scope} disabled={busy || locked} onChange={(e) => setScope(e.target.value as DirectionScope)} data-testid="storylab-direction-scope" aria-label={tk("app-storylab-group-conversation-view.group-conversation.aria-label.587c68f5a74a")}>
          <option value="next">{tk("app-storylab-group-conversation-view.group-conversation.option.b248668e8fe8")}</option><option value="scene">{tk("app-storylab-group-conversation-view.group-conversation.option.8fe27f0849c5")}</option><option value="session">{tk("app-storylab-group-conversation-view.group-conversation.option.df0c4dfa01b9")}</option>
        </select>
        <ToolbarButton disabled={busy || locked || !direction.trim()} data-testid="storylab-direction-add" onClick={() => { persistDirection({ id: `d:${scope}:${target ?? "all"}:${newId<"direction">()}`, speaker: "director", text: direction.trim(), kind: "direction", to: target, at: new Date().toISOString() }); setDirection(""); }}>{tk("app-storylab-group-conversation-view.group-conversation.toolbar-button.ef10891cda99")}</ToolbarButton>
      </div>
      <div className="flex flex-wrap items-end gap-1">
        <Textarea className="min-w-0 flex-1" rows={2} disabled={busy || locked} value={text} onChange={(e) => setText(e.target.value)} data-testid="storylab-input" aria-label={tk("app-storylab-group-conversation-view.group-conversation.aria-label.1ed3ac8ad83d")} />
        <ToolbarButton active={analysis} disabled={busy || locked} onClick={() => setAnalysis(!analysis)} data-testid="storylab-mode-analysis">{tk("app-storylab-group-conversation-view.group-conversation.toolbar-button.83342986aacb")}</ToolbarButton>
        <ToolbarButton disabled={busy || locked || !text.trim() || est.loading || !!est.error} data-testid="storylab-send" onClick={() => request({ kind: analysis ? "analysis" : "qa", question: text.trim() })}>{tk("app-storylab-group-conversation-view.group-conversation.toolbar-button.4952e51dfe02")}</ToolbarButton>
        {mode === "improv" ? <ToolbarButton variant="primary" disabled={busy || locked || est.loading || !!est.error} data-testid="storylab-run-batch" onClick={() => request({ kind: "batch" })}>{tk("app-storylab-group-conversation-view.group-conversation.toolbar-button.891ec3d972b5")}</ToolbarButton> : null}
      </div>
      <p className="text-xs text-text-tertiary" data-testid="storylab-estimate">{tk("app-storylab-group-conversation-view.group-conversation.p.7359aef53f7b", { value1: String(usd(est.usd * (mode === "improv" && !analysis ? 8 : 1))), label: String(est.label) })}</p>
      {confirm ? <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="storylab-confirm">
        <span>{tk("app-storylab-group-conversation-view.group-conversation.span.719f5f40fe2c", { value1: String(usd(est.usd * (confirm.kind === "batch" ? 8 : 1))), label: String(est.label) })}</span>
        <ToolbarButton variant="primary" disabled={est.loading || !!est.error || busy || locked} data-testid="storylab-confirm-send" onClick={() => { setApproved(true); if (confirm.kind === "batch") setBatchApproved(true); execute(confirm); }}>{tk("app-storylab-group-conversation-view.group-conversation.toolbar-button.d10e4fabdbab")}</ToolbarButton>
        <ToolbarButton onClick={() => setConfirm(null)}>{tk("app-storylab-group-conversation-view.group-conversation.toolbar-button.368c7b5a5cbe")}</ToolbarButton>
      </div> : null}
      {est.error ? <p role="alert" className="text-xs text-status-danger">{est.error}</p> : null}
    </div>
  </div>;
}