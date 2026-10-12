-- =====================================================================================
-- Animatic Studio – migrasjon 0027: arbeidsliste for oppdaterte ressurser og lagrede eksportinnstillinger
-- (DEC-0072). Bare nye kolonner; apply_changes håndterer dem uten endring.
-- 1. composition_layers.reviewed_versions og takes.reviewed_versions: ressursversjoner brukeren har gått
--    gjennom og valgt å beholde det gamle bildet mot («Behold» i arbeidslisten). Kommer det en enda nyere
--    versjon, kommer scenen tilbake på listen.
-- 2. productions.export_settings: eksportinnstillingene sist brukt for produksjonen (størrelse, svart-hvitt,
--    video eller dialogspor), så de ikke går tapt når programmet lukkes (REQ-0407).
-- Ingen SQL mot lagringen (storage). Ingen eksisterende data endres.
-- Kjøres ÉN gang i Lovable Cloud etter 0026. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.composition_layers add column if not exists reviewed_versions jsonb not null default '[]'::jsonb
  check (jsonb_typeof(reviewed_versions) = 'array' and pg_column_size(reviewed_versions) <= 16384);

alter table public.takes add column if not exists reviewed_versions jsonb not null default '[]'::jsonb
  check (jsonb_typeof(reviewed_versions) = 'array' and pg_column_size(reviewed_versions) <= 16384);

alter table public.productions add column if not exists export_settings jsonb
  check (export_settings is null or (jsonb_typeof(export_settings) = 'object' and pg_column_size(export_settings) <= 4096));

insert into public.schema_version (version, description)
  values (27, '0027_review_export: arbeidsliste for oppdaterte ressurser (gjennomgåtte versjoner) og lagrede eksportinnstillinger');
