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

export function NoteFlagControl({ state, kind, targetId, run, editable, names }: {
  state: ProjectState; kind: NoteFlagTargetKind; targetId: string;
  run?: ((command: Command, label: string) => string | null) | undefined;
  editable: boolean;
  /** Visningsnavn per bruker-ID (prosjektmedlemmer). */
  names?: Readonly<Record<string, string>> | undefined;
}) {
  const flags = flagsFor(state, kind, targetId);
  const active = flags.some(f => f.enabled);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const exec = (command: Command, label: string) => { const e = run?.(command, label) ?? null; setError(e); };
  const label = active ? L(`Huskelapp (${flags.filter(f => f.enabled).length} aktiv)`, `Note flag (${flags.filter(f => f.enabled).length} active)`) : L("Huskelapp", "Note flag");
  const when = (iso?: string | null) => iso ? new Date(iso).toLocaleString(L("nb-NO", "en-GB")) : "";
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" data-testid="note-flag-button" data-note-kind={kind} data-target-id={targetId} data-active={active} aria-label={label} title={label} onClick={e => e.stopPropagation()} className={"inline-flex size-6 shrink-0 items-center justify-center rounded-sm hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-brand " + (active ? "bg-note-bg text-note" : "text-text-tertiary")}>
        <StickyNote className="size-3.5" aria-hidden />
      </button>
    </PopoverTrigger>
    <PopoverContent data-testid="note-flag-popover" className="w-80" onClick={e => e.stopPropagation()}>
      <p className="mb-2 text-xs font-medium text-text-primary">{L("Huskelapper", "Note flags")}</p>
      {flags.length === 0 ? <p className="mb-2 text-xs text-text-tertiary">{L("Ingen huskelapp her ennå.", "No note flag here yet.")}</p> : null}
      {flags.map(f => <div key={f.id} data-testid="note-flag-item" data-enabled={f.enabled} className="mb-2 flex flex-col gap-1 border-b border-border pb-2">
        <label className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" data-testid="note-flag-enabled" checked={f.enabled} disabled={!editable} onChange={e => exec({ type: "UpdateNoteFlag", flagId: f.id, enabled: e.target.checked }, e.target.checked ? L("Slå på huskelapp", "Turn on note flag") : L("Slå av huskelapp", "Turn off note flag"))} />{f.enabled ? L("Aktiv", "Active") : L("Av (teksten beholdes)", "Off (text is kept)")}</label>
        <Textarea data-testid="note-flag-text" aria-label={L("Tekst på huskelappen (valgfri)", "Note flag text (optional)")} maxLength={NOTE_FLAG_MAX_TEXT} disabled={!editable} value={drafts[f.id] ?? f.text} onChange={e => setDrafts({ ...drafts, [f.id]: e.target.value })} className="min-h-14 text-xs" />
        <p className="text-[11px] text-text-tertiary">{L(`Opprettet av ${names?.[f.createdBy ?? ""] ?? L("ukjent", "unknown")} ${when(f.createdAt)}`, `Created by ${names?.[f.createdBy ?? ""] ?? "unknown"} ${when(f.createdAt)}`)}{f.editedAt ? L(` · endret av ${names?.[f.editedBy ?? ""] ?? "ukjent"} ${when(f.editedAt)}`, ` · edited by ${names?.[f.editedBy ?? ""] ?? "unknown"} ${when(f.editedAt)}`) : ""}</p>
        {editable ? <div className="flex gap-2">
          <Button size="sm" variant="secondary" data-testid="note-flag-save" disabled={drafts[f.id] === undefined || drafts[f.id] === f.text} onClick={() => { exec({ type: "UpdateNoteFlag", flagId: f.id, text: drafts[f.id] ?? f.text }, L("Endre huskelapp", "Edit note flag")); setDrafts(({ [f.id]: _drop, ...rest }) => rest); }}>{L("Lagre tekst", "Save text")}</Button>
          <Button size="sm" variant="ghost" data-testid="note-flag-delete" onClick={() => exec({ type: "SetNoteFlagRemoved", flagId: f.id, removed: true }, L("Slett huskelapp", "Delete note flag"))}>{L("Slett", "Delete")}</Button>
        </div> : null}
      </div>)}
      {editable && run ? <Button size="sm" data-testid="note-flag-add" onClick={() => exec({ type: "AddNoteFlag", flagId: newId<"command">(), targetKind: kind, targetId, text: "" }, L("Ny huskelapp", "New note flag"))}>{L("Ny huskelapp", "New note flag")}</Button> : null}
      {error ? <p role="alert" className="mt-1 text-xs text-status-danger">{error}</p> : null}
    </PopoverContent>
  </Popover>;
}
