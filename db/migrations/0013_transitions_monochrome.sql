-- =====================================================================================
-- Animatic Studio – migrasjon 0013: montering del 5 (DEC-0051).
-- 1. Overganger: flere typer (via hvitt, tørk, skyv, iris), overlapp (scenene skyves inn i hverandre og
--    filmen blir kortere), og om scenen har en egen overgang eller følger prosjektets standard
--    (REQ-0575–0577). Eksisterende scener med kutt følger standarden; scener med en overgang beholder den.
-- 2. Prosjektets standardovergang (projects.default_transition_*), endres via apply_changes.
-- 3. Svart-hvitt per scene (scene_occurrences.monochrome, REQ-0574).
-- 4. Tidskobling til en hendelse i 2D-scenen: time_links.layer_id (laget hendelsen gjelder, REQ-0095/0096).
-- 5. Sceneeditor del 3 (DEC-0052): grupper av lag (lagtypen «group», som ikke viser noe bilde selv),
--    bildeskifter i et lag (image_swaps), bevegelsesbane med tempo (motion_path) og gruppens ankerpunkt.
-- 6. apply_changes: som 0012, men prosjektraden kan også få ny standardovergang.
-- Ingen SQL mot lagringen (storage). Kjøres ÉN gang i Lovable Cloud etter 0012. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.scene_occurrences drop constraint if exists scene_occurrences_transition_kind_check;
alter table public.scene_occurrences add constraint scene_occurrences_transition_kind_check
  check (transition_kind in ('cut', 'dissolve', 'dip', 'dip_white', 'wipe', 'push', 'iris'));
alter table public.scene_occurrences add column if not exists transition_custom boolean not null default false;
alter table public.scene_occurrences add column if not exists transition_overlap boolean not null default false;
alter table public.scene_occurrences add column if not exists monochrome boolean not null default false;
-- Før 0013 var kutt standard: scener med en annen overgang har et eget valg
update public.scene_occurrences set transition_custom = true where transition_kind <> 'cut';

alter table public.projects add column if not exists default_transition_kind text not null default 'cut'
  check (default_transition_kind in ('cut', 'dissolve', 'dip', 'dip_white', 'wipe', 'push', 'iris'));
alter table public.projects add column if not exists default_transition_frames integer not null default 0
  check (default_transition_frames between 0 and 600);
alter table public.projects add column if not exists default_transition_overlap boolean not null default false;

alter table public.time_links add column if not exists layer_id uuid references public.composition_layers (id);
create index if not exists time_links_layer_idx on public.time_links (layer_id);

-- Lag: gruppe som lagtype, bildeskifter, bevegelsesbane og ankerpunkt (DEC-0052)
alter table public.composition_layers drop constraint if exists composition_layers_kind_check;
alter table public.composition_layers add constraint composition_layers_kind_check
  check (kind in ('background','midground','foreground','character','object','effect','other','group'));
do $$
declare c text;
begin
  -- «Et lag viser et bilde eller en fargeflate» (navnløs i 0007): en gruppe viser ingenting selv
  for c in
    select conname from pg_constraint
    where conrelid = 'public.composition_layers'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%asset_id IS NOT NULL%fill IS NOT NULL%'
  loop
    execute format('alter table public.composition_layers drop constraint %I', c);
  end loop;
end $$;
alter table public.composition_layers add constraint composition_layers_shows_something
  check (kind = 'group' or asset_id is not null or fill is not null);
alter table public.composition_layers add column if not exists image_swaps jsonb not null default '[]'::jsonb
  check (jsonb_typeof(image_swaps) = 'array' and pg_column_size(image_swaps) <= 131072);
alter table public.composition_layers add column if not exists motion_path jsonb
  check (motion_path is null or (jsonb_typeof(motion_path) = 'object' and pg_column_size(motion_path) <= 262144));
alter table public.composition_layers add column if not exists anchor jsonb
  check (anchor is null or jsonb_typeof(anchor) = 'object');

-- ---------- apply_changes: prosjektraden kan få ny standardovergang ----------
create or replace function public.apply_changes(
  p_project uuid, p_actor uuid, p_command_id uuid, p_command jsonb, p_inverse jsonb, p_changes jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tables text[] := array['productions','scenes','scene_variants','script_blocks','scene_occurrences','production_segments','takes',
                           'assets','asset_variants','asset_versions','script_annotations',
                           'compositions','composition_layers','audio_clips','clip_parts','time_links'];
  v_t text;
  v_rows jsonb;
  v_row jsonb;
  v_cols text[];
  v_set text;
  v_count integer;
  v_affected uuid[] := '{}';
begin
  -- Nøkkellås på prosjektraden: sletting av prosjektet (FOR UPDATE) venter til endringen er lagret, og en
  -- endring som kommer etter slettingen, ser at prosjektet er slettet (DEC-0046). FOR KEY SHARE hindrer
  -- ikke at prosjektraden selv endres i samme eller andre endringer (format og bildefrekvens).
  perform 1 from public.projects where id = p_project and deleted_at is null for key share;
  if not found then
    raise exception 'Prosjektet er slettet' using errcode = '42501';
  end if;
  if private.member_role_rank(p_project, p_actor) < private.role_rank('editor') then
    raise exception 'Brukeren har ikke skriverett i prosjektet' using errcode = '42501';
  end if;
  -- Endringer for tabeller funksjonen ikke kjenner, avvises (ellers ville de gått tapt i stillhet)
  if exists (
    select 1 from (
      select jsonb_object_keys(coalesce(p_changes -> 'inserts', '{}'::jsonb)) k
      union all select jsonb_object_keys(coalesce(p_changes -> 'deletes', '{}'::jsonb))
    ) x where not (x.k = any (v_tables))
  ) or exists (
    -- Prosjektraden kan bare endres (format, bildefrekvens og standardovergang), aldri legges til eller slettes, aldri legges til eller slettes
    select 1 from jsonb_object_keys(coalesce(p_changes -> 'updates', '{}'::jsonb)) k
    where not (k = any (v_tables || array['projects']))
  ) then
    raise exception 'Endringen gjelder en ukjent tabell' using errcode = '22023';
  end if;

  -- 0) Prosjektraden (bare dette prosjektet, med revisjonskontroll)
  for v_row in select * from jsonb_array_elements(coalesce(p_changes -> 'updates' -> 'projects', '[]'::jsonb)) loop
    if (v_row ->> 'id')::uuid is distinct from p_project then
      raise exception 'Rad tilhører et annet prosjekt' using errcode = '42501';
    end if;
    if (v_row ->> 'revision')::int <> (v_row ->> 'expected_revision')::int + 1 then
      raise exception 'Ugyldig revisjon for %', v_row ->> 'id' using errcode = '22023';
    end if;
    update public.projects set
      name = coalesce(v_row ->> 'name', name),
      fps_num = coalesce((v_row ->> 'fps_num')::int, fps_num),
      fps_den = coalesce((v_row ->> 'fps_den')::int, fps_den),
      frame_width = coalesce((v_row ->> 'frame_width')::int, frame_width),
      frame_height = coalesce((v_row ->> 'frame_height')::int, frame_height),
      default_transition_kind = coalesce(v_row ->> 'default_transition_kind', default_transition_kind),
      default_transition_frames = coalesce((v_row ->> 'default_transition_frames')::int, default_transition_frames),
      default_transition_overlap = coalesce((v_row ->> 'default_transition_overlap')::boolean, default_transition_overlap),
      revision = (v_row ->> 'revision')::int
    where id = p_project and revision = (v_row ->> 'expected_revision')::int;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      raise exception 'Revisjonskonflikt' using errcode = 'P0409', detail = v_row ->> 'id';
    end if;
    v_affected := v_affected || p_project;
  end loop;

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
  foreach v_t in array array['time_links','clip_parts','audio_clips','composition_layers','compositions','script_annotations','asset_versions','asset_variants','assets',
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

insert into public.schema_version (version, description)
  values (13, '0013_transitions_monochrome: flere overgangstyper med overlapp og prosjektstandard, svart-hvitt per scene, tidskobling til hendelser i 2D-scenen, grupper, bildeskifter og bevegelsesbaner for lag');
