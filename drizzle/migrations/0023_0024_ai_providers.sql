-- =====================================================================================
-- Animatic Studio – migrasjon 0024: egne AI-leverandører med nøkler og overordnet kostnadstak (DEC-0069,
-- REQ-0566, REQ-0270, REQ-0413).
-- 1. ai_provider_keys: brukerens API-nøkler, én per leverandør. Nøkkelen lagres bare kryptert (AES-256-GCM,
--    krypteres og dekrypteres i serverfunksjonene; hovednøkkelen er en hemmelighet i Lovable Cloud).
--    Brukeren kan lese sine egne rader UTEN den krypterte nøkkelen (kolonnetilgang); bare serveren skriver.
--    Når en nøkkel fjernes, slettes raden (ingen kopi av hemmeligheten blir liggende).
-- 2. ai_account_limits: brukerens månedlige kostnadstak i USD for alle prosjekter som bruker nøklene.
-- 3. generation_jobs: hvilken nøkkel (og eier) som ble brukt, anslått kostnad i USD, leverandørens jobb-ID
--    (video kjører hos leverandøren og hentes senere), innstillinger (lengde, modell) og jobbtypen «sound».
-- 4. ai_spend: forbruk med en nøkkel som er tatt vare på når et prosjekt slettes for godt (purge), så taket
--    ikke kan nullstilles ved å slette prosjektet.
-- Ingen SQL mot lagringen (storage). Ingen eksisterende data endres.
-- Kjøres ÉN gang i Lovable Cloud etter 0023. Endres aldri etter kjøring.
-- =====================================================================================

create table public.ai_provider_keys (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('openai', 'google', 'fal', 'runway', 'elevenlabs')),
  label text not null default '' check (length(label) <= 80),
  -- base64 av AES-256-GCM-chiffer (med autentiseringsmerke) og tilfeldig IV; aldri klartekst
  ciphertext text not null check (length(ciphertext) between 16 and 4000),
  iv text not null check (length(iv) between 8 and 64),
  key_version smallint not null default 1 check (key_version between 1 and 100),
  -- «…abcd»: bare de fire siste tegnene, så brukeren kjenner igjen nøkkelen
  key_hint text not null check (length(key_hint) <= 16),
  status text not null default 'untested' check (status in ('untested', 'ok', 'failed')),
  status_message text check (status_message is null or length(status_message) <= 400),
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ai_provider_keys_one_per_provider on public.ai_provider_keys (user_id, provider);

alter table public.ai_provider_keys enable row level security;
create policy ai_provider_keys_read_own on public.ai_provider_keys for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.ai_provider_keys from public, anon, authenticated;
-- Kolonnetilgang: den krypterte nøkkelen og IV kan aldri leses fra nettleseren
grant select (id, user_id, provider, label, key_hint, status, status_message, last_tested_at,
  created_at, updated_at) on public.ai_provider_keys to authenticated;

create table public.ai_account_limits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  monthly_cap_usd numeric(10, 2) check (monthly_cap_usd is null or monthly_cap_usd between 0 and 100000),
  updated_at timestamptz not null default now()
);
alter table public.ai_account_limits enable row level security;
create policy ai_account_limits_read_own on public.ai_account_limits for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.ai_account_limits from public, anon, authenticated;
grant select on public.ai_account_limits to authenticated;

alter table public.generation_jobs drop constraint if exists generation_jobs_kind_check;
alter table public.generation_jobs add constraint generation_jobs_kind_check
  check (kind in ('image', 'video', 'prompt', 'sound'));
alter table public.generation_jobs add column if not exists provider_key_id uuid
  references public.ai_provider_keys (id) on delete set null;
alter table public.generation_jobs add column if not exists key_owner uuid references auth.users (id);
alter table public.generation_jobs add column if not exists cost_usd numeric(10, 3)
  check (cost_usd is null or cost_usd >= 0);
alter table public.generation_jobs add column if not exists external_id text
  check (external_id is null or length(external_id) <= 400);
alter table public.generation_jobs add column if not exists params jsonb not null default '{}'::jsonb
  check (jsonb_typeof(params) = 'object' and pg_column_size(params) <= 4000);
create index if not exists generation_jobs_key_owner_idx on public.generation_jobs (key_owner, created_at);

-- Forbruk fra jobber som slettes sammen med et prosjekt (purge_project_assets setter animatic.purge_project)
create table public.ai_spend (
  key_owner uuid not null references auth.users (id) on delete cascade,
  month date not null,
  usd numeric(12, 3) not null default 0 check (usd >= 0),
  primary key (key_owner, month)
);
alter table public.ai_spend enable row level security;
create policy ai_spend_read_own on public.ai_spend for select to authenticated
  using (key_owner = (select auth.uid()));
revoke all on public.ai_spend from public, anon, authenticated;
grant select on public.ai_spend to authenticated;

create or replace function private.keep_ai_spend()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('animatic.purge_project', true), '') <> ''
     and old.key_owner is not null and old.cost_usd is not null and old.status <> 'failed' then
    insert into public.ai_spend (key_owner, month, usd)
      values (old.key_owner, date_trunc('month', old.created_at at time zone 'utc')::date, old.cost_usd)
      on conflict (key_owner, month) do update set usd = public.ai_spend.usd + excluded.usd;
  end if;
  return old;
end;
$$;
revoke all on function private.keep_ai_spend() from public;
create trigger generation_jobs_keep_ai_spend before delete on public.generation_jobs
  for each row execute function private.keep_ai_spend();

insert into public.schema_version (version, description)
  values (24, '0024_ai_providers: egne AI-leverandører med krypterte nøkler, overordnet kostnadstak, videojobber');