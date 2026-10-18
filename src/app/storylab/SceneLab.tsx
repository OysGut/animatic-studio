/** SL5: sceneanalyse, replikksjekk og improvisasjon. Manus er alltid skrivebeskyttet. */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ANALYSIS_ASPECTS, ANALYSIS_ASPECT_LABEL, L, knowledgeAt, lineCheckFromJson, lineCheckPrompt, locale, newId, parseJsonLoose, profileAt, sceneAnalysisFromJson, sceneAnalysisPrompt, unreadableReplyMessage, type LineCheckResult, type ProjectState, type SceneAnalysisPoint } from "@/core";
import { generateText } from "@/adapters/ai/text.functions";
import { appendStoryTurns, createStorySession, forkStorySession, getStorySession, saveStorySuggestion, type StorySession, type StoredTurn } from "@/adapters/storylab/sessions.functions";
import { Toolbar, ToolbarButton, PanelHeader } from "@/app/shell/workspace-chrome";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { GroupConversationView } from "./GroupConversationView";
import { profileStatus, usd, useTextEstimate } from "./storylab-data";
import { sceneLabData, lineAndWordCount } from "./scene-lab-data";
import { runSceneBatch } from "./scene-batch";

type Check = { blockId: string; result: LineCheckResult; turnId: string };
export function SceneLab({ state, projectId, sceneId, editable, initialSession, onProfile, onScene }: {
  state: ProjectState; projectId: string; sceneId: string; editable: boolean;
  initialSession?: StorySession; onProfile?: (id: string) => void; onScene?: (id: string) => void;
}) {
  const data = sceneLabData(state, sceneId);
  const language = locale() === "en" ? "en" : "nb";
  const [tab, setTab] = useState<"analysis" | "improv" | "check">(initialSession?.kind === "scene_improv" ? "improv" : "analysis");
  const [session, setSession] = useState<StorySession | null>(initialSession ?? null);
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
  const [fromTurn, setFromTurn] = useState(-1);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const stopped = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [checkApproved, setCheckApproved] = useState(false);
  const gen = useServerFn(generateText), create = useServerFn(createStorySession), append = useServerFn(appendStoryTurns), fork = useServerFn(forkStorySession), suggest = useServerFn(saveStorySuggestion), get = useServerFn(getStorySession);
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = useQuery({ queryKey: ["story-session", projectId, openId], queryFn: () => get({ data: { projectId, sessionId: openId ?? "" } }), enabled: !!openId, refetchOnMount: "always", refetchOnWindowFocus: false });
  useEffect(() => { mounted.current = true; onScene?.(sceneId); return () => { mounted.current = false; stopped.current = true; }; }, [sceneId]);
  useEffect(() => {
    if (opened.data?.ok && opened.isFetchedAfterMount) { setSession(opened.data.session); setOpenId(null); }
  }, [opened.data, opened.isFetchedAfterMount]);
  useEffect(() => {
    if (!session || session.kind !== "scene_analysis") return;
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
  const estimate = useTextEstimate(dialog === "variants" || dialog === "improv" ? "storylab_group" : "storylab_analysis", dialog === "variants" || dialog === "improv" ? situation.length + 6000 : prompt.system.length + prompt.user.length, dialog === "analysis" ? 2000 : 800);
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
    if (lock.current || !editable) return;
    lock.current = true; stopped.current = false; setBusy(true); setError(null);
    try { await action(); } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : L("Handlingen kunne ikke fullføres. Prøv igjen.", "The action could not be completed. Try again.")); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const checkLine = () => perform(async () => {
    if (!checkPrompt || !block) return;
    const r = await gen({ data: { projectId, task: "storylab_analysis", json: true, system: checkPrompt.system, messages: [{ role: "user", content: checkPrompt.user }], maxTokens: 800 } });
    if (!r.ok) throw new Error(r.message);
    const result = lineCheckFromJson(r.text); if (!result) throw new Error(unreadableReplyMessage());
    const s = session?.kind === "scene_analysis" ? session : await make("scene_analysis");
    const turn: StoredTurn = { id: newId<"turn">(), speaker: "analyst", kind: "analysis", text: JSON.stringify({ blockId: block.id, result }), at: new Date().toISOString() };
    setSession(await save(s, [turn], r.costUsd)); setTab("check");
    if (r.usedFallback) setNote(L("Den innebygde AI-en ble brukt som reserve.", "The built-in AI was used as fallback."));
  });
  const analyze = () => perform(async () => {
    const r = await gen({ data: { projectId, task: "storylab_analysis", json: true, system: analysisPrompt.system, messages: [{ role: "user", content: analysisPrompt.user }], maxTokens: 2000 } });
    if (!r.ok) throw new Error(r.message);
    const p = sceneAnalysisFromJson(r.text, data.blocks.map((b) => b.id));
    if (!p || !ANALYSIS_ASPECTS.every((a) => p.filter((x) => x.aspect === a).length === 1)) throw new Error(unreadableReplyMessage());
    const s = await make("scene_analysis");
    setSession(await save(s, [{ id: newId<"turn">(), speaker: "analyst", kind: "analysis", text: r.text, at: new Date().toISOString() }], r.costUsd)); setPoints(p);
    if (r.usedFallback) setNote(L("Den innebygde AI-en ble brukt som reserve.", "The built-in AI was used as fallback."));
  });
  const runVariants = () => perform(async () => {
    if (!session || session.kind !== "scene_improv") return;
    const added: StorySession[] = [];
    for (let i = 0; i < 3 && !stopped.current; i++) {
      const direction = directions[i]?.trim(); if (!direction) continue;
      const label = ["A", "B", "C"][i] ?? "A";
      const r = await fork({ data: { projectId, sessionId: session.id, fromTurn, title: `${data.heading} · ${label}` } });
      if (!r.ok) throw new Error(r.message);
      let branch = await save(r.session, [{ id: `d:session:all:${newId<"direction">()}`, speaker: "director", kind: "direction", text: direction, at: new Date().toISOString(), to: null }], 0, "active");
      added.push(branch); setVariants((old) => [...old, branch]);
      await runSceneBatch({ state, session: branch, language, shouldStop: () => stopped.current,
        generate: async (input) => { const result = await gen({ data: { projectId, task: "storylab_group", ...input, maxTokens: 800 } }); if (!result.ok) throw new Error(result.message); if (result.usedFallback && mounted.current) setNote(L("Den innebygde AI-en ble brukt som reserve.", "The built-in AI was used as fallback.")); return result; },
        save: async (turn, cost) => { branch = await save(branch, [turn], cost, "active"); setVariants((old) => old.map((s) => s.id === branch.id ? branch : s)); },
      });
      branch = await save(branch, []); setVariants((old) => old.map((s) => s.id === branch.id ? branch : s));
    }
    setChosenVariants(added.map((s) => s.id)); setCompare(true);
  });
  const saveSuggestion = (kind: "analysis" | "line" | "scene_draft", payload: Record<string, unknown>, s = session, turnId?: string) => perform(async () => {
    const r = await suggest({ data: { projectId, sessionId: s?.id ?? null, kind, payload, ...(turnId ? { turnId } : {}) } }); if (!r.ok) throw new Error(r.message); setNote(L("Lagret som forslag.", "Saved as a suggestion."));
  });
  const evidence = (source: string) => <ToolbarButton key={source} data-testid="storylab-evidence" className="text-xs" onClick={() => {
    if (source.startsWith("profile:")) { const a = data.participants.find((a) => source.slice(8).startsWith(`${a.name}.`)); if (a) onProfile?.(a.id); }
    else { setHighlight(source); document.getElementById(`scene-block-${source}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }}>{source}</ToolbarButton>;
  const checkCard = (c: Check) => <div className="border border-border bg-surface-2 p-2 text-sm" key={c.turnId}>
    <span data-testid="storylab-line-verdict" data-verdict={c.result.verdict} className="text-accent-brand">{c.result.verdict === "yes" ? L("Ja", "Yes") : c.result.verdict === "partly" ? L("Delvis", "Partly") : L("Nei", "No")}</span>
    {c.result.reasons.map((r, i) => <div key={i}><p>{r.text}</p><div className="flex flex-wrap">{r.evidence.map((e) => <ToolbarButton key={e} onClick={() => { const id = data.speakers.get(c.blockId); if (id && e.startsWith("profile.")) onProfile?.(id); }}>{e}</ToolbarButton>)}</div></div>)}
    {c.result.rewrite ? <><p className="font-script">{c.result.rewrite}</p><ToolbarButton disabled={!editable || busy} onClick={() => saveSuggestion("line", { sceneId, blockId: c.blockId, original: data.blocks.find((b) => b.id === c.blockId)?.text ?? "", suggestion: c.result.rewrite }, session, c.turnId)}>{L("Lagre som forslag", "Save as suggestion")}</ToolbarButton></> : null}
    {(() => { const id = data.speakers.get(c.blockId); return id && !profileAt(state, id, sceneId as never) ? <ToolbarButton onClick={() => onProfile?.(id)}>{L("Lag profil", "Create profile")}</ToolbarButton> : null; })()}
  </div>;
  return <div data-testid="storylab-scenelab" className="flex min-h-0 flex-1 flex-col">
    <Toolbar title={data.heading || L("Scenelaben", "Scene lab")} status={session ? usd(session.costUsd) : undefined} />
    <div className="flex min-h-0 flex-1 flex-wrap">
      <section className="min-w-0 flex-1 overflow-y-auto border-r border-border p-3">
        <PanelHeader title={L("Scenetekst", "Scene text")} />
        <div className="font-script text-sm text-text-primary">
          {data.blocks.map((b) => <div key={b.id} id={`scene-block-${b.id}`} data-testid="storylab-scene-block" data-block-id={b.id} data-highlighted={highlight === b.id} className={`group relative whitespace-pre-wrap py-1 ${b.kind === "dialogue" ? "mx-auto w-3/5" : b.kind === "character" || b.kind === "parenthetical" ? "pl-1/3" : ""} ${highlight === b.id ? "bg-accent-selection" : ""}`}>
            <p className={b.kind === "character" || b.kind === "heading" ? "uppercase" : ""}>{b.text}</p>
            {b.kind === "dialogue" && data.speakers.has(b.id) ? <ToolbarButton data-testid="storylab-line-check" disabled={!editable || busy} className="font-sans opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100" onClick={() => { setCheckBlock(b.id); setTab("check"); if (checkApproved) { setDialog("check"); } else setDialog("check"); }}>
              {L("Sjekk replikken", "Check line")}{!profileAt(state, data.speakers.get(b.id) ?? "", sceneId as never) ? L(" (ingen profil)", " (no profile)") : ""}
            </ToolbarButton> : null}
            {checks.filter((c) => c.blockId === b.id).map(checkCard)}
          </div>)}
        </div>
      </section>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PanelHeader title={L("Deltakere", "Participants")} />
        <div className="flex flex-wrap gap-1 p-2">{data.participants.map((a) => <ToolbarButton key={a.id} data-asset-id={a.id} data-profile={profileStatus(state, a.id)} onClick={() => onProfile?.(a.id)}>{a.name} · {profileStatus(state, a.id) === "active" ? L("Har profil", "Has a profile") : L("Ingen profil", "No profile")}</ToolbarButton>)}</div>
        <div role="tablist" className="flex border-b border-border">{(["analysis", "improv", "check"] as const).map((t) => <ToolbarButton key={t} role="tab" aria-selected={tab === t} active={tab === t} data-testid={`storylab-scene-tab-${t}`} onClick={() => setTab(t)}>{t === "analysis" ? L("Analyse", "Analysis") : t === "improv" ? L("Improviser", "Improvise") : L("Replikksjekk", "Line check")}</ToolbarButton>)}</div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
          {tab === "analysis" ? <><ToolbarButton data-testid="storylab-analyze" disabled={!editable || busy} onClick={() => setDialog("analysis")}>{L("Analyser scenen …", "Analyze scene …")}</ToolbarButton>{points.map((p) => <article key={p.aspect} data-testid="storylab-analysis-card" className="my-1 rounded-sm border border-border bg-surface-2 p-3 text-sm"><h3>{ANALYSIS_ASPECT_LABEL[p.aspect]}</h3>{p.uncertain ? <span className="text-status-uncertain">{L("usikker", "uncertain")}</span> : null}<p>{p.finding}</p><p className="text-text-secondary">{p.suggestion}</p><div className="flex flex-wrap">{p.evidence.map(evidence)}</div><ToolbarButton disabled={!editable || busy} onClick={() => saveSuggestion("analysis", { ...p })}>{L("Lagre som forslag", "Save as suggestion")}</ToolbarButton></article>)}</> : null}
          {tab === "check" ? <div className="space-y-2">{checks.map(checkCard)}</div> : null}
          {tab === "improv" ? <><div className="flex flex-wrap"><ToolbarButton data-testid="storylab-improvise" disabled={!editable || busy || data.participants.length < 2 || data.participants.length > 6} onClick={() => setDialog("improv")}>{L("Improviser scenen …", "Improvise scene …")}</ToolbarButton><ToolbarButton data-testid="storylab-variants" disabled={!editable || busy || session?.kind !== "scene_improv"} onClick={() => setDialog("variants")}>{L("Lag varianter …", "Create variants …")}</ToolbarButton><ToolbarButton data-testid="storylab-compare" onClick={() => setCompare(!compare)}>{L("Sammenlign", "Compare")}</ToolbarButton>{busy ? <ToolbarButton onClick={() => { stopped.current = true; }}>{L("Stopp", "Stop")}</ToolbarButton> : null}</div>
            {session?.kind === "scene_improv" && !openId ? <GroupConversationView key={session.id} state={state} projectId={projectId} session={session} editable={editable && !busy} onOpen={setOpenId} /> : null}
            {variants.map((v) => <label key={v.id} className="flex items-center gap-2"><Checkbox checked={chosenVariants.includes(v.id)} onCheckedChange={(yes) => setChosenVariants((old) => yes ? [...old, v.id] : old.filter((id) => id !== v.id))} />{v.title}</label>)}
          </> : null}
          {compare ? <div className="flex shrink-0 gap-2 overflow-x-auto">{[{ id: "original", title: L("Original", "Original"), turns: data.blocks.filter((b) => b.kind === "dialogue").map((b) => ({ id: b.id, text: b.text, speaker: data.speakers.get(b.id) ?? "?" })), session: null }, ...variants.filter((v) => chosenVariants.includes(v.id)).map((v) => ({ id: v.id, title: v.title, turns: v.turns.filter((t) => t.kind === "line"), session: v }))].map((col) => {
            const count = lineAndWordCount(col.turns);
            return <section key={col.id} data-testid="storylab-compare-col" className="min-w-48 flex-1 border-l border-border p-2 text-sm"><PanelHeader title={col.title} />{col.turns.map((t) => <label key={t.id} className="mb-2 block">{col.session ? <Checkbox aria-label={L("Velg replikk", "Select line")} checked={chosenLines.includes(t.id)} onCheckedChange={(yes) => setChosenLines((old) => yes ? [...old, t.id] : old.filter((id) => id !== t.id))} /> : null}<strong className="ml-1">{state.assets[t.speaker]?.name ?? t.speaker}</strong><p>{t.text}</p></label>)}<p>{L(`${count.lines} replikker · ${count.words} ord`, `${count.lines} lines · ${count.words} words`)}</p>{col.session ? <ToolbarButton disabled={!editable || busy} onClick={() => saveSuggestion("scene_draft", { sceneId, turns: col.turns }, col.session)}>{L("Lagre varianten som scenetekstutkast", "Save variant as scene draft")}</ToolbarButton> : null}</section>;
          })}</div> : null}
          {compare ? <ToolbarButton disabled={!editable || busy || !chosenLines.length} onClick={() => perform(async () => { for (const s of variants) for (const t of s.turns.filter((t) => t.kind === "line" && chosenLines.includes(t.id))) { const r = await suggest({ data: { projectId, sessionId: s.id, turnId: t.id, kind: "line", payload: { sceneId, speakerAssetId: t.speaker, text: t.text, sessionId: s.id, turnId: t.id } } }); if (!r.ok) throw new Error(r.message); } setChosenLines([]); setNote(L("Lagret som forslag.", "Saved as a suggestion.")); })}>{L("Lagre valgte som forslag", "Save selected as suggestions")}</ToolbarButton> : null}
          {openId ? <p>{opened.isError ? L("Økten kunne ikke hentes.", "The session could not be loaded.") : L("Henter økten …", "Loading session …")}</p> : null}
          {note ? <p className="text-xs text-text-tertiary">{note}</p> : null}
          {error ? <div role="alert" className="text-sm text-status-danger">{error}<ToolbarButton onClick={() => setDialog(tab === "improv" ? "variants" : tab === "check" ? "check" : "analysis")}>{L("Prøv igjen", "Try again")}</ToolbarButton></div> : null}
        </div>
      </section>
    </div>
    {dialog ? <Dialog open onOpenChange={(open) => { if (!open && !busy) setDialog(null); }}><DialogContent data-testid="storylab-scene-dialog"><DialogHeader><DialogTitle>{dialog === "analysis" ? L("Analyser scenen", "Analyze scene") : dialog === "check" ? L("Sjekk replikken", "Check line") : dialog === "variants" ? L("Lag varianter", "Create variants") : L("Improviser scenen", "Improvise scene")}</DialogTitle></DialogHeader>
      {dialog === "improv" ? <Textarea data-testid="storylab-scene-situation" aria-label={L("Situasjon", "Situation")} value={situation} onChange={(e) => setSituation(e.target.value)} /> : null}
      {dialog === "variants" ? <><select aria-label={L("Forgren fra tur", "Branch from turn")} value={fromTurn} onChange={(e) => setFromTurn(Number(e.target.value))}><option value={-1}>{L("Fra starten (tom gren)", "From the start (empty branch)")}</option>{session?.turns.map((t, i) => <option key={t.id} value={i}>{i + 1}: {t.text.slice(0, 60)}</option>)}</select>{directions.map((d, i) => <Textarea key={i} data-testid={`storylab-variant-${["a", "b", "c"][i]}`} aria-label={["A", "B", "C"][i]} value={d} onChange={(e) => setDirections((old) => old.map((v, n) => n === i ? e.target.value : v))} />)}</> : null}
      <p className="text-sm text-text-secondary">{L(`Anslått: ${usd(estimate.usd * (dialog === "variants" ? directions.filter((d) => d.trim()).length * 8 : dialog === "improv" ? 8 : 1))} · ${estimate.label}`, `Estimated: ${usd(estimate.usd * (dialog === "variants" ? directions.filter((d) => d.trim()).length * 8 : dialog === "improv" ? 8 : 1))} · ${estimate.label}`)}</p>
      <ToolbarButton variant="primary" data-testid="storylab-scene-confirm" disabled={busy || estimate.loading || !!estimate.error || (dialog === "variants" && !directions.some((d) => d.trim()))} onClick={() => { const action = dialog; setDialog(null); if (action === "analysis") void analyze(); else if (action === "check") { setCheckApproved(true); void checkLine(); } else if (action === "variants") void runVariants(); else void perform(async () => { setSession(await make("scene_improv")); setTab("improv"); }); }}>{L("Bekreft", "Confirm")}</ToolbarButton>
      {estimate.error ? <p role="alert">{estimate.error}</p> : null}
    </DialogContent></Dialog> : null}
  </div>;
}