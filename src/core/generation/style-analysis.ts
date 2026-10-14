/**
 * AI-analyse for bedre bildebeskrivelser (DEC-0080):
 *
 * 1. Stilanalyse: en bildeforstående språkmodell ser på forbildebildene i «Filmens visuelle stil» og
 *    beskriver stilen konkret – teknikk og medium, strek, formspråk og proporsjoner, farger, lys og skygge,
 *    tekstur, detaljnivå, komposisjon og hva som ville bryte stilen. Resultatet vises på norsk og engelsk;
 *    brukeren velger hva som skal inn i stilen (engelsk, det er den som sendes).
 * 2. Visuelt faktaark: manusets omtale av en karakter eller ting (norsk) blir én gang til en kort, engelsk
 *    liste med det som synes – alder, kropp, ansikt, hår, klær, farger, kjennetegn – uten replikker og
 *    handling. Lagres på ressursen og brukes i stedet for rå manusutdrag.
 *
 * Ren TypeScript: selve kallet er i `src/adapters/ai/write-prompt.functions.ts` (samme kostnadsport og logg).
 */
import type { StyleGuide } from "../model";
import { STYLE_FIELD_LIMIT } from "./style";
import { localized } from "../i18n";

// ---------------------------------------------------------------- Stilanalyse

export const STYLE_ANALYSIS_SYSTEM = `You are the art director of a 2D animated feature film. You are shown reference images that define the film's look, and the film's current style notes.

Analyse the VISUAL STYLE of the images (not their content or story) precisely enough that an image-generation model can reproduce it for new characters, props and backgrounds. Be concrete and observable: name the medium and technique, describe the line (presence, weight, colour, texture, consistency), shape language and proportions (e.g. head-to-body ratio, rounded vs angular, simplification), colour (palette with approximate hex codes, saturation, value range, how colour is applied), lighting and shading (flat, cel, soft gradients, cast shadows or none), texture (paper, brush, grain, none), level of detail, and typical composition/staging. Also state what would BREAK the style (e.g. photorealism, gradients, thin uniform vector lines).

If the images disagree with each other, describe what they have in common and note the differences briefly. Do not invent anything you cannot see.

Reply with JSON only, no markdown fences, in exactly this shape (every value a string; English values are used in prompts, so write them as short descriptive phrases or sentences; "nb" is a faithful Norwegian translation of each English field for the user to read):
{"en":{"summary":"","technique":"","line":"","shapes":"","colour":"","lighting":"","texture":"","detail":"","composition":"","breaks":""},"nb":{"summary":"","technique":"","line":"","shapes":"","colour":"","lighting":"","texture":"","detail":"","composition":"","breaks":""},"colours":["#rrggbb"]}`;

export const STYLE_ANALYSIS_KEYS = [
  "summary",
  "technique",
  "line",
  "shapes",
  "colour",
  "lighting",
  "texture",
  "detail",
  "composition",
  "breaks",
] as const;
export type StyleAnalysisKey = (typeof STYLE_ANALYSIS_KEYS)[number];

export const STYLE_ANALYSIS_LABEL: Record<StyleAnalysisKey, string> = localized({
  summary: ["Stilen kort", "The style in brief"],
  technique: ["Teknikk og medium", "Technique and medium"],
  line: ["Strek", "Line"],
  shapes: ["Formspråk og proporsjoner", "Shapes and proportions"],
  colour: ["Farger", "Colours"],
  lighting: ["Lys og skygge", "Light and shadow"],
  texture: ["Tekstur", "Texture"],
  detail: ["Detaljnivå", "Level of detail"],
  composition: ["Komposisjon", "Composition"],
  breaks: ["Dette bryter stilen", "This breaks the style"],
});

export interface StyleAnalysis {
  readonly en: Readonly<Record<StyleAnalysisKey, string>>;
  readonly nb: Readonly<Record<StyleAnalysisKey, string>>;
  /** Fargene modellen så (#rrggbb), høyst 8. */
  readonly colours: readonly string[];
}

/** Brukermeldingen til språkmodellen (bildene legges ved av adapteren). */
export function styleAnalysisUserText(g: StyleGuide, labels: readonly string[]): string {
  const notes = [
    g.visualStyle && `Visual style: ${g.visualStyle}`,
    g.technique && `Technique: ${g.technique}`,
    g.palette.description && `Palette: ${g.palette.description}`,
    g.palette.colors.length && `Colours: ${g.palette.colors.join(", ")}`,
    g.lighting && `Lighting: ${g.lighting}`,
    g.characterDesign && `Characters: ${g.characterDesign}`,
    g.environmentDesign && `Environments: ${g.environmentDesign}`,
  ].filter(Boolean);
  return `REFERENCE IMAGES (${labels.length}):\n${labels.map((l, i) => `Image ${i + 1}: ${l}`).join("\n")}\n\nCURRENT STYLE NOTES (may be empty or vague; the images are what counts):\n${notes.length ? notes.join("\n") : "(none)"}`;
}

const clip = (t: unknown, max = STYLE_FIELD_LIMIT) =>
  typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Svaret gjort om til en analyse, eller null når det ikke kan leses. */
export function parseStyleAnalysis(raw: string): StyleAnalysis | null {
  const t = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const en = (j["en"] ?? {}) as Record<string, unknown>;
  const nb = (j["nb"] ?? {}) as Record<string, unknown>;
  const pick = (o: Record<string, unknown>) =>
    Object.fromEntries(STYLE_ANALYSIS_KEYS.map((k) => [k, clip(o[k], 600)])) as Record<
      StyleAnalysisKey,
      string
    >;
  const out = { en: pick(en), nb: pick(nb) };
  if (!STYLE_ANALYSIS_KEYS.some((k) => out.en[k])) return null;
  const colours = Array.isArray(j["colours"])
    ? (j["colours"] as unknown[])
        .filter((c): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c.trim()))
        .map((c) => c.trim().toLowerCase())
        .slice(0, 8)
    : [];
  return { ...out, colours };
}

/**
 * Stilen med analysen lagt inn (de valgte delene). Hver del havner i feltet der den hører hjemme, og
 * erstatter det som sto der (brukeren har valgt det); grensen per felt holdes.
 */
export function applyStyleAnalysis(
  g: StyleGuide,
  a: StyleAnalysis,
  keys: ReadonlySet<StyleAnalysisKey>,
  useColours: boolean,
): StyleGuide {
  const has = (k: StyleAnalysisKey) => keys.has(k) && !!a.en[k];
  const joinTo = (...ks: StyleAnalysisKey[]) =>
    ks
      .filter(has)
      .map((k) => a.en[k].replace(/\.$/, ""))
      .join(". ");
  const set = (cur: string, next: string) =>
    next ? `${next}.`.replace(/\.\.$/, ".").slice(0, STYLE_FIELD_LIMIT) : cur;
  return {
    ...g,
    visualStyle: set(g.visualStyle, joinTo("summary", "detail")),
    technique: set(g.technique, joinTo("technique", "line", "texture")),
    characterDesign: set(g.characterDesign, joinTo("shapes")),
    lighting: set(g.lighting, joinTo("lighting")),
    composition: set(g.composition, joinTo("composition")),
    avoid: has("breaks") ? set(g.avoid, a.en.breaks) : g.avoid,
    palette: {
      colors: useColours && a.colours.length ? [...a.colours] : g.palette.colors,
      description: has("colour") ? a.en.colour.slice(0, STYLE_FIELD_LIMIT) : g.palette.description,
    },
  };
}

// ---------------------------------------------------------------- Visuelt faktaark

export const VISUAL_BRIEF_SYSTEM = `You are a character and prop designer for a 2D animated film. You receive what the production knows about ONE character, animal, prop or place: the library description and excerpts from the screenplay (usually Norwegian), and possibly images of the current design.

Write a short VISUAL FACT SHEET in English that an image-generation model can follow: only what can be SEEN. Include, when known: age and apparent age, species, build and height, face and expression tendencies, hair (colour, length, style), clothing and accessories (with colours and materials), distinctive marks, typical posture or way of moving, and changes over the story if they matter for drawing (e.g. "later: hair cut short"). For props and places: shape, size, materials, colours, condition, notable details.

Rules:
- One fact per line, each starting with "- ", 4 to 12 lines, each under 20 words.
- No dialogue, no plot, no other characters, no names of scenes.
- Do not invent facts. If something visual is only implied, you may state it cautiously ("probably …"). If images are attached, they show the design and win over vague text.
- Keep names as they are.

Reply with the lines only.`;

export function visualBriefUserText(input: {
  readonly name: string;
  readonly kind: string;
  readonly description: string;
  readonly appearance: string;
  readonly mentions: readonly string[];
  readonly imageLabels: readonly string[];
}): string {
  return [
    `SUBJECT: ${input.name} (${input.kind})`,
    input.description.trim() ? `LIBRARY DESCRIPTION:\n${input.description.trim()}` : "",
    input.appearance.trim() ? `CURRENT VERSION / OUTFIT:\n${input.appearance.trim()}` : "",
    input.mentions.length
      ? `SCREENPLAY EXCERPTS (story order):\n${input.mentions.map((m) => `- ${m}`).join("\n")}`
      : "SCREENPLAY EXCERPTS: (none)",
    input.imageLabels.length
      ? `IMAGES:\n${input.imageLabels.map((l, i) => `Image ${i + 1}: ${l}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Svaret gjort om til faktaarket (linjer med «- »), eller null når det er tomt. */
export function cleanVisualBrief(raw: string): string | null {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .replace(/^```[a-z]*\n?|```$/gim, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-•*]\s+/.test(l))
    .map((l) => `- ${l.replace(/^[-•*]\s+/, "").slice(0, 200)}`)
    .slice(0, 16);
  if (!lines.length) return null;
  return lines.join("\n").slice(0, 4000);
}
