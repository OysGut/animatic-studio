/**
 * Panelet for et valgt lydklipp (M4 del 2, mandat 13.3, DEC-0044): navn, spor, lydfil og versjon, plass i
 * scenen, lengde og kutt, volum, inn-/uttoning, replikk og demping.
 */
import type { Commands } from "@/app/project/use-commands";
import { TakesMicButton } from "@/app/audio/AudioTakesDialog";
import { Link } from "@tanstack/react-router";
import { AudioWaveform, Library, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AUDIO_KIND_LABEL,
  FILM_LANGUAGES,
  LANGUAGE_LABEL,
  MAIN_LANGUAGE,
  isVoiceKind,
  AUDIO_MAX_MS,
  AUDIO_TRACK_ORDER,
  audioClipFieldsOf,
  audioVersion,
  blocksOfVariant,
  formatHeading,
  versionsOf,
  variantsOf,
  type AudioClip,
  type AudioClipFields,
  type AudioKind,
  type ProjectState,
  sceneNumberOf,
  L,
  locale,
  languageWord,
  lineInfo,
  lineLabel,
} from "@/core";
import { Button } from "@/components/ui/button";

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
        <span className={label}>{L("Lyd", "Audio")}</span>
        <span className="min-w-0 truncate text-[13px] font-medium text-text-primary">
          {clip.name || asset?.name || L("Lyd", "Audio")}
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
                : L(
                    `Opptak til «${asset?.name ?? clip.name}»`,
                    `Recordings for “${asset?.name ?? clip.name}”`,
                  )
            }
          />
        ) : null}
      </div>

      <Text
        label={L("Navn", "Name")}
        value={clip.name}
        disabled={off}
        onCommit={(name) => onChange(L("Endre navn på lyd", "Rename audio"), { name })}
      />

      <div className="grid grid-cols-2 gap-2">
        <Field label={L("Spor", "Track")}>
          <select
            value={clip.kind}
            disabled={off}
            onChange={(e) =>
              onChange(L("Flytt lyd til annet spor", "Move audio to another track"), {
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
        <Field label={L("Versjon", "Version")}>
          <select
            value={clip.versionId ?? ""}
            disabled={off || versions.length < 2}
            onChange={(e) => {
              const id = e.target.value;
              const hit = versions.find((x) => x.ver.id === id);
              onChange(L("Bytt lydversjon", "Switch audio version"), {
                assetVariantId: hit ? (hit.v.id as never) : null,
                versionId: hit ? (hit.ver.id as never) : null,
              });
            }}
            className={ctl}
          >
            <option value="">{L("Nyeste / godkjent", "Latest / approved")}</option>
            {versions.map(({ v, ver }) => (
              <option key={ver.id} value={ver.id}>
                {v.name} v{ver.number}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={L("Språk", "Language")}>
        <select
          aria-label={L("Språk", "Language")}
          value={clip.language ?? ""}
          disabled={off}
          onChange={(e) =>
            onChange(L("Endre språk for lyd", "Change language of audio"), {
              language: e.target.value || null,
            })
          }
          className={ctl}
          title={L(
            "Hvilken språkversjon lyden spilles i. Musikk og effekter er vanligvis felles.",
            "Which language version the audio plays in. Music and effects are usually shared.",
          )}
        >
          <option value="">
            {L("Standard", "Default")} (
            {isVoiceKind(clip.kind)
              ? LANGUAGE_LABEL[MAIN_LANGUAGE]
              : L("felles for alle språk", "shared across all languages")}
            )
          </option>
          <option value="*">{L("Felles for alle språk", "Shared across all languages")}</option>
          {FILM_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {L("Bare", "Only")} {languageWord(l)}
            </option>
          ))}
        </select>
      </Field>

      <p className="text-xs text-text-tertiary">
        {L("Fil:", "File:")} {asset?.name ?? L("ukjent", "unknown")}
        {fileMs
          ? ` · ${(fileMs / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 })} s`
          : ""}
        {version ? "" : L(" · mangler", " · missing")}
        <br />
        Scene: {(occ ? sceneNumberOf(state, occ) : null) ?? "–"}{" "}
        {variant ? formatHeading(variant.heading) : ""}
      </p>

      <div className="grid grid-cols-3 gap-2">
        <Seconds
          label={L("Start i scenen", "Start in the scene")}
          ms={clip.offsetMs}
          min={0}
          max={AUDIO_MAX_MS}
          disabled={off}
          onCommit={(ms) => onChange(L("Flytt lyd", "Move audio"), { offsetMs: ms })}
        />
        <Seconds
          label={L("Lengde", "Length")}
          ms={clip.lengthMs}
          min={1}
          max={
            fileMs !== null
              ? Math.max(1, Math.floor((fileMs - clip.sourceInMs) / (clip.speed ?? 1)))
              : AUDIO_MAX_MS
          }
          disabled={off}
          onCommit={(ms) =>
            onChange(L("Endre lengde på lyd", "Change length of audio"), { lengthMs: ms })
          }
        />
        <Seconds
          label={L("Start i filen", "Start in the file")}
          ms={clip.sourceInMs}
          min={0}
          max={fileMs !== null ? Math.max(0, fileMs - 1) : AUDIO_MAX_MS}
          disabled={off}
          onCommit={(ms) =>
            onChange(L("Kutt starten av lyden", "Trim the start of the audio"), {
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
        onCommit={(gainDb) => onChange(L("Endre volum", "Change volume"), { gainDb })}
      />

      <div className="grid grid-cols-2 gap-2">
        <Seconds
          label={L("Inntoning", "Fade in")}
          ms={clip.fadeInMs}
          min={0}
          max={600_000}
          disabled={off}
          onCommit={(ms) => onChange(L("Endre inntoning", "Change fade in"), { fadeInMs: ms })}
        />
        <Seconds
          label={L("Uttoning", "Fade out")}
          ms={clip.fadeOutMs}
          min={0}
          max={600_000}
          disabled={off}
          onCommit={(ms) => onChange(L("Endre uttoning", "Change fade out"), { fadeOutMs: ms })}
        />
      </div>

      <Field label={L("Replikk", "Line")}>
        <select
          value={clip.blockId ?? ""}
          disabled={off || lines.length === 0}
          onChange={(e) =>
            onChange(L("Koble lyd til replikk", "Link audio to line"), {
              blockId: (e.target.value || null) as never,
            })
          }
          className={ctl}
        >
          <option value="">
            {lines.length
              ? L("Ingen", "None")
              : L("Ingen replikker i scenen", "No lines in the scene")}
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
              e.target.checked ? L("Demp lyd", "Mute audio") : L("Slå på lyd", "Unmute audio"),
              { muted: e.target.checked },
            )
          }
          className="size-3.5 accent-[var(--accent-brand)]"
        />
        {L(
          "Dempet (spilles ikke og kommer ikke med i eksporten)",
          "Muted (not played and not included in the export)",
        )}
      </label>

      <label
        className="flex items-center gap-2 text-xs text-text-secondary"
        title={L(
          "Starten er festet i denne scenen, men lyden fortsetter inn i de neste scenene",
          "The start is fixed in this scene, but the audio continues into the next scenes",
        )}
      >
        <input
          type="checkbox"
          checked={clip.continues}
          disabled={off}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? L("La lyden løpe videre", "Let the audio run on")
                : L("Stopp lyden ved scenens slutt", "Stop the audio at the end of the scene"),
              { continues: e.target.checked },
            )
          }
          className="size-3.5 accent-[var(--accent-warm)]"
        />
        <span>
          {L("Løper videre over flere scener", "Runs on across several scenes")}
          <span className="block text-[11px] text-text-tertiary">
            {L(
              "Ellers stopper lyden ved slutten av scenen",
              "Otherwise the audio stops at the end of the scene",
            )}
          </span>
        </span>
      </label>

      <Button size="sm" variant="secondary" className="self-start" onClick={onOpenProfile}>
        <AudioWaveform />
        {L("Lydprofil, hastighet og masker …", "Audio profile, speed and masks …")}
        {clip.volumeKeys.length
          ? L(` (${clip.volumeKeys.length} punkter)`, ` (${clip.volumeKeys.length} points)`)
          : ""}
      </Button>
      {(clip.speed ?? 1) !== 1 ? (
        <p className="text-xs text-text-secondary">
          {L("Hastighet:", "Speed:")} {Math.round((clip.speed ?? 1) * 100)} %{" "}
          {L("(endres i lydprofilen)", "(changed in the audio profile)")}
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
              {L("Åpne i biblioteket", "Open in library")}
            </Link>
          </Button>
        ) : null}
        {editable ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            title={L(
              "Fjern lyden fra filmen (Delete). Kan angres.",
              "Remove the audio from the film (Delete). Can be undone.",
            )}
          >
            <Trash2 />
            {L("Fjern fra filmen", "Remove from film")}
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
      label={L(
        `Volum (${v > 0 ? "+" : ""}${v.toLocaleString(locale())} dB)`,
        `Volume (${v > 0 ? "+" : ""}${v.toLocaleString(locale())} dB)`,
      )}
    >
      <input
        type="range"
        min={-30}
        max={12}
        step={0.5}
        value={v}
        disabled={disabled}
        aria-label={L("Volum i desibel", "Volume in decibels")}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        onDoubleClick={() => onCommit(0)}
        title={L("Dobbeltklikk for 0 dB", "Double-click for 0 dB")}
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
