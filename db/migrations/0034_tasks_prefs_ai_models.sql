-- =====================================================================================
-- Animatic Studio – migrasjon 0034: oppgaver for elementer i scener, systemmerknader, brukerens visningsvalg,
-- AI-tilkoblinger og status for bakgrunnsjobben (DEC-0088).
-- Mars 15.10.2026: «Add element to scene» med spørsmål om elementet skal inn i andre scener, merknad i manuset
-- for hver scene, oppgaven øverst i menylinjen og i en TODO-boks på prosjektsiden; panelene i sceneeditoren
-- side om side med valgt rekkefølge «huskes på brukerne … akkurat som språk»; adminside for AI-tilkoblinger.
-- 1. script_annotations.source ('user' | 'system') og task_id: merknader fra programmet (for eksempel «Teddybjørnen
--    skal inn i scenen») skilles fra notater skrevet av folk, og knyttes til oppgaven.
-- 2. assets.scene_plans: scenene elementet skal inn i (oppgave, scenen det ble lagt til fra, tidspunkt). Elementet
--    vises med gul ramme i «I denne scenen» til det er dratt inn på lerretet eller planen er fjernet.
-- 3. profiles.ui_prefs: brukerens visningsvalg (panelrekkefølge, åpne grupper …) og RPC set_my_ui_prefs.
--    my_account gir også ui_prefs.
-- 4. app_status: når bakgrunnsjobben sist kjørte og hva den gjorde (bare serveren leser og skriver).
-- 5. ai_model_settings: administrator slår leverandører og modeller av og på og legger til modeller hos kjente
--    leverandører. Alle innloggede kan lese (så valglistene viser bare det som er på); bare serveren skriver.
-- 6. ai_provider_requests: ønsker om nye leverandører (bare serveren leser og skriver).
-- Ingen SQL mot lagringen (storage). Ingen eksisterende data endres. apply_changes er uendret: nye kolonner i
-- kjente tabeller tas med automatisk.
-- Kjøres ÉN gang etter 0033. Endres aldri etter kjøring.
-- =====================================================================================

-- ---------- 1. Systemmerknader ----------
alter table public.script_annotations add column if not exists source text not null default 'user'
  check (source in ('user', 'system'));
alter table public.script_annotations add column if not exists task_id uuid;
create index if not exists script_annotations_task_idx on public.script_annotations (task_id)
  where task_id is not null;

-- ---------- 2. Planer for elementer i scener ----------
alter table public.assets add column if not exists scene_plans jsonb not null default '[]'::jsonb
  check (jsonb_typeof(scene_plans) = 'array' and pg_column_size(scene_plans) <= 65536);

-- ---------- 3. Brukerens visningsvalg ----------
alter table public.profiles add column if not exists ui_prefs jsonb not null default '{}'::jsonb
  check (jsonb_typeof(ui_prefs) = 'object' and pg_column_size(ui_prefs) <= 32768);

-- Slår sammen nøklene på øverste nivå (null fjerner en nøkkel)
create function public.set_my_ui_prefs(p_prefs jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' or pg_column_size(p_prefs) > 16384 then
    raise exception 'Ugyldige visningsvalg' using errcode = '22023';
  end if;
  insert into public.profiles (user_id, display_name, ui_prefs)
    values (v_user, left(split_part(coalesce((select email from auth.users where id = v_user), ''), '@', 1), 100),
            jsonb_strip_nulls(p_prefs))
    on conflict (user_id) do update
      set ui_prefs = jsonb_strip_nulls(public.profiles.ui_prefs || p_prefs), updated_at = now();
end $$;
revoke all on function public.set_my_ui_prefs(jsonb) from public, anon;
grant execute on function public.set_my_ui_prefs(jsonb) to authenticated;

create or replace function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'status', coalesce((select s.status from public.account_status s where s.user_id = (select auth.uid())), 'active'),
    'is_admin', private.is_admin((select auth.uid())),
    'permanent_admin', exists (select 1 from auth.users u where u.id = (select auth.uid())
                               and lower(u.email) = private.permanent_admin_email()),
    'locale', (select p.locale from public.profiles p where p.user_id = (select auth.uid())),
    'display_name', (select p.display_name from public.profiles p where p.user_id = (select auth.uid())),
    'ui_prefs', coalesce((select p.ui_prefs from public.profiles p where p.user_id = (select auth.uid())), '{}'::jsonb),
    'privacy_version', (select max(v.version) from public.privacy_policy v),
    'accepted_version', (select max(a.version) from public.privacy_acceptances a
                         where a.user_id = (select auth.uid())),
    'created_at', (select u.created_at from auth.users u where u.id = (select auth.uid()))
  )
$$;

-- ---------- 4. Status for bakgrunnsjobben ----------
create table public.app_status (
  key text primary key check (char_length(key) <= 100),
  value jsonb not null default '{}'::jsonb check (pg_column_size(value) <= 16384),
  updated_at timestamptz not null default now()
);
alter table public.app_status enable row level security;
revoke all on public.app_status from public, anon, authenticated;

-- ---------- 5. AI-tilkoblinger ----------
create table public.ai_model_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('lovable', 'openai', 'google', 'fal', 'runway', 'elevenlabs')),
  -- '*' = hele leverandøren
  model text not null check (char_length(model) between 1 and 200),
  enabled boolean not null default true,
  -- Lagt til av administrator (ikke i den innebygde katalogen)
  custom boolean not null default false,
  kind text check (kind is null or kind in ('image', 'video', 'sound', 'text')),
  label text not null default '' check (char_length(label) <= 120),
  price_usd numeric(10, 4) check (price_usd is null or price_usd between 0 and 1000),
  price_unit text not null default '' check (price_unit in ('', 'image', 'second', 'call', 'character')),
  note text not null default '' check (char_length(note) <= 500),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  unique (provider, model)
);
alter table public.ai_model_settings enable row level security;
create policy ai_model_settings_read on public.ai_model_settings for select to authenticated using (true);
revoke all on public.ai_model_settings from public, anon, authenticated;
grant select on public.ai_model_settings to authenticated;

-- ---------- 6. Ønsker om nye leverandører ----------
create table public.ai_provider_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  website text not null default '' check (char_length(website) <= 400),
  docs_url text not null default '' check (char_length(docs_url) <= 400),
  note text not null default '' check (char_length(note) <= 2000),
  status text not null default 'open' check (status in ('open', 'done', 'rejected')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
alter table public.ai_provider_requests enable row level security;
revoke all on public.ai_provider_requests from public, anon, authenticated;

insert into public.schema_version (version, description)
  values (34, '0034_tasks_prefs_ai_models: systemmerknader, planer for elementer, visningsvalg, AI-tilkoblinger, status');
