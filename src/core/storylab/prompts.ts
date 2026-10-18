/**
 * Story Lab (SL1): promptbyggere (tilpasset fra VennTing, egen kopi). Promptene er på engelsk; karakteren
 * svarer på manusets språk. Karakterprompten får BARE det karakteren vet (knowledgeAt): andres hemmeligheter
 * og fakta bare regissøren kjenner, sendes aldri inn. Analysen er rådgivende, ikke en fasit.
 */
import { L, localized } from "../i18n";
import type { StoryFact } from "../model";
import { emptyStoryProfile, mergeProfile, profileError, type StoryProfile } from "./profile";
import { ANALYST, DIRECTOR, activeDirections, type Direction, type EngineState } from "./engine";

const LANG_NAME: Record<string, string> = {
  nb: "Norwegian (Bokmal)",
  nn: "Norwegian (Nynorsk)",
  en: "English",
};
const langName = (l: string) => LANG_NAME[l] ?? l;

const list = (title: string, items: readonly string[]) =>
  items.length ? `${title}:\n${items.map((x) => `- ${x}`).join("\n")}` : "";
const line = (title: string, v: string | number | undefined) =>
  v === undefined || v === "" ? "" : `${title}: ${v}`;
const join = (...parts: string[]) => parts.filter(Boolean).join("\n");

/** Profilen som tekst for prompten. `names` gir navnene i «beliefsAboutOthers». */
export function profileText(p: StoryProfile, names: Readonly<Record<string, string>> = {}): string {
  return join(
    "## Person",
    line("Age", p.person.age),
    line("Occupation", p.person.occupation),
    line("Background", p.person.background),
    list("Values", p.person.values),
    line("Dialect", p.person.dialect),
    line("Formality", p.person.formality),
    "## Psychology",
    line("Facade (how they appear)", p.psychology.facade),
    line("Reality (what is underneath)", p.psychology.reality),
    list("Hidden motives", p.psychology.hiddenMotives),
    list("Conversational techniques", p.psychology.techniques),
    list("Would never say", p.psychology.neverSay),
    list("Blind spots", p.psychology.blindSpots),
    list("Triggers", p.psychology.triggers),
    list("How the traits show", p.psychology.demonstrations),
    "## Speech",
    line("Level", p.speech.level),
    line("Word choice", p.speech.wordChoice),
    line("Mood", p.speech.mood),
    list("Typical vocabulary", p.speech.typicalVocabulary),
    list("Never uses these expressions", p.speech.forbiddenExpressions),
    list("Example lines", p.speech.examples),
    line("Maximum words per reply", p.speech.maxWords),
    "## Dramatic",
    list("Goals", p.dramatic.goals),
    list("Inner contradictions", p.dramatic.innerContradictions),
    list("Vulnerabilities", p.dramatic.vulnerabilities),
    list("Hides", p.dramatic.hides),
    list(
      "Beliefs about others",
      p.dramatic.beliefsAboutOthers.map((b) => `${names[b.assetId] ?? "someone"}: ${b.belief}`),
    ),
    p.notes ? `## Notes\n${p.notes}` : "",
  );
}

export interface CharacterPromptInput {
  readonly name: string;
  readonly profile: StoryProfile;
  /** Fra knowledgeAt: det karakteren vet. Ingenting annet sendes inn. */
  readonly knowledge: {
    readonly facts: readonly StoryFact[];
    readonly ownSecrets: readonly StoryFact[];
  };
  readonly situation?: string;
  readonly directions?: readonly Pick<Direction, "text">[];
  readonly sceneContext?: string;
  readonly language: string;
  readonly names?: Readonly<Record<string, string>>;
}

/** Rollespill i karakter: filmatisk, med undertekst, ikke karikatur. */
export function characterSystemPrompt(i: CharacterPromptInput): string {
  const dirs = i.directions ?? [];
  return join(
    `You are ${i.name}, a character in a film. Stay fully in character.`,
    "Play the role as a screen actor would: cinematic, grounded, with subtext. Never a caricature. Show traits through behaviour and word choice rather than announcing them.",
    `Always answer in ${langName(i.language)}, the language of the screenplay.`,
    "You only know what is listed under “What you know”. Never mention, hint at or rely on anything else, even if asked. If asked about something you do not know, react as the character would.",
    "Your own secrets may be hinted at through subtext, evasion or behaviour, but never stated outright unless the director's direction explicitly asks you to reveal them.",
    "Reply with spoken lines only (and very brief actions in parentheses if needed). No narration, no stage directions for others, no meta-commentary.",
    "",
    `# Character profile: ${i.name}`,
    profileText(i.profile, i.names),
    "",
    "# What you know",
    i.knowledge.facts.length
      ? i.knowledge.facts.map((f) => `- ${f.text}`).join("\n")
      : "- (nothing beyond your own life and the conversation)",
    i.knowledge.ownSecrets.length
      ? `\n# Your secrets (hint only, never state outright)\n${i.knowledge.ownSecrets.map((f) => `- ${f.text}`).join("\n")}`
      : "",
    i.sceneContext ? `\n# The scene so far\n${i.sceneContext}` : "",
    i.situation ? `\n# Situation\n${i.situation}` : "",
    dirs.length
      ? `\n# Current state (this moment only, not part of the personality)\n${dirs.map((d) => `- ${d.text}`).join("\n")}`
      : "",
  );
}

export interface AnalystPromptInput {
  readonly characters: readonly { readonly name: string; readonly profile: StoryProfile | null }[];
  /** Alle etablerte fakta til og med tidspunktet (regissørens oversikt), med hvem som vet. */
  readonly facts: readonly {
    readonly text: string;
    readonly kind: string;
    readonly knownBy: readonly string[];
  }[];
  readonly sceneContext?: string;
  readonly language: string;
  /** Karakteren regissøren vil ha forklart (explain). */
  readonly focus?: string;
}

/** Analyse utenfor rollen: etablerte fakta skilles fra tolkning, med henvisninger. */
export function analystSystemPrompt(i: AnalystPromptInput): string {
  return join(
    "You are a script analyst working with the director. You speak outside the fiction.",
    `Answer in ${langName(i.language)}.`,
    "Always separate ESTABLISHED facts (cite the source: a profile field such as “psychology.hiddenMotives”, a fact, or a screenplay block ID) from INTERPRETATION (mark it clearly as interpretation). Say “uncertain” when the material does not settle a question. Never invent events.",
    i.focus ? `Explain the behaviour and motives of ${i.focus} in the conversation so far.` : "",
    "",
    "# Characters",
    ...i.characters.map(
      (c) => `## ${c.name}\n${c.profile ? profileText(c.profile) : "(no profile)"}`,
    ),
    "",
    "# Established facts",
    i.facts.length
      ? i.facts
          .map(
            (f) =>
              `- [${f.kind}] ${f.text} (known by: ${f.knownBy.length ? f.knownBy.join(", ") : "the director only"})`,
          )
          .join("\n")
      : "- (none)",
    i.sceneContext ? `\n# Scene\n${i.sceneContext}` : "",
  );
}

// ---------------------------------------------------------------- scenanalyse (spesifikasjonen kap. 24)

export type AnalysisAspect =
  | "credibility"
  | "motivation"
  | "conflict"
  | "subtext"
  | "relationships"
  | "emotional_arc"
  | "knowledge"
  | "consequence"
  | "rhythm"
  | "weaknesses";

export const ANALYSIS_ASPECTS: readonly AnalysisAspect[] = [
  "credibility",
  "motivation",
  "conflict",
  "subtext",
  "relationships",
  "emotional_arc",
  "knowledge",
  "consequence",
  "rhythm",
  "weaknesses",
];

export const ANALYSIS_ASPECT_LABEL: Record<AnalysisAspect, string> = localized({
  credibility: ["Karaktertroverdighet", "Character credibility"],
  motivation: ["Motivasjon", "Motivation"],
  conflict: ["Konflikt", "Conflict"],
  subtext: ["Undertekst", "Subtext"],
  relationships: ["Relasjoner", "Relationships"],
  emotional_arc: ["Emosjonell utvikling", "Emotional development"],
  knowledge: ["Kunnskap", "Knowledge"],
  consequence: ["Konsekvens", "Consequence"],
  rhythm: ["Rytme", "Rhythm"],
  weaknesses: ["Mulige svakheter", "Possible weaknesses"],
});

/** Spørsmålet hvert punkt besvarer (engelsk, til modellen). */
const ASPECT_QUESTION: Record<AnalysisAspect, string> = {
  credibility: "Are the actions and lines consistent with each character's personality?",
  motivation: "Is it understandable why each character says and does what they do?",
  conflict: "Does the scene have a clear enough conflict or dramatic purpose?",
  subtext: "Do the characters say what they really mean, or is there meaningful subtext?",
  relationships: "Is the interplay believable given the relationships between the characters?",
  emotional_arc: "Does the situation change emotionally during the scene?",
  knowledge: "Do the characters only know what they can know at this point in the story?",
  consequence: "Do the events have an understandable effect on the rest of the story?",
  rhythm: "Do dialogue and action have an appropriate momentum?",
  weaknesses: "Do any lines, reactions or events seem artificial, rushed or poorly motivated?",
};

export interface SceneAnalysisPoint {
  readonly aspect: AnalysisAspect;
  readonly finding: string;
  /** Blokk-ID-er i manuset (og eventuelt profilfelt) som funnet bygger på. */
  readonly evidence: readonly string[];
  readonly suggestion: string;
  readonly uncertain: boolean;
}

export interface SceneAnalysisInput {
  readonly heading: string;
  readonly blocks: readonly { readonly id: string; readonly kind: string; readonly text: string }[];
  readonly characters: readonly {
    readonly name: string;
    readonly profile: StoryProfile | null;
    readonly knows: readonly string[];
  }[];
  readonly language: string;
}

/** Dramaturgisk analyse av én scene. Svaret er JSON: { points: SceneAnalysisPoint[] }. */
export function sceneAnalysisPrompt(i: SceneAnalysisInput): { system: string; user: string } {
  const system = join(
    "You are a dramaturg giving advisory notes on one scene of a screenplay. Your notes are advice, not a verdict.",
    `Write the findings and suggestions in ${langName(i.language)}.`,
    "Assess the scene on exactly these aspects, one point each, in this order:",
    ...ANALYSIS_ASPECTS.map((a) => `- ${a}: ${ASPECT_QUESTION[a]}`),
    "Every point must cite concrete screenplay passages by block ID in “evidence” (profile fields may be cited as “profile:<name>.<field>”). Never invent events, lines or facts that are not in the material. If the material does not settle a question, set “uncertain” to true and say so.",
    'Reply with JSON only: {"points":[{"aspect":"credibility","finding":"…","evidence":["<block id>"],"suggestion":"…","uncertain":false}]}',
  );
  const user = join(
    `# Scene: ${i.heading}`,
    ...i.blocks.map((b) => `[${b.id}] ${b.kind.toUpperCase()}: ${b.text}`),
    "",
    "# Characters",
    ...i.characters.map(
      (c) =>
        `## ${c.name}\n${c.profile ? profileText(c.profile) : "(no profile)"}\nKnows at this point:\n${c.knows.length ? c.knows.map((k) => `- ${k}`).join("\n") : "- (nothing recorded)"}`,
    ),
  );
  return { system, user };
}

/** Tolker svaret fra scenanalysen: bare kjente punkter og blokk-ID-er som finnes i scenen. */
export function sceneAnalysisFromJson(
  raw: string,
  blockIds: readonly string[],
): SceneAnalysisPoint[] | null {
  const j = parseJsonLoose(raw) as { points?: unknown } | null;
  if (!j || !Array.isArray(j.points)) return null;
  const known = new Set(blockIds);
  const out: SceneAnalysisPoint[] = [];
  for (const p of j.points as Record<string, unknown>[]) {
    if (!p || !ANALYSIS_ASPECTS.includes(p["aspect"] as AnalysisAspect)) continue;
    const ev = Array.isArray(p["evidence"])
      ? (p["evidence"] as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    out.push({
      aspect: p["aspect"] as AnalysisAspect,
      finding: String(p["finding"] ?? "").slice(0, 4000),
      evidence: ev.filter((e) => known.has(e) || e.startsWith("profile:")).slice(0, 20),
      suggestion: String(p["suggestion"] ?? "").slice(0, 4000),
      uncertain: p["uncertain"] === true,
    });
  }
  return out;
}

// ---------------------------------------------------------------- profilgenerator

export interface ProfileGeneratorInput {
  readonly name: string;
  readonly description?: string;
  /** Karakterens replikker i manuset. */
  readonly lines?: readonly string[];
  readonly language: string;
}

export function profileGeneratorPrompt(i: ProfileGeneratorInput): { system: string; user: string } {
  const shape = JSON.stringify(emptyStoryProfile());
  const system = join(
    "You build a character profile for a film character from a description and/or the character's lines in the screenplay.",
    `Write the text values in ${langName(i.language)}. Base everything on the material; leave fields empty rather than inventing facts.`,
    `speech.level is one of: child, youth, adult, academic, street. person.formality (optional) is one of: low, medium, high. Leave dramatic.beliefsAboutOthers empty.`,
    `Reply with JSON only, exactly in this shape: ${shape}`,
  );
  const user = join(
    `# Character: ${i.name}`,
    i.description ? `## Description\n${i.description}` : "",
    i.lines?.length
      ? `## Lines in the screenplay\n${i.lines
          .slice(0, 200)
          .map((l) => `- ${l}`)
          .join("\n")}`
      : "",
  );
  return { system, user };
}

/** Profilen fra generatorens svar (fylt ut med tomme felt), eller null hvis den er ugyldig. */
export function profileFromJson(raw: string): StoryProfile | null {
  const j = parseJsonLoose(raw);
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  const p = mergeProfile(emptyStoryProfile(), {
    ...(o["psychology"] && typeof o["psychology"] === "object"
      ? { psychology: o["psychology"] as never }
      : {}),
    ...(o["speech"] && typeof o["speech"] === "object" ? { speech: o["speech"] as never } : {}),
    ...(o["dramatic"] && typeof o["dramatic"] === "object"
      ? { dramatic: o["dramatic"] as never }
      : {}),
    ...(o["person"] && typeof o["person"] === "object" ? { person: o["person"] as never } : {}),
    ...(typeof o["notes"] === "string" ? { notes: o["notes"] } : {}),
  });
  return profileError(p) ? null : p;
}

// ---------------------------------------------------------------- gruppesamtale

export interface TurnMessages {
  /** Tillegg til systemprompten: regien som gjelder taleren nå. */
  readonly systemAddition: string;
  readonly messages: { readonly role: "user" | "assistant"; readonly content: string }[];
}

/**
 * Meldingslisten for talerens neste tur: egne replikker som «assistant», alt annet som «user» med navn.
 * Etterfølgende meldinger med samme rolle slås sammen, og listen slutter alltid med «user».
 */
export function groupTurnMessages(
  s: EngineState,
  speaker: string,
  names: Readonly<Record<string, string>> = {},
): TurnMessages {
  const label = (id: string) =>
    id === DIRECTOR ? "Director" : id === ANALYST ? "Analyst" : (names[id] ?? "Someone");
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const t of s.turns) {
    if (t.kind === "analysis" || t.kind === "direction") continue; // analyse og regi er ikke en del av fiksjonen
    const role = t.speaker === speaker ? "assistant" : "user";
    const content = role === "assistant" ? t.text : `${label(t.speaker)}: ${t.text}`;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n\n${content}`;
    else out.push({ role, content });
  }
  if (!out.length || out[out.length - 1]!.role !== "user")
    out.push({ role: "user", content: "(The conversation continues. Your turn.)" });
  const dirs = activeDirections(s, speaker);
  return {
    systemAddition: dirs.length
      ? `# Current state (this moment only, not part of the personality)\n${dirs.map((d) => `- ${d.text}`).join("\n")}`
      : "",
    messages: out,
  };
}

// ---------------------------------------------------------------- JSON

/**
 * Tolker JSON fra en språkmodell: tåler kodegjerder, tekst før og etter, etterfølgende komma og «smarte»
 * anførselstegn. Gir null i stedet for å kaste.
 */
export function parseJsonLoose(raw: string): unknown {
  if (typeof raw !== "string") return null;
  const tryParse = (t: string): unknown => {
    try {
      return JSON.parse(t);
    } catch {
      return undefined;
    }
  };
  let t = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1]!.trim();
  const direct = tryParse(t);
  if (direct !== undefined) return direct;
  const start = t.search(/[[{]/);
  if (start < 0) return null;
  const open = t[start]!;
  const close = open === "{" ? "}" : "]";
  const end = t.lastIndexOf(close);
  if (end <= start) return null;
  let body = t.slice(start, end + 1);
  const again = tryParse(body);
  if (again !== undefined) return again;
  body = body
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
  const fixed = tryParse(body);
  return fixed === undefined ? null : fixed;
}

/** Feilmelding når et AI-svar ikke kunne tolkes (for brukerflaten). */
export function unreadableReplyMessage(): string {
  return L(
    "Svaret fra AI kunne ikke tolkes. Prøv igjen.",
    "The AI reply could not be read. Try again.",
  );
}
