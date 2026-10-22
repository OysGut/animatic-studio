# S-1 – Sikkerhetsinnstramminger i Community

Migrasjon `db/migrations/0086_community_security.sql` er skrevet oppå 0085 og testet lokalt. **Ikke kjørt i Cloud og ikke publisert.** Ingen UI eller sperrede språk-/konto-/auth-filer er endret.

## Erstatter disse funksjonene

- `private.can_see_publication(uuid, uuid)` – e-posttreff krever nå `auth.users.email_confirmed_at is not null`. Bruker-ID-treff og prosjektmedlemskap er uendret.
- `public.publication_for_me(uuid)` – samme krav ved markering av e-postmottakerraden som sett. Tilgang via bruker-ID markerer ikke en ubekreftet e-postrad som sett.

Begge siste definisjoner er kopiert fra 0080; bare e-postbetingelsene er endret. `CREATE OR REPLACE` bevarer eksisterende funksjonsrettigheter. Migrasjonen registrerer skjemaversjon 86.

## Minste EXECUTE for authenticated

Beholdt fordi funksjonene kalles direkte i RLS-policyene:

| Funksjon | Direkte policyavhengighet i 0080 |
| --- | --- |
| `private.feature_enabled(text, uuid)` | `publication_recipients_read`, `review_comments_read` |
| `private.any_community(uuid)` | `user_blocks_own` |
| `private.blocked_between(uuid, uuid)` | `review_comments_read` |
| `private.can_see_publication(uuid, uuid)` | `publications_read`, `publication_recipients_read`, `publication_media_read`, `review_comments_read` |
| `private.is_project_editor(uuid, uuid)` | `publication_recipients_read` |

Fjernet fra `authenticated` (og eksplisitt fra `PUBLIC`/`anon`):

- `private.publication_open(text, timestamptz, timestamptz)` – bare nestede kall i security-definer-funksjoner, ingen direkte RLS-avhengighet.
- `private.valid_region(jsonb)` – CHECK ved kommentarinnsetting gjennom security-definer-RPC; klienten kan ikke skrive direkte.
- `private.valid_asset_rights(jsonb)` – CHECK ved privilegert skriving/apply_changes; klienten kan ikke skrive direkte.

`service_role` beholder EXECUTE på alle åtte, også for CHECK ved privilegert skriving. Full DB-suite bekrefter at kommentarer, ressursrettighetsvalidering, blokkering og mottakerpolicyer fortsatt virker. Ingen policyer eller valideringsregler er svekket.

## API-kontroll

Et faktisk GET-kall til Data API-et `/rest/v1/publications?select=id&limit=0` med prosjektets publiserbare nøkkel og `Accept-Profile: private` ga **HTTP 406, PGRST106, «Invalid schema: private»**. Det bekrefter at `private` ikke er eksponert som API-skjema i Cloud ved kontrollen 22.10.2026. Ingen innstillinger er endret. `current_setting` alene ga ingen verdi og ble ikke brukt som bevis.

## Tester

- **Full lokal DB: 164 bestått, 0 feilet**, inkludert fire nye S-1-tester i `tests/db/run-db-tests.ts`: ubekreftet e-post avvises, bekreftet e-post tillates, bruker-ID-treff beholdes uten å markere ubekreftet e-post sett, og eksakte EXECUTE-rettigheter/RLS kontrolleres.
- `tests/db/supabase-emulation.sql` har fått nullable `email_confirmed_at`, som finnes i ekte Auth. Den eksisterende 0080-testens bekreftede mottaker får eksplisitt bekreftelsesdato; forventningene er uendret.
- **Full Vitest: 2380 bestått, 2 feilet, 10 eksisterende hoppet over.** Én feil var tidsfølsom `audio-performance.test.ts` (3,90 ms mot 2 ms); separat omkjøring bestod **2/2** uten kodeendring.
- Gjenværende reell feil: `storage-contract.test.ts` forventer at `EXPECTED_SCHEMA_VERSION` følger siste migrasjon, men `src/adapters/storage/project-rows.ts` står fortsatt på 85. 0086 krever 86. Filen er ikke endret fordi oppdraget eksplisitt er «bare database og tester; ingen UI».
- Manuell typekontroll er ikke kjørt; siste automatiske byggestatus er **build OK**. Ingen nye grensesnitttekster eller språkfiler.

## Avvik og åpent spørsmål

Full Vitest er derfor ikke grønn ennå. Kan den eksisterende skjemakonstanten i `src/adapters/storage/project-rows.ts` oppdateres fra 85 til 86 som eneste endring utenfor database/tester? Testen er ikke svekket eller endret. Claude må kjøre 0086 i Cloud etter gjennomgang.

Arbeidsmetoden følger **animatic-arkitektur-og-data** og **animatic-testing**.

## Nøyaktig endrede filer

- `db/migrations/0086_community_security.sql` – ny sikkerhetsmigrasjon.
- `tests/db/run-db-tests.ts` – fire S-1-regresjoner og bekreftet 0080-fixture.
- `tests/db/supabase-emulation.sql` – emulert e-postbekreftelse.
- `docs/development/S1_REPORT.md` – denne rapporten.
- `roadmap.md` – S-1-status og blocker.