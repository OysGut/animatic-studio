/**
 * Godkjenning av et nytt bilde med konsekvenser (M6 del 3, DEC-0056, REQ-0130/0132/0134/0314): viser
 * scenene som berøres og lar brukeren velge scene for scene om det nye bildet skal brukes. Ferdig film der
 * ressursen er med, vises som «kan være påvirket» (usikkert) – den endres ikke.
 */
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { CircleHelp, Film, Layers } from "lucide-react";
import { useMemo, useState } from "react";
import { applyCommand, approveWithImpactCommands, assetVersionImpact, formatHeading, newId, type AssetVariant, type AssetVersion, type ProjectState, type SceneImpact } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/core/i18n/keyed";

/** Scenene der godkjenningen endrer noe (eller kan endre noe). Tom liste = godkjenn uten spørsmål. */
export function useApproveImpact(
  state: ProjectState,
  productionId: string,
  variantId: string,
  versionId: string | null,
): SceneImpact[] {
  return useMemo(
    () => (versionId ? assetVersionImpact(state, productionId, variantId, versionId) : []),
    [state, productionId, variantId, versionId],
  );
}

export function ApproveImpactDialog({
  state,
  productionId,
  variant,
  version,
  cmds,
  onClose,
}: {
  state: ProjectState;
  productionId: string;
  variant: AssetVariant;
  /** Versjonen som skal godkjennes; null = lukket. */
  version: AssetVersion | null;
  cmds: Commands;
  onClose: () => void;
}) {
  const impact = useApproveImpact(state, productionId, variant.id, version?.id ?? null);
  const [keep, setKeep] = useState<ReadonlySet<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const changing = (x: SceneImpact) =>
    x.layers.some((l) => l.mode === "follows" || l.mode === "locked");
  const withLayers = impact.filter(changing);
  const films = impact.filter((x) => x.filmTakeIds.length > 0);
  const otherProductions = withLayers.some((x) => x.productionId !== productionId);
  const label = (x: SceneImpact) => {
    const o = x.occurrenceId ? state.occurrences[x.occurrenceId] : undefined;
    const c = x.compositionId ? state.compositions[x.compositionId] : undefined;
    const v = state.variants[o?.variantId ?? c?.variantId ?? ""];
    const prod =
      x.productionId && x.productionId !== productionId
        ? ` · ${state.productions[x.productionId]?.name ?? t("app-library-approve-impact-dialog.prod.message.a3119ecda93c")}`
        : !x.occurrenceId
          ? t("app-library-approve-impact-dialog.prod.message.0640a91d3954")
          : "";
    return `${x.number ? `${x.number}. ` : ""}${v ? formatHeading(v.heading) : "Scene"}${x.active || !x.occurrenceId ? "" : t("app-library-approve-impact-dialog.label.message.dd51b2af2f2d")}${prod}`;
  };

  function close() {
    setKeep(new Set());
    setErr(null);
    onClose();
  }

  function confirm() {
    if (!version) return;
    const commands = approveWithImpactCommands(state, variant.id, version.id, impact, keep);
    // Prøv hele kjeden lokalt først, så godkjenningen ikke blir halvveis
    let probe = state;
    for (const c of commands) {
      const r = applyCommand(probe, {
        id: newId<"command">(),
        actor: "00000000-0000-7000-8000-000000000000" as never,
        at: new Date().toISOString(),
        command: c,
      });
      if (!r.ok) {
        setErr(
          t("app-library-approve-impact-dialog.confirm.set-err.145c3611aee6", { message: String(r.error.message) }),
        );
        return;
      }
      probe = r.state;
    }
    const group = newId();
    for (const c of commands) {
      const e = cmds.run(
        c,
        c.type === "ApproveAssetVersion"
          ? t("app-library-approve-impact-dialog.e.cmds-run.45fc2d59bc59", { number: String(version.number), name: String(variant.name) })
          : t("app-library-approve-impact-dialog.e.cmds-run.6a89a6a6537b"),
        group,
      );
      if (e) {
        setErr(e);
        return;
      }
    }
    close();
  }

  return (
    <Dialog open={version !== null} onOpenChange={(o) => (o ? null : close())}>
      <ResizableDialogContent uiId="V-063" sizeKey="approve-impact" className="max-h-[88vh] max-w-[640px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>
            {t("app-library-approve-impact-dialog.approve-impact-dialog.dialog-title.dad6f23eb142")} v{version?.number} {t("app-library-approve-impact-dialog.approve-impact-dialog.dialog-title.e5640f20eb11")}
            {variant.name}
            {t("app-library-approve-impact-dialog.approve-impact-dialog.dialog-title.d7af7f578283")}
          </DialogTitle>
          <DialogDescription>
            {t("app-library-approve-impact-dialog.approve-impact-dialog.dialog-description.4ca829724279")}
          </DialogDescription>
        </DialogHeader>
        {withLayers.length ? (
          <ul
            aria-label={t("app-library-approve-impact-dialog.approve-impact-dialog.aria-label.a4177310e1aa")}
            className="flex flex-col gap-1"
          >
            {withLayers.map((x) => {
              const on = !keep.has(x.key);
              const follows = x.layers.filter((l) => l.mode === "follows" && l.versionId).length;
              const locked = x.layers.filter((l) => l.mode === "locked").length;
              const newer = x.layers.filter((l) => l.mode === "locked_newer").length;
              return (
                <li key={x.key}>
                  <label className="flex items-start gap-2 rounded-sm bg-surface-1 px-2 py-1.5 text-[13px]">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setKeep((s) => {
                          const n = new Set(s);
                          if (n.has(x.key)) n.delete(x.key);
                          else n.add(x.key);
                          return n;
                        })
                      }
                      className="mt-0.5 size-3.5 accent-[var(--accent-brand)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-text-primary">
                        <Layers className="size-3.5 text-text-tertiary" aria-hidden />
                        {label(x)}
                      </span>
                      <span className="block text-[11px] text-text-tertiary">
                        {on
                          ? t("app-library-approve-impact-dialog.approve-impact-dialog.span.e6651dd3fa03")
                          : t("app-library-approve-impact-dialog.approve-impact-dialog.span.6465b25bfacc")}
                        {locked && on
                          ? t("app-library-approve-impact-dialog.approve-impact-dialog.span.b85e291e1099", { locked: String(locked) })
                          : ""}
                        {follows && !on
                          ? t("app-library-approve-impact-dialog.approve-impact-dialog.span.2d2255817622", { follows: String(follows) })
                          : ""}
                        {newer
                          ? t("app-library-approve-impact-dialog.approve-impact-dialog.span.af5aa2d63731", { newer: String(newer) })
                          : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-text-secondary">
            {t("app-library-approve-impact-dialog.approve-impact-dialog.p.c5bbe94479c9")}
          </p>
        )}
        {otherProductions ? (
          <p className="text-[11px] text-text-tertiary">
            {t("app-library-approve-impact-dialog.approve-impact-dialog.p.a64e1784ca11")}
          </p>
        ) : null}
        {films.length ? (
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <p className="flex items-center gap-1.5 text-xs text-text-secondary">
              <CircleHelp className="size-3.5 text-text-tertiary" aria-hidden />
              {t("app-library-approve-impact-dialog.approve-impact-dialog.p.bb7f88302c69")}
            </p>
            <ul className="flex flex-col gap-0.5 pl-5 text-xs text-text-tertiary">
              {films.map((x) => (
                <li key={x.key} className="flex items-center gap-1.5">
                  <Film className="size-3" aria-hidden />
                  {label(x)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {err ? (
          <p role="alert" className="text-xs text-status-danger">
            {err}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            {t("app-library-approve-impact-dialog.approve-impact-dialog.button.519fccfaff95")}
          </Button>
          <Button onClick={confirm}>{t("app-library-approve-impact-dialog.approve-impact-dialog.button.dad6f23eb142")}</Button>
        </DialogFooter>
      </ResizableDialogContent>
    </Dialog>
  );
}
