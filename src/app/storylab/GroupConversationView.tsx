/** SL4: brukerstartede, sekvensielle grupperunder. Hver replikk lagres før neste AI-kall. */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GitBranch, Pause, Play, Square, X } from "lucide-react";
import { ANALYST, L, activeDirections, analystSystemPrompt, characterSystemPrompt, emptyStoryProfile, factsUntil,
  groupTurnMessages, knowledgeAt, locale, newId, reduceEngine, replayTurns, suggestSpeaker,
  type DirectionScope, type EngineMode, type ProjectState, type StoryProfile } from "@/core";
import { generateText } from "@/adapters/ai/text.functions";
import { appendStoryTurns, forkStorySession, getStorySession, saveStorySuggestion,
  type StoredTurn, type StorySession, type StorySessionStatus } from "@/adapters/storylab/sessions.functions";
import { Toolbar, ToolbarButton } from "@/app/shell/workspace-chrome";
import { AssetSymbolIcon } from "@/app/library/AssetSymbolIcon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { names as nameMap, sceneLabel, usd, useTextEstimate } from "./storylab-data";
import { SavedSuggestion, useSuggestionSaved } from "./suggestions-data";

const OUT_TOKENS = 800;
const tones = ["border-accent-brand", "border-status-success", "border-status-moved", "border-status-discrepancy", "border-status-running", "border-status-uncertain"];

export function GroupConversationView({ state, projectId, session, editable, onOpen, onUpdate, onBusy }: {
  state: ProjectState; projectId: string; session: StorySession; editable: boolean; onOpen: (id: string) => void; onUpdate?: (session: StorySession) => void; onBusy?: (busy: boolean) => void;
}) {
  const raw = session.context;
  const participants = Array.isArray(raw["participants"]) ? raw["participants"].filter((id): id is string =>
    typeof id === "string" && (state.assets[id]?.kind === "character" || state.assets[id]?.kind === "animal")) : [];
  if (participants.length < 2 || participants.length > 6 || new Set(participants).size !== participants.length)
    return <p role="alert" className="p-4 text-status-danger">{L("Økten har ugyldige deltakere.", "The session has invalid participants.")}</p>;
  return <GroupConversation key={session.id} state={state} projectId={projectId} session={session} participants={participants} editable={editable} onOpen={onOpen} {...(onUpdate ? { onUpdate } : {})} {...(onBusy ? { onBusy } : {})} />;
}

function GroupConversation({ state, projectId, session, participants, editable, onOpen, onUpdate, onBusy }: {
  state: ProjectState; projectId: string; session: StorySession; participants: string[]; editable: boolean; onOpen: (id: string) => void; onUpdate?: (session: StorySession) => void; onBusy?: (busy: boolean) => void;
}) {
  const sceneId = typeof session.context["sceneId"] === "string" ? session.context["sceneId"] : null;
  const situation = typeof session.context["situation"] === "string" ? session.context["situation"] : "";
  const seed = typeof session.context["seed"] === "number" ? session.context["seed"] : 1;
  const profiles = (session.context["profiles"] ?? {}) as Record<string, StoryProfile | null>;
  const names = nameMap(state);
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
        knowledge: knowledgeAt(state, id, sceneId as never), situation, directions: activeDirections(e, id), language: locale() === "en" ? "en" : "nb", names }),
      messages: groupTurnMessages(e, id, names).messages,
    };
  };
  const analysisInput = (question: string, focus?: string) => ({
    system: analystSystemPrompt({ characters: participants.map((id) => ({ name: names[id] ?? "?", profile: profiles[id] ?? null })),
      facts: factsUntil(state, sceneId).map((f) => ({ text: f.text, kind: f.kind, knownBy: f.knownBy.map((k) => names[k.assetId] ?? "?") })),
      sceneContext: situation, language: locale() === "en" ? "en" : "nb", ...(focus ? { focus: names[focus] ?? "?" } : {}) }) +
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
      const message = serviceError.current ?? L("Samtalen kunne ikke fortsette. Prøv igjen.", "The conversation could not continue. Try again.");
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
      if (r.usedFallback) setNote(L("Den innebygde AI-en ble brukt som reserve.", "The built-in AI was used as fallback."));
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
    if (r.usedFallback) setNote(L("Den innebygde AI-en ble brukt som reserve.", "The built-in AI was used as fallback."));
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
    <Toolbar title={session.title || L("Gruppesamtale", "Group conversation")} status={<span className="text-xs text-text-tertiary" data-testid="storylab-cost">{L(`Brukt i økten: ${usd(cost)}`, `Spent in the session: ${usd(cost)}`)}</span>}>
      <div role="radiogroup" aria-label={L("Modus", "Mode")} className="flex flex-wrap">
        {(["qa", "improv"] as const).map((m) => <ToolbarButton key={m} role="radio" aria-checked={m === mode} active={m === mode}
          disabled={busy || locked} data-testid={`storylab-group-mode-${m}`} onClick={() => setMode(m)}>{m === "qa" ? L("Spørsmål og svar", "Questions and answers") : L("Fri improvisasjon", "Free improvisation")}</ToolbarButton>)}
      </div>
      <span className="text-xs text-text-tertiary" role="status" data-testid="storylab-group-status">{status === "stopped" || status === "archived" ? L("Stoppet", "Stopped") : busy ? L("Kjører", "Running") : status === "paused" ? L("Pause", "Paused") : L("Klar", "Ready")}</span>
      <ToolbarButton disabled={locked || !busy} onClick={() => pauseOrStop(false)} data-testid="storylab-pause"><Pause />{L("Pause", "Pause")}</ToolbarButton>
      <ToolbarButton disabled={locked || busy || status !== "paused"} onClick={() => mode === "improv" ? request({ kind: "batch" }) : void withLock(async () => { await save([], 0, "active"); })} data-testid="storylab-resume"><Play />{L("Fortsett", "Continue")}</ToolbarButton>
      <ToolbarButton disabled={locked} onClick={() => pauseOrStop(true)} data-testid="storylab-stop"><Square />{L("Stopp", "Stop")}</ToolbarButton>
    </Toolbar>
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-surface-1 p-2">
      <ToolbarButton active={next === null} disabled={busy || locked} onClick={() => setNext(null)} data-testid="storylab-auto">{L("Auto", "Auto")}</ToolbarButton>
      {participants.map((id, i) => <ToolbarButton key={id} active={id === speaker} disabled={busy || locked} onClick={() => setNext(id)}
        data-testid="storylab-participant" data-asset-id={id} aria-pressed={id === speaker} className={`border-b-2 ${tones[i] ?? tones[0]}`}>
        <AssetSymbolIcon state={state} assetId={id} className="size-6" />{names[id] ?? "?"}
      </ToolbarButton>)}
      <span className="text-xs text-text-secondary" data-testid="storylab-next-speaker" data-asset-id={speaker}>{L(`Neste taler: ${names[speaker] ?? "?"}`, `Next speaker: ${names[speaker] ?? "?"}`)}</span>
      <span className="text-xs text-text-tertiary">{sceneLabel(state, sceneId)}</span>
    </div>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      {turns.filter((t) => !t.id.startsWith("r:")).map((t) => <div key={t.id} data-testid="storylab-turn" data-kind={t.kind} data-mode={t.kind === "line" ? "role" : t.kind === "analysis" ? "analysis" : t.kind === "direction" ? "direction" : "role"}
        data-speaker={t.speaker} data-turn-id={t.id} tabIndex={-1} className={`rounded-sm border-l-2 bg-surface-2 p-2 text-sm ${t.kind === "analysis" ? "border-status-running" : t.kind === "direction" ? "border-status-uncertain" : tones[participants.indexOf(t.speaker)] ?? "border-border-strong"}`}>
        <div className="flex flex-wrap items-center gap-1 text-xs text-text-tertiary">
          <span className="font-medium">{t.speaker === "director" ? L("Regissør", "Director") : t.speaker === ANALYST ? L("Analyse", "Analysis") : names[t.speaker] ?? "?"}</span>
          {t.kind === "analysis" ? <span>{L("utenfor rollen", "out of character")}</span> : null}
          {editable ? <div className="ml-auto flex flex-wrap gap-1">
            <ToolbarButton variant="icon" disabled={busy} data-testid="storylab-fork" title={L("Forgren herfra", "Branch from here")} aria-label={L("Forgren herfra", "Branch from here")}
              onClick={async () => { try { const r = await fork({ data: { projectId, sessionId: session.id, fromTurn: turns.findIndex((x) => x.id === t.id) } });
                if (!r.ok) { setError(r.message); return; } qc.setQueryData(["story-session", projectId, r.session.id], r);
                await qc.invalidateQueries({ queryKey: ["story-sessions", projectId] }); onOpen(r.session.id);
              } catch { setError(L("Forgrening kunne ikke opprettes.", "The branch could not be created.")); } }}><GitBranch /></ToolbarButton>
            {t.kind === "line" ? <ToolbarButton disabled={busy || locked} data-testid="storylab-explain" onClick={() => request({ kind: "analysis", focus: t.speaker, question: `Explain why ${names[t.speaker] ?? "this character"} said: ${t.text}` })}>{L("Hvorfor sa du det?", "Why did you say that?")}</ToolbarButton> : null}
            <select className="h-7" value="" disabled={busy} aria-label={L("Lagre som forslag", "Save as suggestion")} data-testid="storylab-suggest"
              onChange={async (e) => { if (!e.target.value) return; try { const r = await suggest({ data: { projectId, sessionId: session.id, turnId: t.id,
                kind: e.target.value as "line" | "motivation" | "analysis", payload: { text: t.text, speaker: t.speaker, sceneId } } });
                if (r.ok) setSavedId(saved(r.id)); else setNote(r.message);
              } catch { setError(L("Forslaget kunne ikke lagres.", "The suggestion could not be saved.")); } }}>
              <option value="">{L("Lagre som forslag …", "Save as suggestion …")}</option>
              <option value="line">{L("Replikk", "Line")}</option><option value="motivation">{L("Motivasjon", "Motivation")}</option><option value="analysis">{L("Analyse", "Analysis")}</option>
            </select>
          </div> : null}
        </div><p className="whitespace-pre-wrap text-text-primary">{t.text}</p>
      </div>)}
      {error ? <div role="alert" data-testid="storylab-error" className="text-sm text-status-danger">{error}<ToolbarButton disabled={busy || locked} onClick={() => { const action = retry.current; if (action) void withLock(action); }} data-testid="storylab-retry">{L("Prøv igjen", "Try again")}</ToolbarButton></div> : null}
      {note ? <p className="text-xs text-text-tertiary" data-testid="storylab-note">{note}</p> : null}
      {savedId ? <SavedSuggestion id={savedId} /> : null}
    </div>
    <div className="shrink-0 space-y-2 border-t border-border bg-surface-1 p-3">
      <details data-testid="storylab-knowledge" className="text-xs text-text-secondary"><summary>{L(`Hva vet ${names[speaker] ?? "?"} nå?`, `What does ${names[speaker] ?? "?"} know now?`)}</summary>
        <ul>{[...knowledge.facts, ...knowledge.ownSecrets].map((f) => <li key={f.id}>{f.text}</li>)}</ul>
      </details>
      <div className="flex flex-wrap gap-1">{directions.map((d) => <span key={d.id} data-testid="storylab-direction" data-target={d.target ?? "all"} className="flex items-center gap-1 rounded-sm bg-surface-3 px-2 text-xs">
        {d.target ? names[d.target] ?? "?" : L("Alle", "Everyone")}: {d.text}
        <ToolbarButton variant="icon" disabled={busy || locked} title={L("Fjern regi", "Remove direction")} aria-label={L("Fjern regi", "Remove direction")} onClick={() => persistDirection({ id: `r:${d.id}`, speaker: "director", text: "", kind: "direction", at: new Date().toISOString() })}><X /></ToolbarButton>
      </span>)}</div>
      <div className="flex flex-wrap gap-1">
        <Input className="min-w-0 flex-1" disabled={busy || locked} value={direction} onChange={(e) => setDirection(e.target.value)} data-testid="storylab-direction-text" aria-label={L("Regi / tilstand", "Direction / state")} placeholder={L("Regi / tilstand", "Direction / state")} />
        <select value={target ?? ""} disabled={busy || locked} onChange={(e) => setTarget(e.target.value || null)} data-testid="storylab-direction-target" aria-label={L("Mål for regi", "Direction target")}><option value="">{L("Alle", "Everyone")}</option>{participants.map((id) => <option key={id} value={id}>{names[id]}</option>)}</select>
        <select value={scope} disabled={busy || locked} onChange={(e) => setScope(e.target.value as DirectionScope)} data-testid="storylab-direction-scope" aria-label={L("Gyldighet", "Scope")}>
          <option value="next">{L("Neste replikk", "Next line")}</option><option value="scene">{L("Scenen", "The scene")}</option><option value="session">{L("Økten", "The session")}</option>
        </select>
        <ToolbarButton disabled={busy || locked || !direction.trim()} data-testid="storylab-direction-add" onClick={() => { persistDirection({ id: `d:${scope}:${target ?? "all"}:${newId<"direction">()}`, speaker: "director", text: direction.trim(), kind: "direction", to: target, at: new Date().toISOString() }); setDirection(""); }}>{L("Legg til regi", "Add direction")}</ToolbarButton>
      </div>
      <div className="flex flex-wrap items-end gap-1">
        <Textarea className="min-w-0 flex-1" rows={2} disabled={busy || locked} value={text} onChange={(e) => setText(e.target.value)} data-testid="storylab-input" aria-label={L("Spørsmål", "Question")} />
        <ToolbarButton active={analysis} disabled={busy || locked} onClick={() => setAnalysis(!analysis)} data-testid="storylab-mode-analysis">{L("Analyse", "Analysis")}</ToolbarButton>
        <ToolbarButton disabled={busy || locked || !text.trim() || est.loading || !!est.error} data-testid="storylab-send" onClick={() => request({ kind: analysis ? "analysis" : "qa", question: text.trim() })}>{L("Send", "Send")}</ToolbarButton>
        {mode === "improv" ? <ToolbarButton variant="primary" disabled={busy || locked || est.loading || !!est.error} data-testid="storylab-run-batch" onClick={() => request({ kind: "batch" })}>{L("Kjør bolk", "Run batch")}</ToolbarButton> : null}
      </div>
      <p className="text-xs text-text-tertiary" data-testid="storylab-estimate">{L(`Anslått: ${usd(est.usd * (mode === "improv" && !analysis ? 8 : 1))} · ${est.label}`, `Estimated: ${usd(est.usd * (mode === "improv" && !analysis ? 8 : 1))} · ${est.label}`)}</p>
      {confirm ? <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="storylab-confirm">
        <span>{L(`Bekreft anslått kostnad: ${usd(est.usd * (confirm.kind === "batch" ? 8 : 1))} · ${est.label}`, `Confirm estimated cost: ${usd(est.usd * (confirm.kind === "batch" ? 8 : 1))} · ${est.label}`)}</span>
        <ToolbarButton variant="primary" disabled={est.loading || !!est.error || busy || locked} data-testid="storylab-confirm-send" onClick={() => { setApproved(true); if (confirm.kind === "batch") setBatchApproved(true); execute(confirm); }}>{L("Bekreft", "Confirm")}</ToolbarButton>
        <ToolbarButton onClick={() => setConfirm(null)}>{L("Avbryt", "Cancel")}</ToolbarButton>
      </div> : null}
      {est.error ? <p role="alert" className="text-xs text-status-danger">{est.error}</p> : null}
    </div>
  </div>;
}