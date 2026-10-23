-- =====================================================================================
-- From Pen to Glass (repo: Animatic Studio) – migrasjon 0094: G-3 global bruk (Claudes arkitekturrevisjon B/C).
-- Ny fil; 0093 og eldre er låst. Claude gjennomgår og kjører i Cloud. Kjøres ÉN gang etter 0093.
-- Endrer ingen eksisterende data. apply_changes, delete_project og purge_* er UENDRET.
-- 1. G-3.6: profiles.time_zone og workspaces.time_zone (IANA, sjekket mot pg_timezone_names).
--    private.budget_time_zone(p_project): arbeidsgruppens tidssone, ellers eierens (created_by), ellers UTC.
--    private.budget_period_start(p_project, p_unit, p_at): start på dag/måned i den tidssonen, som timestamptz.
-- 2. G-3.8: workspaces.region (text, bare lagret; ingen flytting).
-- 3. G-3.7: workspaces.settings (jsonb) for arbeidsgruppens nivå i innstillingshierarkiet.
--    public.set_workspace_settings – bare eier, security definer (som GP1).
--    public.set_my_time_zone – brukerens egen tidssone.
-- 4. G-3.5: public.fx_rates – bufrede valutakurser fra en gratis kilde; skrives bare av service role.
-- =====================================================================================

alter table public.profiles add column if not exists time_zone text
  check (time_zone is null or length(time_zone) between 1 and 64);
alter table public.workspaces add column if not exists time_zone text
  check (time_zone is null or length(time_zone) between 1 and 64);
alter table public.workspaces add column if not exists region text
  check (region is null or region ~ '^[a-z0-9-]{2,32}$');
alter table public.workspaces add column if not exists settings jsonb not null default '{}'::jsonb
  check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 16384);

create or replace function private.is_iana_time_zone(p_tz text) returns boolean
  language sql stable set search_path = pg_catalog
as $$ select p_tz is not null and exists (select 1 from pg_timezone_names where name = p_tz) $$;

create or replace function private.budget_time_zone(p_project uuid) returns text
  language sql stable security definer set search_path = public, pg_catalog
as $$
  select coalesce(
    (select w.time_zone from public.projects p join public.workspaces w on w.id = p.workspace_id
      where p.id = p_project and private.is_iana_time_zone(w.time_zone)),
    (select pr.time_zone from public.projects p join public.profiles pr on pr.user_id = p.created_by
      where p.id = p_project and private.is_iana_time_zone(pr.time_zone)),
    'UTC')
$$;

-- Start på kalenderdagen eller -måneden som inneholder p_at, i budsjettets tidssone. Eksplisitt: tidspunktet
-- gjøres om til lokal tid, avkortes, og tolkes tilbake som lokal tid i samme sone (riktig også ved sommertid).
create or replace function private.budget_period_start(p_project uuid, p_unit text, p_at timestamptz default now())
  returns timestamptz
  language plpgsql stable security definer set search_path = public, pg_catalog
as $$
declare v_tz text := private.budget_time_zone(p_project);
begin
  if p_unit not in ('day', 'month') then raise exception 'budget_period_unit'; end if;
  return date_trunc(p_unit, p_at at time zone v_tz) at time zone v_tz;
end $$;

revoke all on function private.is_iana_time_zone(text) from public;
revoke all on function private.budget_time_zone(uuid) from public;
revoke all on function private.budget_period_start(uuid, text, timestamptz) from public;
grant execute on function private.is_iana_time_zone(text) to authenticated, service_role;
grant execute on function private.budget_time_zone(uuid) to authenticated, service_role;
grant execute on function private.budget_period_start(uuid, text, timestamptz) to authenticated, service_role;

create or replace function public.set_my_time_zone(p_time_zone text) returns void
  language plpgsql security definer set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_time_zone is not null and not private.is_iana_time_zone(p_time_zone) then
    raise exception 'invalid_time_zone';
  end if;
  insert into public.profiles (user_id, time_zone) values (auth.uid(), p_time_zone)
    on conflict (user_id) do update set time_zone = excluded.time_zone, updated_at = now();
end $$;
revoke all on function public.set_my_time_zone(text) from public;
grant execute on function public.set_my_time_zone(text) to authenticated;

create or replace function public.set_workspace_settings(
  p_workspace uuid, p_time_zone text, p_region text, p_settings jsonb
) returns void
  language plpgsql security definer set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace
      and m.user_id = auth.uid() and m.role = 'owner' and m.removed_at is null) then
    raise exception 'not_workspace_owner';
  end if;
  if p_time_zone is not null and not private.is_iana_time_zone(p_time_zone) then
    raise exception 'invalid_time_zone';
  end if;
  update public.workspaces
     set time_zone = p_time_zone, region = p_region, settings = coalesce(p_settings, '{}'::jsonb),
         revision = revision + 1
   where id = p_workspace;
end $$;
revoke all on function public.set_workspace_settings(uuid, text, text, jsonb) from public;
grant execute on function public.set_workspace_settings(uuid, text, text, jsonb) to authenticated;

create table public.fx_rates (
  base text not null check (base ~ '^[A-Z]{3}$'),
  quote text not null check (quote ~ '^[A-Z]{3}$'),
  rate_date date not null,
  rate numeric(20, 10) not null check (rate > 0),
  source text not null check (length(source) between 1 and 64),
  fetched_at timestamptz not null default now(),
  primary key (base, quote, rate_date)
);
grant select on public.fx_rates to authenticated;
grant all on public.fx_rates to service_role;
alter table public.fx_rates enable row level security;
create policy "fx_rates_read" on public.fx_rates for select to authenticated using (true);

insert into public.schema_version (version, description)
  values (94, '0094_g3_global: tidssoner for budsjett, workspace region/settings, fx_rates');
