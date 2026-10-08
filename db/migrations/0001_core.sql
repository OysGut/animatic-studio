-- =====================================================================================
-- Animatic Studio – migrasjon 0001: kjernestruktur, samarbeid og tilgangskontroll
-- Kilde: docs/architecture/DATA_RELATIONSHIPS.md, ADR-0004, ADR-0005, DEC-0020, DEC-0022
-- Kjøres ÉN gang i Lovable Cloud (se docs/development/LOVABLE_SYNC.md). Endres aldri etter kjøring;
-- senere endringer kommer som nye filer (0002_…).
--
-- Prinsipper:
--  * Permanente UUID-er; scenenummer er aldri nøkkel (INV-02).
--  * Klienten har bare LESETILGANG (RLS). All skriving går via serveren:
--      - public.create_project(...)       (innlogget bruker)
--      - public.apply_changes(...)        (bare service_role – brukt av serverfunksjonen som kjører domenekjernen)
--      - public.create_invitation / accept_invitation (DEC-0003)
--  * Revisjonskontroll på hver rad (INV-C1): avvik gir SQLSTATE P0409.
--  * Ingen kaskadesletting av produksjonsdata. Takes og historikk slettes aldri (INV-07, INV-13).
-- =====================================================================================

create schema if not exists private;

-- ---------- Skjemaversjon (appen sjekker at forventet versjon er kjørt) ----------
create table if not exists public.schema_version (
  version integer primary key,
  description text not null,
  applied_at timestamptz not null default now()
);

-- ---------- Prosjekt og samarbeid ----------
create table public.projects (
  id uuid primary key,
  name text not null check (length(btrim(name)) between 1 and 200),
  fps_num integer not null default 25 check (fps_num > 0),
  fps_den integer not null default 1 check (fps_den > 0),
  primary_language text not null default 'nb' check (primary_language = 'nb'),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id)
);

create table public.project_members (
  project_id uuid not null references public.projects (id),
  user_id uuid not null references auth.users (id),
  role text not null check (role in ('owner', 'editor', 'commenter', 'viewer')),
  can_approve_costs boolean not null default false,
  invited_by uuid references auth.users (id),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id) where removed_at is null;

create table public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  email text not null check (position('@' in email) > 1),
  role text not null check (role in ('editor', 'commenter', 'viewer')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  revoked_at timestamptz
);

-- ---------- Produksjonsstruktur ----------
create table public.productions (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  kind text not null check (kind in ('main','spinoff','short','trailer','teaser','pitch','pilot','alternative','other')),
  name text not null check (length(btrim(name)) between 1 and 200),
  parent_production_id uuid references public.productions (id),
  fps_num integer not null check (fps_num > 0),
  fps_den integer not null check (fps_den > 0),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);
create unique index productions_one_main on public.productions (project_id) where kind = 'main';

create table public.scenes (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  origin_production_id uuid not null references public.productions (id),
  story_kind text not null default 'linear' check (story_kind in ('linear','flashback','flashforward','dream','jump')),
  story_anchor_scene_id uuid references public.scenes (id),
  story_offset double precision not null default 0,
  derived_from_scene_id uuid references public.scenes (id),
  merged_into_scene_id uuid references public.scenes (id),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  check (story_kind <> 'linear' or story_anchor_scene_id is null)
);

create table public.scene_variants (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  scene_id uuid not null references public.scenes (id),
  owner_production_id uuid references public.productions (id), -- null = delt hovedvariant
  based_on_variant_id uuid references public.scene_variants (id),
  heading_int_ext text not null default '',
  heading_location text not null default '',
  heading_time text not null default '',
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create table public.script_blocks (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  variant_id uuid not null references public.scene_variants (id),
  kind text not null check (kind in ('heading','action','character','parenthetical','dialogue','transition','shot','note')),
  order_key text not null check (order_key ~ '^[0-9a-z]+$' and right(order_key, 1) <> '0'),
  current_rev integer not null default 1 check (current_rev >= 1),
  text text not null default '',
  language text not null default 'nb' check (language = 'nb'),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);
create index script_blocks_variant_idx on public.script_blocks (variant_id, order_key);

-- Uforanderlig teksthistorikk (DEC-0020 pkt. 5). Slettes bare sammen med blokken ved angre av opprettelse.
create table public.script_block_revisions (
  project_id uuid not null references public.projects (id),
  block_id uuid not null references public.script_blocks (id) on delete cascade,
  rev integer not null check (rev >= 1),
  text text not null,
  author uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (block_id, rev)
);

create table public.scene_occurrences (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  production_id uuid not null references public.productions (id),
  scene_id uuid not null references public.scenes (id),
  variant_id uuid not null references public.scene_variants (id),
  order_key text not null check (order_key ~ '^[0-9a-z]+$' and right(order_key, 1) <> '0'),
  active boolean not null default true,
  excerpt_in integer,
  excerpt_out integer,
  active_take_id uuid, -- FK legges til etter takes (syklisk, utsatt kontroll)
  production_number text, -- visning, aldri identitet (INV-02)
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint scene_occurrences_order_unique unique (production_id, order_key) deferrable initially deferred,
  check ((excerpt_in is null and excerpt_out is null) or (excerpt_in >= 0 and excerpt_out > excerpt_in))
);
create index scene_occurrences_production_idx on public.scene_occurrences (production_id, order_key);

create table public.production_segments (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  occurrence_id uuid not null references public.scene_occurrences (id),
  reason text not null check (reason in ('narrative_subsequence','continuity_change','model_limit','manual')),
  order_key text not null check (order_key ~ '^[0-9a-z]+$'),
  start_block_id uuid references public.script_blocks (id),
  end_block_id uuid references public.script_blocks (id),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create table public.takes (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  occurrence_id uuid not null references public.scene_occurrences (id),
  segment_id uuid references public.production_segments (id),
  kind text not null check (kind in ('composition2d','ai_video','imported_film','still','audio_only')),
  status text not null check (status in ('reference','in_progress','approved')),
  duration_frames integer check (duration_frames is null or duration_frames >= 0),
  produced_from jsonb not null default '{}'::jsonb,
  media_ref text,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);
alter table public.scene_occurrences
  add constraint scene_occurrences_active_take_fk foreign key (active_take_id)
  references public.takes (id) deferrable initially deferred;

create table public.change_log (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  actor uuid not null references auth.users (id),
  command_type text not null,
  command jsonb not null,
  inverse jsonb,
  affected_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index change_log_project_idx on public.change_log (project_id, created_at desc);

-- Takes kan aldri slettes eller få endret kildepeker (INV-07). Status kan endres.
create function private.protect_takes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Produsert materiale kan ikke slettes (INV-07)' using errcode = 'P0001';
  end if;
  if new.occurrence_id <> old.occurrence_id or new.produced_from <> old.produced_from
     or new.media_ref is distinct from old.media_ref or new.kind <> old.kind then
    raise exception 'Produsert materiale kan ikke overskrives (INV-07)' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger takes_protect before update or delete on public.takes
  for each row execute function private.protect_takes();

create function private.protect_history() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Historikk kan ikke endres eller slettes (INV-13)' using errcode = 'P0001';
end $$;
create trigger block_revisions_immutable before update on public.script_block_revisions
  for each row execute function private.protect_history();
create trigger change_log_immutable before update or delete on public.change_log
  for each row execute function private.protect_history();

-- ---------- Tilgangsfunksjoner (DEC-0020 pkt. 2) ----------
create function private.role_rank(p_role text) returns integer
language sql immutable set search_path = '' as $$
  select case p_role when 'owner' then 4 when 'editor' then 3 when 'commenter' then 2 when 'viewer' then 1 else 0 end
$$;

create function private.is_project_member(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.user_id = (select auth.uid()) and m.removed_at is null
  )
$$;

create function private.member_role_rank(p_project uuid, p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(max(private.role_rank(m.role)), 0) from public.project_members m
  where m.project_id = p_project and m.user_id = p_user and m.removed_at is null
$$;

create function private.has_project_role(p_project uuid, p_min_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.member_role_rank(p_project, (select auth.uid())) >= private.role_rank(p_min_role)
$$;

create function private.can_approve_costs(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.user_id = (select auth.uid()) and m.removed_at is null and m.can_approve_costs
  )
$$;

-- ---------- RLS: bare lesing for medlemmer ----------
do $$
declare t text;
begin
  foreach t in array array['productions','scenes','scene_variants','script_blocks','script_block_revisions',
                           'scene_occurrences','production_segments','takes','change_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_project_member(project_id))', t || '_read', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

alter table public.projects enable row level security;
create policy projects_read on public.projects for select to authenticated using (private.is_project_member(id));
revoke insert, update, delete, truncate on public.projects from anon, authenticated;
grant select on public.projects to authenticated;

alter table public.project_members enable row level security;
create policy project_members_read on public.project_members for select to authenticated using (private.is_project_member(project_id));
revoke insert, update, delete, truncate on public.project_members from anon, authenticated;
grant select on public.project_members to authenticated;

alter table public.project_invitations enable row level security;
create policy project_invitations_read on public.project_invitations for select to authenticated
  using (private.has_project_role(project_id, 'owner'));
revoke insert, update, delete, truncate on public.project_invitations from anon, authenticated;
grant select on public.project_invitations to authenticated;

alter table public.schema_version enable row level security;
create policy schema_version_read on public.schema_version for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.schema_version from anon, authenticated;
grant select on public.schema_version to anon, authenticated;

-- ---------- RPC: opprett prosjekt ----------
create function public.create_project(p_name text, p_fps_num integer default 25, p_fps_den integer default 1)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_project uuid := gen_random_uuid();
  v_main uuid := gen_random_uuid();
begin
  if v_user is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  insert into public.projects (id, name, fps_num, fps_den, created_by) values (v_project, btrim(p_name), p_fps_num, p_fps_den, v_user);
  insert into public.project_members (project_id, user_id, role, can_approve_costs) values (v_project, v_user, 'owner', true);
  insert into public.productions (id, project_id, kind, name, fps_num, fps_den, created_by)
    values (v_main, v_project, 'main', 'Hovedfilm', p_fps_num, p_fps_den, v_user);
  insert into public.change_log (id, project_id, actor, command_type, command, affected_ids)
    values (gen_random_uuid(), v_project, v_user, 'CreateProject',
            jsonb_build_object('name', btrim(p_name), 'mainProductionId', v_main), array[v_project, v_main]);
  return v_project;
end $$;
revoke all on function public.create_project(text, integer, integer) from public, anon;
grant execute on function public.create_project(text, integer, integer) to authenticated;

-- ---------- RPC: lagre endringssett fra domenekjernen (DEC-0022) ----------
create function private.table_columns(p_table text) returns text[]
language sql stable set search_path = '' as $$
  select array_agg(column_name::text order by ordinal_position)
  from information_schema.columns where table_schema = 'public' and table_name = p_table
$$;

create function public.apply_changes(
  p_project uuid, p_actor uuid, p_command_id uuid, p_command jsonb, p_inverse jsonb, p_changes jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tables text[] := array['productions','scenes','scene_variants','script_blocks','scene_occurrences','production_segments','takes'];
  v_t text;
  v_rows jsonb;
  v_row jsonb;
  v_cols text[];
  v_set text;
  v_count integer;
  v_affected uuid[] := '{}';
begin
  if private.member_role_rank(p_project, p_actor) < private.role_rank('editor') then
    raise exception 'Brukeren har ikke skriverett i prosjektet' using errcode = '42501';
  end if;

  -- 1) Nye rader (rekkefølge etter fremmednøkler)
  foreach v_t in array v_tables loop
    v_rows := coalesce(p_changes -> 'inserts' -> v_t, '[]'::jsonb);
    if jsonb_array_length(v_rows) = 0 then continue; end if;
    if exists (select 1 from jsonb_array_elements(v_rows) r where (r ->> 'project_id')::uuid is distinct from p_project) then
      raise exception 'Rad tilhører et annet prosjekt' using errcode = '42501';
    end if;
    select array_agg(c) into v_cols from unnest(private.table_columns(v_t)) c
      where c <> 'created_at' and (c = 'created_by' or (v_rows -> 0) ? c);
    v_rows := (select jsonb_agg(r || jsonb_build_object('created_by', p_actor)) from jsonb_array_elements(v_rows) r);
    execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)',
      v_t, (select string_agg(quote_ident(c), ',') from unnest(v_cols) c),
      (select string_agg(quote_ident(c), ',') from unnest(v_cols) c), v_t) using v_rows;
    v_affected := v_affected || (select array_agg((r ->> 'id')::uuid) from jsonb_array_elements(v_rows) r);
  end loop;

  -- 2) Endrede rader med revisjonskontroll (INV-C1)
  foreach v_t in array v_tables loop
    for v_row in select * from jsonb_array_elements(coalesce(p_changes -> 'updates' -> v_t, '[]'::jsonb)) loop
      if (v_row ->> 'revision')::int <> (v_row ->> 'expected_revision')::int + 1 then
        raise exception 'Ugyldig revisjon for %', v_row ->> 'id' using errcode = '22023';
      end if;
      select array_agg(c) into v_cols from unnest(private.table_columns(v_t)) c
        where c not in ('id','project_id','created_at','created_by') and v_row ? c;
      v_set := (select string_agg(format('%1$I = r.%1$I', c), ', ') from unnest(v_cols) c);
      execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r
                      where t.id = ($1 ->> ''id'')::uuid and t.project_id = $2 and t.revision = ($1 ->> ''expected_revision'')::int',
                     v_t, v_set, v_t) using v_row, p_project;
      get diagnostics v_count = row_count;
      if v_count = 0 then
        raise exception 'Revisjonskonflikt' using errcode = 'P0409', detail = v_row ->> 'id';
      end if;
      v_affected := v_affected || (v_row ->> 'id')::uuid;
    end loop;
  end loop;

  -- 3) Fjernede rader (bare ved angre av opprettelse), motsatt rekkefølge
  foreach v_t in array array['takes','production_segments','scene_occurrences','script_blocks','scene_variants','scenes','productions'] loop
    for v_row in select * from jsonb_array_elements(coalesce(p_changes -> 'deletes' -> v_t, '[]'::jsonb)) loop
      execute format('delete from public.%I where id = ($1 ->> ''id'')::uuid and project_id = $2 and revision = ($1 ->> ''expected_revision'')::int', v_t)
        using v_row, p_project;
      get diagnostics v_count = row_count;
      if v_count = 0 then
        raise exception 'Revisjonskonflikt' using errcode = 'P0409', detail = v_row ->> 'id';
      end if;
      v_affected := v_affected || (v_row ->> 'id')::uuid;
    end loop;
  end loop;

  -- 4) Ny teksthistorikk
  v_rows := coalesce(p_changes -> 'blockRevisions', '[]'::jsonb);
  if jsonb_array_length(v_rows) > 0 then
    if exists (select 1 from jsonb_array_elements(v_rows) r
               where (r ->> 'project_id')::uuid is distinct from p_project or (r ->> 'author')::uuid is distinct from p_actor) then
      raise exception 'Ugyldig historikkrad' using errcode = '42501';
    end if;
    insert into public.script_block_revisions (project_id, block_id, rev, text, author, created_at)
      select project_id, block_id, rev, text, author, coalesce(created_at, now())
      from jsonb_populate_recordset(null::public.script_block_revisions, v_rows);
  end if;

  -- 5) Kommandologg (ADR-0005)
  insert into public.change_log (id, project_id, actor, command_type, command, inverse, affected_ids)
    values (p_command_id, p_project, p_actor, p_command ->> 'type', p_command, p_inverse, v_affected);

  return jsonb_build_object('ok', true, 'changeId', p_command_id, 'affected', to_jsonb(v_affected));
end $$;
revoke all on function public.apply_changes(uuid, uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_changes(uuid, uuid, uuid, jsonb, jsonb, jsonb) to service_role;

-- ---------- RPC: invitasjoner (DEC-0003, REQ-0521) ----------
create function public.create_invitation(p_project uuid, p_email text, p_role text default 'editor')
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not private.has_project_role(p_project, 'owner') then
    raise exception 'Bare prosjekteier kan invitere' using errcode = '42501';
  end if;
  insert into public.project_invitations (project_id, email, role, token_hash, invited_by)
    values (p_project, lower(btrim(p_email)), p_role, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), (select auth.uid()));
  return v_token; -- vises én gang; bare hash lagres
end $$;
revoke all on function public.create_invitation(uuid, text, text) from public, anon;
grant execute on function public.create_invitation(uuid, text, text) to authenticated;

create function public.accept_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_inv public.project_invitations;
begin
  if v_user is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select * into v_inv from public.project_invitations
    where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
      and accepted_at is null and revoked_at is null and expires_at > now()
    for update;
  if not found then raise exception 'Invitasjonen er ugyldig eller utløpt' using errcode = '22023'; end if;
  insert into public.project_members (project_id, user_id, role, invited_by)
    values (v_inv.project_id, v_user, v_inv.role, v_inv.invited_by)
    on conflict (project_id, user_id) do update set removed_at = null, role = excluded.role;
  update public.project_invitations set accepted_at = now(), accepted_by = v_user where id = v_inv.id;
  return v_inv.project_id;
end $$;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- ---------- Realtime (endringsvarsler til andre medlemmer) ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.scene_occurrences, public.script_blocks, public.takes, public.change_log;
  end if;
end $$;

insert into public.schema_version (version, description) values (1, '0001_core: struktur, samarbeid, RLS, apply_changes');
