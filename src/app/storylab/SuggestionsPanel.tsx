/** SL6: explicit transfer, status and source links. Undo uses the shared command stack. */
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { L, formatHeading, newId, suggestionText, suggestionToCommands, type ProjectState, type SuggestionTarget, type TransferSuggestion } from "@/core";
import { setSuggestionStatus, type StorySuggestion, type StorySuggestionKind } from "@/adapters/storylab/sessions.functions";
import type { Commands } from "@/app/project/use-commands";
import { PanelHeader, ToolbarButton } from "@/app/shell/workspace-chrome";
import { SuggestionPreview } from "./SuggestionPreview";
import { suggestionKey, useStorySuggestions } from "./suggestions-data";

export const suggestionKindLabels = () => ({ line: L("Replikk", "Line"), scene_draft: L("Sceneutkast", "Scene draft"), profile_change: L("Profilendring", "Profile change"), analysis: L("Analyse", "Analysis"), motivation: L("Motivasjon", "Motivation"), plot_point: L("Handlingspunkt", "Plot point") });
const statusLabels = () => ({ open: L("Åpne", "Open"), applied: L("Brukt", "Applied"), discarded: L("Forkastet", "Discarded") });
export function SuggestionsPanel({ state, projectId, cmds, editable, focusedId, sceneFilter, onSource }: {
  state: ProjectState; projectId: string; cmds: Commands; editable: boolean; focusedId?: string | null; sceneFilter?: string | null;
  onSource: (sessionId: string, turnId: string | null) => void;
}) {
  const query = useStorySuggestions(projectId), qc = useQueryClient(), update = useServerFn(setSuggestionStatus);
  const [status, setStatus] = useState<StorySuggestion["status"]>("open");
  const [kind, setKind] = useState<StorySuggestionKind | "">("");
  const [preview, setPreview] = useState<StorySuggestion | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const destinationKey = ["story-suggestion-transfers", projectId];
  type Destination = { occurrenceId: string; blockId: string | null; group: string; complete: boolean };
  const destinationQuery = useQuery<Record<string, Destination>>({ queryKey: destinationKey, queryFn: async () => ({}), enabled: false, initialData: {}, staleTime: Infinity });
  const destinations = destinationQuery.data ?? {};
  const setDestinations = (fn: (old: Record<string, Destination>) => Record<string, Destination>) => {
    qc.setQueryData<Record<string, Destination>>(destinationKey, (old) => fn(old ?? {}));
  };
  const lock = useRef(false);
  useEffect(() => { if (focusedId) { setStatus("open"); setKind(""); } }, [focusedId]);
  useEffect(() => { if (focusedId && query.data) document.getElementById(`suggestion-${focusedId}`)?.scrollIntoView({ block: "nearest" }); }, [focusedId, query.data]);
  const set = async (id: string, value: StorySuggestion["status"]) => {
    const r = await update({ data: { projectId, suggestionId: id, status: value } });
    if (!r.ok) throw new Error(r.message);
    qc.setQueryData<StorySuggestion[]>(suggestionKey(projectId), (old) => old?.map((s) => s.id === id ? { ...s, status: value } : s));
    void qc.invalidateQueries({ queryKey: suggestionKey(projectId) });
  };
  const perform = async (fn: () => Promise<void>) => { if (lock.current) return; lock.current = true; setBusy(true); setError(null); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : L("Overføringen kunne ikke utføres.", "The transfer could not be completed.")); } finally { lock.current = false; setBusy(false); } };
  const apply = (suggestion: TransferSuggestion, target: SuggestionTarget) => perform(async () => {
    await cmds.whenIdle();
    const current = cmds.current();
    if (!current) throw new Error(L("Prosjektet kunne ikke hentes.", "The project could not be loaded."));
    if (("assetId" in target && JSON.stringify(current.storyProfiles) !== JSON.stringify(state.storyProfiles)) ||
      ("variantId" in target && Object.values(current.blocks).filter((b) => b.variantId === target.variantId).some((b) => JSON.stringify(b) !== JSON.stringify(state.blocks[b.id])))) {
      throw new Error(L("Innholdet ble endret mens forhåndsvisningen var åpen. Lukk og åpne forhåndsvisningen på nytt.", "The content changed while the preview was open. Close and reopen the preview."));
    }
    const plan = suggestionToCommands(current, suggestion, target);
    if (!plan.ok) throw new Error(plan.message);
    const group = `storylab:${suggestion.id}:${newId()}`;
    const occurrence = "variantId" in target ? Object.values(current.occurrences).find((o) => o.active && o.productionId === target.productionId && o.variantId === target.variantId) : undefined;
    const first = plan.commands[0];
    const blockId = first?.type === "InsertBlock" ? first.block.blockId : first?.type === "EditBlockText" ? first.blockId : first?.type === "AddAnnotations" ? first.annotations[0]?.blockId ?? null : null;
    let completed = 0;
    for (const command of plan.commands) {
      const r = await cmds.runAndWait(command, L("Bruk forslag fra Story Lab", "Use Story Lab suggestion"), group);
      if (r.error) {
        if (completed) {
          setDestinations((old) => ({ ...old, [suggestion.id]: { occurrenceId: occurrence?.id ?? "", blockId, group, complete: false } }));
          setPreview(null);
          throw new Error(L(`Overføringen ble bare delvis lagret. Angre før du prøver igjen. ${r.error}`, `The transfer was only partially saved. Undo before trying again. ${r.error}`));
        }
        throw new Error(r.error);
      }
      completed++;
    }
    setDestinations((old) => ({ ...old, [suggestion.id]: { occurrenceId: occurrence?.id ?? "", blockId, group, complete: true } }));
    // Set status only after every command has been persisted. A status failure cannot repeat insertion.
    setPreview(null);
    try { await set(suggestion.id, "applied"); } catch {
      throw new Error(L("Overføringen er lagret, men statusen kunne ikke oppdateres. Velg «Merk som brukt» eller angre.", "The transfer was saved, but its status could not be updated. Choose ‘Mark applied’ or undo."));
    }
    setStatus("applied");
  });
  const list = (query.data ?? []).filter((s) => s.status === status && (!kind || s.kind === kind) && (!sceneFilter || s.payload["sceneId"] === sceneFilter));
  const groups = new Map<string, StorySuggestion[]>();
  for (const s of list) { const id = typeof s.payload["sceneId"] === "string" ? s.payload["sceneId"] : ""; groups.set(id, [...(groups.get(id) ?? []), s]); }
  return <div data-testid="storylab-suggestions" className="min-h-0 flex-1 overflow-y-auto">
    <PanelHeader title={L("Forslag", "Suggestions")} count={list.length} />
    <div className="flex flex-wrap gap-1 p-2"><select className="h-8 max-w-full" aria-label={L("Status", "Status")} value={status} onChange={(e) => setStatus(e.target.value as StorySuggestion["status"])}>{Object.entries(statusLabels()).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><select className="h-8 max-w-full" aria-label={L("Type", "Type")} value={kind} onChange={(e) => setKind(e.target.value as StorySuggestionKind | "")}><option value="">{L("Alle typer", "All types")}</option>{Object.entries(suggestionKindLabels()).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
    {query.isPending ? <p className="p-2 text-xs">{L("Henter forslag …", "Loading suggestions …")}</p> : null}
    {query.isError ? <div role="alert" className="p-2 text-xs text-status-danger">{L("Forslagene kunne ikke hentes.", "The suggestions could not be loaded.")}<ToolbarButton onClick={() => void query.refetch()}>{L("Prøv igjen", "Try again")}</ToolbarButton></div> : null}
    {!query.isPending && !query.isError && !list.length ? <p className="p-2 text-xs text-text-tertiary">{L("Ingen forslag med disse filtrene.", "No suggestions match these filters.")}</p> : null}
    {[...groups].map(([sceneId, suggestions]) => <section key={sceneId} className="p-2"><PanelHeader title={sceneId ? (() => { const v = Object.values(state.variants).find((v) => v.sceneId === sceneId); return v ? formatHeading(v.heading) : sceneId; })() : L("Uten scene", "No scene")} />{suggestions.map((s) => {
      const destination = destinations[s.id];
      const action = s.kind === "line" ? s.payload["blockId"] ? L("Bruk i manus …", "Use in script …") : L("Sett inn i manus …", "Insert into script …") : s.kind === "scene_draft" ? L("Sett inn utkast …", "Insert draft …") : s.kind === "profile_change" ? L("Bruk på profilen …", "Apply to profile …") : L("Legg som notat i manus …", "Add as script note …");
      return <article key={s.id} id={`suggestion-${s.id}`} data-testid="storylab-suggestion" data-suggestion-id={s.id} data-kind={s.kind} data-status={s.status} className={`mb-2 min-w-0 rounded-sm border bg-surface-2 p-2 text-xs ${focusedId === s.id ? "border-accent-brand" : "border-border"}`}><strong>{suggestionKindLabels()[s.kind]}</strong><span className="ml-2 text-text-tertiary">{statusLabels()[s.status]}</span><p className="my-2 line-clamp-4 break-words whitespace-pre-wrap">{suggestionText(s)}</p>
        {s.sessionId ? <ToolbarButton className="h-auto w-full whitespace-normal break-all text-left text-xs" onClick={() => onSource(s.sessionId ?? "", s.turnId)}>{L(`Fra økten ${s.sessionId}, tur ${s.turnId ?? "–"}`, `From session ${s.sessionId}, turn ${s.turnId ?? "–"}`)}</ToolbarButton> : null}
        {destination?.occurrenceId ? <Link to="/prosjekt/$projectId/manus" params={{ projectId }} search={{ scene: destination.occurrenceId, ...(destination.blockId ? { blokk: destination.blockId } : {}) }} className="block text-accent-brand">{L("Vis i manuset", "Show in script")}</Link> : null}
        <div className="mt-2 flex flex-wrap gap-1">{editable && s.status === "open" && !destination ? <ToolbarButton data-testid="storylab-suggestion-apply" disabled={busy} onClick={() => setPreview(s)}>{action}</ToolbarButton> : null}
          {editable && destination && cmds.undoGroup === destination.group ? <ToolbarButton data-testid="storylab-suggestion-undo" disabled={busy} onClick={() => cmds.undo()}>{L("Angre", "Undo")}</ToolbarButton> : null}
          {editable && s.status !== "discarded" ? <ToolbarButton data-testid="storylab-suggestion-discard" disabled={busy} onClick={() => void perform(() => set(s.id, "discarded"))}>{L("Forkast", "Discard")}</ToolbarButton> : null}
          {editable && s.status !== "open" ? <ToolbarButton data-testid="storylab-suggestion-reopen" disabled={busy} onClick={() => void perform(() => set(s.id, "open"))}>{L("Gjenåpne", "Reopen")}</ToolbarButton> : null}
          {editable && destination?.complete && s.status === "open" ? <ToolbarButton disabled={busy} onClick={() => void perform(() => set(s.id, "applied"))}>{L("Merk som brukt", "Mark applied")}</ToolbarButton> : null}
        </div></article>;
    })}</section>)}
    {error ? <p role="alert" className="p-2 text-xs text-status-danger">{error}</p> : null}
    {preview ? <SuggestionPreview state={state} suggestion={preview} onClose={() => setPreview(null)} onConfirm={apply} busy={busy} cmds={cmds} /> : null}
  </div>;
}