/**
 * Inspektøren for skrivecanvaset (SL7): type, tittel, brødtekst, farge, kobling til bibliotek eller scene,
 * kantene med etikett og type, og overføring til prosjektet. Tekst lagres med debounce som UpdateCanvasNode.
 */
import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { CANVAS_BODY_MAX, CANVAS_EDGE_KINDS, CANVAS_LABEL_MAX, CANVAS_NODE_KINDS, CANVAS_TITLE_MAX, canvasEdgeKindLabel, canvasNodeKindLabel, canvasTransferKinds, scenesInStoryTime, type CanvasEdgeKind, type CanvasNode, type CanvasNodeKind, type ProjectState } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { PanelHeader, ToolbarButton, IconButton } from "@/app/shell/workspace-chrome";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { COLOR_TOKENS, colorLabel } from "./CanvasNodes";
import { CanvasTransferDialog } from "./CanvasTransferDialog";
import { t as tk } from "@/core/i18n/keyed";

const TEXT_DEBOUNCE_MS = 600;
const field = "h-8 w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

export function CanvasInspector({
  state,
  projectId,
  cmds,
  editable,
  selected,
  edgeId,
  focusTitle,
  onError,
  onOpen,
}: {
  state: ProjectState;
  projectId: string;
  cmds: Commands;
  editable: boolean;
  selected: readonly CanvasNode[];
  edgeId: string | null;
  focusTitle: number;
  onError: (e: string | null) => void;
  onOpen: (n: CanvasNode) => void;
}) {
  const node = selected.length === 1 ? selected[0]! : null;
  const edge = !node && edgeId ? state.canvasEdges[edgeId] : undefined;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="canvas-inspector">
      {node ? (
        <NodeForm key={node.id} state={state} projectId={projectId} cmds={cmds} editable={editable} node={node} focusTitle={focusTitle} onError={onError} onOpen={onOpen} />
      ) : edge ? (
        <>
          <PanelHeader title={tk("app-storylab-canvas-canvas-inspector.canvas-inspector.title.e2df95891216")} />
          <EdgeRow state={state} cmds={cmds} editable={editable} edgeId={edge.id} from={edge.fromNodeId} onError={onError} />
        </>
      ) : (
        <p className="p-3 text-[12px] text-text-tertiary">
          {selected.length > 1
            ? tk("app-storylab-canvas-canvas-inspector.canvas-inspector.p.45d45f263000", { length: String(selected.length) })
            : tk("app-storylab-canvas-canvas-inspector.canvas-inspector.p.366a10b1c6df")}
        </p>
      )}
    </div>
  );
}

function NodeForm({
  state,
  projectId,
  cmds,
  editable,
  node,
  focusTitle,
  onError,
  onOpen,
}: {
  state: ProjectState;
  projectId: string;
  cmds: Commands;
  editable: boolean;
  node: CanvasNode;
  focusTitle: number;
  onError: (e: string | null) => void;
  onOpen: (n: CanvasNode) => void;
}) {
  const [draft, setDraft] = useState({ title: node.title, body: node.body });
  const [transfer, setTransfer] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ title: string; body: string } | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    const n = cmds.current()?.canvasNodes[node.id];
    if (!p || !n || n.removed) return;
    const patch: { title?: string; body?: string } = {};
    if (p.title !== n.title) patch.title = p.title;
    if (p.body !== n.body) patch.body = p.body;
    if (Object.keys(patch).length) onError(cmds.run({ type: "UpdateCanvasNode", nodeId: node.id, patch }, tk("app-storylab-canvas-canvas-inspector.flush.cmds-run.632f8c908310"), `canvas-text:${node.id}`));
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);
  useEffect(() => { if (focusTitle) titleRef.current?.focus(); }, [focusTitle]);
  // Ny tekst fra andre (eller angring) når brukeren ikke skriver
  useEffect(() => { if (!pending.current) setDraft({ title: node.title, body: node.body }); }, [node.title, node.body]);
  const change = (patch: Partial<typeof draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), TEXT_DEBOUNCE_MS);
  };
  const update = (patch: Parameters<typeof cmds.run>[0] extends infer _ ? Record<string, unknown> : never, label: string) =>
    onError(cmds.run({ type: "UpdateCanvasNode", nodeId: node.id, patch: patch as never }, label));

  const edges = Object.values(state.canvasEdges).filter((e) => !e.removed && (e.fromNodeId === node.id || e.toNodeId === node.id));
  const assets = Object.values(state.assets).filter((a) => !a.removed && !a.archived && (node.kind === "location" ? a.kind === "location" : node.kind === "character" ? a.kind === "character" || a.kind === "animal" : true));
  const scenes = scenesInStoryTime(state);
  const transferable = editable && canvasTransferKinds(node).length > 0;

  return (
    <div className="space-y-3 p-3 text-[13px]">
      <PanelHeader title={canvasNodeKindLabel(node.kind)} />
      <label className="block space-y-1">
        <span className="text-[12px] text-text-secondary">{tk("app-storylab-canvas-canvas-inspector.node-form.span.1227024dc6c7")}</span>
        <select className={field} disabled={!editable} value={node.kind} data-testid="canvas-inspector-kind"
          onChange={(e) => update({ kind: e.target.value as CanvasNodeKind }, tk("app-storylab-canvas-canvas-inspector.node-form.update.64511bb6108a"))}>
          {CANVAS_NODE_KINDS.map((k) => <option key={k} value={k}>{canvasNodeKindLabel(k)}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] text-text-secondary">{tk("app-storylab-canvas-canvas-inspector.node-form.span.6d1127a58908")}</span>
        <Input ref={titleRef} disabled={!editable} maxLength={CANVAS_TITLE_MAX} value={draft.title} data-testid="canvas-inspector-title"
          onChange={(e) => change({ title: e.target.value })} onBlur={flush} />
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] text-text-secondary">{tk("app-storylab-canvas-canvas-inspector.node-form.span.fb4c82aeee51")}</span>
        <Textarea rows={5} disabled={!editable} maxLength={CANVAS_BODY_MAX} value={draft.body} data-testid="canvas-inspector-body"
          onChange={(e) => change({ body: e.target.value })} onBlur={flush} />
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] text-text-secondary">{tk("app-storylab-canvas-canvas-inspector.node-form.span.3ae895b2aecc")}</span>
        <select className={field} disabled={!editable} value={node.color ?? ""}
          onChange={(e) => update({ color: e.target.value || null }, tk("app-storylab-canvas-canvas-inspector.node-form.update.c13375100abe"))}>
          <option value="">{tk("app-storylab-canvas-canvas-inspector.node-form.option.90b54e67ec34")}</option>
          {Object.keys(COLOR_TOKENS).map((t) => <option key={t} value={t}>{colorLabel(t)}</option>)}
        </select>
      </label>
      {node.kind !== "scene" ? (
        <label className="block space-y-1">
          <span className="text-[12px] text-text-secondary">{tk("app-storylab-canvas-canvas-inspector.node-form.span.12297b87975c")}</span>
          <select className={field} disabled={!editable} value={node.assetId ?? ""} data-testid="canvas-inspector-asset"
            onChange={(e) => update({ assetId: e.target.value || null }, tk("app-storylab-canvas-canvas-inspector.node-form.update.b29f1732feac"))}>
            <option value="">{tk("app-storylab-canvas-canvas-inspector.node-form.option.cb0b50044448")}</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      ) : null}
      {node.kind === "scene" || node.kind === "event" || node.kind === "plot_point" || node.kind === "turning_point" ? (
        <label className="block space-y-1">
          <span className="text-[12px] text-text-secondary">{tk("app-storylab-canvas-canvas-inspector.node-form.span.c04cb7ce4c65")}</span>
          <select className={field} disabled={!editable} value={node.sceneId ?? ""} data-testid="canvas-inspector-scene"
            onChange={(e) => update({ sceneId: e.target.value || null }, tk("app-storylab-canvas-canvas-inspector.node-form.update.3bcc663172a5"))}>
            <option value="">{tk("app-storylab-canvas-canvas-inspector.node-form.option.cb0b50044448.2")}</option>
            {scenes.map((s) => <option key={s.sceneId} value={s.sceneId}>{s.heading || s.sceneId}</option>)}
          </select>
        </label>
      ) : null}
      {node.assetId || node.sceneId ? (
        <ToolbarButton onClick={() => onOpen(node)}>{node.sceneId ? tk("app-storylab-canvas-canvas-inspector.node-form.toolbar-button.c1df78b9b97c") : tk("app-storylab-canvas-canvas-inspector.node-form.toolbar-button.a4b566f485f3")}</ToolbarButton>
      ) : null}
      {transferable ? (
        <ToolbarButton variant="primary" data-testid="canvas-transfer-open" onClick={() => { flush(); setTransfer(true); }}>
          {node.kind === "scene" ? tk("app-storylab-canvas-canvas-inspector.node-form.toolbar-button.32f1d135ac5c") : node.kind === "location" ? tk("app-storylab-canvas-canvas-inspector.node-form.toolbar-button.a9875b96f31d") : tk("app-storylab-canvas-canvas-inspector.node-form.toolbar-button.f7932c4c754e")}
        </ToolbarButton>
      ) : null}
      <PanelHeader title={tk("app-storylab-canvas-canvas-inspector.node-form.title.23cd82d675c6")} count={edges.length} />
      {edges.length === 0 ? <p className="text-[12px] text-text-tertiary">{tk("app-storylab-canvas-canvas-inspector.node-form.p.c930329c39a9")}</p> : null}
      {edges.map((e) => <EdgeRow key={e.id} state={state} cmds={cmds} editable={editable} edgeId={e.id} from={node.id} onError={onError} />)}
      {editable ? (
        <ToolbarButton data-testid="canvas-inspector-remove" onClick={() => onError(cmds.run({ type: "RemoveCanvasNodes", nodeIds: [node.id], removed: true }, tk("app-storylab-canvas-canvas-inspector.node-form.cmds-run.56709082f161")))}>
          <Trash2 />{tk("app-storylab-canvas-canvas-inspector.node-form.toolbar-button.5c1668c85c3f")}
        </ToolbarButton>
      ) : null}
      {transfer ? <CanvasTransferDialog state={state} projectId={projectId} cmds={cmds} node={node} onClose={() => setTransfer(false)} /> : null}
    </div>
  );
}

function EdgeRow({ state, cmds, editable, edgeId, from, onError }: {
  state: ProjectState; cmds: Commands; editable: boolean; edgeId: string; from: string; onError: (e: string | null) => void;
}) {
  const e = state.canvasEdges[edgeId];
  const [label, setLabel] = useState(e?.label ?? "");
  useEffect(() => setLabel(e?.label ?? ""), [e?.label]);
  if (!e) return null;
  const other = state.canvasNodes[e.fromNodeId === from ? e.toNodeId : e.fromNodeId];
  const save = () => { if (label !== e.label) onError(cmds.run({ type: "UpdateCanvasEdge", edgeId: e.id, patch: { label } }, tk("app-storylab-canvas-canvas-inspector.save.cmds-run.a21723671e85"))); };
  return (
    <div className="space-y-1 rounded-sm border border-border bg-surface-2 p-2" data-testid="canvas-inspector-edge">
      <p className="text-[12px] text-text-secondary">{e.fromNodeId === from ? "→ " : "← "}{other?.title || tk("app-storylab-canvas-canvas-inspector.edge-row.p.dc68a8fc8941")}</p>
      <select className={field} disabled={!editable} aria-label={tk("app-storylab-canvas-canvas-inspector.edge-row.aria-label.5061a80a909d")} value={e.kind}
        onChange={(x) => onError(cmds.run({ type: "UpdateCanvasEdge", edgeId: e.id, patch: { kind: x.target.value as CanvasEdgeKind } }, tk("app-storylab-canvas-canvas-inspector.edge-row.cmds-run.0aa05ab0a8a6")))}>
        {CANVAS_EDGE_KINDS.map((k) => <option key={k} value={k}>{canvasEdgeKindLabel(k)}</option>)}
      </select>
      <div className="flex gap-1">
        <Input disabled={!editable} aria-label={tk("app-storylab-canvas-canvas-inspector.edge-row.aria-label.6b9355fb0aef")} placeholder={tk("app-storylab-canvas-canvas-inspector.edge-row.placeholder.6b9355fb0aef")} maxLength={CANVAS_LABEL_MAX} value={label}
          onChange={(x) => setLabel(x.target.value)} onBlur={save} onKeyDown={(x) => { if (x.key === "Enter") save(); }} />
        {editable ? (
          <IconButton label={tk("app-storylab-canvas-canvas-inspector.edge-row.label.bb187c370be8")} title={tk("app-storylab-canvas-canvas-inspector.edge-row.title.bb187c370be8")}
            onClick={() => onError(cmds.run({ type: "RemoveCanvasEdge", edgeId: e.id, removed: true }, tk("app-storylab-canvas-canvas-inspector.edge-row.cmds-run.a6faed03e463")))}>
            <Trash2 />
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}
