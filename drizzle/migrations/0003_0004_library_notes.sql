-- =====================================================================================
-- Animatic Studio – migrasjon 0004: ressursbibliotek (M3 del 1; mandat kap. 8–9,
-- REQ-0121–0126, REQ-0131, REQ-0135, REQ-0136, REQ-0146, REQ-0149; DEC-0030) og notater i manus
-- (DEC-0031, REQ-0535–0540).
-- Ressurser (karakterer, objekter, lokasjoner …) med permanent ID og alternative navn, visuelle varianter
-- (stil og utseendetilstand) og uforanderlige bildeversjoner med eksplisitt godkjenning.
-- All skriving går som før via runCommand → public.apply_changes (bare service_role), som her utvides
-- med de tre nye tabellene. Bildene ligger i den private bøtten «assets».
-- Kjøres ÉN gang i Lovable Cloud etter 0003. Endres aldri etter kjøring.
-- =====================================================================================

create table public.assets (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  kind text not null check (kind in ('character','object','location','animal','environment','other')),
  name text not null check (length(btrim(name)) between 1 and 200),
  names jsonb not null default '[]'::jsonb check (jsonb_typeof(names) = 'array' and jsonb_array_length(names) <= 50),
  description text not null default '' check (length(description) <= 5000),
  category text not null default '' check (length(category) <= 100),
  tags jsonb not null default '[]'::jsonb check (jsonb_typeof(tags) = 'array' and jsonb_array_length(tags) <= 30),
  archived boolean not null default false,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);
create index assets_project_idx on public.assets (project_id, kind);

create table public.asset_variants (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  asset_id uuid not null references public.assets (id),
  name text not null check (length(btrim(name)) between 1 and 200),
  style text not null check (style in ('reference','illustrated','realistic','animatic','poster','other')),
  appearance text not null default '' check (length(appearance) <= 500),
  approved_version_id uuid, -- FK legges til etter asset_versions (syklisk, utsatt kontroll)
  archived boolean not null default false,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);
create index asset_variants_asset_idx on public.asset_variants (asset_id);

create table public.asset_versions (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  variant_id uuid not null references public.asset_variants (id),
  number integer not null check (number >= 1),
  media_path text not null check (length(media_path) <= 600 and split_part(media_path, '/', 1) = project_id::text),
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp','image/gif')),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  byte_size integer not null check (byte_size > 0 and byte_size <= 52428800),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  note text not null default '' check (length(note) <= 2000),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint asset_versions_number_unique unique (variant_id, number)
);
alter table public.asset_variants
  add constraint asset_variants_approved_fk foreign key (approved_version_id)
  references public.asset_versions (id) deferrable initially deferred;

-- En bildeversjon endres aldri (REQ-0136). Den kan bare fjernes ved angre rett etter opplasting (apply_changes).
create trigger asset_versions_immutable before update on public.asset_versions
  for each row execute function private.protect_history();

-- ---------- Notater i manus (DEC-0031) ----------
-- Festet til et tekstutsnitt i en blokk (block_id + tegnområde + sitat) eller som nål på en scene (variant_id).
-- Stempelet (author_name, stamp_at) vises på notatet; ved import fra fil beholdes originalens navn og tid.
create table public.script_annotations (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  variant_id uuid references public.scene_variants (id),
  block_id uuid references public.script_blocks (id),
  range_start integer not null default 0 check (range_start >= 0),
  range_end integer not null default 0 check (range_end >= range_start),
  quote text not null default '' check (length(quote) <= 5000),
  text text not null check (length(btrim(text)) between 1 and 10000),
  author_name text not null default '' check (length(author_name) <= 100),
  stamp_at timestamptz not null default now(),
  removed boolean not null default false,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  check ((block_id is null) <> (variant_id is null))
);
create index script_annotations_block_idx on public.script_annotations (block_id);
create index script_annotations_variant_idx on public.script_annotations (variant_id);

-- Bare lesing for medlemmer; all skriving via apply_changes
do $$
declare t text;
begin
  foreach t in array array['assets','asset_variants','asset_versions','script_annotations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_project_member(project_id))', t || '_read', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- apply_changes med de nye tabellene (ellers uendret fra 0001) ----------
create or replace function public.apply_changes(
  p_project uuid, p_actor uuid, p_command_id uuid, p_command jsonb, p_inverse jsonb, p_changes jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tables text[] := array['productions','scenes','scene_variants','script_blocks','scene_occurrences','production_segments','takes',
                           'assets','asset_variants','asset_versions','script_annotations'];
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
  foreach v_t in array array['script_annotations','asset_versions','asset_variants','assets',
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

-- ---------- Bilder i privat bøtte «assets» ----------
-- Sti: <project_id>/<ressurs-id>/<versjon-id>/<filnavn>. Medlemmer kan lese; redaktører kan laste opp;
-- ingen kan endre eller slette (en versjon er uforanderlig).
-- Bøtten er opprettet med lagringsverktøyet (privat, maks 50 MB, PNG/JPEG/WebP/GIF); her settes policyene.
create policy assets_read on storage.objects for select to authenticated
  using (bucket_id = 'assets' and private.is_project_member(private.try_uuid((storage.foldername(name))[1])));
create policy assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'assets' and private.has_project_role(private.try_uuid((storage.foldername(name))[1]), 'editor'));

insert into public.schema_version (version, description) values (4, '0004_library_notes: ressursbibliotek (ressurser, alternative navn, visuelle varianter, bildeversjoner med godkjenning), bøtte for bilder, notater i manus');