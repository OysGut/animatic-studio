-- B-107 / B-111. Additive from Cloud 0076. Claude applies after DB checks.
-- Replaces: public.set_my_locale(text). No other functions replaced.
-- Existing preferences remain unchanged; language is a UI preference, not a permission.
-- No table creation: existing owner-only profiles RLS and grants remain unchanged.
alter table public.profiles drop constraint profiles_locale_check;
alter table public.profiles add constraint profiles_locale_check
  check (locale is null or (length(locale) <= 100 and locale ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$'));

create or replace function public.set_my_locale(p_locale text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  if p_locale is null or length(p_locale) > 100
     or p_locale !~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$'
     or lower(p_locale) in ('en-xa', 'x-test') then
    raise exception 'Ukjent språk' using errcode = '22023';
  end if;
  insert into public.profiles (user_id, display_name, locale)
    values (v_user, left(split_part(coalesce((select email from auth.users where id = v_user), ''), '@', 1), 100), p_locale)
    on conflict (user_id) do update set locale = p_locale, updated_at = now();
end $$;
revoke all on function public.set_my_locale(text) from public, anon;
grant execute on function public.set_my_locale(text) to authenticated;
grant all on function public.set_my_locale(text) to service_role;

insert into public.schema_version (version, description)
  values (77, '0077_open_ui_languages: B-107 åpent grensesnittspråk');