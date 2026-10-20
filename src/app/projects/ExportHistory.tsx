/**
 * «Tidligere eksporter» (REQ-0037, migrasjon 0028): de siste fullførte eksportene i produksjonen, med type,
 * filnavn, innstillinger og tidspunkt. Bare visning; filene selv lagres ikke. Skjules med en eldre database.
 */
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { EXPORT_KIND_LABEL, describeExportSettings, type ExportKind } from "@/core/export-records";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import { L, locale, tm } from "@/core";
import { HISTORY_SCHEMA, useExportRecords } from "./use-history-records";
import { t } from "@/core/i18n/keyed";

export function ExportHistory({
  productionId,
  kinds,
}: {
  productionId: string;
  kinds: readonly ExportKind[];
}) {
  const schema = useSchemaAtLeast(HISTORY_SCHEMA);
  const [open, setOpen] = useState(false);
  const records = useExportRecords(productionId, kinds, open);
  if (!schema) return null;
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1 text-text-secondary hover:text-text-primary"
      >
        {open ? (
          <ChevronDown className="size-3.5" aria-hidden />
        ) : (
          <ChevronRight className="size-3.5" aria-hidden />
        )}
        {t("app-projects-export-history.export-history.button.7b7f29e97f13")}
      </button>
      {open ? (
        records.isLoading ? (
          <p className="mt-1 text-text-tertiary">{t("app-projects-export-history.export-history.p.013654029550")}</p>
        ) : records.isError ? (
          <p role="alert" className="mt-1 text-status-danger">
            {t("app-projects-export-history.export-history.p.5712e2679acd")}{" "}
            {tm((records.error as Error).message)}
          </p>
        ) : !records.data?.length ? (
          <p className="mt-1 text-text-tertiary">
            {t("app-projects-export-history.export-history.p.74fb6ed988a6")}
          </p>
        ) : (
          <ul className="mt-1 max-h-40 overflow-y-auto border border-border bg-surface-1">
            {records.data.map((r) => (
              <li key={r.id} className="border-t border-border px-2 py-1 first:border-t-0">
                <span className="flex items-baseline gap-2">
                  <span className="tabular shrink-0 text-text-tertiary">
                    {new Date(r.createdAt).toLocaleString(locale(), {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                  <span className="shrink-0 text-text-secondary">{EXPORT_KIND_LABEL[r.kind]}</span>
                  <span className="min-w-0 truncate text-text-primary" title={r.fileName}>
                    {r.fileName}
                  </span>
                </span>
                {describeExportSettings(r) ? (
                  <span className="block text-[11px] text-text-tertiary">
                    {describeExportSettings(r)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
