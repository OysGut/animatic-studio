/**
 * Språkvalg i monteringen (M7 del 3, DEC-0059, REQ-0352): dialogspråket som spilles og undertekstene som
 * vises, uavhengig av hverandre, av manusspråket og av grensesnittet (som alltid er norsk). Huskes per
 * prosjekt i nettleseren.
 */
import { useCallback, useEffect, useState } from "react";
import { FILM_LANGUAGES, LANGUAGE_LABEL, MAIN_LANGUAGE } from "@/core";

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
      <label className="flex items-center gap-1" title="Språket dialogen spilles på">
        {compact ? null : <span>Dialog</span>}
        <select
          aria-label="Dialogspråk"
          value={value.dialogue}
          onChange={(e) => onChange({ dialogue: e.target.value })}
          className={select}
        >
          {FILM_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {compact ? `Dialog: ${LANGUAGE_LABEL[l] ?? l}` : (LANGUAGE_LABEL[l] ?? l)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1" title="Undertekster i bildet">
        {compact ? null : <span>Undertekster</span>}
        <select
          aria-label="Undertekster i bildet"
          value={value.subtitles ?? ""}
          onChange={(e) => onChange({ subtitles: e.target.value || null })}
          className={select}
        >
          <option value="">{compact ? "Tekst: av" : "Ingen"}</option>
          {FILM_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {compact ? `Tekst: ${LANGUAGE_LABEL[l] ?? l}` : (LANGUAGE_LABEL[l] ?? l)}
            </option>
          ))}
        </select>
      </label>
    </span>
  );
}
