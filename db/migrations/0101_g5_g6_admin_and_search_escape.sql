-- 0101_g5_g6_admin_and_search_escape: rest av G-5/G-6 og en retting til G-4.
--
-- 1. private.like_escape: \, % og _ i søketekst escapes før LIKE (som i 0080s admin_find_users). 0096 er
--    låst, så admin_find_users og search_script_blocks erstattes her med samme signatur, rettigheter og
--    sjekker; eneste endring er escapingen.
-- 2. Admin kan lese og justere G-8-takene (private.rate_limit_rules) fra adminsiden.
-- Alle SECURITY DEFINER-funksjoner har search_path = ''.

create or replace function private.like_escape(v text)
returns text
language sql immutable set search_path = '' as $$
  select pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(coalesce(v, ''), '\', '\\'), '%', '\%'), '_', '\_')
$$;
revoke all on function private.like_escape(text) from public;
grant execute on function private.like_escape(text) to authenticated, service_role;

create or replace function public.search_script_blocks(p_project uuid, p_query text, p_limit integer default 50)
returns table (block_id uuid, variant_id uuid, kind text, text text, score real)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.variant_id,
    b.kind,
    b.text,
    extensions.similarity(private.fold_text(b.text), private.fold_text(btrim(p_query))) as score
  from public.script_blocks b
  where b.project_id = p_project
    and p_project in (select private.my_project_ids())
    and not b.removed
    and private.fold_text(b.text) like '%' || private.like_escape(private.fold_text(btrim(p_query))) || '%'
  order by score desc, b.order_key
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
revoke all on function public.search_script_blocks(uuid, text, integer) from public, anon;
grant execute on function public.search_script_blocks(uuid, text, integer) to authenticated;

create or replace function public.admin_find_users(p_query text)
returns table (user_id uuid, email text, display_name text)
language plpgsql stable security definer set search_path = '' as $$
declare v_pat text;
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_query, ''))) < 3 then return; end if;
  v_pat := '%' || private.like_escape(private.fold_text(btrim(p_query))) || '%';
  return query
    select u.id, u.email::text, (select p.display_name from public.profiles p where p.user_id = u.id)
    from auth.users u
    where private.fold_text(u.email::text) like v_pat
       or private.fold_text(coalesce((select p2.display_name from public.profiles p2 where p2.user_id = u.id), ''))
          like v_pat
    order by u.email limit 20;
end $$;
revoke all on function public.admin_find_users(text) from public, anon;
grant execute on function public.admin_find_users(text) to authenticated;

-- ---------- 2. Hastighetsgrenser i adminsiden ----------
create or replace function public.admin_rate_limit_rules()
returns table (scope text, window_seconds integer, per_key integer, per_ip integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  return query select r.scope, r.window_seconds, r.per_key, r.per_ip from private.rate_limit_rules r order by r.scope;
end $$;
revoke all on function public.admin_rate_limit_rules() from public, anon;
grant execute on function public.admin_rate_limit_rules() to authenticated;

create or replace function public.admin_set_rate_limit_rule(p_scope text, p_window_seconds integer, p_per_key integer, p_per_ip integer)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  if p_window_seconds is null or p_window_seconds not between 1 and 86400
     or p_per_key is null or p_per_key not between 1 and 1000000
     or p_per_ip is null or p_per_ip not between 1 and 1000000 then
    raise exception 'Ugyldige verdier' using errcode = '22023';
  end if;
  -- Bare eksisterende omfang kan endres (nye omfang krever kode som bruker dem)
  update private.rate_limit_rules r
    set window_seconds = p_window_seconds, per_key = p_per_key, per_ip = p_per_ip
    where r.scope = p_scope;
  if not found then
    raise exception 'Ukjent omfang' using errcode = '22023';
  end if;
end $$;
revoke all on function public.admin_set_rate_limit_rule(text, integer, integer, integer) from public, anon;
grant execute on function public.admin_set_rate_limit_rule(text, integer, integer, integer) to authenticated;

insert into public.schema_version (version, description) values (101, '0101_g5_g6_admin_and_search_escape: LIKE-escaping og admin for hastighetsgrenser');

-- ---------------------------------------------------------------------------
-- G-8 oppfølging: serverens egne masseinnsettinger (create_dialogue_batch, create_harmonize_batch m.fl.)
-- skal ikke telle én gang per rad. Innsettinger gjort som service_role teller ett treff per transaksjon
-- per (omfang, nøkkel) – en batch er ett treff. Direkte innsettinger fra andre roller teller som før per rad.
-- Rollen leses fra SET ROLE (PostgREST/serveren) eller JWT-kravet, fordi current_user her er eieren.
-- Gjelder alle g8_rate_limit-triggere (generation_jobs, export_records, upload_sessions, …).
-- ---------------------------------------------------------------------------
create or replace function private.rate_limit_trigger()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_who text := to_jsonb(new) ->> tg_argv[1];
        v_prefix text := coalesce(tg_argv[2], 'u');
        v_key text := v_prefix || ':' || coalesce(v_who, '');
        v_role text := coalesce(nullif(pg_catalog.current_setting('role', true), 'none'), '');
        v_claim_role text := coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
        v_flag text;
begin
  if v_role = 'service_role' or v_claim_role = 'service_role' then
    v_flag := 'ptg_rl.t' || pg_catalog.md5(tg_argv[0] || '|' || v_key);
    if pg_catalog.current_setting(v_flag, true) = pg_catalog.txid_current()::text then
      return new;
    end if;
    perform pg_catalog.set_config(v_flag, pg_catalog.txid_current()::text, true);
  end if;
  perform private.rate_limit_hit(
    tg_argv[0],
    array[v_key, 'ip:' || coalesce(private.request_ip(), '')]
  );
  return new;
end $$;
revoke all on function private.rate_limit_trigger() from public, anon, authenticated;
