-- =====================================================================================
-- Animatic Studio – migrasjon 0030: vinkel på bilder og visuelle faktaark (DEC-0080).
-- Funn fra Mars 13.–14.10.2026:
-- 1. asset_versions.view: vinkelen et bilde viser (front, tre kvart, side, bak, portrett, karakterark).
--    Merkes i stor visning og brukes når andre vinkler lages med AI. Bildeversjoner er ellers uforanderlige
--    (REQ-0136): bare `removed`, `view` og `revision` kan endres; selve bildet og dataene endres aldri.
-- 2. assets.visual_brief: kort, engelsk beskrivelse av hvordan ressursen ser ut (laget fra manuset og rettet
--    av brukeren). Brukes i bildebeskrivelsene i stedet for rå manusutdrag.
-- Ingen eksisterende data endres (nye kolonner har standardverdier som betyr «som før»).
-- apply_changes er uendret: nye kolonner i kjente tabeller tas med automatisk (private.table_columns).
-- Kjøres ÉN gang i Lovable Cloud etter 0029. Endres aldri etter kjøring.
-- =====================================================================================

-- ---------- 1. Vinkel på bilder ----------
alter table public.asset_versions add column if not exists view text
  check (view is null or view in ('front', 'three_quarter', 'side', 'three_quarter_back', 'back', 'portrait', 'sheet'));

-- En bildeversjon endres aldri – bortsett fra merkene «slettet» og «vinkel» (og revisjonen som følger med)
create or replace function private.protect_asset_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'removed' - 'view' - 'revision')
     is distinct from (to_jsonb(old) - 'removed' - 'view' - 'revision') then
    raise exception 'Historikk kan ikke endres eller slettes (INV-13)' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.protect_asset_version() from public;
drop trigger if exists asset_versions_immutable on public.asset_versions;
create trigger asset_versions_immutable before update on public.asset_versions
  for each row execute function private.protect_asset_version();

-- ---------- 2. Visuelt faktaark ----------
alter table public.assets add column if not exists visual_brief text not null default ''
  check (char_length(visual_brief) <= 4000);

insert into public.schema_version (version, description)
  values (30, '0030_views_visual_brief: vinkel på bilder og visuelle faktaark');