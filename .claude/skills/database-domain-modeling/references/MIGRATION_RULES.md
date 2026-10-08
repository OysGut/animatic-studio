# Migrasjonsregler

Grunnlag: ADR-0002, DEC-0008, DEC-0022, `LOVABLE_PLATFORM_NOTES.md` §2 («Lovable … kjører ikke migrasjonsfiler som kommer inn via Git»), ARCHITECTURE §7 (versjonstabell).

## 1. Filer
- Plassering: `db/migrations/` (DEC-0022). **Ikke** `supabase/migrations/`, og **aldri** `drizzle/` – `drizzle/` eies av Lovable og røres ikke.
- Navn: `NNNN_<kort_beskrivelse>.sql` med firesifret løpenummer, sortert i kjørerekkefølge. Eksempel: `0001_core.sql`, `0002_screenplay_import.sql`. Løpenummeret er det samme som `schema_version.version` filen registrerer.
- Én logisk endring per fil. Toppkommentar: formål, kilder (krav-ID-er, ADR/DEC), invarianter, at filen kjøres én gang og aldri endres (se toppen av `0001_core.sql`).
- Finner du filer Lovable selv har laget (f.eks. i `supabase/migrations/` eller `drizzle/`), endres de ikke; avvik rettes med en ny fil i `db/migrations/` og noteres i `SESSION_HANDOVER.md`.

## 2. Uforanderlighet
- En migrasjon som er pushet til `main` regnes som kjørt. **Den endres aldri.** Feil rettes med ny migrasjon.
- Ingen `drop table`/`drop column` på produksjonsdata uten beslutning (sletting av data = stopp og spør Mars, DEC-0006). Bruk heller ny kolonne + utfasing.

## 3. Innhold
- 0001 er skrevet uten `begin; … commit;` (Lovable kjører SQL-filen som den er). Om Lovable kjører filen som én transaksjon er **ikke verifisert**; skriv derfor filen slik at en feil midt i er lett å oppdage (versjonsvakt først, `schema_version`-rad sist), og vurder eksplisitt transaksjon når filen har flere uavhengige steg.
- Gjør filen trygg å kjøre én gang i et rent miljø og tydelig feilende ved gjentakelse: start med en vakt som stopper hvis versjonen allerede er registrert:
  ```sql
  do $$ begin
    if exists (select 1 from public.schema_version where version = 2) then
      raise exception 'schema_version 2 er allerede kjørt';
    end if;
  end $$;
  ```
  (Første migrasjon, `0001_core.sql`, oppretter `schema_version` og har ikke denne vakten.)
- Alle objekter fullt kvalifisert (`public.`, `private.`, `auth.`, `storage.`). Nye objekter med `create` (ikke `create or replace`), unntatt når filen bevisst erstatter en funksjon (f.eks. ny versjon av `public.apply_changes`).
- Ny tabell i samme fil: `enable row level security`, select-policy via `private.is_project_member`, `revoke insert, update, delete, truncate … from anon, authenticated`, `grant select … to authenticated`, indekser, triggere for uforanderlighet (mønstre i [RLS_PATTERNS](RLS_PATTERNS.md)). Skal tabellen kunne skrives av kommandoer, må `public.apply_changes` (tabellisten `v_tables`) og `TABLE_ORDER` i `src/core/patch.ts` utvides i samme leveranse.
- Ingen SQL-funksjoner per kommando: domenelogikken ligger i `src/core` (DEC-0022).
- Avslutt med:
  ```sql
  insert into public.schema_version (version, description) values (2, '0002_screenplay_import: …');
  ```

## 4. `schema_version`
```sql
create table public.schema_version (
  version int primary key,
  description text not null,
  applied_at timestamptz not null default now()
);
alter table public.schema_version enable row level security;
create policy schema_version_read on public.schema_version for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.schema_version from anon, authenticated;
grant select on public.schema_version to anon, authenticated;
```
Klienten har konstanten `EXPECTED_SCHEMA_VERSION` i `src/adapters/storage/project-rows.ts` (`checkSchema`, vist i `SchemaBanner`). Ved oppstart: les høyeste `version`. Lavere enn forventet → vis norsk melding «Databasen er ikke oppdatert ennå – send oppdateringsmeldingen i Lovable» og blokker skriving.

## 5. Testing og levering (Lovable Cloud)
1. Test lokalt før commit: `bun tests/db/run-db-tests.ts` mot lokal Postgres (`DATABASE_URL`, standard `postgres://postgres@localhost:54329/postgres`). Skriptet lager en ny testdatabase, kjører `tests/db/supabase-emulation.sql` (rollene `anon`/`authenticated`/`service_role`, `auth.uid()`) og deretter migrasjonen (i dag er `0001_core.sql` hardkodet – legg ny fil til i skriptet). Utvid testene for ny tabell/regel.
2. Commit migrasjonen med krav-ID i meldingen; Mars pusher med GitHub Desktop.
3. Mars ber Lovable kjøre SQL-filen `db/migrations/NNNN_navn.sql` **uendret** (fast tekst i `docs/development/LOVABLE_SYNC.md` og `lovable-development`). Lovable kjører ikke migrasjoner fra Git av seg selv.
4. Bekreft via appen (skjemaversjonssjekken) eller en lesetest. Noter resultatet i `SESSION_HANDOVER.md`.
5. Feiler kjøringen: ikke be Lovable «fikse» SQL-en. Lag rettet ny migrasjon.

## 6. Portabilitet
Skjemaet skal kunne gjenoppbygges i et eget Supabase-prosjekt eller lokal Postgres (DEC-0008, prinsipp 28). Unngå Lovable-spesifikke objekter i migrasjonene; bruk standard Postgres + Supabase-skjemaene `auth` og `storage`.
