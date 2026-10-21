-- =====================================================================================
-- From Pen to Glass (repo: Animatic Studio) – migrasjon 0076: CAPTCHA ved nye kontoer (B-110).
-- Lovable Cloud lar oss ikke slå på innloggingstjenestens innebygde CAPTCHA. Derfor kontrolleres
-- Cloudflare Turnstile i en serverfunksjon. Når kontrollen er godkjent, får e-postadressen et kortlivet
-- «registreringspass» (15 minutter, kan brukes én gang). Triggeren fra 0075 krever passet når kontoen lages
-- av innloggingstjenesten (session_user = supabase_auth_admin). Direkte signUp/signInWithOtp fra nettleseren
-- uten bestått CAPTCHA kan dermed ikke lage kontoer.
-- 1. public.signup_passes (bare service_role; RLS på, ingen policyer).
-- 2. public.issue_signup_pass(p_email): bare service_role (serverfunksjonen etter bestått Turnstile).
-- 3. Erstatter private.guard_registration (0075): kopiert ordrett. Lagt til: en ny konto fra
--    innloggingstjenesten krever et gyldig pass, som brukes opp. Stengt registrering (0075) gjelder
--    fortsatt først, og passet overstyrer den ikke. Invitasjonsunntaket gjelder fortsatt bare stengingen.
--    Innsetting fra andre roller (migrasjoner og lokale tester) påvirkes ikke av passkravet.
-- Erstatter: private.guard_registration (0075). Triggeren guard_registration er uendret.
-- apply_changes, delete_project og purge_* er uendret. Bare additiv. Ingen SQL mot storage.
-- Skrevet for gjennomgang; kjøres ikke i Cloud av Lovable. Kjøres ÉN gang etter 0075.
-- =====================================================================================

-- ---------- 1. Registreringspass ----------
create table public.signup_passes (
  email text primary key check (email = lower(btrim(email)) and position('@' in email) > 1 and char_length(email) <= 320),
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now()
);
revoke all on public.signup_passes from public, anon, authenticated;
grant all on public.signup_passes to service_role;
alter table public.signup_passes enable row level security;

-- ---------- 2. Utstede pass (bare serveren) ----------
create function public.issue_signup_pass(p_email text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if position('@' in v_email) <= 1 or char_length(v_email) > 320 then
    raise exception 'Ugyldig e-postadresse' using errcode = '22023';
  end if;
  delete from public.signup_passes where expires_at <= now();
  insert into public.signup_passes (email) values (v_email)
    on conflict (email) do update set expires_at = now() + interval '15 minutes', created_at = now();
end $$;
revoke all on function public.issue_signup_pass(text) from public, anon, authenticated;
grant execute on function public.issue_signup_pass(text) to service_role;

-- ---------- 3. Håndheving ved nye kontoer (erstatter 0075) ----------
create or replace function private.guard_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(coalesce(new.email, '')));
begin
  -- B-110: kontoer fra innloggingstjenesten krever bestått CAPTCHA (pass utstedt av serveren, brukes én gang)
  if session_user = 'supabase_auth_admin' then
    delete from public.signup_passes p where p.email = v_email and p.expires_at > now();
    if not found then
      raise exception 'captcha_required' using errcode = 'PTG02';
    end if;
  end if;
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

insert into public.schema_version (version, description)
  values (76, '0076_signup_captcha_pass: B-110 CAPTCHA-pass ved nye kontoer');
