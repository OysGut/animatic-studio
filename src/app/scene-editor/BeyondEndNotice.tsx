/**
 * Varsel i sceneeditoren (KI-44): nøkkelbilder eller kamerautsnitt ligger etter scenens slutt, typisk etter at
 * scenen ble kortet ned. Ingenting slettes: brukeren kan vise og velge dem, eller forlenge scenen igjen
 * (én angrebar kommando).
 */
import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import {
  L,
  MAX_DURATION_SECONDS,
  framesToSeconds,
  locale,
  secondsToFrames,
  type Command,
  type Composition,
  type ProjectState,
} from "@/core";
import { Button } from "@/components/ui/button";
import { beyondEnd } from "./beyond-end";
import { compositionFieldsOf } from "./timeline-helpers";

type Run = (command: Command, label: string) => string | null;

const s = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function BeyondEndNotice({
  state,
  composition,
  durationFrames,
  editable,
  run,
  onSelectLayer,
  onSelectShot,
  onSeek,
}: {
  state: ProjectState;
  composition: Composition;
  durationFrames: number;
  editable: boolean;
  run: Run;
  onSelectLayer: (id: string) => void;
  onSelectShot: (id: string) => void;
  onSeek: (frame: number) => void;
}) {
  const found = useMemo(
    () => beyondEnd(state, composition, durationFrames),
    [state, composition, durationFrames],
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (found.keyframeCount === 0 && found.shots.length === 0) return null;
  const fps = state.project.fps;
  const sec = (f: number) =>
    `${(Math.round(framesToSeconds(f, fps) * 10) / 10).toLocaleString(locale())} s`;
  const and = L(" og ", " and ");
  const parts: string[] = [];
  if (found.keyframeCount)
    parts.push(
      s(found.keyframeCount, L("nøkkelbilde", "keyframe"), L("nøkkelbilder", "keyframes")),
    );
  if (found.shots.length)
    parts.push(
      s(found.shots.length, L("kamerautsnitt", "camera shot"), L("kamerautsnitt", "camera shots")),
    );
  const last = Math.max(0, durationFrames - 1);
  const needed = Math.min(found.maxFrame + 1, secondsToFrames(MAX_DURATION_SECONDS, fps));

  function extend() {
    setError(
      run(
        {
          type: "UpdateComposition",
          compositionId: composition.id,
          fields: { ...compositionFieldsOf(composition), durationFrames: needed },
        },
        L("Forleng scenen", "Extend the scene"),
      ),
    );
  }

  return (
    <div
      role="status"
      data-testid="beyond-end-notice"
      className="shrink-0 border-b border-status-uncertain/40 bg-surface-2 px-3 py-1 text-xs text-text-primary"
    >
      <div className="flex min-h-6 flex-wrap items-center gap-2">
        <AlertTriangle className="size-3.5 text-status-uncertain" aria-hidden />
        <span>
          {parts.join(and)} {L("ligger etter scenens slutt", "are past the end of the scene")} (
          {sec(durationFrames)}) {L("og vises ikke.", "and are not shown.")}{" "}
          {L("Ingenting er slettet.", "Nothing has been deleted.")}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? L("Skjul liste", "Hide list") : L("Vis og velg …", "Show and choose …")}
        </Button>
        {editable ? (
          <Button size="sm" variant="ghost" className="h-6" onClick={extend}>
            {L("Forleng scenen til", "Extend the scene to")} {sec(needed)}
          </Button>
        ) : null}
        {error ? <span className="text-status-danger">{error}</span> : null}
      </div>
      {open ? (
        <ul
          className="mb-1 mt-1 flex flex-col gap-0.5 pl-5"
          aria-label={L("Etter scenens slutt", "After the end of the scene")}
        >
          {found.layers.map((l) => (
            <li key={l.layerId} className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-sm px-1 text-left underline-offset-2 hover:bg-surface-3 hover:underline"
                onClick={() => {
                  onSelectLayer(l.layerId);
                  onSeek(last);
                }}
              >
                {L(`Lag «${l.name}»`, `Layer “${l.name}”`)}
              </button>
              <span className="text-text-tertiary">
                {s(l.frames.length, L("nøkkelbilde", "keyframe"), L("nøkkelbilder", "keyframes"))}{" "}
                {L("ved", "at")}{" "}
                {l.frames
                  .slice(0, 4)
                  .map((f) => sec(f))
                  .join(", ")}
                {l.frames.length > 4 ? " …" : ""}
              </span>
            </li>
          ))}
          {found.shots.map((sh) => (
            <li key={sh.shotId} className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-sm px-1 text-left underline-offset-2 hover:bg-surface-3 hover:underline"
                onClick={() => {
                  onSelectShot(sh.shotId);
                  onSeek(Math.min(sh.startFrame, last));
                }}
              >
                {L(`Kamerautsnitt «${sh.name}»`, `Camera shot “${sh.name}”`)}
              </button>
              <span className="text-text-tertiary">
                {sec(sh.startFrame)}–{sec(sh.endFrame)}
                {sh.entirely
                  ? L(" (helt etter slutten)", " (entirely after the end)")
                  : L(" (går forbi slutten)", " (runs past the end)")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
