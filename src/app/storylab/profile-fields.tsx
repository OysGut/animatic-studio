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
import { t as tk } from "@/core/i18n/keyed";

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
    person: tk("app-storylab-profile-fields.person.person.3ae395c7d598"),
    psychology: tk("app-storylab-profile-fields.psychology.psychology.f23337471144"),
    speech: tk("app-storylab-profile-fields.speech.speech.b712714b4da6"),
    dramatic: tk("app-storylab-profile-fields.dramatic.dramatic.986cf622453e"),
    notes: tk("app-storylab-profile-fields.notes.notes.1a9b4524e53b"),
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
    f("person", "age", "number", tk("app-storylab-profile-fields.field-defs.f.344cb82b6318")),
    f("person", "occupation", "short", tk("app-storylab-profile-fields.field-defs.f.978b7621fdd5")),
    f("person", "background", "text", tk("app-storylab-profile-fields.field-defs.f.f7f94ea0be02")),
    f("person", "values", "list", tk("app-storylab-profile-fields.field-defs.f.fd80b7d29161")),
    f("person", "dialect", "short", tk("app-storylab-profile-fields.field-defs.f.c69b7e03638b")),
    f("person", "formality", "formality", tk("app-storylab-profile-fields.field-defs.f.e821b48b3e59")),
    f("psychology", "facade", "text", tk("app-storylab-profile-fields.field-defs.f.03c4441bcbdd")),
    f("psychology", "reality", "text", tk("app-storylab-profile-fields.field-defs.f.3a3fbf2fc4c5")),
    f("psychology", "hiddenMotives", "list", tk("app-storylab-profile-fields.field-defs.f.b20ea957aed1")),
    f("psychology", "techniques", "list", tk("app-storylab-profile-fields.field-defs.f.f6f430a6ffb2")),
    f("psychology", "neverSay", "list", tk("app-storylab-profile-fields.field-defs.f.29b41868d5c3")),
    f("psychology", "blindSpots", "list", tk("app-storylab-profile-fields.field-defs.f.d4daecbf404a")),
    f("psychology", "triggers", "list", tk("app-storylab-profile-fields.field-defs.f.535c2ad77deb")),
    f("psychology", "demonstrations", "list", tk("app-storylab-profile-fields.field-defs.f.c997a4e66ebc")),
    f("speech", "level", "level", tk("app-storylab-profile-fields.field-defs.f.0a24f39a3acb")),
    f("speech", "wordChoice", "text", tk("app-storylab-profile-fields.field-defs.f.46518bae64ef")),
    f("speech", "mood", "short", tk("app-storylab-profile-fields.field-defs.f.bb891d65b9bb")),
    f("speech", "typicalVocabulary", "list", tk("app-storylab-profile-fields.field-defs.f.5cd1821e55ca")),
    f("speech", "forbiddenExpressions", "list", tk("app-storylab-profile-fields.field-defs.f.9567b8828108")),
    f("speech", "examples", "list", tk("app-storylab-profile-fields.field-defs.f.eee889134a7b")),
    f("speech", "maxWords", "number", tk("app-storylab-profile-fields.field-defs.f.f1864242afcd")),
    f("dramatic", "goals", "list", tk("app-storylab-profile-fields.field-defs.f.121cc52dbf81")),
    f("dramatic", "innerContradictions", "list", tk("app-storylab-profile-fields.field-defs.f.15203a5c5400")),
    f("dramatic", "vulnerabilities", "list", tk("app-storylab-profile-fields.field-defs.f.3e3a0d9d0638")),
    f("dramatic", "hides", "list", tk("app-storylab-profile-fields.field-defs.f.a66b5568062f")),
    f("dramatic", "beliefsAboutOthers", "beliefs", tk("app-storylab-profile-fields.field-defs.f.d561526ac99a")),
    f("notes", null, "text", tk("app-storylab-profile-fields.field-defs.f.4e49a6e8af98")),
  ];
}

export const fieldId = (d: Pick<FieldDef, "section" | "key">) => (d.key ? `${d.section}.${d.key}` : d.section);

export function levelLabel(l: string): string {
  return (
    {
      child: tk("app-storylab-profile-fields.child.child.614376080e64"),
      youth: tk("app-storylab-profile-fields.youth.youth.74637fa80402"),
      adult: tk("app-storylab-profile-fields.adult.adult.3d685ecddce9"),
      academic: tk("app-storylab-profile-fields.academic.academic.f60d14a457e8"),
      street: tk("app-storylab-profile-fields.street.street.7ceb8e8f80b1"),
    } as Record<string, string>
  )[l] ?? l;
}
export function formalityLabel(l: string): string {
  return ({ low: tk("app-storylab-profile-fields.low.low.6ddaf555a0af"), medium: tk("app-storylab-profile-fields.medium.medium.a56bff4aab48"), high: tk("app-storylab-profile-fields.high.high.74f07152d66f") } as Record<string, string>)[l] ?? l;
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
  disabled?: boolean | undefined;
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
          <option value="">{tk("app-storylab-profile-fields.field-editor.option.4a272a1e64c9")}</option>
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
  disabled?: boolean | undefined;
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
                  aria-label={tk("app-storylab-profile-fields.chips.aria-label.b089944ebbad", { v: String(v) })}
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
            placeholder={tk("app-storylab-profile-fields.chips.placeholder.5bda8469204f")}
            aria-label={tk("app-storylab-profile-fields.chips.aria-label.0bd808a7ca71", { label: String(label) })}
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
            {tk("app-storylab-profile-fields.chips.button.49467a69187c")}
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
  disabled?: boolean | undefined;
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
            aria-label={tk("app-storylab-profile-fields.beliefs.aria-label.ee623d5e5cde")}
            onChange={(e) => set(i, { assetId: e.target.value })}
            className={control + " h-9 w-40 shrink-0"}
          >
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <Input value={b.belief} disabled={disabled} aria-label={tk("app-storylab-profile-fields.beliefs.aria-label.821d99e55160")} onChange={(e) => set(i, { belief: e.target.value })} />
          {disabled ? null : (
            <button
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              aria-label={tk("app-storylab-profile-fields.beliefs.aria-label.bbb311e05667")}
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
          {tk("app-storylab-profile-fields.beliefs.button.d0c54a173b60")}
        </button>
      )}
    </div>
  );
}
