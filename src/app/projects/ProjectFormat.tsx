/**
 * Bildeformat og bildefrekvens for hele prosjektet (DEC-0039). Alle scener bruker det samme;
 * en endring tilpasser alle 2D-scener (plassering, kamera og tider) og kan angres.
 */
import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { COMPOSITION_FORMATS, FRAME_RATES, sameFps, type ProjectState } from "@/core";
import { useCommands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";

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
      setErr("Bredde og høyde må være hele tall mellom 16 og 16384.");
      return;
    }
    setErr(cmds.run({ type: "SetProjectFormat", width, height, fps }, "Endre prosjektets format"));
  }

  return (
    <section aria-labelledby="format-title" className="mt-8">
      <div className="mb-2 flex items-center gap-2">
        <h2 id="format-title" className="text-base font-semibold text-text-primary">
          Bildeformat og bildefrekvens
        </h2>
        {editable ? (
          <span className="ml-auto flex">
            <Button
              size="sm"
              variant="ghost"
              onClick={cmds.undo}
              disabled={!cmds.canUndo}
              aria-label={cmds.undoLabel ? `Angre: ${cmds.undoLabel}` : "Angre"}
              title={cmds.undoLabel ? `Angre: ${cmds.undoLabel}` : "Angre"}
            >
              <Undo2 />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={cmds.redo}
              disabled={!cmds.canRedo}
              aria-label={cmds.redoLabel ? `Gjør om: ${cmds.redoLabel}` : "Gjør om"}
              title={cmds.redoLabel ? `Gjør om: ${cmds.redoLabel}` : "Gjør om"}
            >
              <Redo2 />
            </Button>
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 border border-border bg-surface-1 p-4">
        <p className="text-[13px] text-text-secondary">
          Gjelder hele prosjektet: alle scener i sceneeditoren, avspilling og eksport.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Bildeformat
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
              <option value="custom">Egendefinert</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Bredde (px)
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
            Høyde (px)
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
            Bilder per sekund
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
              Bruk
            </Button>
          ) : null}
        </div>
        {changed && scenes > 0 ? (
          <p className="text-xs text-status-uncertain">
            {scenes === 1 ? "Én 2D-scene" : `${scenes} 2D-scener`} blir tilpasset: plassering og
            kamera skaleres slik at høyden i bildet beholdes og midten står fast, og nøkkelbilder og
            kamerautsnitt regnes om til ny bildefrekvens. Kan angres.
          </p>
        ) : null}
        {err ? (
          <p role="alert" className="text-xs text-status-danger">
            {err}
          </p>
        ) : null}
      </div>
    </section>
  );
}
