/**
 * DV8: gul huskelapp på et element (lydversjon, lydsegment, bilde, bildevariant eller sceneforekomst).
 * Av/på uten tekst, valgfri tekst, avslått lapp beholder teksten; sletting er en egen handling.
 */
import { useState } from "react";
import { StickyNote } from "lucide-react";
import { L, flagsFor, newId, NOTE_FLAG_MAX_TEXT, type Command, type NoteFlagTargetKind, type ProjectState } from "@/core";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useProfiles } from "@/app/project/use-project";
import { t } from "@/core/i18n/keyed";

export function NoteFlagControl({ state, kind, targetId, run, editable, names }: {
  state: ProjectState; kind: NoteFlagTargetKind; targetId: string;
  run?: ((command: Command, label: string) => string | null) | undefined;
  editable: boolean;
  /** Visningsnavn per bruker-ID (prosjektmedlemmer). */
  names?: Readonly<Record<string, string>> | undefined;
}) {
  const flags = flagsFor(state, kind, targetId);
  const userIds = [...new Set(flags.flatMap(f => [f.createdBy, f.editedBy]).filter((x): x is string => !!x))];
  const profiles = useProfiles(userIds);
  const nameOf = (id?: string | null) => {
    const n = (id && (names?.[id] || profiles.data?.[id]?.display_name)) || "";
    return n.trim() ? n : t("app-dialogue-note-flag-control.name-of.message.c817171c3000");
  };
  const active = flags.some(f => f.enabled);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const exec = (command: Command, label: string) => { const e = run?.(command, label) ?? null; setError(e); };
  const label = active ? t("app-dialogue-note-flag-control.label.message.de3a4a78fa01", { length: String(flags.filter(f => f.enabled).length) }) : t("app-dialogue-note-flag-control.label.message.1cfba46c53bd");
  const when = (iso?: string | null) => iso ? new Date(iso).toLocaleString(t("app-dialogue-note-flag-control.when.new-date-iso-to-locale-string.160f3471de16")) : "";
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" data-testid="note-flag-button" data-note-kind={kind} data-target-id={targetId} data-active={active} aria-label={label} title={label} onClick={e => e.stopPropagation()} className={"inline-flex size-6 shrink-0 items-center justify-center rounded-sm hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-brand " + (active ? "bg-note-bg text-note" : "text-text-tertiary")}>
        <StickyNote className="size-3.5" aria-hidden />
      </button>
    </PopoverTrigger>
    <PopoverContent data-testid="note-flag-popover" className="w-80" onClick={e => e.stopPropagation()}>
      <p className="mb-2 text-xs font-medium text-text-primary">{t("app-dialogue-note-flag-control.note-flag-control.p.6f557e80c9fd")}</p>
      {flags.length === 0 ? <p className="mb-2 text-xs text-text-tertiary">{t("app-dialogue-note-flag-control.note-flag-control.p.be4f6f464ac9")}</p> : null}
      {flags.map(f => <div key={f.id} data-testid="note-flag-item" data-enabled={f.enabled} className="mb-2 flex flex-col gap-1 border-b border-border pb-2">
        <label className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" data-testid="note-flag-enabled" checked={f.enabled} disabled={!editable} onChange={e => exec({ type: "UpdateNoteFlag", flagId: f.id, enabled: e.target.checked }, e.target.checked ? t("app-dialogue-note-flag-control.note-flag-control.exec.bd4d5467b168") : t("app-dialogue-note-flag-control.note-flag-control.exec.48d4a0a38efb"))} />{f.enabled ? t("app-dialogue-note-flag-control.note-flag-control.label.5a14cd2d2aae") : t("app-dialogue-note-flag-control.note-flag-control.label.1d6117102efe")}</label>
        <Textarea data-testid="note-flag-text" aria-label={t("app-dialogue-note-flag-control.note-flag-control.aria-label.337f36b4d791")} maxLength={NOTE_FLAG_MAX_TEXT} disabled={!editable} value={drafts[f.id] ?? f.text} onChange={e => setDrafts({ ...drafts, [f.id]: e.target.value })} className="min-h-14 text-xs" />
        <p className="text-[11px] text-text-tertiary">{t("app-dialogue-note-flag-control.note-flag-control.p.7e80425b6f8c", { value1: String(nameOf(f.createdBy)), value2: String(when(f.createdAt)) })}{f.editedAt ? t("app-dialogue-note-flag-control.note-flag-control.p.f76b01f9b8ee", { value1: String(nameOf(f.editedBy)), value2: String(when(f.editedAt)) }) : ""}</p>
        {editable ? <div className="flex gap-2">
          <Button size="sm" variant="secondary" data-testid="note-flag-save" disabled={drafts[f.id] === undefined || drafts[f.id] === f.text} onClick={() => { exec({ type: "UpdateNoteFlag", flagId: f.id, text: drafts[f.id] ?? f.text }, t("app-dialogue-note-flag-control.note-flag-control.exec.64f24fea0210")); setDrafts(({ [f.id]: _drop, ...rest }) => rest); }}>{t("app-dialogue-note-flag-control.note-flag-control.button.b40ff54b049e")}</Button>
          <Button size="sm" variant="ghost" data-testid="note-flag-delete" onClick={() => exec({ type: "SetNoteFlagRemoved", flagId: f.id, removed: true }, t("app-dialogue-note-flag-control.note-flag-control.exec.d9c341ae8e7d"))}>{t("app-dialogue-note-flag-control.note-flag-control.button.97715f200f95")}</Button>
        </div> : null}
      </div>)}
      {editable && run ? <Button size="sm" data-testid="note-flag-add" onClick={() => exec({ type: "AddNoteFlag", flagId: newId<"command">(), targetKind: kind, targetId, text: "" }, t("app-dialogue-note-flag-control.note-flag-control.exec.6817a2c6e03e"))}>{t("app-dialogue-note-flag-control.note-flag-control.button.6817a2c6e03e")}</Button> : null}
      {error ? <p role="alert" className="mt-1 text-xs text-status-danger">{error}</p> : null}
    </PopoverContent>
  </Popover>;
}
