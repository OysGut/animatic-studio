/**
 * Varighet og produksjonsstatus på prosjektoversikten (mandat 7 og 27; REQ-0108–0119, REQ-0405, REQ-0406,
 * REQ-0494, REQ-0495) – aldri i manusvisningen (REQ-0117).
 *
 * - Estimatet er et anslag ut fra dialog og handling; antakelsene vises og kan justeres (REQ-0110/0111).
 * - Forventet lengde nå bruker det beste tallet per scene: film → AI-video → 2D-animatic → estimat, og hver
 *   scene telles én gang (REQ-0112–0114). Bekreftet, gjenstående og andel ferdig vises (REQ-0118).
 * - Per scene: status, tall og kilde, avvik, filter (status, ressurs, avvik, tekst) og lenker rett til
 *   manus, sceneeditor og montering (REQ-0119, REQ-0406).
 */
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  FileText,
  Layers,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useCommands } from "@/app/project/use-commands";
import { DurationHistory } from "./DurationHistory";
import { HISTORY_SCHEMA, useSaveDurationEstimate } from "./use-history-records";
import { versionDurationEstimate } from "@/app/project/use-versions";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import {
  DEFAULT_DURATION_ASSUMPTIONS,
  DURATION_ASSUMPTION_LIMITS,
  normalizeDurationAssumptions,
  projectDurationAssumptions,
  sameDurationAssumptions,
  FILM_LANGUAGES,
  LANGUAGE_LABEL,
  MAIN_LANGUAGE,
  DURATION_SOURCE_LABEL,
  SCENE_STATUS_LABEL,
  estimateProduction,
  durationForecast,
  filterStatusRows,
  formatDuration,
  formatEighths,
  formatHeading,
  orderedOccurrences,
  parsePlannedDuration,
  productionStatus,
  scriptPages,
  type DurationAssumptions,
  type ProjectState,
  type SceneStatus,
  L,
  collation,
  tm,
} from "@/core";
import { t } from "@/core/i18n/keyed";

const STATUS_CLASS: Record<SceneStatus, string> = {
  done: "text-status-success",
  film: "text-accent-brand",
  animatic: "text-text-primary",
  missing: "text-status-uncertain",
  inactive: "text-text-tertiary",
};

const ctl =
  "h-7 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Planlagt lengde for en scene, lagres når feltet forlates (Enter) – Esc avbryter. */
function PlannedInput({
  plannedSeconds,
  disabled,
  label,
  onSave,
}: {
  plannedSeconds: number | null;
  disabled: boolean;
  label: string;
  onSave: (ms: number | null) => void;
}) {
  const shown = plannedSeconds === null ? "" : formatDuration(plannedSeconds);
  const [text, setText] = useState<string | null>(null);
  // Esc: blur skjer før tilstanden er oppdatert, så avbrytingen må huskes utenom React-tilstanden
  const cancelled = useRef(false);
  const invalid = text !== null && parsePlannedDuration(text) === undefined;
  return (
    <input
      type="text"
      inputMode="numeric"
      value={text ?? shown}
      disabled={disabled}
      placeholder="–"
      aria-label={label}
      aria-invalid={invalid || undefined}
      title={t("app-projects-duration-overview.planned-input.title.4ae4ec2051c8")}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          cancelled.current = true;
          setText(null);
          e.currentTarget.blur();
        }
      }}
      onBlur={() => {
        if (cancelled.current) {
          cancelled.current = false;
          return;
        }
        if (text === null) return;
        const ms = parsePlannedDuration(text);
        setText(null);
        if (ms === undefined) return;
        if ((ms === null ? null : ms / 1000) !== plannedSeconds) onSave(ms);
      }}
      className={
        "tabular h-6 w-16 rounded-sm border bg-surface-3 px-1.5 text-right text-xs text-text-primary disabled:opacity-50 " +
        (invalid ? "border-status-danger" : "border-border-control")
      }
    />
  );
}

export function DurationOverview({
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
  const productions = Object.values(state.productions)
    .filter((p) => orderedOccurrences(state, p.id).length > 0)
    .sort((a, b) =>
      a.kind === "main" ? -1 : b.kind === "main" ? 1 : a.name.localeCompare(b.name, collation()),
    );
  const [productionId, setProductionId] = useState<string | null>(null);
  // Antakelsene er felles for prosjektet (KI-28, migrasjon 0028). Mens et felt redigeres, brukes et utkast;
  // det lagres når feltet forlates. Uten 0028 eller uten skriverett: bare lokalt, lagres ikke.
  const schema28 = useSchemaAtLeast(HISTORY_SCHEMA);
  const canSaveAssumptions = editable && schema28;
  const savedAssumptions = projectDurationAssumptions(state.project);
  const [draft, setDraft] = useState<DurationAssumptions | null>(null);
  const [assumptionError, setAssumptionError] = useState<string | null>(null);
  const assumptions = draft ?? savedAssumptions;
  const saveAssumptions = (next: DurationAssumptions | null) => {
    if (!canSaveAssumptions) return;
    const n = next === null ? null : normalizeDurationAssumptions(next);
    if (next !== null && n === null) {
      setAssumptionError(
        t("app-projects-duration-overview.save-assumptions.set-assumption-error.ea6c6c7ffc13"),
      );
      return;
    }
    setAssumptionError(null);
    // Standardverdiene lagres som «ingen egne antakelser»
    const value = n && !sameDurationAssumptions(n, DEFAULT_DURATION_ASSUMPTIONS) ? n : null;
    if ((state.project.durationAssumptions ?? null) === null && value === null) {
      setDraft(null);
      return;
    }
    if (
      value &&
      state.project.durationAssumptions &&
      sameDurationAssumptions(value, state.project.durationAssumptions)
    ) {
      setDraft(null);
      return;
    }
    const err = cmds.runSilent(
      { type: "SetDurationAssumptions", assumptions: value },
      t("app-projects-duration-overview.err.cmds-run-silent.859d1508b51c"),
    );
    if (err) setAssumptionError(err);
    else setDraft(null);
  };
  const [showScenes, setShowScenes] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [status, setStatus] = useState<SceneStatus | "">("");
  const [assetId, setAssetId] = useState("");
  const [onlyDiscrepancies, setOnlyDiscrepancies] = useState(false);
  const [onlyResourceChanges, setOnlyResourceChanges] = useState(false);
  const [language, setLanguage] = useState("");
  const [text, setText] = useState("");
  const pid =
    productionId && state.productions[productionId] ? productionId : (productions[0]?.id ?? null);
  // Lagrede estimater (REQ-0120, migrasjon 0028)
  const saveEstimate = useSaveDurationEstimate(projectId, pid ?? "");
  const [estimateNote, setEstimateNote] = useState<string | null>(null);
  const [estimateWaiting, setEstimateWaiting] = useState(false);

  const estimate = useMemo(() => {
    if (!pid) return null;
    const pagination = scriptPages(state, pid, { lockedPages: true });
    return estimateProduction(state, pid, assumptions, pagination);
  }, [state, pid, assumptions]);
  // Prognose fra historikk (M6): beregnet ved visning, aldri lagret
  const forecast = useMemo(() => (pid ? durationForecast(state, pid, assumptions) : null), [state, pid, assumptions]);
  const overview = useMemo(
    () => (pid && estimate ? productionStatus(state, pid, estimate) : null),
    [state, pid, estimate],
  );

  const rows = useMemo(
    () =>
      overview
        ? filterStatusRows(state, overview.rows, {
            status,
            assetId,
            onlyDiscrepancies,
            onlyResourceChanges,
            language,
            text,
          })
        : [],
    [state, overview, status, assetId, onlyDiscrepancies, onlyResourceChanges, language, text],
  );
  const now = useMemo(
    () =>
      overview
        ? {
            estimatedSeconds: overview.estimatedSeconds,
            expectedSeconds: overview.expectedSeconds,
            confirmedSeconds: overview.confirmedSeconds,
            scenes: overview.rows.length - overview.counts.inactive,
          }
        : null,
    [overview],
  );

  if (!pid || !estimate || !overview || !now) return null;
  const byOcc = new Map(estimate.scenes.map((x) => [x.occurrenceId, x]));
  const assetsInRows = [...new Set(overview.rows.flatMap((r) => r.assetIds))]
    .map((id) => state.assets[id])
    .filter((a): a is NonNullable<typeof a> => !!a && a.kind !== "sound")
    .sort((a, b) => a.name.localeCompare(b.name, collation()));
  const filtered = !!(
    status ||
    assetId ||
    onlyDiscrepancies ||
    onlyResourceChanges ||
    language ||
    text.trim()
  );
  const changedScenes = overview.rows.filter((r) => r.active && r.outdatedLayers > 0).length;
  const confirmedNotDone = Math.max(
    0,
    overview.expectedSeconds > 0
      ? overview.confirmedSeconds / overview.expectedSeconds - overview.doneShare
      : 0,
  );

  const num = (k: keyof DurationAssumptions, label: string, step: number, unit: string) => (
    <label className="flex items-center justify-between gap-3 text-xs text-text-secondary">
      {label}
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          min={DURATION_ASSUMPTION_LIMITS[k].min}
          max={DURATION_ASSUMPTION_LIMITS[k].max}
          step={step}
          value={assumptions[k]}
          aria-label={label}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= 0) setDraft({ ...assumptions, [k]: v });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          onBlur={() => {
            if (draft) saveAssumptions(draft);
          }}
          className="tabular h-7 w-20 rounded-sm border border-border-control bg-surface-3 px-2 text-right text-[13px] text-text-primary"
        />
        <span className="w-14 text-text-tertiary">{unit}</span>
      </span>
    </label>
  );
  const stat = (label: string, value: string, note: string) => (
    <div className="flex flex-col">
      <span className="text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
        {label}
      </span>
      <span className="tabular text-lg font-semibold text-text-primary">{value}</span>
      <span className="text-[11px] text-text-tertiary">{note}</span>
    </div>
  );
  const chip = (s: SceneStatus, n: number) => (
    <button
      key={s}
      type="button"
      aria-pressed={status === s}
      disabled={n === 0}
      onClick={() => {
        setStatus(status === s ? "" : s);
        setShowScenes(true);
      }}
      className={
        "flex h-7 items-center gap-1 rounded-sm border px-2 text-xs disabled:opacity-40 " +
        (status === s
          ? "border-accent-brand bg-surface-3 text-text-primary"
          : "border-border bg-surface-1 text-text-secondary hover:bg-surface-2")
      }
    >
      <span className={STATUS_CLASS[s]}>●</span> {SCENE_STATUS_LABEL[s]}
      <span className="tabular text-text-primary">{n}</span>
    </button>
  );

  return (
    <section aria-labelledby="dur-title" className="mt-10">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="dur-title" className="text-base font-semibold text-text-primary">
          {t("app-projects-duration-overview.duration-overview.h2.032e43f1de26")}
        </h2>
        {productions.length > 1 ? (
          <select
            aria-label={t("app-projects-duration-overview.duration-overview.aria-label.cfcb3947b799")}
            value={pid}
            onChange={(e) => setProductionId(e.target.value)}
            className={ctl}
          >
            {productions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="grid grid-cols-[1fr_300px] gap-4">
        <div className="border border-border bg-surface-1 p-4">
          <p className="text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
            {t("app-projects-duration-overview.duration-overview.p.885059f12e51")}
          </p>
          <p className="tabular text-3xl font-semibold tracking-tight text-text-primary">
            {formatDuration(overview.expectedSeconds)}
          </p>
          <p className="mt-1 text-[13px] text-text-secondary">
            {overview.rows.length - overview.counts.inactive} {t("app-projects-duration-overview.duration-overview.p.704f856e2c5a")}{" "}
            · <span className="tabular">{formatEighths(estimate.activeEighths)}</span>{" "}
            {t("app-projects-duration-overview.duration-overview.p.c75714294bf6")}
            {overview.counts.inactive
              ? t("app-projects-duration-overview.duration-overview.p.3886da1e2d94", { inactive: String(overview.counts.inactive) })
              : ""}
          </p>
          {forecast ? (
            <p data-testid="duration-forecast" className="mt-3 text-xs text-text-secondary">
              <span className="font-medium text-text-primary">{t("app-projects-duration-overview.duration-overview.span.0b4efbea045a")}</span>{" "}
              <span className="tabular">
                {formatDuration(forecast.lowSeconds)}–{formatDuration(forecast.highSeconds)}
              </span>
              {forecast.fallback
                ? t("app-projects-duration-overview.duration-overview.p.0e1c518e21c6")
                : t("app-projects-duration-overview.forecast-basis", {
                    scenes: forecast.basedOnScenes,
                    lines: t("app-projects-duration-overview.forecast-basis-lines", { count: forecast.basedOnLines }),
                  })}
              <span className="text-text-tertiary">
                {t("app-projects-duration-overview.duration-overview.span.1be46ca01daf")}
              </span>
            </p>
          ) : null}
          <div className="mt-4 grid grid-cols-3 gap-3">
            {stat(
              t("app-projects-duration-overview.duration-overview.stat.6629c7135c2f"),
              formatDuration(overview.confirmedSeconds),
              t("app-projects-duration-overview.duration-overview.stat.15eec3bc22ef"),
            )}
            {stat(
              t("app-projects-duration-overview.duration-overview.stat.0226ed21e086"),
              `≈ ${formatDuration(overview.remainingEstimatedSeconds)}`,
              t("app-projects-duration-overview.duration-overview.stat.00dfa39cfafe"),
            )}
            {stat(
              t("app-projects-duration-overview.duration-overview.stat.9a1c1c026ede"),
              `≈ ${formatDuration(overview.estimatedSeconds)}`,
              estimate.uncertainScenes
                ? t("app-projects-duration-overview.duration-overview.stat.890edb769c37", { uncertainScenes: String(estimate.uncertainScenes), value2: String(formatDuration(estimate.activeLowSeconds)), value3: String(formatDuration(estimate.activeHighSeconds)) })
                : t("app-projects-duration-overview.duration-overview.stat.635f0ef0ae09"),
            )}
          </div>
          <div
            className="mt-4 flex h-2 overflow-hidden rounded-sm bg-surface-3"
            role="img"
            aria-label={t("app-projects-duration-overview.duration-overview.aria-label.b95f6bd700f7", { value1: String(pct(overview.doneShare)), value2: String(pct(confirmedNotDone)), value3: String(pct(overview.estimatedShare)) })}
          >
            <span className="bg-status-success" style={{ width: `${overview.doneShare * 100}%` }} />
            <span className="bg-accent-brand" style={{ width: `${confirmedNotDone * 100}%` }} />
          </div>
          <p className="mt-1.5 flex flex-wrap gap-x-4 text-[11px] text-text-tertiary">
            <span>
              <span className="text-status-success">■</span> {t("app-projects-duration-overview.duration-overview.span.a94792d60af1")}{" "}
              <span className="tabular text-text-secondary">{pct(overview.doneShare)}</span>
            </span>
            <span>
              <span className="text-accent-brand">■</span>{" "}
              {t("app-projects-duration-overview.duration-overview.span.2c5d3f9f8ca3")}{" "}
              <span className="tabular text-text-secondary">{pct(confirmedNotDone)}</span>
            </span>
            <span>
              <span className="text-text-tertiary">■</span>{" "}
              {t("app-projects-duration-overview.duration-overview.span.13ce142f412b")}{" "}
              <span className="tabular text-text-secondary">{pct(overview.estimatedShare)}</span>
            </span>
          </p>
          <p className="mt-3 text-xs text-text-tertiary">
            {t("app-projects-duration-overview.duration-overview.p.1c00218d593b")}
          </p>
        </div>
        <div className="flex flex-col gap-1.5 border border-border bg-surface-1 p-3">
          <p className="mb-1 text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
            {t("app-projects-duration-overview.duration-overview.p.2d8ad1b0b3f4")}
          </p>
          {num(
            "dialogueWordsPerMinute",
            t("app-projects-duration-overview.duration-overview.num.83fb305f54bb"),
            5,
            t("app-projects-duration-overview.duration-overview.num.a4f7c9601ee3"),
          )}
          {num(
            "actionSecondsPerLine",
            t("app-projects-duration-overview.duration-overview.num.f71c2b061fe1"),
            0.5,
            t("app-projects-duration-overview.duration-overview.num.cc27c279cb12"),
          )}
          {num(
            "headingSeconds",
            t("app-projects-duration-overview.duration-overview.num.96f23c709476"),
            0.5,
            t("app-projects-duration-overview.duration-overview.num.cc27c279cb12.2"),
          )}
          {num("minSceneSeconds", t("app-projects-duration-overview.duration-overview.num.ae41f60ad450"), 1, t("app-projects-duration-overview.duration-overview.num.cc27c279cb12.3"))}
          <button
            type="button"
            onClick={() => {
              if (canSaveAssumptions) saveAssumptions(null);
              else setDraft(DEFAULT_DURATION_ASSUMPTIONS);
            }}
            className="mt-1 self-start text-xs text-accent-brand hover:underline"
          >
            {t("app-projects-duration-overview.duration-overview.button.0894f98c0165")}
          </button>
          {assumptionError ? (
            <p role="alert" className="text-[11px] text-status-danger">
              {assumptionError}
            </p>
          ) : null}
          <p className="text-[11px] text-text-tertiary">
            {canSaveAssumptions
              ? t("app-projects-duration-overview.duration-overview.p.4f4199fb5fb1")
              : !schema28
                ? t("app-projects-duration-overview.duration-overview.p.38145e4d4e98")
                : t("app-projects-duration-overview.duration-overview.p.ac51ac4d2fb4")}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Status">
        {(["done", "film", "animatic", "missing", "inactive"] as const).map((s) =>
          chip(s, overview.counts[s]),
        )}
        {overview.discrepancies ? (
          <button
            type="button"
            aria-pressed={onlyDiscrepancies}
            onClick={() => {
              setOnlyDiscrepancies(!onlyDiscrepancies);
              setShowScenes(true);
            }}
            className={
              "flex h-7 items-center gap-1 rounded-sm border px-2 text-xs " +
              (onlyDiscrepancies
                ? "border-status-danger bg-surface-3 text-text-primary"
                : "border-border bg-surface-1 text-text-secondary hover:bg-surface-2")
            }
          >
            <AlertTriangle className="size-3.5 text-status-danger" aria-hidden />
            {t("app-projects-duration-overview.duration-overview.button.e3f8dc1d3d8f")}
            <span className="tabular text-text-primary">{overview.discrepancies}</span>
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setShowHistory(!showHistory)}
        aria-expanded={showHistory}
        className="mt-3 flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
      >
        {showHistory ? (
          <ChevronDown className="size-4" aria-hidden />
        ) : (
          <ChevronRight className="size-4" aria-hidden />
        )}
        {t("app-projects-duration-overview.duration-overview.button.ed24c3eddc15")}
      </button>
      {editable && schema28 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={saveEstimate.isPending || estimateWaiting}
            onClick={async () => {
              if (!pid) return;
              setEstimateNote(null);
              // Vent til alle endringer er lagret, og regn estimatet fra tilstanden etterpå (den lagrede), ikke
              // fra lokale endringer som ennå står i køen
              setEstimateWaiting(true);
              try {
                await cmds.whenIdle();
              } finally {
                setEstimateWaiting(false);
              }
              const saved = cmds.current() ?? state;
              const e = versionDurationEstimate(
                saved,
                pid,
                draft ?? projectDurationAssumptions(saved.project),
              );
              saveEstimate.mutate(
                { assumptions: e.assumptions, snapshot: e.snapshot },
                {
                  onSuccess: (r) => {
                    setShowHistory(true);
                    setEstimateNote(
                      r.scriptVersionId
                        ? t("app-projects-duration-overview.on-success.set-estimate-note.3d3017f53675")
                        : t("app-projects-duration-overview.on-success.set-estimate-note.6a6048a8e9b3"),
                    );
                  },
                  onError: (e) =>
                    setEstimateNote(
                      t("app-projects-duration-overview.on-error.set-estimate-note.6c3c6d6451ce", { value1: String(tm(e.message)) }),
                    ),
                },
              );
            }}
            title={t("app-projects-duration-overview.duration-overview.title.e172b22a9146")}
            className="flex h-7 items-center rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary hover:bg-surface-2 disabled:opacity-50"
          >
            {t("app-projects-duration-overview.duration-overview.button.88515c4f1e99")}
          </button>
          {estimateNote ? (
            <span role="status" className="text-xs text-text-secondary">
              {estimateNote}
            </span>
          ) : null}
        </div>
      ) : null}
      {showHistory ? (
        <div className="mt-2">
          <DurationHistory state={state} productionId={pid} assumptions={assumptions} now={now} />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setShowScenes(!showScenes)}
        aria-expanded={showScenes}
        className="mt-3 flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
      >
        {showScenes ? (
          <ChevronDown className="size-4" aria-hidden />
        ) : (
          <ChevronRight className="size-4" aria-hidden />
        )}
        Per scene
        {filtered ? (
          <span className="text-text-tertiary">
            ({rows.length} {t("app-projects-duration-overview.duration-overview.span.c0bc5cfc4d81")} {overview.rows.length})
          </span>
        ) : null}
      </button>
      {showScenes ? (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("app-projects-duration-overview.duration-overview.placeholder.4e17d46988e8")}
              aria-label={t("app-projects-duration-overview.duration-overview.aria-label.a3d01af35e76")}
              className={ctl + " w-52"}
            />
            <select
              aria-label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as SceneStatus | "")}
              className={ctl}
            >
              <option value="">{t("app-projects-duration-overview.duration-overview.option.bd1830e08a24")}</option>
              {(Object.keys(SCENE_STATUS_LABEL) as SceneStatus[]).map((s) => (
                <option key={s} value={s}>
                  {SCENE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <select
              aria-label={t("app-projects-duration-overview.duration-overview.aria-label.9a23f91f2271")}
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className={ctl + " max-w-56"}
            >
              <option value="">
                {t("app-projects-duration-overview.duration-overview.option.2e237b6028d0")}
              </option>
              {assetsInRows.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={onlyDiscrepancies}
                onChange={(e) => setOnlyDiscrepancies(e.target.checked)}
              />
              {t("app-projects-duration-overview.duration-overview.label.a9a667046098")}
            </label>
            <label
              className="flex items-center gap-1.5 text-xs text-text-secondary"
              title={t("app-projects-duration-overview.duration-overview.title.69bf08e1d5d9")}
            >
              <input
                type="checkbox"
                checked={onlyResourceChanges}
                onChange={(e) => setOnlyResourceChanges(e.target.checked)}
              />
              {t("app-projects-duration-overview.duration-overview.label.80689e368251")}
              {changedScenes ? ` (${changedScenes})` : ""}
            </label>
            <select
              aria-label={t("app-projects-duration-overview.duration-overview.aria-label.17efb8523bd6")}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={ctl}
            >
              <option value="">{t("app-projects-duration-overview.duration-overview.option.76f97f9b88ea")}</option>
              {FILM_LANGUAGES.filter((l) => l !== MAIN_LANGUAGE).map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABEL[l] ?? l}: {t("app-projects-duration-overview.duration-overview.option.4b8df452c048")}
                </option>
              ))}
            </select>
            {filtered ? (
              <button
                type="button"
                onClick={() => {
                  setStatus("");
                  setAssetId("");
                  setOnlyDiscrepancies(false);
                  setOnlyResourceChanges(false);
                  setLanguage("");
                  setText("");
                }}
                className="text-xs text-accent-brand hover:underline"
              >
                {t("app-projects-duration-overview.duration-overview.button.c74fa45323b9")}
              </button>
            ) : null}
          </div>
          <div className="mt-2 max-h-[480px] overflow-y-auto border border-border bg-surface-1">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface-2 text-left text-chrome-label uppercase tracking-[0.04em] text-text-tertiary">
                <tr>
                  <th className="w-14 px-3 py-1.5 font-medium">{t("app-projects-duration-overview.duration-overview.th.83c9f8976374")}</th>
                  <th className="px-3 py-1.5 font-medium">Scene</th>
                  <th className="w-36 px-3 py-1.5 font-medium">Status</th>
                  <th className="w-16 px-3 py-1.5 text-right font-medium">{t("app-projects-duration-overview.duration-overview.th.7fecce771d97")}</th>
                  <th className="w-20 px-3 py-1.5 text-right font-medium">
                    {t("app-projects-duration-overview.duration-overview.th.c7c1d8cef916")}
                  </th>
                  <th className="w-20 px-3 py-1.5 text-right font-medium">Plan</th>
                  <th className="w-32 px-3 py-1.5 text-right font-medium">{t("app-projects-duration-overview.duration-overview.th.ee4b9ebc1dc0")}</th>
                  <th className="w-24 px-3 py-1.5 font-medium">
                    <span className="sr-only">{t("app-projects-duration-overview.duration-overview.span.c5a06f2f294e")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-3 text-xs text-text-tertiary">
                      {t("app-projects-duration-overview.duration-overview.td.e659f6ee5595")}
                    </td>
                  </tr>
                ) : null}
                {rows.map((r) => {
                  const o = state.occurrences[r.occurrenceId]!;
                  const v = state.variants[o.variantId];
                  const e = byOcc.get(r.occurrenceId);
                  const search = { scene: r.occurrenceId };
                  return (
                    <tr
                      key={r.occurrenceId}
                      className={"border-t border-border " + (r.active ? "" : "opacity-50")}
                    >
                      <td className="tabular px-3 py-1 font-mono text-xs text-text-secondary">
                        {r.productionNumber ?? "–"}
                      </td>
                      <td className="max-w-0 truncate px-3 py-1 text-text-primary">
                        <Link
                          to="/prosjekt/$projectId/manus"
                          params={{ projectId }}
                          search={search}
                          className="hover:underline"
                          title={t("app-projects-duration-overview.duration-overview.title.46f425e77de1")}
                        >
                          {v ? formatHeading(v.heading) : ""}
                        </Link>
                        {r.discrepancy ? (
                          <AlertTriangle
                            className="ml-1.5 inline size-3.5 text-status-danger"
                            aria-label={t("app-projects-duration-overview.duration-overview.aria-label.7ebd73a4eb1e")}
                          />
                        ) : null}
                      </td>
                      <td className={"px-3 py-1 text-xs " + STATUS_CLASS[r.status]}>
                        {SCENE_STATUS_LABEL[r.status]}
                      </td>
                      <td className="tabular px-3 py-1 text-right text-text-secondary">
                        {e?.eighths ? formatEighths(e.eighths) : "–"}
                      </td>
                      <td className="tabular px-3 py-1 text-right text-text-secondary">
                        {e?.uncertain ? (
                          <span
                            className="text-status-uncertain"
                            data-testid="estimate-uncertain"
                            title={t("app-projects-duration-overview.duration-overview.title.fd6465b4f96e", { value1: String(formatDuration(e.lowSeconds)), value2: String(formatDuration(e.highSeconds)) })}
                          >
                            {formatDuration(e.lowSeconds)}–{formatDuration(e.highSeconds)}
                            <span className="ml-1 text-[11px]">{t("app-projects-duration-overview.duration-overview.span.dcdbf11ad01c")}</span>
                          </span>
                        ) : (
                          <>≈ {formatDuration(r.estimateSeconds)}</>
                        )}
                      </td>
                      <td className="px-3 py-0.5 text-right">
                        <PlannedInput
                          plannedSeconds={r.plannedSeconds}
                          disabled={!editable || !r.active}
                          label={t("app-projects-duration-overview.duration-overview.l-planlagt-lengde-for-scene-r-production-number-planned-length-for-scene-r-production-number-trim.e19867526e18", { value1: String(r.productionNumber ?? "") }).trim()}
                          onSave={(ms) =>
                            cmds.run(
                              {
                                type: "SetPlannedDuration",
                                occurrenceId: r.occurrenceId as never,
                                plannedMs: ms,
                              },
                              ms === null
                                ? t("app-projects-duration-overview.duration-overview.cmds-run.607f28aa589e")
                                : t("app-projects-duration-overview.duration-overview.cmds-run.2d653a83fa04", { value1: String(formatDuration(ms / 1000)) }),
                            )
                          }
                        />
                      </td>
                      <td className="tabular px-3 py-1 text-right text-text-primary">
                        {r.source === "estimate" ? "≈ " : ""}
                        {formatDuration(r.seconds)}
                        <span className="ml-1 text-[11px] text-text-tertiary">
                          {DURATION_SOURCE_LABEL[r.source]}
                        </span>
                      </td>
                      <td className="px-2 py-1">
                        <span className="flex items-center justify-end gap-0.5">
                          <Link
                            to="/prosjekt/$projectId/manus"
                            params={{ projectId }}
                            search={search}
                            aria-label={t("app-projects-duration-overview.duration-overview.aria-label.097dc4d3fe39")}
                            title={t("app-projects-duration-overview.duration-overview.title.2878323e34dd")}
                            className="rounded-sm p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
                          >
                            <FileText className="size-3.5" />
                          </Link>
                          <Link
                            to="/prosjekt/$projectId/scene"
                            params={{ projectId }}
                            search={search}
                            aria-label={t("app-projects-duration-overview.duration-overview.aria-label.510d15a17cf3")}
                            title={t("app-projects-duration-overview.duration-overview.title.f779d2f4447e")}
                            className="rounded-sm p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
                          >
                            <Layers className="size-3.5" />
                          </Link>
                          <Link
                            to="/prosjekt/$projectId/montering"
                            params={{ projectId }}
                            search={search}
                            aria-label={t("app-projects-duration-overview.duration-overview.aria-label.00cb23c5e696")}
                            title={t("app-projects-duration-overview.duration-overview.title.780649703fc0")}
                            className="rounded-sm p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
                          >
                            <Clapperboard className="size-3.5" />
                          </Link>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
