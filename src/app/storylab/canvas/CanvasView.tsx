/**
 * Skrivecanvaset i Story Lab (SL7 §3): et stort, visuelt arbeidsrom ved siden av manuset. Midten er canvaset
 * (React Flow), høyre panel er inspektøren eller intervjuet. All skriving går via kommandoene (med angring):
 * flytting lagres ved dragStop som én MoveCanvasNodes, tekst lagres med debounce.
 * Lastes bare i nettleseren (se LazyCanvasView).
 */
import "@xyflow/react/dist/style.css";
import {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  getBezierPath,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type NodeChange,
  type OnNodeDrag,
} from "@xyflow/react";
import { Focus, Group, Hammer, Link2, Maximize, Plus, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CANVAS_NODE_KINDS,
  L,
  canvasNodeDefaults,
  canvasNodeKindLabel,
  newId,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeFields,
  type CanvasNodeKind,
  type Command,
  type ProjectState,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator } from "@/app/shell/workspace-chrome";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { KIND_ICON, NODE_TYPES, type StoryFlowNode } from "./CanvasNodes";
import { CanvasInspector } from "./CanvasInspector";
import { BuildFromScriptDialog } from "./BuildFromScriptDialog";
import { InterviewView } from "../InterviewView";
import { sceneLabel } from "../storylab-data";
import { runGroup } from "./run-group";
import { nextCanvasPosition } from "./node-placement";

export interface CanvasViewProps {
  state: ProjectState;
  projectId: string;
  cmds: Commands;
  editable: boolean;
  interviewId: string | null;
  onInterview: (id: string) => void;
  onOpenAsset: (id: string) => void;
  onOpenScene: (id: string) => void;
}

export default function CanvasView(p: CanvasViewProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...p} />
    </ReactFlowProvider>
  );
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));


function edgeView(e: CanvasEdge, selected: boolean): Edge {
  return { id: e.id, source: e.fromNodeId, target: e.toNodeId, type: "story", selected, label: e.label, data: { kind: e.kind } };
}

function StoryEdge(p: EdgeProps) {
  const [path, x, y] = getBezierPath(p);
  return (
    <g data-testid="canvas-edge" data-edge-id={p.id} data-kind={String((p.data as { kind?: string } | undefined)?.kind ?? "")}>
      <BaseEdge path={path} {...(p.markerEnd ? { markerEnd: p.markerEnd } : {})} style={{ stroke: p.selected ? "var(--accent-brand)" : "var(--border-strong)", strokeWidth: p.selected ? 2 : 1.5 }} />
      {p.label ? (
        <EdgeLabelRenderer>
          <span
            className="nodrag nopan pointer-events-auto absolute rounded-sm bg-surface-3 px-1 text-[11px] text-text-secondary"
            style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
          >
            {String(p.label)}
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </g>
  );
}
const EDGE_TYPES = { story: StoryEdge };

function Canvas({ state, projectId, cmds, editable, interviewId, onInterview, onOpenAsset, onOpenScene }: CanvasViewProps) {
  const flow = useReactFlow<StoryFlowNode>();
  const wrap = useRef<HTMLDivElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [side, setSide] = useState<"inspector" | "interview">(interviewId ? "interview" : "inspector");
  const [build, setBuild] = useState(false);
  const [focusTitle, setFocusTitle] = useState(0);
  useEffect(() => { if (interviewId) setSide("interview"); }, [interviewId]);

  const onOpen = useCallback((n: CanvasNode) => {
    if (n.sceneId) onOpenScene(n.sceneId);
    else if (n.assetId) onOpenAsset(n.assetId);
  }, [onOpenAsset, onOpenScene]);

  const live = useMemo(() => Object.values(state.canvasNodes).filter((n) => !n.removed), [state.canvasNodes]);
  const sceneInfo = useCallback((n: CanvasNode) => {
    if (!n.sceneId) return null;
    const v = Object.values(state.variants).find((x) => x.sceneId === n.sceneId);
    return { heading: v ? [v.heading.intExt, v.heading.location].filter(Boolean).join(" ") : "", time: sceneLabel(state, n.sceneId) };
  }, [state]);

  const toFlow = useCallback((n: CanvasNode, selected: boolean): StoryFlowNode => ({
    id: n.id,
    type: n.kind,
    position: { x: n.x, y: n.y },
    width: n.w,
    height: n.h,
    selected,
    draggable: editable,
    zIndex: n.kind === "group" ? -1 : 0,
    ariaLabel: `${canvasNodeKindLabel(n.kind)}: ${n.title || L("Uten tittel", "Untitled")}`,
    data: { node: n, state, sceneInfo: sceneInfo(n), onOpen: n.assetId || n.sceneId ? onOpen : null },
  }), [editable, state, sceneInfo, onOpen]);

  const [nodes, setNodes] = useState<StoryFlowNode[]>(() => live.map((n) => toFlow(n, false)));
  const [edges, setEdges] = useState<Edge[]>([]);
  useEffect(() => {
    setNodes((prev) => {
      const sel = new Set(prev.filter((x) => x.selected).map((x) => x.id));
      return live.map((n) => toFlow(n, sel.has(n.id)));
    });
  }, [live, toFlow]);
  useEffect(() => {
    setEdges((prev) => {
      const sel = new Set(prev.filter((x) => x.selected).map((x) => x.id));
      const ids = new Set(live.map((n) => n.id));
      return Object.values(state.canvasEdges)
        .filter((e) => !e.removed && ids.has(e.fromNodeId) && ids.has(e.toNodeId))
        .map((e) => edgeView(e, sel.has(e.id)));
    });
  }, [state.canvasEdges, live]);

  const onNodesChange = useCallback((ch: NodeChange<StoryFlowNode>[]) => setNodes((n) => applyNodeChanges(ch.filter((c) => c.type !== "remove"), n)), []);
  const onEdgesChange = useCallback((ch: EdgeChange[]) => setEdges((e) => applyEdgeChanges(ch.filter((c) => c.type !== "remove"), e)), []);

  const selected = nodes.filter((n) => n.selected).map((n) => state.canvasNodes[n.id]).filter((n): n is CanvasNode => !!n);
  const selectedEdge = edges.length && !selected.length ? edges.find((e) => e.selected) : undefined;

  const run = (c: Command, label: string, group?: string) => { const e = cmds.run(c, label, group); setErr(e); return e; };

  // ---------- Flytting: én MoveCanvasNodes ved dragStop (gruppen tar med nodene i seg) ----------
  const dragStart = useRef(new Map<string, { x: number; y: number }>());
  const childrenOf = useCallback((ids: readonly string[]) => {
    const groups = new Set(ids.filter((id) => state.canvasNodes[id]?.kind === "group"));
    return live.filter((n) => n.groupId && groups.has(n.groupId) && !ids.includes(n.id)).map((n) => n.id);
  }, [live, state.canvasNodes]);
  const onNodeDragStart: OnNodeDrag<StoryFlowNode> = (_e, _n, dragged) => {
    const m = new Map<string, { x: number; y: number }>();
    for (const id of [...dragged.map((d) => d.id), ...childrenOf(dragged.map((d) => d.id))]) {
      const n = state.canvasNodes[id];
      if (n) m.set(id, { x: n.x, y: n.y });
    }
    dragStart.current = m;
  };
  const onNodeDrag: OnNodeDrag<StoryFlowNode> = (_e, _n, dragged) => {
    const groups = dragged.filter((d) => state.canvasNodes[d.id]?.kind === "group");
    if (!groups.length) return;
    const delta = new Map<string, { dx: number; dy: number }>();
    for (const g of groups) {
      const s = dragStart.current.get(g.id);
      if (s) delta.set(g.id, { dx: g.position.x - s.x, dy: g.position.y - s.y });
    }
    setNodes((list) => list.map((x) => {
      const n = state.canvasNodes[x.id];
      const d = n?.groupId ? delta.get(n.groupId) : undefined;
      const s = dragStart.current.get(x.id);
      return d && s && !dragged.some((g) => g.id === x.id) ? { ...x, position: { x: s.x + d.dx, y: s.y + d.dy } } : x;
    }));
  };
  const onNodeDragStop: OnNodeDrag<StoryFlowNode> = (_e, _n, dragged) => {
    if (!editable) return;
    const pos = new Map(nodes.map((n) => [n.id, n.position]));
    for (const d of dragged) pos.set(d.id, d.position);
    const moves = [...dragStart.current.keys()].map((id) => ({ nodeId: id as never, x: Math.round(pos.get(id)?.x ?? 0), y: Math.round(pos.get(id)?.y ?? 0) }))
      .filter((m) => { const n = state.canvasNodes[m.nodeId]; return n && (n.x !== m.x || n.y !== m.y); });
    dragStart.current = new Map();
    if (moves.length) run({ type: "MoveCanvasNodes", moves }, L("Flytt på canvaset", "Move on the canvas"));
  };

  const onConnect = (c: Connection) => {
    if (!editable || !c.source || !c.target || c.source === c.target) return;
    run({ type: "AddCanvasEdge", edgeId: newId(), fields: { fromNodeId: c.source as never, toNodeId: c.target as never, label: "", kind: "leads_to" } }, L("Koble noder", "Connect nodes"));
  };

  const center = () => {
    const r = wrap.current?.getBoundingClientRect();
    const p = r ? flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
    return { x: Math.round(p.x - 110), y: Math.round(p.y - 60) };
  };
  const select = (ids: readonly string[]) => setNodes((list) => list.map((n) => ({ ...n, selected: ids.includes(n.id) })));
  const addedPositions = useRef(new Map<string, { x: number; y: number }>());
  const lastAddedPosition = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    for (const id of addedPositions.current.keys()) if (state.canvasNodes[id]) addedPositions.current.delete(id);
  }, [state.canvasNodes]);
  const addNode = (kind: CanvasNodeKind) => {
    const id = newId<"canvas_node">();
    const pos = nextCanvasPosition(center(), lastAddedPosition.current, [...live, ...addedPositions.current.values()]);
    const f = canvasNodeDefaults(kind, { ...pos, title: canvasNodeKindLabel(kind) });
    if (!run({ type: "AddCanvasNodes", nodes: [{ id, ...f }] }, L("Ny node", "New node"))) {
      addedPositions.current.set(id, pos);
      lastAddedPosition.current = pos;
      setTimeout(() => { select([id]); setSide("inspector"); setFocusTitle((x) => x + 1); }, 0);
    }
  };
  const connectSelected = () => {
    if (selected.length !== 2) return;
    run({ type: "AddCanvasEdge", edgeId: newId(), fields: { fromNodeId: selected[0]!.id, toNodeId: selected[1]!.id, label: "", kind: "leads_to" } }, L("Koble noder", "Connect nodes"));
  };
  const group = async () => {
    const members = selected.filter((n) => n.kind !== "group");
    if (!members.length) return;
    const pad = 32;
    const x = Math.min(...members.map((n) => n.x)) - pad, y = Math.min(...members.map((n) => n.y)) - pad - 16;
    const w = Math.max(...members.map((n) => n.x + n.w)) + pad - x, h = Math.max(...members.map((n) => n.y + n.h)) + pad - y;
    const gid = newId<"canvas_node">();
    const e = await runGroup(cmds, [
      { type: "AddCanvasNodes", nodes: [{ id: gid, ...canvasNodeDefaults("group", { title: L("Gruppe", "Group"), x, y, w, h }) }] },
      ...members.map((n): Command => ({ type: "UpdateCanvasNode", nodeId: n.id, patch: { groupId: gid } })),
    ], L("Grupper", "Group"));
    setErr(e);
  };
  const duplicate = (list: CanvasNode[]) => {
    if (!list.length) return;
    const copies = list.map((n) => {
      const { id: _i, revision: _r, removed: _x, ...f } = n;
      const fields: CanvasNodeFields = { ...f, x: n.x + 24, y: n.y + 24, assetId: null, sceneId: null, groupId: n.groupId && list.some((m) => m.id === n.groupId) ? null : n.groupId };
      return { id: newId<"canvas_node">(), ...fields };
    });
    if (!run({ type: "AddCanvasNodes", nodes: copies }, L("Dupliser", "Duplicate"))) setTimeout(() => select(copies.map((c) => c.id)), 0);
  };
  const remove = (list: CanvasNode[]) => {
    if (list.length) run({ type: "RemoveCanvasNodes", nodeIds: list.map((n) => n.id), removed: true }, L("Fjern fra canvaset", "Remove from the canvas"));
  };

  const targets = (): CanvasNode[] => {
    if (selected.length) return selected;
    const id = (document.activeElement as HTMLElement | null)?.closest?.(".react-flow__node")?.getAttribute("data-id");
    const n = id ? state.canvasNodes[id] : undefined;
    return n ? [n] : [];
  };
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    if (isTyping(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key.startsWith("Arrow") && editable) {
      const list = targets();
      if (!list.length) return;
      e.preventDefault(); e.stopPropagation();
      const step = e.shiftKey ? 32 : 8;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      const ids = [...list.map((n) => n.id), ...childrenOf(list.map((n) => n.id))];
      run({ type: "MoveCanvasNodes", moves: ids.map((id) => ({ nodeId: id as never, x: state.canvasNodes[id]!.x + dx, y: state.canvasNodes[id]!.y + dy })) }, L("Flytt på canvaset", "Move on the canvas"));
    } else if ((e.key === "Delete" || e.key === "Backspace") && editable) {
      const list = targets();
      e.preventDefault(); e.stopPropagation();
      if (list.length) remove(list);
      else if (selectedEdge) run({ type: "RemoveCanvasEdge", edgeId: selectedEdge.id as never, removed: true }, L("Fjern kobling", "Remove connection"));
    } else if (mod && e.key.toLowerCase() === "d" && editable) {
      e.preventDefault(); e.stopPropagation();
      duplicate(targets());
    } else if (e.key === "Enter") {
      const list = targets();
      if (list.length) { e.preventDefault(); select(list.map((n) => n.id)); setSide("inspector"); setFocusTitle((x) => x + 1); }
    }
  };

  const bottom = live.length ? Math.max(...live.map((n) => n.y + n.h)) + 80 : 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Toolbar title={L("Canvas", "Canvas")} status={<span className="text-xs text-text-tertiary">{L(`${live.length} noder`, `${live.length} nodes`)}</span>}>
          <ToolbarSeparator />
          {editable ? (
            <ToolbarGroup>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <ToolbarButton data-testid="canvas-add"><Plus />{L("Ny node", "New node")}</ToolbarButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-80 overflow-y-auto">
                  {CANVAS_NODE_KINDS.filter((k) => k !== "group").map((k) => {
                    const Icon = KIND_ICON[k];
                    return <DropdownMenuItem key={k} data-testid={`canvas-add-${k}`} onSelect={() => addNode(k)}><Icon />{canvasNodeKindLabel(k)}</DropdownMenuItem>;
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <ToolbarButton data-testid="canvas-connect" disabled={selected.length !== 2} onClick={connectSelected} title={L("Koble to valgte noder", "Connect two selected nodes")}><Link2 />{L("Koble", "Connect")}</ToolbarButton>
              <ToolbarButton data-testid="canvas-group" disabled={!selected.some((n) => n.kind !== "group")} onClick={() => void group()}><Group />{L("Grupper", "Group")}</ToolbarButton>
              <ToolbarButton data-testid="canvas-build-from-script" onClick={() => setBuild(true)}><Hammer />{L("Bygg fra manuset …", "Build from the script …")}</ToolbarButton>
            </ToolbarGroup>
          ) : null}
          <ToolbarSeparator />
          <ToolbarButton variant="icon" aria-label={L("Zoom inn", "Zoom in")} title={L("Zoom inn", "Zoom in")} onClick={() => void flow.zoomIn()}><ZoomIn /></ToolbarButton>
          <ToolbarButton variant="icon" aria-label={L("Zoom ut", "Zoom out")} title={L("Zoom ut", "Zoom out")} onClick={() => void flow.zoomOut()}><ZoomOut /></ToolbarButton>
          <ToolbarButton variant="icon" data-testid="canvas-fit" aria-label={L("Tilpass", "Fit")} title={L("Tilpass", "Fit")} onClick={() => void flow.fitView({ padding: 0.1 })}><Maximize /></ToolbarButton>
          <ToolbarButton variant="icon" disabled={!selected.length} aria-label={L("Fokuser på utvalg", "Focus on selection")} title={L("Fokuser på utvalg", "Focus on selection")} onClick={() => void flow.fitView({ nodes: selected.map((n) => ({ id: n.id })), padding: 0.4 })}><Focus /></ToolbarButton>
        </Toolbar>
        {err ? <p role="alert" className="border-b border-border px-3 py-1 text-xs text-status-danger">{err}</p> : null}
        <div ref={wrap} className="relative min-h-0 flex-1" data-testid="storylab-canvas" onKeyDownCapture={onKeyDownCapture}
          aria-label={L("Skrivecanvas", "Writing canvas")} role="application">
          <ReactFlow<StoryFlowNode>
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onNodeDoubleClick={() => { setSide("inspector"); setFocusTitle((x) => x + 1); }}
            nodesConnectable={editable}
            nodesDraggable={editable}
            nodesFocusable
            deleteKeyCode={null}
            multiSelectionKeyCode={["Shift", "Meta", "Control"]}
            onlyRenderVisibleElements
            minZoom={0.05}
            maxZoom={2.5}
            fitView
            fitViewOptions={{ maxZoom: 1, padding: 0.1 }}
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
            style={{ background: "var(--bg-app)" }}
          >
            <Background gap={24} color="var(--border)" />
            <MiniMap pannable zoomable className="!bg-surface-1" maskColor="var(--surface-1)" nodeColor="var(--surface-3)" />
          </ReactFlow>
          {!live.length ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-[13px] text-text-tertiary">
              {L("Canvaset er tomt. Lag en node, bygg fra manuset eller start et intervju.", "The canvas is empty. Add a node, build from the script or start an interview.")}
            </div>
          ) : null}
        </div>
      </div>
      <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-surface-1">
        <div role="tablist" className="flex border-b border-border">
          <ToolbarButton role="tab" aria-selected={side === "inspector"} active={side === "inspector"} onClick={() => setSide("inspector")}>{L("Inspektør", "Inspector")}</ToolbarButton>
          <ToolbarButton role="tab" data-testid="canvas-tab-interview" aria-selected={side === "interview"} active={side === "interview"} onClick={() => setSide("interview")}>{L("Intervju", "Interview")}</ToolbarButton>
        </div>
        {side === "inspector" ? (
          <CanvasInspector state={state} projectId={projectId} cmds={cmds} editable={editable} selected={selected} edgeId={selectedEdge?.id ?? null} focusTitle={focusTitle} onError={setErr} onOpen={onOpen} />
        ) : (
          <InterviewView state={state} projectId={projectId} cmds={cmds} editable={editable} sessionId={interviewId} onCreated={onInterview}
            selection={selected} origin={{ x: 0, y: bottom }} onAdded={(ids) => setTimeout(() => select(ids), 0)} />
        )}
      </aside>
      {build ? <BuildFromScriptDialog state={state} cmds={cmds} originY={bottom} onClose={() => setBuild(false)} onDone={(ids) => { setBuild(false); setTimeout(() => { select(ids); void flow.fitView({ padding: 0.1 }); }, 50); }} /> : null}
    </div>
  );
}

