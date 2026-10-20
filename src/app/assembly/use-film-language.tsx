/**
 * Språkvalg i monteringen (M7 del 3, DEC-0059, REQ-0352): dialogspråket som spilles og undertekstene som
 * vises, uavhengig av hverandre, av manusspråket og av grensesnittet (som alltid er norsk). Huskes per
 * prosjekt i nettleseren.
 */
import { useCallback, useEffect, useState } from "react";
import { FILM_LANGUAGES, L, LANGUAGE_LABEL, MAIN_LANGUAGE } from "@/core";
import { t } from "@/core/i18n/keyed";

const LANGUAGE_NAME_EN: Record<string, string> = { nb: "Norwegian", en: "English" };

/** Språknavn på gjeldende språk (LANGUAGE_LABEL er norsk). */
const languageName = (l: string) => L(LANGUAGE_LABEL[l] ?? l, LANGUAGE_NAME_EN[l] ?? l);

export interface FilmLanguage {
  /** Dialogspråket (lyd og språkavhengige bilder). */
  readonly dialogue: string;
  /** Undertekster: språk, eller null = ingen. */
  readonly subtitles: string | null;
}

const key = (projectId: string) => `animatic:film-language:${projectId}`;

function read(projectId: string): FilmLanguage {
  try {
    const v = JSON.parse(window.localStorage.getItem(key(projectId)) ?? "null") as {
      dialogue?: unknown;
      subtitles?: unknown;
    } | null;
    const dialogue =
      typeof v?.dialogue === "string" && FILM_LANGUAGES.includes(v.dialogue)
        ? v.dialogue
        : MAIN_LANGUAGE;
    const subtitles =
      typeof v?.subtitles === "string" && FILM_LANGUAGES.includes(v.subtitles) ? v.subtitles : null;
    return { dialogue, subtitles };
  } catch {
    return { dialogue: MAIN_LANGUAGE, subtitles: null };
  }
}

export function useFilmLanguage(projectId: string) {
  const [value, setValue] = useState<FilmLanguage>({ dialogue: MAIN_LANGUAGE, subtitles: null });
  useEffect(() => setValue(read(projectId)), [projectId]);
  const set = useCallback(
    (patch: Partial<FilmLanguage>) =>
      setValue((v) => {
        const next = { ...v, ...patch };
        try {
          window.localStorage.setItem(key(projectId), JSON.stringify(next));
        } catch {
          // Lagring i nettleseren er bare en bekvemmelighet
        }
        return next;
      }),
    [projectId],
  );
  return [value, set] as const;
}

const select =
  "h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";

/** Valg av dialogspråk og undertekster (verktøylinjen i monteringen og eksporten). */
export function FilmLanguagePicker({
  value,
  onChange,
  compact = false,
}: {
  value: FilmLanguage;
  onChange: (patch: Partial<FilmLanguage>) => void;
  compact?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-text-secondary">
      <label
        className="flex items-center gap-1"
        title={t("app-assembly-use-film-language.film-language-picker.title.8b30b9325922")}
      >
        {compact ? null : <span>{t("app-assembly-use-film-language.film-language-picker.span.661b3ef825e5")}</span>}
        <select
          aria-label={t("app-assembly-use-film-language.film-language-picker.aria-label.d46efc8b1a97")}
          value={value.dialogue}
          onChange={(e) => onChange({ dialogue: e.target.value })}
          className={select}
        >
          {FILM_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {compact
                ? t("app-assembly-use-film-language.film-language-picker.option.d89a5efb9970", { value1: String(languageName(l)) })
                : languageName(l)}
            </option>
          ))}
        </select>
      </label>
      <label
        className="flex items-center gap-1"
        title={t("app-assembly-use-film-language.film-language-picker.title.233b1fd9f82d")}
      >
        {compact ? null : <span>{t("app-assembly-use-film-language.film-language-picker.span.c78aa0770613")}</span>}
        <select
          aria-label={t("app-assembly-use-film-language.film-language-picker.aria-label.233b1fd9f82d")}
          value={value.subtitles ?? ""}
          onChange={(e) => onChange({ subtitles: e.target.value || null })}
          className={select}
        >
          <option value="">{compact ? t("app-assembly-use-film-language.film-language-picker.option.e6d77d1da4e8") : t("app-assembly-use-film-language.film-language-picker.option.277eb8e5d05e")}</option>
          {FILM_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {compact
                ? t("app-assembly-use-film-language.film-language-picker.option.b782b5169db7", { value1: String(languageName(l)) })
                : languageName(l)}
            </option>
          ))}
        </select>
      </label>
    </span>
  );
}
