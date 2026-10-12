/**
 * Teknisk visning (DEC-0072, REQ-0103): tidskoder, bildenummer, materiale, kilde-inn/-ut og filinformasjon for
 * scenen og delene. Slås av og på med «Teknisk» i verktøylinjen, så den vanlige visningen forblir enkel.
 */
import { playheadRows, technicalInfo, type FilmClip, type ProjectState } from "@/core";

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
    <section aria-label="Teknisk" className="flex flex-col gap-2 border-b border-border p-3">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
        Teknisk
      </h2>
      <Rows rows={info.scene} />
      {here ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium text-text-secondary">Avspillingshodet</p>
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
