-- =====================================================================================
-- Animatic Studio – migrasjon 0005: «endret av …» på notater og store bildefiler (DEC-0032).
-- 1. Notater får hvem som sist endret dem og når (vises som «endret av Anita · 10. okt.»).
-- 2. Bilder i ressursbiblioteket kan være opptil 2 GB (var 50 MB). Bøttens egen grense endres med
--    Lovables lagringsverktøy (SQL mot storage.buckets er ikke tillatt i Lovable Cloud).
-- Kjøres ÉN gang i Lovable Cloud etter 0004. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.script_annotations add column if not exists edited_by_name text check (length(edited_by_name) <= 100);
alter table public.script_annotations add column if not exists edited_at timestamptz;

-- Filstørrelse: bigint og inntil 5 GB (Lovable Clouds øvre grense per fil); appen tillater 2 GB
alter table public.asset_versions drop constraint if exists asset_versions_byte_size_check;
alter table public.asset_versions alter column byte_size type bigint;
alter table public.asset_versions add constraint asset_versions_byte_size_check
  check (byte_size > 0 and byte_size <= 5368709120);

insert into public.schema_version (version, description) values (5, '0005_note_edits_large_files: «endret av» på notater, bilder opptil 2 GB');
