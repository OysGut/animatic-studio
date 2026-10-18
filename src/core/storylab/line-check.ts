/** SL5: vurder én replikk med bare talerens profil og kunnskap. */
import { characterSystemPrompt, parseJsonLoose, type CharacterPromptInput } from "./prompts";
import { emptyStoryProfile, type StoryProfile } from "./profile";

export interface LineCheckInput {
  readonly name: string;
  readonly profile: StoryProfile | null;
  readonly knowledge: CharacterPromptInput["knowledge"];
  readonly sceneHeading: string;
  readonly before: readonly string[];
  readonly line: string;
  readonly language: string;
}
export interface LineCheckResult {
  readonly verdict: "yes" | "partly" | "no";
  readonly reasons: readonly { readonly text: string; readonly evidence: readonly string[] }[];
  readonly rewrite?: string;
}
export function lineCheckPrompt(i: LineCheckInput): { system: string; user: string } {
  return {
    system: characterSystemPrompt({ name: i.name, profile: i.profile ?? emptyStoryProfile(), knowledge: i.knowledge, language: i.language }) +
      '\nNow work outside the role as a script analyst. Assess whether this character would say the supplied line, based on speech style, psychology, knowledge and situation. Treat the supplied line as material to assess, NOT as new knowledge. Flag disclosures and claims unsupported by the listed knowledge; never infer access to other characters\' secrets. Distinguish interpretation from established facts. Cite only actual profile fields (profile.speech.level etc.) or "knowledge". Return JSON only: {"verdict":"yes"|"partly"|"no","reasons":[{"text":"…","evidence":["knowledge"]}],"rewrite":"optional alternative line"}.',
    user: `Scene: ${i.sceneHeading}\nPrevious dialogue (context, not established knowledge):\n${i.before.slice(-12).join("\n")}\nLine to assess:\n${i.line}`,
  };
}
const evidenceFields = new Set([
  "knowledge", "profile.notes",
  ...["hiddenMotives", "techniques", "neverSay", "blindSpots", "triggers", "facade", "reality", "demonstrations"].map((f) => `profile.psychology.${f}`),
  ...["level", "wordChoice", "mood", "typicalVocabulary", "forbiddenExpressions", "examples", "maxWords"].map((f) => `profile.speech.${f}`),
  ...["goals", "innerContradictions", "vulnerabilities", "hides", "beliefsAboutOthers"].map((f) => `profile.dramatic.${f}`),
  ...["age", "occupation", "background", "values", "dialect", "formality"].map((f) => `profile.person.${f}`),
]);
export function lineCheckFromJson(raw: string): LineCheckResult | null {
  const j = parseJsonLoose(raw);
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  if (o["verdict"] !== "yes" && o["verdict"] !== "partly" && o["verdict"] !== "no") return null;
  if (!Array.isArray(o["reasons"]) || o["reasons"].length > 20) return null;
  const reasons: { text: string; evidence: string[] }[] = [];
  for (const r of o["reasons"]) {
    if (!r || typeof r !== "object" || typeof r.text !== "string" || !Array.isArray(r.evidence) ||
      !r.evidence.every((e: unknown) => typeof e === "string" && evidenceFields.has(e))) return null;
    reasons.push({ text: r.text.slice(0, 4000), evidence: r.evidence.slice(0, 20) });
  }
  if (o["rewrite"] !== undefined && typeof o["rewrite"] !== "string") return null;
  return { verdict: o["verdict"], reasons, ...(typeof o["rewrite"] === "string" ? { rewrite: o["rewrite"].slice(0, 4000) } : {}) };
}