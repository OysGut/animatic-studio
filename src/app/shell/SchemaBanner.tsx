import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { checkSchema, EXPECTED_SCHEMA_VERSION } from "@/adapters/storage/project-rows";
import { db } from "@/app/db";

/**
 * Viser et tydelig varsel hvis databasemigrasjonene ikke er kjørt i Lovable Cloud (KI-04, LOVABLE_SYNC.md B).
 */
export function SchemaBanner() {
  const { data } = useQuery({
    queryKey: ["schema-status"],
    queryFn: () => checkSchema(db),
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
          ? "Databasen er ikke satt opp ennå. "
          : `Databasen har versjon ${data.version}, men appen trenger versjon ${data.expected}. `}
        Send synkmeldingen i Lovable (se{" "}
        <span className="font-mono text-xs">docs/development/LOVABLE_SYNC.md</span>, del B) for å
        kjøre migrasjon{" "}
        <span className="font-mono text-xs tabular">
          {String(EXPECTED_SCHEMA_VERSION).padStart(4, "0")}
        </span>
        .
      </p>
    </div>
  );
}
