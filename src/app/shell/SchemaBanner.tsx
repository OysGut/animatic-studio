import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { EXPECTED_SCHEMA_VERSION } from "@/adapters/storage/project-rows";
import { fetchSchemaStatus } from "@/adapters/browser/project-data";

import { t } from "@/core/i18n/keyed";

/**
 * Viser et tydelig varsel hvis databasemigrasjonene ikke er kjørt i Lovable Cloud (KI-04, LOVABLE_SYNC.md B).
 */
export function SchemaBanner() {
  const { data } = useQuery({
    queryKey: ["schema-status"],
    queryFn: () => fetchSchemaStatus(),
    staleTime: 60_000,
  });
  if (!data || data.kind === "ok") return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-3 border-b border-status-discrepancy/40 bg-status-discrepancy-bg px-4 py-2 text-[13px] text-text-primary"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-discrepancy" aria-hidden />
      <p>
        {data.kind === "missing"
          ? t("app-shell-schema-banner.schema-banner.p.4f37935f6a82")
          : t("app-shell-schema-banner.schema-banner.p.ce6b8cbc90ba", { version: String(data.version), expected: String(data.expected) })}
        {t("app-shell-schema-banner.schema-banner.p.93683cf75008")}{" "}
        <span className="font-mono text-xs tabular">
          {String(EXPECTED_SCHEMA_VERSION).padStart(4, "0")}
        </span>
        .
      </p>
    </div>
  );
}
