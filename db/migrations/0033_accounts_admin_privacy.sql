-- =====================================================================================
-- Animatic Studio – migrasjon 0033: brukerkontoer, administrator, låste prosjekter og personvern (DEC-0086).
-- Mars 15.10.2026: en adminside med alle brukerne (opprettet, sist aktiv, blokkering, sletting), prosjekter
-- uten eier kan gis til en annen bruker, brukeren kan slette seg selv (låst i 30 dager, kan bare låses opp
-- av administrator), personvernerklæring etter GDPR som kan leses før og etter innlogging.
-- 1. app_admins: administratorer. oystein@gutu.no er fast administrator og står IKKE i tabellen: den er
--    låst inn i private.is_admin og kan aldri fjernes eller nedgraderes.
-- 2. account_status: kontoens tilstand (aktiv, blokkert, låst for sletting, slettet), begrunnelse, når den
--    slettes for godt (30 dager), og sist aktiv. Skrives bare av serveren (service_role) og touch_activity.
-- 3. profiles.locale: foretrukket språk (nb/en).
-- 4. Låste prosjekter: et prosjekt uten aktiv eier (eieren er blokkert, låst for sletting eller slettet)
--    er låst for alle. private.member_role_rank gir 0 for låste prosjekter og for brukere som ikke er
--    aktive, så ingen kan skrive. Andre roller som blokkeres, påvirker ikke de andre medlemmene.
-- 5. privacy_policy: personvernerklæringens felt (behandlingsansvarlig, kontakt, lagringssted); hver lagring
--    er en ny versjon. Kan leses uten innlogging. privacy_acceptances: hvem som har lest hvilken versjon.
-- 6. RPC-er for innloggede: my_account, touch_activity, set_my_locale, accept_privacy, project_lock_info.
-- Ingen SQL mot lagringen (storage). Ingen eksisterende data endres. apply_changes er uendret (den sjekker
-- allerede private.member_role_rank).
-- Kjøres ÉN gang etter 0032. Endres aldri etter kjøring.
-- =====================================================================================

-- ---------- 1. Administratorer ----------
create table public.app_admins (
  user_id uuid primary key references auth.users (id),
  added_by uuid references auth.users (id),
  added_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from public, anon, authenticated;

-- Den faste administratoren (Mars 15.10.2026): «oystein@gutu.no skal aldri kunne nedgraderes»
create function private.permanent_admin_email() returns text
language sql immutable set search_path = '' as $$ select 'oystein@gutu.no'::text $$;

create function private.is_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and (
    exists (select 1 from public.app_admins a where a.user_id = p_user)
    or exists (select 1 from auth.users u
               where u.id = p_user and lower(u.email) = private.permanent_admin_email())
  )
$$;

-- ---------- 2. Kontoens tilstand ----------
create table public.account_status (
  user_id uuid primary key references auth.users (id),
  status text not null default 'active' check (status in ('active', 'blocked', 'deleting', 'deleted')),
  reason text not null default '' check (char_length(reason) <= 500),
  changed_by uuid references auth.users (id),
  changed_at timestamptz,
  -- Når kontoen slettes for godt (status 'deleting'): 30 dager etter at slettingen ble bedt om
  delete_after timestamptz,
  last_active_at timestamptz,
  check ((status = 'deleting') = (delete_after is not null))
);
alter table public.account_status enable row level security;
create policy account_status_read_own on public.account_status for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.account_status from public, anon, authenticated;
grant select on public.account_status to authenticated;

create function private.account_active(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.account_status s where s.user_id = p_user and s.status <> 'active'
  )
$$;

-- ---------- 3. Foretrukket språk ----------
alter table public.profiles add column if not exists locale text
  check (locale is null or locale in ('nb', 'en'));

-- ---------- 4. Låste prosjekter ----------
-- null = ikke låst. Ellers hvorfor: eieren er blokkert, låst for sletting, slettet, eller prosjektet har
-- ingen eier (gitt til en annen bruker av administrator).
create function private.project_lock(p_project uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (
      select 1 from public.project_members m
      where m.project_id = p_project and m.role = 'owner' and m.removed_at is null
        and private.account_active(m.user_id)
    ) then null
    when exists (
      select 1 from public.project_members m join public.account_status s on s.user_id = m.user_id
      where m.project_id = p_project and m.role = 'owner' and m.removed_at is null and s.status = 'blocked'
    ) then 'owner_blocked'
    when exists (
      select 1 from public.project_members m join public.account_status s on s.user_id = m.user_id
      where m.project_id = p_project and m.role = 'owner' and m.removed_at is null and s.status = 'deleting'
    ) then 'owner_deleting'
    when exists (
      select 1 from public.project_members m join public.account_status s on s.user_id = m.user_id
      where m.project_id = p_project and m.role = 'owner' and m.removed_at is null and s.status = 'deleted'
    ) then 'owner_deleted'
    else 'no_owner'
  end
$$;

-- Som 0011 (slettede prosjekter gir 0), og nå også: låste prosjekter og brukere som ikke er aktive gir 0
create or replace function private.member_role_rank(p_project uuid, p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.projects p where p.id = p_project and p.deleted_at is not null) then 0
    when not private.account_active(p_user) then 0
    when private.project_lock(p_project) is not null then 0
    else (select coalesce(max(private.role_rank(m.role)), 0) from public.project_members m
          where m.project_id = p_project and m.user_id = p_user and m.removed_at is null)
  end
$$;

-- ---------- 5. Personvernerklæringen ----------
create table public.privacy_policy (
  version integer primary key check (version >= 1),
  controller_name text not null default '' check (char_length(controller_name) <= 200),
  org_number text not null default '' check (char_length(org_number) <= 40),
  address text not null default '' check (char_length(address) <= 400),
  contact_email text not null default '' check (char_length(contact_email) <= 200),
  storage_region text not null default '' check (char_length(storage_region) <= 200),
  note text not null default '' check (char_length(note) <= 4000),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id)
);
alter table public.privacy_policy enable row level security;
create policy privacy_policy_read on public.privacy_policy for select to anon, authenticated using (true);
revoke all on public.privacy_policy from public, anon, authenticated;
grant select on public.privacy_policy to anon, authenticated;

create table public.privacy_acceptances (
  user_id uuid not null references auth.users (id),
  version integer not null references public.privacy_policy (version),
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);
alter table public.privacy_acceptances enable row level security;
create policy privacy_acceptances_read_own on public.privacy_acceptances for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.privacy_acceptances from public, anon, authenticated;
grant select on public.privacy_acceptances to authenticated;

-- Første versjon uten utfylte felt (administrator fyller dem ut på adminsiden)
insert into public.privacy_policy (version) values (1);

-- ---------- 6. RPC-er for innloggede ----------
create function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'status', coalesce((select s.status from public.account_status s where s.user_id = (select auth.uid())), 'active'),
    'is_admin', private.is_admin((select auth.uid())),
    'permanent_admin', exists (select 1 from auth.users u where u.id = (select auth.uid())
                               and lower(u.email) = private.permanent_admin_email()),
    'locale', (select p.locale from public.profiles p where p.user_id = (select auth.uid())),
    'display_name', (select p.display_name from public.profiles p where p.user_id = (select auth.uid())),
    'privacy_version', (select max(v.version) from public.privacy_policy v),
    'accepted_version', (select max(a.version) from public.privacy_acceptances a
                         where a.user_id = (select auth.uid())),
    'created_at', (select u.created_at from auth.users u where u.id = (select auth.uid()))
  )
$$;
revoke all on function public.my_account() from public, anon;
grant execute on function public.my_account() to authenticated;

-- Sist aktiv: oppdateres høyst én gang i timen
create function public.touch_activity() returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then return; end if;
  insert into public.account_status (user_id, last_active_at) values (v_user, now())
    on conflict (user_id) do update set last_active_at = now()
    where public.account_status.last_active_at is null
       or public.account_status.last_active_at < now() - interval '1 hour';
end $$;
revoke all on function public.touch_activity() from public, anon;
grant execute on function public.touch_activity() to authenticated;

create function public.set_my_locale(p_locale text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  if p_locale not in ('nb', 'en') then raise exception 'Ukjent språk' using errcode = '22023'; end if;
  insert into public.profiles (user_id, display_name, locale)
    values (v_user, left(split_part(coalesce((select email from auth.users where id = v_user), ''), '@', 1), 100), p_locale)
    on conflict (user_id) do update set locale = p_locale, updated_at = now();
end $$;
revoke all on function public.set_my_locale(text) from public, anon;
grant execute on function public.set_my_locale(text) to authenticated;

create function public.accept_privacy(p_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  if not exists (select 1 from public.privacy_policy where version = p_version) then
    raise exception 'Ukjent versjon av personvernerklæringen' using errcode = '22023';
  end if;
  insert into public.privacy_acceptances (user_id, version) values (v_user, p_version)
    on conflict do nothing;
end $$;
revoke all on function public.accept_privacy(integer) from public, anon;
grant execute on function public.accept_privacy(integer) to authenticated;

-- Hvorfor et prosjekt er låst og hvem medlemmene kan kontakte. Bare for medlemmer. Eierens visningsnavn
-- (ikke e-post, som 0002) og administratorens e-post.
create function public.project_lock_info(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_lock text;
begin
  if v_user is null or not exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.user_id = v_user and m.removed_at is null
  ) then
    return null;
  end if;
  v_lock := private.project_lock(p_project);
  if v_lock is null then return jsonb_build_object('lock', null); end if;
  return jsonb_build_object(
    'lock', v_lock,
    'owner_name', (select p.display_name from public.project_members m
                   join public.profiles p on p.user_id = m.user_id
                   where m.project_id = p_project and m.role = 'owner' and m.removed_at is null
                   limit 1),
    'admin_email', private.permanent_admin_email()
  );
end $$;
revoke all on function public.project_lock_info(uuid) from public, anon;
grant execute on function public.project_lock_info(uuid) to authenticated;

insert into public.schema_version (version, description)
  values (33, '0033_accounts_admin_privacy: administrator, kontostatus, låste prosjekter, personvern');
