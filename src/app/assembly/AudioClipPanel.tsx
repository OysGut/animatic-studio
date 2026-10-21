/**
 * Panelet for et valgt lydklipp (M4 del 2, mandat 13.3, DEC-0044): navn, spor, lydfil og versjon, plass i
 * scenen, lengde og kutt, volum, inn-/uttoning, replikk og demping.
 */
import type { Commands } from "@/app/project/use-commands";
import { TakesMicButton } from "@/app/audio/AudioTakesDialog";
import { Link } from "@tanstack/react-router";
import { AudioWaveform, Library, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AUDIO_KIND_LABEL, FILM_LANGUAGES, LANGUAGE_LABEL, MAIN_LANGUAGE, isVoiceKind, AUDIO_MAX_MS, AUDIO_TRACK_ORDER, audioClipFieldsOf, audioVersion, blocksOfVariant, formatHeading, versionsOf, variantsOf, type AudioClip, type AudioClipFields, type AudioKind, type ProjectState, sceneNumberOf, locale, languageWord, lineInfo, lineLabel } from "@/core";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";

const label = "text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary";
const ctl =
  "h-7 min-w-0 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary disabled:opacity-50";

export function AudioClipPanel({
  state,
  projectId,
  clip,
  editable,
  onChange,
  onRemove,
  onOpenProfile,
  cmds,
}: {
  /** Kommandoene (for nye opptak med mikrofonikonet, DEC-0093). */
  cmds?: Commands | undefined;
  state: ProjectState;
  projectId: string;
  clip: AudioClip;
  editable: boolean;
  onChange: (label: string, patch: Partial<AudioClipFields>) => void;
  onRemove: () => void;
  /** Åpne lydprofilen med volumpunkter (DEC-0045). */
  onOpenProfile: () => void;
}) {
  const asset = state.assets[clip.assetId];
  const occ = state.occurrences[clip.occurrenceId];
  const variant = occ ? state.variants[occ.variantId] : undefined;
  const version = audioVersion(state, clip);
  const fileMs = version?.durationMs ?? null;
  const versions = variantsOf(state, clip.assetId).flatMap((v) =>
    versionsOf(state, v.id).map((ver) => ({ v, ver })),
  );
  const lines = (() => {
    if (!occ) return [];
    const out: { id: string; label: string }[] = [];
    let speaker = "";
    for (const b of blocksOfVariant(state, occ.variantId)) {
      if (b.kind === "character") speaker = b.text.trim();
      else if (b.kind === "dialogue")
        out.push({ id: b.id, label: `${speaker ? speaker + ": " : ""}${b.text.slice(0, 70)}` });
    }
    return out;
  })();
  const off = !editable;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-baseline gap-2">
        <span className={label}>{t("app-assembly-audio-clip-panel.audio-clip-panel.span.18b3b8aca44d")}</span>
        <span className="min-w-0 truncate text-[13px] font-medium text-text-primary">
          {clip.name || asset?.name || t("app-assembly-audio-clip-panel.audio-clip-panel.span.18b3b8aca44d.2")}
        </span>
        {/* Mikrofonikonet (DEC-0093): nye takes for replikken eller lydressursen */}
        {editable && cmds ? (
          <TakesMicButton
            className="ml-auto shrink-0 self-center"
            projectId={projectId}
            state={state}
            cmds={cmds}
            target={
              clip.blockId
                ? { kind: "line", occurrenceId: clip.occurrenceId, blockId: clip.blockId, clipId: clip.id }
                : { kind: "sound", assetId: clip.assetId }
            }
            label={
              clip.blockId
                ? lineLabel(lineInfo(state, clip.occurrenceId, clip.blockId))
                : t("app-assembly-audio-clip-panel.audio-clip-panel.label.fab6626c6b62", { value1: String(asset?.name ?? clip.name) })
            }
          />
        ) : null}
      </div>

      <Text
        label={t("app-assembly-audio-clip-panel.audio-clip-panel.label.62fdc0100db4")}
        value={clip.name}
        disabled={off}
        onCommit={(name) => onChange(t("app-assembly-audio-clip-panel.audio-clip-panel.on-change.6fcc9002c60b"), { name })}
      />

      <div className="grid grid-cols-2 gap-2">
        <Field label={t("app-assembly-audio-clip-panel.audio-clip-panel.label.817d624f8f4b")}>
          <select
            value={clip.kind}
            disabled={off}
            onChange={(e) =>
              onChange(t("app-assembly-audio-clip-panel.audio-clip-panel.on-change.754894fc979b"), {
                kind: e.target.value as AudioKind,
              })
            }
            className={ctl}
          >
            {AUDIO_TRACK_ORDER.map((k) => (
              <option key={k} value={k}>
                {AUDIO_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("app-assembly-audio-clip-panel.audio-clip-panel.label.5d4d7e9d12cd")}>
          <select
            value={clip.versionId ?? ""}
            disabled={off || versions.length < 2}
            onChange={(e) => {
              const id = e.target.value;
              const hit = versions.find((x) => x.ver.id === id);
              onChange(t("app-assembly-audio-clip-panel.audio-clip-panel.on-change.9e31a18ea68f"), {
                assetVariantId: hit ? (hit.v.id as never) : null,
                versionId: hit ? (hit.ver.id as never) : null,
              });
            }}
            className={ctl}
          >
            <option value="">{t("app-assembly-audio-clip-panel.audio-clip-panel.option.bbdd4be476cf")}</option>
            {versions.map(({ v, ver }) => (
              <option key={ver.id} value={ver.id}>
                {v.name} v{ver.number}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={t("app-assembly-audio-clip-panel.audio-clip-panel.label.f8f383421807")}>
        <select
          aria-label={t("app-assembly-audio-clip-panel.audio-clip-panel.aria-label.f8f383421807")}
          value={clip.language ?? ""}
          disabled={off}
          onChange={(e) =>
            onChange(t("app-assembly-audio-clip-panel.audio-clip-panel.on-change.4d6641a36249"), {
              language: e.target.value || null,
            })
          }
          className={ctl}
          title={t("app-assembly-audio-clip-panel.audio-clip-panel.title.234575f8d899")}
        >
          <option value="">
            {t("app-assembly-audio-clip-panel.audio-clip-panel.option.a23664d8ed77")} (
            {isVoiceKind(clip.kind)
              ? LANGUAGE_LABEL[MAIN_LANGUAGE]
              : t("app-assembly-audio-clip-panel.audio-clip-panel.option.218dd21c6610")}
            )
          </option>
          <option value="*">{t("app-assembly-audio-clip-panel.audio-clip-panel.option.c10db5228315")}</option>
          {FILM_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {t("app-assembly-audio-clip-panel.audio-clip-panel.option.5185a176094b")} {languageWord(l)}
            </option>
          ))}
        </select>
      </Field>

      <p className="text-xs text-text-tertiary">
        {t("app-assembly-audio-clip-panel.audio-clip-panel.p.7ced37a6aab0")} {asset?.name ?? t("app-assembly-audio-clip-panel.audio-clip-panel.p.0118517e2706")}
        {fileMs
          ? ` · ${(fileMs / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 })} s`
          : ""}
        {version ? "" : t("app-assembly-audio-clip-panel.audio-clip-panel.p.724f7fe9ea91")}
        <br />
        Scene: {(occ ? sceneNumberOf(state, occ) : null) ?? "–"}{" "}
        {variant ? formatHeading(variant.heading) : ""}
      </p>

      <div className="grid grid-cols-3 gap-2">
        <Seconds
          label={t("app-assembly-audio-clip-panel.audio-clip-panel.label.6b56e15d6e61")}
          ms={clip.offsetMs}
          min={0}
          max={AUDIO_MAX_MS}
          disabled={off}
          onCommit={(ms) => onChange(t("app-assembly-audio-clip-panel.audio-clip-panel.on-change.f2e17d93b49e"), { offsetMs: ms })}
        />
        <Seconds
          label={t("app-assembly-audio-clip-panel.audio-clip-panel.label.4949c4800357")}
          ms={clip.lengthMs}
          min={1}
          max={
            fileMs !== null
              ? Math.max(1, Math.floor((fileMs - clip.sourceInMs) / (clip.speed ?? 1)))
              : AUDIO_MAX_MS
          }
          disabled={off}
          onCommit={(ms) =>
            onChange(t("app-assembly-audio-clip-panel.audio-clip-panel.on-change.0fd56b62082c"), { lengthMs: ms })
          }
        />
        <Seconds
          label={t("app-assembly-audio-clip-panel.audio-clip-panel.label.6a52050d9c07")}
          ms={clip.sourceInMs}
          min={0}
          max={fileMs !== null ? Math.max(0, fileMs - 1) : AUDIO_MAX_MS}
          disabled={off}
          onCommit={(ms) =>
            onChange(t("app-assembly-audio-clip-panel.audio-clip-panel.on-change.607a6678cd5b"), {
              sourceInMs: ms,
              lengthMs:
                fileMs !== null
                  ? Math.max(
                      1,
                      Math.min(clip.lengthMs, Math.floor((fileMs - ms) / (clip.speed ?? 1))),
                    )
                  : clip.lengthMs,
            })
          }
        />
      </div>

      <Gain
        value={clip.gainDb}
        disabled={off}
        onCommit={(gainDb) => onChange(t("app-assembly-audio-clip-panel.audio-clip-panel.on-change.708056c9c3a2"), { gainDb })}
      />

      <div className="grid grid-cols-2 gap-2">
        <Seconds
          label={t("app-assembly-audio-clip-panel.audio-clip-panel.label.31aaa16b8410")}
          ms={clip.fadeInMs}
          min={0}
          max={600_000}
          disabled={off}
          onCommit={(ms) => onChange(t("app-assembly-audio-clip-panel.audio-clip-panel.on-change.d6bbf8ae6b25"), { fadeInMs: ms })}
        />
        <Seconds
          label={t("app-assembly-audio-clip-panel.audio-clip-panel.label.f99d0d312ea8")}
          ms={clip.fadeOutMs}
          min={0}
          max={600_000}
          disabled={off}
          onCommit={(ms) => onChange(t("app-assembly-audio-clip-panel.audio-clip-panel.on-change.6e92837e9731"), { fadeOutMs: ms })}
        />
      </div>

      <Field label={t("app-assembly-audio-clip-panel.audio-clip-panel.label.b8bf29af9ad8")}>
        <select
          value={clip.blockId ?? ""}
          disabled={off || lines.length === 0}
          onChange={(e) =>
            onChange(t("app-assembly-audio-clip-panel.audio-clip-panel.on-change.3e90b37b01e4"), {
              blockId: (e.target.value || null) as never,
            })
          }
          className={ctl}
        >
          <option value="">
            {lines.length
              ? t("app-assembly-audio-clip-panel.audio-clip-panel.option.0e50c37b3e5d")
              : t("app-assembly-audio-clip-panel.audio-clip-panel.option.7435e0c31a92")}
          </option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </Field>

      <label className="flex items-center gap-2 text-xs text-text-secondary">
        <input
          type="checkbox"
          checked={clip.muted}
          disabled={off}
          onChange={(e) =>
            onChange(
              e.target.checked ? t("app-assembly-audio-clip-panel.audio-clip-panel.on-change.2fdfcaa699e7") : t("app-assembly-audio-clip-panel.audio-clip-panel.on-change.bba6b10a3101"),
              { muted: e.target.checked },
            )
          }
          className="size-3.5 accent-[var(--accent-brand)]"
        />
        {t("app-assembly-audio-clip-panel.audio-clip-panel.label.616485ec8c77")}
      </label>

      <label
        className="flex items-center gap-2 text-xs text-text-secondary"
        title={t("app-assembly-audio-clip-panel.audio-clip-panel.title.0c9793cbd3c1")}
      >
        <input
          type="checkbox"
          checked={clip.continues}
          disabled={off}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? t("app-assembly-audio-clip-panel.audio-clip-panel.on-change.b4e70ca6ac67")
                : t("app-assembly-audio-clip-panel.audio-clip-panel.on-change.19adbb87ef5e"),
              { continues: e.target.checked },
            )
          }
          className="size-3.5 accent-[var(--accent-warm)]"
        />
        <span>
          {t("app-assembly-audio-clip-panel.audio-clip-panel.span.72f4668ba93c")}
          <span className="block text-[11px] text-text-tertiary">
            {t("app-assembly-audio-clip-panel.audio-clip-panel.span.e0f73aa1e830")}
          </span>
        </span>
      </label>

      <Button size="sm" variant="secondary" className="self-start" onClick={onOpenProfile}>
        <AudioWaveform />
        {t("app-assembly-audio-clip-panel.audio-clip-panel.button.672b2bf8e2db")}
        {clip.volumeKeys.length
          ? t("app-assembly-audio-clip-panel.audio-clip-panel.button.a05605a8b15e", { length: String(clip.volumeKeys.length) })
          : ""}
      </Button>
      {(clip.speed ?? 1) !== 1 ? (
        <p className="text-xs text-text-secondary">
          {t("app-assembly-audio-clip-panel.audio-clip-panel.p.deb335d71e47")} {Math.round((clip.speed ?? 1) * 100)} %{" "}
          {t("app-assembly-audio-clip-panel.audio-clip-panel.p.36698fe36a15")}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {asset ? (
          <Button size="sm" variant="ghost" asChild>
            <Link
              to="/prosjekt/$projectId/bibliotek"
              params={{ projectId }}
              search={{ asset: asset.id }}
            >
              <Library />
              {t("app-assembly-audio-clip-panel.audio-clip-panel.link.82cfbba22b37")}
            </Link>
          </Button>
        ) : null}
        {editable ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            title={t("app-assembly-audio-clip-panel.audio-clip-panel.title.536acb9390ef")}
          >
            <Trash2 />
            {t("app-assembly-audio-clip-panel.audio-clip-panel.button.feb6555ed576")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function fieldsWith(clip: AudioClip, patch: Partial<AudioClipFields>): AudioClipFields {
  return { ...audioClipFieldsOf(clip), ...patch };
}

/** Volum: flyttes fritt, lagres når man slipper. */
function Gain({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (db: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const v = draft ?? value;
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <Field
      label={t("app-assembly-audio-clip-panel.gain.label.b9d969d90bfa", { value1: String(v > 0 ? "+" : ""), value2: String(v.toLocaleString(locale())) })}
    >
      <input
        type="range"
        min={-30}
        max={12}
        step={0.5}
        value={v}
        disabled={disabled}
        aria-label={t("app-assembly-audio-clip-panel.gain.aria-label.617c9b36b481")}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        onDoubleClick={() => onCommit(0)}
        title={t("app-assembly-audio-clip-panel.gain.title.14a2b1c82862")}
        className="h-1 w-full accent-[var(--accent-brand)]"
      />
    </Field>
  );
}

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-text-secondary">
      <span className={label}>{l}</span>
      {children}
    </label>
  );
}

function Text({
  label: l,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancel = useRef(false);
  useEffect(() => setDraft(null), [value]);
  return (
    <Field label={l}>
      <input
        value={draft ?? value}
        disabled={disabled}
        maxLength={200}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = draft;
          setDraft(null);
          if (cancel.current) {
            cancel.current = false;
            return;
          }
          if (v !== null && v.trim() !== value) onCommit(v.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            cancel.current = true;
            e.currentTarget.blur();
          }
        }}
        className={ctl}
      />
    </Field>
  );
}

function Seconds({
  label: l,
  ms,
  min,
  max,
  disabled,
  onCommit,
}: {
  label: string;
  ms: number;
  min: number;
  max: number;
  disabled: boolean;
  onCommit: (ms: number) => void;
}) {
  const shown = String(Math.round(ms / 10) / 100);
  const [draft, setDraft] = useState<string | null>(null);
  const cancel = useRef(false);
  return (
    <Field label={`${l} (s)`}>
      <input
        type="number"
        inputMode="decimal"
        step={0.1}
        disabled={disabled}
        value={draft ?? shown}
        onFocus={() => setDraft(shown)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = draft;
          setDraft(null);
          if (cancel.current) {
            cancel.current = false;
            return;
          }
          if (v === null || v.trim() === "" || v === shown) return;
          const n = Number(v.replace(",", "."));
          if (!Number.isFinite(n)) return;
          const out = Math.max(min, Math.min(max, Math.round(n * 1000)));
          if (out !== ms) onCommit(out);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            cancel.current = true;
            e.currentTarget.blur();
          }
        }}
        className={ctl + " font-mono"}
      />
    </Field>
  );
}
