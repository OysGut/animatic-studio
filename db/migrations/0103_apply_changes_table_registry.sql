-- =====================================================================================
-- From Pen to Glass – migrasjon 0103: G-7-gjeld – tabellrekkefølgen i apply_changes flyttes til et register.
-- 1. Ny tabell private.apply_change_tables (table_name, insert_order, delete_order). Innsettings- og
--    oppdateringsrekkefølgen følger insert_order (foreldre før barn); sletting følger delete_order
--    (barn før foreldre). Verdiene er nøyaktig rekkefølgen fra de hardkodede listene i 0102.
-- 2. apply_changes kopiert ordrett fra 0102; bare de to hardkodede listene er byttet mot oppslag i
--    registeret. Signatur, rettigheter, feilkoder og meldinger er uendret.
-- Nye prosjekttabeller registreres med én rad her (og en validator i apply_change_validators);
-- kjernen endres ikke. Kjøres ÉN gang i Lovable Cloud etter 0102. Endres aldri etter kjøring.
-- =====================================================================================

create table private.apply_change_tables (
  table_name text primary key check (table_name ~ '^[a-z_][a-z0-9_]*$' and char_length(table_name) <= 63),
  insert_order integer not null unique,
  delete_order integer not null unique
);
revoke all on private.apply_change_tables from public, anon, authenticated;
grant select, insert on private.apply_change_tables to service_role;

insert into private.apply_change_tables (table_name, insert_order, delete_order) values
  ('productions', 1, 55),
  ('rig_templates', 2, 54),
  ('scenes', 3, 53),
  ('rig_setups', 4, 52),
  ('scene_variants', 5, 51),
  ('script_blocks', 6, 50),
  ('scene_occurrences', 7, 49),
  ('production_segments', 8, 48),
  ('takes', 9, 47),
  ('assets', 10, 46),
  ('asset_variants', 11, 45),
  ('asset_versions', 12, 44),
  ('animation_rigs', 13, 43),
  ('animation_rig_versions', 14, 42),
  ('script_annotations', 15, 41),
  ('compositions', 16, 40),
  ('template_instances', 17, 39),
  ('credit_participants', 18, 38),
  ('credit_sequences', 19, 37),
  ('composition_layers', 20, 36),
  ('measure_sets', 21, 35),
  ('print_jobs', 22, 34),
  ('print_job_elements', 23, 33),
  ('animation_uses', 24, 32),
  ('audio_clips', 25, 31),
  ('dialogue_versions', 26, 16),
  ('clip_parts', 27, 30),
  ('time_links', 28, 29),
  ('generation_prompts', 29, 28),
  ('continuity_events', 30, 27),
  ('language_versions', 31, 26),
  ('translations', 32, 25),
  ('asset_relations', 33, 24),
  ('posters', 34, 23),
  ('style_profiles', 35, 22),
  ('story_profiles', 36, 21),
  ('story_profile_stages', 37, 20),
  ('story_facts', 38, 19),
  ('story_canvas_nodes', 39, 18),
  ('story_canvas_edges', 40, 17),
  ('lipsync_results', 41, 15),
  ('animation_patterns', 42, 14),
  ('dialogue_reviews', 43, 13),
  ('note_flags', 44, 12),
  ('quality_profiles', 45, 11),
  ('translation_lines', 46, 10),
  ('translation_line_links', 47, 9),
  ('style_harmonizations', 48, 8),
  ('style_preferred_references', 49, 7),
  ('mouth_sets', 50, 6),
  ('mouth_tracks', 51, 5),
  ('storyboard_panel_blocks', 52, 2),
  ('production_statuses', 53, 4),
  ('production_status_events', 54, 3),
  ('storyboard_panel_snapshots', 55, 1);

create or replace function public.apply_changes(
  p_project uuid, p_actor uuid, p_command_id uuid, p_command jsonb, p_inverse jsonb, p_changes jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tables text[] := array(select t.table_name from private.apply_change_tables t order by t.insert_order);
  v_delete_tables text[] := array(select t.table_name from private.apply_change_tables t order by t.delete_order);
  v_t text;
  v_scene_ids uuid[];
  v_rows jsonb;
  v_row jsonb;
  v_cols text[];
  v_set text;
  v_count integer;
  v_affected uuid[] := '{}';
  v_val record;
  v_pre jsonb := '{}'::jsonb;
  v_ids uuid[];
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

  -- 0099 (G-7): registrerte valideringer forberedes mot tilstanden før endringen skrives.
  -- Kjernen kjenner ikke reglene; nye tabeller registreres i private.apply_change_validators.
  for v_val in
    select v.preparer, v.validator from private.apply_change_validators v
    where v.preparer is not null
      and (v.table_name is null or (p_changes -> 'inserts' ? v.table_name) or (p_changes -> 'updates' ? v.table_name) or (p_changes -> 'deletes' ? v.table_name))
    group by v.preparer, v.validator
    order by min(v.sort_order), v.validator::text
  loop
    execute format('select %s($1, $2)', v_val.preparer) using p_project, p_changes into v_ids;
    v_pre := v_pre || jsonb_build_object(v_val.validator::text, coalesce(to_jsonb(v_ids), '[]'::jsonb));
  end loop;

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
      code = case when v_row ? 'code' then v_row ->> 'code' else code end,
      capture_mode = coalesce(v_row ->> 'capture_mode', capture_mode),
      capture_fps_num = coalesce((v_row ->> 'capture_fps_num')::int, capture_fps_num),
      capture_fps_den = coalesce((v_row ->> 'capture_fps_den')::int, capture_fps_den),
      fps_num = coalesce((v_row ->> 'fps_num')::int, fps_num),
      fps_den = coalesce((v_row ->> 'fps_den')::int, fps_den),
      frame_width = coalesce((v_row ->> 'frame_width')::int, frame_width),
      frame_height = coalesce((v_row ->> 'frame_height')::int, frame_height),
      default_transition_kind = coalesce(v_row ->> 'default_transition_kind', default_transition_kind),
      default_transition_frames = coalesce((v_row ->> 'default_transition_frames')::int, default_transition_frames),
      default_transition_overlap = coalesce((v_row ->> 'default_transition_overlap')::boolean, default_transition_overlap),
      -- AI-budsjett (DEC-0053): null betyr «ingen egen grense», så verdien settes når nøkkelen er med
      ai_month_limit = case when v_row ? 'ai_month_limit' then (v_row ->> 'ai_month_limit')::int else ai_month_limit end,
      ai_price_per_image = case when v_row ? 'ai_price_per_image' then (v_row ->> 'ai_price_per_image')::numeric else ai_price_per_image end,
      -- Antakelsene for varighetsestimatet (KI-28, migrasjon 0028): null = standardverdiene
      duration_assumptions = case when v_row ? 'duration_assumptions'
        then nullif(v_row -> 'duration_assumptions', 'null'::jsonb) else duration_assumptions end,
      source_language = coalesce(v_row ->> 'source_language', source_language),
      -- Aktiv kvalitetsprofil (M8, 0063): null = ingen aktiv profil
      active_quality_profile_id = case when v_row ? 'active_quality_profile_id' then nullif(v_row ->> 'active_quality_profile_id', '')::uuid else active_quality_profile_id end,
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

  update public.animation_rigs set current_version_id = null where project_id = p_project
    and id in (select (r ->> 'id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'deletes' -> 'animation_rigs', '[]'::jsonb)) r);

  -- 3) Fjernede rader (bare ved angre av opprettelse), motsatt rekkefølge
  foreach v_t in array v_delete_tables loop
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

  -- 0099 (G-7): registrerte valideringer kjøres i register-rekkefølge (sort_order tilsvarer den
  -- gamle rekkefølgen i funksjonskroppen). p_ids er radene prepare_* fant før skriving.
  for v_val in
    select v.validator from private.apply_change_validators v
    where v.table_name is null
       or (p_changes -> 'inserts' ? v.table_name) or (p_changes -> 'updates' ? v.table_name) or (p_changes -> 'deletes' ? v.table_name)
    group by v.validator
    order by min(v.sort_order), v.validator::text
  loop
    execute format('select %s($1, $2, $3)', v_val.validator)
      using p_project, p_changes,
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(v_pre -> v_val.validator::text) x), '{}'::uuid[]);
  end loop;

  -- 0088 (B-097): scenene endringen gjelder, skrevet i samme transaksjon som kommandoen.
  if p_changes ? 'sceneIds' then
    if jsonb_typeof(p_changes -> 'sceneIds') <> 'array' or jsonb_array_length(p_changes -> 'sceneIds') > 1000 then
      raise exception 'Invalid sceneIds' using errcode = '22023';
    end if;
    select array_agg(distinct x::uuid order by x::uuid) into v_scene_ids
      from jsonb_array_elements_text(p_changes -> 'sceneIds') x;
  end if;

  insert into public.change_log (id, project_id, actor, command_type, command, inverse, affected_ids, scene_ids)
    values (p_command_id, p_project, p_actor, p_command ->> 'type', p_command, p_inverse, v_affected, v_scene_ids);

  return jsonb_build_object('ok', true, 'changeId', p_command_id, 'affected', to_jsonb(v_affected));
end $$;
revoke all on function public.apply_changes(uuid, uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_changes(uuid, uuid, uuid, jsonb, jsonb, jsonb) to service_role;

insert into public.schema_version (version, description) values
  (103, '0103_apply_changes_table_registry: tabellrekkefølgen i apply_changes ligger i private.apply_change_tables');
