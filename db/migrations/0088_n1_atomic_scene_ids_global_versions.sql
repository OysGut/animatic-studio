-- =====================================================================================
-- From Pen to Glass – migrasjon 0088 (N1): to gjeldsposter, additiv oppå 0087.
--   1. B-097: apply_changes skriver change_log.scene_ids i samme transaksjon. Scene-ID-ene sendes som
--      toppnøkkelen sceneIds i p_changes (som blockRevisions); signaturen er uendret. Uten nøkkelen er
--      scene_ids null, som før. Ugyldige ID-er gir feil, og da lagres ingenting (heller ingen loggrad).
--   2. GP2–GP5: global versjon lagres atomisk: reservasjon → opplasting/kopi → commit. Serveren sjekker at
--      filene finnes rett før commit (ingen SQL mot storage); commit godtar bare reserverte nøkler.
--      Ved feil slettes filer som ingen versjon eller annen reservasjon bruker, og reservasjonen frigjøres.
--      Utløpte reservasjoner ryddes i orphan-cleanup-sweepen.
-- Erstatter (kopiert ordrett fra 0084, bare scene_ids lagt til):
--   * public.apply_changes(uuid, uuid, uuid, jsonb, jsonb, jsonb)
-- Nye: tabell global_version_reservations; public.global_reserve_version, global_commit_version,
--   global_reservation_safe_keys, global_cancel_reservation, stale_global_reservations,
--   release_stale_global_reservation. global_add_version (0078) er uendret.
-- Skrevet for gjennomgang; kjøres ikke i Cloud av Lovable. Ingen SQL mot storage.
-- =====================================================================================

-- ---------- 1. apply_changes med scene_ids ----------
create or replace function public.apply_changes(
  p_project uuid, p_actor uuid, p_command_id uuid, p_command jsonb, p_inverse jsonb, p_changes jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tables text[] := array['productions','rig_templates','scenes','rig_setups','scene_variants','script_blocks','scene_occurrences','production_segments','takes',
                           'assets','asset_variants','asset_versions','animation_rigs','animation_rig_versions','script_annotations',
                           'compositions','template_instances','credit_participants','credit_sequences','composition_layers','measure_sets','print_jobs','print_job_elements','animation_uses','audio_clips','dialogue_versions','clip_parts','time_links','generation_prompts',
                           'continuity_events','language_versions','translations','asset_relations','posters','style_profiles',
                           'story_profiles','story_profile_stages','story_facts','story_canvas_nodes','story_canvas_edges',
                           'lipsync_results','animation_patterns','dialogue_reviews','note_flags','quality_profiles','translation_lines','translation_line_links','style_harmonizations','style_preferred_references','mouth_sets','mouth_tracks'];
  v_t text;
  v_scene_ids uuid[];
  v_link_check uuid[] := '{}';
  v_harm_check uuid[] := '{}';
  v_pref_check uuid[] := '{}';
  v_lang_ids uuid[] := '{}';
  v_lang_changed uuid[] := '{}';
  v_link_scope uuid[] := '{}';
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
      script_language = case when v_row ? 'script_language' then v_row ->> 'script_language' else script_language end,
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

  -- 0064: line links to validate: new rows, and updated rows whose scene, language or line references change.
  -- Unchanged references (reject, undo of a stale link) are never blocked.
  v_link_check := array(
    select (r ->> 'id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'inserts' -> 'translation_line_links','[]'::jsonb)) r
    union all
    select (r ->> 'id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'updates' -> 'translation_line_links','[]'::jsonb)) r
      where not exists(select 1 from public.translation_line_links o where o.id=(r ->> 'id')::uuid and o.project_id=p_project
        and o.variant_id::text = r ->> 'variant_id' and o.language = r ->> 'language'
        and to_jsonb(o.source_block_ids) = r -> 'source_block_ids' and to_jsonb(o.target_translation_ids) = r -> 'target_translation_ids'));

  -- 0065: harmonizations and preferred references to validate: new rows, and updated rows whose references change.
  v_harm_check := array(
    select (r ->> 'id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'inserts' -> 'style_harmonizations','[]'::jsonb)) r
    union all
    select (r ->> 'id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'updates' -> 'style_harmonizations','[]'::jsonb)) r
      where not exists(select 1 from public.style_harmonizations o where o.id=(r ->> 'id')::uuid and o.project_id=p_project
        and o.version_id::text = r ->> 'version_id' and o.source_version_id::text = r ->> 'source_version_id'
        and o.style_profile_id::text is not distinct from r ->> 'style_profile_id' and o.reference_version_id::text is not distinct from r ->> 'reference_version_id'));
  v_pref_check := array(
    select (r ->> 'id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'inserts' -> 'style_preferred_references','[]'::jsonb)) r
    union all
    select (r ->> 'id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'updates' -> 'style_preferred_references','[]'::jsonb)) r
      where not exists(select 1 from public.style_preferred_references o where o.id=(r ->> 'id')::uuid and o.project_id=p_project
        and o.asset_id::text = r ->> 'asset_id' and o.style_profile_id::text = r ->> 'style_profile_id' and o.variant_id::text = r ->> 'variant_id'));

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
  foreach v_t in array array['mouth_tracks','mouth_sets','style_preferred_references','style_harmonizations','translation_line_links','translation_lines','quality_profiles','note_flags','dialogue_reviews','animation_patterns','lipsync_results','dialogue_versions','story_canvas_edges','story_canvas_nodes','story_facts','story_profile_stages','story_profiles','style_profiles','posters','asset_relations','translations','language_versions','continuity_events','generation_prompts','time_links','clip_parts','audio_clips','animation_uses','print_job_elements','print_jobs','measure_sets','composition_layers','credit_sequences','credit_participants','template_instances','compositions','script_annotations','animation_rig_versions','animation_rigs','asset_versions','asset_variants','assets',
                             'takes','production_segments','scene_occurrences','script_blocks','scene_variants','rig_setups','scenes','rig_templates','productions'] loop
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

  -- 0064: validate only line links inserted, or updated with changed references, in this call. Links that later point at
  -- removed or moved lines are reported as stale by the core and never block other commands.
  if exists(select 1 from public.translation_line_links l
    where l.project_id=p_project and not l.removed
      and l.id = any(v_link_check)
      and (
        exists(select 1 from unnest(l.source_block_ids) as s(block_id) where not exists(select 1 from public.script_blocks b where b.id=s.block_id and b.project_id=p_project and b.variant_id=l.variant_id and not b.removed))
        or exists(select 1 from unnest(l.target_translation_ids) as tt(translation_id) where not exists(select 1 from public.translations t join public.script_blocks b on b.id=t.block_id where t.id=tt.translation_id and t.project_id=p_project and b.project_id=p_project and b.variant_id=l.variant_id and t.language=l.language and not t.removed and not b.removed)
          and not exists(select 1 from public.translation_lines u where u.id=tt.translation_id and u.project_id=p_project and u.variant_id=l.variant_id and u.language=l.language and not u.removed))
        or cardinality(l.source_block_ids) <> (select count(distinct x) from unnest(l.source_block_ids) x)
        or cardinality(l.target_translation_ids) <> (select count(distinct x) from unnest(l.target_translation_ids) x)
      )) then raise exception 'Invalid line link scope' using errcode='22023'; end if;
  -- 0065: validate only harmonizations and preferred references inserted, or updated with changed references, in this call.
  if exists(select 1 from public.style_harmonizations h
    where h.project_id=p_project and not h.removed and h.id = any(v_harm_check)
      and (not exists(select 1 from public.asset_versions v where v.id=h.version_id and v.project_id=p_project and v.mime_type like 'image/%')
        or not exists(select 1 from public.asset_versions v where v.id=h.source_version_id and v.project_id=p_project and v.mime_type like 'image/%')
        or (h.style_profile_id is not null and not exists(select 1 from public.style_profiles p where p.id=h.style_profile_id and p.project_id=p_project and not p.removed))
        or (h.reference_version_id is not null and not exists(select 1 from public.asset_versions v where v.id=h.reference_version_id and v.project_id=p_project and v.mime_type like 'image/%')))) then
    raise exception 'Invalid harmonization' using errcode='22023'; end if;
  if exists(select 1 from public.style_preferred_references r
    where r.project_id=p_project and not r.removed and r.id = any(v_pref_check)
      and (not exists(select 1 from public.assets a where a.id=r.asset_id and a.project_id=p_project and not a.removed)
        or not exists(select 1 from public.style_profiles p where p.id=r.style_profile_id and p.project_id=p_project and not p.removed)
        or not exists(select 1 from public.asset_variants va where va.id=r.variant_id and va.project_id=p_project and va.asset_id=r.asset_id))) then
    raise exception 'Invalid preferred reference' using errcode='22023'; end if;
  -- 0066 (ML3) / 0067: every translation, line and link written in this call that has a language version must stay in
  -- the same project and use the version's target language. 0067: the link check covers every link changed in the
  -- call and every link that points at a translation or line changed in the call, also when the payload omits
  -- language_version_id (e.g. new targets only, or a target moved to another version). Old rows without a version
  -- are derived from project + language and are never blocked.
  v_lang_changed := array(
    select (r ->> 'id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'inserts' -> 'translations','[]'::jsonb)
      || coalesce(p_changes -> 'updates' -> 'translations','[]'::jsonb)
      || coalesce(p_changes -> 'inserts' -> 'translation_lines','[]'::jsonb)
      || coalesce(p_changes -> 'updates' -> 'translation_lines','[]'::jsonb)
      || coalesce(p_changes -> 'inserts' -> 'translation_line_links','[]'::jsonb)
      || coalesce(p_changes -> 'updates' -> 'translation_line_links','[]'::jsonb)) r
      where r ? 'id');
  v_lang_ids := v_lang_changed;
  if exists(select 1 from (
      select language_version_id v, language l from public.translations where project_id=p_project and id = any(v_lang_ids) and language_version_id is not null
      union all select language_version_id, language from public.translation_lines where project_id=p_project and id = any(v_lang_ids) and language_version_id is not null
      union all select language_version_id, language from public.translation_line_links where project_id=p_project and id = any(v_lang_ids) and language_version_id is not null
    ) x where not exists(select 1 from public.language_versions lv where lv.id=x.v and lv.project_id=p_project and lv.language=x.l)) then
    raise exception 'Invalid language version scope' using errcode='22023'; end if;
  v_link_scope := array(select l.id from public.translation_line_links l
    where l.project_id=p_project and not l.removed and (l.id = any(v_lang_changed) or l.target_translation_ids && v_lang_changed));
  if exists(select 1 from public.translation_line_links l
    where l.project_id=p_project and not l.removed and l.id = any(v_link_scope)
      and exists(select 1 from unnest(l.target_translation_ids) as tt(target_id)
        where exists(select 1 from public.translations t where t.id=tt.target_id and t.language_version_id is not null and t.language_version_id <> l.language_version_id)
           or exists(select 1 from public.translation_lines u where u.id=tt.target_id and u.language_version_id is not null and u.language_version_id <> l.language_version_id))) then
    raise exception 'Invalid line link scope' using errcode='22023'; end if;
  -- REQ-0144: nøyaktig én aktiv foretrukket referanse per (ressurs, stilprofil)
  if exists(select r.asset_id, r.style_profile_id from public.style_preferred_references r
    where r.project_id=p_project and not r.removed group by r.asset_id, r.style_profile_id having count(*) > 1) then
    raise exception 'More than one preferred reference' using errcode='22023'; end if;
  -- PTG4: validate changed mouth rows after grouped insert/update; never mutate source receipts.
  if exists(select 1 from public.mouth_sets m where m.project_id=p_project
    and m.id in (select (r->>'id')::uuid from jsonb_array_elements(coalesce(p_changes->'inserts'->'mouth_sets','[]'::jsonb)||coalesce(p_changes->'updates'->'mouth_sets','[]'::jsonb)) r)
    and (not exists(select 1 from public.assets a where a.id=m.character_id and a.project_id=p_project)
      or exists(select 1 from jsonb_each_text(m.variants) v where v.value is not null and not exists(select 1 from public.asset_variants av where av.id::text=v.value and av.project_id=p_project and av.asset_id=m.character_id)))) then
    raise exception 'Invalid mouth set scope' using errcode='22023'; end if;
  if exists(select 1 from public.mouth_tracks m where m.project_id=p_project
    and m.id in (select (r->>'id')::uuid from jsonb_array_elements(coalesce(p_changes->'inserts'->'mouth_tracks','[]'::jsonb)||coalesce(p_changes->'updates'->'mouth_tracks','[]'::jsonb)) r)
    and (not exists(select 1 from public.mouth_sets ms where ms.id=m.set_id and ms.project_id=p_project and ms.character_id=m.character_id)
      or not exists(select 1 from public.scene_occurrences o where o.id=m.occurrence_id and o.project_id=p_project)
      or not exists(select 1 from public.audio_clips c where c.id=m.clip_id and c.project_id=p_project and c.occurrence_id=m.occurrence_id and c.block_id=m.block_id)
      or not exists(select 1 from public.script_blocks b where b.id=m.block_id and b.project_id=p_project))) then
    raise exception 'Invalid mouth track scope' using errcode='22023'; end if;
  -- 5) Kommandologg (ADR-0005)
  if exists(select 1 from public.projects p where p.id=p_project and p.active_quality_profile_id is not null
    and not exists(select 1 from public.quality_profiles q where q.id=p.active_quality_profile_id and q.project_id=p_project and not q.removed)) then
    raise exception 'Invalid active quality profile' using errcode='22023';
  end if;

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

-- ---------- 2. Reservasjoner for globale versjoner ----------
-- Serverarbeidslogg, ikke prosjektdata. Ingen direkte klienttilgang.
create table public.global_version_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  global_asset_id uuid not null references public.global_assets (id) on delete restrict,
  variant_id uuid not null references public.global_asset_variants (id) on delete restrict,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  storage_keys text[] not null check (cardinality(storage_keys) between 1 and 5),
  committed_version_id uuid references public.global_asset_versions (id) on delete restrict
);
grant all on public.global_version_reservations to service_role;
alter table public.global_version_reservations enable row level security;
revoke all on public.global_version_reservations from public, anon, authenticated;
create index global_version_reservations_open_idx on public.global_version_reservations (workspace_id, expires_at)
  where committed_version_id is null;

-- Reserver: redaktør i gruppen, bare gyldige gruppestier, og ingen annen åpen reservasjon på samme nøkkel.
create function public.global_reserve_version(p_variant uuid, p_storage_keys text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_var public.global_asset_variants; v_key text; v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select * into v_var from public.global_asset_variants where id = p_variant;
  if not found then raise exception 'Varianten finnes ikke' using errcode = '22023'; end if;
  if not private.has_workspace_role(v_var.workspace_id, 'editor') then
    raise exception 'Bare eier og redaktør kan publisere nye versjoner' using errcode = '42501';
  end if;
  if p_storage_keys is null or cardinality(p_storage_keys) not between 1 and 5 or p_storage_keys[1] is null then
    raise exception 'Ugyldig lagringssti' using errcode = '22023';
  end if;
  foreach v_key in array p_storage_keys loop
    if v_key is null or v_key !~ ('^global/' || v_var.workspace_id::text || '/' || v_var.global_asset_id::text
                                  || '/[0-9a-f]{64}\.[a-z0-9]{1,8}$') then
      raise exception 'Ugyldig lagringssti' using errcode = '22023';
    end if;
  end loop;
  perform pg_advisory_xact_lock(hashtext('global_version_reservations:' || v_var.workspace_id::text));
  if exists (select 1 from public.global_version_reservations r
             where r.committed_version_id is null and r.expires_at > now() and r.storage_keys && p_storage_keys) then
    raise exception 'Filen lagres allerede' using errcode = 'P0409';
  end if;
  insert into public.global_version_reservations (workspace_id, global_asset_id, variant_id, created_by, storage_keys)
    values (v_var.workspace_id, v_var.global_asset_id, p_variant, (select auth.uid()), p_storage_keys)
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.global_reserve_version(uuid, text[]) from public, anon;
grant execute on function public.global_reserve_version(uuid, text[]) to authenticated;

-- Commit: bare egen, åpen og ikke utløpt reservasjon. Hovedfilen er første reserverte nøkkel, og de
-- avledede filene må være blant de reserverte. Idempotent: samme reservasjon gir samme versjon.
create function public.global_commit_version(
  p_reservation uuid, p_mime text, p_width integer, p_height integer, p_bytes bigint,
  p_sha256 text, p_duration_ms integer, p_note text, p_template_spec jsonb default null,
  p_font_spec jsonb default null, p_derived_files jsonb default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v public.global_version_reservations; v_id uuid; v_path text;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select * into v from public.global_version_reservations where id = p_reservation for update;
  if not found or v.created_by <> (select auth.uid()) then
    raise exception 'Reservasjonen finnes ikke' using errcode = '42501';
  end if;
  if v.committed_version_id is not null then return v.committed_version_id; end if;
  if v.expires_at <= now() then raise exception 'Reservasjonen er utløpt' using errcode = '22023'; end if;
  if p_derived_files is not null then
    if jsonb_typeof(p_derived_files) <> 'object' then raise exception 'Ugyldig lagringssti' using errcode = '22023'; end if;
    for v_path in select e.value ->> 'path' from jsonb_each(p_derived_files) e loop
      if v_path is null or not (v_path = any (v.storage_keys)) then
        raise exception 'Ugyldig lagringssti' using errcode = '22023';
      end if;
    end loop;
  end if;
  v_id := public.global_add_version(v.variant_id, v.storage_keys[1], p_mime, p_width, p_height, p_bytes, p_sha256,
    p_duration_ms, p_note, p_template_spec, p_font_spec, p_derived_files);
  update public.global_version_reservations set committed_version_id = v_id where id = v.id;
  return v_id;
end $$;
revoke all on function public.global_commit_version(uuid, text, integer, integer, bigint, text, integer, text, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.global_commit_version(uuid, text, integer, integer, bigint, text, integer, text, jsonb, jsonb, jsonb)
  to authenticated;

-- Nøklene i en åpen reservasjon som trygt kan slettes: ingen versjon og ingen annen åpen reservasjon bruker dem.
-- Tom liste når reservasjonen er sluttført (filen tilhører da versjonen). Bare serveren.
create function public.global_reservation_safe_keys(p_reservation uuid, p_actor uuid)
returns table (committed boolean, storage_key text)
language sql stable security definer set search_path = '' as $$
  select r.committed_version_id is not null, k
  from public.global_version_reservations r
  left join lateral unnest(case when r.committed_version_id is null then r.storage_keys else '{}'::text[] end) k on true
  where r.id = p_reservation and r.created_by = p_actor
    and (k is null or (
      not exists (select 1 from public.global_asset_versions gv
                  where gv.storage_key = k or coalesce(gv.derived_files::text, '') like '%"' || k || '"%')
      and not exists (select 1 from public.global_version_reservations o
                      where o.id <> r.id and o.committed_version_id is null and o.expires_at > now()
                        and k = any (o.storage_keys))))
$$;
revoke all on function public.global_reservation_safe_keys(uuid, uuid) from public, anon, authenticated;
grant execute on function public.global_reservation_safe_keys(uuid, uuid) to service_role;

-- Frigjør egen åpen reservasjon (etter at filene er slettet). Sluttførte reservasjoner røres ikke.
create function public.global_cancel_reservation(p_reservation uuid, p_actor uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.global_version_reservations
    where id = p_reservation and created_by = p_actor and committed_version_id is null;
  return found;
end $$;
revoke all on function public.global_cancel_reservation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.global_cancel_reservation(uuid, uuid) to service_role;

-- Sweep (orphan-cleanup): åpne reservasjoner i gruppen som utløp for over 1 time siden, med nøklene
-- som trygt kan slettes. Bare serveren.
create function public.stale_global_reservations(p_workspace uuid)
returns table (id uuid, storage_keys text[])
language sql stable security definer set search_path = '' as $$
  select r.id, coalesce((
    select array_agg(k) from unnest(r.storage_keys) k
    where not exists (select 1 from public.global_asset_versions gv
                      where gv.storage_key = k or coalesce(gv.derived_files::text, '') like '%"' || k || '"%')
      and not exists (select 1 from public.global_version_reservations o
                      where o.id <> r.id and o.committed_version_id is null and o.expires_at > now()
                        and k = any (o.storage_keys))), '{}')
  from public.global_version_reservations r
  where r.workspace_id = p_workspace and r.committed_version_id is null and r.expires_at + interval '1 hour' < now()
  order by r.created_at limit 200
$$;
revoke all on function public.stale_global_reservations(uuid) from public, anon, authenticated;
grant execute on function public.stale_global_reservations(uuid) to service_role;

-- Frigjør en utløpt åpen reservasjon etter at filene er slettet. Sluttførte reservasjoner eldre enn ett døgn
-- i samme gruppe fjernes samtidig (versjonen eier filen; raden trengs ikke lenger).
create function public.release_stale_global_reservation(p_reservation uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  delete from public.global_version_reservations r
    where r.id = p_reservation and r.committed_version_id is null and r.expires_at + interval '1 hour' < now()
    returning r.workspace_id into v_ws;
  if v_ws is null then return false; end if;
  delete from public.global_version_reservations r
    where r.workspace_id = v_ws and r.committed_version_id is not null and r.created_at < now() - interval '1 day';
  return true;
end $$;
revoke all on function public.release_stale_global_reservation(uuid) from public, anon, authenticated;
grant execute on function public.release_stale_global_reservation(uuid) to service_role;

insert into public.schema_version (version, description)
  values (88, '0088_n1_atomic_scene_ids_global_versions: scene_ids i apply_changes, atomiske globale versjoner');
