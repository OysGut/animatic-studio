/**
 * Databaseversjonen i Lovable Cloud (samme spørring som SchemaBanner). Brukes til å skjule valg som krever en
 * nyere migrasjon, så eldre databaser fortsatt kan brukes til alt annet.
 */
import { useQuery } from "@tanstack/react-query";
import { checkSchema } from "@/adapters/storage/project-rows";
import { db } from "@/app/db";

/** Sann når databasen har minst denne versjonen. Ukjent (ikke hentet ennå) regnes som nei. */
export function useSchemaAtLeast(version: number): boolean {
  const { data } = useQuery({
    queryKey: ["schema-status"],
    queryFn: () => checkSchema(db),
    staleTime: 60_000,
  });
  return !!data && data.kind !== "missing" && data.version >= version;
}
