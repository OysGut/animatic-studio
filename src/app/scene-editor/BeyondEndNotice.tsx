/**
 * Varsel i sceneeditoren (KI-44): nøkkelbilder eller kamerautsnitt ligger etter scenens slutt, typisk etter at
 * scenen ble kortet ned. Ingenting slettes: brukeren kan vise og velge dem, eller forlenge scenen igjen
 * (én angrebar kommando).
 */
import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { MAX_DURATION_SECONDS, framesToSeconds, locale, secondsToFrames, type Command, type Composition, type ProjectState } from "@/core";
import { Button } from "@/components/ui/button";
import { beyondEnd } from "./beyond-end";
import { compositionFieldsOf } from "./timeline-helpers";
import { t } from "@/core/i18n/keyed";

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
  onExtend,
}: {
  state: ProjectState;
  composition: Composition;
  durationFrames: number;
  editable: boolean;
  run: Run;
  onSelectLayer: (id: string) => void;
  onSelectShot: (id: string) => void;
  onSeek: (frame: number) => void;
  /** B-100: åpne endring av scenevarighet (B-041) med foreslått lengde i stedet for å forlenge direkte. */
  onExtend?: ((neededFrames: number) => void) | undefined;
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
  const and = t("app-scene-editor-beyond-end-notice.and.message.a0667ea2c151");
  const parts: string[] = [];
  if (found.keyframeCount)
    parts.push(
      s(found.keyframeCount, t("app-scene-editor-beyond-end-notice.beyond-end-notice.s.98a2f777b8fc"), t("app-scene-editor-beyond-end-notice.beyond-end-notice.s.16d558dbbee5")),
    );
  if (found.shots.length)
    parts.push(
      s(found.shots.length, t("app-scene-editor-beyond-end-notice.beyond-end-notice.s.aeca7434adbc"), t("app-scene-editor-beyond-end-notice.beyond-end-notice.s.acb81085b252")),
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
        t("app-scene-editor-beyond-end-notice.extend.run.be5a1b7adc89"),
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
          {parts.join(and)} {t("app-scene-editor-beyond-end-notice.beyond-end-notice.span.f6dd4c364f3f")} (
          {sec(durationFrames)}) {t("app-scene-editor-beyond-end-notice.beyond-end-notice.span.44687372e49e")}{" "}
          {t("app-scene-editor-beyond-end-notice.beyond-end-notice.span.b087a24c7696")}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? t("app-scene-editor-beyond-end-notice.beyond-end-notice.button.d2597bb887f9") : t("app-scene-editor-beyond-end-notice.beyond-end-notice.button.c90e2ec62c85")}
        </Button>
        {editable && onExtend ? (
          <Button size="sm" variant="ghost" className="h-6" data-testid="beyond-end-extend" onClick={() => onExtend(needed)}>
            {t("b100.beyond.extend")}
          </Button>
        ) : editable ? (
          <Button size="sm" variant="ghost" className="h-6" onClick={extend}>
            {t("app-scene-editor-beyond-end-notice.beyond-end-notice.button.3198a54fbb13")} {sec(needed)}
          </Button>
        ) : null}
        {error ? <span className="text-status-danger">{error}</span> : null}
      </div>
      {open ? (
        <ul
          className="mb-1 mt-1 flex flex-col gap-0.5 pl-5"
          aria-label={t("app-scene-editor-beyond-end-notice.beyond-end-notice.aria-label.cb2a59a3eac2")}
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
                {t("app-scene-editor-beyond-end-notice.beyond-end-notice.button.4a3c5f9e2955", { name: String(l.name) })}
              </button>
              <span className="text-text-tertiary">
                {s(l.frames.length, t("app-scene-editor-beyond-end-notice.beyond-end-notice.s.98a2f777b8fc.2"), t("app-scene-editor-beyond-end-notice.beyond-end-notice.s.16d558dbbee5.2"))}{" "}
                {t("app-scene-editor-beyond-end-notice.beyond-end-notice.span.c9ddeeca9650")}{" "}
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
                {t("app-scene-editor-beyond-end-notice.beyond-end-notice.button.a3137824c3e7", { name: String(sh.name) })}
              </button>
              <span className="text-text-tertiary">
                {sec(sh.startFrame)}–{sec(sh.endFrame)}
                {sh.entirely
                  ? t("app-scene-editor-beyond-end-notice.beyond-end-notice.span.d487d1e71169")
                  : t("app-scene-editor-beyond-end-notice.beyond-end-notice.span.030acac20ee6")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
