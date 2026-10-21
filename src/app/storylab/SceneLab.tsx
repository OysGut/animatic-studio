/** SL5: sceneanalyse, replikksjekk og improvisasjon. Manus er alltid skrivebeskyttet. */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ANALYSIS_ASPECTS, ANALYSIS_ASPECT_LABEL, characterSystemPrompt, emptyStoryProfile, knowledgeAt, lineCheckFromJson, lineCheckPrompt, newId, parseJsonLoose, profileAt, sceneAnalysisFromJson, sceneAnalysisPrompt, unreadableReplyMessage, type LineCheckResult, type ProjectState, type SceneAnalysisPoint } from "@/core";
import { useLanguage } from "@/app/i18n/language";
import { generateText } from "@/adapters/ai/text.functions";
import { appendStoryTurns, createStorySession, forkStorySession, getStorySession, listStorySessions, saveStorySuggestion, type StorySession, type StoredTurn } from "@/adapters/storylab/sessions.functions";
import { Toolbar, ToolbarButton, PanelHeader } from "@/app/shell/workspace-chrome";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { GroupConversationView } from "./GroupConversationView";
import { profileStatus, usd, useTextEstimate } from "./storylab-data";
import { sceneLabData, lineAndWordCount } from "./scene-lab-data";
import { runSceneBatch } from "./scene-batch";
import { SavedSuggestion, useSuggestionSaved } from "./suggestions-data";
import { t as tk } from "@/core/i18n/keyed";

type Check = { blockId: string; result: LineCheckResult; turnId: string };
export function SceneLab({ state, projectId, sceneId, editable, initialSession, onProfile, onScene }: {
  state: ProjectState; projectId: string; sceneId: string; editable: boolean;
  initialSession?: StorySession; onProfile?: (id: string) => void; onScene?: (id: string) => void;
}) {
  const data = sceneLabData(state, sceneId);
  const language = useLanguage() === "en" ? "en" : "nb";
  const [tab, setTab] = useState<"analysis" | "improv" | "check">(initialSession?.kind === "scene_improv" ? "improv" : "analysis");
  const [session, setSession] = useState<StorySession | null>(initialSession ?? null);
  const [analysisSession, setAnalysisSession] = useState<StorySession | null>(initialSession?.kind === "scene_analysis" ? initialSession : null);
  const [points, setPoints] = useState<SceneAnalysisPoint[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"analysis" | "check" | "improv" | "variants" | null>(null);
  const [checkBlock, setCheckBlock] = useState<string | null>(null);
  const [situation, setSituation] = useState(data.situation);
  const [directions, setDirections] = useState(["", "", ""]);
  const [variants, setVariants] = useState<StorySession[]>([]);
  const [compare, setCompare] = useState(false);
  const [chosenVariants, setChosenVariants] = useState<string[]>([]);
  const [chosenLines, setChosenLines] = useState<string[]>([]);
  const [fromTurnId, setFromTurnId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const stopped = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [checkApproved, setCheckApproved] = useState(false);
  const [groupBusy, setGroupBusy] = useState(false);
  const groupWorking = useRef(false);
  const retrySave = useRef<(() => Promise<void>) | null>(null);
  const gen = useServerFn(generateText), create = useServerFn(createStorySession), append = useServerFn(appendStoryTurns), fork = useServerFn(forkStorySession), suggest = useServerFn(saveStorySuggestion), get = useServerFn(getStorySession);
  const list = useServerFn(listStorySessions);
  const qc = useQueryClient();
  const saved = useSuggestionSaved(projectId);
  const [savedId, setSavedId] = useState<string | null>(null);
  const rootId = session?.kind === "scene_improv" ? session.parentSessionId ?? session.id : null;
  const related = useQuery({ queryKey: ["scene-variants", projectId, rootId], enabled: !!rootId && !busy, queryFn: async () => {
    const r = await list({ data: { projectId } }); if (!r.ok) throw new Error(r.message);
    const out: StorySession[] = [];
    for (const summary of r.sessions.filter((s) => s.parentSessionId === rootId && / · [ABC]$/.test(s.title))) { const got = await get({ data: { projectId, sessionId: summary.id } }); if (got.ok) out.push(got.session); }
    return out;
  } });
  useEffect(() => { if (related.data) { setVariants(related.data); setChosenVariants(related.data.map((s) => s.id)); } }, [related.data]);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = useQuery({ queryKey: ["story-session", projectId, openId], queryFn: () => get({ data: { projectId, sessionId: openId ?? "" } }), enabled: !!openId, refetchOnMount: "always", refetchOnWindowFocus: false });
  useEffect(() => { mounted.current = true; onScene?.(sceneId); return () => { mounted.current = false; stopped.current = true; }; }, [sceneId]);
  useEffect(() => {
    if (!openId || !opened.isFetchedAfterMount || opened.isFetching) return;
    if (!opened.data?.ok) { setError(opened.data && !opened.data.ok ? opened.data.message : tk("app-storylab-scene-lab.scene-lab.set-error.84295ce17e6a")); setOpenId(null); return; }
    if (opened.data.session.context["sceneId"] !== sceneId) { setError(tk("app-storylab-scene-lab.scene-lab.set-error.dfe097e6abf4")); setOpenId(null); return; }
    setSession(opened.data.session); setOpenId(null);
  }, [opened.data, opened.isFetchedAfterMount]);
  useEffect(() => {
    if (!session || session.kind !== "scene_analysis") return;
    setAnalysisSession(session);
    setPoints([]);
    const cs: Check[] = [];
    for (const t of session.turns) {
      const parsed = parseJsonLoose(t.text) as { blockId?: string; result?: unknown } | null;
      if (parsed?.blockId && parsed.result) {
        const result = lineCheckFromJson(JSON.stringify(parsed.result));
        if (result) cs.push({ blockId: parsed.blockId, result, turnId: t.id });
      } else {
        const p = sceneAnalysisFromJson(t.text, data.blocks.map((b) => b.id));
        if (p?.length) setPoints(p);
      }
    }
    setChecks(cs);
    if (cs.length && !session.turns.some((t) => sceneAnalysisFromJson(t.text, data.blocks.map((b) => b.id))?.length)) setTab("check");
  }, [session]);
  const analysisPrompt = sceneAnalysisPrompt({ heading: data.heading, blocks: data.blocks,
    characters: data.participants.map((a) => { const k = knowledgeAt(state, a.id, sceneId as never); return { name: a.name, profile: profileAt(state, a.id, sceneId as never), knows: [...k.facts, ...k.ownSecrets].map((f) => f.text) }; }), language });
  const block = data.blocks.find((b) => b.id === checkBlock);
  const speakerId = block ? data.speakers.get(block.id) : undefined;
  const speaker = speakerId ? state.assets[speakerId] : undefined;
  const checkPrompt = speaker && block ? lineCheckPrompt({ name: speaker.name, profile: profileAt(state, speaker.id, sceneId as never), knowledge: knowledgeAt(state, speaker.id, sceneId as never), sceneHeading: data.heading,
    before: data.blocks.slice(0, data.blocks.findIndex((b) => b.id === block.id)).filter((b) => b.kind === "dialogue").slice(-12).map((b) => b.text), line: block.text, language }) : null;
  const prompt = dialog === "check" && checkPrompt ? checkPrompt : analysisPrompt;
  const batchChars = Math.max(0, ...data.participants.map((a) => characterSystemPrompt({ name: a.name, profile: profileAt(state, a.id, sceneId as never) ?? emptyStoryProfile(), knowledge: knowledgeAt(state, a.id, sceneId as never), situation, language: "nb" }).length))
    + (session?.turns.slice(0, (fromTurnId === null ? -1 : session.turns.findIndex((t) => t.id === fromTurnId)) + 1).reduce((n, t) => n + t.text.length + 100, 0) ?? 0)
    + Math.max(0, ...directions.map((d) => d.length)) + 8 * 800 * 4;
  const estimate = useTextEstimate(dialog === "variants" || dialog === "improv" ? "storylab_group" : "storylab_analysis", dialog === "variants" || dialog === "improv" ? batchChars : prompt.system.length + prompt.user.length, dialog === "analysis" ? 8000 : dialog === "check" ? 2000 : 2000);
  const remember = (s: StorySession) => { qc.setQueryData(["story-session", projectId, s.id], { ok: true, session: s }); void qc.invalidateQueries({ queryKey: ["story-sessions", projectId] }); };
  const save = async (s: StorySession, turns: StoredTurn[], cost = 0, status: "active" | "paused" = "paused") => {
    const r = await append({ data: { projectId, sessionId: s.id, turns, addCostUsd: cost, status } });
    if (!r.ok) throw new Error(r.message);
    const result = { ...s, turns: [...s.turns, ...turns], costUsd: r.costUsd, status };
    remember(result); return result;
  };
  const make = async (kind: "scene_analysis" | "scene_improv") => {
    const r = await create({ data: { projectId, kind, title: data.heading, context: kind === "scene_analysis" ? { sceneId } : {
      sceneId, participants: data.participants.map((a) => a.id), situation, mode: "improv", seed: crypto.getRandomValues(new Uint32Array(1))[0] ?? 1,
      profiles: Object.fromEntries(data.participants.map((a) => [a.id, profileAt(state, a.id, sceneId as never)])) } } });
    if (!r.ok) throw new Error(r.message); remember(r.session); return r.session;
  };
  const perform = async (action: () => Promise<void>) => {
    if (lock.current || groupWorking.current || !editable) return;
    lock.current = true; stopped.current = false; setBusy(true); setError(null);
    try { await action(); } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : tk("app-storylab-scene-lab.perform.set-error.824e0c293ba1")); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const checkLine = (selectedBlock = block) => perform(async () => {
    const id = selectedBlock ? data.speakers.get(selectedBlock.id) : undefined;
    const asset = id ? state.assets[id] : undefined;
    if (!asset || !selectedBlock) return;
    const checkPrompt = lineCheckPrompt({ name: asset.name, profile: profileAt(state, asset.id, sceneId as never), knowledge: knowledgeAt(state, asset.id, sceneId as never), sceneHeading: data.heading, before: data.blocks.slice(0, data.blocks.findIndex((b) => b.id === selectedBlock.id)).filter((b) => b.kind === "dialogue").slice(-12).map((b) => b.text), line: selectedBlock.text, language });
    const r = await gen({ data: { projectId, task: "storylab_analysis", json: true, system: checkPrompt.system, messages: [{ role: "user", content: checkPrompt.user }], maxTokens: 2000 } });
    if (!r.ok) throw new Error(r.message);
    const result = lineCheckFromJson(r.text); if (!result) throw new Error(unreadableReplyMessage());
    const s = analysisSession ?? await make("scene_analysis");
    const turn: StoredTurn = { id: newId<"turn">(), speaker: "analyst", kind: "analysis", text: JSON.stringify({ blockId: selectedBlock.id, result }), at: new Date().toISOString() };
    retrySave.current = async () => { const saved = await save(s, [turn], r.costUsd); setSession(saved); setAnalysisSession(saved); setTab("check"); retrySave.current = null; };
    await retrySave.current();
    if (r.usedFallback) setNote(tk("app-storylab-scene-lab.check-line.set-note.c5600584e586"));
  });
  const analyze = () => perform(async () => {
    const r = await gen({ data: { projectId, task: "storylab_analysis", json: true, system: analysisPrompt.system, messages: [{ role: "user", content: analysisPrompt.user }], maxTokens: 8000 } });
    if (!r.ok) throw new Error(r.message);
    const p = sceneAnalysisFromJson(r.text, data.blocks.map((b) => b.id));
    const raw = parseJsonLoose(r.text) as { points?: unknown } | null;
    if (!raw || !Array.isArray(raw.points) || raw.points.some((x) => !x || typeof x !== "object" || typeof x.finding !== "string" || typeof x.suggestion !== "string" || !Array.isArray(x.evidence) || typeof x.uncertain !== "boolean")) throw new Error(unreadableReplyMessage());
    if (!p || p.length !== 10 || !ANALYSIS_ASPECTS.every((a) => p.filter((x) => x.aspect === a).length === 1)) throw new Error(unreadableReplyMessage());
    const s = await make("scene_analysis");
    const turn: StoredTurn = { id: newId<"turn">(), speaker: "analyst", kind: "analysis", text: r.text, at: new Date().toISOString() };
    retrySave.current = async () => { const saved = await save(s, [turn], r.costUsd); setSession(saved); setAnalysisSession(saved); setPoints(p); retrySave.current = null; };
    await retrySave.current();
    if (r.usedFallback) setNote(tk("app-storylab-scene-lab.analyze.set-note.eb8bc9dfb8d4"));
  });
  const runVariants = () => perform(async () => {
    if (!session || session.kind !== "scene_improv") return;
    const added: StorySession[] = [];
    for (let i = 0; i < 3 && !stopped.current; i++) {
      const direction = directions[i]?.trim(); if (!direction) continue;
      const label = ["A", "B", "C"][i] ?? "A";
      const r = await fork({ data: { projectId, sessionId: session.id, fromTurnId, title: `${data.heading} · ${label}` } });
      if (!r.ok) throw new Error(r.message);
      let branch = await save(r.session, [{ id: `d:session:all:${newId<"direction">()}`, speaker: "director", kind: "direction", text: direction, at: new Date().toISOString(), to: null }], 0, "active");
      added.push(branch); setVariants((old) => [...old, branch]);
      await runSceneBatch({ state, session: branch, language: "nb", shouldStop: () => stopped.current,
        generate: async (input) => { const result = await gen({ data: { projectId, task: "storylab_group", ...input, maxTokens: 2000 } }); if (!result.ok) throw new Error(result.message); if (result.usedFallback && mounted.current) setNote(tk("app-storylab-scene-lab.generate.set-note.16319cc4cfd3")); return result; },
        save: async (turn, cost) => {
          retrySave.current = async () => { branch = await save(branch, [turn], cost); setVariants((old) => old.map((s) => s.id === branch.id ? branch : s)); retrySave.current = null; };
          await retrySave.current();
        },
      });
      branch = await save(branch, []); setVariants((old) => old.map((s) => s.id === branch.id ? branch : s));
    }
    setChosenVariants(added.map((s) => s.id)); setCompare(true); void qc.invalidateQueries({ queryKey: ["scene-variants", projectId] });
  });
  const saveSuggestion = (kind: "analysis" | "line" | "scene_draft", payload: Record<string, unknown>, s = session, turnId?: string) => perform(async () => {
    const r = await suggest({ data: { projectId, sessionId: s?.id ?? null, kind, payload: { ...payload, sceneId }, ...(turnId ? { turnId } : {}) } }); if (!r.ok) throw new Error(r.message); setSavedId(saved(r.id));
  });
  const evidence = (source: string) => <ToolbarButton key={source} data-testid="storylab-evidence" className="text-xs" onClick={() => {
    if (source.startsWith("profile:")) { const a = data.participants.find((a) => source.slice(8).startsWith(`${a.name}.`)); if (a) onProfile?.(a.id); }
    else { setHighlight(source); document.getElementById(`scene-block-${source}`)?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); }
  }}>{source}</ToolbarButton>;
  const checkCard = (c: Check) => <div className="border border-border bg-surface-2 p-2 text-sm" key={c.turnId} data-turn-id={c.turnId} tabIndex={-1}>
    <span data-testid="storylab-line-verdict" data-verdict={c.result.verdict} className="text-accent-brand">{c.result.verdict === "yes" ? tk("app-storylab-scene-lab.check-card.span.923e28a71990") : c.result.verdict === "partly" ? tk("app-storylab-scene-lab.check-card.span.d8026fedc6af") : tk("app-storylab-scene-lab.check-card.span.630be099f983")}</span>
    {c.result.reasons.map((r, i) => <div key={i}><p>{r.text}</p><div className="flex flex-wrap">{r.evidence.map((e) => <ToolbarButton key={e} onClick={() => { const id = data.speakers.get(c.blockId); if (id && e.startsWith("profile.")) onProfile?.(id); else { setHighlight(c.blockId); document.getElementById(`scene-block-${c.blockId}`)?.scrollIntoView({ block: "nearest" }); } }}>{e}</ToolbarButton>)}</div></div>)}
    {c.result.rewrite ? <><p className="font-script">{c.result.rewrite}</p><ToolbarButton disabled={!editable || busy || groupBusy} onClick={() => saveSuggestion("line", { sceneId, blockId: c.blockId, original: data.blocks.find((b) => b.id === c.blockId)?.text ?? "", suggestion: c.result.rewrite }, analysisSession, c.turnId)}>{tk("app-storylab-scene-lab.check-card.toolbar-button.d8c70b71a3f2")}</ToolbarButton></> : null}
    {(() => { const id = data.speakers.get(c.blockId); return id && !profileAt(state, id, sceneId as never) ? <ToolbarButton onClick={() => onProfile?.(id)}>{tk("app-storylab-scene-lab.check-card.toolbar-button.65d8737c3d17")}</ToolbarButton> : null; })()}
  </div>;
  return <div data-testid="storylab-scenelab" className="flex min-h-0 flex-1 flex-col">
    <Toolbar title={data.heading || tk("app-storylab-scene-lab.scene-lab.title.435d04a9a112")} status={session ? usd(session.costUsd) : undefined} />
    <div className="flex min-h-0 flex-1 flex-wrap">
      <section className="min-w-0 flex-1 overflow-y-auto border-r border-border p-3">
        <PanelHeader title={tk("app-storylab-scene-lab.scene-lab.title.4d41543e3d66")} />
        <div className="font-script text-sm text-text-primary">
          {data.blocks.map((b) => <div key={b.id} id={`scene-block-${b.id}`} data-testid="storylab-scene-block" data-block-id={b.id} data-highlighted={highlight === b.id} className={`group relative whitespace-pre-wrap py-1 ${b.kind === "dialogue" ? "mx-auto w-3/5" : b.kind === "character" || b.kind === "parenthetical" ? "pl-1/3" : ""} ${highlight === b.id ? "bg-accent-selection" : ""}`}>
            <p className={b.kind === "character" || b.kind === "heading" ? "uppercase" : ""}>{b.text}</p>
            {b.kind === "dialogue" && data.speakers.has(b.id) ? <ToolbarButton data-testid="storylab-line-check" disabled={!editable || busy || groupBusy} className="font-sans opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100" onClick={() => { setCheckBlock(b.id); setTab("check"); if (checkApproved) void checkLine(b); else setDialog("check"); }}>
              {tk("app-storylab-scene-lab.scene-lab.toolbar-button.9d92952c97bf")}{!profileAt(state, data.speakers.get(b.id) ?? "", sceneId as never) ? tk("app-storylab-scene-lab.scene-lab.toolbar-button.812449377db4") : ""}
            </ToolbarButton> : null}
            {checks.filter((c) => c.blockId === b.id).map(checkCard)}
          </div>)}
        </div>
      </section>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PanelHeader title={tk("app-storylab-scene-lab.scene-lab.title.c9cf0c0b91a2")} />
        <div className="flex flex-wrap gap-1 p-2">{data.participants.map((a) => <ToolbarButton key={a.id} data-asset-id={a.id} data-profile={profileStatus(state, a.id)} onClick={() => onProfile?.(a.id)}>{a.name} · {profileStatus(state, a.id) === "active" ? tk("app-storylab-scene-lab.scene-lab.toolbar-button.487e7cf42e9f") : tk("app-storylab-scene-lab.scene-lab.toolbar-button.de75908eceb1")}</ToolbarButton>)}</div>
        <div role="tablist" className="flex border-b border-border">{(["analysis", "improv", "check"] as const).map((t) => <ToolbarButton key={t} role="tab" aria-selected={tab === t} active={tab === t} data-testid={`storylab-scene-tab-${t}`} disabled={busy || groupBusy} onClick={() => setTab(t)}>{t === "analysis" ? tk("app-storylab-scene-lab.scene-lab.toolbar-button.7dafa6d61df4") : t === "improv" ? tk("app-storylab-scene-lab.scene-lab.toolbar-button.f2b69c1715a1") : tk("app-storylab-scene-lab.scene-lab.toolbar-button.e2e6a674a17f")}</ToolbarButton>)}</div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
          {tab === "analysis" ? <><ToolbarButton data-testid="storylab-analyze" disabled={!editable || busy || groupBusy} onClick={() => setDialog("analysis")}>{tk("app-storylab-scene-lab.scene-lab.toolbar-button.4f8e8124aa9a")}</ToolbarButton>{points.map((p) => <article key={p.aspect} data-testid="storylab-analysis-card" data-turn-id={analysisSession?.turns.find((t) => !(parseJsonLoose(t.text) as { blockId?: string } | null)?.blockId)?.id} tabIndex={-1} className="my-1 rounded-sm border border-border bg-surface-2 p-3 text-sm"><h3>{ANALYSIS_ASPECT_LABEL[p.aspect]}</h3>{p.uncertain ? <span className="text-status-uncertain">{tk("app-storylab-scene-lab.scene-lab.span.eedccce9e58d")}</span> : null}<p>{p.finding}</p><p className="text-text-secondary">{p.suggestion}</p><div className="flex flex-wrap">{p.evidence.map(evidence)}</div><ToolbarButton disabled={!editable || busy || groupBusy} onClick={() => saveSuggestion("analysis", { ...p }, analysisSession, analysisSession?.turns.find((t) => !(parseJsonLoose(t.text) as { blockId?: string } | null)?.blockId)?.id)}>{tk("app-storylab-scene-lab.scene-lab.toolbar-button.8052e4c18fe6")}</ToolbarButton></article>)}</> : null}
          {tab === "check" ? <div className="space-y-2">{checks.map(checkCard)}</div> : null}
          {tab === "improv" ? <><div className="flex flex-wrap"><ToolbarButton data-testid="storylab-improvise" disabled={!editable || busy || groupBusy || data.participants.length < 2 || data.participants.length > 6} onClick={() => setDialog("improv")}>{tk("app-storylab-scene-lab.scene-lab.toolbar-button.6698cc2b7721")}</ToolbarButton><ToolbarButton data-testid="storylab-variants" disabled={!editable || busy || groupBusy || session?.kind !== "scene_improv"} onClick={() => setDialog("variants")}>{tk("app-storylab-scene-lab.scene-lab.toolbar-button.8f3a1bb3dacb")}</ToolbarButton><ToolbarButton data-testid="storylab-compare" disabled={busy || groupBusy} onClick={() => setCompare(!compare)}>{tk("app-storylab-scene-lab.scene-lab.toolbar-button.0d50cf1bf200")}</ToolbarButton>{busy ? <ToolbarButton onClick={() => { stopped.current = true; }}>{tk("app-storylab-scene-lab.scene-lab.toolbar-button.addb2925c66f")}</ToolbarButton> : null}</div>
            {session?.kind === "scene_improv" && !openId && !busy ? <GroupConversationView key={session.id} state={state} projectId={projectId} session={session} editable={editable && !busy} onOpen={setOpenId} onUpdate={setSession} onBusy={(value) => { groupWorking.current = value; setGroupBusy(value); }} /> : null}
            {variants.map((v) => <label key={v.id} className="flex items-center gap-2"><Checkbox checked={chosenVariants.includes(v.id)} onCheckedChange={(yes) => setChosenVariants((old) => yes ? [...old, v.id] : old.filter((id) => id !== v.id))} />{v.title}</label>)}
          </> : null}
          {compare ? <div className="flex shrink-0 gap-2 overflow-x-auto">{[{ id: "original", title: tk("app-storylab-scene-lab.title.title.62b06a190232"), turns: data.blocks.filter((b) => b.kind === "dialogue").map((b) => ({ id: b.id, text: b.text, speaker: data.speakers.get(b.id) ?? "?" })), session: null }, ...variants.filter((v) => chosenVariants.includes(v.id)).map((v) => ({ id: v.id, title: v.title, turns: v.turns.filter((t) => t.kind === "line"), session: v }))].map((col) => {
            const count = lineAndWordCount(col.turns);
            return <section key={col.id} data-testid="storylab-compare-col" className="min-w-48 flex-1 border-l border-border p-2 text-sm"><PanelHeader title={col.title} />{col.turns.map((t) => <label key={t.id} className="mb-2 block"><Checkbox aria-label={tk("app-storylab-scene-lab.scene-lab.aria-label.d174e7f3de39")} checked={chosenLines.includes(t.id)} onCheckedChange={(yes) => setChosenLines((old) => yes ? [...old, t.id] : old.filter((id) => id !== t.id))} /><strong className="ml-1">{state.assets[t.speaker]?.name ?? t.speaker}</strong><p>{t.text}</p></label>)}<p>{tk("app-storylab-scene-lab.scene-lab.p.60257a417868", { lines: String(count.lines), words: String(count.words) })}</p>{col.session ? <ToolbarButton disabled={!editable || busy || groupBusy} onClick={() => saveSuggestion("scene_draft", { sceneId, turns: col.turns }, col.session)}>{tk("app-storylab-scene-lab.scene-lab.toolbar-button.85243945086a")}</ToolbarButton> : null}</section>;
          })}</div> : null}
          {compare ? <ToolbarButton disabled={!editable || busy || groupBusy || !chosenLines.length} onClick={() => perform(async () => { for (const b of data.blocks.filter((b) => b.kind === "dialogue" && chosenLines.includes(b.id))) {
            const r = await suggest({ data: { projectId, sessionId: null, kind: "line", payload: { sceneId, speakerAssetId: data.speakers.get(b.id) ?? null, text: b.text, sessionId: null, turnId: b.id } } }); if (!r.ok) throw new Error(r.message); setSavedId(saved(r.id));
          }
          for (const s of variants) for (const t of s.turns.filter((t) => t.kind === "line" && chosenLines.includes(t.id))) { const r = await suggest({ data: { projectId, sessionId: s.id, turnId: t.id, kind: "line", payload: { sceneId, speakerAssetId: t.speaker, text: t.text, sessionId: s.id, turnId: t.id } } }); if (!r.ok) throw new Error(r.message); setSavedId(saved(r.id)); } setChosenLines([]); })}>{tk("app-storylab-scene-lab.scene-lab.toolbar-button.8886491bd365")}</ToolbarButton> : null}
          {openId ? <p>{opened.isError ? tk("app-storylab-scene-lab.scene-lab.p.84295ce17e6a") : tk("app-storylab-scene-lab.scene-lab.p.8dabc487657b")}</p> : null}
          {note ? <p className="text-xs text-text-tertiary">{note}</p> : null}
          {savedId ? <SavedSuggestion id={savedId} /> : null}
          {error ? <div role="alert" className="text-sm text-status-danger">{error}<ToolbarButton onClick={() => { const retry = retrySave.current; if (retry) void perform(retry); else setDialog(tab === "improv" ? "variants" : tab === "check" ? "check" : "analysis"); }}>{tk("app-storylab-scene-lab.scene-lab.toolbar-button.c5b283eb3a0f")}</ToolbarButton></div> : null}
        </div>
      </section>
    </div>
    {dialog ? <Dialog open onOpenChange={(open) => { if (!open && !busy) setDialog(null); }}><DialogContent data-testid="storylab-scene-dialog"><DialogHeader><DialogTitle>{dialog === "analysis" ? tk("app-storylab-scene-lab.scene-lab.dialog-title.15f59547e798") : dialog === "check" ? tk("app-storylab-scene-lab.scene-lab.dialog-title.9d92952c97bf") : dialog === "variants" ? tk("app-storylab-scene-lab.scene-lab.dialog-title.8fa3f8d3c533") : tk("app-storylab-scene-lab.scene-lab.dialog-title.77cb309ea184")}</DialogTitle></DialogHeader>
      {dialog === "improv" ? <Textarea data-testid="storylab-scene-situation" aria-label={tk("app-storylab-scene-lab.scene-lab.aria-label.5abac0bc7ba8")} maxLength={8000} value={situation} onChange={(e) => setSituation(e.target.value)} /> : null}
      {dialog === "variants" ? <><select aria-label={tk("app-storylab-scene-lab.scene-lab.aria-label.b81a2f33e19b")} value={fromTurnId ?? ""} onChange={(e) => setFromTurnId(e.target.value || null)}><option value="">{tk("app-storylab-scene-lab.scene-lab.option.7a44fdeccb10")}</option>{session?.turns.map((t, i) => <option key={t.id} value={t.id}>{i + 1}: {t.text.slice(0, 60)}</option>)}</select>{directions.map((d, i) => <Textarea key={i} data-testid={`storylab-variant-${["a", "b", "c"][i]}`} aria-label={["A", "B", "C"][i]} maxLength={8000} value={d} onChange={(e) => setDirections((old) => old.map((v, n) => n === i ? e.target.value : v))} />)}</> : null}
      <p className="text-sm text-text-secondary">{tk("app-storylab-scene-lab.scene-lab.p.3a246d42f794", { value1: String(usd(estimate.usd * (dialog === "variants" ? directions.filter((d) => d.trim()).length * 8 : dialog === "improv" ? 8 : 1))), label: String(estimate.label) })}</p>
      <ToolbarButton variant="primary" data-testid="storylab-scene-confirm" disabled={busy || estimate.loading || !!estimate.error || (dialog === "variants" && !directions.some((d) => d.trim()))} onClick={() => { const action = dialog; setDialog(null); if (action === "analysis") void analyze(); else if (action === "check") { setCheckApproved(true); void checkLine(); } else if (action === "variants") void runVariants(); else void perform(async () => {
        let s = await make("scene_improv"); setTab("improv");
        await runSceneBatch({ state, session: s, language: "nb", shouldStop: () => stopped.current,
          generate: async (input) => { const r = await gen({ data: { projectId, task: "storylab_group", ...input, maxTokens: 2000 } }); if (!r.ok) throw new Error(r.message); if (r.usedFallback) setNote(tk("app-storylab-scene-lab.generate.set-note.16319cc4cfd3.2")); return r; },
          save: async (turn, cost) => {
            retrySave.current = async () => { s = await save(s, [turn], cost); setSession(s); retrySave.current = null; };
            await retrySave.current();
          } });
        setSession(await save(s, []));
      }); }}>{tk("app-storylab-scene-lab.scene-lab.toolbar-button.3b2009ae849b")}</ToolbarButton>
      {estimate.error ? <p role="alert">{estimate.error}</p> : null}
    </DialogContent></Dialog> : null}
  </div>;
}