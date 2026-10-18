/**
 * Intervjuet i Story Lab (SL7): en dramaturgisk samarbeidspartner som utvikler en idé, og forslag til
 * canvasnoder fra samtalen. Promptene er på engelsk; svaret kommer på grensesnittets språk. Intervjuet får
 * bare en kort tekst om canvaset (canvasSummary), aldri fakta eller hemmeligheter fra story_facts.
 */
import type { CanvasEdgeKind, CanvasNodeKind } from "../model";
import {
  CANVAS_BODY_MAX,
  CANVAS_EDGE_KINDS,
  CANVAS_LABEL_MAX,
  CANVAS_NODE_KINDS,
  CANVAS_SUMMARY_MAX,
  CANVAS_TITLE_MAX,
} from "./canvas";
import { parseJsonLoose } from "./prompts";

const LANG_NAME: Record<string, string> = {
  nb: "Norwegian (Bokmal)",
  nn: "Norwegian (Nynorsk)",
  en: "English",
};
const langName = (l: string) => LANG_NAME[l] ?? l;

export interface InterviewPromptInput {
  readonly language: string;
  /** Kort tekst om canvaset (høyst 4000 tegn, se canvasSummary). */
  readonly canvasSummary: string;
  readonly projectTitle: string;
}

export const INTERVIEW_TOPICS = [
  "core idea",
  "theme",
  "genre",
  "mood",
  "goal",
  "main conflict",
  "characters",
  "wants",
  "obstacles",
  "relationships",
  "events",
  "development",
  "ending",
] as const;

export function interviewSystemPrompt(i: InterviewPromptInput): string {
  const summary = i.canvasSummary.slice(0, CANVAS_SUMMARY_MAX).trim();
  return [
    "You are an experienced script developer and dramaturgical partner helping a filmmaker develop a new film project.",
    `Always answer in ${langName(i.language)}.`,
    "Ask one or two questions at a time, never a long list. Keep each reply short.",
    "Skip anything that has already been answered in the conversation or on the canvas. Build on what the filmmaker says.",
    "Challenge constructively: point out clichés, weak motivation, missing stakes or contradictions, and offer an alternative when useful. Never take over the story; the filmmaker decides.",
    `Cover these topics over the course of the interview, in a natural order: ${INTERVIEW_TOPICS.join(", ")}.`,
    "",
    `# Project: ${i.projectTitle || "(untitled)"}`,
    "",
    "# Canvas so far",
    summary || "(empty)",
  ].join("\n");
}

export interface InterviewMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/** Ber om JSON med noder og kanter fra samtalen. */
export function interviewToNodesPrompt(i: {
  readonly language: string;
  readonly canvasSummary: string;
  readonly transcript: readonly InterviewMessage[];
}): { system: string; user: string } {
  const system = [
    "You turn a story-development interview into nodes for a visual story canvas.",
    `Write titles and bodies in ${langName(i.language)}.`,
    "Return ONLY JSON of the form:",
    '{"nodes":[{"tempId":"n1","kind":"premise","title":"…","body":"…"}],"edges":[{"from":"n1","to":"n2","kind":"leads_to","label":""}]}',
    `Allowed node kinds: ${CANVAS_NODE_KINDS.filter((k) => k !== "group").join(", ")}.`,
    `Allowed edge kinds: ${CANVAS_EDGE_KINDS.join(", ")}.`,
    `Titles at most ${CANVAS_TITLE_MAX} characters, bodies short (a few sentences). At most 40 nodes.`,
    "Only include what was actually said or agreed in the interview. Do not duplicate nodes already on the canvas.",
  ].join("\n");
  const user = [
    "# Canvas so far",
    i.canvasSummary.slice(0, CANVAS_SUMMARY_MAX) || "(empty)",
    "",
    "# Interview",
    ...i.transcript.map((m) => `${m.role === "user" ? "Filmmaker" : "Developer"}: ${m.content}`),
  ].join("\n");
  return { system, user };
}

export interface ProposedNode {
  readonly tempId: string;
  readonly kind: CanvasNodeKind;
  readonly title: string;
  readonly body: string;
}
export interface ProposedEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: CanvasEdgeKind;
  readonly label: string;
}
export interface ProposedCanvas {
  readonly nodes: readonly ProposedNode[];
  readonly edges: readonly ProposedEdge[];
}

const MAX_PROPOSED = 40;

/**
 * Leser og validerer svaret. Ugyldige noder og kanter hoppes over; kanter som peker på ukjente noder
 * forkastes. Null når svaret ikke kan tolkes eller ikke har noen gyldige noder.
 */
export function interviewNodesFromJson(raw: string): ProposedCanvas | null {
  const j = parseJsonLoose(raw);
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  if (!Array.isArray(o["nodes"])) return null;
  const nodes: ProposedNode[] = [];
  const ids = new Set<string>();
  for (const n of o["nodes"] as unknown[]) {
    if (nodes.length >= MAX_PROPOSED) break;
    if (!n || typeof n !== "object") continue;
    const x = n as Record<string, unknown>;
    const tempId = typeof x["tempId"] === "string" ? x["tempId"].trim() : "";
    const kind = x["kind"] as CanvasNodeKind;
    const title = typeof x["title"] === "string" ? x["title"].trim() : "";
    const body = typeof x["body"] === "string" ? x["body"].trim() : "";
    if (!tempId || ids.has(tempId) || !CANVAS_NODE_KINDS.includes(kind) || kind === "group" || !title)
      continue;
    ids.add(tempId);
    nodes.push({
      tempId,
      kind,
      title: title.slice(0, CANVAS_TITLE_MAX),
      body: body.slice(0, CANVAS_BODY_MAX),
    });
  }
  if (!nodes.length) return null;
  const edges: ProposedEdge[] = [];
  for (const e of Array.isArray(o["edges"]) ? (o["edges"] as unknown[]) : []) {
    if (!e || typeof e !== "object") continue;
    const x = e as Record<string, unknown>;
    const from = typeof x["from"] === "string" ? x["from"] : "";
    const to = typeof x["to"] === "string" ? x["to"] : "";
    const kind = x["kind"] as CanvasEdgeKind;
    if (!ids.has(from) || !ids.has(to) || from === to || !CANVAS_EDGE_KINDS.includes(kind)) continue;
    if (edges.some((d) => d.from === from && d.to === to && d.kind === kind)) continue;
    const label = typeof x["label"] === "string" ? x["label"].trim().slice(0, CANVAS_LABEL_MAX) : "";
    edges.push({ from, to, kind, label });
  }
  return { nodes, edges };
}
