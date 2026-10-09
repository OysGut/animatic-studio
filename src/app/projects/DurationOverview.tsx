/**
 * Varighet på prosjektoversikten (REQ-0109, REQ-0115, REQ-0116, REQ-0495) – aldri i manusvisningen (REQ-0117).
 * Estimatet er et anslag ut fra dialog og handling; antakelsene vises og kan justeres.
 */
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import {
  DEFAULT_DURATION_ASSUMPTIONS,
  estimateProduction,
  formatDuration,
  formatEighths,
  formatHeading,
  orderedOccurrences,
  scriptPages,
  type DurationAssumptions,
  type ProjectState,
} from "@/core";

export function DurationOverview({ state }: { state: ProjectState }) {
  const productions = Object.values(state.productions)
    .filter((p) => orderedOccurrences(state, p.id).length > 0)
    .sort((a, b) =>
      a.kind === "main" ? -1 : b.kind === "main" ? 1 : a.name.localeCompare(b.name, "nb"),
    );
  const [productionId, setProductionId] = useState<string | null>(null);
  const [assumptions, setAssumptions] = useState<DurationAssumptions>(DEFAULT_DURATION_ASSUMPTIONS);
  const [showScenes, setShowScenes] = useState(false);
  const pid = productionId ?? productions[0]?.id ?? null;

  const estimate = useMemo(() => {
    if (!pid) return null;
    const pagination = scriptPages(state, pid, { lockedPages: true });
    return estimateProduction(state, pid, assumptions, pagination);
  }, [state, pid, assumptions]);

  if (!pid || !estimate) return null;
  const inactive = estimate.scenes.filter((x) => !x.active);
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

  return (
    <section aria-labelledby="dur-title" className="mt-10">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="dur-title" className="text-base font-semibold text-text-primary">
          Varighet <span className="text-[13px] font-normal text-text-tertiary">(estimat)</span>
        </h2>
        {productions.length > 1 ? (
          <select
            aria-label="Produksjon"
            value={pid}
            onChange={(e) => setProductionId(e.target.value)}
            className="h-7 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
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
          <p className="tabular text-3xl font-semibold tracking-tight text-text-primary">
            {formatDuration(estimate.activeSeconds)}
          </p>
          <p className="mt-1 text-[13px] text-text-secondary">
            {estimate.scenes.length - inactive.length} aktive scener ·{" "}
            <span className="tabular">{formatEighths(estimate.activeEighths)}</span> sider
            {inactive.length ? ` · ${inactive.length} deaktiverte er ikke med` : ""}
          </p>
          <p className="mt-3 text-xs text-text-tertiary">
            Anslag ut fra mengden dialog og handling. Ferdig animatic og film gir egne, faktiske
            varigheter senere.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 border border-border bg-surface-1 p-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
            Antakelser
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
      </button>
      {showScenes ? (
        <div className="mt-2 max-h-[420px] overflow-y-auto border border-border bg-surface-1">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-surface-2 text-left text-[11px] uppercase tracking-[0.04em] text-text-tertiary">
              <tr>
                <th className="w-14 px-3 py-1.5 font-medium">Nr.</th>
                <th className="px-3 py-1.5 font-medium">Scene</th>
                <th className="w-20 px-3 py-1.5 text-right font-medium">Sider</th>
                <th className="w-20 px-3 py-1.5 text-right font-medium">Replikkord</th>
                <th className="w-20 px-3 py-1.5 text-right font-medium">Estimat</th>
              </tr>
            </thead>
            <tbody>
              {estimate.scenes.map((x) => {
                const o = state.occurrences[x.occurrenceId]!;
                const v = state.variants[o.variantId];
                return (
                  <tr
                    key={x.occurrenceId}
                    className={"border-t border-border " + (x.active ? "" : "opacity-50")}
                  >
                    <td className="tabular px-3 py-1 font-mono text-xs text-text-secondary">
                      {x.productionNumber ?? "–"}
                    </td>
                    <td className="truncate px-3 py-1 text-text-primary">
                      {v ? formatHeading(v.heading) : ""}
                      {x.active ? null : (
                        <span className="ml-2 text-xs text-text-tertiary">
                          deaktivert – ikke med
                        </span>
                      )}
                    </td>
                    <td className="tabular px-3 py-1 text-right text-text-secondary">
                      {x.eighths ? formatEighths(x.eighths) : "–"}
                    </td>
                    <td className="tabular px-3 py-1 text-right text-text-secondary">
                      {x.dialogueWords}
                    </td>
                    <td className="tabular px-3 py-1 text-right text-text-primary">
                      {formatDuration(x.seconds)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
