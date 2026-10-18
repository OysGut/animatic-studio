/** «Bygg fra manuset …» (SL7): forhåndsvisning av førsteoppsettet (layoutFromStructure), lagres først ved bekreftelse. */
import { useMemo, useState } from "react";
import { L, canvasNodeKindLabel, layoutFromStructure, newId, type ProjectState } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function BuildFromScriptDialog({ state, cmds, originY, onClose, onDone }: {
  state: ProjectState; cmds: Commands; originY: number; onClose: () => void; onDone: (ids: string[]) => void;
}) {
  const layout = useMemo(() => layoutFromStructure(state, { originY }), [state, originY]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(layout.map((n) => n.key)));
  const [err, setErr] = useState<string | null>(null);
  const confirm = () => {
    const nodes = layout.filter((n) => picked.has(n.key)).map(({ key: _k, ...f }) => ({ id: newId<"canvas_node">(), ...f }));
    if (!nodes.length) return onClose();
    const e = cmds.run({ type: "AddCanvasNodes", nodes }, L("Bygg fra manuset", "Build from the script"));
    if (e) return setErr(e);
    onDone(nodes.map((n) => n.id));
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-testid="canvas-build-preview">
        <DialogHeader>
          <DialogTitle>{L("Bygg fra manuset", "Build from the script")}</DialogTitle>
          <DialogDescription>{L("En premissnode og én node per scene i fortellingstid. Scener som allerede er på canvaset, hoppes over.", "A premise node and one node per scene in story time. Scenes already on the canvas are skipped.")}</DialogDescription>
        </DialogHeader>
        {layout.length === 0 ? <p className="text-[13px] text-text-tertiary">{L("Alt fra manuset er allerede på canvaset.", "Everything from the script is already on the canvas.")}</p> : (
          <ul className="max-h-72 space-y-1 overflow-y-auto text-[13px]">
            {layout.map((n) => (
              <li key={n.key}><label className="flex items-center gap-2">
                <input type="checkbox" checked={picked.has(n.key)} onChange={(e) => setPicked((s) => { const x = new Set(s); if (e.target.checked) x.add(n.key); else x.delete(n.key); return x; })} />
                <span className="text-text-tertiary">{canvasNodeKindLabel(n.kind)}</span><span>{n.title}</span>
              </label></li>
            ))}
          </ul>
        )}
        {err ? <p role="alert" className="text-[13px] text-status-danger">{err}</p> : null}
        <DialogFooter>
          <ToolbarButton onClick={onClose}>{L("Avbryt", "Cancel")}</ToolbarButton>
          <ToolbarButton variant="primary" disabled={!picked.size} data-testid="canvas-build-confirm" onClick={confirm}>{L(`Legg til ${picked.size} noder`, `Add ${picked.size} nodes`)}</ToolbarButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
