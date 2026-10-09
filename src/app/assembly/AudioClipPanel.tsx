/**
 * Panelet for et valgt lydklipp (M4 del 2, mandat 13.3, DEC-0044): navn, spor, lydfil og versjon, plass i
 * scenen, lengde og kutt, volum, inn-/uttoning, replikk og demping.
 */
import { Link } from "@tanstack/react-router";
import { Library, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AUDIO_KIND_LABEL,
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
}: {
  state: ProjectState;
  projectId: string;
  clip: AudioClip;
  editable: boolean;
  onChange: (label: string, patch: Partial<AudioClipFields>) => void;
  onRemove: () => void;
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
        <span className={label}>Lyd</span>
        <span className="min-w-0 truncate text-[13px] font-medium text-text-primary">
          {clip.name || asset?.name || "Lyd"}
        </span>
      </div>

      <Text
        label="Navn"
        value={clip.name}
        disabled={off}
        onCommit={(name) => onChange("Endre navn på lyd", { name })}
      />

      <div className="grid grid-cols-2 gap-2">
        <Field label="Spor">
          <select
            value={clip.kind}
            disabled={off}
            onChange={(e) =>
              onChange("Flytt lyd til annet spor", { kind: e.target.value as AudioKind })
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
        <Field label="Versjon">
          <select
            value={clip.versionId ?? ""}
            disabled={off || versions.length < 2}
            onChange={(e) => {
              const id = e.target.value;
              const hit = versions.find((x) => x.ver.id === id);
              onChange("Bytt lydversjon", {
                assetVariantId: hit ? (hit.v.id as never) : null,
                versionId: hit ? (hit.ver.id as never) : null,
              });
            }}
            className={ctl}
          >
            <option value="">Nyeste / godkjent</option>
            {versions.map(({ v, ver }) => (
              <option key={ver.id} value={ver.id}>
                {v.name} v{ver.number}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <p className="text-xs text-text-tertiary">
        Fil: {asset?.name ?? "ukjent"}
        {fileMs
          ? ` · ${(fileMs / 1000).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} s`
          : ""}
        {version ? "" : " · mangler"}
        <br />
        Scene: {occ?.productionNumber ?? "–"} {variant ? formatHeading(variant.heading) : ""}
      </p>

      <div className="grid grid-cols-3 gap-2">
        <Seconds
          label="Start i scenen"
          ms={clip.offsetMs}
          min={0}
          max={AUDIO_MAX_MS}
          disabled={off}
          onCommit={(ms) => onChange("Flytt lyd", { offsetMs: ms })}
        />
        <Seconds
          label="Lengde"
          ms={clip.lengthMs}
          min={1}
          max={fileMs !== null ? Math.max(1, fileMs - clip.sourceInMs) : AUDIO_MAX_MS}
          disabled={off}
          onCommit={(ms) => onChange("Endre lengde på lyd", { lengthMs: ms })}
        />
        <Seconds
          label="Start i filen"
          ms={clip.sourceInMs}
          min={0}
          max={fileMs !== null ? Math.max(0, fileMs - 1) : AUDIO_MAX_MS}
          disabled={off}
          onCommit={(ms) =>
            onChange("Kutt starten av lyden", {
              sourceInMs: ms,
              lengthMs:
                fileMs !== null ? Math.max(1, Math.min(clip.lengthMs, fileMs - ms)) : clip.lengthMs,
            })
          }
        />
      </div>

      <Gain
        value={clip.gainDb}
        disabled={off}
        onCommit={(gainDb) => onChange("Endre volum", { gainDb })}
      />

      <div className="grid grid-cols-2 gap-2">
        <Seconds
          label="Inntoning"
          ms={clip.fadeInMs}
          min={0}
          max={600_000}
          disabled={off}
          onCommit={(ms) => onChange("Endre inntoning", { fadeInMs: ms })}
        />
        <Seconds
          label="Uttoning"
          ms={clip.fadeOutMs}
          min={0}
          max={600_000}
          disabled={off}
          onCommit={(ms) => onChange("Endre uttoning", { fadeOutMs: ms })}
        />
      </div>

      <Field label="Replikk">
        <select
          value={clip.blockId ?? ""}
          disabled={off || lines.length === 0}
          onChange={(e) =>
            onChange("Koble lyd til replikk", { blockId: (e.target.value || null) as never })
          }
          className={ctl}
        >
          <option value="">{lines.length ? "Ingen" : "Ingen replikker i scenen"}</option>
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
            onChange(e.target.checked ? "Demp lyd" : "Slå på lyd", { muted: e.target.checked })
          }
          className="size-3.5 accent-[var(--accent-brand)]"
        />
        Dempet (spilles ikke og kommer ikke med i eksporten)
      </label>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {asset ? (
          <Button size="sm" variant="ghost" asChild>
            <Link
              to="/prosjekt/$projectId/bibliotek"
              params={{ projectId }}
              search={{ asset: asset.id }}
            >
              <Library />
              Åpne i biblioteket
            </Link>
          </Button>
        ) : null}
        {editable ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            title="Fjern lyden fra filmen (Delete). Kan angres."
          >
            <Trash2 />
            Fjern fra filmen
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
    <Field label={`Volum (${v > 0 ? "+" : ""}${v.toLocaleString("nb-NO")} dB)`}>
      <input
        type="range"
        min={-30}
        max={12}
        step={0.5}
        value={v}
        disabled={disabled}
        aria-label="Volum i desibel"
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        onDoubleClick={() => onCommit(0)}
        title="Dobbeltklikk for 0 dB"
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
