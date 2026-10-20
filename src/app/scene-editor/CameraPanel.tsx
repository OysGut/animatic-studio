/**
 * Egenskaper for valgt kamerautsnitt (mandat kap. 12): navn, tid, hastighetskurve, start- og sluttramme og bane.
 * Hver endring er én UpdateComposition (alle komposisjonsfelt + nytt kamera) som kan angres.
 */
import { PanelHeader } from "@/app/shell/workspace-chrome";
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

import { updateCameraCommand, MAX_CAMERA_ZOOM, MIN_CAMERA_ZOOM } from "./camera-overlay";
import { t as tk, tLocalized } from "@/core/i18n/keyed";

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

const EASING_LABEL: Record<Easing, string> = tLocalized({ linear: "app-scene-editor-camera-panel.easing-label.linear.d1801edccdef", "ease-in": "app-scene-editor-camera-panel.easing-label.ease-in.2d772dc3edfd", "ease-out": "app-scene-editor-camera-panel.easing-label.ease-out.986bfc35b6a4", "ease-in-out": "app-scene-editor-camera-panel.easing-label.ease-in-out.9c97cd151cac", hold: "app-scene-editor-camera-panel.easing-label.hold.d4076f411bb6" });

const inputClass =
  "h-7 w-full min-w-0 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary placeholder:text-text-tertiary disabled:cursor-not-allowed disabled:opacity-50";
const fmt = (n: number) => String(Math.round(n * 100) / 100);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <PanelHeader as="h3" className="-mx-3 mb-1.5" title={title} />
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
        placeholder={tk("app-scene-editor-camera-panel.text-field.placeholder.437b384b9d4c")}
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
        tk("app-scene-editor-camera-panel.set-zoom.set-error.5d886ddbfb36", { value1: String(MIN_CAMERA_ZOOM * 100), value2: String(MAX_CAMERA_ZOOM * 100) }),
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
          label={tk("app-scene-editor-camera-panel.frame-section.label.f915a28d629d")}
          value={frame.rotation}
          disabled={disabled}
          onCommit={(rotation) => set({ rotation })}
        />
      </div>
      <p className="text-xs text-text-tertiary">
        {tk("app-scene-editor-camera-panel.frame-section.p.15d0963ddcb1")}
      </p>
      {error ? (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" disabled={disabled} onClick={onFull}>
          {tk("app-scene-editor-camera-panel.frame-section.button.d3a8d9c07721")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || !previous}
          onClick={() => previous && setError(onChange(previous))}
          title={
            previous
              ? tk("app-scene-editor-camera-panel.frame-section.title.ece6881754b4")
              : tk("app-scene-editor-camera-panel.frame-section.title.010254f47a92")
          }
        >
          {tk("app-scene-editor-camera-panel.frame-section.button.9d40e6d84771")}
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
        tk("app-scene-editor-camera-panel.set-time.set-error.84ba143006e8", { value1: String(fmt(framesToSeconds(lastFrame, fps))) }),
      );
    const next = { ...shot, [which]: frame };
    if (next.endFrame < next.startFrame)
      return setError(
        tk("app-scene-editor-camera-panel.set-time.set-error.443f652b4062"),
      );
    commit(
      next,
      which === "startFrame"
        ? tk("app-scene-editor-camera-panel.set-time.commit.4cdf540ca878")
        : tk("app-scene-editor-camera-panel.set-time.commit.0b87d33d21f7"),
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
      tk("app-scene-editor-camera-panel.swap.commit.7edc096b02dc"),
    );
  }

  function remove() {
    const err = run(
      updateCameraCommand(composition, withoutShot(composition.camera, shot.id)),
      tk("app-scene-editor-camera-panel.err.run.adf0569d05a8"),
    );
    setError(err);
    if (!err) onRemoved();
  }

  const curved = shot.curve !== null;
  return (
    <div className="p-3">
      <PanelHeader as="h2" className="-mx-3 mb-3" title={tk("app-scene-editor-camera-panel.camera-panel.title.ae8a26378eba")} />
      {error ? (
        <p role="alert" className="mb-3 text-xs text-status-danger">
          {error}
        </p>
      ) : null}
      <Section title={tk("app-scene-editor-camera-panel.camera-panel.title.ae8a26378eba.2")}>
        <TextField
          label={tk("app-scene-editor-camera-panel.camera-panel.label.0c3de49bba56")}
          value={shot.name}
          disabled={disabled}
          onCommit={(name) =>
            commit({ ...shot, name }, tk("app-scene-editor-camera-panel.camera-panel.commit.61abfdb6eab7"))
          }
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={tk("app-scene-editor-camera-panel.camera-panel.label.65af20133200")}
            value={framesToSeconds(shot.startFrame, fps)}
            step={0.04}
            disabled={disabled}
            hint={tk("app-scene-editor-camera-panel.camera-panel.hint.6a17c12a763b", { startFrame: String(shot.startFrame) })}
            onCommit={(s) => setTime("startFrame", s)}
          />
          <NumberField
            label={tk("app-scene-editor-camera-panel.camera-panel.label.5355707172e2")}
            value={framesToSeconds(shot.endFrame, fps)}
            step={0.04}
            disabled={disabled}
            hint={tk("app-scene-editor-camera-panel.camera-panel.hint.7700d092bd65", { endFrame: String(shot.endFrame) })}
            onCommit={(s) => setTime("endFrame", s)}
          />
        </div>
        <Field label={tk("app-scene-editor-camera-panel.camera-panel.label.706f10d86d7a")}>
          <select
            value={shot.easing}
            disabled={disabled}
            onChange={(e) =>
              commit(
                { ...shot, easing: e.target.value as Easing },
                tk("app-scene-editor-camera-panel.camera-panel.commit.54213bdbc4e7"),
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
        title={tk("app-scene-editor-camera-panel.camera-panel.title.41b97ecad091")}
        frame={shot.from}
        disabled={disabled}
        onChange={(from) => commit({ ...shot, from }, tk("app-scene-editor-camera-panel.camera-panel.commit.a8ec73cd9d3e"))}
        previous={previousFrame}
        onFull={() =>
          commit(
            { ...shot, from: fullFrameCamera(composition) },
            tk("app-scene-editor-camera-panel.camera-panel.commit.6ece8fe0473a"),
          )
        }
      />
      <FrameSection
        title={tk("app-scene-editor-camera-panel.camera-panel.title.ef9ac716d58f")}
        frame={shot.to}
        disabled={disabled}
        onChange={(to) => commit({ ...shot, to }, tk("app-scene-editor-camera-panel.camera-panel.commit.72a9f73fc228"))}
        previous={previousFrame}
        onFull={() =>
          commit(
            { ...shot, to: fullFrameCamera(composition) },
            tk("app-scene-editor-camera-panel.camera-panel.commit.9bcc7535c472"),
          )
        }
      />
      <Section title={tk("app-scene-editor-camera-panel.camera-panel.title.6b59d9bb269e")}>
        <div role="group" aria-label={tk("app-scene-editor-camera-panel.camera-panel.aria-label.c8ff09f56ac3")} className="flex gap-1">
          {(
            [
              [tk("app-scene-editor-camera-panel.camera-panel.l-rett-straight-false-l-kurvet-curved-true-as-const-map.b0447116557b"), false],
              [tk("app-scene-editor-camera-panel.camera-panel.l-rett-straight-false-l-kurvet-curved-true-as-const-map.cc04a45e5b01"), true],
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
                      ? tk("app-scene-editor-camera-panel.camera-panel.commit.3d2a541d33db")
                      : tk("app-scene-editor-camera-panel.camera-panel.commit.3750a798925f"),
                  );
              }}
            >
              {text}
            </Button>
          ))}
        </div>
        <p className="text-xs text-text-tertiary">
          {tk("app-scene-editor-camera-panel.camera-panel.p.659aa1ab524c")}
        </p>
      </Section>
      <div className="flex flex-col items-start gap-1">
        <Button size="sm" variant="ghost" disabled={disabled} onClick={swap}>
          {tk("app-scene-editor-camera-panel.camera-panel.button.de1042f70af0")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={remove}
          className="text-status-danger"
        >
          {tk("app-scene-editor-camera-panel.camera-panel.button.1c6dd1e00aca")}
        </Button>
      </div>
    </div>
  );
}
