-- =====================================================================================
-- From Pen to Glass – migrasjon 0089: tekstversjoner av bildebeskrivelsen (Øystein 23.10). Additiv oppå 0088.
--   1. assets.brief_versions (jsonb-liste {id, text, createdAt}, høyst 50, 8000 tegn hver) og assets.active_brief_id:
--      brukerens egne beskrivelser i karakterdialogen, så teksten aldri går tapt. Aldri serverprompten.
--   2. asset_versions.brief_version_id: tekstversjonen bildet ble generert fra (settes bare ved innsetting;
--      protect_asset_version er uendret, så bildeversjoner forblir uforanderlige).
-- Ingen eksisterende data endres (standardverdiene betyr «som før»). Ingen funksjoner erstattes:
-- apply_changes tar nye kolonner i kjente tabeller med automatisk (private.table_columns).
-- Skrevet for gjennomgang; kjøres ikke i Cloud av Lovable. Ingen SQL mot storage.
-- =====================================================================================

alter table public.assets add column if not exists brief_versions jsonb not null default '[]'::jsonb
  check (jsonb_typeof(brief_versions) = 'array' and jsonb_array_length(brief_versions) <= 50
         and octet_length(brief_versions::text) <= 2000000);
alter table public.assets add column if not exists active_brief_id text
  check (active_brief_id is null or length(active_brief_id) between 1 and 64);
alter table public.asset_versions add column if not exists brief_version_id text
  check (brief_version_id is null or length(brief_version_id) between 1 and 64);

insert into public.schema_version (version, description)
values (89, 'Tekstversjoner av bildebeskrivelsen og bildets referanse til teksten');
