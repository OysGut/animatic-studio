-- =====================================================================================
-- From Pen to Glass – migrasjon 0090: G-1, språknøytral grunnmur.
-- Ny fil; 0089 og eldre er låst. Claude gjennomgår og kjører i Cloud.
-- Enkel konvertering: source_language fra script_language, ellers primary_language.
-- Ingen sletting. Gamle prosjektkolonner avvikles etter kopiering.
-- Erstatter apply_changes (0088): prosjektskriving bruker source_language.
-- Erstatter create_project (0067): eksplisitt kilde og nøytrale standardnavn.
-- Nye private språk-/integritetstriggere: se definisjonene nedenfor.
-- delete_project og purge-funksjonene bruker ID-er, ikke språk; beholdes uendret.
-- =====================================================================================

create or replace function private.valid_language_tag(p_tag text) returns boolean
language sql immutable set search_path = '' as $$
  select p_tag is not null and length(p_tag) between 2 and 100
    and p_tag ~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?(-([a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*$';
$$;
revoke all on function private.valid_language_tag(text) from public;
grant execute on function private.valid_language_tag(text) to authenticated, service_role;

alter table public.projects add column source_language text;
update public.projects set source_language = coalesce(nullif(script_language, ''), primary_language);
alter table public.projects alter column source_language set not null;
alter table public.projects add constraint projects_source_language_check check (private.valid_language_tag(source_language));
-- Converting legacy defaults does not translate the stored source text.
alter table public.script_blocks drop constraint script_blocks_language_check;
alter table public.script_blocks alter column language drop default;
update public.script_blocks b set language = p.source_language from public.projects p where p.id = b.project_id;
alter table public.script_blocks add constraint script_blocks_language_check check (private.valid_language_tag(language));

alter table public.translations drop constraint translations_language_check;
alter table public.translations add constraint translations_language_check check (private.valid_language_tag(language));
alter table public.language_versions drop constraint language_versions_language_check;
alter table public.language_versions drop constraint language_versions_source_language_check;
alter table public.language_versions alter column source_language drop default;
update public.language_versions v set source_language = p.source_language from public.projects p where p.id = v.project_id;
alter table public.language_versions add constraint language_versions_language_check check (private.valid_language_tag(language));
alter table public.language_versions add constraint language_versions_source_language_check check (private.valid_language_tag(source_language));
alter table public.translation_lines drop constraint translation_lines_language_check;
alter table public.translation_lines add constraint translation_lines_language_check check (private.valid_language_tag(language));
alter table public.translation_line_links drop constraint translation_line_links_language_check;
alter table public.translation_line_links add constraint translation_line_links_language_check check (private.valid_language_tag(language));

do $$
declare v_conflict record;
begin
  select t.project_id, t.id into v_conflict from (
    select project_id, id, language from public.language_versions
    union all select project_id, id, language from public.translations
    union all select project_id, id, language from public.translation_lines
    union all select project_id, id, language from public.translation_line_links
  ) t join public.projects p on p.id=t.project_id where lower(t.language)=lower(p.source_language) limit 1;
  if found then raise exception 'G-1 conversion conflict: project %, target row %', v_conflict.project_id, v_conflict.id; end if;
end $$;

create or replace function private.guard_project_language_child() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_source text;
begin
  -- Same project lock as apply_changes serializes source changes with child writes.
  select source_language into v_source from public.projects where id = new.project_id for update;
  if tg_table_name = 'script_blocks' then new.language := v_source; end if;
  if not private.valid_language_tag(new.language) then raise exception 'Invalid language tag' using errcode = '23514'; end if;
  if v_source is null then raise exception 'Unknown project' using errcode = '23503'; end if;
  if tg_table_name = 'script_blocks' then
    new.language := v_source;
  else
    if lower(new.language) = lower(v_source) then
      raise exception 'Target language equals source language' using errcode = '23514';
    end if;
    if tg_table_name = 'language_versions' then new.source_language := v_source; end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_project_language_child() from public;
create trigger g1_blocks_language before insert or update on public.script_blocks for each row execute function private.guard_project_language_child();
create trigger g1_translations_language before insert or update on public.translations for each row execute function private.guard_project_language_child();
create trigger g1_versions_language before insert or update on public.language_versions for each row execute function private.guard_project_language_child();
create trigger g1_lines_language before insert or update on public.translation_lines for each row execute function private.guard_project_language_child();
create trigger g1_links_language before insert or update on public.translation_line_links for each row execute function private.guard_project_language_child();

create or replace function private.guard_source_language_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.source_language is distinct from old.source_language then
    if exists(select 1 from public.language_versions where project_id = new.id and lower(language) = lower(new.source_language))
      or exists(select 1 from public.translations where project_id = new.id and lower(language) = lower(new.source_language))
      or exists(select 1 from public.translation_lines where project_id = new.id and lower(language) = lower(new.source_language))
      or exists(select 1 from public.translation_line_links where project_id = new.id and lower(language) = lower(new.source_language)) then
      raise exception 'Existing target language conflicts with new source' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_source_language_change() from public;
create trigger g1_source_change before update of source_language on public.projects for each row execute function private.guard_source_language_change();

create or replace function private.propagate_source_language() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.source_language is distinct from old.source_language then
    update public.script_blocks set language = new.source_language where project_id = new.id;
    update public.language_versions set source_language = new.source_language where project_id = new.id;
  end if;
  return new;
end $$;
revoke all on function private.propagate_source_language() from public;
create trigger g1_source_propagate after update of source_language on public.projects for each row execute function private.propagate_source_language();

-- Deferred cross-row integrity allows grouped writes but validates both parent and child changes.
create or replace function private.guard_language_version_scope() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from (
      select project_id, language, language_version_id from public.translations
      union all select project_id, language, language_version_id from public.translation_lines
      union all select project_id, language, language_version_id from public.translation_line_links
    ) c left join public.language_versions v on v.id=c.language_version_id
    where c.language_version_id is not null and (v.id is null or v.project_id<>c.project_id or lower(v.language)<>lower(c.language))
  ) then raise exception 'Invalid language version scope' using errcode = '23514'; end if;
  return null;
end $$;
revoke all on function private.guard_language_version_scope() from public;
create constraint trigger g1_version_scope after insert or update on public.language_versions deferrable initially deferred for each row execute function private.guard_language_version_scope();
create constraint trigger g1_translation_scope after insert or update on public.translations deferrable initially deferred for each row execute function private.guard_language_version_scope();
create constraint trigger g1_line_scope after insert or update on public.translation_lines deferrable initially deferred for each row execute function private.guard_language_version_scope();
create constraint trigger g1_link_scope after insert or update on public.translation_line_links deferrable initially deferred for each row execute function private.guard_language_version_scope();

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

create or replace function public.create_project(p_name text, p_fps_num integer default 25, p_fps_den integer default 1, p_source_language text default 'und')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_project uuid := gen_random_uuid();
  v_main uuid := gen_random_uuid();
  v_draft uuid := gen_random_uuid();
begin
  if v_user is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  insert into public.projects (id, name, fps_num, fps_den, created_by, active_quality_profile_id, source_language) values (v_project, btrim(p_name), p_fps_num, p_fps_den, v_user, v_draft, p_source_language);
  insert into public.project_members (project_id, user_id, role, can_approve_costs) values (v_project, v_user, 'owner', true);
  insert into public.productions (id, project_id, kind, name, fps_num, fps_den, created_by)
    values (v_main, v_project, 'main', 'Main film', p_fps_num, p_fps_den, v_user);
  insert into public.quality_profiles (id, project_id, name, spec, created_by) values
    (v_draft, v_project, 'Draft', '{"effort":"fast","variants":1,"resolution":"1K","export":{"format":"mp4","bitrateKbps":4000}}'::jsonb, v_user),
    (gen_random_uuid(), v_project, 'Review', '{"effort":"balanced","variants":2,"resolution":"2K","export":{"format":"mp4","bitrateKbps":8000}}'::jsonb, v_user),
    (gen_random_uuid(), v_project, 'Final', '{"effort":"premium","variants":2,"resolution":"4K","export":{"format":"prores"}}'::jsonb, v_user);
  insert into public.change_log (id, project_id, actor, command_type, command, affected_ids)
    values (gen_random_uuid(), v_project, v_user, 'CreateProject',
            jsonb_build_object('name', btrim(p_name), 'mainProductionId', v_main, 'sourceLanguage', p_source_language), array[v_project, v_main]);
  return v_project;
end $$;
revoke all on function public.create_project(text, integer, integer, text) from public, anon;
grant execute on function public.create_project(text, integer, integer, text) to authenticated;

-- Remove the old overload and columns only in this new reviewed migration.
drop function public.create_project(text, integer, integer);
alter table public.projects drop column primary_language;
alter table public.projects drop column script_language;
insert into public.schema_version(version, description) values (90, 'G-1: language-neutral source and target integrity');
