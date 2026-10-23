# apply_changes: kjerne og valideringsfunksjoner (G-7)

`public.apply_changes` er delt i en liten kjerne og egne valideringsfunksjoner per domene (migrasjon 0099).

- **Kjernen** (autorisasjon, prosjektlås, revisjonskontroll, innsetting/oppdatering/sletting via `table_columns`, `change_log`) skal **aldri endres** for å ta inn en ny tabell eller et nytt valideringskrav.
- Nye valideringer lages som `private.validate_<domene>(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void` med `security definer set search_path = ''` og fullt kvalifiserte navn, og **registreres** i `private.apply_change_validators` (én rad per tabell den gjelder; `table_name null` = kjøres ved hver endring). `sort_order` styrer feilrekkefølgen.
- Trenger valideringen å vite hvilke rader i kallet som faktisk endrer referanser (slik at uendrede rader ved avvis/angre ikke blokkeres), lages en `private.prepare_<domene>(p_project uuid, p_changes jsonb) returns uuid[]` som kjøres **før** skriving og registreres i `preparer`-kolonnen.
- Valideringen avviser med `raise exception '<melding>' using errcode = '22023'`, nøyaktig som før.
- Hver ny validering skal ha en DB-test som kaller funksjonen direkte (positiv og negativ), pluss dekning gjennom `apply_changes`. Se testblokken «0099 G-7» i `tests/db/run-db-tests.ts`.
- **Tabellrekkefølgen** (0103) ligger i `private.apply_change_tables (table_name, insert_order, delete_order)`: foreldre får lavere `insert_order` og høyere `delete_order` enn barna. En ny prosjekttabell registreres med én rad der; kjernen endres ikke. DB-testen «0103» sjekker at kjernen ikke har hardkodede lister.
