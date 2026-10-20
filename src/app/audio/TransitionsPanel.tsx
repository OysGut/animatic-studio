/**
 * Overganger mellom takes (fase 2, bolk E, DEC-0096, REQ-0709): der to opptak møtes på dialogsporet kan skjøten
 * mykes opp med korte toninger og romlyd under skjøten. Romlyd fra ulike opptak antas ikke å være lik – brukeren
 * velger hvilket opptak (eller hvilken romlydfil) den hentes fra. Overgangen kan forhåndshøres.
 */
import { Play } from "lucide-react";
import { useState } from "react";
import { TRANSITION_MAX_FADE_MS, newId, setTransition, takeJoints, transitionAt, wholeFileCandidate, type AudioComposition, type ProjectState, type TakeJoint, type TransitionSettings } from "@/core";
import { Button } from "@/components/ui/button";
import { roomCandidates } from "./room-fill";
import { t } from "@/core/i18n/keyed";

const segId = () => newId<"audio_segment">();
const sec = (ms: number) => (ms / 1000).toFixed(2);

export function TransitionsPanel({
  state,
  comp,
  buffers,
  roomFiles,
  takeLabel,
  contextMs,
  onEdit,
  onPreview,
}: {
  state: ProjectState;
  comp: AudioComposition;
  buffers: ReadonlyMap<string, AudioBuffer> | null;
  roomFiles: readonly { versionId: string; label: string }[];
  takeLabel: (versionId: string) => string;
  contextMs: number;
  onEdit: (next: AudioComposition) => void;
  onPreview: (fromMs: number, toMs: number) => void;
}) {
  const joints = takeJoints(comp);
  if (joints.length === 0) return null;
  return (
    <details className="mt-3 border-t border-border pt-3" data-testid="audio-transitions" open>
      <summary className="cursor-pointer text-[13px] font-semibold text-text-primary">
        {t("app-audio-transitions-panel.transitions-panel.summary.5bda875e4e75", { length: String(joints.length) })}
      </summary>
      <p className="mt-1 text-[11px] text-text-tertiary">
        {t("app-audio-transitions-panel.transitions-panel.p.7c6c760284da")}
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {joints.map((j) => (
          <JointRow
            key={`${j.beforeId}-${j.afterId}`}
            j={j}
            state={state}
            comp={comp}
            buffers={buffers}
            roomFiles={roomFiles}
            takeLabel={takeLabel}
            contextMs={contextMs}
            onEdit={onEdit}
            onPreview={onPreview}
          />
        ))}
      </ul>
    </details>
  );
}

function JointRow({
  j,
  state,
  comp,
  buffers,
  roomFiles,
  takeLabel,
  contextMs,
  onEdit,
  onPreview,
}: {
  j: TakeJoint;
  state: ProjectState;
  comp: AudioComposition;
  buffers: ReadonlyMap<string, AudioBuffer> | null;
  roomFiles: readonly { versionId: string; label: string }[];
  takeLabel: (versionId: string) => string;
  contextMs: number;
  onEdit: (next: AudioComposition) => void;
  onPreview: (fromMs: number, toMs: number) => void;
}) {
  const cur = transitionAt(comp, j);
  const [fade, setFade] = useState(String(cur.fadeMs || 20));
  const [source, setSource] = useState<string>(cur.room?.versionId ?? j.afterVersionId);
  const [roomOn, setRoomOn] = useState(cur.room !== null);
  const [msg, setMsg] = useState<string | null>(null);

  function apply(next: { fadeMs: number; roomOn: boolean; source: string }) {
    setMsg(null);
    let room: TransitionSettings["room"] = null;
    if (next.roomOn) {
      const want = Math.max(200, next.fadeMs * 4);
      const isFile = roomFiles.some((f) => f.versionId === next.source);
      const v = state.assetVersions[next.source];
      const buf = buffers?.get(next.source);
      const list = isFile
        ? wholeFileCandidate(v?.durationMs ?? 0)
        : buf
          ? roomCandidates(buf, [])
          : [];
      const c = list[0];
      if (!c) {
        setMsg(
          t("app-audio-transitions-panel.apply.set-msg.f66e4a07eed5"),
        );
      } else
        room = {
          versionId: next.source,
          sourceInMs: c.startMs,
          lengthMs: Math.min(want, c.endMs - c.startMs),
        };
    }
    onEdit(setTransition(comp, j, { fadeMs: next.fadeMs, room }, segId));
  }

  const fadeMs = Math.max(0, Math.min(TRANSITION_MAX_FADE_MS, Number(fade) || 0));
  const sel =
    "h-7 rounded-sm border border-border-control bg-surface-3 px-1 text-xs text-text-primary";
  return (
    <li
      className="flex flex-wrap items-end gap-2 rounded-sm border border-border bg-surface-2 p-2 text-xs text-text-secondary"
      data-testid="audio-transition"
    >
      <span className="self-center text-text-primary">
        {t("app-audio-transitions-panel.joint-row.span.b7816432a068", { value1: String(sec(j.atMs)), value2: String(takeLabel(j.beforeVersionId)), value3: String(takeLabel(j.afterVersionId)) })}
      </span>
      <label className="flex flex-col gap-0.5">
        {t("app-audio-transitions-panel.joint-row.label.6abcbd23d78c")}
        <input
          value={fade}
          inputMode="numeric"
          onChange={(e) => setFade(e.target.value)}
          onBlur={() => apply({ fadeMs, roomOn, source })}
          onKeyDown={(e) => e.key === "Enter" && apply({ fadeMs, roomOn, source })}
          className={sel + " w-20 px-1.5"}
          data-testid="audio-transition-fade"
        />
      </label>
      <label className="flex items-center gap-1 self-center">
        <input
          type="checkbox"
          checked={roomOn}
          onChange={(e) => {
            setRoomOn(e.target.checked);
            apply({ fadeMs, roomOn: e.target.checked, source });
          }}
          data-testid="audio-transition-room"
        />
        {t("app-audio-transitions-panel.joint-row.label.0b7b57238aab")}
      </label>
      <label className="flex flex-col gap-0.5">
        {t("app-audio-transitions-panel.joint-row.label.909a747f1ca6")}
        <select
          value={source}
          disabled={!roomOn}
          onChange={(e) => {
            setSource(e.target.value);
            apply({ fadeMs, roomOn, source: e.target.value });
          }}
          className={sel}
          data-testid="audio-transition-source"
        >
          <option value={j.afterVersionId}>
            {t("app-audio-transitions-panel.joint-row.option.09f2dcf361a0", { value1: String(takeLabel(j.afterVersionId)) })}
          </option>
          <option value={j.beforeVersionId}>
            {t("app-audio-transitions-panel.joint-row.option.e9ae67f12bfc", { value1: String(takeLabel(j.beforeVersionId)) })}
          </option>
          {roomFiles.map((f) => (
            <option key={f.versionId} value={f.versionId}>
              {t("app-audio-transitions-panel.joint-row.option.3fe523094404", { label: String(f.label) })}
            </option>
          ))}
        </select>
      </label>
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          onPreview(
            Math.max(0, j.atMs - Math.max(contextMs, 500)),
            j.atMs + Math.max(contextMs, 500),
          )
        }
        data-testid="audio-transition-preview"
      >
        <Play className="size-3.5" aria-hidden />
        {t("app-audio-transitions-panel.joint-row.button.0f45557b0ed7")}
      </Button>
      {msg ? (
        <span className="basis-full text-accent-warm" role="status">
          {msg}
        </span>
      ) : null}
    </li>
  );
}
