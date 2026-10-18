/**
 * Inspektøren for skrivecanvaset (SL7): type, tittel, brødtekst, farge, kobling til bibliotek eller scene,
 * kantene med etikett og type, og overføring til prosjektet. Tekst lagres med debounce som UpdateCanvasNode.
 */
import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  CANVAS_BODY_MAX,
  CANVAS_EDGE_KINDS,
  CANVAS_LABEL_MAX,
  CANVAS_NODE_KINDS,
  CANVAS_TITLE_MAX,
  L,
  canvasEdgeKindLabel,
  canvasNodeKindLabel,
  canvasTransferKinds,
  scenesInStoryTime,
  type CanvasEdgeKind,
  type CanvasNode,
  type CanvasNodeKind,
  type ProjectState,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { PanelHeader, ToolbarButton } from "@/app/shell/workspace-chrome";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { COLOR_TOKENS, colorLabel } from "./CanvasNodes";
import { CanvasTransferDialog } from "./CanvasTransferDialog";

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
          <PanelHeader title={L("Kobling", "Connection")} />
          <EdgeRow state={state} cmds={cmds} editable={editable} edgeId={edge.id} from={edge.fromNodeId} onError={onError} />
        </>
      ) : (
        <p className="p-3 text-[12px] text-text-tertiary">
          {selected.length > 1
            ? L(`${selected.length} noder er valgt. Velg «Koble» for å koble to noder, eller «Grupper».`, `${selected.length} nodes are selected. Choose “Connect” to connect two nodes, or “Group”.`)
            : L("Velg en node for å redigere den. Dobbeltklikk eller trykk Enter.", "Select a node to edit it. Double-click or press Enter.")}
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
    if (Object.keys(patch).length) onError(cmds.run({ type: "UpdateCanvasNode", nodeId: node.id, patch }, L("Endre tekst på canvaset", "Edit text on the canvas"), `canvas-text:${node.id}`));
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
        <span className="text-[12px] text-text-secondary">{L("Type", "Type")}</span>
        <select className={field} disabled={!editable} value={node.kind} data-testid="canvas-inspector-kind"
          onChange={(e) => update({ kind: e.target.value as CanvasNodeKind }, L("Endre nodetype", "Change node type"))}>
          {CANVAS_NODE_KINDS.map((k) => <option key={k} value={k}>{canvasNodeKindLabel(k)}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] text-text-secondary">{L("Tittel", "Title")}</span>
        <Input ref={titleRef} disabled={!editable} maxLength={CANVAS_TITLE_MAX} value={draft.title} data-testid="canvas-inspector-title"
          onChange={(e) => change({ title: e.target.value })} onBlur={flush} />
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] text-text-secondary">{L("Tekst", "Text")}</span>
        <Textarea rows={5} disabled={!editable} maxLength={CANVAS_BODY_MAX} value={draft.body} data-testid="canvas-inspector-body"
          onChange={(e) => change({ body: e.target.value })} onBlur={flush} />
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] text-text-secondary">{L("Farge", "Colour")}</span>
        <select className={field} disabled={!editable} value={node.color ?? ""}
          onChange={(e) => update({ color: e.target.value || null }, L("Endre farge", "Change colour"))}>
          <option value="">{L("Standard for typen", "Default for the type")}</option>
          {Object.keys(COLOR_TOKENS).map((t) => <option key={t} value={t}>{colorLabel(t)}</option>)}
        </select>
      </label>
      {node.kind !== "scene" ? (
        <label className="block space-y-1">
          <span className="text-[12px] text-text-secondary">{L("Kobling til biblioteket", "Link to the library")}</span>
          <select className={field} disabled={!editable} value={node.assetId ?? ""} data-testid="canvas-inspector-asset"
            onChange={(e) => update({ assetId: e.target.value || null }, L("Koble til biblioteket", "Link to the library"))}>
            <option value="">{L("Ikke koblet", "Not linked")}</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      ) : null}
      {node.kind === "scene" || node.kind === "event" || node.kind === "plot_point" || node.kind === "turning_point" ? (
        <label className="block space-y-1">
          <span className="text-[12px] text-text-secondary">{L("Kobling til en scene", "Link to a scene")}</span>
          <select className={field} disabled={!editable} value={node.sceneId ?? ""} data-testid="canvas-inspector-scene"
            onChange={(e) => update({ sceneId: e.target.value || null }, L("Koble til en scene", "Link to a scene"))}>
            <option value="">{L("Ikke koblet", "Not linked")}</option>
            {scenes.map((s) => <option key={s.sceneId} value={s.sceneId}>{s.heading || s.sceneId}</option>)}
          </select>
        </label>
      ) : null}
      {node.assetId || node.sceneId ? (
        <ToolbarButton onClick={() => onOpen(node)}>{node.sceneId ? L("Åpne i Scenelaben", "Open in the Scene Lab") : L("Åpne karakteren", "Open the character")}</ToolbarButton>
      ) : null}
      {transferable ? (
        <ToolbarButton variant="primary" data-testid="canvas-transfer-open" onClick={() => { flush(); setTransfer(true); }}>
          {node.kind === "scene" ? L("Opprett scene i manuset …", "Create scene in the script …") : node.kind === "location" ? L("Opprett sted i biblioteket …", "Create location in the library …") : L("Opprett i biblioteket …", "Create in the library …")}
        </ToolbarButton>
      ) : null}
      <PanelHeader title={L("Koblinger", "Connections")} count={edges.length} />
      {edges.length === 0 ? <p className="text-[12px] text-text-tertiary">{L("Ingen koblinger. Dra fra kanten av en node, eller velg to noder og «Koble».", "No connections. Drag from the edge of a node, or select two nodes and “Connect”.")}</p> : null}
      {edges.map((e) => <EdgeRow key={e.id} state={state} cmds={cmds} editable={editable} edgeId={e.id} from={node.id} onError={onError} />)}
      {editable ? (
        <ToolbarButton data-testid="canvas-inspector-remove" onClick={() => onError(cmds.run({ type: "RemoveCanvasNodes", nodeIds: [node.id], removed: true }, L("Fjern fra canvaset", "Remove from the canvas")))}>
          <Trash2 />{L("Fjern noden", "Remove the node")}
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
  const save = () => { if (label !== e.label) onError(cmds.run({ type: "UpdateCanvasEdge", edgeId: e.id, patch: { label } }, L("Endre kobling", "Edit connection"))); };
  return (
    <div className="space-y-1 rounded-sm border border-border bg-surface-2 p-2" data-testid="canvas-inspector-edge">
      <p className="text-[12px] text-text-secondary">{e.fromNodeId === from ? "→ " : "← "}{other?.title || L("Uten tittel", "Untitled")}</p>
      <select className={field} disabled={!editable} aria-label={L("Type kobling", "Connection type")} value={e.kind}
        onChange={(x) => onError(cmds.run({ type: "UpdateCanvasEdge", edgeId: e.id, patch: { kind: x.target.value as CanvasEdgeKind } }, L("Endre kobling", "Edit connection")))}>
        {CANVAS_EDGE_KINDS.map((k) => <option key={k} value={k}>{canvasEdgeKindLabel(k)}</option>)}
      </select>
      <div className="flex gap-1">
        <Input disabled={!editable} aria-label={L("Etikett", "Label")} placeholder={L("Etikett", "Label")} maxLength={CANVAS_LABEL_MAX} value={label}
          onChange={(x) => setLabel(x.target.value)} onBlur={save} onKeyDown={(x) => { if (x.key === "Enter") save(); }} />
        {editable ? (
          <ToolbarButton variant="icon" aria-label={L("Fjern koblingen", "Remove the connection")} title={L("Fjern koblingen", "Remove the connection")}
            onClick={() => onError(cmds.run({ type: "RemoveCanvasEdge", edgeId: e.id, removed: true }, L("Fjern kobling", "Remove connection")))}>
            <Trash2 />
          </ToolbarButton>
        ) : null}
      </div>
    </div>
  );
}
