# G-3 Global bruk – rapport (leveranse 1)

Dato: 23.10.2026. Ikke publisert. Ny migrasjon `db/migrations/0094_g3_global.sql` (0093 er urørt). Ingen betalte kall.

## Kontroller
- Typekontroll (tsgo): 0 feil.
- Full Vitest: 2 798 bestått + 1 rettet (plakatbryting), 0 feilet, 10 hoppet over. Nye tester: `tests/unit/g3-global.test.ts` (19).
- DB-tester (lokal Postgres med 0001–0094): 190 bestått, 0 feilet. Ny test for tidssonegrenser.
- i18n-sjekk: 0 tekster uten engelsk. Ingen nye tekster i grensesnittet i denne leveransen.

## 1. Ordtelling og varighet
- Ny `src/core/language/text-metrics.ts`: `countWords`, `segmentWords`, `segmentAll`, `countGraphemes`, `graphemes` (Intl.Segmenter; mellomrom som reserve hvis Segmenter mangler).
- Tatt i bruk i `assembly/film.ts`, `screenplay/forecast.ts`, `screenplay/duration.ts`, `language/index.ts`, `presentation/metrics.ts` (plakatbryting uten mellomrom bruker ordgrenser; lange ord deles i grafemer) og søket i `library/global.ts`.
- `parse.ts:120` (første ord i en linje) og `translation/index.ts:198` er ikke telling og ble ikke endret.
- Talehastighet: `DEFAULT_SPEECH_RATES` – tegn per sekund for ja (7), zh (4,5) og ko (5,5), ord per minutt ellers (en 150, nb 140, de 130, fr 155, es 160, ar 120 …). Kilde: Pellegrino, Coupé og Marsico (2011), *Language* 87(3), og Brysbaert (2019), avrundet ned til dialogtempo. `speechRateFor(lang, overrides)` tar prosjektoverstyring først, med validering i `speechRateError`.
- Valg: varighetsestimatet beholder prosjektets eksisterende `dialogueWordsPerMinute` for ordspråk (så tallene for norske og engelske prosjekter er uendret). For ja, zh og ko brukes tegn per sekund. Selve feltet for overstyring i prosjektinnstillingene kommer i leveranse 2 (krever endring i `apply_changes`).
- Testet med ja, zh, th og ar.

## 2. Sceneoverskrifter
- Ny `src/core/screenplay/heading-keywords.ts`: sett for en, nb, nn, sv, da, de, fr, es, it, pt, nl, pl, ru, ja, zh, ko og tr. `headingWords(sourceLanguage, projectWords)` gir kildespråket først, så prosjektets egne ord, så alle andre sett.
- PDF/DOCX-tolkingen (`parse.ts`) og Fountain (`fountain.ts`) bruker settene. `parseFountain(source, { sourceLanguage, headingWords })`.
- Tvungen overskrift med punktum foran virker alltid.
- Valg: ved Fountain-eksport skrives bare internasjonale innledninger (INT, EXT, EST, I/E) uten punktum. Andre får punktum, så filen leses riktig i andre programmer. Rundturtesten bekrefter dette.

## 3, 4 og 7. Manusformat, papir og innstillingshierarki (kjerne)
- Ny `src/core/settings/resolve.ts`: `resolveSettings({ user, workspace, project, country })` for språk, enheter, papir, valuta, tidssone, manusformat, eksportnavn og prosjektkode. Hver verdi har en kilde: `project`, `workspace`, `user`, `country` eller `default`.
- Land (B-097) gir standardverdier: Letter og «US Letter, Courier 12» for USA, Canada, Mexico og andre Letter-land; ellers A4 og «A4 Europa». Både enheter og valuta følger også landet. «Én side er ett minutt» er en egen bryter i formatet, og egendefinert format har sekunder per side.
- Gjenstår (leveranse 2): lagring av prosjektnivået (gjennom `apply_changes`, med den siste definisjonen kopiert ordrett), innstillingsflater og papirvalg i rigg, plakat, X-sheet og PDF.

## 5. Valuta
- 0094 oppretter `public.fx_rates` (base, quote, dato, kurs, kilde, hentet). Innloggede kan lese, og bare service role kan skrive.
- Valg: grunnlaget lagres fortsatt i leverandørens valuta (`cost_usd`), og ingenting omregnes i databasen. Omregning skjer ved visning og eksport, med kilde og dato.
- Gjenstår (leveranse 2): en serverfunksjon som henter dagskurser fra en gratis kilde uten nøkkel (forslag: ECBs daglige referansekurser) og bufrer dem i `fx_rates`, pluss valutavalg i kostnadsvisning og eksport.

## 6. Tidssoner
- `profiles.time_zone` og `workspaces.time_zone` (IANA, kontrollert mot `pg_timezone_names`).
- `private.budget_time_zone(project)` bruker arbeidsgruppens tidssone. Uten arbeidsgruppe brukes tidssonen til eieren (`created_by`), ellers UTC. Valg: «brukerens» tidssone tolkes som eierens, så alle medlemmer får samme grense.
- `private.budget_period_start(project, 'day'|'month', at)`: starten på perioden regnes eksplisitt i lokal tid, også ved sommertid.
- DB-test: grensene rundt midnatt og månedsskifte i Pacific/Auckland (UTC+13) og America/Los_Angeles (UTC−8).
- Gjenstår (leveranse 2): eksisterende kvotefunksjoner (0061, 0063, 0065 m.fl.) bruker fortsatt `date_trunc('month', now() at time zone 'UTC')`. De må erstattes i en ny migrasjon, med de siste definisjonene kopiert ordrett. Det ble ikke gjort nå, fordi funksjonene er store og regelen krever ordrett kopi og egen gjennomgang.

## 8. Region
- `workspaces.region` (text, `^[a-z0-9-]{2,32}$`). Feltet lagres bare; ingenting flyttes.

## 9. E-post på mottakerens språk
- Ikke bygget. Begrensning: innloggings-e-postene (bekreftelse, magisk lenke, tilbakestilling) bruker felles maler i Lovable Cloud. Språket kan bare styres hvis appen har egne e-postmaler for innlogging (hvor malen kan lese språk fra brukerens metadata) og et e-postdomene er satt opp. Invitasjoner sendes av appen og kan følge mottakerens språk når det er kjent. Ukjent mottaker får invitørens språk med engelsk som reserve. Forslag til leveranse 2: legg språket i metadata ved registrering og oppsett av egne maler.

## Funksjoner, tabeller og policyer i 0094
- Nye kolonner: `profiles.time_zone`, `workspaces.time_zone`, `workspaces.region`, `workspaces.settings`.
- Nye funksjoner: `private.is_iana_time_zone`, `private.budget_time_zone`, `private.budget_period_start`, `public.set_my_time_zone`, `public.set_workspace_settings` (bare eier, security definer).
- Ny tabell: `public.fx_rates` med policyen `fx_rates_read`.
- `schema_version` 94, `EXPECTED_SCHEMA_VERSION` 94. `apply_changes`, `delete_project` og `purge_*` er uendret.

## AGENTS.md
- Regel 69 er flyttet til `docs/agents/AUTH.md`. Ny regel 71 viser til `docs/agents/G3_GLOBAL.md`. Utenfor LOVABLE-blokken er filen nå 12 266 byte (grense 12 288).

## Endrede filer
- Ny: `src/core/language/text-metrics.ts`, `src/core/screenplay/heading-keywords.ts`, `src/core/settings/resolve.ts`, `db/migrations/0094_g3_global.sql`, `tests/unit/g3-global.test.ts`, `docs/agents/AUTH.md`, `docs/agents/G3_GLOBAL.md`, denne rapporten.
- Endret: `src/core/assembly/film.ts`, `src/core/screenplay/forecast.ts`, `src/core/screenplay/duration.ts`, `src/core/screenplay/parse.ts`, `src/core/screenplay/fountain.ts`, `src/core/language/index.ts`, `src/core/presentation/metrics.ts`, `src/core/library/global.ts`, `src/adapters/storage/project-rows.ts`, `tests/db/run-db-tests.ts`, `tests/architecture/g1b-no-hardcoded-norwegian.test.ts`, `scripts/i18n/references.v1.json`, `AGENTS.md`, `roadmap.md`.

## Rettelse før kjøring av 0094 (23.10, fra Claudes gjennomgang)
- Alle SECURITY DEFINER-funksjoner i 0094 (`budget_time_zone`, `budget_period_start`, `set_my_time_zone`, `set_workspace_settings`) og hjelpefunksjonen `is_iana_time_zone` bruker nå `set search_path = ''`, som resten av databasen. Alle navn er fullt kvalifisert: `pg_catalog.pg_timezone_names`, `pg_catalog.now()`, `pg_catalog.date_trunc`, `public.…` og `auth.uid()`.
- De fem nye funksjonene i 0095 fikk samme rettelse, slik at kontrollen under ikke slår ut på dem.
- Ny DB-test i `tests/db/run-db-tests.ts` spør `pg_proc` og feiler hvis en SECURITY DEFINER-funksjon i `public` eller `private` mangler `search_path=''`. Testen er grønn: 0 avvik i hele databasen.
- DB-tester: 193 bestått, 0 feilet. **0094 er klar til at Claude gjennomgår og kjører den i Cloud.**
