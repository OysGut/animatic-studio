/**
 * Overføring fra en canvasnode til prosjektet (SL7 §5): forhåndsvisning, bekreftelse, én angregruppe og en
 * lenke til resultatet. Kommandoene planlegges i kjernen (canvasNodeToCommands).
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  L,
  canvasNodeToCommands,
  canvasTransferKinds,
  formatHeading,
  mainProduction,
  orderedOccurrences,
  parseHeading,
  type CanvasNode,
  type CanvasTransfer,
  type ProjectState,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { runGroup } from "./run-group";

const field = "h-8 w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

export function CanvasTransferDialog({ state, projectId, cmds, node, onClose }: {
  state: ProjectState; projectId: string; cmds: Commands; node: CanvasNode; onClose: () => void;
}) {
  const kinds = canvasTransferKinds(node);
  const [kind, setKind] = useState(kinds[0] ?? "character");
  const [withProfile, setWithProfile] = useState(true);
  const main = mainProduction(state);
  const occs = main ? orderedOccurrences(state, main.id) : [];
  const [after, setAfter] = useState<string>(occs[occs.length - 1]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<CanvasTransfer, { ok: true }>["result"] | null>(null);
  const target = kind === "scene" ? { kind: "scene" as const, afterOccurrenceId: after || null } : { kind: "asset" as const, assetKind: kind, withProfile };
  const kindLabel = (k: string) => k === "character" ? L("Karakter", "Character") : k === "animal" ? L("Dyr", "Animal") : k === "location" ? L("Sted", "Location") : L("Scene", "Scene");
  const heading = parseHeading(node.title);

  const confirm = async () => {
    setBusy(true); setErr(null);
    try {
      await cmds.whenIdle();
      const current = cmds.current() ?? state;
      const plan = canvasNodeToCommands(current, node.id, target);
      if (!plan.ok) return setErr(plan.message);
      const e = await runGroup(cmds, plan.commands, L("Overfør fra canvaset", "Transfer from the canvas"));
      if (e) return setErr(e);
      setDone(plan.result);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-testid="canvas-transfer">
        <DialogHeader>
          <DialogTitle>{node.kind === "scene" ? L("Opprett scene i manuset", "Create scene in the script") : L("Opprett i biblioteket", "Create in the library")}</DialogTitle>
          <DialogDescription>{L("Ingenting endres før du bekrefter. Du kan angre etterpå.", "Nothing changes until you confirm. You can undo afterwards.")}</DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="space-y-2 text-[13px]" data-testid="canvas-transfer-done">
            <p>{L("Ferdig. Noden er koblet.", "Done. The node is linked.")}</p>
            {done.kind === "asset" ? (
              <Link to="/prosjekt/$projectId/bibliotek" params={{ projectId }} search={{ asset: done.assetId }} className="text-accent-brand">{L("Vis i biblioteket", "Show in the library")}</Link>
            ) : (
              <Link to="/prosjekt/$projectId/manus" params={{ projectId }} search={{ scene: done.occurrenceId }} className="text-accent-brand">{L("Vis i manuset", "Show in the script")}</Link>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-[13px]">
            {kinds.length > 1 ? (
              <label className="block space-y-1">
                <span className="text-[12px] text-text-secondary">{L("Ressurstype", "Asset type")}</span>
                <select className={field} value={kind} data-testid="canvas-transfer-kind" onChange={(e) => setKind(e.target.value as typeof kind)}>
                  {kinds.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
                </select>
              </label>
            ) : null}
            {kind === "scene" ? (
              <>
                <label className="block space-y-1">
                  <span className="text-[12px] text-text-secondary">{L("Plassering", "Placement")}</span>
                  <select className={field} value={after} data-testid="canvas-transfer-after" onChange={(e) => setAfter(e.target.value)}>
                    <option value="">{L("Først i filmen", "First in the film")}</option>
                    {occs.map((o) => { const v = state.variants[o.variantId]; return <option key={o.id} value={o.id}>{L(`Etter ${v ? formatHeading(v.heading) : o.id}`, `After ${v ? formatHeading(v.heading) : o.id}`)}</option>; })}
                  </select>
                </label>
                <div className="rounded-sm border border-border bg-surface-2 p-2" data-testid="canvas-transfer-preview">
                  <p className="text-[12px] text-text-tertiary">{L(`Produksjon: ${main?.name ?? "–"} (hovedvarianten, ny scene)`, `Production: ${main?.name ?? "–"} (main variant, new scene)`)}</p>
                  <p className="font-mono">{formatHeading({ intExt: heading.intExt || "INT.", location: (heading.location || node.title).toUpperCase(), time: heading.time })}</p>
                  {node.body ? <p className="whitespace-pre-wrap text-text-secondary">{node.body}</p> : null}
                </div>
              </>
            ) : (
              <div className="rounded-sm border border-border bg-surface-2 p-2" data-testid="canvas-transfer-preview">
                <p>{L(`Ny ressurs: ${kindLabel(kind)} «${node.title}»`, `New asset: ${kindLabel(kind)} “${node.title}”`)}</p>
                {kind !== "location" ? (
                  <label className="mt-2 flex items-center gap-2">
                    <input type="checkbox" checked={withProfile} data-testid="canvas-transfer-profile" onChange={(e) => setWithProfile(e.target.checked)} />
                    <span>{L("Lag også en Story Lab-profil med teksten som notat", "Also create a Story Lab profile with the text as a note")}</span>
                  </label>
                ) : null}
              </div>
            )}
            {err ? <p role="alert" className="text-status-danger">{err}</p> : null}
          </div>
        )}
        <DialogFooter>
          <ToolbarButton onClick={onClose}>{done ? L("Lukk", "Close") : L("Avbryt", "Cancel")}</ToolbarButton>
          {!done ? <ToolbarButton variant="primary" disabled={busy || !node.title.trim()} data-testid="canvas-transfer-confirm" onClick={() => void confirm()}>{L("Bekreft", "Confirm")}</ToolbarButton> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
