-- =====================================================================================
-- Animatic Studio – migrasjon 0069: stabile ID-er (REQ-0037, REQ-0022, REQ-0518), opphavet til en versjon.
-- Erstatter ingen funksjoner. apply_changes (0067), create_project (0067), delete_project (0066),
-- purge_project_assets (0067), purge_removed_assets (0065) og global_set_version_withdrawn (0068) er uendret:
-- apply_changes skriver kolonner tabellen har (private.table_columns), så den nye kolonnen trenger ingen endring.
-- Bare additiv:
--   * ny kolonne asset_versions.derived_from_version_id (uuid, nullable): versjonen bildet er frilagt fra eller
--     erstatter, som permanent ID i stedet for versjonsnummeret i merknaden («Frilagt fra v2»). Eldre rader får
--     ingen verdi (ingen tilbakefylling); appen slår nummeret i merknaden opp i samme variant ved lesing og
--     flagger uklare tilfeller. Kolonnen er uforanderlig som resten av versjonen (protect_asset_version).
--   * ny utsatt kontrolltrigger asset_versions_derived_from (constraint trigger after insert, deferrable
--     initially deferred, sjekkes ved commit så rekkefølgen i et kall eller en gjenoppretting ikke spiller noen
--     rolle): kilden må være en versjon av samme ressurs i samme prosjekt. Ingen fremmednøkkel, så eksplisitt opprydding (purge_*) og sletting av prosjektet virker som
--     før; en kilde som senere er ryddet bort, vises som ukjent.
-- Ingen nye filstier lagres (referansesjekken for oppryddingen er uendret). Sikkerhetskopien tar med kolonnen
-- (samme kolonner som databasen) og bytter ID-en ved gjenoppretting som andre ID-er.
-- Skrevet for gjennomgang; kjøres ikke i Cloud av Lovable.
-- =====================================================================================

alter table public.asset_versions add column if not exists derived_from_version_id uuid;
comment on column public.asset_versions.derived_from_version_id is
  'REQ-0037 (0069): versjonen denne er frilagt fra eller erstatter (samme ressurs). Null for eldre versjoner.';
create index if not exists asset_versions_derived_from_idx on public.asset_versions (derived_from_version_id)
  where derived_from_version_id is not null;

create or replace function private.check_asset_version_derivation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.derived_from_version_id is not null and (
    new.derived_from_version_id = new.id
    or not exists (
      select 1
      from public.asset_versions v
      join public.asset_variants sv on sv.id = v.variant_id
      join public.asset_variants nv on nv.id = new.variant_id
      where v.id = new.derived_from_version_id
        and v.project_id = new.project_id
        and sv.asset_id = nv.asset_id)) then
    raise exception 'Ugyldig kildeversjon' using errcode = '22023';
  end if;
  return null;
end $$;
revoke all on function private.check_asset_version_derivation() from public;

drop trigger if exists asset_versions_derived_from on public.asset_versions;
create constraint trigger asset_versions_derived_from after insert on public.asset_versions
  deferrable initially deferred
  for each row when (new.derived_from_version_id is not null)
  execute function private.check_asset_version_derivation();

insert into public.schema_version(version,description) values (69,'0069_version_derivation: opphavet til en versjon som permanent ID');
