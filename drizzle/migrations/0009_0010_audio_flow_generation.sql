-- =====================================================================================
-- Animatic Studio – migrasjon 0010: lyd over flere scener, volumpunkter og logg for AI-generering
-- (DEC-0045).
-- 1. audio_clips: «continues» (lyden løper videre over flere scener) og «volume_keys» (volumpunkter
--    i dB, som i After Effects). apply_changes leser kolonnene fra tabellen og trenger ingen endring.
-- 2. generation_jobs: logg over hver AI-generering (hvem, hva, modell, beskrivelse, status, resultat).
--    Bare serveren skriver (service_role); medlemmer kan lese loggen for sitt prosjekt.
-- Ingen SQL mot lagringen (storage). Ingen eksisterende data endres.
-- Kjøres ÉN gang i Lovable Cloud etter 0009. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.audio_clips add column if not exists continues boolean not null default false;
alter table public.audio_clips add column if not exists volume_keys jsonb not null default '[]'::jsonb
  check (jsonb_typeof(volume_keys) = 'array' and jsonb_array_length(volume_keys) <= 500);

create table public.generation_jobs (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  kind text not null check (kind in ('image')),
  provider text not null check (length(provider) <= 100),
  model text not null check (length(model) <= 100),
  prompt text not null check (length(prompt) between 1 and 8000),
  asset_id uuid references public.assets (id),
  -- Bildet som ble sendt med som forbilde (sti i bøtta «assets»), eller null
  reference_path text check (reference_path is null or length(reference_path) <= 600),
  status text not null default 'running' check (status in ('running','done','failed')),
  error text check (error is null or length(error) <= 2000),
  result_path text check (result_path is null or length(result_path) <= 600),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid not null references auth.users (id)
);
create index generation_jobs_project_idx on public.generation_jobs (project_id, created_at desc);
create index generation_jobs_user_idx on public.generation_jobs (created_by, created_at desc);

alter table public.generation_jobs enable row level security;
create policy generation_jobs_read on public.generation_jobs for select to authenticated
  using (private.is_project_member(project_id));
revoke insert, update, delete, truncate on public.generation_jobs from anon, authenticated;
grant select on public.generation_jobs to authenticated;

insert into public.schema_version (version, description) values (10, '0010_audio_flow_generation: lyd over flere scener, volumpunkter, logg for AI-generering');