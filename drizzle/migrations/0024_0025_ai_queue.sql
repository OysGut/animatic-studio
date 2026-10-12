-- =====================================================================================
-- Animatic Studio – migrasjon 0025: kø for AI-jobber (DEC-0070, REQ-0289–0301, REQ-0504).
-- 1. generation_jobs.status får «queued»: jobben er bestilt og godkjent (kostnaden er regnet inn i taket og
--    budsjettet), men ikke sendt til leverandøren ennå. Køen sender den når det er ledig plass.
-- 2. generation_jobs.priority (1 høy, 2 normal, 3 lav) og queue_position (rekkefølge innen samme prioritet).
-- 3. generation_jobs.progress (0–1) når leverandøren oppgir fremdrift, og started_at (når den ble sendt).
-- 4. assets.sound_links: hva en lydressurs hører til (karakterer, replikker, scener, delsekvenser, hendelser,
--    produksjoner – REQ-0204). Skrives via apply_changes (som håndterer nye kolonner uten endring).
-- Ingen SQL mot lagringen (storage). Ingen eksisterende data endres.
-- Kjøres ÉN gang i Lovable Cloud etter 0024. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.generation_jobs drop constraint if exists generation_jobs_status_check;
alter table public.generation_jobs add constraint generation_jobs_status_check
  check (status in ('queued', 'running', 'done', 'failed', 'lost'));
alter table public.generation_jobs add column if not exists priority smallint not null default 2
  check (priority between 1 and 3);
alter table public.generation_jobs add column if not exists queue_position double precision;
alter table public.generation_jobs add column if not exists progress real
  check (progress is null or (progress >= 0 and progress <= 1));
alter table public.generation_jobs add column if not exists started_at timestamptz;
create index if not exists generation_jobs_queue_idx on public.generation_jobs (status, priority, queue_position)
  where status = 'queued';

alter table public.assets add column if not exists sound_links jsonb not null default '[]'::jsonb
  check (jsonb_typeof(sound_links) = 'array' and pg_column_size(sound_links) <= 32768);

insert into public.schema_version (version, description)
  values (25, '0025_ai_queue: kø for AI-jobber med prioritet og fremdrift, koblinger for lyd');