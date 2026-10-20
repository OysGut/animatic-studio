/**
 * Sporbarhet for en AI-jobb (DEC-0072, REQ-0257): systeminstruks, parametere, referanser med ressursversjon,
 * manusversjon og linjerevisjoner, tid, status og resultat. Viser også om manuslinjene er endret siden.
 */
import { locale, SYSTEM_INSTRUCTIONS, traceLines, traceOf, type GenerationJob, type ProjectState } from "@/core";
import { t as tk } from "@/core/i18n/keyed";

export function TraceDetails({ job, state }: { job: GenerationJob; state?: ProjectState }) {
  const t = traceOf(job.params);
  const when = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString(locale()) : "–";
  const changed = t && state ? changedSince(state, t.blockRevisions) : null;
  return (
    <dl
      aria-label={tk("app-ai-trace-details.trace-details.aria-label.3dc770f7e801")}
      className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-text-tertiary"
    >
      {t ? (
        traceLines(t).map((l, i) => (
          <Row key={l.label} label={l.label}>
            {i === 0 && t.systemInstruction && SYSTEM_INSTRUCTIONS[t.systemInstruction] ? (
              <details>
                <summary className="cursor-pointer">{l.text}</summary>
                <pre className="whitespace-pre-wrap font-mono text-text-secondary">
                  {SYSTEM_INSTRUCTIONS[t.systemInstruction]!.text}
                </pre>
              </details>
            ) : (
              l.text
            )}
          </Row>
        ))
      ) : (
        <Row label={tk("app-ai-trace-details.trace-details.label.8585dcb9a20b")}>
          {tk("app-ai-trace-details.trace-details.row.388e11567c38")}
        </Row>
      )}
      {changed !== null ? (
        <Row label={tk("app-ai-trace-details.trace-details.label.36e947a3649f")}>
          {changed === 0
            ? tk("app-ai-trace-details.trace-details.row.79db5b060319")
            : tk("app-ai-trace-details.lines-changed-since", { count: changed })}
        </Row>
      ) : null}
      <Row label={tk("app-ai-trace-details.trace-details.label.e794da85be0b")}>
        {job.provider} – {job.model}
      </Row>
      <Row label={tk("app-ai-trace-details.trace-details.label.4031ad12cb2e")}>{when(job.createdAt)}</Row>
      {job.startedAt ? <Row label={tk("app-ai-trace-details.trace-details.label.8965603b23ed")}>{when(job.startedAt)}</Row> : null}
      <Row label={tk("app-ai-trace-details.trace-details.label.fedd2d37fc9b")}>{when(job.finishedAt)}</Row>
      <Row label={tk("app-ai-trace-details.trace-details.label.316dd5d16071")}>
        {job.status}
        {job.error ? ` – ${job.error}` : ""}
      </Row>
      {job.resultPath ? (
        <Row label={tk("app-ai-trace-details.trace-details.label.b9046da73e5b")}>{job.resultPath.split("/").pop()}</Row>
      ) : null}
    </dl>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="min-w-0 break-words text-text-secondary">{children}</dd>
    </>
  );
}

function changedSince(s: ProjectState, revs: Readonly<Record<string, number>>): number | null {
  const ids = Object.keys(revs);
  if (ids.length === 0) return null;
  let n = 0;
  for (const id of ids) {
    const b = s.blocks[id];
    if (!b || b.removed || b.currentRev !== revs[id]) n++;
  }
  return n;
}
