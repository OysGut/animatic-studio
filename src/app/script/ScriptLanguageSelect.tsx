/**
 * ML3: velger for manusspråk – norsk kilde, registrerte språkversjoner og språk som bare finnes i eldre
 * oversettelser. Brukes i manuset, manusutforskeren, linjekoblingene og eksporten.
 */
import { useMemo } from "react";
import { LANGUAGE_LABEL, languageLabel, scriptLanguageOptions, isSourceLanguage, sourceLanguageOf, SOURCE_TEXT_KEY, type ProjectState, type ScriptLanguageOption } from "@/core";
import { t } from "@/core/i18n/keyed";

export interface ScriptLanguageChoice {
  readonly language: string;
  readonly label: string;
}

export function optionLabel(o: ScriptLanguageOption): string {
  if (o.name) return `${o.name} (${o.language})`;
  return t("ml3-language-versions.option.derived", { label: languageLabel(o.language) });
}

/** Valgene i rekkefølge: kilden – manusets språk (valgfritt), registrerte versjoner, eldre språk og standardspråkene. */
export function scriptLanguageChoices(state: ProjectState, includeNorwegian: boolean): ScriptLanguageChoice[] {
  const out: ScriptLanguageChoice[] = includeNorwegian
    ? [{ language: SOURCE_TEXT_KEY, label: t("ml3-language-versions.select.source", { label: languageLabel(sourceLanguageOf(state)) }) }]
    : [];
  const seen = new Set(out.map((c) => c.language));
  for (const o of scriptLanguageOptions(state)) {
    if (seen.has(o.language) || isSourceLanguage(state, o.language)) continue;
    seen.add(o.language);
    out.push({ language: o.language, label: optionLabel(o) });
  }
  // Standardspråkene fra før ML3, så en ny oversettelse kan startes uten registrering
  for (const [language, label] of Object.entries(LANGUAGE_LABEL))
    if (!seen.has(language) && language !== "nb" && !isSourceLanguage(state, language)) {
      seen.add(language);
      out.push({ language, label });
    }
  return out;
}

export function ScriptLanguageSelect({
  state,
  value,
  onChange,
  includeNorwegian = true,
  label,
  title,
  testId,
  className,
}: {
  state: ProjectState;
  value: string;
  onChange: (language: string) => void;
  includeNorwegian?: boolean;
  label: string;
  title?: string;
  testId?: string;
  className?: string;
}) {
  const choices = useMemo(() => scriptLanguageChoices(state, includeNorwegian), [state, includeNorwegian]);
  const known = choices.some((c) => c.language === value);
  return (
    <select
      aria-label={label}
      title={title ?? label}
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? "h-7 max-w-[220px] rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"}
    >
      {known ? null : <option value={value}>{languageLabel(value)}</option>}
      {choices.map((c) => (
        <option key={c.language} value={c.language}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
