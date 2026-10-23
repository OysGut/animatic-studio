/**
 * G-1b: språkvalg for plakater og karakterkart. Viser kildespråket, språkversjonene og grensesnittspråkene
 * (posterLanguageChoices), med språkets navn på brukerens språk. Testspråket en-XA tas ikke med.
 */
import { languageLabel, posterLanguageChoices, UI_LANGUAGES, type ProjectState } from "@/core";

export function PosterLanguageSelect({
  state,
  value,
  onChange,
  className,
  disabled,
  ariaLabel,
  testId,
}: {
  state: ProjectState;
  value: string;
  onChange: (language: string) => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  testId?: string;
}) {
  const choices = posterLanguageChoices(state, UI_LANGUAGES.filter((l) => l !== "en-XA"), value);
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={testId}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      {choices.map((l) => (
        <option key={l} value={l}>
          {languageLabel(l)}
        </option>
      ))}
    </select>
  );
}
