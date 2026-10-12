/**
 * Filmens visuelle stil for AI (DEC-0065): tom profil, kontroll av lagrede profiler og standardprofilen.
 * Egen modul uten tunge importer (brukes av kommandoene).
 */
import type { StyleUse, ProjectState, StyleGuide, StyleProfile } from "../model";

export const STYLE_TEXT_FIELDS = [
  "premise",
  "world",
  "audience",
  "visualStyle",
  "technique",
  "lighting",
  "mood",
  "characterDesign",
  "environmentDesign",
  "composition",
  "avoid",
  "instructions",
] as const;
export type StyleTextField = (typeof STYLE_TEXT_FIELDS)[number];

export const STYLE_FIELD_LIMIT = 1500;
/** Samlet tekst i stilen: resten av beskrivelsen (bildet, scenene) må få plass innenfor 8000 tegn. */
export const STYLE_TOTAL_LIMIT = 5000;

/** Samlet tekstlengde i stilen. */
export function styleGuideLength(g: StyleGuide): number {
  return (
    STYLE_TEXT_FIELDS.reduce((n, k) => n + (typeof g[k] === "string" ? g[k].length : 0), 0) +
    (g.palette?.description?.length ?? 0)
  );
}

export function emptyStyleGuide(): StyleGuide {
  return {
    version: 1,
    premise: "",
    world: "",
    audience: "",
    visualStyle: "",
    technique: "",
    palette: { colors: [], description: "" },
    lighting: "",
    mood: "",
    characterDesign: "",
    environmentDesign: "",
    composition: "",
    avoid: "",
    instructions: "",
    referenceVersionIds: [],
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Feilmelding eller null. */
export function styleGuideError(g: StyleGuide): string | null {
  if (!g || typeof g !== "object" || g.version !== 1) return "Ugyldig stilprofil";
  const allowed = new Set<string>([
    ...STYLE_TEXT_FIELDS,
    "version",
    "palette",
    "referenceVersionIds",
  ]);
  for (const k of Object.keys(g)) if (!allowed.has(k)) return "Ukjent felt i stilprofilen";
  for (const k of STYLE_TEXT_FIELDS) {
    const v = g[k];
    if (typeof v !== "string") return "Ugyldig tekst i stilprofilen";
    if (v.length > STYLE_FIELD_LIMIT)
      return `Teksten er for lang (maks ${STYLE_FIELD_LIMIT} tegn per felt)`;
  }
  if (styleGuideLength(g) > STYLE_TOTAL_LIMIT)
    return `Stilen er for lang til å få plass i beskrivelsen (maks ${STYLE_TOTAL_LIMIT} tegn til sammen)`;
  const p = g.palette;
  if (
    !p ||
    typeof p !== "object" ||
    Object.keys(p).some((k) => k !== "colors" && k !== "description") ||
    !Array.isArray(p.colors) ||
    p.colors.length > 12 ||
    !p.colors.every((c) => typeof c === "string" && HEX.test(c)) ||
    typeof p.description !== "string" ||
    p.description.length > STYLE_FIELD_LIMIT
  )
    return "Ugyldig fargepalett";
  if (
    !Array.isArray(g.referenceVersionIds) ||
    g.referenceVersionIds.length > 12 ||
    g.referenceVersionIds.some((x) => typeof x !== "string" || x.length > 64) ||
    new Set(g.referenceVersionIds).size !== g.referenceVersionIds.length
  )
    return "Ugyldige forbildebilder (høyst 12)";
  return null;
}

export const STYLE_USES: readonly StyleUse[] = [
  "character",
  "animal",
  "object",
  "location",
  "environment",
  "other",
  "poster",
  "animatic",
  "ai_video",
];

export const STYLE_USE_LABEL: Record<StyleUse, string> = {
  character: "Karakterer",
  animal: "Dyr",
  object: "Objekter og rekvisitter",
  location: "Steder",
  environment: "Miljøer",
  other: "Annet",
  poster: "Plakater",
  animatic: "2D-animatic",
  ai_video: "AI-video",
};

/**
 * Stilprofilen som gjelder for en bruk (REQ-0148, DEC-0071): profilen som er valgt for akkurat dette, ellers
 * standardprofilen. Null når prosjektet ikke har noen.
 */
export function styleProfileFor(s: ProjectState, use: StyleUse | string): StyleProfile | null {
  const own = Object.values(s.styleProfiles)
    .filter((p) => !p.removed && (p.appliesTo ?? []).includes(use as StyleUse))
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  return own ?? defaultStyleProfile(s);
}

/** Standardprofilen for prosjektet (eller den første som ikke er fjernet), eller null. */
export function defaultStyleProfile(s: ProjectState): StyleProfile | null {
  const live = Object.values(s.styleProfiles)
    .filter((p) => !p.removed)
    .sort((a, b) => a.id.localeCompare(b.id));
  // En profil som bare gjelder bestemte bruk (f.eks. plakater), blir aldri reserve for alt annet
  return live.find((p) => p.isDefault) ?? live.find((p) => !p.appliesTo?.length) ?? null;
}
