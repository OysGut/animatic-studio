-- 0084: From Pen to Glass – PTG4 (B-102), additiv oppå 0083.
-- Erstatter public.apply_changes (0081), public.delete_project (0080),
-- public.purge_project_assets og public.purge_removed_assets (0079).
-- Definisjonene er kopiert fra siste migrasjon; bare munnrader/scope/slettevern legges til.
-- Claude gjennomgår og kjører migrasjonen. Ingen SQL mot storage.

create table public.mouth_sets (
 id uuid primary key,
 project_id uuid not null references public.projects(id) on delete restrict,
 character_id uuid not null references public.assets(id) on delete restrict,
 system text not null default 'rhubarb' check (system in ('rhubarb','preston-blair')),
 variants jsonb not null default '{}' check (jsonb_typeof(variants)='object' and octet_length(variants::text)<=4096),
 removed boolean not null default false,
 revision integer not null default 1 check (revision>0),
 created_at timestamptz not null default now(), created_by uuid
);
revoke all on public.mouth_sets from public, anon, authenticated;
grant select on public.mouth_sets to authenticated;
grant all on public.mouth_sets to service_role;
alter table public.mouth_sets enable row level security;
create policy mouth_sets_read on public.mouth_sets for select to authenticated using (private.is_project_member(project_id));
create unique index mouth_sets_character_idx on public.mouth_sets(project_id,character_id) where not removed;

create table public.mouth_tracks (
 id uuid primary key,
 project_id uuid not null references public.projects(id) on delete restrict,
 occurrence_id uuid not null references public.scene_occurrences(id) on delete restrict,
 character_id uuid not null references public.assets(id) on delete restrict,
 set_id uuid not null references public.mouth_sets(id) on delete restrict,
 clip_id uuid not null references public.audio_clips(id) on delete restrict,
 block_id uuid not null references public.script_blocks(id) on delete restrict,
 language text not null check (language ~ '^[A-Za-z][A-Za-z0-9-]{1,34}$'),
 spans jsonb not null default '[]' check (jsonb_typeof(spans)='array' and octet_length(spans::text)<=4000000),
 source jsonb not null check (jsonb_typeof(source)='object' and octet_length(source::text)<=200000),
 removed boolean not null default false,
 revision integer not null default 1 check (revision>0),
 created_at timestamptz not null default now(), created_by uuid
);
revoke all on public.mouth_tracks from public, anon, authenticated;
grant select on public.mouth_tracks to authenticated;
grant all on public.mouth_tracks to service_role;
alter table public.mouth_tracks enable row level security;
create policy mouth_tracks_read on public.mouth_tracks for select to authenticated using (private.is_project_member(project_id));
create unique index mouth_tracks_clip_idx on public.mouth_tracks(project_id,clip_id,language) where not removed;

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

  insert into public.change_log (id, project_id, actor, command_type, command, inverse, affected_ids)
    values (p_command_id, p_project, p_actor, p_command ->> 'type', p_command, p_inverse, v_affected);

  return jsonb_build_object('ok', true, 'changeId', p_command_id, 'affected', to_jsonb(v_affected));
end $$;
revoke all on function public.apply_changes(uuid, uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_changes(uuid, uuid, uuid, jsonb, jsonb, jsonb) to service_role;

create or replace function public.delete_project(p_project uuid, p_actor uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sources text[];
  v_films text[];
  v_removed integer;
begin
  -- Lås prosjektraden: skriving som pågår (holder nøkkellås via fremmednøkler) blir ferdig først,
  -- og innholdet den lagret, slettes med resten
  perform 1 from public.projects where id = p_project for update;
  if not exists (select 1 from public.projects where id = p_project and deleted_at is null) then
    raise exception 'Prosjektet finnes ikke eller er allerede slettet' using errcode = '22023';
  end if;
  if not private.is_active_owner(p_project, p_actor) then
    raise exception 'Bare prosjekteieren kan slette prosjektet' using errcode = '42501';
  end if;
  -- Filene i lagringen slettes av serverfunksjonen etterpå
  select coalesce(array_agg(storage_key), '{}') into v_sources
    from public.imported_documents where project_id = p_project;
  select coalesce(array_agg(media_ref), '{}') into v_films
    from public.takes where project_id = p_project and media_ref is not null
      and split_part(media_ref, '/', 1) = p_project::text;
  -- Delte filmer (GP5): filene slettes sammen med filmene fra takes
  v_films := v_films || coalesce((select array_agg(storage_key) from public.film_shares
    where project_id = p_project and split_part(storage_key, '/', 1) = p_project::text), '{}');
  -- Publiseringer (B-114, 0080): mediefilene under <prosjekt>/shares/ slettes sammen med filmene
  v_films := v_films || coalesce((select array_agg(storage_key) from public.publication_media
    where project_id = p_project and split_part(storage_key, '/', 1) = p_project::text), '{}');

  perform set_config('animatic.purge_project', p_project::text, true);
  -- Rekkefølge etter fremmednøkler (barn først)
  -- Plakater og relasjoner først (on delete restrict mot produksjoner og ressurser, DEC-0061)
  -- Story Lab (SL1): forslag og økter først, så fakta, stadier og profiler (on delete restrict mot ressurser og scener)
  -- Automatisk gjenkjenning (OG2): avledet arbeidslogg, før scenene
  delete from public.dialogue_batches where project_id = p_project;
  -- P8: harmoniseringsjobber (0065)
  delete from public.harmonize_batches where project_id = p_project;
  delete from public.script_entity_analysis where project_id = p_project;
  -- Publiseringer (B-114, 0080): kommentarer (svar før foreldre), medier og mottakere før publiseringene
  update public.review_comments set parent_id = null where project_id = p_project;
  delete from public.review_comments where project_id = p_project;
  delete from public.publication_media where project_id = p_project;
  delete from public.publication_recipients where project_id = p_project;
  delete from public.publications where project_id = p_project;
  -- Delte filmer (GP5): før eksportloggen og produksjonene
  delete from public.film_shares where project_id = p_project;
  delete from public.story_suggestions where project_id = p_project;
  update public.story_sessions set parent_session_id = null where project_id = p_project;
  delete from public.story_sessions where project_id = p_project;
  -- Canvas (SL7): kanter før noder, gruppekoblingen løses først (on delete restrict mot ressurser og scener)
  delete from public.story_canvas_edges where project_id = p_project;
  update public.story_canvas_nodes set group_id = null where project_id = p_project;
  delete from public.story_canvas_nodes where project_id = p_project;
  delete from public.story_facts where project_id = p_project;
  delete from public.story_profile_stages where project_id = p_project;
  delete from public.story_profiles where project_id = p_project;
  -- P8: harmoniseringsmetadata og foretrukne referanser før stilprofilene og bildene (on delete restrict)
  delete from public.style_harmonizations where project_id = p_project;
  delete from public.style_preferred_references where project_id = p_project;
  delete from public.style_profiles where project_id = p_project;
  delete from public.posters where project_id = p_project;
  delete from public.asset_relations where project_id = p_project;
  -- Oversettelser (on delete restrict mot linjer og scener, DEC-0058)
  delete from public.translation_line_links where project_id = p_project;
  delete from public.translation_lines where project_id = p_project;
  delete from public.translations where project_id = p_project;
  -- 0066 (ML3): språkversjonene etter oversettelsene (on delete restrict)
  delete from public.language_versions where project_id = p_project;
  delete from public.time_links where project_id = p_project;
  -- Leppesynk (CA5) og mønstre (CA6): før klippene, takene og linjene de peker på
  delete from public.mouth_tracks where project_id = p_project;
  delete from public.mouth_sets where project_id = p_project;
  delete from public.lipsync_results where project_id = p_project;
  delete from public.animation_patterns where project_id = p_project;
  -- DV7/DV8 (0062): lapper og gjennomganger før lydversjonene; personlige bokmerker forsvinner med prosjektet
  delete from public.note_flags where project_id = p_project;
  delete from public.dialogue_reviews where project_id = p_project;
  delete from public.user_bookmarks where project_id = p_project;
  -- M8 (0063): kvalitetsprofilene har ingen avhengigheter og slettes før lydversjonene
  delete from public.quality_profiles where project_id = p_project;
  -- Lydversjoner (DV2, 0060): aktiv kobling løses, så versjonene, før klippene de hører til
  update public.audio_clips set active_version_id = null where project_id = p_project;
  update public.dialogue_versions set parent_version_id = null where project_id = p_project;
  delete from public.dialogue_versions where project_id = p_project;
  delete from public.clip_parts where project_id = p_project;
  delete from public.audio_clips where project_id = p_project;
  delete from public.animation_uses where project_id = p_project;
  update public.animation_rigs set current_version_id = null where project_id = p_project;
  delete from public.animation_rig_versions where project_id = p_project;
  delete from public.animation_rigs where project_id = p_project;
  delete from public.print_copies where project_id = p_project;
  delete from public.print_job_elements where project_id = p_project;
  delete from public.print_jobs where project_id = p_project;
  delete from public.measure_sets where project_id = p_project;
  delete from public.composition_layers where project_id = p_project;
  -- Malforekomster (MTS MT4): etter lagene (on delete restrict), før 2D-scenene og ressursene
  delete from public.template_instances where project_id = p_project;
  -- Rulletekst (MTS MT7): sekvensen peker på forekomsten, deltakerne peker på ressurser (on delete restrict)
  delete from public.credit_sequences where project_id = p_project;
  delete from public.credit_participants where project_id = p_project;
  delete from public.compositions where project_id = p_project;
  delete from public.script_annotations where project_id = p_project;
  update public.scene_occurrences set active_take_id = null where project_id = p_project;
  delete from public.takes where project_id = p_project;
  delete from public.production_segments where project_id = p_project;
  delete from public.scene_occurrences where project_id = p_project;
  delete from public.script_block_revisions where project_id = p_project;
  delete from public.script_blocks where project_id = p_project;
  delete from public.scene_variants where project_id = p_project;
  -- Rigg & 2D-utskrift (B-087, 0071): scenekoblede rigger før scenene (on delete restrict)
  delete from public.rig_setups where project_id = p_project;
  delete from public.rig_templates where project_id = p_project;
  delete from public.scenes where project_id = p_project;
  delete from public.imported_documents where project_id = p_project;
  delete from public.script_versions where project_id = p_project;
  delete from public.productions where project_id = p_project;
  delete from public.change_log where project_id = p_project;
  delete from public.project_invitations where project_id = p_project;
  perform set_config('animatic.purge_project', '', true);

  update public.project_members set removed_at = now()
    where project_id = p_project and role <> 'owner' and removed_at is null;
  get diagnostics v_removed = row_count;
  update public.projects set deleted_at = now(), deleted_by = p_actor where id = p_project;
  return jsonb_build_object('sources', to_jsonb(v_sources), 'films', to_jsonb(v_films), 'removed_members', v_removed);
end $$;
revoke all on function public.delete_project(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_project(uuid, uuid) to service_role;

create or replace function public.purge_project_assets(p_project uuid, p_actor uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_paths text[];
begin
  perform 1 from public.projects where id = p_project for update;
  if not exists (select 1 from public.projects where id = p_project and deleted_at is not null) then
    raise exception 'Prosjektet må være slettet før ressursene kan slettes' using errcode = '22023';
  end if;
  if not private.is_active_owner(p_project, p_actor) then
    raise exception 'Bare prosjekteieren kan slette ressursene' using errcode = '42501';
  end if;
  select coalesce(array_agg(p), '{}') into v_paths from (
    select media_path as p from public.asset_versions where project_id = p_project
    -- Avledede bildefiler (B-105a): arbeidskopi, proxy, miniatyr og rå TIFF
    union select df.value ->> 'path' from public.asset_versions av
      cross join lateral jsonb_each(av.derived_files) df
      where av.project_id = p_project and av.derived_files is not null
        -- Ekstra forsvar: bare stier under eget prosjekt, aldri «..»
        and left(df.value ->> 'path', length(p_project::text) + 1) = p_project::text || '/'
        and strpos(df.value ->> 'path', '..') = 0
    union select result_path from public.generation_jobs where project_id = p_project and result_path is not null
    -- Filer fra mobilen (DEC-0090), også de som aldri ble en versjon
    union select path from public.mobile_imports where project_id = p_project
  ) x;

  perform set_config('animatic.purge_project', p_project::text, true);
  -- Innhold som ble lagret samtidig med slettingen av prosjektet, fjernes også her
  -- Plakater og relasjoner først (on delete restrict mot produksjoner og ressurser, DEC-0061)
  -- Mobilimport og opplastingsøkter (DEC-0090)
  delete from public.mobile_imports where project_id = p_project;
  update public.upload_sessions set parent_id = null where project_id = p_project;
  delete from public.upload_sessions where project_id = p_project;
  -- Story Lab (SL1): forslag og økter først, så fakta, stadier og profiler (on delete restrict mot ressurser og scener)
  -- Automatisk gjenkjenning (OG2): avledet arbeidslogg, før scenene
  delete from public.script_entity_analysis where project_id = p_project;
  delete from public.story_suggestions where project_id = p_project;
  update public.story_sessions set parent_session_id = null where project_id = p_project;
  delete from public.story_sessions where project_id = p_project;
  -- Canvas (SL7): kanter før noder, gruppekoblingen løses først (on delete restrict mot ressurser og scener)
  delete from public.story_canvas_edges where project_id = p_project;
  update public.story_canvas_nodes set group_id = null where project_id = p_project;
  delete from public.story_canvas_nodes where project_id = p_project;
  delete from public.story_facts where project_id = p_project;
  delete from public.story_profile_stages where project_id = p_project;
  delete from public.story_profiles where project_id = p_project;
  -- P8: harmoniseringsmetadata og foretrukne referanser før stilprofilene og bildene (on delete restrict)
  delete from public.style_harmonizations where project_id = p_project;
  delete from public.style_preferred_references where project_id = p_project;
  delete from public.style_profiles where project_id = p_project;
  delete from public.posters where project_id = p_project;
  delete from public.asset_relations where project_id = p_project;
  -- Oversettelser (on delete restrict mot linjer og scener, DEC-0058)
  delete from public.translation_line_links where project_id = p_project;
  delete from public.translation_lines where project_id = p_project;
  delete from public.translations where project_id = p_project;
  -- 0066 (ML3): språkversjonene etter oversettelsene (on delete restrict)
  delete from public.language_versions where project_id = p_project;
  delete from public.time_links where project_id = p_project;
  -- Leppesynk (CA5) og mønstre (CA6): før klippene, takene og linjene de peker på
  delete from public.mouth_tracks where project_id = p_project;
  delete from public.mouth_sets where project_id = p_project;
  delete from public.lipsync_results where project_id = p_project;
  delete from public.animation_patterns where project_id = p_project;
  -- DV7/DV8 (0062): lapper og gjennomganger før lydversjonene; personlige bokmerker forsvinner med prosjektet
  delete from public.note_flags where project_id = p_project;
  delete from public.dialogue_reviews where project_id = p_project;
  delete from public.user_bookmarks where project_id = p_project;
  -- M8 (0063): kvalitetsprofilene har ingen avhengigheter og slettes før lydversjonene
  delete from public.quality_profiles where project_id = p_project;
  -- Lydversjoner (DV2, 0060): aktiv kobling løses, så versjonene, før klippene de hører til
  update public.audio_clips set active_version_id = null where project_id = p_project;
  update public.dialogue_versions set parent_version_id = null where project_id = p_project;
  delete from public.dialogue_versions where project_id = p_project;
  delete from public.clip_parts where project_id = p_project;
  delete from public.audio_clips where project_id = p_project;
  delete from public.animation_uses where project_id = p_project;
  update public.animation_rigs set current_version_id = null where project_id = p_project;
  delete from public.animation_rig_versions where project_id = p_project;
  delete from public.animation_rigs where project_id = p_project;
  delete from public.print_copies where project_id = p_project;
  delete from public.print_job_elements where project_id = p_project;
  delete from public.print_jobs where project_id = p_project;
  delete from public.measure_sets where project_id = p_project;
  delete from public.composition_layers where project_id = p_project;
  -- Malforekomster (MTS MT4): etter lagene (on delete restrict), før 2D-scenene og ressursene
  delete from public.template_instances where project_id = p_project;
  -- Rulletekst (MTS MT7): sekvensen peker på forekomsten, deltakerne peker på ressurser (on delete restrict)
  delete from public.credit_sequences where project_id = p_project;
  delete from public.credit_participants where project_id = p_project;
  delete from public.compositions where project_id = p_project;
  delete from public.script_annotations where project_id = p_project;
  update public.scene_occurrences set active_take_id = null where project_id = p_project;
  delete from public.takes where project_id = p_project;
  delete from public.production_segments where project_id = p_project;
  delete from public.scene_occurrences where project_id = p_project;
  delete from public.script_block_revisions where project_id = p_project;
  delete from public.script_blocks where project_id = p_project;
  delete from public.scene_variants where project_id = p_project;
  delete from public.scenes where project_id = p_project;
  delete from public.imported_documents where project_id = p_project;
  delete from public.script_versions where project_id = p_project;
  delete from public.productions where project_id = p_project;
  delete from public.dialogue_batches where project_id = p_project;
  delete from public.harmonize_batches where project_id = p_project;
  delete from public.generation_jobs where project_id = p_project;
  update public.asset_variants set approved_version_id = null where project_id = p_project;
  delete from public.asset_versions where project_id = p_project;
  delete from public.asset_variants where project_id = p_project;
  delete from public.assets where project_id = p_project;
  delete from public.storage_cleanups where project_id = p_project;
  delete from public.change_log where project_id = p_project;
  delete from public.project_invitations where project_id = p_project;
  delete from public.project_members where project_id = p_project;
  delete from public.projects where id = p_project;
  perform set_config('animatic.purge_project', '', true);
  return jsonb_build_object('paths', to_jsonb(v_paths));
end $$;
revoke all on function public.purge_project_assets(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purge_project_assets(uuid, uuid) to service_role;

create or replace function public.purge_removed_assets(
  p_project uuid, p_actor uuid, p_assets uuid[], p_versions uuid[]
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_assets uuid[] := coalesce(p_assets, '{}');
  v_versions uuid[];
  v_paths text[];
begin
  perform 1 from public.projects where id = p_project and deleted_at is null for key share;
  if not found then
    raise exception 'Prosjektet er slettet' using errcode = '42501';
  end if;
  if private.member_role_rank(p_project, p_actor) < private.role_rank('editor') then
    raise exception 'Brukeren har ikke skriverett i prosjektet' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(v_assets) a where not exists (
      select 1 from public.assets x where x.id = a and x.project_id = p_project and x.removed)) then
    raise exception 'Bare slettede ressurser kan slettes for godt' using errcode = '22023';
  end if;
  -- Alle bilder i ressursene, pluss enkeltbilder som er slettet
  select coalesce(array_agg(distinct v.id), '{}') into v_versions from public.asset_versions v
    join public.asset_variants va on va.id = v.variant_id
    where v.project_id = p_project and (va.asset_id = any (v_assets) or v.id = any (coalesce(p_versions, '{}')));
  if exists (select 1 from unnest(coalesce(p_versions, '{}')) x where not exists (
      select 1 from public.asset_versions v where v.id = x and v.project_id = p_project and v.removed)) then
    raise exception 'Bare slettede bilder kan slettes for godt' using errcode = '22023';
  end if;
  if exists (select 1 from public.animation_rigs r join public.asset_variants v on v.id = r.variant_id
      where r.project_id = p_project and v.asset_id = any (v_assets))
     or exists (select 1 from public.animation_rig_versions v where v.project_id = p_project and v.source_version_id = any (v_versions)) then
    raise exception 'Brukes fortsatt i et animasjonsoppsett. Fjern oppsettet først.' using errcode = '23503';
  end if;
  if exists(select 1 from public.mouth_sets m where m.project_id=p_project and m.character_id=any(v_assets)) then
    raise exception 'Brukes fortsatt i et munnsett. Fjern bruken først.' using errcode='23503'; end if;
  -- Målesett er prosjektdata som kan angres: behold laget og ressursene de måler.
  if exists (select 1 from public.measure_sets m
      join public.composition_layers l on l.id = m.layer_id
      where m.project_id = p_project
        and (l.asset_id = any (v_assets) or l.version_id = any (v_versions))) then
    raise exception 'Brukes fortsatt i et målesett. Fjern bruken først.' using errcode = '23503';
  end if;
  -- Utskriftsjobber (0079) er prosjektdata som kan angres: behold kildeversjonene de skriver ut.
  if exists (select 1 from public.print_job_elements e where e.project_id = p_project
      and (e.version_id = any (v_versions)
        or e.version_id in (select v.id from public.asset_versions v join public.asset_variants va on va.id = v.variant_id
                            where va.asset_id = any (v_assets)))) then
    raise exception 'Brukes fortsatt i en utskriftsjobb. Fjern bruken først.' using errcode = '23503';
  end if;
  if exists (select 1 from public.composition_layers l where l.project_id = p_project
             and (l.asset_id = any (v_assets) or l.version_id = any (v_versions))) then
    raise exception 'Brukes fortsatt i en 2D-scene (også et slettet lag kan angres). Fjern bruken først.' using errcode = '23503';
  end if;
  -- Malforekomster (MTS MT4): en mal som brukes i en scene, slettes ikke (AJ)
  if exists (select 1 from public.template_instances i where i.project_id = p_project
             and (i.template_asset_id = any (v_assets) or i.template_version_id = any (v_versions))) then
    raise exception 'Malen brukes fortsatt i en scene. Fjern bruken først.' using errcode = '23503';
  end if;
  -- Rulletekst (MTS MT7): en ressurs eller et bilde som brukes som logo/bilde i rulleteksten, slettes ikke
  if exists (select 1 from public.credit_participants cp where cp.project_id = p_project
             and (cp.logo_asset_id = any (v_assets) or cp.image_asset_id = any (v_assets)
                  or cp.logo_version_id = any (v_versions) or cp.image_version_id = any (v_versions))) then
    raise exception 'Brukes fortsatt i rulleteksten. Fjern bruken først.' using errcode = '23503';
  end if;
  if exists (select 1 from public.audio_clips c where c.project_id = p_project
             and (c.asset_id = any (v_assets) or c.version_id = any (v_versions))) then
    raise exception 'Brukes fortsatt som lyd i filmen. Fjern bruken først.' using errcode = '23503';
  end if;
  -- Lydversjoner av en replikk (DV2, 0060): også inaktive og slettede versjoner beholder filen sin
  if exists (select 1 from public.dialogue_versions d where d.project_id = p_project
             and (d.asset_id = any (v_assets) or d.asset_version_id = any (v_versions)
                  or d.composition_id = any (v_versions))) then
    raise exception 'Brukes fortsatt i en lydversjon av en replikk. Ingen lydversjon slettes.' using errcode = '23503';
  end if;
  if exists (select 1 from public.asset_relations r where r.project_id = p_project
             and (r.from_asset_id = any (v_assets) or r.to_asset_id = any (v_assets))) then
    raise exception 'Har fortsatt relasjoner i karakterkartet. Fjern dem først.' using errcode = '23503';
  end if;
  -- Story Lab (SL1): profil, stadium eller kunnskap som fortsatt gjelder, eller tro om ressursen i en profil
  if exists (select 1 from public.story_profiles sp where sp.project_id = p_project and not sp.removed
             and sp.asset_id = any (v_assets))
     or exists (select 1 from public.story_profile_stages sg where sg.project_id = p_project and not sg.removed
             and sg.asset_id = any (v_assets)) then
    raise exception 'Har fortsatt en profil i Story Lab. Fjern den først.' using errcode = '23503';
  end if;
  if exists (select 1 from public.story_facts f where f.project_id = p_project
             and exists (select 1 from unnest(v_assets) x where f.known_by::text like '%' || x::text || '%'))
     or exists (select 1 from public.story_profiles sp where sp.project_id = p_project
             and exists (select 1 from unnest(v_assets) x where sp.profile::text like '%' || x::text || '%')) then
    raise exception 'Brukes fortsatt i fakta eller en profil i Story Lab. Fjern bruken først.' using errcode = '23503';
  end if;
  -- Canvas (SL7): en node som fortsatt er koblet til ressursen
  if exists (select 1 from public.story_canvas_nodes n where n.project_id = p_project and not n.removed
             and n.asset_id = any (v_assets)) then
    raise exception 'Er fortsatt koblet til en node på canvaset i Story Lab. Fjern koblingen først.' using errcode = '23503';
  end if;
  if exists (select 1 from public.asset_variants va where va.project_id = p_project
              and va.approved_version_id = any (v_versions) and not (va.asset_id = any (v_assets))) then
    raise exception 'Et av bildene er godkjent. Godkjenn et annet bilde først.' using errcode = '23503';
  end if;
  if exists (select 1 from public.posters p where p.project_id = p_project
             and exists (select 1 from unnest(v_assets || v_versions) x where p.document::text like '%' || x::text || '%')) then
    raise exception 'Brukes fortsatt på en plakat eller et karakterkart. Fjern bruken først.' using errcode = '23503';
  end if;
  if exists (select 1 from public.style_profiles sp where sp.project_id = p_project and not sp.removed
             and exists (select 1 from unnest(v_versions) x where sp.guide::text like '%' || x::text || '%')) then
    raise exception 'Er et forbildebilde i filmens visuelle stil. Fjern det der først.' using errcode = '23503';
  end if;

  select coalesce(array_agg(p), '{}') into v_paths from (
    select media_path as p from public.asset_versions where id = any (v_versions)
    -- Avledede bildefiler (B-105a): arbeidskopi, proxy, miniatyr og rå TIFF
    union select df.value ->> 'path' from public.asset_versions av
      cross join lateral jsonb_each(av.derived_files) df
      where av.id = any (v_versions) and av.derived_files is not null
        -- Ekstra forsvar: bare stier under eget prosjekt, aldri «..»
        and left(df.value ->> 'path', length(p_project::text) + 1) = p_project::text || '/'
        and strpos(df.value ->> 'path', '..') = 0
  ) x;
  -- AI-jobbloggen beholdes (kostnad og beskrivelse), men kobles fra ressursen som forsvinner
  update public.generation_jobs set asset_id = null where project_id = p_project and asset_id = any (v_assets);
  delete from public.continuity_events where project_id = p_project and asset_id = any (v_assets);
  -- Fjernede Story Lab-rader for ressursen slettes sammen med den
  delete from public.story_profile_stages where project_id = p_project and removed and asset_id = any (v_assets);
  delete from public.story_profiles where project_id = p_project and removed and asset_id = any (v_assets);
  -- Fjernede canvasnoder beholder plassen sin (angring), men mister koblingen til ressursen
  update public.story_canvas_nodes set asset_id = null
    where project_id = p_project and removed and asset_id = any (v_assets);
  -- P8: harmoniseringsmetadata og foretrukne referanser for bildene og ressursene (fremmednøklene er restrict)
  delete from public.style_harmonizations where project_id = p_project
    and (version_id = any (v_versions) or source_version_id = any (v_versions) or reference_version_id = any (v_versions));
  delete from public.style_preferred_references where project_id = p_project
    and (asset_id = any (v_assets)
         or variant_id in (select va.id from public.asset_variants va where va.project_id = p_project and va.asset_id = any (v_assets)));
  update public.asset_variants set approved_version_id = null
    where project_id = p_project and approved_version_id = any (v_versions);
  delete from public.asset_versions where id = any (v_versions) and project_id = p_project;
  delete from public.asset_variants where project_id = p_project and asset_id = any (v_assets);
  delete from public.assets where id = any (v_assets) and project_id = p_project;
  return jsonb_build_object('paths', to_jsonb(v_paths), 'assets', cardinality(v_assets), 'versions', cardinality(v_versions));
end $$;
revoke all on function public.purge_removed_assets(uuid, uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.purge_removed_assets(uuid, uuid, uuid[], uuid[]) to service_role;

insert into public.schema_version(version,description) values (84,'0084_mouth_sets_tracks: PTG4 – munnsett og munnspor');
