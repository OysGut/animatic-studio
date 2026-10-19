import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { EXPECTED_SCHEMA_VERSION } from "@/adapters/storage/project-rows";
import { fetchSchemaStatus } from "@/adapters/browser/project-data";
import { L } from "@/core";

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
          ? L("Databasen er ikke satt opp ennå. ", "The database is not set up yet. ")
          : L(
              `Databasen har versjon ${data.version}, men appen trenger versjon ${data.expected}. `,
              `The database is at version ${data.version}, but the app needs version ${data.expected}. `,
            )}
        {L("Kontakt administratoren for å oppdatere Animatic Studio til versjon", "Contact the administrator to update Animatic Studio to version")}{" "}
        <span className="font-mono text-xs tabular">
          {String(EXPECTED_SCHEMA_VERSION).padStart(4, "0")}
        </span>
        .
      </p>
    </div>
  );
}
