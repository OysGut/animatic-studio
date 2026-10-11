/**
 * Overgangseditor (DEC-0051, REQ-0575–0577): type (kutt, overtoning, via svart, via hvitt, tørk, skyv,
 * iris), lengde i sekunder og overlapp. Brukes for overgangen inn i en scene (med valget «Prosjektets
 * standard») og for prosjektets standardovergang.
 */
import { useState } from "react";
import {
  MAX_TRANSITION_FRAMES,
  TRANSITION_KINDS,
  type Transition,
  type TransitionKind,
} from "@/core";
import { TRANSITION_LABEL } from "./transitions";

const INHERIT = "__standard__";
const control =
  "h-6 rounded-sm border border-border-control bg-surface-3 px-1 text-xs text-text-primary disabled:opacity-50";

export function TransitionEditor({
  value,
  standard,
  fps,
  editable,
  first = false,
  idPrefix,
  onChange,
}: {
  /** Valgt overgang; null = følger prosjektets standard (bare når `standard` er gitt). */
  value: Transition | null;
  /** Prosjektets standard. Gis den, kan scenen følge den. */
  standard?: Transition;
  fps: number;
  editable: boolean;
  /** Første scene i filmen: overgangen er en inntoning (ingen overlapp). */
  first?: boolean;
  idPrefix: string;
  onChange: (t: Transition | null) => void;
}) {
  const t = value ?? standard ?? { kind: "cut", frames: 0 };
  const inherited = value === null && standard !== undefined;
  const [draft, setDraft] = useState<string | null>(null);
  const seconds = Math.round((t.frames / fps) * 100) / 100;
  const label = (k: TransitionKind) =>
    first && k !== "cut"
      ? k === "dipWhite"
        ? "Inntoning fra hvitt"
        : "Inntoning fra svart"
      : TRANSITION_LABEL[k];
  function setSeconds(text: string) {
    const v = Number(text.trim().replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return;
    const frames = Math.max(1, Math.min(MAX_TRANSITION_FRAMES, Math.round(v * fps)));
    if (frames !== t.frames) onChange({ ...t, frames });
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <select
          id={`${idPrefix}-type`}
          aria-label="Overgang"
          value={inherited ? INHERIT : t.kind}
          disabled={!editable}
          onChange={(e) => {
            if (e.target.value === INHERIT) return onChange(null);
            const kind = e.target.value as TransitionKind;
            onChange(
              kind === "cut"
                ? { kind, frames: 0 }
                : {
                    kind,
                    frames: t.frames || Math.round(fps),
                    ...(t.overlap ? { overlap: true } : {}),
                  },
            );
          }}
          className={control}
        >
          {standard !== undefined ? (
            <option value={INHERIT}>
              Prosjektets standard ({label(standard.kind).toLocaleLowerCase("nb")})
            </option>
          ) : null}
          {TRANSITION_KINDS.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
        {t.kind !== "cut" ? (
          <>
            <input
              type="number"
              inputMode="decimal"
              aria-label="Overgangens lengde i sekunder"
              step={0.1}
              min={0.04}
              max={MAX_TRANSITION_FRAMES / fps}
              disabled={!editable || inherited}
              value={draft ?? String(seconds)}
              onFocus={() => setDraft(String(seconds))}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (draft !== null) setSeconds(draft);
                setDraft(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                else if (e.key === "Escape") {
                  setDraft(null);
                  e.currentTarget.blur();
                }
              }}
              className="h-6 w-14 rounded-sm border border-border-control bg-surface-3 px-1.5 font-mono text-xs text-text-primary disabled:opacity-50"
            />
            <span className="text-text-tertiary">s</span>
            {!first ? (
              <label className="ml-1 flex items-center gap-1 text-text-secondary">
                <input
                  type="checkbox"
                  checked={t.overlap === true}
                  disabled={!editable || inherited}
                  onChange={(e) => {
                    const { overlap: _o, ...rest } = t;
                    onChange(e.target.checked ? { ...rest, overlap: true } : rest);
                  }}
                  className="size-3.5 accent-[var(--accent-brand)]"
                />
                Overlapp
              </label>
            ) : null}
          </>
        ) : null}
      </div>
      {t.kind !== "cut" && !first ? (
        <p className="text-[11px] text-text-tertiary">
          {t.overlap
            ? "Scenen begynner før forrige er ferdig, og filmen blir kortere med overgangens lengde."
            : "Midt på klippet: halvparten før og halvparten etter. Filmens lengde endres ikke."}
          {inherited ? " Endres under «Standardovergang» i verktøylinjen." : ""}
        </p>
      ) : null}
    </div>
  );
}
