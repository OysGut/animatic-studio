import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ExternalLink, Undo2, Redo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DriftBadge } from "@/app/dialogue/DriftBadge";
import { L, lineDrift, blocksOfVariant, annotationsOfVariant, charactersInProduction, filterPages, formatHeading, mainProduction, orderedOccurrences, pageDecorations, scriptPages, sceneNumberOf, HIT_LABEL, type NewAnnotation, type ProjectState } from "@/core";
import { explorerContext, explorerGroups, type ExplorerHit } from "@/core/screenplay/explorer";
import { ScriptPageView, type Selection } from "@/app/script/ScriptPageView";
import { NotesPanel } from "@/app/script/NotesPanel";
import { useCommands } from "@/app/project/use-commands";
import { useMembers, useProjectState, canEdit } from "@/app/project/use-project";
import { useActiveSceneInfo } from "@/app/shell/current-scene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToolbarButton, PanelHeader } from "@/app/shell/workspace-chrome";
import { useLanguage } from "@/app/i18n/language";
import { selectedNoteTarget } from "./selection-note";
import type { ExplorerState } from "./explorer-state";
import { t } from "@/core/i18n/keyed";

interface Props {
  projectId: string;
  userId: string;
  authorName: string;
  source?: string | undefined;
  initial?: ExplorerState;
  onState?: (state: ExplorerState) => void;
}
export function ScriptExplorer(props: Props) {
  const query = useProjectState(props.projectId);
  const members = useMembers(props.projectId);
  const role = members.data?.find((member) => member.user_id === props.userId)?.role;
  const cmds = useCommands(props.projectId, props.userId, canEdit(role), undefined, !!props.source);
  if (query.isLoading || members.isLoading) return <p aria-busy className="p-4 text-xs text-text-tertiary">{t("app-script-explorer-script-explorer.script-explorer.p.9cb6a12d6af4")}</p>;
  if (query.isError || members.isError) return <div role="alert" className="p-4 text-xs text-status-danger"><p>{t("app-script-explorer-script-explorer.script-explorer.p.43b04a6fd41c")}</p><Button size="sm" onClick={() => { void query.refetch(); void members.refetch(); }}>{t("app-script-explorer-script-explorer.script-explorer.button.fe0fa89691b1")}</Button></div>;
  if (!role || !query.data) return <p role="alert" className="p-4 text-xs text-status-danger">{t("app-script-explorer-script-explorer.script-explorer.p.1f07d79dc7d2")}</p>;
  return <ExplorerContent {...props} state={query.data} editable={canEdit(role)} cmds={cmds} />;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLocaleLowerCase("nb").indexOf(query.toLocaleLowerCase("nb")) : -1;
  const start = at < 0 ? 0 : Math.max(0, at - 65);
  const excerpt = text.slice(start, Math.max(start + 180, at + query.length));
  if (at < 0) return <>{excerpt}</>;
  const offset = at - start;
  return <>{start > 0 ? "… " : ""}{excerpt.slice(0, offset)}<mark className="mark-search text-inherit">{excerpt.slice(offset, offset + query.length)}</mark>{excerpt.slice(offset + query.length)}</>;
}

function ExplorerContent({ state, editable, cmds, ...props }: Props & { state: ProjectState; editable: boolean; cmds: ReturnType<typeof useCommands> }) {
  useLanguage();
  const active = useActiveSceneInfo(props.projectId, props.source);
  const [mode, setMode] = useState<"follow" | "search">(props.initial?.modus ?? "follow");
  const [selection, setSelection] = useState<Selection>({ occurrenceId: props.initial?.scene ?? null, blockId: props.initial?.blokk ?? null });
  const [query, setQuery] = useState(props.initial?.q ?? "");
  const [character, setCharacter] = useState(props.initial?.karakter ?? "");
  const [assetId, setAssetId] = useState("");
  const [kind, setKind] = useState<"all" | "dialogue" | "heading">("all");
  const [noteTarget, setNoteTarget] = useState<Omit<NewAnnotation, "annotationId" | "text" | "authorName"> | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const main = mainProduction(state);
  const activeOccurrence = active.scene?.occurrenceId ? state.occurrences[active.scene.occurrenceId] : undefined;
  const selectedOccurrence = selection.occurrenceId ? state.occurrences[selection.occurrenceId] : undefined;
  const productionId = (mode === "follow" ? activeOccurrence?.productionId : selectedOccurrence?.productionId) ?? main?.id ?? "";
  const occurrences = useMemo(() => orderedOccurrences(state, productionId).filter((o) => o.active), [state, productionId]);
  const visibleId = mode === "follow" ? activeOccurrence?.id ?? occurrences[0]?.id ?? null : selection.occurrenceId;
  const occurrence = visibleId ? state.occurrences[visibleId] : undefined;
  const variant = occurrence ? state.variants[occurrence.variantId] : undefined;
  const pages = useMemo(() => filterPages(scriptPages(state, productionId, { lockedPages: true }).pages, new Set(visibleId ? [visibleId] : [])), [state, productionId, visibleId]);
  const groups = useMemo(() => explorerGroups(state, productionId, { text: query, ...(character ? { character } : {}), ...(assetId ? { assetId } : {}) }, kind === "all" ? undefined : kind), [state, productionId, query, character, assetId, kind]);
  const decor = useMemo(() => pageDecorations(pages, state, { query: query || character || state.assets[assetId]?.name || "", notes: true }), [pages, state, query, character, assetId]);
  useEffect(() => { setNoteTarget(null); setNoteId(null); if (mode === "follow") setSelection({ occurrenceId: visibleId, blockId: null }); root.current?.scrollTo({ top: 0 }); }, [visibleId, mode]);
  useEffect(() => {
    if (!selection.blockId || mode === "follow") return;
    const block = [...(root.current?.querySelectorAll<HTMLElement>("[data-block]") ?? [])].find((element) => element.dataset["block"] === selection.blockId);
    block?.scrollIntoView({ block: "center" });
  }, [selection, pages, mode]);
  useEffect(() => { props.onState?.({ modus: mode, ...(visibleId ? { scene: visibleId } : {}), ...(selection.blockId ? { blokk: selection.blockId } : {}), q: query, karakter: character }); }, [props.onState, mode, visibleId, selection.blockId, query, character]);
  const select = (next: Selection) => { setSelection(next); setNoteTarget(null); };
  const open = (hit: ExplorerHit) => { setMode("search"); select({ occurrenceId: hit.occurrenceId, blockId: hit.blockId }); };
  const index = occurrences.findIndex((o) => o.id === visibleId);
  const localScene = (offset: number) => { const next = occurrences[index + offset]; if (next) { setMode("search"); select({ occurrenceId: next.id, blockId: null }); } };
  const block = selection.blockId ? state.blocks[selection.blockId] : undefined;
  const target = noteTarget ?? (block && block.variantId === occurrence?.variantId ? { blockId: block.id, variantId: null, quote: "", start: 0, end: 0 } : variant ? { blockId: null, variantId: variant.id, quote: "", start: 0, end: 0 } : null);
  const title = variant && occurrence ? `${sceneNumberOf(state, occurrence) ?? ""} ${formatHeading(variant.heading)}`.trim() : t("app-script-explorer-script-explorer.title.message.3d344f60006f");
  const resultGroups = character ? [
    { label: t("app-script-explorer-script-explorer.label.label.14b473091f96"), items: groups.filter((g) => g.role === "participates") },
    { label: t("app-script-explorer-script-explorer.label.label.96ca51977db8"), items: groups.filter((g) => g.role === "mentioned") },
  ] : [{ label: t("app-script-explorer-script-explorer.label.label.6ce67b7d210c"), items: groups }];
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div data-testid="script-explorer-status" data-mode={mode} className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-3 py-2 text-xs text-text-secondary">
      <span className="min-w-0 flex-1 break-words">{props.source ? t("app-script-explorer-script-explorer.explorer-content.span.4eed2bdc78c6", { value1: String(props.source.slice(0, 8)), title: String(title) }) : title} · {mode === "follow" ? t("app-script-explorer-script-explorer.explorer-content.span.553184b77f37") : t("app-script-explorer-script-explorer.explorer-content.span.fed80a5372b1")}</span>
      {mode === "search" ? <Button size="sm" variant="ghost" data-testid="script-explorer-back" onClick={() => { setMode("follow"); select({ occurrenceId: null, blockId: null }); }}>{t("app-script-explorer-script-explorer.explorer-content.button.d2e41838a5fc")}</Button> : null}
      <ToolbarButton variant="icon" disabled={index <= 0} title={t("app-script-explorer-script-explorer.explorer-content.title.b7eeecafc7af")} aria-label={t("app-script-explorer-script-explorer.explorer-content.aria-label.b7eeecafc7af")} onClick={() => localScene(-1)}><ArrowLeft /></ToolbarButton>
      <ToolbarButton variant="icon" disabled={index < 0 || index >= occurrences.length - 1} title={t("app-script-explorer-script-explorer.explorer-content.title.b0612b0fa775")} aria-label={t("app-script-explorer-script-explorer.explorer-content.aria-label.b0612b0fa775")} onClick={() => localScene(1)}><ArrowRight /></ToolbarButton>
      {occurrence ? <Button asChild variant="ghost" size="sm"><Link to="/prosjekt/$projectId/manus" params={{ projectId: props.projectId }} search={{ scene: occurrence.id, ...(selection.blockId ? { blokk: selection.blockId } : {}) }} onClick={(e) => {
        if (!props.source || !window.opener || window.opener.closed) return;
        e.preventDefault();
        const params = new URLSearchParams({ scene: occurrence.id, ...(selection.blockId ? { blokk: selection.blockId } : {}) });
        window.opener.location.href = `${window.location.origin}/prosjekt/${encodeURIComponent(props.projectId)}/manus?${params}`;
        window.opener.focus();
      }}><ExternalLink />{t("app-script-explorer-script-explorer.explorer-content.link.20fc3e3355c1")}</Link></Button> : null}
    </div>
    {active.closed ? <p role="status" className="px-3 py-1 text-xs text-status-uncertain">{t("app-script-explorer-script-explorer.explorer-content.p.ef33975dceb9")}</p> : null}
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-2">
      <Input data-testid="script-explorer-search" aria-label={t("app-script-explorer-script-explorer.explorer-content.aria-label.c64f0677f268")} placeholder={t("app-script-explorer-script-explorer.explorer-content.placeholder.a4cb06282c6e")} value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-40 flex-1" />
      {(["all", "dialogue", "heading"] as const).map((value) => <ToolbarButton key={value} active={kind === value} aria-pressed={kind === value} onClick={() => setKind(value)}>{value === "all" ? t("app-script-explorer-script-explorer.explorer-content.toolbar-button.36db803c47a0") : value === "dialogue" ? t("app-script-explorer-script-explorer.explorer-content.toolbar-button.7dc91baf14b9") : t("app-script-explorer-script-explorer.explorer-content.toolbar-button.132476c7f15a")}</ToolbarButton>)}
      <select data-testid="script-explorer-character" aria-label={t("app-script-explorer-script-explorer.explorer-content.aria-label.3d7ec3440a0b")} className="h-8 max-w-48 rounded-sm border border-border bg-surface-3 px-2 text-xs text-text-primary" value={character} onChange={(e) => { setCharacter(e.target.value); setAssetId(""); }}><option value="">{t("app-script-explorer-script-explorer.explorer-content.option.dbd5a355b488")}</option>{charactersInProduction(state, productionId).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</select>
      <select aria-label={t("app-script-explorer-script-explorer.explorer-content.aria-label.7a3470613cac")} className="h-8 max-w-48 rounded-sm border border-border bg-surface-3 px-2 text-xs text-text-primary" value={assetId} onChange={(e) => { setAssetId(e.target.value); setCharacter(""); }}><option value="">{t("app-script-explorer-script-explorer.explorer-content.option.7a3470613cac")}</option>{Object.values(state.assets).filter((a) => !a.removed && (a.kind === "location" || a.kind === "object")).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
    </div>
    <div className="flex min-h-0 flex-1 flex-wrap overflow-auto">
      {query || character || assetId ? <aside className="w-64 shrink-0 overflow-y-auto border-r border-border p-2">
        {!groups.length ? <p className="text-xs text-text-tertiary">{t("app-script-explorer-script-explorer.explorer-content.p.25d7d411c290")}</p> : null}
        {resultGroups.map((group) => <section key={group.label}><PanelHeader title={group.label} count={group.items.length} />{group.items.map((scene) => <div key={scene.occurrenceId} className="border-b border-border py-2"><p className="break-words text-xs font-medium text-text-primary">{scene.number} {scene.heading}</p>{scene.hits.map((hit, n) => <details key={`${hit.blockId}-${n}`} data-testid="script-explorer-hit" data-occurrence-id={hit.occurrenceId} className="py-1 text-xs text-text-secondary"><summary className="cursor-pointer break-words"><span className="text-text-tertiary">{HIT_LABEL[hit.kind]} · </span><Highlight text={hit.text} query={hit.query} /></summary><div data-testid="script-explorer-context" className="space-y-1 border-l border-border pl-2">{explorerContext(state, hit.occurrenceId, hit.blockId).map((b) => <p key={b.id} data-block-id={b.id} className="whitespace-pre-wrap break-words">{b.text}</p>)}</div><Button size="sm" variant="ghost" onClick={() => open(hit)}>{t("app-script-explorer-script-explorer.explorer-content.button.1086bdc39ae5")}</Button></details>)}</div>)}</section>)}
      </aside> : null}
      <div ref={root} className="min-h-0 min-w-0 flex-1 overflow-auto bg-bg-app" onMouseUp={() => { if (root.current) { const selected = selectedNoteTarget(root.current, state, pages); if (selected) { setNoteTarget(selected); setSelection({ occurrenceId: visibleId, blockId: selected.blockId }); } } }}>
        {variant ? <ScriptPageView pages={pages} state={state} selection={{ occurrenceId: visibleId, blockId: selection.blockId }} zoom={0.8} onSelect={select} onActivate={select} flow={{ light: false }} decor={decor} onNoteClick={(ids, next) => { select(next); setNoteId(ids[0] ?? null); }} /> : <p className="p-4 text-xs text-text-tertiary">{t("app-script-explorer-script-explorer.explorer-content.p.e8c06996ab35")}</p>}
      </div>
      <aside className="w-56 shrink-0 overflow-y-auto border-l border-border bg-surface-1 p-3">
        <PanelHeader title={t("app-script-explorer-script-explorer.explorer-content.title.02780cae297d")} actions={<><ToolbarButton variant="icon" disabled={!cmds.canUndo} aria-label={t("app-script-explorer-script-explorer.explorer-content.aria-label.871909b22d34")} title={t("app-script-explorer-script-explorer.explorer-content.title.871909b22d34")} onClick={cmds.undo}><Undo2 /></ToolbarButton><ToolbarButton variant="icon" disabled={!cmds.canRedo} aria-label={t("app-script-explorer-script-explorer.explorer-content.aria-label.9a8d5b29002a")} title={t("app-script-explorer-script-explorer.explorer-content.title.9a8d5b29002a")} onClick={cmds.redo}><Redo2 /></ToolbarButton></>} />
        {occurrence && variant ? (() => { const lines = blocksOfVariant(state, variant.id).filter(b => b.kind === "dialogue").map(b => ({ b, d: lineDrift(state, occurrence.id, b.id) })).filter(x => x.d.status === "drift" || x.d.status === "unknown" || x.d.status === "reviewed"); return lines.length ? <section data-testid="script-explorer-drift" className="mb-3 border-b border-border pb-2"><PanelHeader title={t("app-script-explorer-script-explorer.explorer-content.title.c6de4b729a1c")} count={lines.filter(x => x.d.status === "drift").length} />{lines.map(({ b, d }) => <div key={b.id} className="flex items-start gap-1 py-1 text-xs text-text-secondary"><DriftBadge state={state} projectId={props.projectId} occurrenceId={occurrence.id} blockId={b.id} run={cmds.run} editable={editable} onGo={() => { const url = `${window.location.origin}/prosjekt/${encodeURIComponent(props.projectId)}/scene?${new URLSearchParams({ scene: occurrence.id, line: b.id })}`; if (props.source && window.opener && !window.opener.closed) { window.opener.location.href = url; window.opener.focus(); } else window.location.href = url; }} /><span className={"min-w-0 break-words " + (d.status === "drift" ? "text-status-danger" : "")}>{b.text.slice(0, 80)}</span></div>)}</section> : null; })() : null}
        <div data-testid={editable ? "script-explorer-note" : undefined}><NotesPanel state={state} notes={variant ? annotationsOfVariant(state, variant.id) : []} editable={editable} run={cmds.run} authorName={props.authorName} focusId={noteId} newTarget={target} newLabel={noteTarget ? t("app-script-explorer-script-explorer.explorer-content.new-label.1a52b920449e") : t("app-script-explorer-script-explorer.explorer-content.new-label.dada04c66a45")} /></div>
        {cmds.status.kind === "saving" ? <p role="status" className="text-xs text-text-tertiary">{t("app-script-explorer-script-explorer.explorer-content.p.7e3bf0a50454")}</p> : cmds.status.kind === "error" ? <p role="alert" className="text-xs text-status-danger">{cmds.status.message}</p> : null}
        {cmds.rejected.map((r) => <div key={r.id} className="mt-2 text-xs text-status-danger"><p>{t("app-script-explorer-script-explorer.explorer-content.p.cf78ad85ac23")}</p><p className="whitespace-pre-wrap">{r.text}</p></div>)}
      </aside>
    </div>
  </div>;
}