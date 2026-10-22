import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectState } from "@/core/model";
import { DEFAULT_CAPTURE, captureSettingsValid, projectCodeValid, suggestProjectCode, type CaptureMode } from "@/core/interchange/settings";
import { useCommands } from "@/app/project/use-commands";
import { t } from "@/core/i18n/keyed";

export function InterchangeSettings({ state, userId, editable, disabled = false }: {
  state: ProjectState; userId: string; editable: boolean; disabled?: boolean;
}) {
  const cmds = useCommands(state.project.id, userId, editable);
  const saved = state.project.capture ?? DEFAULT_CAPTURE;
  const [code, setCode] = useState(state.project.code ?? suggestProjectCode(state.project.name));
  const [mode, setMode] = useState<CaptureMode>(saved.mode);
  const [num, setNum] = useState(saved.fps.num);
  const [den, setDen] = useState(saved.fps.den);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setCode(state.project.code ?? suggestProjectCode(state.project.name)); setMode(saved.mode); setNum(saved.fps.num); setDen(saved.fps.den); }, [state.project.code, state.project.name, saved.mode, saved.fps.num, saved.fps.den]);
  const capture = { mode, fps: { num, den } };
  const valid = projectCodeValid(code) && captureSettingsValid(capture);
  const changed = code !== state.project.code || mode !== saved.mode || num !== saved.fps.num || den !== saved.fps.den;
  const ctl = "h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary";
  return <div data-testid="ptg-settings" className="flex flex-wrap items-end gap-3">
    <label className="flex flex-col gap-1 text-xs text-text-secondary">{t("ptg1.project-code")}
      <input data-testid="ptg-project-code" value={code} maxLength={32} disabled={!editable || disabled} onChange={e => setCode(e.target.value.toUpperCase())} className={ctl + " w-52"} aria-invalid={!projectCodeValid(code)} />
    </label>
    <label className="flex flex-col gap-1 text-xs text-text-secondary">{t("ptg1.capture-rate")}
      <select data-testid="ptg-capture-mode" className={ctl} value={mode} disabled={!editable || disabled} onChange={e => {
        const m = e.target.value as CaptureMode; setMode(m); if (m !== "custom") { setNum(m === "twos" ? 12 : 24); setDen(1); }
      }}><option value="ones">{t("ptg1.ones")}</option><option value="twos">{t("ptg1.twos")}</option><option value="custom">{t("ptg1.custom")}</option></select>
    </label>
    {mode === "custom" ? <>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">{t("ptg1.numerator")}<input data-testid="ptg-fps-num" type="number" value={num} min={1} max={120000} className={ctl + " w-24"} disabled={!editable || disabled} onChange={e => setNum(Number(e.target.value))} /></label>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">{t("ptg1.denominator")}<input data-testid="ptg-fps-den" type="number" value={den} min={1} max={10000} className={ctl + " w-24"} disabled={!editable || disabled} onChange={e => setDen(Number(e.target.value))} /></label>
    </> : null}
    {editable ? <Button size="sm" variant="outline" data-testid="ptg-save-settings" disabled={disabled || !changed || !valid} onClick={() => setError(cmds.run({ type: "SetInterchangeSettings", code, capture }, t("ptg1.save-settings")))}><Save />{t("ptg1.save-settings")}</Button> : null}
    {!valid || error ? <p role="alert" className="w-full text-xs text-status-danger">{error ?? t("ptg1.invalid-settings")}</p> : null}
  </div>;
}