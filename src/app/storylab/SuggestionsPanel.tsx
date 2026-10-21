/** SL6: explicit transfer, status and source links. Undo uses the shared command stack. */
import { requestAnalysisNow } from "@/app/library/entity-analysis-store";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatHeading, newId, suggestionText, suggestionToCommands, type ProjectState, type SuggestionTarget, type TransferSuggestion } from "@/core";
import { setSuggestionStatus, type StorySuggestion, type StorySuggestionKind } from "@/adapters/storylab/sessions.functions";
import type { Commands } from "@/app/project/use-commands";
import { PanelHeader, ToolbarButton } from "@/app/shell/workspace-chrome";
import { SuggestionPreview } from "./SuggestionPreview";
import { suggestionKey, useStorySuggestions } from "./suggestions-data";
import { t } from "@/core/i18n/keyed";

export const suggestionKindLabels = () => ({ line: t("app-storylab-suggestions-panel.line.line.fa65b7b2e102"), scene_draft: t("app-storylab-suggestions-panel.scene-draft.scene-draft.6db683f36c4e"), profile_change: t("app-storylab-suggestions-panel.profile-change.profile-change.2bed015d6540"), analysis: t("app-storylab-suggestions-panel.analysis.analysis.f724bae331a6"), motivation: t("app-storylab-suggestions-panel.motivation.motivation.bc1efb5b304b"), plot_point: t("app-storylab-suggestions-panel.plot-point.plot-point.5d988e42bd0d") });
const statusLabels = () => ({ open: t("app-storylab-suggestions-panel.open.open.c05a21c34b40"), applied: t("app-storylab-suggestions-panel.applied.applied.d2676ab37e03"), discarded: t("app-storylab-suggestions-panel.discarded.discarded.c29838d2c1fe") });
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
  const perform = async (fn: () => Promise<void>) => { if (lock.current) return; lock.current = true; setBusy(true); setError(null); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : t("app-storylab-suggestions-panel.perform.set-error.0aad5027dff0")); } finally { lock.current = false; setBusy(false); } };
  const apply = (suggestion: TransferSuggestion, target: SuggestionTarget) => perform(async () => {
    await cmds.whenIdle();
    const current = cmds.current();
    if (!current) throw new Error(t("app-storylab-suggestions-panel.apply.perform.a775800c565d"));
    if (("assetId" in target && JSON.stringify(current.storyProfiles) !== JSON.stringify(state.storyProfiles)) ||
      ("variantId" in target && Object.values(current.blocks).filter((b) => b.variantId === target.variantId).some((b) => JSON.stringify(b) !== JSON.stringify(state.blocks[b.id])))) {
      throw new Error(t("app-storylab-suggestions-panel.apply.perform.914aed7e64e3"));
    }
    const plan = suggestionToCommands(current, suggestion, target);
    if (!plan.ok) throw new Error(plan.message);
    const group = `storylab:${suggestion.id}:${newId()}`;
    const occurrence = "variantId" in target ? Object.values(current.occurrences).find((o) => o.active && o.productionId === target.productionId && o.variantId === target.variantId) : undefined;
    const first = plan.commands[0];
    const blockId = first?.type === "InsertBlock" ? first.block.blockId : first?.type === "EditBlockText" ? first.blockId : first?.type === "AddAnnotations" ? first.annotations[0]?.blockId ?? null : null;
    let completed = 0;
    for (const command of plan.commands) {
      const r = await cmds.runAndWait(command, t("app-storylab-suggestions-panel.r.cmds-run-and-wait.374fb307bfe3"), group);
      if (r.error) {
        if (completed) {
          setDestinations((old) => ({ ...old, [suggestion.id]: { occurrenceId: occurrence?.id ?? "", blockId, group, complete: false } }));
          setPreview(null);
          throw new Error(t("app-storylab-suggestions-panel.apply.perform.d42258ff6402", { error: String(r.error) }));
        }
        throw new Error(r.error);
      }
      completed++;
    }
    setDestinations((old) => ({ ...old, [suggestion.id]: { occurrenceId: occurrence?.id ?? "", blockId, group, complete: true } }));
    // Manustekst fra Story Lab: automatisk gjenkjenning straks (OG2)
    if ("variantId" in target) requestAnalysisNow(projectId);
    // Set status only after every command has been persisted. A status failure cannot repeat insertion.
    setPreview(null);
    try { await set(suggestion.id, "applied"); } catch {
      throw new Error(t("app-storylab-suggestions-panel.apply.perform.6228ca5685b1"));
    }
    setStatus("applied");
  });
  const list = (query.data ?? []).filter((s) => s.status === status && (!kind || s.kind === kind) && (!sceneFilter || s.payload["sceneId"] === sceneFilter));
  const groups = new Map<string, StorySuggestion[]>();
  for (const s of list) { const id = typeof s.payload["sceneId"] === "string" ? s.payload["sceneId"] : ""; groups.set(id, [...(groups.get(id) ?? []), s]); }
  return <div data-testid="storylab-suggestions" className="min-h-0 flex-1 overflow-y-auto">
    <PanelHeader title={t("app-storylab-suggestions-panel.suggestions-panel.title.35026a619fe4")} count={list.length} />
    <div className="flex flex-wrap gap-1 p-2"><select className="h-8 max-w-full" aria-label={t("app-storylab-suggestions-panel.suggestions-panel.aria-label.0c6bbc346171")} value={status} onChange={(e) => setStatus(e.target.value as StorySuggestion["status"])}>{Object.entries(statusLabels()).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><select className="h-8 max-w-full" aria-label={t("app-storylab-suggestions-panel.suggestions-panel.aria-label.86508ffd63df")} value={kind} onChange={(e) => setKind(e.target.value as StorySuggestionKind | "")}><option value="">{t("app-storylab-suggestions-panel.suggestions-panel.option.58c2bc05feb7")}</option>{Object.entries(suggestionKindLabels()).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
    {query.isPending ? <p className="p-2 text-xs">{t("app-storylab-suggestions-panel.suggestions-panel.p.0a64e3935826")}</p> : null}
    {query.isError ? <div role="alert" className="p-2 text-xs text-status-danger">{t("app-storylab-suggestions-panel.suggestions-panel.div.e33d2b32ec10")}<ToolbarButton onClick={() => void query.refetch()}>{t("app-storylab-suggestions-panel.suggestions-panel.toolbar-button.dad1a4481844")}</ToolbarButton></div> : null}
    {!query.isPending && !query.isError && !list.length ? <p className="p-2 text-xs text-text-tertiary">{t("app-storylab-suggestions-panel.suggestions-panel.p.ded326640d44")}</p> : null}
    {[...groups].map(([sceneId, suggestions]) => <section key={sceneId} className="p-2"><PanelHeader title={sceneId ? (() => { const v = Object.values(state.variants).find((v) => v.sceneId === sceneId); return v ? formatHeading(v.heading) : sceneId; })() : t("app-storylab-suggestions-panel.suggestions-panel.title.d105079f89f8")} />{suggestions.map((s) => {
      const destination = destinations[s.id];
      const action = s.kind === "line" ? s.payload["blockId"] ? t("app-storylab-suggestions-panel.action.suggestions-map.3c687619551c") : t("app-storylab-suggestions-panel.action.suggestions-map.80149a43dbf4") : s.kind === "scene_draft" ? t("app-storylab-suggestions-panel.action.suggestions-map.879b054f1e27") : s.kind === "profile_change" ? t("app-storylab-suggestions-panel.action.suggestions-map.ef2ccf22e1d9") : t("app-storylab-suggestions-panel.action.suggestions-map.03f1f753a39a");
      return <article key={s.id} id={`suggestion-${s.id}`} data-testid="storylab-suggestion" data-suggestion-id={s.id} data-kind={s.kind} data-status={s.status} className={`mb-2 min-w-0 rounded-sm border bg-surface-2 p-2 text-xs ${focusedId === s.id ? "border-accent-brand" : "border-border"}`}><strong>{suggestionKindLabels()[s.kind]}</strong><span className="ml-2 text-text-tertiary">{statusLabels()[s.status]}</span><p className="my-2 line-clamp-4 break-words whitespace-pre-wrap">{suggestionText(s)}</p>
        {s.sessionId ? <ToolbarButton className="h-auto w-full whitespace-normal break-all text-left text-xs" onClick={() => onSource(s.sessionId ?? "", s.turnId)}>{t("app-storylab-suggestions-panel.suggestions-panel.toolbar-button.8b7e34756852", { sessionId: String(s.sessionId), value2: String(s.turnId ?? "–") })}</ToolbarButton> : null}
        {destination?.occurrenceId ? <Link to="/prosjekt/$projectId/manus" params={{ projectId }} search={{ scene: destination.occurrenceId, ...(destination.blockId ? { blokk: destination.blockId } : {}) }} className="block text-accent-brand">{t("app-storylab-suggestions-panel.suggestions-panel.link.bd20b2947b2c")}</Link> : null}
        <div className="mt-2 flex flex-wrap gap-1">{editable && s.status === "open" && !destination ? <ToolbarButton data-testid="storylab-suggestion-apply" disabled={busy} onClick={() => setPreview(s)}>{action}</ToolbarButton> : null}
          {editable && destination && cmds.undoGroup === destination.group ? <ToolbarButton data-testid="storylab-suggestion-undo" disabled={busy} onClick={() => cmds.undo()}>{t("app-storylab-suggestions-panel.suggestions-panel.toolbar-button.38ab076eedbe")}</ToolbarButton> : null}
          {editable && s.status !== "discarded" ? <ToolbarButton data-testid="storylab-suggestion-discard" disabled={busy} onClick={() => void perform(() => set(s.id, "discarded"))}>{t("app-storylab-suggestions-panel.suggestions-panel.toolbar-button.8eae4920a35e")}</ToolbarButton> : null}
          {editable && s.status !== "open" ? <ToolbarButton data-testid="storylab-suggestion-reopen" disabled={busy} onClick={() => void perform(() => set(s.id, "open"))}>{t("app-storylab-suggestions-panel.suggestions-panel.toolbar-button.b641a2eeb498")}</ToolbarButton> : null}
          {editable && destination?.complete && s.status === "open" ? <ToolbarButton disabled={busy} onClick={() => void perform(() => set(s.id, "applied"))}>{t("app-storylab-suggestions-panel.suggestions-panel.toolbar-button.9d64414bd2be")}</ToolbarButton> : null}
        </div></article>;
    })}</section>)}
    {error ? <p role="alert" className="p-2 text-xs text-status-danger">{error}</p> : null}
    {preview ? <SuggestionPreview state={state} suggestion={preview} onClose={() => setPreview(null)} onConfirm={apply} busy={busy} cmds={cmds} /> : null}
  </div>;
}