-- =====================================================================================
-- Animatic Studio – migrasjon 0005: «endret av …» på notater og store bildefiler (DEC-0032).
-- MERK: Denne filen er nøyaktig det Lovable kjørte 2026-10-09 (drizzle/migrations/0004_0005_…).
-- Lovable kunne ikke endre typen på byte_size og la i stedet til byte_size_big (bigint).
-- Den gamle byte_size ble stående med NOT NULL og 50 MB-grensen; det rettes i 0006.
-- 1. Notater får hvem som sist endret dem og når (vises som «endret av Anita · 10. okt.»).
-- 2. Bilder i ressursbiblioteket kan være opptil 2 GB (var 50 MB). Bøttens egen grense endres med
--    Lovables lagringsverktøy (SQL mot storage.buckets er ikke tillatt i Lovable Cloud).
-- Kjøres ÉN gang i Lovable Cloud etter 0004. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.script_annotations add column if not exists edited_by_name text check (length(edited_by_name) <= 100);
alter table public.script_annotations add column if not exists edited_at timestamptz;

-- Filstørrelse: ny bigint-kolonne inntil 5 GB (Lovable Clouds øvre grense per fil); appen tillater 2 GB
alter table public.asset_versions add column if not exists byte_size_big bigint;
update public.asset_versions set byte_size_big = byte_size where byte_size_big is null;
alter table public.asset_versions alter column byte_size_big set not null;
alter table public.asset_versions add constraint asset_versions_byte_size_big_check
  check (byte_size_big > 0 and byte_size_big <= 5368709120);
comment on column public.asset_versions.byte_size is 'DEPRECATED: replaced by byte_size_big (bigint, opptil 5 GB)';

insert into public.schema_version (version, description) values (5, '0005_note_edits_large_files: «endret av» på notater, bilder opptil 2 GB');
