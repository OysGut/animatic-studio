/**
 * G-1b: felt for en BCP-47-språkkode med forslag fra grensesnittsspråkene og validering.
 * Brukes ved prosjektoppretting, bytte av kildespråk og import av manus.
 */
import { useId } from "react";
import { UI_LANGUAGES, languageLabel, languageTagError } from "@/core";
import { Input } from "@/components/ui/input";

export function LanguageTagInput({
  value,
  onChange,
  label,
  testId,
  autoFocus,
  className,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Synlig og skjermleser-etikett (allerede oversatt). */
  label: string;
  testId?: string;
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const error = value.trim() ? languageTagError(value.trim()) : null;
  return (
    <span className="inline-flex flex-col gap-1">
      <Input
        aria-label={label}
        title={label}
        list={listId}
        data-testid={testId}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder="en, ja, nb …" // i18n-ignore: BCP-47 language identifiers, not UI copy
        maxLength={100}
        className={className ?? "h-8 w-40 bg-surface-3"}
      />
      <datalist id={listId}>
        {UI_LANGUAGES.filter((l) => l !== "en-XA").map((l) => (
          <option key={l} value={l}>
            {languageLabel(l)}
          </option>
        ))}
      </datalist>
      {error ? (
        <span role="alert" className="text-xs text-status-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
