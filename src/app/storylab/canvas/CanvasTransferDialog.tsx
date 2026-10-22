/**
 * Overføring fra en canvasnode til prosjektet (SL7 §5): forhåndsvisning, bekreftelse, én angregruppe og en
 * lenke til resultatet. Kommandoene planlegges i kjernen (canvasNodeToCommands).
 */
import { SceneSelect, mainOccurrenceOfScene } from "@/app/shell/SceneSelect";
import { requestAnalysisNow } from "@/app/library/entity-analysis-store";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { canvasNodeToCommands, canvasTransferKinds, formatHeading, mainProduction, orderedOccurrences, parseHeading, type CanvasNode, type CanvasTransfer, type ProjectState } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { runGroup } from "./run-group";
import { t } from "@/core/i18n/keyed";

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
  const kindLabel = (k: string) => k === "character" ? t("app-storylab-canvas-canvas-transfer-dialog.kind-label.message.e7f18511b330") : k === "animal" ? t("app-storylab-canvas-canvas-transfer-dialog.kind-label.message.e637c9760c4d") : k === "location" ? t("app-storylab-canvas-canvas-transfer-dialog.kind-label.message.645e20b17089") : t("app-storylab-canvas-canvas-transfer-dialog.kind-label.message.9c18f78d2fad");
  const heading = parseHeading(node.title);

  const confirm = async () => {
    setBusy(true); setErr(null);
    try {
      await cmds.whenIdle();
      const current = cmds.current() ?? state;
      const plan = canvasNodeToCommands(current, node.id, target);
      if (!plan.ok) return setErr(plan.message);
      const e = await runGroup(cmds, plan.commands, t("app-storylab-canvas-canvas-transfer-dialog.e.run-group.20b2d472b6ae"));
      if (e) return setErr(e);
      setDone(plan.result);
      // Ny manustekst: automatisk gjenkjenning straks (OG2)
      if (node.kind === "scene") requestAnalysisNow(projectId);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-testid="canvas-transfer">
        <DialogHeader>
          <DialogTitle>{node.kind === "scene" ? t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.dialog-title.4ec92e80b723") : t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.dialog-title.37f63e7a4f1d")}</DialogTitle>
          <DialogDescription>{t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.dialog-description.ef8a99fd7fcb")}</DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="space-y-2 text-[13px]" data-testid="canvas-transfer-done">
            <p>{t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.p.bae90363025a")}</p>
            {done.kind === "asset" ? (
              <Link to="/prosjekt/$projectId/bibliotek" params={{ projectId }} search={{ asset: done.assetId }} className="text-accent-brand">{t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.link.70b58daab9e8")}</Link>
            ) : (
              <Link to="/prosjekt/$projectId/manus" params={{ projectId }} search={{ scene: done.occurrenceId }} className="text-accent-brand">{t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.link.0fae73108cf8")}</Link>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-[13px]">
            {kinds.length > 1 ? (
              <label className="block space-y-1">
                <span className="text-[12px] text-text-secondary">{t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.span.3750d8105fc9")}</span>
                <select className={field} value={kind} data-testid="canvas-transfer-kind" onChange={(e) => setKind(e.target.value as typeof kind)}>
                  {kinds.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
                </select>
              </label>
            ) : null}
            {kind === "scene" ? (
              <>
                <label className="block space-y-1">
                  <span className="text-[12px] text-text-secondary">{t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.span.ed14a5640f8d")}</span>
                  <SceneSelect className={field} value={after} testId="canvas-transfer-after" onChange={setAfter} ariaLabel={t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.span.ed14a5640f8d")}
                    emptyLabel={t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.option.cf09e178e567")}
                    options={occs.map((o) => { const v = state.variants[o.variantId]; return { value: o.id, label: t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.option.6dd1765c83e0", { value1: String(v ? formatHeading(v.heading) : o.id) }), occurrence: o }; })} />
                </label>
                <div className="rounded-sm border border-border bg-surface-2 p-2" data-testid="canvas-transfer-preview">
                  <p className="text-[12px] text-text-tertiary">{t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.p.491cd1d6736a", { value1: String(main?.name ?? "–") })}</p>
                  <p className="font-mono">{formatHeading({ intExt: heading.intExt || "INT.", location: (heading.location || node.title).toUpperCase(), time: heading.time })}</p>
                  {node.body ? <p className="whitespace-pre-wrap text-text-secondary">{node.body}</p> : null}
                </div>
              </>
            ) : (
              <div className="rounded-sm border border-border bg-surface-2 p-2" data-testid="canvas-transfer-preview">
                <p>{t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.p.3a9b48e35e5c", { value1: String(kindLabel(kind)), title: String(node.title) })}</p>
                {kind !== "location" ? (
                  <label className="mt-2 flex items-center gap-2">
                    <input type="checkbox" checked={withProfile} data-testid="canvas-transfer-profile" onChange={(e) => setWithProfile(e.target.checked)} />
                    <span>{t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.span.ec8974d17c76")}</span>
                  </label>
                ) : null}
              </div>
            )}
            {err ? <p role="alert" className="text-status-danger">{err}</p> : null}
          </div>
        )}
        <DialogFooter>
          <ToolbarButton onClick={onClose}>{done ? t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.toolbar-button.0dd2abc46e6f") : t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.toolbar-button.b4dc3af018c6")}</ToolbarButton>
          {!done ? <ToolbarButton variant="primary" disabled={busy || !node.title.trim()} data-testid="canvas-transfer-confirm" onClick={() => void confirm()}>{t("app-storylab-canvas-canvas-transfer-dialog.canvas-transfer-dialog.toolbar-button.b986808c0bee")}</ToolbarButton> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
