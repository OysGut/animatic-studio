/**
 * Skrivehjelp i manuset (T2): rene promptbyggere. Serveren bygger promptene fra prosjekttilstanden; klienten
 * sender bare ID-er og valg. Instruksene er på engelsk, svaret på manusets språk (norsk bokmål for
 * hovedmanuset, engelsk for oversettelsesutkast).
 *
 * Kunnskapsgrensene (animatic-story-lab): når teksten skrives fra en karakters perspektiv, kommer bare det
 * `knowledgeAt` gir for karakteren med. Andres hemmeligheter, fakta bare regissøren kjenner og hendelser
 * senere i fortellingstid sendes aldri. Manustekst etter innsettingspunktet sendes aldri.
 */
import { L } from "../i18n";
import type { Asset, BlockKind, ProjectState, ScriptBlock, SceneOccurrence } from "../model";
import { activeStructure, blocksOfVariant } from "../views";
import { knowledgeAt } from "../storylab/facts";
import { profileAt } from "../storylab/stages";
import { profileText } from "../storylab/prompts";
import { formatHeading } from "../screenplay";

export type AssistKind = "rewrite" | "next_line" | "scene" | "polish" | "translate";
export const ASSIST_KINDS: readonly AssistKind[] = ["rewrite", "next_line", "scene", "polish", "translate"];
export type RewriteMode = "shorter" | "clearer" | "spoken" | "tone" | "free";
export const REWRITE_MODES: readonly RewriteMode[] = ["shorter", "clearer", "spoken", "tone", "free"];

export const MAX_ASSIST_INSTRUCTION = 500;
export const MAX_ASSIST_DESCRIPTION = 2000;
export const MAX_ASSIST_BLOCKS = 40;
export const MAX_ASSIST_BLOCK_CHARS = 2000;
export const ASSIST_CONTEXT_BLOCKS = 3;
export const MAX_ASSIST_EXCERPT_CHARS = 12_000;

/** Det klienten sender: bare ID-er og valg, aldri prompttekst. */
export interface AssistRequest {
  readonly kind: AssistKind;
  readonly productionId: string;
  /** Scenen det gjelder (for «scene»: scenen den nye settes inn etter; null = til slutt). */
  readonly occurrenceId: string | null;
  readonly blockIds: readonly string[];
  /** Neste replikk: linjen den settes inn etter (null = til slutt i scenen). */
  readonly afterBlockId?: string | null;
  readonly characterAssetId?: string | null;
  readonly canvasNodeId?: string | null;
  readonly description?: string;
  readonly mode?: RewriteMode;
  readonly instruction?: string;
}

export interface AssistPrompt {
  readonly system: string;
  readonly user: string;
  readonly maxTokens: number;
  readonly temperature: number;
  /** Lokal referanse i prompten → blokk-ID. */
  readonly refs: Readonly<Record<string, string>>;
}

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v);
const optStr = (v: unknown, max: number) => v === undefined || (typeof v === "string" && v.length <= max);

/** Kontroll av forespørselen (null = gyldig). */
export function assistRequestError(r: unknown): string | null {
  if (!r || typeof r !== "object") return L("Ugyldig forespørsel", "Invalid request");
  const x = r as Record<string, unknown>;
  if (!(ASSIST_KINDS as readonly unknown[]).includes(x["kind"])) return L("Ukjent skrivehjelp", "Unknown writing aid");
  if (!isId(x["productionId"])) return L("Ugyldig produksjon", "Invalid production");
  if (x["occurrenceId"] !== null && !isId(x["occurrenceId"])) return L("Ugyldig scene", "Invalid scene");
  const ids = x["blockIds"];
  if (!Array.isArray(ids) || ids.length > MAX_ASSIST_BLOCKS || !ids.every(isId))
    return L(`Velg høyst ${MAX_ASSIST_BLOCKS} linjer`, `Select at most ${MAX_ASSIST_BLOCKS} lines`);
  for (const k of ["afterBlockId", "characterAssetId", "canvasNodeId"])
    if (x[k] !== undefined && x[k] !== null && !isId(x[k])) return L("Ugyldig ID", "Invalid ID");
  if (!optStr(x["description"], MAX_ASSIST_DESCRIPTION))
    return L(`Beskrivelsen kan ha høyst ${MAX_ASSIST_DESCRIPTION} tegn`, `The description can have at most ${MAX_ASSIST_DESCRIPTION} characters`);
  if (!optStr(x["instruction"], MAX_ASSIST_INSTRUCTION))
    return L(`Ønsket kan ha høyst ${MAX_ASSIST_INSTRUCTION} tegn`, `The request can have at most ${MAX_ASSIST_INSTRUCTION} characters`);
  if (x["mode"] !== undefined && !(REWRITE_MODES as readonly unknown[]).includes(x["mode"])) return L("Ukjent omskriving", "Unknown rewrite");
  return null;
}

/** Hovedmanuset er på norsk bokmål (REQ-0331); oversettelsesutkastet på engelsk. */
export function replyLanguage(kind: AssistKind): string {
  return kind === "translate" ? "English" : "Norwegian Bokmål";
}

const KIND_LABEL: Record<BlockKind, string> = {
  heading: "HEADING",
  action: "ACTION",
  character: "CHARACTER",
  parenthetical: "PARENTHETICAL",
  dialogue: "DIALOGUE",
  transition: "TRANSITION",
  shot: "SHOT",
  note: "NOTE",
};

function occurrenceOf(s: ProjectState, id: string | null): SceneOccurrence | null {
  const o = id ? s.occurrences[id] : undefined;
  return o ?? null;
}

export function sceneBlocks(s: ProjectState, occurrenceId: string): ScriptBlock[] {
  const o = s.occurrences[occurrenceId];
  return o ? blocksOfVariant(s, o.variantId).filter((b) => !b.removed) : [];
}

function line(b: ScriptBlock, ref?: string): string {
  return `${ref ? `[${ref}] ` : ""}${KIND_LABEL[b.kind]}: ${b.text}`;
}

/** Klipper fra starten, så slutten (det nærmeste innsettingspunktet) alltid står. */
function tail(lines: readonly string[], max: number): string {
  const out: string[] = [];
  let n = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    n += lines[i]!.length + 1;
    if (n > max) break;
    out.unshift(lines[i]!);
  }
  return out.join("\n");
}

function headingText(s: ProjectState, o: SceneOccurrence): string {
  const v = s.variants[o.variantId];
  return v ? formatHeading(v.heading) : "";
}

function characterAssets(s: ProjectState): Asset[] {
  return Object.values(s.assets).filter((a) => !a.removed && (a.kind === "character" || a.kind === "animal"));
}

function namesMap(s: ProjectState): Record<string, string> {
  const m: Record<string, string> = {};
  for (const a of characterAssets(s)) m[a.id] = a.name;
  return m;
}

const JSON_RULE = "Reply with a single valid JSON value only, no markdown.";
const STYLE_RULE = "Cinematic, with subtext, never caricature.";

const MODE_TEXT: Record<RewriteMode, string> = {
  shorter: "Make the text shorter and tighter without losing meaning.",
  clearer: "Make the text clearer and easier to follow.",
  spoken: "Make the dialogue more natural and spoken.",
  tone: "Change the tone as requested by the user.",
  free: "Follow the user's request.",
};

function selected(s: ProjectState, r: AssistRequest): ScriptBlock[] | string {
  if (!r.occurrenceId) return L("Velg en scene", "Select a scene");
  const blocks = sceneBlocks(s, r.occurrenceId);
  const want = new Set(r.blockIds);
  const picked = blocks.filter((b) => want.has(b.id) && b.kind !== "heading");
  if (picked.length === 0) return L("Velg minst én linje", "Select at least one line");
  if (picked.length !== want.size) return L("Linjene må høre til scenen", "The lines must belong to the scene");
  if (picked.some((b) => b.text.length > MAX_ASSIST_BLOCK_CHARS))
    return L(`En linje er lengre enn ${MAX_ASSIST_BLOCK_CHARS} tegn`, `A line is longer than ${MAX_ASSIST_BLOCK_CHARS} characters`);
  return picked;
}

function editPrompt(s: ProjectState, r: AssistRequest, picked: ScriptBlock[], task: string): AssistPrompt {
  const blocks = sceneBlocks(s, r.occurrenceId!);
  const refs: Record<string, string> = {};
  const refOf = new Map<string, string>();
  picked.forEach((b, i) => {
    refs[`b${i + 1}`] = b.id;
    refOf.set(b.id, `b${i + 1}`);
  });
  const first = blocks.findIndex((b) => b.id === picked[0]!.id);
  const last = blocks.findIndex((b) => b.id === picked[picked.length - 1]!.id);
  const ctx = blocks.slice(Math.max(0, first - ASSIST_CONTEXT_BLOCKS), last + 1 + ASSIST_CONTEXT_BLOCKS);
  const occ = s.occurrences[r.occurrenceId!]!;
  const excerpt = tail(ctx.map((b) => line(b, refOf.get(b.id))), MAX_ASSIST_EXCERPT_CHARS);
  const lang = replyLanguage(r.kind);
  return {
    system: [
      "You are a professional screenwriting assistant for an animated feature film.",
      task,
      `Write the new text in ${lang}.`,
      "Only lines marked with [bN] may be changed; the others are context.",
      "Never change the type of a line, and keep character names unchanged.",
      STYLE_RULE,
      `${JSON_RULE} Format: {"blocks":[{"ref":"b1","text":"..."}]} with one entry per marked line.`,
    ].join("\n"),
    user: [
      `SCENE: ${headingText(s, occ)}`,
      r.instruction?.trim() ? `REQUEST: ${r.instruction.trim()}` : "",
      "SCRIPT EXCERPT:",
      excerpt,
    ]
      .filter(Boolean)
      .join("\n"),
    maxTokens: Math.min(4000, 200 + picked.reduce((n, b) => n + Math.ceil(b.text.length / 2), 0)),
    temperature: r.kind === "rewrite" ? 0.7 : 0.2,
    refs,
  };
}

/** Karakterens kunnskap som tekst: vanlige fakta, og egne hemmeligheter bare som antydning. */
export function knowledgeText(s: ProjectState, assetId: string, sceneId: string, withSecrets: boolean): string {
  const k = knowledgeAt(s, assetId, sceneId);
  return [
    "Known facts:",
    ...(k.facts.length ? k.facts.map((f) => `- ${f.text}`) : ["- (none)"]),
    ...(withSecrets && k.ownSecrets.length
      ? ["Own secrets (hint at them only; never state them outright):", ...k.ownSecrets.map((f) => `- ${f.text}`)]
      : []),
  ].join("\n");
}

function nextLinePrompt(s: ProjectState, r: AssistRequest): AssistPrompt | string {
  const occ = occurrenceOf(s, r.occurrenceId);
  if (!occ) return L("Velg en scene", "Select a scene");
  const asset = r.characterAssetId ? s.assets[r.characterAssetId] : undefined;
  if (!asset || asset.removed || (asset.kind !== "character" && asset.kind !== "animal"))
    return L("Velg en karakter", "Select a character");
  const blocks = sceneBlocks(s, occ.id);
  let upTo = blocks.length;
  if (r.afterBlockId) {
    const i = blocks.findIndex((b) => b.id === r.afterBlockId);
    if (i < 0) return L("Linjen hører ikke til scenen", "The line does not belong to the scene");
    upTo = i + 1;
  }
  // Bare teksten fram til innsettingspunktet
  const excerpt = tail(blocks.slice(0, upTo).map((b) => line(b)), MAX_ASSIST_EXCERPT_CHARS);
  const profile = profileAt(s, asset.id, occ.sceneId);
  return {
    system: [
      "You are a professional screenwriting assistant for an animated feature film.",
      `Write the next line of dialogue for ${asset.name.toUpperCase()}, continuing the scene naturally.`,
      "The character only knows what is listed under KNOWLEDGE. Never let the line reveal or rely on anything else.",
      `Write the line in ${replyLanguage("next_line")}.`,
      STYLE_RULE,
      `${JSON_RULE} Format: {"parenthetical": string or null, "line": "..."}`,
    ].join("\n"),
    user: [
      `CHARACTER: ${asset.name}`,
      profile ? `PROFILE:\n${profileText(profile, namesMap(s))}` : "",
      `KNOWLEDGE:\n${knowledgeText(s, asset.id, occ.sceneId, true)}`,
      r.instruction?.trim() ? `REQUEST: ${r.instruction.trim()}` : "",
      `SCENE: ${headingText(s, occ)}`,
      "SCRIPT SO FAR:",
      excerpt,
    ]
      .filter(Boolean)
      .join("\n"),
    maxTokens: 600,
    temperature: 0.8,
    refs: {},
  };
}

function scenePrompt(s: ProjectState, r: AssistRequest): AssistPrompt | string {
  const structure = activeStructure(s, r.productionId);
  const after = r.occurrenceId ? occurrenceOf(s, r.occurrenceId) : (structure[structure.length - 1] ?? null);
  if (r.occurrenceId && (!after || !after.active)) return L("Scenen finnes ikke", "The scene was not found");
  let brief = r.description?.trim() ?? "";
  if (r.canvasNodeId) {
    const n = s.canvasNodes[r.canvasNodeId];
    if (!n || n.removed || n.kind !== "scene") return L("Velg en scenenode", "Select a scene node");
    brief = [n.title.trim(), n.body.trim(), brief].filter(Boolean).join("\n");
  }
  if (!brief) return L("Skriv en kort beskrivelse", "Write a short description");
  const prevBlocks = after ? sceneBlocks(s, after.id) : [];
  const haystack = `${brief}\n${prevBlocks.filter((b) => b.kind === "character").map((b) => b.text).join("\n")}`.toLowerCase();
  const cast = characterAssets(s).filter((a) =>
    [a.name, ...a.names.map((x) => x.name)].some((n) => n.trim() && haystack.includes(n.trim().toLowerCase())),
  );
  // Flere karakterer skriver i samme scene: ingen hemmeligheter, bare det hver av dem vet
  const castText = cast
    .slice(0, 8)
    .map((a) => {
      const p = after ? profileAt(s, a.id, after.sceneId) : null;
      const speech = p ? [p.speech.level, p.speech.wordChoice, p.person.dialect].filter(Boolean).join("; ") : "";
      return [`### ${a.name}`, speech ? `Speech: ${speech}` : "", after ? knowledgeText(s, a.id, after.sceneId, false) : ""]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  return {
    system: [
      "You are a professional screenwriter for an animated feature film.",
      "Draft one new scene from the brief: a scene heading, action and dialogue.",
      "Characters only know what is listed for them. Never reveal anything else.",
      `Write the scene in ${replyLanguage("scene")}. Character names in CHARACTER lines are in capitals.`,
      STYLE_RULE,
      `${JSON_RULE} Format: {"heading":{"intExt":"INT.","location":"...","time":"..."},"blocks":[{"kind":"action|character|parenthetical|dialogue|transition","text":"..."}]}`,
    ].join("\n"),
    user: [
      `BRIEF:\n${brief}`,
      castText ? `CHARACTERS:\n${castText}` : "",
      after ? `PREVIOUS SCENE: ${headingText(s, after)}\n${tail(prevBlocks.map((b) => line(b)), 4000)}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    maxTokens: 3000,
    temperature: 0.8,
    refs: {},
  };
}

/** Linjene som mangler engelsk oversettelse (valgte, eller hele scenen). */
export function untranslatedBlocks(s: ProjectState, occurrenceId: string, blockIds: readonly string[]): ScriptBlock[] {
  const want = new Set(blockIds);
  const has = new Set(
    Object.values(s.translations)
      .filter((t) => !t.removed && t.language === "en" && t.blockId)
      .map((t) => t.blockId!),
  );
  return sceneBlocks(s, occurrenceId).filter(
    (b) => b.kind !== "heading" && b.text.trim() && !has.has(b.id) && (want.size === 0 || want.has(b.id)),
  );
}

export function buildAssistPrompt(
  s: ProjectState,
  r: AssistRequest,
): { readonly ok: true; readonly prompt: AssistPrompt } | { readonly ok: false; readonly message: string } {
  const e = assistRequestError(r);
  if (e) return { ok: false, message: e };
  let p: AssistPrompt | string;
  if (r.kind === "rewrite" || r.kind === "polish") {
    const picked = selected(s, r);
    if (typeof picked === "string") return { ok: false, message: picked };
    if (r.kind === "rewrite" && (r.mode === "free" || r.mode === "tone") && !r.instruction?.trim())
      return { ok: false, message: L("Skriv hva du ønsker", "Write what you want") };
    p = editPrompt(
      s,
      r,
      picked,
      r.kind === "rewrite"
        ? `Rewrite the marked lines. ${MODE_TEXT[r.mode ?? "clearer"]}`
        : "Correct spelling, grammar and punctuation only. Keep the wording, style, dialect and meaning. Do not change capitalisation of character names.",
    );
  } else if (r.kind === "translate") {
    if (!r.occurrenceId || !s.occurrences[r.occurrenceId]) return { ok: false, message: L("Velg en scene", "Select a scene") };
    const picked = untranslatedBlocks(s, r.occurrenceId, r.blockIds).slice(0, MAX_ASSIST_BLOCKS);
    if (picked.length === 0)
      return { ok: false, message: L("Alle linjene har allerede engelsk oversettelse", "All lines already have an English translation") };
    p = editPrompt(
      s,
      { ...r, blockIds: picked.map((b) => b.id) },
      picked,
      "Translate the marked lines from Norwegian to English for the English version of the film. Keep CHARACTER names unchanged.",
    );
  } else if (r.kind === "next_line") p = nextLinePrompt(s, r);
  else p = scenePrompt(s, r);
  return typeof p === "string" ? { ok: false, message: p } : { ok: true, prompt: p };
}
