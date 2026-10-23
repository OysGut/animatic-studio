-- =====================================================================================
-- From Pen to Glass (repo: Animatic Studio) – migrasjon 0092: innlogging og registrering med Google.
-- Ny fil; 0091 er reservert for G-1b. Claude gjennomgår og kjører i Cloud. Kjøres ÉN gang etter 0091.
-- 1. Erstatter private.guard_registration (siste definisjon: 0076, kopiert ordrett). Endret bare dette:
--    - B-110-passet er bundet til e-postadressen og utstedes etter Turnstile. Ved Google-innlogging kjenner
--      appen ikke adressen før Google har svart, så passet kan ikke utstedes på forhånd. En ny konto der
--      innloggingstjenesten oppgir provider = 'google' og bekreftet e-post (email_confirmed_at satt), slipper
--      derfor passkravet. Begrunnelse: kontoen krever et gyldig Google-id-token for en ekte Google-konto, så
--      skriptede massekontoer via det åpne registrerings-API-et (det B-110 stopper) er fortsatt umulig.
--    - Stengt registrering (B-109) gjelder uendret også for Google, med det samme invitasjonsunntaket.
--    - Profilbilde-URL fra Google (avatar_url, picture) fjernes fra brukerens metadata før lagring.
-- 2. Ny private.guard_identity_update (BEFORE UPDATE på auth.users):
--    - Fjerner avatar_url/picture fra metadata også når Google oppdaterer dem ved senere innlogginger.
--    - Kontoovertakelse: når en Google-identitet kobles til en konto med UBEKREFTET e-post, slettes passordet
--      som ble satt før adressen var bekreftet (noen andre kan ha opprettet kontoen med adressen).
--      Eieren av Google-kontoen beholder tilgangen og kan sette nytt passord på Konto-siden.
-- Erstatter: private.guard_registration (0076). Oppretter: private.guard_identity_update og triggeren
-- guard_identity_update. apply_changes, delete_project og purge_* er uendret. Ingen data slettes.
-- Ingen SQL mot storage.
-- =====================================================================================

-- ---------- 1. Håndheving ved nye kontoer (erstatter 0076) ----------
create or replace function private.guard_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(coalesce(new.email, '')));
declare v_google boolean := coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google'
                            and new.email_confirmed_at is not null;
begin
  -- 0092: ingen profilbilde-URL fra Google lagres uten at brukeren vil
  if new.raw_user_meta_data is not null then
    new.raw_user_meta_data := new.raw_user_meta_data - 'avatar_url' - 'picture';
  end if;
  -- B-110: kontoer fra innloggingstjenesten krever bestått CAPTCHA (pass utstedt av serveren, brukes én gang)
  -- 0092: unntak for Google med bekreftet e-post (se toppen av filen)
  if session_user = 'supabase_auth_admin' and not v_google then
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

-- ---------- 2. Oppdateringer av eksisterende kontoer ----------
create function private.guard_identity_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_had_google boolean := coalesce(old.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google';
declare v_has_google boolean := coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
                                or coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google';
begin
  if new.raw_user_meta_data is not null then
    new.raw_user_meta_data := new.raw_user_meta_data - 'avatar_url' - 'picture';
  end if;
  -- Google kobles til en konto som ikke hadde bekreftet e-post: passordet satt av en ukjent fjernes
  if v_has_google and not v_had_google and old.email_confirmed_at is null
     and coalesce(old.encrypted_password, '') <> '' then
    new.encrypted_password := '';
  end if;
  return new;
end $$;
revoke all on function private.guard_identity_update() from public, anon, authenticated;

drop trigger if exists guard_identity_update on auth.users;
create trigger guard_identity_update before update on auth.users
  for each row execute function private.guard_identity_update();

insert into public.schema_version (version, description)
  values (92, '0092_google_sign_in: Google-innlogging, pass/stenging, ingen profilbilde-URL, vern mot overtakelse');
