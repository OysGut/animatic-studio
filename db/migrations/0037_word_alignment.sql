-- =====================================================================================
-- Animatic Studio – migrasjon 0037: ord-til-lyd (fase 2, bolk D, DEC-0095, REQ-0698).
-- asset_versions.alignment: koblingen mellom ordene i en replikk og tidsrom i opptaket – manusteksten den
-- gjelder, ett element per ord (start, slutt, usikkerhet, rettet for hånd), tjeneste og modell. Formatet er
-- det samme uansett tjeneste (ElevenLabs, senere andre, eller manuelt) og kontrolleres i domenekjernen.
-- Lydversjoner er ellers uforanderlige (REQ-0136): nå kan `removed`, `view`, `alignment` og `revision` endres;
-- selve lyden, komposisjonen og dataene endres aldri.
-- Jobber hos tjenesten logges i generation_jobs som «sound» med params.task = 'alignment' (ingen endring).
-- apply_changes er uendret: nye kolonner i kjente tabeller tas med automatisk (private.table_columns).
-- Ingen eksisterende data endres. Kjøres ÉN gang i Lovable Cloud etter 0036. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.asset_versions add column if not exists alignment jsonb
  check (alignment is null or (jsonb_typeof(alignment) = 'object' and pg_column_size(alignment) <= 400000));

create or replace function private.protect_asset_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'removed' - 'view' - 'alignment' - 'revision')
     is distinct from (to_jsonb(old) - 'removed' - 'view' - 'alignment' - 'revision') then
    raise exception 'Historikk kan ikke endres eller slettes (INV-13)' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.protect_asset_version() from public;

insert into public.schema_version (version, description)
  values (37, '0037_word_alignment: ord-til-lyd på lydversjoner');
