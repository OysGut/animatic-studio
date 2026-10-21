/** Små skjemaelementer i egenskapspanelene i sceneeditoren. */
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { useRef, useState, type ReactNode } from "react";
import { Diamond } from "lucide-react";

import { t } from "@/core/i18n/keyed";

export const inputClass =
  "h-7 w-full min-w-0 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary placeholder:text-text-tertiary disabled:cursor-not-allowed disabled:opacity-50";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <PanelHeader as="h3" className="-mx-3 mb-1.5" title={title} />
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

export function Field({
  label,
  children,
  marker,
}: {
  label: string;
  children: ReactNode;
  marker?: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-text-secondary">
      {marker ? (
        <span className="flex items-center gap-1">
          {label}
          {marker}
        </span>
      ) : (
        label
      )}
      {children}
    </label>
  );
}

/** Nøkkelbilde-markør ved en egenskap: fylt = nøkkelbilde på dette bildet, åpen = animert, svak = ikke animert. */
export function KeyMarker({
  label,
  animated,
  keyed,
  disabled,
  onToggle,
}: {
  label: string;
  animated: boolean;
  keyed: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={keyed}
      aria-label={
        keyed
          ? t("app-scene-editor-inspector-fields.key-marker.aria-label.cede78e7bb05", { label: String(label) })
          : t("app-scene-editor-inspector-fields.key-marker.aria-label.91b98153c212", { label: String(label) })
      }
      title={
        keyed
          ? t("app-scene-editor-inspector-fields.key-marker.title.d7c2ae24a247")
          : t("app-scene-editor-inspector-fields.key-marker.title.21ef13d2ac82")
      }
      onClick={(e) => {
        e.preventDefault();
        onToggle();
      }}
      className={
        "inline-flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 " +
        (animated ? "text-accent-brand" : "text-text-tertiary")
      }
    >
      <Diamond className="size-2.5" fill={keyed ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-text-tertiary">{children}</p>;
}

export function ErrorText({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="mb-3 text-xs text-status-danger">
      {message}
    </p>
  ) : null;
}

export const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Tekstfelt som lagres når du forlater det eller trykker Enter. Esc forkaster. */
export function TextField({
  label,
  value,
  onCommit,
  disabled,
  placeholder,
  allowEmpty,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  disabled: boolean;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false); // Esc forkaster (blur kjører med forrige utkast)
  function commit() {
    const text = (draft ?? value).trim();
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (text === value) return;
    if (text === "" && !allowEmpty) return;
    onCommit(text);
  }
  return (
    <Field label={label}>
      <input
        type="text"
        value={draft ?? value}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={200}
        onFocus={() => setDraft(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            cancelled.current = true;
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        className={inputClass}
      />
    </Field>
  );
}

/** Tallfelt med kladd: ugyldige tall forkastes, gyldige lagres ved blur eller Enter. */
export function NumberField({
  label,
  value,
  onCommit,
  disabled,
  step = 1,
  min,
  max,
  integer,
  valid,
  marker,
}: {
  label: string;
  marker?: ReactNode;
  value: number;
  onCommit: (n: number) => void;
  disabled: boolean;
  step?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  valid?: (n: number) => boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  function commit() {
    const text = draft;
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (text === null) return;
    let n = Number(text.trim().replace(",", "."));
    if (text.trim() === "" || !Number.isFinite(n)) return;
    if (integer) n = Math.round(n);
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    if (valid && !valid(n)) return;
    if (fmt(n) === fmt(value)) return;
    onCommit(n);
  }
  return (
    <Field label={label} marker={marker}>
      <input
        type="number"
        inputMode="decimal"
        value={draft ?? fmt(value)}
        disabled={disabled}
        step={step}
        min={min}
        max={max}
        onFocus={() => setDraft(fmt(value))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            cancelled.current = true;
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        className={inputClass}
      />
    </Field>
  );
}
