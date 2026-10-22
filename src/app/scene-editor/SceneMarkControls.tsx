/**
 * B-118: status- og fargevelger for aktiv scene midt i sceneeditorens toppmeny, pluss bryterne «Vis status»
 * og «Vis farger» (per bruker). Bare redaktører og eiere kan endre; andre ser verdiene.
 */
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { SCENE_COLORS, WORK_STATUSES, type Command, type ProjectState, type SceneOccurrence } from "@/core";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { t } from "@/core/i18n/keyed";
import {
  SCENE_COLOR_BG,
  SceneColorSquare,
  WorkStatusIcon,
  sceneColorLabel,
  useMarkChangeText,
  useProfiles,
  useSceneMarkChanges,
  useSceneMarkPrefs,
  workStatusLabel,
} from "@/app/shell/SceneMark";

const trigger =
  "flex h-7 items-center gap-1.5 rounded-sm border border-border-control bg-surface-3 px-2 text-[12px] text-text-primary hover:bg-surface-2 disabled:cursor-default disabled:opacity-70";

export function SceneMarkControls({
  state,
  occurrence,
  editable,
  run,
}: {
  state: ProjectState;
  occurrence: SceneOccurrence | undefined;
  editable: boolean;
  run: (command: Command, label: string) => string | null;
}) {
  const prefs = useSceneMarkPrefs();
  const [statusOpen, setStatusOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const changes = useSceneMarkChanges(state.project.id, !!occurrence);
  const actors = [
    ...new Set([...(changes.data?.status.values() ?? []), ...(changes.data?.color.values() ?? [])].map((c) => c.actor)),
  ];
  const names = useProfiles(actors).data;
  const tip = useMarkChangeText();
  const disabled = !occurrence || !editable;
  const status = occurrence?.workStatus;
  const color = occurrence?.color;
  const statusTip = tip(
    status ? workStatusLabel(status) : t("b118.status.none"),
    occurrence ? changes.data?.status.get(occurrence.id) : undefined,
    names,
  );
  const colorTip = tip(
    color ? sceneColorLabel(color) : t("b118.color.none"),
    occurrence ? changes.data?.color.get(occurrence.id) : undefined,
    names,
  );

  function setStatus(next: string | null) {
    if (!occurrence) return;
    run({ type: "SetOccurrenceWorkStatus", occurrenceId: occurrence.id, workStatus: next }, t("b118.undo-status"));
    setStatusOpen(false);
  }
  function setColor(next: string | null) {
    if (!occurrence) return;
    run({ type: "SetOccurrenceColor", occurrenceId: occurrence.id, color: next }, t("b118.undo-color"));
    setColorOpen(false);
  }

  return (
    <div className="flex shrink-0 items-center gap-2" data-testid="scene-mark-controls">
      <Popover open={statusOpen} onOpenChange={setStatusOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={trigger}
            disabled={disabled}
            data-testid="scene-status-trigger"
            data-status={status ?? ""}
            title={statusTip}
            aria-label={t("b118.status-aria", { value: status ? workStatusLabel(status) : t("b118.status.none") })}
          >
            {prefs.showStatus ? <WorkStatusIcon status={status} title={statusTip} /> : null}
            <span className="max-w-[96px] truncate">{status ? workStatusLabel(status) : t("b118.status.none")}</span>
            <ChevronDown className="size-3 text-text-tertiary" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-56 border-border bg-surface-2 p-1">
          <div role="menu" aria-label={t("b118.status-menu")}>
            {[null, ...WORK_STATUSES].map((s) => (
              <button
                key={s ?? "none"}
                type="button"
                role="menuitemradio"
                aria-checked={(status ?? null) === s}
                data-testid={`scene-status-option-${s ?? "none"}`}
                onClick={() => setStatus(s)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[12px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
              >
                <WorkStatusIcon status={s ?? undefined} />
                <span className="flex-1">{s ? workStatusLabel(s) : t("b118.status.none")}</span>
                {(status ?? null) === s ? <Check className="size-3.5 text-accent-brand" aria-hidden /> : null}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Popover open={colorOpen} onOpenChange={setColorOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={trigger}
            disabled={disabled}
            data-testid="scene-color-trigger"
            data-color={color ?? ""}
            title={colorTip}
            aria-label={t("b118.color-aria", { value: color ? sceneColorLabel(color) : t("b118.color.none") })}
          >
            {prefs.showColors ? <SceneColorSquare color={color} /> : null}
            {prefs.showColors ? null : <span>{t("b118.color-label")}</span>}
            <ChevronDown className="size-3 text-text-tertiary" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-auto border-border bg-surface-2 p-2">
          <div role="menu" aria-label={t("b118.color-menu")} className="grid grid-cols-5 gap-1.5">
            {SCENE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="menuitemradio"
                aria-checked={color === c}
                aria-label={sceneColorLabel(c)}
                title={sceneColorLabel(c)}
                data-testid={`scene-color-option-${c}`}
                onClick={() => setColor(c)}
                className={
                  "size-6 rounded-sm outline-offset-2 hover:outline hover:outline-1 hover:outline-text-secondary " +
                  SCENE_COLOR_BG[c] +
                  (color === c ? " outline outline-2 outline-text-primary" : "")
                }
              />
            ))}
          </div>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!color}
            data-testid="scene-color-option-none"
            onClick={() => setColor(null)}
            className="mt-2 w-full rounded-sm px-2 py-1 text-left text-[12px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
          >
            {t("b118.color.none")}
          </button>
        </PopoverContent>
      </Popover>
      <label className="flex items-center text-[11px] text-text-secondary" title={t("b118.show-status")}>
        <Switch
          checked={prefs.showStatus}
          onCheckedChange={prefs.setShowStatus}
          className="scale-75"
          data-testid="scene-show-status"
          aria-label={t("b118.show-status")}
        />
        <span className="sr-only">{t("b118.show-status")}</span>
      </label>
      <label className="flex items-center text-[11px] text-text-secondary" title={t("b118.show-colors")}>
        <Switch
          checked={prefs.showColors}
          onCheckedChange={prefs.setShowColors}
          className="scale-75"
          data-testid="scene-show-colors"
          aria-label={t("b118.show-colors")}
        />
        <span className="sr-only">{t("b118.show-colors")}</span>
      </label>
    </div>
  );
}
