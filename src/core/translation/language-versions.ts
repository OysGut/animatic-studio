/**
 * ML3 (B-049, PLAN_B049_MULTILANG.md §3–4): N manusspråk per prosjekt.
 * Norsk (nb) er alltid kilden. En språkversjon er én logisk versjon per prosjekt og målspråk. Eldre
 * oversettelsesrader uten versjon-ID avledes fra prosjekt + språk; ingenting slås sammen eller slettes.
 * Ren TypeScript uten nettleser-API-er (Intl er en del av språket).
 */
import type { ProjectState } from "../model";
import { needsReview, translationStatus, type TranslationStatus } from "./index";

export interface LanguageVersion {
  readonly id: string;
  readonly revision: number;
  /** Kanonisk BCP-47-kode, f.eks. «de», «pt-BR», «sr-Latn». */
  readonly language: string;
  readonly name: string;
  readonly status: LanguageVersionStatus;
  readonly removed: boolean;
  readonly createdBy?: string;
  readonly createdAt?: string;
}
export type LanguageVersionStatus = "active" | "archived";
export const LANGUAGE_VERSION_STATUSES: readonly LanguageVersionStatus[] = ["active", "archived"];
export const LANGUAGE_VERSION_NAME_MAX = 120;

export { SCRIPT_LANGUAGE_TAG, isScriptLanguageTag, canonicalLanguageTag, isNorwegianSourceTag, sameLanguageTag } from "./language-tags";
import { isScriptLanguageTag, isNorwegianSourceTag, sameLanguageTag } from "./language-tags";
import { isSourceLanguage } from "../dialogue/languages";

export interface LanguageTagCollision {
  /** Felles nøkkel (små bokstaver). */
  readonly key: string;
  /** De ulike lagrede skrivemåtene, sortert. */
  readonly tags: readonly string[];
}

/** Lagrede koder som bare skiller seg i store og små bokstaver. Rapporteres; slås aldri sammen automatisk. */
export function languageTagCollisions(tags: Iterable<string>): LanguageTagCollision[] {
  const groups = new Map<string, Set<string>>();
  for (const tag of tags) {
    const key = tag.toLowerCase();
    const g = groups.get(key) ?? new Set<string>();
    g.add(tag);
    groups.set(key, g);
  }
  return [...groups]
    .filter(([, g]) => g.size > 1)
    .map(([key, g]) => ({ key, tags: [...g].sort() }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export type LanguageVersionErrorCode = "language" | "source" | "norwegian" | "name" | "status" | "duplicate";
export interface LanguageVersionFields {
  readonly language: string;
  readonly name: string;
  readonly status: LanguageVersionStatus;
}

export function languageVersionError(
  s: Pick<ProjectState, "languageVersions"> & { readonly project?: ProjectState["project"] },
  f: LanguageVersionFields,
  selfId?: string,
): LanguageVersionErrorCode | null {
  if (!f || !isScriptLanguageTag(f.language)) return "language";
  // Lagringsgrense uten migrasjon: databasen godtar ennå ikke nb/no som målspråk (se KILDESPRAK_REPORT.md).
  if (isNorwegianSourceTag(f.language)) return "norwegian";
  // Manusets eget språk er kilden og kan aldri være et mål.
  if (s.project && isSourceLanguage({ project: s.project }, f.language)) return "source";
  if (typeof f.name !== "string" || !f.name.trim() || f.name.length > LANGUAGE_VERSION_NAME_MAX) return "name";
  if (!LANGUAGE_VERSION_STATUSES.includes(f.status)) return "status";
  for (const v of Object.values(s.languageVersions ?? {}))
    if (!v.removed && v.id !== selfId && sameLanguageTag(v.language, f.language)) return "duplicate";
  return null;
}

/** Registrerte, ikke fjernede språkversjoner, sortert etter navn. */
export function languageVersionsOf(s: Pick<ProjectState, "languageVersions">): LanguageVersion[] {
  return Object.values(s.languageVersions ?? {})
    .filter((v) => !v.removed)
    .sort((a, b) => a.name.localeCompare(b.name) || a.language.localeCompare(b.language));
}

/** Versjonen for et målspråk (store og små bokstaver likegyldig). */
export function languageVersionFor(
  s: Pick<ProjectState, "languageVersions">,
  language: string,
): LanguageVersion | undefined {
  return languageVersionsOf(s).find((v) => sameLanguageTag(v.language, language));
}

/** Versjon-ID-en nye rader for et språk skal få, eller undefined for avledede (eldre) språk. */
export function versionIdFor(s: Pick<ProjectState, "languageVersions">, language: string): string | undefined {
  const v = languageVersionFor(s, language);
  return v && v.language === language ? v.id : undefined;
}

export interface ScriptLanguageOption {
  /** Stabil nøkkel for velgeren: versjon-ID, eller «lang:<kode>» for avledede språk. */
  readonly key: string;
  readonly language: string;
  /** Navnet fra registeret; tomt for avledede språk (brukerflaten viser språknavnet). */
  readonly name: string;
  readonly versionId: string | null;
  /** Avledet fra eldre rader (prosjekt + språk) uten egen registrering. */
  readonly derived: boolean;
  readonly status: LanguageVersionStatus;
}

/**
 * Alle manusspråk i prosjektet: registrerte versjoner og språk som bare finnes i eldre rader. Kollisjoner
 * («en-us» / «en-US») vises som egne valg, så ingenting blir skjult eller slått sammen.
 */
export function scriptLanguageOptions(s: ProjectState): ScriptLanguageOption[] {
  const registered = languageVersionsOf(s);
  const out: ScriptLanguageOption[] = registered.map((v) => ({
    key: v.id, language: v.language, name: v.name, versionId: v.id, derived: false, status: v.status,
  }));
  const seen = new Set(registered.map((v) => v.language));
  const legacy = new Set<string>();
  for (const t of Object.values(s.translations)) if (!t.removed) legacy.add(t.language);
  for (const u of Object.values(s.translationLines ?? {})) if (!u.removed) legacy.add(u.language);
  for (const l of Object.values(s.translationLineLinks ?? {})) if (!l.removed) legacy.add(l.language);
  for (const language of [...legacy].sort())
    if (!seen.has(language))
      out.push({ key: `lang:${language}`, language, name: "", versionId: null, derived: true, status: "active" });
  return out;
}

/** Språkene der en norsk linje har en oversettelse som må gjennomgås etter en kilderevisjon. */
export function reviewLanguagesForBlock(s: ProjectState, blockId: string): string[] {
  const out = new Set<string>();
  for (const t of Object.values(s.translations))
    if (!t.removed && t.blockId === blockId && needsReview(s, t)) out.add(t.language);
  return [...out].sort();
}

/** Status per språk for en produksjon (manglende, usikre og linjer som må gjennomgås). */
export function languageStatuses(
  s: ProjectState,
  productionId: string,
): { readonly option: ScriptLanguageOption; readonly status: TranslationStatus }[] {
  return scriptLanguageOptions(s).map((option) => ({ option, status: translationStatus(s, productionId, option.language) }));
}

export type ExportFallbackChoice = "fallback" | "stop";
export type ExportLanguageDecision =
  | { readonly kind: "complete" }
  | { readonly kind: "needs-choice"; readonly missing: number; readonly uncertain: number; readonly review: number }
  | { readonly kind: "fallback"; readonly missing: number; readonly uncertain: number; readonly review: number }
  | { readonly kind: "stopped" };

/**
 * Eksport av et språk (REQ-0349, ML3): er oversettelsen ufullstendig, må brukeren velge eksplisitt mellom
 * norsk reserve og å stoppe. Uten valg eksporteres ingenting.
 */
export function exportLanguageDecision(
  status: Pick<TranslationStatus, "missingIds" | "uncertain" | "review">,
  choice?: ExportFallbackChoice,
): ExportLanguageDecision {
  const missing = status.missingIds.size;
  const counts = { missing, uncertain: status.uncertain, review: status.review };
  if (missing === 0 && status.uncertain === 0 && status.review === 0) return { kind: "complete" };
  if (choice === "fallback") return { kind: "fallback", ...counts };
  if (choice === "stop") return { kind: "stopped" };
  return { kind: "needs-choice", ...counts };
}
