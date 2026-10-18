/**
 * Intervjuet i Story Lab (SL7 §4): «Intervju – utvikle en idé». En dramaturgisk samarbeidspartner stiller ett
 * eller to spørsmål om gangen (interviewSystemPrompt). Svarer på grensesnittets språk. Turene lagres med
 * appendStoryTurns; kostnad vises før første melding og som løpende sum. «Foreslå noder fra intervjuet …» gir
 * en forhåndsvisning med valg; ingenting legges på canvaset uten at brukeren velger det.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  L,
  canvasSummary,
  interviewNodesFromJson,
  interviewSystemPrompt,
  interviewToNodesPrompt,
  newId,
  unreadableReplyMessage,
  type CanvasNode,
  type InterviewMessage,
  type ProjectState,
  type ProposedCanvas,
} from "@/core";
import { generateText } from "@/adapters/ai/text.functions";
import { appendStoryTurns, createStorySession, getStorySession, type StoredTurn } from "@/adapters/storylab/sessions.functions";
import { useLanguage } from "@/app/i18n/language";
import type { Commands } from "@/app/project/use-commands";
import { PanelHeader, ToolbarButton } from "@/app/shell/workspace-chrome";
import { Textarea } from "@/components/ui/textarea";
import { usd, useTextEstimate } from "./storylab-data";
import { InterviewNodesPreview } from "./InterviewNodesPreview";

const OUT_TOKENS = 600;
const NODES_OUT_TOKENS = 2000;
export const INTERVIEWER = "interviewer";

export interface InterviewViewProps {
  state: ProjectState;
  projectId: string;
  cmds: Commands;
  editable: boolean;
  sessionId: string | null;
  onCreated: (id: string) => void;
  selection: readonly CanvasNode[];
  origin: { x: number; y: number };
  onAdded: (ids: string[]) => void;
}

export function InterviewView(p: InterviewViewProps) {
  const get = useServerFn(getStorySession);
  const create = useServerFn(createStorySession);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["story-session", p.projectId, p.sessionId],
    queryFn: () => get({ data: { projectId: p.projectId, sessionId: p.sessionId! } }),
    enabled: !!p.sessionId,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const start = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await create({ data: { projectId: p.projectId, kind: "interview", title: L("Intervju – utvikle en idé", "Interview – develop an idea"), context: {} } });
      if (!r.ok) return setErr(r.message);
      await qc.invalidateQueries({ queryKey: ["story-sessions", p.projectId] });
      p.onCreated(r.session.id);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  if (!p.sessionId)
    return (
      <div className="space-y-2 p-3 text-[13px]" data-testid="storylab-interview">
        <PanelHeader title={L("Intervju – utvikle en idé", "Interview – develop an idea")} />
        <p className="text-text-secondary">{L("En erfaren manusutvikler stiller spørsmål og hjelper deg å utvikle idéen. Svarene kan bli noder på canvaset.", "An experienced script developer asks questions and helps you develop the idea. The answers can become nodes on the canvas.")}</p>
        {p.editable ? <ToolbarButton variant="primary" disabled={busy} data-testid="interview-start" onClick={() => void start()}>{busy ? <Loader2 className="animate-spin" /> : null}{L("Start intervjuet", "Start the interview")}</ToolbarButton> : null}
        {err ? <p role="alert" className="text-status-danger">{err}</p> : null}
      </div>
    );
  if (q.isLoading || !q.isFetchedAfterMount) return <p className="p-3 text-[13px] text-text-tertiary" data-testid="storylab-interview">{L("Henter intervjuet …", "Loading the interview …")}</p>;
  if (!q.data || !q.data.ok)
    return <div role="alert" className="p-3 text-[13px] text-status-danger" data-testid="storylab-interview">{q.data && !q.data.ok ? q.data.message : L("Intervjuet kunne ikke hentes.", "The interview could not be loaded.")}<ToolbarButton onClick={() => void q.refetch()}>{L("Prøv igjen", "Try again")}</ToolbarButton></div>;
  return <Interview key={p.sessionId} {...p} sessionId={p.sessionId} initialTurns={q.data.session.turns} initialCost={q.data.session.costUsd} />;
}

function Interview({ state, projectId, cmds, editable, sessionId, selection, origin, onAdded, initialTurns, initialCost }: InterviewViewProps & {
  sessionId: string; initialTurns: readonly StoredTurn[]; initialCost: number;
}) {
  const [turns, setTurns] = useState<StoredTurn[]>([...initialTurns]);
  const [cost, setCost] = useState(initialCost);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"send" | "nodes" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposedCanvas | null>(null);
  const gen = useServerFn(generateText);
  const append = useServerFn(appendStoryTurns);
  const qc = useQueryClient();
  const language = useLanguage() === "en" ? "en" : "nb";
  const summary = canvasSummary(state);
  const system = interviewSystemPrompt({ language, canvasSummary: summary, projectTitle: state.project.name });
  const messages = (extra?: string): InterviewMessage[] => [
    ...turns.filter((t) => t.kind === "question" || t.kind === "line").map((t): InterviewMessage => ({ role: t.speaker === INTERVIEWER ? "assistant" : "user", content: t.text })),
    ...(extra !== undefined ? [{ role: "user" as const, content: extra }] : []),
  ];
  const est = useTextEstimate("storylab_interview", system.length + messages(text).reduce((n, m) => n + m.content.length, 0), OUT_TOKENS);
  const asked = turns.some((t) => t.speaker === INTERVIEWER);

  const cache = (added: StoredTurn[], costUsd: number) =>
    qc.setQueryData<Awaited<ReturnType<typeof getStorySession>>>(["story-session", projectId, sessionId], (old) =>
      old?.ok ? { ...old, session: { ...old.session, turns: [...old.session.turns, ...added], costUsd } } : old);

  const send = async (message: string) => {
    if (!message.trim()) return;
    setBusy(true); setErr(null); setConfirming(null);
    try {
      const r = await gen({ data: { projectId, task: "storylab_interview", system, messages: messages(message), maxTokens: OUT_TOKENS } });
      if (!r.ok) { setFailed(message); return setErr(r.message); }
      const at = new Date().toISOString();
      const mine: StoredTurn = { id: newId<"turn">(), speaker: "director", text: message, kind: "question", at };
      const reply: StoredTurn = { id: newId<"turn">(), speaker: INTERVIEWER, text: r.text, kind: "line", at };
      const saved = await append({ data: { projectId, sessionId, turns: [mine, reply], addCostUsd: r.costUsd } });
      if (!saved.ok) { setFailed(message); return setErr(saved.message); }
      setTurns((t) => [...t, mine, reply]);
      setCost(saved.costUsd);
      cache([mine, reply], saved.costUsd);
      setText(""); setFailed(null);
      if (r.usedFallback) setNote(L("Den innebygde AI-en ble brukt fordi ingen egen tekstleverandør kunne brukes.", "The built-in AI was used because no own text provider could be used."));
      void qc.invalidateQueries({ queryKey: ["story-sessions", projectId] });
    } catch (e) { setFailed(message); setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const propose = async () => {
    setBusy(true); setErr(null); setConfirming(null); setFailed(null);
    try {
      const prompt = interviewToNodesPrompt({ language, canvasSummary: summary, transcript: messages() });
      const r = await gen({ data: { projectId, task: "storylab_interview", system: prompt.system, messages: [{ role: "user", content: prompt.user }], maxTokens: NODES_OUT_TOKENS } });
      if (!r.ok) return setErr(r.message);
      const saved = await append({ data: { projectId, sessionId, turns: [], addCostUsd: r.costUsd } });
      if (saved.ok) { setCost(saved.costUsd); cache([], saved.costUsd); }
      const parsed = interviewNodesFromJson(r.text);
      if (!parsed) return setErr(unreadableReplyMessage());
      setProposal(parsed);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="storylab-interview">
      <PanelHeader title={L("Intervju – utvikle en idé", "Interview – develop an idea")} />
      <p className="px-3 text-[11px] text-text-tertiary" data-testid="storylab-cost">{L(`Brukt i intervjuet: ${usd(cost)}`, `Spent in the interview: ${usd(cost)}`)}</p>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-[13px]">
        {turns.length === 0 ? <p className="text-text-tertiary">{L("Fortell kort om idéen din, så stiller intervjueren spørsmål.", "Briefly describe your idea, and the interviewer will ask questions.")}</p> : null}
        {turns.filter((t) => t.kind === "question" || t.kind === "line").map((t) => (
          <div key={t.id} data-turn-id={t.id} data-testid="interview-turn" data-speaker={t.speaker === INTERVIEWER ? "interviewer" : "director"} tabIndex={-1}
            className={`rounded-sm p-2 ${t.speaker === INTERVIEWER ? "bg-surface-2" : "bg-surface-3"}`}>
            <p className="text-[11px] text-text-tertiary">{t.speaker === INTERVIEWER ? L("Manusutvikler", "Script developer") : L("Du", "You")}</p>
            <p className="whitespace-pre-wrap break-words">{t.text}</p>
          </div>
        ))}
        {busy ? <p className="flex items-center gap-2 text-[12px] text-text-tertiary"><Loader2 className="size-3.5 animate-spin" aria-hidden />{L("Tenker …", "Thinking …")}</p> : null}
        {err ? (
          <div role="alert" className="rounded-sm border border-status-danger/40 p-2 text-status-danger" data-testid="storylab-error">
            <p className="text-[12px]">{err}</p>
            <ToolbarButton onClick={() => (failed ? void send(failed) : void propose())} data-testid="storylab-retry">{L("Prøv igjen", "Try again")}</ToolbarButton>
          </div>
        ) : null}
        {note ? <p className="text-[12px] text-text-tertiary">{note}</p> : null}
      </div>
      {editable ? (
        <div className="shrink-0 space-y-2 border-t border-border p-3">
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label={L("Svar til intervjueren", "Reply to the interviewer")} data-testid="interview-input"
            placeholder={L("Skriv svaret ditt …", "Write your answer …")} />
          <div className="flex flex-wrap gap-1">
            <ToolbarButton variant="primary" data-testid="interview-send" disabled={busy || !text.trim() || !!est.error}
              onClick={() => (cost === 0 && !asked && confirming !== "send" ? setConfirming("send") : void send(text))}>
              <Send />{L("Send", "Send")}
            </ToolbarButton>
            <ToolbarButton data-testid="interview-propose-nodes" disabled={busy || !asked} onClick={() => setConfirming("nodes")}>
              <Sparkles />{L("Foreslå noder fra intervjuet …", "Propose nodes from the interview …")}
            </ToolbarButton>
          </div>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-surface-2 p-2 text-[12px]" data-testid="storylab-confirm">
              <span className="text-text-secondary">
                {est.loading ? L("Finner tekst-AI …", "Finding text AI …") : L(`${est.label} · anslått ${usd(confirming === "nodes" ? est.usd * 3 : est.usd)}`, `${est.label} · estimated ${usd(confirming === "nodes" ? est.usd * 3 : est.usd)}`)}
              </span>
              <ToolbarButton variant="primary" data-testid="storylab-confirm-send" onClick={() => (confirming === "nodes" ? void propose() : void send(text))}>{L("Godta og fortsett", "Accept and continue")}</ToolbarButton>
              <ToolbarButton onClick={() => setConfirming(null)}>{L("Avbryt", "Cancel")}</ToolbarButton>
            </div>
          ) : null}
          {est.error ? <p className="text-[12px] text-status-danger">{est.error}</p> : null}
        </div>
      ) : null}
      {proposal ? <InterviewNodesPreview proposal={proposal} cmds={cmds} selection={selection} origin={origin} onClose={() => setProposal(null)} onAdded={(ids) => { setProposal(null); onAdded(ids); }} /> : null}
    </div>
  );
}
