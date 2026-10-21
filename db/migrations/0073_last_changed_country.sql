-- =====================================================================================
-- Animatic Studio – migrasjon 0073: B-097 «Sist endret» i scenelisten, og land på kontoen.
-- 1. change_log.scene_ids: scenene en lagret endring gjelder. Fylles av serverfunksjonen runCommand
--    rett etter apply_changes (domenekjernen vet hvilke scener kommandoen berører). Nullable: eldre rader
--    og endringer fra bakgrunnsjobber har ingen scener. GIN-indeks for oppslag per scene.
-- 2. scene_last_changes(p_project): siste endring per scene (tid, hvem) i én spørring; scener uten
--    loggført endring får opprettelsestiden. Bare for medlemmer.
-- 3. profiles.country: ISO 3166-1 alpha-2 (nullable for eksisterende brukere). Klokke og datoformat
--    ligger i profiles.ui_prefs (ingen skjemaendring).
--    Tilgang: andre medlemmer kan fortsatt lese visningsnavn (profiles_read), men ikke landet:
--    SELECT gis nå per kolonne uten country. Eget land leses via my_account og endres via set_my_country.
-- 4. admin_country_counts(): antall brukere per land, bare aggregert, bare for administrator.
-- Erstatter:
--   * my_account (0034): kopiert ordrett, med bare 'country' lagt til.
-- Nye funksjoner: set_my_country, scene_last_changes, admin_country_counts, private.protect_change_log.
-- Trigger change_log_immutable gjenopprettes med private.protect_change_log (samme vern som
-- private.protect_history fra 0011, pluss at scene_ids kan fylles én gang fra null).
-- apply_changes, delete_project og purge_* er uendret (change_log slettes der allerede; ny kolonne
-- i change_log tas med automatisk).
-- Bare additiv; ingen tilbakefylling, ingen nye filstier. Ingen SQL mot storage.
-- Skrevet for gjennomgang; kjøres ikke i Cloud av Lovable. Kjøres ÉN gang etter 0072.
-- =====================================================================================

-- ---------- 1. Scener per endring ----------
alter table public.change_log add column if not exists scene_ids uuid[]
  check (scene_ids is null or cardinality(scene_ids) <= 1000);
create index if not exists change_log_scene_ids_idx on public.change_log using gin (scene_ids);

-- Historikken er fortsatt uforanderlig (INV-13). Eneste unntak: scene_ids kan fylles ÉN gang (fra null),
-- og ingen andre felt kan endres samtidig. Sletting bare ved sletting av hele prosjektet, som før.
-- Egen funksjon for change_log; private.protect_history (brukt av andre tabeller) er uendret.
create function private.protect_change_log() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and private.purging(to_jsonb(old) ->> 'project_id') then
    return old;
  end if;
  if tg_op = 'UPDATE' and old.scene_ids is null
     and (to_jsonb(new) - 'scene_ids') = (to_jsonb(old) - 'scene_ids') then
    return new;
  end if;
  raise exception 'Historikk kan ikke endres eller slettes (INV-13)' using errcode = 'P0001';
end $$;
revoke all on function private.protect_change_log() from public;
drop trigger if exists change_log_immutable on public.change_log;
create trigger change_log_immutable before update or delete on public.change_log
  for each row execute function private.protect_change_log();

-- ---------- 2. Siste endring per scene ----------
create function public.scene_last_changes(p_project uuid)
returns table (scene_id uuid, changed_at timestamptz, actor uuid, actor_name text, logged boolean)
language sql stable security definer set search_path = '' as $$
  with latest as (
    select distinct on (s.id) s.id as scene_id, c.created_at, c.actor
    from public.change_log c
    cross join lateral unnest(c.scene_ids) as s(id)
    where c.project_id = p_project and c.scene_ids is not null
    order by s.id, c.created_at desc
  )
  select sc.id,
         coalesce(l.created_at, sc.created_at),
         coalesce(l.actor, sc.created_by),
         (select p.display_name from public.profiles p where p.user_id = coalesce(l.actor, sc.created_by)),
         l.scene_id is not null
  from public.scenes sc
  left join latest l on l.scene_id = sc.id
  where sc.project_id = p_project
    and private.is_project_member(p_project)
$$;
revoke all on function public.scene_last_changes(uuid) from public, anon;
grant execute on function public.scene_last_changes(uuid) to authenticated, service_role;

-- ---------- 3. Land på kontoen ----------
alter table public.profiles add column if not exists country text
  check (country is null or country ~ '^[A-Z]{2}$');

-- Andre medlemmer ser visningsnavnet (som før), men ikke landet
revoke select on public.profiles from authenticated;
grant select (user_id, display_name, updated_at, locale, ui_prefs) on public.profiles to authenticated;
grant all on public.profiles to service_role;

create function public.set_my_country(p_country text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  if p_country is null or p_country !~ '^[A-Z]{2}$' then
    raise exception 'Ugyldig land' using errcode = '22023';
  end if;
  insert into public.profiles (user_id, display_name, country)
    values (v_user, left(split_part(coalesce((select email from auth.users where id = v_user), ''), '@', 1), 100), p_country)
    on conflict (user_id) do update set country = p_country, updated_at = now();
end $$;
revoke all on function public.set_my_country(text) from public, anon;
grant execute on function public.set_my_country(text) to authenticated;

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
    'created_at', (select u.created_at from auth.users u where u.id = (select auth.uid())),
    'country', (select p.country from public.profiles p where p.user_id = (select auth.uid()))
  )
$$;

-- ---------- 4. Brukere per land (bare aggregert) ----------
create function public.admin_country_counts()
returns table (country text, users bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  return query
    select p.country, count(*)::bigint
    from public.profiles p
    left join public.account_status s on s.user_id = p.user_id
    where coalesce(s.status, 'active') <> 'deleted'
    group by p.country
    order by count(*) desc, p.country nulls last;
end $$;
revoke all on function public.admin_country_counts() from public, anon;
grant execute on function public.admin_country_counts() to authenticated;

insert into public.schema_version (version, description) values (73, '0073_last_changed_country: B-097 sist endret per scene og land på kontoen');
