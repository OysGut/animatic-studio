/**
 * AI-forbruk i prosjektet (DEC-0086): «Mitt forbruk i prosjektet» for alle med endringsrett og
 * «Prosjektet totalt» for eieren, med kostnadsrapport og eksport.
 */
import { useCallback, useState } from "react";
import { L, formatHeading, type CostJobRow, type ProjectState } from "@/core";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import { CostReportView } from "./CostReportView";
import { t } from "@/core/i18n/keyed";

export function ProjectCostSection({
  state,
  projectId,
  isOwner,
  generatedBy,
}: {
  state: ProjectState;
  projectId: string;
  isOwner: boolean;
  generatedBy: string;
}) {
  const ready = useSchemaAtLeast(33);
  const [scope, setScope] = useState<"mine" | "project">("mine");
  const subjectOf = useCallback(
    (r: CostJobRow) => {
      if (r.occurrenceId) {
        const o = state.occurrences[r.occurrenceId as never];
        const v = o ? state.variants[o.variantId] : undefined;
        if (v)
          return `${o!.productionNumber ? `${o!.productionNumber} ` : ""}${formatHeading(v.heading)}`;
      }
      if (r.assetId) return state.assets[r.assetId as never]?.name ?? "";
      return "";
    },
    [state],
  );
  if (!ready) return null;
  const tab = (on: boolean) =>
    "rounded-sm px-2 py-0.5 text-xs " +
    (on ? "bg-accent-selection text-text-primary" : "text-text-secondary hover:bg-surface-3");
  return (
    <section aria-labelledby="cost-title" className="mt-10" data-testid="project-cost">
      <div className="mb-2 flex items-center gap-3">
        <h2 id="cost-title" className="text-base font-semibold text-text-primary">
          {t("app-account-project-cost-section.project-cost-section.h2.6a56ead80637")}
        </h2>
        {isOwner ? (
          <div
            role="group"
            className="flex gap-0.5 rounded-sm border border-border bg-surface-1 p-0.5"
          >
            <button
              type="button"
              className={tab(scope === "mine")}
              aria-pressed={scope === "mine"}
              onClick={() => setScope("mine")}
            >
              {t("app-account-project-cost-section.project-cost-section.button.d1d7e14bdfbc")}
            </button>
            <button
              type="button"
              className={tab(scope === "project")}
              aria-pressed={scope === "project"}
              onClick={() => setScope("project")}
              data-testid="cost-scope-project"
            >
              {t("app-account-project-cost-section.project-cost-section.button.d937301e7b73")}
            </button>
          </div>
        ) : null}
      </div>
      <CostReportView
        key={scope}
        scope={scope}
        projectId={projectId}
        projectName={state.project.name}
        generatedBy={generatedBy}
        subjectOf={subjectOf}
      />
    </section>
  );
}
