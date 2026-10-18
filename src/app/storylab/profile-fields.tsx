/**
 * Story Lab (SL2): feltene i karakterprofilen og redigeringen av dem (tekst, lister som «chips», valg og tall).
 * Brukes av karakterflaten, stadiene i karakterbuen og forhåndsvisningen av AI-profilen.
 */
import { X } from "lucide-react";
import { useState } from "react";
import {
  L,
  SPEECH_LEVELS,
  emptyStoryProfile,
  profileError,
  type StoryProfile,
  type StoryProfilePatch,
} from "@/core";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type SectionKey = "person" | "psychology" | "speech" | "dramatic" | "notes";
export type FieldType = "text" | "short" | "list" | "level" | "formality" | "number" | "beliefs";
export interface FieldDef {
  readonly section: SectionKey;
  /** null = selve seksjonen (notes). */
  readonly key: string | null;
  readonly type: FieldType;
  readonly label: string;
}

export function sectionLabel(s: SectionKey): string {
  return {
    person: L("Person", "Person"),
    psychology: L("Psykologi", "Psychology"),
    speech: L("Talestil", "Speech"),
    dramatic: L("Dramatikk", "Drama"),
    notes: L("Notater", "Notes"),
  }[s];
}

export const SECTIONS: readonly SectionKey[] = ["person", "psychology", "speech", "dramatic", "notes"];

/** Feltene i visningsrekkefølge (navnene følger språkvalget). */
export function fieldDefs(): FieldDef[] {
  const f = (section: SectionKey, key: string | null, type: FieldType, label: string): FieldDef => ({
    section,
    key,
    type,
    label,
  });
  return [
    f("person", "age", "number", L("Alder", "Age")),
    f("person", "occupation", "short", L("Yrke", "Occupation")),
    f("person", "background", "text", L("Bakgrunn", "Background")),
    f("person", "values", "list", L("Verdier", "Values")),
    f("person", "dialect", "short", L("Dialekt", "Dialect")),
    f("person", "formality", "formality", L("Formalitet", "Formality")),
    f("psychology", "facade", "text", L("Fasade (slik hun/han fremstår)", "Facade (how they appear)")),
    f("psychology", "reality", "text", L("Virkelighet (det som ligger under)", "Reality (what lies beneath)")),
    f("psychology", "hiddenMotives", "list", L("Skjulte motiver", "Hidden motives")),
    f("psychology", "techniques", "list", L("Samtaleteknikker", "Conversational techniques")),
    f("psychology", "neverSay", "list", L("Ville aldri sagt", "Would never say")),
    f("psychology", "blindSpots", "list", L("Blindsoner", "Blind spots")),
    f("psychology", "triggers", "list", L("Triggere", "Triggers")),
    f("psychology", "demonstrations", "list", L("Slik viser egenskapene seg", "How the traits show")),
    f("speech", "level", "level", L("Språknivå", "Level")),
    f("speech", "wordChoice", "text", L("Ordvalg", "Word choice")),
    f("speech", "mood", "short", L("Stemning", "Mood")),
    f("speech", "typicalVocabulary", "list", L("Typiske ord", "Typical vocabulary")),
    f("speech", "forbiddenExpressions", "list", L("Bruker aldri", "Never uses")),
    f("speech", "examples", "list", L("Eksempelreplikker", "Example lines")),
    f("speech", "maxWords", "number", L("Høyst antall ord per svar", "Maximum words per reply")),
    f("dramatic", "goals", "list", L("Mål", "Goals")),
    f("dramatic", "innerContradictions", "list", L("Indre motsetninger", "Inner contradictions")),
    f("dramatic", "vulnerabilities", "list", L("Sårbarheter", "Vulnerabilities")),
    f("dramatic", "hides", "list", L("Skjuler", "Hides")),
    f("dramatic", "beliefsAboutOthers", "beliefs", L("Hva hun/han tror om andre", "Beliefs about others")),
    f("notes", null, "text", L("Notater", "Notes")),
  ];
}

export const fieldId = (d: Pick<FieldDef, "section" | "key">) => (d.key ? `${d.section}.${d.key}` : d.section);

export function levelLabel(l: string): string {
  return (
    {
      child: L("Barn", "Child"),
      youth: L("Ungdom", "Youth"),
      adult: L("Voksen", "Adult"),
      academic: L("Akademisk", "Academic"),
      street: L("Gate", "Street"),
    } as Record<string, string>
  )[l] ?? l;
}
export function formalityLabel(l: string): string {
  return ({ low: L("Lav", "Low"), medium: L("Middels", "Medium"), high: L("Høy", "High") } as Record<string, string>)[l] ?? l;
}

type Obj = Record<string, unknown>;
export function getField(p: StoryProfile | StoryProfilePatch, d: Pick<FieldDef, "section" | "key">): unknown {
  if (!d.key) return (p as Obj)[d.section];
  return ((p as Obj)[d.section] as Obj | undefined)?.[d.key];
}

/** Ny profil med feltet satt (undefined fjerner valgfrie felt). */
export function setField(p: StoryProfile, d: Pick<FieldDef, "section" | "key">, v: unknown): StoryProfile {
  if (!d.key) return { ...p, [d.section]: v } as StoryProfile;
  const sec = { ...((p as unknown as Obj)[d.section] as Obj) };
  if (v === undefined) delete sec[d.key];
  else sec[d.key] = v;
  return { ...p, [d.section]: sec } as StoryProfile;
}

export function setPatchField(p: StoryProfilePatch, d: Pick<FieldDef, "section" | "key">, v: unknown): StoryProfilePatch {
  const out = { ...(p as Obj) };
  if (!d.key) {
    if (v === undefined) delete out[d.section];
    else out[d.section] = v;
    return out as StoryProfilePatch;
  }
  const sec = { ...((out[d.section] as Obj | undefined) ?? {}) };
  if (v === undefined) delete sec[d.key];
  else sec[d.key] = v;
  if (Object.keys(sec).length) out[d.section] = sec;
  else delete out[d.section];
  return out as StoryProfilePatch;
}

/** Feilmelding for ett felt (prøves alene i en tom profil). */
export function fieldError(d: FieldDef, v: unknown): string | null {
  return profileError(setField(emptyStoryProfile(), d, v));
}

/** Tekstlig visning (forhåndsvisning og sammenligning). */
export function fieldText(v: unknown, d: FieldDef, names: Record<string, string> = {}): string {
  if (v === undefined || v === null || v === "") return "–";
  if (d.type === "level") return levelLabel(String(v));
  if (d.type === "formality") return formalityLabel(String(v));
  if (d.type === "beliefs")
    return (v as { assetId: string; belief: string }[]).map((b) => `${names[b.assetId] ?? "?"}: ${b.belief}`).join(" · ") || "–";
  if (Array.isArray(v)) return v.length ? v.join(" · ") : "–";
  return String(v);
}

export function emptyValue(d: FieldDef): unknown {
  return d.type === "list" || d.type === "beliefs" ? [] : d.type === "level" ? "adult" : d.type === "number" ? undefined : "";
}

const control =
  "w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

/** Redigering av ett felt. */
export function FieldEditor({
  def,
  value,
  onChange,
  disabled,
  others = [],
}: {
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  others?: readonly { id: string; name: string }[];
}) {
  const id = `sl-${fieldId(def)}`;
  const err = fieldError(def, value);
  let input;
  switch (def.type) {
    case "text":
      input = (
        <Textarea
          id={id}
          value={String(value ?? "")}
          disabled={disabled}
          rows={def.section === "notes" ? 6 : 3}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "short":
      input = <Input id={id} value={String(value ?? "")} disabled={disabled} onChange={(e) => onChange(e.target.value || undefined)} />;
      break;
    case "number":
      input = (
        <Input
          id={id}
          type="number"
          value={value === undefined ? "" : String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className="w-32"
        />
      );
      break;
    case "level":
      input = (
        <select id={id} value={String(value ?? "adult")} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={control + " h-8"}>
          {SPEECH_LEVELS.map((l) => (
            <option key={l} value={l}>
              {levelLabel(l)}
            </option>
          ))}
        </select>
      );
      break;
    case "formality":
      input = (
        <select
          id={id}
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={control + " h-8"}
        >
          <option value="">{L("Ikke angitt", "Not set")}</option>
          {["low", "medium", "high"].map((l) => (
            <option key={l} value={l}>
              {formalityLabel(l)}
            </option>
          ))}
        </select>
      );
      break;
    case "list":
      input = <Chips id={id} values={(value as string[] | undefined) ?? []} disabled={disabled} onChange={onChange} label={def.label} />;
      break;
    case "beliefs":
      input = (
        <Beliefs
          values={(value as { assetId: string; belief: string }[] | undefined) ?? []}
          others={others}
          disabled={disabled}
          onChange={onChange}
        />
      );
      break;
  }
  return (
    <div className="space-y-1" data-testid="storylab-field" data-field={fieldId(def)}>
      <label htmlFor={id} className="block text-[12px] text-text-secondary">
        {def.label}
      </label>
      {input}
      {err ? (
        <p role="alert" className="text-[12px] text-status-danger">
          {err}
        </p>
      ) : null}
    </div>
  );
}

/** Liste som «chips»: legg til med Enter eller knappen, fjern med krysset. */
function Chips({
  id,
  values,
  onChange,
  disabled,
  label,
}: {
  id: string;
  values: readonly string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  label: string;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (!t) return;
    onChange([...values, t]);
    setText("");
  };
  return (
    <div className="space-y-1.5">
      {values.length ? (
        <ul className="flex flex-wrap gap-1">
          {values.map((v, i) => (
            <li key={`${i}:${v}`} className="flex items-center gap-1 rounded-sm bg-surface-3 py-0.5 pl-2 pr-1 text-[12px] text-text-primary" data-testid="storylab-chip">
              <span className="max-w-[320px] truncate" title={v}>
                {v}
              </span>
              {disabled ? null : (
                <button
                  type="button"
                  onClick={() => onChange(values.filter((_, j) => j !== i))}
                  aria-label={L(`Fjern «${v}»`, `Remove “${v}”`)}
                  className="rounded-sm p-0.5 text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
                >
                  <X className="size-3" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {disabled ? null : (
        <div className="flex gap-1">
          <Input
            id={id}
            value={text}
            placeholder={L("Skriv og trykk Enter", "Type and press Enter")}
            aria-label={L(`Legg til i ${label}`, `Add to ${label}`)}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button
            type="button"
            onClick={add}
            className="h-9 shrink-0 rounded-sm px-2 text-[12px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
          >
            {L("Legg til", "Add")}
          </button>
        </div>
      )}
    </div>
  );
}

function Beliefs({
  values,
  others,
  onChange,
  disabled,
}: {
  values: readonly { assetId: string; belief: string }[];
  others: readonly { id: string; name: string }[];
  onChange: (v: { assetId: string; belief: string }[]) => void;
  disabled?: boolean;
}) {
  const set = (i: number, patch: Partial<{ assetId: string; belief: string }>) =>
    onChange(values.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <div className="space-y-1.5">
      {values.map((b, i) => (
        <div key={i} className="flex gap-1">
          <select
            value={b.assetId}
            disabled={disabled}
            aria-label={L("Hvem", "Who")}
            onChange={(e) => set(i, { assetId: e.target.value })}
            className={control + " h-9 w-40 shrink-0"}
          >
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <Input value={b.belief} disabled={disabled} aria-label={L("Hva hun/han tror", "What they believe")} onChange={(e) => set(i, { belief: e.target.value })} />
          {disabled ? null : (
            <button
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              aria-label={L("Fjern", "Remove")}
              className="rounded-sm px-1.5 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      ))}
      {disabled || !others.length ? null : (
        <button
          type="button"
          onClick={() => onChange([...values, { assetId: others[0]!.id, belief: "" }])}
          className="h-7 rounded-sm px-2 text-[12px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
        >
          {L("Legg til en person", "Add a person")}
        </button>
      )}
    </div>
  );
}
