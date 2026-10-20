/**
 * «Bruk også i …» (GP3, §18, S2–S5): velg én eller flere scener i produksjonsrekkefølge. Finnes ressursen
 * allerede i en scene, velger brukeren mellom å bruke den som finnes og å legge til en til (§22). Alt skrives
 * som én angregruppe direkte til målscenene; scenen som er åpen, endres ikke.
 */
import { useEffect, useMemo, useState } from "react";
import { carryTargets, planCarryOver, type CarryMode, type ProjectState } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { runGroup } from "@/app/storylab/canvas/run-group";
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

export function carryLabel(name: string): string {
  return t("app-scene-editor-carry-over-dialog.carry-label.message.d003692da5f5", { name: String(name) });
}

/** Kjører en plan som én angregruppe. Gir feilen (eller null) og antall nye lag. */
export async function runCarryOver(
  state: ProjectState,
  cmds: Commands,
  layerId: string,
  sourceOccurrenceId: string,
  requests: readonly { occurrenceId: string; mode: CarryMode }[],
): Promise<{ error: string | null; created: number; reused: number }> {
  const plan = planCarryOver(state, layerId, sourceOccurrenceId, requests as never);
  if (!plan.ok)
    return {
      error:
        plan.reason === "same_scene"
          ? t("app-scene-editor-carry-over-dialog.error.error.05a9b406f6b3")
          : t("app-scene-editor-carry-over-dialog.error.error.8ec7f04d3539"),
      created: 0,
      reused: 0,
    };
  if (!plan.commands.length) return { error: null, created: 0, reused: plan.reused.length };
  const name = state.layers[layerId]?.name ?? "";
  const error = await runGroup(cmds, plan.commands, carryLabel(name));
  return { error, created: error ? 0 : plan.created.length, reused: plan.reused.length };
}

export function CarryOverDialog({
  open,
  onOpenChange,
  state,
  cmds,
  layerId,
  sourceOccurrenceId,
  preselect,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  cmds: Commands;
  layerId: string;
  sourceOccurrenceId: string;
  preselect?: string | null;
  onDone?: (message: string) => void;
}) {
  const { options } = useMemo(
    () => carryTargets(state, layerId, sourceOccurrenceId),
    [state, layerId, sourceOccurrenceId],
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [modes, setModes] = useState<Record<string, CarryMode>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setPicked(new Set(preselect ? [preselect] : []));
    setModes({});
    setError(null);
  }, [open, preselect]);
  const layer = state.layers[layerId];
  const name = layer?.name ?? "";

  async function submit() {
    setBusy(true);
    const reqs = options
      .filter((o) => picked.has(o.occurrenceId))
      .map((o) => ({ occurrenceId: o.occurrenceId, mode: modes[o.occurrenceId] ?? (o.duplicates.length ? "existing" : "add") }));
    const r = await runCarryOver(state, cmds, layerId, sourceOccurrenceId, reqs);
    setBusy(false);
    if (r.error) return setError(r.error);
    onOpenChange(false);
    onDone?.(
      r.reused ? t("app-scene-editor-carry-over-dialog.carried-over-reused", { name, count: r.created, reused: r.reused }) : t("app-scene-editor-carry-over-dialog.carried-over", { name, count: r.created }),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="carry-over-dialog">
        <DialogHeader>
          <DialogTitle>{carryLabel(name)}</DialogTitle>
          <DialogDescription>
            {t("app-scene-editor-carry-over-dialog.carry-over-dialog.dialog-description.7c8035e40fc2")}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto" data-testid="carry-over-list">
          {options.map((o) => {
            const on = picked.has(o.occurrenceId);
            const dup = o.duplicates.length > 0;
            const mode = modes[o.occurrenceId] ?? (dup ? "existing" : "add");
            return (
              <li
                key={o.occurrenceId}
                data-carry-target={o.occurrenceId}
                data-duplicate={dup ? "true" : "false"}
                className="flex flex-col gap-1 rounded-sm border border-border p-2"
              >
                <label className="flex items-center gap-2 text-[13px] text-text-primary">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={o.sameScene || busy}
                    onChange={(e) => {
                      const n = new Set(picked);
                      if (e.target.checked) n.add(o.occurrenceId);
                      else n.delete(o.occurrenceId);
                      setPicked(n);
                    }}
                  />
                  <span className="tabular-nums text-text-secondary">{o.number ?? "–"}</span>
                  <span className="truncate">{o.heading || t("app-scene-editor-carry-over-dialog.carry-over-dialog.span.e4495ec6a362")}</span>
                  {o.sameScene ? (
                    <span className="text-xs text-text-tertiary">{t("app-scene-editor-carry-over-dialog.carry-over-dialog.span.8b40fd165157")}</span>
                  ) : null}
                </label>
                {on && dup ? (
                  <div className="flex flex-col gap-1 pl-6 text-xs text-text-secondary" role="radiogroup" data-testid="carry-over-duplicate">
                    <span className="text-status-warning">
                      {t("app-scene-editor-carry-over-dialog.carry-over-dialog.span.840774469bb8")}
                    </span>
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`m-${o.occurrenceId}`}
                        checked={mode === "existing"}
                        onChange={() => setModes({ ...modes, [o.occurrenceId]: "existing" })}
                        data-testid="carry-over-use-existing"
                      />
                      {t("app-scene-editor-carry-over-dialog.carry-over-dialog.label.96d556621e7d")}
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`m-${o.occurrenceId}`}
                        checked={mode === "add"}
                        onChange={() => setModes({ ...modes, [o.occurrenceId]: "add" })}
                        data-testid="carry-over-add-another"
                      />
                      {t("app-scene-editor-carry-over-dialog.carry-over-dialog.label.9d11685844c1")}
                    </label>
                  </div>
                ) : null}
              </li>
            );
          })}
          {!options.length ? (
            <li className="text-xs text-text-tertiary">{t("app-scene-editor-carry-over-dialog.carry-over-dialog.li.55851ca1d758")}</li>
          ) : null}
        </ul>
        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("app-scene-editor-carry-over-dialog.carry-over-dialog.button.ab08459b06a1")}
          </Button>
          <Button onClick={() => void submit()} disabled={busy || picked.size === 0} data-testid="carry-over-submit">
            {t("app-scene-editor-carry-over-dialog.carry-over-dialog.button.538a104fae24")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
