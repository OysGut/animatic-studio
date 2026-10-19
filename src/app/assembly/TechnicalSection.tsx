/**
 * Teknisk visning (DEC-0072, REQ-0103): tidskoder, bildenummer, materiale, kilde-inn/-ut og filinformasjon for
 * scenen og delene. Slås av og på med «Teknisk» i verktøylinjen, så den vanlige visningen forblir enkel.
 */
import { L, playheadRows, technicalInfo, type FilmClip, type ProjectState } from "@/core";

export function TechnicalSection({
  state,
  clip,
  frame,
}: {
  state: ProjectState;
  clip: FilmClip;
  /** Avspillingshodet (bilde i filmen): vises som tid i film, scene, del og kilde (REQ-0105). */
  frame?: number;
}) {
  const info = technicalInfo(state, clip, state.project.fps);
  const here = frame === undefined ? null : playheadRows(state, clip, frame, state.project.fps);
  return (
    <section
      aria-label={L("Teknisk", "Technical")}
      className="flex flex-col gap-2 border-b border-border p-3"
    >
      <h2 className="-mx-3 flex h-8 shrink-0 items-center border-b border-border bg-surface-2 px-2 text-chrome-label font-medium uppercase tracking-label text-text-tertiary">
        {L("Teknisk", "Technical")}
      </h2>
      <Rows rows={info.scene} />
      {here ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium text-text-secondary">
            {L("Avspillingshodet", "Playhead")}
          </p>
          <Rows rows={here} />
        </div>
      ) : null}
      {info.parts.map((p) => (
        <div key={p.title} className="flex flex-col gap-0.5">
          <p className="truncate text-xs font-medium text-text-secondary">{p.title}</p>
          <Rows rows={p.rows} />
        </div>
      ))}
    </section>
  );
}

function Rows({ rows }: { rows: readonly { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-text-tertiary">{r.label}</dt>
          <dd className="min-w-0 break-words font-mono text-text-primary">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
