/**
 * Egenskaper for valgt kamerautsnitt (mandat kap. 12): navn, tid, hastighetskurve, start- og sluttramme og bane.
 * Hver endring er én UpdateComposition (alle komposisjonsfelt + nytt kamera) som kan angres.
 */
import { useRef, useState, type ReactNode } from "react";
import {
  EASINGS,
  fullFrameCamera,
  framesToSeconds,
  secondsToFrames,
  toggleCurve,
  withShot,
  withoutShot,
  type CameraFrame,
  type CameraShot,
  type Command,
  type Composition,
  type Easing,
  type Rational,
} from "@/core";
import { Button } from "@/components/ui/button";
import { L, localized } from "@/core";
import { updateCameraCommand, MAX_CAMERA_ZOOM, MIN_CAMERA_ZOOM } from "./camera-overlay";

interface CameraPanelProps {
  /** Utsnittet på slutten av scenen før, for «Bruk aktivt utsnitt». */
  previousFrame: CameraFrame | null;
  composition: Composition;
  shot: CameraShot;
  durationFrames: number;
  fps: Rational;
  editable: boolean;
  run: (c: Command, label: string) => string | null;
  onRemoved: () => void;
}

const EASING_LABEL: Record<Easing, string> = localized({
  linear: ["Jevn", "Even"],
  "ease-in": ["Myk start", "Ease in"],
  "ease-out": ["Myk slutt", "Ease out"],
  "ease-in-out": ["Myk start og slutt", "Ease in and out"],
  hold: ["Hold", "Hold"],
});

const inputClass =
  "h-7 w-full min-w-0 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary placeholder:text-text-tertiary disabled:cursor-not-allowed disabled:opacity-50";
const fmt = (n: number) => String(Math.round(n * 100) / 100);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="-mx-3 mb-1.5 flex h-8 shrink-0 items-center border-b border-border bg-surface-2 px-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-text-secondary">
      {label}
      {children}
    </label>
  );
}

/** Felt som lagres ved blur eller Enter; Esc forkaster (blur kjører synkront etter Esc, derav flagget). */
function useDraft(commitText: (text: string) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  return {
    draft,
    handlers: {
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
      onBlur: () => {
        const text = draft;
        setDraft(null);
        if (cancelled.current) {
          cancelled.current = false;
          return;
        }
        if (text !== null) commitText(text);
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          cancelled.current = true;
          setDraft(null);
          e.currentTarget.blur();
        }
      },
    },
    start: (v: string) => {
      cancelled.current = false;
      setDraft(v);
    },
  };
}

function TextField({
  label,
  value,
  onCommit,
  disabled,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  disabled: boolean;
}) {
  const d = useDraft((t) => {
    if (t.trim() !== value) onCommit(t.trim());
  });
  return (
    <Field label={label}>
      <input
        type="text"
        value={d.draft ?? value}
        disabled={disabled}
        maxLength={200}
        placeholder={L("Uten navn", "Untitled")}
        onFocus={() => d.start(value)}
        {...d.handlers}
        className={inputClass}
      />
    </Field>
  );
}

function NumberField({
  label,
  value,
  onCommit,
  disabled,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  disabled: boolean;
  step?: number;
  hint?: string;
}) {
  const d = useDraft((t) => {
    const n = Number(t.trim().replace(",", "."));
    if (t.trim() === "" || !Number.isFinite(n) || fmt(n) === fmt(value)) return;
    onCommit(n);
  });
  return (
    <Field label={label}>
      <input
        type="number"
        inputMode="decimal"
        value={d.draft ?? fmt(value)}
        disabled={disabled}
        step={step}
        onFocus={() => d.start(fmt(value))}
        {...d.handlers}
        className={inputClass}
      />
      {hint ? <span className="text-text-tertiary">{hint}</span> : null}
    </Field>
  );
}

function FrameSection({
  title,
  frame,
  disabled,
  onChange,
  onFull,
  previous,
}: {
  title: string;
  frame: CameraFrame;
  disabled: boolean;
  onChange: (f: CameraFrame) => string | null;
  onFull: () => void;
  /** Utsnittet på slutten av scenen før (null: ingen scene før med 2D-scene). */
  previous: CameraFrame | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<CameraFrame>) => setError(onChange({ ...frame, ...patch }));
  const setZoom = (pct: number) => {
    const zoom = pct / 100;
    if (zoom < MIN_CAMERA_ZOOM || zoom > MAX_CAMERA_ZOOM)
      return setError(
        L(
          `Zoom må være mellom ${MIN_CAMERA_ZOOM * 100} og ${MAX_CAMERA_ZOOM * 100} %`,
          `Zoom must be between ${MIN_CAMERA_ZOOM * 100} and ${MAX_CAMERA_ZOOM * 100} %`,
        ),
      );
    set({ zoom });
  };
  return (
    <Section title={title}>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={frame.x} disabled={disabled} onCommit={(x) => set({ x })} />
        <NumberField label="Y" value={frame.y} disabled={disabled} onCommit={(y) => set({ y })} />
        <NumberField
          label="Zoom (%)"
          value={frame.zoom * 100}
          disabled={disabled}
          onCommit={setZoom}
        />
        <NumberField
          label={L("Rotasjon (°)", "Rotation (°)")}
          value={frame.rotation}
          disabled={disabled}
          onCommit={(rotation) => set({ rotation })}
        />
      </div>
      <p className="text-xs text-text-tertiary">
        {L("100 % = hele formatet", "100 % = the whole frame")}
      </p>
      {error ? (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" disabled={disabled} onClick={onFull}>
          {L("Hele formatet", "Whole frame")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || !previous}
          onClick={() => previous && setError(onChange(previous))}
          title={
            previous
              ? L(
                  "Kopier utsnittet kameraet har når scenen før slutter",
                  "Copy the shot the camera has when the previous scene ends",
                )
              : L(
                  "Scenen før har ingen 2D-scene (eller dette er første scene)",
                  "The previous scene has no 2D scene (or this is the first scene)",
                )
          }
        >
          {L("Bruk aktivt utsnitt", "Use active shot")}
        </Button>
      </div>
    </Section>
  );
}

export function CameraPanel({
  previousFrame,
  composition,
  shot,
  durationFrames,
  fps,
  editable,
  run,
  onRemoved,
}: CameraPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const disabled = !editable;
  const lastFrame = Math.max(0, durationFrames - 1);

  /** Lagrer utsnittet; returnerer feilmeldingen (eller null). */
  function commit(next: CameraShot, label: string): string | null {
    const err = run(updateCameraCommand(composition, withShot(composition.camera, next)), label);
    setError(err);
    return err;
  }

  function setTime(which: "startFrame" | "endFrame", seconds: number) {
    const frame = secondsToFrames(seconds, fps);
    if (frame < 0 || frame > lastFrame)
      return setError(
        L(
          `Tiden må være mellom 0 og ${fmt(framesToSeconds(lastFrame, fps))} sekunder`,
          `The time must be between 0 and ${fmt(framesToSeconds(lastFrame, fps))} seconds`,
        ),
      );
    const next = { ...shot, [which]: frame };
    if (next.endFrame < next.startFrame)
      return setError(
        L(
          "Kamerautsnittet må slutte etter at det starter",
          "The camera shot must end after it starts",
        ),
      );
    commit(
      next,
      which === "startFrame"
        ? L("Endre start for kamerautsnitt", "Change start of camera shot")
        : L("Endre slutt for kamerautsnitt", "Change end of camera shot"),
    );
  }

  function swap() {
    const c = shot.curve;
    commit(
      {
        ...shot,
        from: shot.to,
        to: shot.from,
        curve: c ? { c1x: c.c2x, c1y: c.c2y, c2x: c.c1x, c2y: c.c1y } : null,
      },
      L("Bytt start og slutt", "Swap start and end"),
    );
  }

  function remove() {
    const err = run(
      updateCameraCommand(composition, withoutShot(composition.camera, shot.id)),
      L("Slett kamerautsnitt", "Delete camera shot"),
    );
    setError(err);
    if (!err) onRemoved();
  }

  const curved = shot.curve !== null;
  return (
    <div className="p-3">
      <h2 className="-mx-3 mb-3 flex h-8 shrink-0 items-center border-b border-border bg-surface-2 px-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
        {L("Kamerautsnitt", "Camera shot")}
      </h2>
      {error ? (
        <p role="alert" className="mb-3 text-xs text-status-danger">
          {error}
        </p>
      ) : null}
      <Section title={L("Kamerautsnitt", "Camera shot")}>
        <TextField
          label={L("Navn", "Name")}
          value={shot.name}
          disabled={disabled}
          onCommit={(name) =>
            commit({ ...shot, name }, L("Gi kamerautsnitt navn", "Name the camera shot"))
          }
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={L("Start (s)", "Start (s)")}
            value={framesToSeconds(shot.startFrame, fps)}
            step={0.04}
            disabled={disabled}
            hint={L(`bilde ${shot.startFrame}`, `frame ${shot.startFrame}`)}
            onCommit={(s) => setTime("startFrame", s)}
          />
          <NumberField
            label={L("Slutt (s)", "End (s)")}
            value={framesToSeconds(shot.endFrame, fps)}
            step={0.04}
            disabled={disabled}
            hint={L(`bilde ${shot.endFrame}`, `frame ${shot.endFrame}`)}
            onCommit={(s) => setTime("endFrame", s)}
          />
        </div>
        <Field label={L("Hastighet", "Speed")}>
          <select
            value={shot.easing}
            disabled={disabled}
            onChange={(e) =>
              commit(
                { ...shot, easing: e.target.value as Easing },
                L("Endre hastighetskurve", "Change speed curve"),
              )
            }
            className={inputClass}
          >
            {EASINGS.map((e) => (
              <option key={e} value={e}>
                {EASING_LABEL[e]}
              </option>
            ))}
          </select>
        </Field>
      </Section>
      <FrameSection
        title={L("Startramme (blå)", "Start frame (blue)")}
        frame={shot.from}
        disabled={disabled}
        onChange={(from) => commit({ ...shot, from }, L("Endre startramme", "Change start frame"))}
        previous={previousFrame}
        onFull={() =>
          commit(
            { ...shot, from: fullFrameCamera(composition) },
            L("Startramme: hele formatet", "Start frame: whole frame"),
          )
        }
      />
      <FrameSection
        title={L("Sluttramme (rød)", "End frame (red)")}
        frame={shot.to}
        disabled={disabled}
        onChange={(to) => commit({ ...shot, to }, L("Endre sluttramme", "Change end frame"))}
        previous={previousFrame}
        onFull={() =>
          commit(
            { ...shot, to: fullFrameCamera(composition) },
            L("Sluttramme: hele formatet", "End frame: whole frame"),
          )
        }
      />
      <Section title={L("Bane", "Path")}>
        <div role="group" aria-label={L("Banetype", "Path type")} className="flex gap-1">
          {(
            [
              [L("Rett", "Straight"), false],
              [L("Kurvet", "Curved"), true],
            ] as const
          ).map(([text, isCurve]) => (
            <Button
              key={text}
              size="sm"
              variant={curved === isCurve ? "secondary" : "ghost"}
              aria-pressed={curved === isCurve}
              disabled={disabled}
              onClick={() => {
                if (curved !== isCurve)
                  commit(
                    toggleCurve(shot),
                    isCurve
                      ? L("Kurvet kamerabane", "Curved camera path")
                      : L("Rett kamerabane", "Straight camera path"),
                  );
              }}
            >
              {text}
            </Button>
          ))}
        </div>
        <p className="text-xs text-text-tertiary">
          {L(
            "Dra i håndtakene på banen i scenen, eller dobbeltklikk banen for å bytte.",
            "Drag the handles on the path in the scene, or double-click the path to switch.",
          )}
        </p>
      </Section>
      <div className="flex flex-col items-start gap-1">
        <Button size="sm" variant="ghost" disabled={disabled} onClick={swap}>
          {L("Bytt start og slutt", "Swap start and end")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={remove}
          className="text-status-danger"
        >
          {L("Slett kamerautsnitt", "Delete camera shot")}
        </Button>
      </div>
    </div>
  );
}
