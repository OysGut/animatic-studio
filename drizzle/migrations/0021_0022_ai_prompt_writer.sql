-- =====================================================================================
-- Animatic Studio – migrasjon 0022: AI skriver bildebeskrivelsen og får se filmens bilder (DEC-0066, REQ-0589).
-- 1. generation_jobs.kind får «prompt»: en språkmodell skrev bildebeskrivelsen. Slike jobber logges som
--    alle andre AI-kall, men teller ikke i prosjektets bildebudsjett (de koster en brøkdel av et bilde).
-- 2. generation_jobs.result_text: teksten språkmodellen skrev (for «prompt»-jobber).
-- 3. generation_jobs.reference_paths: alle bildene som ble sendt med (sti i bøtta «assets»), i rekkefølge.
--    reference_path (det første) beholdes som før.
-- Ingen eksisterende data endres. Ingen SQL mot lagringen (storage).
-- Kjøres ÉN gang i Lovable Cloud etter 0021. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.generation_jobs drop constraint if exists generation_jobs_kind_check;
alter table public.generation_jobs add constraint generation_jobs_kind_check
  check (kind in ('image','video','prompt'));

alter table public.generation_jobs add column if not exists result_text text
  check (result_text is null or length(result_text) <= 8000);

alter table public.generation_jobs add column if not exists reference_paths jsonb not null default '[]'::jsonb
  check (jsonb_typeof(reference_paths) = 'array' and jsonb_array_length(reference_paths) <= 12
         and pg_column_size(reference_paths) <= 16000);

insert into public.schema_version (version, description)
  values (22, '0022_ai_prompt_writer: AI skriver bildebeskrivelsen, flere forbildebilder per generering');