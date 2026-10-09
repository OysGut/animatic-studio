-- =====================================================================================
-- Animatic Studio – migrasjon 0007: 2D-sceneeditor (M3 del 2, mandat kap. 11–12, DEC-0035).
-- 1. compositions: én 2D-scene per scenevariant (format, varighet, bakgrunn, kamera med shots som jsonb).
-- 2. composition_layers: lagene i scenen som egne rader (to personer kan endre hvert sitt lag samtidig).
--    Et lag viser et bilde fra ressursbiblioteket (ressurs/variant/versjon) eller en fargeflate.
-- 3. Lesing for medlemmer; all skriving via apply_changes (som får de to nye tabellene).
-- Ingen eksisterende data endres. Kjøres ÉN gang i Lovable Cloud etter 0006. Endres aldri etter kjøring.
-- =====================================================================================

create table public.compositions (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  variant_id uuid not null references public.scene_variants (id),
  name text not null default '' check (length(name) <= 200),
  width integer not null default 1920 check (width between 16 and 16384),
  height integer not null default 1080 check (height between 16 and 16384),
  duration_frames integer not null default 0 check (duration_frames between 0 and 10000000),
  background text not null default '#101114' check (background ~ '^#[0-9a-f]{6}$'),
  camera jsonb not null default '{"shots":[]}'::jsonb
    check (jsonb_typeof(camera) = 'object' and pg_column_size(camera) <= 131072),
  removed boolean not null default false,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);
create index compositions_variant_idx on public.compositions (variant_id);
-- Én aktiv 2D-scene per scenevariant (to samtidige «Lag 2D-scene» gir ikke to scener)
create unique index compositions_one_active_per_variant on public.compositions (variant_id) where not removed;
create index compositions_project_idx on public.compositions (project_id);

create table public.composition_layers (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  composition_id uuid not null references public.compositions (id),
  order_key text not null check (order_key ~ '^[0-9a-z]+$' and right(order_key, 1) <> '0'),
  kind text not null check (kind in ('background','midground','foreground','character','object','effect','other')),
  name text not null default '' check (length(name) <= 200),
  asset_id uuid references public.assets (id),
  asset_variant_id uuid references public.asset_variants (id),
  version_id uuid references public.asset_versions (id),
  fill text check (fill ~ '^#[0-9a-f]{6}$'),
  width integer not null check (width between 1 and 16384),
  height integer not null check (height between 1 and 16384),
  parallax double precision not null default 1 check (parallax between 0 and 4),
  transform jsonb not null check (jsonb_typeof(transform) = 'object'),
  keyframes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(keyframes) = 'array' and pg_column_size(keyframes) <= 524288),
  visible boolean not null default true,
  locked boolean not null default false,
  group_id text check (length(group_id) <= 64),
  removed boolean not null default false,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  -- Et lag viser et bilde eller en fargeflate; versjon krever variant, variant krever ressurs
  check (asset_id is not null or fill is not null),
  check (asset_variant_id is null or asset_id is not null),
  check (version_id is null or asset_variant_id is not null),
  constraint composition_layers_order_unique unique (composition_id, order_key) deferrable initially deferred
);
create index composition_layers_composition_idx on public.composition_layers (composition_id);
create index composition_layers_project_idx on public.composition_layers (project_id);
create index composition_layers_asset_idx on public.composition_layers (asset_id);

-- Bare lesing for medlemmer; all skriving via apply_changes
do $$
declare t text;
begin
  foreach t in array array['compositions','composition_layers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_project_member(project_id))', t || '_read', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- apply_changes med de nye tabellene (ellers uendret fra 0004) ----------
create or replace function public.apply_changes(
  p_project uuid, p_actor uuid, p_command_id uuid, p_command jsonb, p_inverse jsonb, p_changes jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tables text[] := array['productions','scenes','scene_variants','script_blocks','scene_occurrences','production_segments','takes',
                           'assets','asset_variants','asset_versions','script_annotations',
                           'compositions','composition_layers'];
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
  -- Endringer for tabeller funksjonen ikke kjenner, avvises (ellers ville de gått tapt i stillhet)
  if exists (
    select 1 from (
      select jsonb_object_keys(coalesce(p_changes -> 'inserts', '{}'::jsonb)) k
      union all select jsonb_object_keys(coalesce(p_changes -> 'updates', '{}'::jsonb))
      union all select jsonb_object_keys(coalesce(p_changes -> 'deletes', '{}'::jsonb))
    ) x where not (x.k = any (v_tables))
  ) then
    raise exception 'Endringen gjelder en ukjent tabell' using errcode = '22023';
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
  foreach v_t in array array['composition_layers','compositions','script_annotations','asset_versions','asset_variants','assets',
                             'takes','production_segments','scene_occurrences','script_blocks','scene_variants','scenes','productions'] loop
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

insert into public.schema_version (version, description) values (7, '0007_compositions: 2D-sceneeditor (2D-scener med format og kamera, lag med bilder fra biblioteket eller fargeflater)');