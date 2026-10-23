-- 0100_g8_rate_limits: G-8 sikkerhetsrunde 2 – felles hastighetsgrenser i databasen.
--
-- Én mekanisme for alle kall som kan misbrukes: private.rate_limit_hit(scope, keys[]) teller treff i
-- faste tidsvinduer per nøkkel ('u:<bruker>', 'e:<e-post>', 'ip:<adresse>') og stopper med SQLSTATE
-- PTG15 når taket er nådd (oversatt i klienten). Takene ligger i private.rate_limit_rules, så de kan
-- justeres uten kodeendring. Brukes av:
--   * triggere før innsetting i tabellene bak invitasjoner, deling, eksport, KI-jobber, import,
--     mobilopplasting, rapporter, kommentarer og registreringspass (gjelder også direkte RPC-kall);
--   * public.rate_limit_hit (bare service_role) fra serverfunksjonene for innlogging/pass med IP;
--   * public.globe_points (offentlig) per IP/bruker.
-- IP leses bare fra PostgREST-forespørselen når kallet kommer fra anon/authenticated; ved service_role
-- sender serveren IP selv. Alle SECURITY DEFINER-funksjoner har search_path = ''.

create table private.rate_limit_rules (
  scope text primary key check (scope ~ '^[a-z_]{2,40}$'),
  window_seconds integer not null check (window_seconds between 1 and 86400),
  per_key integer not null check (per_key >= 1),
  per_ip integer not null check (per_ip >= 1)
);

create table private.rate_limit_hits (
  scope text not null,
  key text not null check (char_length(key) <= 400),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (scope, key, window_start)
);
create index rate_limit_hits_window_idx on private.rate_limit_hits (window_start);

revoke all on private.rate_limit_rules, private.rate_limit_hits from public, anon, authenticated;
grant all on private.rate_limit_rules, private.rate_limit_hits to service_role;

insert into private.rate_limit_rules (scope, window_seconds, per_key, per_ip) values
  ('auth',           600,  10,  30),   -- innlogging, innloggingslenke, glemt passord (per e-post / IP)
  ('signup_pass',   3600,   5,  20),   -- registreringspass
  ('invitation',    3600,  50, 100),   -- prosjekt- og arbeidsgruppeinvitasjoner
  ('share',         3600,  30,  60),   -- filmdelingslenker
  ('export',        3600, 300, 600),   -- eksportreservasjoner/-poster
  ('ai',             600, 400, 800),   -- KI-jobber (batcher legger inn mange)
  ('import',        3600,  60, 120),   -- importerte manusfiler
  ('upload_session',3600,  60, 120),   -- mobilopplastingsøkter
  ('report',        3600,  20,  40),   -- innholdsrapporter
  ('comment',        600,  30,  60),   -- kommentarer i utstillingen
  ('globe',           60,  30,  30);   -- globuspunkter på innloggingssiden

-- IP-adressen til den som kaller via PostgREST (null for service_role og utenfor forespørsler).
create function private.request_ip()
returns text
language plpgsql stable security definer set search_path = '' as $$
declare h jsonb; v text;
begin
  if coalesce(current_setting('role', true), '') not in ('anon', 'authenticated') then return null; end if;
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then return null;
  end;
  if h is null then return null; end if;
  v := coalesce(nullif(btrim(h ->> 'cf-connecting-ip'), ''), nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''));
  return left(v, 100);
end $$;

-- Teller ett treff for hver nøkkel; PTG15 hvis en nøkkel er over taket i gjeldende vindu.
create function private.rate_limit_hit(p_scope text, p_keys text[])
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  r private.rate_limit_rules;
  k text;
  v_start timestamptz;
  v_hits integer;
  v_max integer;
begin
  select * into r from private.rate_limit_rules where scope = p_scope;
  if not found then return; end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / r.window_seconds) * r.window_seconds);
  foreach k in array coalesce(p_keys, '{}'::text[]) loop
    continue when k is null or k = '' or k = 'u:' or k = 'e:' or k = 'ip:';
    insert into private.rate_limit_hits as h (scope, key, window_start, hits)
      values (p_scope, left(k, 400), v_start, 1)
      on conflict (scope, key, window_start) do update set hits = h.hits + 1
      returning h.hits into v_hits;
    v_max := case when k like 'ip:%' then r.per_ip else r.per_key end;
    if v_hits > v_max then
      raise exception 'For mange forespørsler (%), vent litt og prøv igjen', p_scope using errcode = 'PTG15';
    end if;
  end loop;
  -- Rydd gamle vinduer av og til (billig, avgrenset)
  if random() < 0.01 then
    delete from private.rate_limit_hits
     where ctid = any(array(select ctid from private.rate_limit_hits where window_start < now() - interval '1 day' limit 1000));
  end if;
end $$;

-- Triggerfunksjon: TG_ARGV[0] = scope, TG_ARGV[1] = kolonnen med bruker-ID (eller e-post, se TG_ARGV[2]).
create function private.rate_limit_trigger()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_who text := to_jsonb(new) ->> tg_argv[1];
        v_prefix text := coalesce(tg_argv[2], 'u');
begin
  perform private.rate_limit_hit(
    tg_argv[0],
    array[v_prefix || ':' || coalesce(v_who, ''), 'ip:' || coalesce(private.request_ip(), '')]
  );
  return new;
end $$;

create trigger g8_rate_limit before insert on public.project_invitations
  for each row execute function private.rate_limit_trigger('invitation', 'invited_by');
create trigger g8_rate_limit before insert on public.workspace_invitations
  for each row execute function private.rate_limit_trigger('invitation', 'invited_by');
create trigger g8_rate_limit before insert on public.film_shares
  for each row execute function private.rate_limit_trigger('share', 'created_by');
create trigger g8_rate_limit before insert on public.export_records
  for each row execute function private.rate_limit_trigger('export', 'created_by');
create trigger g8_rate_limit before insert on public.generation_jobs
  for each row execute function private.rate_limit_trigger('ai', 'created_by');
create trigger g8_rate_limit before insert on public.imported_documents
  for each row execute function private.rate_limit_trigger('import', 'created_by');
create trigger g8_rate_limit before insert on public.upload_sessions
  for each row execute function private.rate_limit_trigger('upload_session', 'created_by');
create trigger g8_rate_limit before insert on public.content_reports
  for each row execute function private.rate_limit_trigger('report', 'reporter');
create trigger g8_rate_limit before insert on public.showcase_comments
  for each row execute function private.rate_limit_trigger('comment', 'author');
create trigger g8_rate_limit before insert on public.signup_passes
  for each row execute function private.rate_limit_trigger('signup_pass', 'email', 'e');

-- Serverfunksjonene (innlogging/pass) sender egne nøkler med IP. Bare service_role.
create function public.rate_limit_hit(p_scope text, p_keys text[])
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.rate_limit_hit(p_scope, p_keys);
end $$;
revoke all on function public.rate_limit_hit(text, text[]) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text[]) to service_role;

revoke all on function private.request_ip() from public, anon, authenticated;
revoke all on function private.rate_limit_hit(text, text[]) from public, anon, authenticated;
revoke all on function private.rate_limit_trigger() from public, anon, authenticated;

-- Globuspunkter: samme resultat som 0085, men med hastighetsgrense (må derfor være volatile/plpgsql).
create or replace function public.globe_points()
returns table (lat double precision, lon double precision, active boolean)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.rate_limit_hit('globe', array['u:' || coalesce(auth.uid()::text, ''), 'ip:' || coalesce(private.request_ip(), '')]);
  return query
  with users as (
    select p.user_id,
           coalesce(c.lat, k.lat) as base_lat,
           coalesce(c.lon, k.lon) as base_lon,
           coalesce(s.last_seen_at > now() - interval '1 hour', false)
             or coalesce(s.last_active_at > now() - interval '1 hour', false) as active,
           md5('b117:' || p.user_id::text) as h
    from public.profiles p
    left join public.account_status s on s.user_id = p.user_id
    left join private.globe_places c on c.id = p.city and c.country = p.country
    left join private.globe_places k on k.country = p.country and k.capital
    where p.country is not null
      and coalesce(s.status, 'active') = 'active'
      and coalesce(c.lat, k.lat) is not null
  ), off as (
    select u.base_lat, u.base_lon, u.active,
           (2 + 10 * (('x' || substr(u.h, 1, 8))::bit(32)::bigint / 4294967296.0)) / 6371.0 as d,
           2 * pi() * (('x' || substr(u.h, 9, 8))::bit(32)::bigint / 4294967296.0) as b
    from users u
  )
  select greatest(-89.9, least(89.9, o.base_lat + degrees(o.d * cos(o.b))))::double precision,
         (case when o.base_lon + degrees(o.d * sin(o.b) / cos(radians(o.base_lat))) > 180
                then o.base_lon + degrees(o.d * sin(o.b) / cos(radians(o.base_lat))) - 360
              when o.base_lon + degrees(o.d * sin(o.b) / cos(radians(o.base_lat))) < -180
                then o.base_lon + degrees(o.d * sin(o.b) / cos(radians(o.base_lat))) + 360
              else o.base_lon + degrees(o.d * sin(o.b) / cos(radians(o.base_lat))) end)::double precision,
         o.active
  from off o
  order by 1, 2;
end $$;
revoke all on function public.globe_points() from public;
grant execute on function public.globe_points() to anon, authenticated, service_role;

insert into public.schema_version (version, description) values (100, '0100_g8_rate_limits: G-8 felles hastighetsgrenser (PTG15)');
