-- =====================================================================================
-- From Pen to Glass (repo: Animatic Studio) – migrasjon 0075: stenge for nye registreringer (B-109).
-- 1. public.service_settings: enradstabell for tjenesteinnstillinger (finnes ikke fra før; app_status er
--    bakgrunnsjobbens status og brukes ikke til dette). registration_open (standard åpen), valgfri melding,
--    når og hvem som endret. Ingen direkte tilgang for klienter; bare via funksjonene under.
-- 2. public.set_registration_open(p_open, p_message): bare administrator (private.is_admin).
--    Det finnes ingen admin-logg i skjemaet; endringen logges i raden (changed_at, changed_by).
-- 3. public.registration_status(): anon og innloggede; gir bare {open, message}.
-- 4. public.admin_registration_settings(): bare administrator; status, melding, når og visningsnavnet til
--    den som endret (ingen e-post).
-- 5. Håndheving: BEFORE INSERT-trigger på auth.users (private.guard_registration). Når registreringen er
--    stengt, stoppes alle nye kontoer (passord, innloggingslenke/OTP, OAuth) med SQLSTATE 'PTG01'
--    («registration_closed»). Unntak: e-post med åpen, gyldig invitasjon til prosjekt eller arbeidsgruppe
--    (ikke akseptert, ikke trukket tilbake, ikke utløpt). Eksisterende brukere påvirkes ikke: triggeren
--    gjelder bare INSERT.
-- Erstatter: ingen funksjoner. apply_changes, delete_project og purge_* er uendret.
-- Bare additiv. Ingen SQL mot storage. Skrevet for gjennomgang; kjøres ikke i Cloud av Lovable.
-- Kjøres ÉN gang etter 0074.
-- =====================================================================================

-- ---------- 1. Tjenesteinnstillinger ----------
create table public.service_settings (
  id boolean primary key default true check (id),
  registration_open boolean not null default true,
  registration_message text check (registration_message is null or char_length(registration_message) <= 500),
  changed_at timestamptz,
  changed_by uuid
);
insert into public.service_settings (id) values (true) on conflict do nothing;
revoke all on public.service_settings from public, anon, authenticated;
grant all on public.service_settings to service_role;
alter table public.service_settings enable row level security;
-- Ingen policyer: klienter leser og skriver bare via security definer-funksjonene.

-- ---------- 2. Endre (bare administrator) ----------
create function public.set_registration_open(p_open boolean, p_message text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  if p_open is null then
    raise exception 'p_open mangler' using errcode = '22023';
  end if;
  if v_msg is not null and char_length(v_msg) > 500 then
    raise exception 'Meldingen er for lang' using errcode = '22023';
  end if;
  insert into public.service_settings (id) values (true) on conflict do nothing;
  update public.service_settings
    set registration_open = p_open, registration_message = v_msg,
        changed_at = now(), changed_by = (select auth.uid())
    where id;
end $$;
revoke all on function public.set_registration_open(boolean, text) from public, anon;
grant execute on function public.set_registration_open(boolean, text) to authenticated;

-- ---------- 3. Status for alle (bare open og melding) ----------
create function public.registration_status()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'open', coalesce((select s.registration_open from public.service_settings s where s.id), true),
    'message', (select s.registration_message from public.service_settings s where s.id and not s.registration_open)
  )
$$;
revoke all on function public.registration_status() from public;
grant execute on function public.registration_status() to anon, authenticated;

-- ---------- 4. Detaljer for administrator ----------
create function public.admin_registration_settings()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'open', s.registration_open,
      'message', s.registration_message,
      'changed_at', s.changed_at,
      'changed_by_name', (select p.display_name from public.profiles p where p.user_id = s.changed_by)
    )
    from public.service_settings s where s.id
  );
end $$;
revoke all on function public.admin_registration_settings() from public, anon;
grant execute on function public.admin_registration_settings() to authenticated;

-- ---------- 5. Håndheving ved nye kontoer ----------
create function private.guard_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(coalesce(new.email, '')));
begin
  if coalesce((select s.registration_open from public.service_settings s where s.id), true) then
    return new;
  end if;
  if v_email <> '' and (
    exists (select 1 from public.project_invitations i
            where lower(btrim(i.email)) = v_email and i.accepted_at is null
              and i.revoked_at is null and i.expires_at > now())
    or exists (select 1 from public.workspace_invitations w
               where lower(btrim(w.email)) = v_email and w.accepted_at is null
                 and w.revoked_at is null and w.expires_at > now())
  ) then
    return new;
  end if;
  raise exception 'registration_closed' using errcode = 'PTG01';
end $$;
revoke all on function private.guard_registration() from public, anon, authenticated;

drop trigger if exists guard_registration on auth.users;
create trigger guard_registration before insert on auth.users
  for each row execute function private.guard_registration();

insert into public.schema_version (version, description)
  values (75, '0075_registration_closed: B-109 stenge for nye registreringer');
