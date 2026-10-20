/** «Bygg fra manuset …» (SL7): forhåndsvisning av førsteoppsettet (layoutFromStructure), lagres først ved bekreftelse. */
import { useMemo, useState } from "react";
import { L, canvasNodeKindLabel, layoutFromStructure, newId, type ProjectState } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/core/i18n/keyed";

export function BuildFromScriptDialog({ state, cmds, originY, onClose, onDone }: {
  state: ProjectState; cmds: Commands; originY: number; onClose: () => void; onDone: (ids: string[]) => void;
}) {
  const layout = useMemo(() => layoutFromStructure(state, { originY }), [state, originY]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(layout.map((n) => n.key)));
  const [err, setErr] = useState<string | null>(null);
  const confirm = () => {
    const nodes = layout.filter((n) => picked.has(n.key)).map(({ key: _k, ...f }) => ({ id: newId<"canvas_node">(), ...f }));
    if (!nodes.length) return onClose();
    const e = cmds.run({ type: "AddCanvasNodes", nodes }, t("app-storylab-canvas-build-from-script-dialog.e.cmds-run.891234c2c685"));
    if (e) return setErr(e);
    onDone(nodes.map((n) => n.id));
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-testid="canvas-build-preview">
        <DialogHeader>
          <DialogTitle>{t("app-storylab-canvas-build-from-script-dialog.build-from-script-dialog.dialog-title.efa0788452c2")}</DialogTitle>
          <DialogDescription>{t("app-storylab-canvas-build-from-script-dialog.build-from-script-dialog.dialog-description.318ac92ee7cc")}</DialogDescription>
        </DialogHeader>
        {layout.length === 0 ? <p className="text-[13px] text-text-tertiary">{t("app-storylab-canvas-build-from-script-dialog.build-from-script-dialog.p.562f98ce63e5")}</p> : (
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
          <ToolbarButton onClick={onClose}>{t("app-storylab-canvas-build-from-script-dialog.build-from-script-dialog.toolbar-button.dda5c0ca6f51")}</ToolbarButton>
          <ToolbarButton variant="primary" disabled={!picked.size} data-testid="canvas-build-confirm" onClick={confirm}>{t("app-storylab-canvas-build-from-script-dialog.build-from-script-dialog.toolbar-button.cb63358027a1", { size: String(picked.size) })}</ToolbarButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
