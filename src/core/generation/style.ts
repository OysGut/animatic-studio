/**
 * Filmens visuelle stil for AI (DEC-0065): tom profil, kontroll av lagrede profiler og standardprofilen.
 * Egen modul uten tunge importer (brukes av kommandoene).
 */
import type { StyleUse, ProjectState, StyleGuide, StyleProfile } from "../model";

import { t as tk, tLocalized } from "@/core/i18n/keyed";

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
  if (!g || typeof g !== "object" || g.version !== 1)
    return tk("core-generation-style.style-guide-error.message.3cd8c4a78f71");
  const allowed = new Set<string>([
    ...STYLE_TEXT_FIELDS,
    "version",
    "palette",
    "referenceVersionIds",
    "prompt",
  ]);
  for (const k of Object.keys(g))
    if (!allowed.has(k))
      return tk("core-generation-style.style-guide-error.message.28029a7f8ae5");
  for (const k of STYLE_TEXT_FIELDS) {
    const v = g[k];
    if (typeof v !== "string")
      return tk("core-generation-style.style-guide-error.message.b1c87836637f");
    if (v.length > STYLE_FIELD_LIMIT)
      return tk("core-generation-style.style-guide-error.message.d50a01a2f256", { STYLE_FIELD_LIMIT: String(STYLE_FIELD_LIMIT) });
  }
  if (
    g.prompt !== undefined &&
    (typeof g.prompt !== "string" || g.prompt.length > STYLE_TOTAL_LIMIT)
  )
    return tk("core-generation-style.style-guide-error.message.791036e2861e", { STYLE_TOTAL_LIMIT: String(STYLE_TOTAL_LIMIT) });
  if (styleGuideLength(g) > STYLE_TOTAL_LIMIT)
    return tk("core-generation-style.style-guide-error.message.7319ad177b9d", { STYLE_TOTAL_LIMIT: String(STYLE_TOTAL_LIMIT) });
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
    return tk("core-generation-style.style-guide-error.message.316d0fd38e13");
  if (
    !Array.isArray(g.referenceVersionIds) ||
    g.referenceVersionIds.length > 12 ||
    g.referenceVersionIds.some((x) => typeof x !== "string" || x.length > 64) ||
    new Set(g.referenceVersionIds).size !== g.referenceVersionIds.length
  )
    return tk("core-generation-style.style-guide-error.message.de0c2c9941e5");
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

export const STYLE_USE_LABEL: Record<StyleUse, string> = tLocalized({ character: "core-generation-style.style-use-label.character.030566527626", animal: "core-generation-style.style-use-label.animal.4cfbed92fac0", object: "core-generation-style.style-use-label.object.c883fc40d3a8", location: "core-generation-style.style-use-label.location.4ca16ab3d75b", environment: "core-generation-style.style-use-label.environment.33b5012728e5", other: "core-generation-style.style-use-label.other.72e85c6ec273", poster: "core-generation-style.style-use-label.poster.ea3dc875eb1a", animatic: "core-generation-style.style-use-label.animatic.381a11119178", ai_video: "core-generation-style.style-use-label.ai-video.f1ed83f16e48" });

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

/**
 * Filmens visuelle stil som én tekst (engelsk overskrift per del, innholdet som brukeren skrev det). Dette
 * er utgangspunktet brukeren ser og kan redigere (DEC-0085).
 */
export function composeStyleText(g: StyleGuide): string {
  const lines: string[] = [];
  const add = (label: string, v: string) => {
    const t = v.trim().replace(/\s+/g, " ");
    if (t) lines.push(`${label}: ${t}`);
  };
  add("Film", g.premise);
  add("World", g.world);
  add("Audience and tone", g.audience);
  add("Visual style", g.visualStyle);
  add("Technique", g.technique);
  add(
    "Colour palette",
    [g.palette.description, g.palette.colors.join(", ")].filter((x) => x.trim()).join("; "),
  );
  add("Lighting", g.lighting);
  add("Mood", g.mood);
  add("Characters", g.characterDesign);
  add("Environments", g.environmentDesign);
  add("Composition", g.composition);
  add("Avoid", g.avoid);
  add("Instructions", g.instructions);
  return lines.join("\n");
}

/** Den globale beskrivelsen som sendes: den redigerte teksten, ellers den sammensatte (DEC-0085). */
export function styleText(g: StyleGuide | null | undefined): string {
  if (!g) return "";
  return g.prompt?.trim() || composeStyleText(g);
}

/** Er den samlede teksten redigert for hånd (og brukes i stedet for feltene)? */
export function styleTextEdited(g: StyleGuide | null | undefined): boolean {
  return !!g?.prompt?.trim();
}
