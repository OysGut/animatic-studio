/**
 * Sporbarhet for en AI-jobb (DEC-0072, REQ-0257): systeminstruks, parametere, referanser med ressursversjon,
 * manusversjon og linjerevisjoner, tid, status og resultat. Viser også om manuslinjene er endret siden.
 */
import {
  SYSTEM_INSTRUCTIONS,
  traceLines,
  traceOf,
  type GenerationJob,
  type ProjectState,
} from "@/core";

export function TraceDetails({ job, state }: { job: GenerationJob; state?: ProjectState }) {
  const t = traceOf(job.params);
  const when = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString("nb-NO") : "–";
  const changed = t && state ? changedSince(state, t.blockRevisions) : null;
  return (
    <dl
      aria-label="Sporbarhet"
      className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-text-tertiary"
    >
      {t ? (
        traceLines(t).map((l) => (
          <Row key={l.label} label={l.label}>
            {l.label === "Systeminstruks" &&
            t.systemInstruction &&
            SYSTEM_INSTRUCTIONS[t.systemInstruction] ? (
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
        <Row label="Spor">Jobben er eldre enn sporingen (bare beskrivelse, modell og tid)</Row>
      )}
      {changed !== null ? (
        <Row label="Manuset nå">
          {changed === 0
            ? "Uendret siden jobben"
            : `${changed} ${changed === 1 ? "linje er" : "linjer er"} endret eller fjernet siden`}
        </Row>
      ) : null}
      <Row label="Modell">
        {job.provider} – {job.model}
      </Row>
      <Row label="Registrert">{when(job.createdAt)}</Row>
      {job.startedAt ? <Row label="Sendt">{when(job.startedAt)}</Row> : null}
      <Row label="Ferdig">{when(job.finishedAt)}</Row>
      <Row label="Status">
        {job.status}
        {job.error ? ` – ${job.error}` : ""}
      </Row>
      {job.resultPath ? <Row label="Resultat">{job.resultPath.split("/").pop()}</Row> : null}
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
