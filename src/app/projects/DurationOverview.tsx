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
import {
  DEFAULT_DURATION_ASSUMPTIONS,
  FILM_LANGUAGES,
  LANGUAGE_LABEL,
  MAIN_LANGUAGE,
  DURATION_SOURCE_LABEL,
  SCENE_STATUS_LABEL,
  estimateProduction,
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
} from "@/core";

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
      title="Planlagt lengde (m:ss eller sekunder). Tomt felt fjerner planen."
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
      a.kind === "main" ? -1 : b.kind === "main" ? 1 : a.name.localeCompare(b.name, "nb"),
    );
  const [productionId, setProductionId] = useState<string | null>(null);
  const [assumptions, setAssumptions] = useState<DurationAssumptions>(DEFAULT_DURATION_ASSUMPTIONS);
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

  const estimate = useMemo(() => {
    if (!pid) return null;
    const pagination = scriptPages(state, pid, { lockedPages: true });
    return estimateProduction(state, pid, assumptions, pagination);
  }, [state, pid, assumptions]);
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
    .sort((a, b) => a.name.localeCompare(b.name, "nb"));
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
          min={0}
          step={step}
          value={assumptions[k]}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= 0) setAssumptions({ ...assumptions, [k]: v });
          }}
          className="tabular h-7 w-20 rounded-sm border border-border-control bg-surface-3 px-2 text-right text-[13px] text-text-primary"
        />
        <span className="w-14 text-text-tertiary">{unit}</span>
      </span>
    </label>
  );
  const stat = (label: string, value: string, note: string) => (
    <div className="flex flex-col">
      <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
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
          Varighet og produksjonsstatus
        </h2>
        {productions.length > 1 ? (
          <select
            aria-label="Produksjon"
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
          <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
            Forventet lengde nå
          </p>
          <p className="tabular text-3xl font-semibold tracking-tight text-text-primary">
            {formatDuration(overview.expectedSeconds)}
          </p>
          <p className="mt-1 text-[13px] text-text-secondary">
            {overview.rows.length - overview.counts.inactive} aktive scener ·{" "}
            <span className="tabular">{formatEighths(estimate.activeEighths)}</span> sider
            {overview.counts.inactive
              ? ` · ${overview.counts.inactive} deaktiverte er ikke med`
              : ""}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {stat(
              "Bekreftet",
              formatDuration(overview.confirmedSeconds),
              "fra 2D-animatic og film",
            )}
            {stat(
              "Gjenstående",
              `≈ ${formatDuration(overview.remainingEstimatedSeconds)}`,
              "estimat og plan for resten",
            )}
            {stat(
              "Bare manusestimat",
              `≈ ${formatDuration(overview.estimatedSeconds)}`,
              "alle aktive scener",
            )}
          </div>
          <div
            className="mt-4 flex h-2 overflow-hidden rounded-sm bg-surface-3"
            role="img"
            aria-label={`Ferdig ${pct(overview.doneShare)}, bekreftet ${pct(confirmedNotDone)}, estimert ${pct(overview.estimatedShare)}`}
          >
            <span className="bg-status-success" style={{ width: `${overview.doneShare * 100}%` }} />
            <span className="bg-accent-brand" style={{ width: `${confirmedNotDone * 100}%` }} />
          </div>
          <p className="mt-1.5 flex flex-wrap gap-x-4 text-[11px] text-text-tertiary">
            <span>
              <span className="text-status-success">■</span> Ferdig film{" "}
              <span className="tabular text-text-secondary">{pct(overview.doneShare)}</span>
            </span>
            <span>
              <span className="text-accent-brand">■</span> Bekreftet ellers{" "}
              <span className="tabular text-text-secondary">{pct(confirmedNotDone)}</span>
            </span>
            <span>
              <span className="text-text-tertiary">■</span> Fortsatt estimert{" "}
              <span className="tabular text-text-secondary">{pct(overview.estimatedShare)}</span>
            </span>
          </p>
          <p className="mt-3 text-xs text-text-tertiary">
            Estimatene er anslag ut fra mengden dialog og handling og er usikre. Du kan sette en
            planlagt lengde per scene (Per scene → Plan); den brukes også i monteringen. Begge
            erstattes av den faktiske lengden når 2D-scenen får satt lengde eller filmen er lagt
            inn. Hver scene telles én gang.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 border border-border bg-surface-1 p-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
            Antakelser for estimatet
          </p>
          {num("dialogueWordsPerMinute", "Taletempo", 5, "ord/min")}
          {num("actionSecondsPerLine", "Handling per linje", 0.5, "sek")}
          {num("headingSeconds", "Per scene (etablering)", 0.5, "sek")}
          {num("minSceneSeconds", "Korteste scene", 1, "sek")}
          <button
            type="button"
            onClick={() => setAssumptions(DEFAULT_DURATION_ASSUMPTIONS)}
            className="mt-1 self-start text-xs text-accent-brand hover:underline"
          >
            Tilbakestill
          </button>
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
            Manusendringer
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
        Utvikling over tid
      </button>
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
            ({rows.length} av {overview.rows.length})
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
              placeholder="Søk i scenehoder …"
              aria-label="Søk i scenehoder"
              className={ctl + " w-52"}
            />
            <select
              aria-label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as SceneStatus | "")}
              className={ctl}
            >
              <option value="">Alle statuser</option>
              {(Object.keys(SCENE_STATUS_LABEL) as SceneStatus[]).map((s) => (
                <option key={s} value={s}>
                  {SCENE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <select
              aria-label="Karakter, objekt eller sted"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className={ctl + " max-w-56"}
            >
              <option value="">Alle karakterer, objekter og steder</option>
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
              Bare med manusendringer
            </label>
            <label
              className="flex items-center gap-1.5 text-xs text-text-secondary"
              title="Scener der 2D-scenen viser eldre bilder enn de som nå er godkjent"
            >
              <input
                type="checkbox"
                checked={onlyResourceChanges}
                onChange={(e) => setOnlyResourceChanges(e.target.checked)}
              />
              Bare med ressursendringer{changedScenes ? ` (${changedScenes})` : ""}
            </label>
            <select
              aria-label="Oversettelse"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={ctl}
            >
              <option value="">Alle språk</option>
              {FILM_LANGUAGES.filter((l) => l !== MAIN_LANGUAGE).map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABEL[l] ?? l}: ikke ferdig oversatt
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
                Nullstill filter
              </button>
            ) : null}
          </div>
          <div className="mt-2 max-h-[480px] overflow-y-auto border border-border bg-surface-1">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface-2 text-left text-[11px] uppercase tracking-[0.04em] text-text-tertiary">
                <tr>
                  <th className="w-14 px-3 py-1.5 font-medium">Nr.</th>
                  <th className="px-3 py-1.5 font-medium">Scene</th>
                  <th className="w-36 px-3 py-1.5 font-medium">Status</th>
                  <th className="w-16 px-3 py-1.5 text-right font-medium">Sider</th>
                  <th className="w-20 px-3 py-1.5 text-right font-medium">Estimat</th>
                  <th className="w-20 px-3 py-1.5 text-right font-medium">Plan</th>
                  <th className="w-32 px-3 py-1.5 text-right font-medium">Nå</th>
                  <th className="w-24 px-3 py-1.5 font-medium">
                    <span className="sr-only">Åpne</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-3 text-xs text-text-tertiary">
                      Ingen scener passer filteret.
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
                          title="Åpne scenen i manuset"
                        >
                          {v ? formatHeading(v.heading) : ""}
                        </Link>
                        {r.discrepancy ? (
                          <AlertTriangle
                            className="ml-1.5 inline size-3.5 text-status-danger"
                            aria-label="Manusendringer etter at 2D-scene eller film ble laget"
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
                        ≈ {formatDuration(r.estimateSeconds)}
                      </td>
                      <td className="px-3 py-0.5 text-right">
                        <PlannedInput
                          plannedSeconds={r.plannedSeconds}
                          disabled={!editable || !r.active}
                          label={`Planlagt lengde for scene ${r.productionNumber ?? ""}`.trim()}
                          onSave={(ms) =>
                            cmds.run(
                              {
                                type: "SetPlannedDuration",
                                occurrenceId: r.occurrenceId as never,
                                plannedMs: ms,
                              },
                              ms === null
                                ? "Fjern planlagt lengde"
                                : `Planlagt lengde ${formatDuration(ms / 1000)}`,
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
                            aria-label="Åpne i manuset"
                            title="Manus"
                            className="rounded-sm p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
                          >
                            <FileText className="size-3.5" />
                          </Link>
                          <Link
                            to="/prosjekt/$projectId/scene"
                            params={{ projectId }}
                            search={search}
                            aria-label="Åpne i sceneeditoren"
                            title="Sceneeditor"
                            className="rounded-sm p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
                          >
                            <Layers className="size-3.5" />
                          </Link>
                          <Link
                            to="/prosjekt/$projectId/montering"
                            params={{ projectId }}
                            search={search}
                            aria-label="Åpne i monteringen"
                            title="Montering"
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
