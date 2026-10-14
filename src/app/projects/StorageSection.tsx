/**
 * Lagring per kategori (DEC-0072, REQ-0415/0407): hva prosjektet består av og hvor mye plass det tar.
 */
import { HardDrive } from "lucide-react";
import { useMemo } from "react";
import { L, locale, storageOverview, type ProjectState } from "@/core";
import { useAiJobs } from "@/app/ai/use-ai-jobs";

const size = (b: number | null) =>
  b === null
    ? "–"
    : b >= 1e9
      ? `${(b / 1e9).toLocaleString(locale(), { maximumFractionDigits: 1 })} GB`
      : b >= 1e6
        ? `${(b / 1e6).toLocaleString(locale(), { maximumFractionDigits: 1 })} MB`
        : `${Math.round(b / 1e3).toLocaleString(locale())} kB`;

export function StorageSection({ state, projectId }: { state: ProjectState; projectId: string }) {
  const jobs = useAiJobs(projectId);
  const rows = useMemo(() => {
    const generated = new Set(
      (jobs.data?.jobs ?? []).flatMap((j) => (j.resultPath ? [j.resultPath] : [])),
    );
    return storageOverview(state, generated);
  }, [state, jobs.data]);
  return (
    <section aria-labelledby="storage-title" className="mt-10">
      <details>
        <summary className="flex cursor-pointer items-center gap-2">
          <HardDrive className="size-4 text-text-tertiary" aria-hidden />
          <h2 id="storage-title" className="text-base font-semibold text-text-primary">
            {L("Lagring", "Storage")}
          </h2>
          <span className="text-xs text-text-tertiary">
            {L(
              `${size(rows.reduce((t, r) => t + (r.bytes ?? 0), 0))} i filer`,
              `${size(rows.reduce((t, r) => t + (r.bytes ?? 0), 0))} in files`,
            )}
          </span>
        </summary>
        <table className="mt-2 w-full border border-border bg-surface-1 text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.04em] text-text-tertiary">
              <th className="px-3 py-1.5 font-medium">{L("Kategori", "Category")}</th>
              <th className="px-3 py-1.5 text-right font-medium">{L("Antall", "Count")}</th>
              <th className="px-3 py-1.5 text-right font-medium">{L("Størrelse", "Size")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category} className="border-b border-border last:border-b-0 align-top">
                <td className="px-3 py-1.5">
                  <span className="text-text-primary">{r.label}</span>
                  <span className="block text-xs text-text-tertiary">{r.note}</span>
                </td>
                <td className="tabular px-3 py-1.5 text-right text-text-secondary">
                  {r.count.toLocaleString(locale())}
                </td>
                <td className="tabular px-3 py-1.5 text-right text-text-secondary">
                  {size(r.bytes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
