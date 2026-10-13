/**
 * Hvordan forventet filmlengde har endret seg (mandat 7.4, REQ-0120). Lagrede estimater (migrasjon 0028)
 * vises med sine egne tall og antakelser – de regnes aldri på nytt. Manusversjoner uten lagret estimat regnes
 * på nytt fra versjonens tekst med dagens antakelser, og er tydelig merket slik. «Nå» er dagens tall.
 * Hentes først når brukeren åpner den (øyeblikksbildene kan være store).
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  formatDuration,
  formatDurationAssumptions,
  framesToSeconds,
  snapshotDuration,
  type DurationAssumptions,
  type ProjectState,
  type ScriptSnapshot,
} from "@/core";
import {
  DURATION_BASIS_LABEL,
  durationHistory,
  type DurationHistoryRow,
} from "@/core/screenplay/duration-snapshot";
import { listScriptVersionsWithSnapshots } from "@/adapters/browser/history-records";
import { useStoredEstimates } from "./use-history-records";

const MAX_VERSIONS = 30;

interface Row {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly created_at: string;
  readonly snapshot: ScriptSnapshot;
}

export function DurationHistory({
  state,
  productionId,
  assumptions,
  now,
}: {
  state: ProjectState;
  productionId: string;
  /** Dagens antakelser (brukes bare for versjoner uten lagret estimat). */
  assumptions: DurationAssumptions;
  /** Dagens tall (samme som oversikten over). */
  now: {
    readonly estimatedSeconds: number;
    readonly expectedSeconds: number;
    readonly confirmedSeconds: number;
    readonly scenes: number;
  };
}) {
  const versions = useQuery({
    queryKey: ["script-versions-with-snapshots", productionId],
    // Lagrede versjoner endres aldri; nye kommer bare når noen lagrer en versjon
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Row[]> =>
      (await listScriptVersionsWithSnapshots(productionId, MAX_VERSIONS)) as Row[],
  });
  // Lagrede estimater (tom liste før migrasjon 0028)
  const stored = useStoredEstimates(productionId, true);
  const rows = useMemo((): DurationHistoryRow[] => {
    const film = (takeId: string) => {
      const t = state.takes[takeId];
      return t && t.durationFrames ? framesToSeconds(t.durationFrames, state.project.fps) : null;
    };
    const byId = new Map((versions.data ?? []).map((v) => [v.id, v]));
    return durationHistory({
      versions: (versions.data ?? []).map((v) => ({
        id: v.id,
        number: v.number,
        name: v.name,
        createdAt: v.created_at,
      })),
      stored: stored.data ?? [],
      recompute: (id) => {
        const v = byId.get(id);
        return v
          ? snapshotDuration(v.snapshot, `v${v.number} ${v.name}`, v.created_at, film, assumptions)
          : null;
      },
      todayAssumptions: assumptions,
      now: { at: new Date().toISOString(), ...now },
    });
  }, [versions.data, stored.data, state.takes, state.project.fps, assumptions, now]);
  if (versions.isLoading || stored.isLoading)
    return (
      <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Henter manusversjoner og lagrede
        estimater …
      </p>
    );
  if (versions.isError || stored.isError)
    return (
      <p role="alert" className="text-xs text-status-danger">
        Historikken kunne ikke hentes:{" "}
        {((versions.error ?? stored.error) as Error | null)?.message ?? ""}
      </p>
    );
  if (rows.length < 2)
    return (
      <p className="text-xs text-text-tertiary">
        Ingen lagrede manusversjoner eller estimater ennå. Lagre en versjon i manuset («Versjoner»)
        eller trykk «Lagre estimat», så vises utviklingen her.
      </p>
    );
  const max = Math.max(...rows.map((p) => Math.max(p.expectedSeconds, p.estimatedSeconds)), 1);
  const anyRecomputed = rows.some((r) => r.basis === "recomputed");
  return (
    <div className="border border-border bg-surface-1">
      <table className="w-full text-[13px]">
        <caption className="sr-only">
          Forventet filmlengde over tid, per manusversjon og lagret estimat
        </caption>
        <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.04em] text-text-tertiary">
          <tr>
            <th className="px-3 py-1.5 font-medium">Versjon</th>
            <th className="w-28 px-3 py-1.5 font-medium">Dato</th>
            <th className="w-16 px-3 py-1.5 text-right font-medium">Scener</th>
            <th className="w-24 px-3 py-1.5 text-right font-medium">Estimat</th>
            <th className="w-24 px-3 py-1.5 text-right font-medium">Bekreftet</th>
            <th className="w-24 px-3 py-1.5 text-right font-medium">Forventet</th>
            <th className="w-20 px-3 py-1.5 text-right font-medium">Endring</th>
            <th className="w-32 px-3 py-1.5 font-medium">
              <span className="sr-only">Lengde</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const prev = rows[i - 1];
            const d = prev ? p.expectedSeconds - prev.expectedSeconds : 0;
            return (
              <tr
                key={`${p.estimateId ?? p.scriptVersionId ?? p.label}-${i}`}
                className="border-t border-border align-top"
              >
                <td className="max-w-0 px-3 py-1">
                  <span className="block truncate text-text-primary">{p.label}</span>
                  <span
                    className={
                      "block truncate text-[11px] " +
                      (p.basis === "recomputed" ? "text-status-uncertain" : "text-text-tertiary")
                    }
                    title={formatDurationAssumptions(p.assumptions)}
                  >
                    {p.basis === "now" ? "dagens tall" : DURATION_BASIS_LABEL[p.basis]}
                    {p.basis === "stored" ? ` · ${formatDurationAssumptions(p.assumptions)}` : ""}
                  </span>
                </td>
                <td className="tabular px-3 py-1 text-xs text-text-secondary">
                  {new Date(p.at).toLocaleDateString("nb-NO")}
                </td>
                <td className="tabular px-3 py-1 text-right text-text-secondary">{p.scenes}</td>
                <td className="tabular px-3 py-1 text-right text-text-secondary">
                  ≈ {formatDuration(p.estimatedSeconds)}
                </td>
                <td className="tabular px-3 py-1 text-right text-text-secondary">
                  {p.confirmedSeconds === null ? "–" : formatDuration(p.confirmedSeconds)}
                </td>
                <td className="tabular px-3 py-1 text-right text-text-primary">
                  {formatDuration(p.expectedSeconds)}
                </td>
                <td
                  className={
                    "tabular px-3 py-1 text-right text-xs " +
                    (!prev || d === 0
                      ? "text-text-tertiary"
                      : d > 0
                        ? "text-status-uncertain"
                        : "text-status-success")
                  }
                >
                  {!prev ? "–" : `${d > 0 ? "+" : d < 0 ? "−" : "±"}${formatDuration(Math.abs(d))}`}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className="block h-1.5 rounded-sm bg-accent-brand/70"
                    style={{ width: `${(p.expectedSeconds / max) * 100}%` }}
                    aria-hidden
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-border px-3 py-1.5 text-[11px] text-text-tertiary">
        Lagrede estimater viser tallene slik de var, med antakelsene som ble brukt da (2D-scenenes
        lengde, planlagt lengde og bekreftet lengde på den tiden).
        {anyRecomputed
          ? " Versjoner uten lagret estimat er regnet på nytt fra versjonens tekst med dagens antakelser; «Forventet» bruker da filmens lengde der versjonen hadde ferdig film, og bekreftet lengde er ukjent."
          : ""}
      </p>
    </div>
  );
}
