/**
 * Teknisk visning (DEC-0072, REQ-0103): tidskoder, bildenummer, materiale, kilde-inn/-ut og filinformasjon for
 * scenen og delene. Slås av og på med «Teknisk» i verktøylinjen, så den vanlige visningen forblir enkel.
 */
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { playheadRows, technicalInfo, type FilmClip, type ProjectState } from "@/core";
import { t } from "@/core/i18n/keyed";

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
      aria-label={t("app-assembly-technical-section.technical-section.aria-label.281d8636e0b2")}
      className="flex flex-col gap-2 border-b border-border p-3"
    >
      <PanelHeader as="h2" className="-mx-3" title={t("app-assembly-technical-section.technical-section.title.281d8636e0b2")} />
      <Rows rows={info.scene} />
      {here ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium text-text-secondary">
            {t("app-assembly-technical-section.technical-section.p.2f8e82ad59f8")}
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
