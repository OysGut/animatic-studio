/**
 * Språkvalg i monteringen (M7 del 3, DEC-0059, REQ-0352): dialogspråket som spilles og undertekstene som
 * vises, uavhengig av hverandre, av manusspråket og av grensesnittet (som alltid er norsk). Huskes per
 * prosjekt i nettleseren.
 */
import { useCallback, useEffect, useState } from "react";
import { FILM_LANGUAGES, L, LANGUAGE_LABEL, MAIN_LANGUAGE } from "@/core";

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
        title={L("Språket dialogen spilles på", "The language the dialogue is played in")}
      >
        {compact ? null : <span>{L("Dialog", "Dialogue")}</span>}
        <select
          aria-label={L("Dialogspråk", "Dialogue language")}
          value={value.dialogue}
          onChange={(e) => onChange({ dialogue: e.target.value })}
          className={select}
        >
          {FILM_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {compact
                ? L(`Dialog: ${languageName(l)}`, `Dialogue: ${languageName(l)}`)
                : languageName(l)}
            </option>
          ))}
        </select>
      </label>
      <label
        className="flex items-center gap-1"
        title={L("Undertekster i bildet", "Subtitles on screen")}
      >
        {compact ? null : <span>{L("Undertekster", "Subtitles")}</span>}
        <select
          aria-label={L("Undertekster i bildet", "Subtitles on screen")}
          value={value.subtitles ?? ""}
          onChange={(e) => onChange({ subtitles: e.target.value || null })}
          className={select}
        >
          <option value="">{compact ? L("Tekst: av", "Text: off") : L("Ingen", "None")}</option>
          {FILM_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {compact
                ? L(`Tekst: ${languageName(l)}`, `Text: ${languageName(l)}`)
                : languageName(l)}
            </option>
          ))}
        </select>
      </label>
    </span>
  );
}
