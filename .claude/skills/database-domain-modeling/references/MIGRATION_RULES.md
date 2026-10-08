# Migrasjonsregler

Grunnlag: ADR-0002, DEC-0008, `LOVABLE_PLATFORM_NOTES.md` §2 («Lovable … kjører ikke migrasjonsfiler som kommer inn via Git»), ARCHITECTURE §7 (versjonstabell).

## 1. Filer
- Plassering: `supabase/migrations/`.
- Navn: `<YYYYMMDDHHMMSS>_<kort_beskrivelse>.sql` (Supabase-CLI-konvensjonen, sorteres kronologisk). Eksempel: `20261015093000_scene_occurrences.sql`.
- Én logisk endring per fil. Toppkommentar: formål, krav-ID-er, invarianter, ny skjemaversjon.
- Lovable kan selv lage filer i `supabase/migrations/` (og `drizzle/migrations/`). Slike filer endres aldri; avvik rettes med en ny fil og noteres i `SESSION_HANDOVER.md`.

## 2. Uforanderlighet
- En migrasjon som er pushet til `main` regnes som kjørt. **Den endres aldri.** Feil rettes med ny migrasjon.
- Ingen `drop table`/`drop column` på produksjonsdata uten beslutning (sletting av data = stopp og spør Mars, DEC-0006). Bruk heller ny kolonne + utfasing.

## 3. Innhold
- Skriv eksplisitt transaksjon (`begin; … commit;`) med mindre en setning ikke kan kjøres i transaksjon. Om Lovable kjører filen som én transaksjon er **ikke verifisert**.
- Gjør filen trygg å kjøre én gang i et rent miljø og tydelig feilende ved gjentakelse: start med en vakt som stopper hvis versjonen allerede er registrert:
  ```sql
  do $$ begin
    if exists (select 1 from public.schema_version where version = 7) then
      raise exception 'schema_version 7 er allerede kjørt';
    end if;
  end $$;
  ```
  (Første migrasjon oppretter `schema_version` og har ikke denne vakten.)
- Alle objekter fullt kvalifisert (`public.`, `private.`, `auth.`, `storage.`).
- Ny tabell i samme fil: `enable row level security`, policyer, indekser, `revoke`/`grant`, triggere for uforanderlighet.
- Avslutt med:
  ```sql
  insert into public.schema_version (version, description) values (7, 'scene_occurrences');
  ```

## 4. `schema_version`
```sql
create table public.schema_version (
  version int primary key,
  description text not null,
  applied_at timestamptz not null default now()
);
alter table public.schema_version enable row level security;
create policy schema_version_read on public.schema_version for select to authenticated using (true);
```
Klienten har en konstant `EXPECTED_SCHEMA_VERSION` i `src/adapters/storage/`. Ved oppstart: les `max(version)`. Lavere enn forventet → vis norsk melding «Databasen er ikke oppdatert ennå – send oppdateringsmeldingen i Lovable» og blokker skriving.

## 5. Levering (Lovable Cloud)
1. Commit migrasjonen med krav-ID i meldingen; Mars pusher med GitHub Desktop.
2. Mars sender den faste meldingen fra `docs/development/LOVABLE_SYNC.md` i Lovable (kjør ventende migrasjoner uten å endre innholdet; deploy funksjoner).
3. Bekreft via appen (skjemaversjonssjekken) eller en lesetest. Noter resultatet i `SESSION_HANDOVER.md`.
4. Feiler kjøringen: ikke be Lovable «fikse» SQL-en. Lag rettet ny migrasjon.

## 6. Portabilitet
Skjemaet skal kunne gjenoppbygges i et eget Supabase-prosjekt eller lokal Postgres (DEC-0008, prinsipp 28). Unngå Lovable-spesifikke objekter i migrasjonene; bruk standard Postgres + Supabase-skjemaene `auth` og `storage`.
