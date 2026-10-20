/** Kostnadsanslaget i en bekreftelse (REQ-0280): hva prisen bygger på, linje for linje. */
import { type CostLine } from "@/core";
import { t } from "@/core/i18n/keyed";

export function CostLines({ lines }: { lines: readonly CostLine[] }) {
  return (
    <dl
      aria-label={t("app-ai-cost-lines.cost-lines.aria-label.384fe72c59b3")}
      className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]"
    >
      {lines.map((l) => (
        <div key={l.label} className="contents">
          <dt className="text-text-tertiary">{l.label}</dt>
          <dd className="tabular text-text-primary">{l.value}</dd>
        </div>
      ))}
    </dl>
  );
}
