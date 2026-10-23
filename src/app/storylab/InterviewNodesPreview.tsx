/**
 * Forhåndsvisning av noder foreslått fra intervjuet (SL7 §4): avkryssing per node og kant, plassering
 * automatisk eller ved siden av utvalget. Én AddCanvasNodes og kantkommandoene kjøres som én angregruppe.
 */
import { useState } from "react";
import { CANVAS_DEFAULT_H, CANVAS_DEFAULT_W, canvasEdgeKindLabel, canvasNodeDefaults, canvasNodeKindLabel, newId, type CanvasNode, type Command, type ProposedCanvas } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { runGroup } from "./canvas/run-group";
import { t } from "@/core/i18n/keyed";

const COLS = 4;
const GAP = 40;

export function InterviewNodesPreview({ proposal, cmds, selection, origin, onClose, onAdded }: {
  proposal: ProposedCanvas; cmds: Commands; selection: readonly CanvasNode[]; origin: { x: number; y: number };
  onClose: () => void; onAdded: (ids: string[]) => void;
}) {
  const [nodes, setNodes] = useState(() => new Set(proposal.nodes.map((n) => n.tempId)));
  const [edges, setEdges] = useState(() => new Set(proposal.edges.map((_, i) => i)));
  const [place, setPlace] = useState<"auto" | "selection">(selection.length ? "selection" : "auto");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toggle = <T,>(set: Set<T>, v: T, on: boolean) => { const x = new Set(set); if (on) x.add(v); else x.delete(v); return x; };

  const confirm = async () => {
    const picked = proposal.nodes.filter((n) => nodes.has(n.tempId));
    if (!picked.length) return;
    const start = place === "selection" && selection.length
      ? { x: Math.max(...selection.map((n) => n.x + n.w)) + GAP * 2, y: Math.min(...selection.map((n) => n.y)) }
      : origin;
    const ids = new Map<string, string>();
    const add = picked.map((n, i) => {
      const id = newId<"canvas_node">();
      ids.set(n.tempId, id);
      return { id: id as never, ...canvasNodeDefaults(n.kind, { title: n.title, body: n.body, x: start.x + (i % COLS) * (CANVAS_DEFAULT_W + GAP), y: start.y + Math.floor(i / COLS) * (CANVAS_DEFAULT_H + GAP) }) };
    });
    const commands: Command[] = [{ type: "AddCanvasNodes", nodes: add }];
    proposal.edges.forEach((e, i) => {
      const a = ids.get(e.from), b = ids.get(e.to);
      if (edges.has(i) && a && b) commands.push({ type: "AddCanvasEdge", edgeId: newId(), fields: { fromNodeId: a as never, toNodeId: b as never, label: e.label, kind: e.kind } });
    });
    setBusy(true); setErr(null);
    const e = await runGroup(cmds, commands, t("app-storylab-interview-nodes-preview.e.run-group.2277f5c03bb0"));
    setBusy(false);
    if (e) return setErr(e);
    onAdded(add.map((n) => n.id));
  };

  const title = (tempId: string) => proposal.nodes.find((n) => n.tempId === tempId)?.title ?? tempId;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent uiId="V-134" data-testid="interview-preview" className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("app-storylab-interview-nodes-preview.interview-nodes-preview.dialog-title.2af5e73b0f14")}</DialogTitle>
          <DialogDescription>{t("app-storylab-interview-nodes-preview.interview-nodes-preview.dialog-description.fe503670b8f4")}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-64 space-y-1 overflow-y-auto text-[13px]">
          {proposal.nodes.map((n) => (
            <li key={n.tempId}><label className="flex items-start gap-2" data-testid="interview-preview-node" data-kind={n.kind}>
              <input type="checkbox" checked={nodes.has(n.tempId)} onChange={(e) => setNodes((s) => toggle(s, n.tempId, e.target.checked))} />
              <span><span className="text-text-tertiary">{canvasNodeKindLabel(n.kind)}</span> <strong>{n.title}</strong>{n.body ? <span className="block text-text-secondary">{n.body}</span> : null}</span>
            </label></li>
          ))}
        </ul>
        {proposal.edges.length ? (
          <ul className="max-h-32 space-y-1 overflow-y-auto border-t border-border pt-2 text-[12px]">
            {proposal.edges.map((e, i) => (
              <li key={i}><label className="flex items-center gap-2" data-testid="interview-preview-edge">
                <input type="checkbox" checked={edges.has(i) && nodes.has(e.from) && nodes.has(e.to)} disabled={!nodes.has(e.from) || !nodes.has(e.to)} onChange={(x) => setEdges((s) => toggle(s, i, x.target.checked))} />
                <span>{title(e.from)} → {title(e.to)} <span className="text-text-tertiary">({canvasEdgeKindLabel(e.kind)}{e.label ? `: ${e.label}` : ""})</span></span>
              </label></li>
            ))}
          </ul>
        ) : null}
        <fieldset className="flex gap-3 text-[12px]">
          <legend className="sr-only">{t("app-storylab-interview-nodes-preview.interview-nodes-preview.legend.c00435ee2f82")}</legend>
          <label className="flex items-center gap-1"><input type="radio" name="place" checked={place === "auto"} onChange={() => setPlace("auto")} />{t("app-storylab-interview-nodes-preview.interview-nodes-preview.label.0e787e8d899f")}</label>
          <label className="flex items-center gap-1"><input type="radio" name="place" disabled={!selection.length} checked={place === "selection"} onChange={() => setPlace("selection")} />{t("app-storylab-interview-nodes-preview.interview-nodes-preview.label.ef92b4500c3f")}</label>
        </fieldset>
        {err ? <p role="alert" className="text-[13px] text-status-danger">{err}</p> : null}
        <DialogFooter>
          <ToolbarButton onClick={onClose}>{t("app-storylab-interview-nodes-preview.interview-nodes-preview.toolbar-button.cb52749bae90")}</ToolbarButton>
          <ToolbarButton variant="primary" disabled={busy || !nodes.size} data-testid="interview-preview-confirm" onClick={() => void confirm()}>{t("app-storylab-interview-nodes-preview.interview-nodes-preview.toolbar-button.a5eceea6c575", { size: String(nodes.size) })}</ToolbarButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
