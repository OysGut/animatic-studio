/**
 * Hvordan forventet filmlengde har endret seg (mandat 7.4, REQ-0120): ett punkt per lagret manusversjon
 * (estimat fra versjonens tekst og forventet lengde med filmen som fantes da) og dagens tall. Hentes først
 * når brukeren åpner den (øyeblikksbildene kan være store).
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  formatDuration,
  framesToSeconds,
  snapshotDuration,
  type DurationAssumptions,
  type DurationHistoryPoint,
  type ProjectState,
  type ScriptSnapshot,
} from "@/core";
import { db } from "@/app/db";

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
  assumptions: DurationAssumptions;
  /** Dagens tall (samme som oversikten over). */
  now: {
    readonly estimatedSeconds: number;
    readonly expectedSeconds: number;
    readonly scenes: number;
  };
}) {
  const versions = useQuery({
    queryKey: ["script-versions-with-snapshots", productionId],
    // Lagrede versjoner endres aldri; nye kommer bare når noen lagrer en versjon
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await db
        .from("script_versions")
        .select("id, number, name, created_at, snapshot")
        .eq("production_id", productionId)
        .order("number", { ascending: false })
        .limit(MAX_VERSIONS);
      if (error) throw new Error(error.message);
      return ((data ?? []) as Row[]).reverse();
    },
  });
  const points = useMemo((): DurationHistoryPoint[] => {
    const film = (takeId: string) => {
      const t = state.takes[takeId];
      return t && t.durationFrames ? framesToSeconds(t.durationFrames, state.project.fps) : null;
    };
    return [
      ...(versions.data ?? []).map((v) =>
        snapshotDuration(v.snapshot, `v${v.number} ${v.name}`, v.created_at, film, assumptions),
      ),
      { label: "Nå", at: new Date().toISOString(), ...now },
    ];
  }, [versions.data, state.takes, state.project.fps, assumptions, now]);
  if (versions.isLoading)
    return (
      <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Henter manusversjonene …
      </p>
    );
  if (versions.isError)
    return (
      <p role="alert" className="text-xs text-status-danger">
        Manusversjonene kunne ikke hentes: {(versions.error as Error).message}
      </p>
    );
  if (points.length < 2)
    return (
      <p className="text-xs text-text-tertiary">
        Ingen lagrede manusversjoner ennå. Lagre en versjon i manuset («Versjoner»), så vises
        utviklingen her.
      </p>
    );
  const max = Math.max(...points.map((p) => Math.max(p.expectedSeconds, p.estimatedSeconds)), 1);
  return (
    <div className="border border-border bg-surface-1">
      <table className="w-full text-[13px]">
        <caption className="sr-only">Forventet filmlengde per manusversjon</caption>
        <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.04em] text-text-tertiary">
          <tr>
            <th className="px-3 py-1.5 font-medium">Versjon</th>
            <th className="w-28 px-3 py-1.5 font-medium">Dato</th>
            <th className="w-16 px-3 py-1.5 text-right font-medium">Scener</th>
            <th className="w-24 px-3 py-1.5 text-right font-medium">Estimat</th>
            <th className="w-24 px-3 py-1.5 text-right font-medium">Forventet</th>
            <th className="w-20 px-3 py-1.5 text-right font-medium">Endring</th>
            <th className="w-40 px-3 py-1.5 font-medium">
              <span className="sr-only">Lengde</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => {
            const prev = points[i - 1];
            const d = prev ? p.expectedSeconds - prev.expectedSeconds : 0;
            return (
              <tr key={`${p.label}-${i}`} className="border-t border-border">
                <td className="max-w-0 truncate px-3 py-1 text-text-primary">{p.label}</td>
                <td className="tabular px-3 py-1 text-xs text-text-secondary">
                  {new Date(p.at).toLocaleDateString("nb-NO")}
                </td>
                <td className="tabular px-3 py-1 text-right text-text-secondary">{p.scenes}</td>
                <td className="tabular px-3 py-1 text-right text-text-secondary">
                  ≈ {formatDuration(p.estimatedSeconds)}
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
                <td className="px-3 py-1">
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
        Estimatet regnes fra teksten i hver versjon med dagens antakelser. «Forventet» bruker
        filmens lengde der versjonen hadde ferdig film; 2D-scenenes og planens lengde på den tiden
        er ikke lagret, og «Nå» bruker alt som finnes i dag.
      </p>
    </div>
  );
}
