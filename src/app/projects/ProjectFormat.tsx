/**
 * Bildeformat og bildefrekvens for hele prosjektet (DEC-0039). Alle scener bruker det samme;
 * en endring tilpasser alle 2D-scener (plassering, kamera og tider) og kan angres.
 */
import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { COMPOSITION_FORMATS, FRAME_RATES, sameFps, type ProjectState } from "@/core";
import { useCommands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";
import { InterchangeSettings } from "./InterchangeSettings";

const ctl =
  "h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary disabled:opacity-50";

export function ProjectFormat({
  state,
  projectId,
  userId,
  editable,
}: {
  state: ProjectState;
  projectId: string;
  userId: string;
  editable: boolean;
}) {
  const cmds = useCommands(projectId, userId, editable);
  const p = state.project;
  const [width, setWidth] = useState(p.frameWidth);
  const [height, setHeight] = useState(p.frameHeight);
  const [fpsIndex, setFpsIndex] = useState(() =>
    Math.max(
      0,
      FRAME_RATES.findIndex((r) => sameFps(r.fps, p.fps)),
    ),
  );
  const [err, setErr] = useState<string | null>(null);
  // Endringer utenfra (andre brukere, angre) vises når feltene ikke er endret her
  useEffect(() => {
    setWidth(p.frameWidth);
    setHeight(p.frameHeight);
    setFpsIndex(
      Math.max(
        0,
        FRAME_RATES.findIndex((r) => sameFps(r.fps, p.fps)),
      ),
    );
  }, [p.frameWidth, p.frameHeight, p.fps]);

  const preset = COMPOSITION_FORMATS.findIndex((f) => f.width === width && f.height === height);
  const fps = FRAME_RATES[fpsIndex]!.fps;
  const changed = width !== p.frameWidth || height !== p.frameHeight || !sameFps(fps, p.fps);
  const scenes = Object.values(state.compositions).filter((c) => !c.removed).length;
  const validSize = (n: number) => Number.isInteger(n) && n >= 16 && n <= 16384;

  function apply() {
    if (!validSize(width) || !validSize(height)) {
      setErr(
        t("app-projects-project-format.apply.set-err.eb874e528d22"),
      );
      return;
    }
    setErr(
      cmds.run(
        { type: "SetProjectFormat", width, height, fps },
        t("app-projects-project-format.apply.cmds-run.64c007da8319"),
      ),
    );
  }

  return (
    <section aria-labelledby="format-title" className="mt-8">
      <div className="mb-2 flex items-center gap-2">
        <h2 id="format-title" className="text-base font-semibold text-text-primary">
          {t("app-projects-project-format.project-format.h2.423e3164e1ea")}
        </h2>
        {editable ? (
          <span className="ml-auto flex">
            <Button
              size="sm"
              variant="ghost"
              onClick={cmds.undo}
              disabled={!cmds.canUndo}
              aria-label={
                cmds.undoLabel
                  ? t("app-projects-project-format.project-format.aria-label.7cab821dc958", { undoLabel: String(cmds.undoLabel) })
                  : t("app-projects-project-format.project-format.aria-label.80c798f58696")
              }
              title={
                cmds.undoLabel
                  ? t("app-projects-project-format.project-format.title.7cab821dc958", { undoLabel: String(cmds.undoLabel) })
                  : t("app-projects-project-format.project-format.title.80c798f58696")
              }
            >
              <Undo2 />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={cmds.redo}
              disabled={!cmds.canRedo}
              aria-label={
                cmds.redoLabel
                  ? t("app-projects-project-format.project-format.aria-label.bd9ba28e5ca5", { redoLabel: String(cmds.redoLabel) })
                  : t("app-projects-project-format.project-format.aria-label.6f5176579e90")
              }
              title={
                cmds.redoLabel
                  ? t("app-projects-project-format.project-format.title.bd9ba28e5ca5", { redoLabel: String(cmds.redoLabel) })
                  : t("app-projects-project-format.project-format.title.6f5176579e90")
              }
            >
              <Redo2 />
            </Button>
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 border border-border bg-surface-1 p-4">
        <p className="text-[13px] text-text-secondary">
          {t("app-projects-project-format.project-format.p.6883f3682c39")}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("app-projects-project-format.project-format.label.3a661dd47897")}
            <select
              className={ctl}
              disabled={!editable}
              value={preset < 0 ? "custom" : String(preset)}
              onChange={(e) => {
                const f = COMPOSITION_FORMATS[Number(e.target.value)];
                if (!f) return;
                setWidth(f.width);
                setHeight(f.height);
              }}
            >
              {COMPOSITION_FORMATS.map((f, i) => (
                <option key={f.label} value={i}>
                  {f.label}
                </option>
              ))}
              <option value="custom">{t("app-projects-project-format.project-format.option.86ba15a5ea61")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("app-projects-project-format.project-format.label.73444978f6aa")}
            <input
              type="number"
              className={ctl + " w-24"}
              disabled={!editable}
              min={16}
              max={16384}
              value={width}
              onChange={(e) => setWidth(Math.round(Number(e.target.value)))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("app-projects-project-format.project-format.label.b894d518d0e7")}
            <input
              type="number"
              className={ctl + " w-24"}
              disabled={!editable}
              min={16}
              max={16384}
              value={height}
              onChange={(e) => setHeight(Math.round(Number(e.target.value)))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("app-projects-project-format.project-format.label.a68cae0d2bd2")}
            <select
              className={ctl}
              disabled={!editable}
              value={fpsIndex}
              onChange={(e) => setFpsIndex(Number(e.target.value))}
            >
              {FRAME_RATES.map((r, i) => (
                <option key={r.label} value={i}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {editable ? (
            <Button onClick={apply} disabled={!changed}>
              {t("app-projects-project-format.project-format.button.60ca46216cca")}
            </Button>
          ) : null}
        </div>
        {changed && scenes > 0 ? (
          <p className="text-xs text-status-uncertain">
            {scenes === 1
              ? t("app-projects-project-format.project-format.p.a1048613d0c6")
              : t("app-projects-project-format.project-format.p.3ccc868a7b52", { scenes: String(scenes) })}{" "}
            {t("app-projects-project-format.project-format.p.180e72ac6416")}
          </p>
        ) : null}
        {err ? (
          <p role="alert" className="text-xs text-status-danger">
            {err}
          </p>
        ) : null}
        <InterchangeSettings state={state} userId={userId} editable={editable} />
      </div>
    </section>
  );
}
