# apply_changes: kjerne og valideringsfunksjoner (G-7)

`public.apply_changes` er delt i en liten kjerne og egne valideringsfunksjoner per domene (migrasjon 0099).

- **Kjernen** (autorisasjon, prosjektlås, revisjonskontroll, innsetting/oppdatering/sletting via `table_columns`, `change_log`) skal **aldri endres** for å ta inn en ny tabell eller et nytt valideringskrav.
- Nye valideringer lages som `private.validate_<domene>(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void` med `security definer set search_path = ''` og fullt kvalifiserte navn, og **registreres** i `private.apply_change_validators` (én rad per tabell den gjelder; `table_name null` = kjøres ved hver endring). `sort_order` styrer feilrekkefølgen.
- Trenger valideringen å vite hvilke rader i kallet som faktisk endrer referanser (slik at uendrede rader ved avvis/angre ikke blokkeres), lages en `private.prepare_<domene>(p_project uuid, p_changes jsonb) returns uuid[]` som kjøres **før** skriving og registreres i `preparer`-kolonnen.
- Valideringen avviser med `raise exception '<melding>' using errcode = '22023'`, nøyaktig som før.
- Hver ny validering skal ha en DB-test som kaller funksjonen direkte (positiv og negativ), pluss dekning gjennom `apply_changes`. Se testblokken «0099 G-7» i `tests/db/run-db-tests.ts`.
