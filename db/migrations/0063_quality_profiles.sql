-- =====================================================================================
-- Animatic Studio – migrasjon 0063: M8 navngitte kvalitetsprofiler (REQ-0854–0862).
-- Ny tabell quality_profiles (modeller per AI-type, oppløsning, innsatsnivå, varianter,
-- eksportinnstillinger og budsjettgrense) og projects.active_quality_profile_id.
-- Erstatter apply_changes, delete_project og purge_project_assets. Definisjonene er kopiert ordrett
-- fra 0062: apply_changes kjenner quality_profiles og prosjektkolonnen active_quality_profile_id;
-- delete_project og purge_project_assets rydder profilene før prosjektet.
-- purge_removed_assets er uendret (profilene har ingen filer og blokkerer ikke purge).
-- create_project er erstattet (kopiert fra 0001): nye prosjekter får standardprofilene
-- «Utkast», «Gjennomgang» og «Endelig», med «Utkast» aktiv. Eksisterende prosjekter endres ikke
-- (ingen stille backfill); de tilbys standardprofilene i grensesnittet.
-- create_dialogue_batch fra 0061: bare profiløyeblikksbilde i reserverte jobber.
-- Ny private.guard_quality_profile_job håndhever profilgrensen atomisk.
-- Ingen SQL mot storage.
-- =====================================================================================

create table public.quality_profiles (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  name text not null check (char_length(name) between 1 and 80),
  spec jsonb not null default '{}'::jsonb check (jsonb_typeof(spec) = 'object' and octet_length(spec::text) <= 8192),
  edited_by uuid,
  edited_at timestamptz,
  removed boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  created_by uuid
);
create index quality_profiles_project_idx on public.quality_profiles (project_id);
revoke all on public.quality_profiles from anon, authenticated;
grant select on public.quality_profiles to authenticated;
grant all on public.quality_profiles to service_role;
alter table public.quality_profiles enable row level security;
create policy quality_profiles_read on public.quality_profiles for select to authenticated
  using (private.is_project_member(project_id));

-- Aktiv profil. Ingen fremmednøkkel: angring av AddQualityProfile sletter raden, og en fjernet
-- profil nullstilles i kommandoen (SetQualityProfileRemoved / UndoAddQualityProfile).
alter table public.projects add column active_quality_profile_id uuid;

-- Every generation entry point (including queued DV jobs) reserves capacity atomically.
create function private.guard_quality_profile_job() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_profile public.quality_profiles; v_used integer; v_limit integer; v_id uuid;
begin
  if TG_OP = 'UPDATE' and new.params->'qualityProfile' is distinct from old.params->'qualityProfile'
    and old.params->'qualityProfile' is not null and old.params->'qualityProfile' <> 'null'::jsonb then
    raise exception 'Quality profile snapshot is immutable' using errcode='22023';
  end if;
  if new.params->'qualityProfile' is null or new.params->'qualityProfile' = 'null'::jsonb
    or new.kind in ('text','prompt') then return new; end if;
  -- Existing reservations can finalize even after the profile is edited/removed.
  if TG_OP='UPDATE' and old.status <> 'failed' then return new; end if;
  perform 1 from public.projects where id=new.project_id and deleted_at is null for update;
  if not found then raise exception 'Project not found' using errcode='42501'; end if;
  v_id := (new.params->'qualityProfile'->>'id')::uuid;
  select * into v_profile from public.quality_profiles where id=v_id and project_id=new.project_id;
  if not found then raise exception 'Profile does not belong to project' using errcode='42501'; end if;
  if TG_OP = 'INSERT' then
    if v_profile.removed then raise exception 'Profile removed' using errcode='22023'; end if;
    if new.params->'qualityProfile' is distinct from jsonb_build_object('id',v_profile.id,'name',v_profile.name,'spec',v_profile.spec) then
      raise exception 'Profile changed; approve again' using errcode='22023';
    end if;
    new.params := new.params || jsonb_build_object('qualityProfileId',v_id);
  end if;
  v_limit := (v_profile.spec->>'budgetLimit')::integer;
  if v_limit is null or new.status='failed' then return new; end if;
  select count(*) into v_used from public.generation_jobs
    where project_id=new.project_id and id<>new.id and status<>'failed' and kind not in ('text','prompt')
    and params->'qualityProfile'->>'id'=v_id::text
    and created_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
  if v_used+1 > v_limit then raise exception 'Quality profile monthly budget exceeded' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function private.guard_quality_profile_job() from public,anon,authenticated;
create trigger quality_profile_job_budget before insert or update of params,status on public.generation_jobs
  for each row execute function private.guard_quality_profile_job();

create or replace function public.apply_changes(
  p_project uuid, p_actor uuid, p_command_id uuid, p_command jsonb, p_inverse jsonb, p_changes jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tables text[] := array['productions','scenes','scene_variants','script_blocks','scene_occurrences','production_segments','takes',
                           'assets','asset_variants','asset_versions','animation_rigs','animation_rig_versions','script_annotations',
                           'compositions','template_instances','credit_participants','credit_sequences','composition_layers','animation_uses','audio_clips','dialogue_versions','clip_parts','time_links','generation_prompts',
                           'continuity_events','translations','asset_relations','posters','style_profiles',
                           'story_profiles','story_profile_stages','story_facts','story_canvas_nodes','story_canvas_edges',
                           'lipsync_results','animation_patterns','dialogue_reviews','note_flags','quality_profiles'];
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
  foreach v_t in array array['quality_profiles','note_flags','dialogue_reviews','animation_patterns','lipsync_results','dialogue_versions','story_canvas_edges','story_canvas_nodes','story_facts','story_profile_stages','story_profiles','style_profiles','posters','asset_relations','translations','continuity_events','generation_prompts','time_links','clip_parts','audio_clips','animation_uses','composition_layers','credit_sequences','credit_participants','template_instances','compositions','script_annotations','animation_rig_versions','animation_rigs','asset_versions','asset_variants','assets',
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

  perform set_config('animatic.purge_project', p_project::text, true);
  -- Rekkefølge etter fremmednøkler (barn først)
  -- Plakater og relasjoner først (on delete restrict mot produksjoner og ressurser, DEC-0061)
  -- Story Lab (SL1): forslag og økter først, så fakta, stadier og profiler (on delete restrict mot ressurser og scener)
  -- Automatisk gjenkjenning (OG2): avledet arbeidslogg, før scenene
  delete from public.dialogue_batches where project_id = p_project;
  delete from public.script_entity_analysis where project_id = p_project;
  -- Delingslenker (GP5): før eksportloggen og produksjonene
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
  delete from public.style_profiles where project_id = p_project;
  delete from public.posters where project_id = p_project;
  delete from public.asset_relations where project_id = p_project;
  -- Oversettelser (on delete restrict mot linjer og scener, DEC-0058)
  delete from public.translations where project_id = p_project;
  delete from public.time_links where project_id = p_project;
  -- Leppesynk (CA5) og mønstre (CA6): før klippene, takene og linjene de peker på
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
  delete from public.style_profiles where project_id = p_project;
  delete from public.posters where project_id = p_project;
  delete from public.asset_relations where project_id = p_project;
  -- Oversettelser (on delete restrict mot linjer og scener, DEC-0058)
  delete from public.translations where project_id = p_project;
  delete from public.time_links where project_id = p_project;
  -- Leppesynk (CA5) og mønstre (CA6): før klippene, takene og linjene de peker på
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
  delete from public.generation_jobs where project_id = p_project;
  update public.asset_variants set approved_version_id = null where project_id = p_project;
  delete from public.asset_versions where project_id = p_project;
  delete from public.asset_variants where project_id = p_project;
  delete from public.assets where project_id = p_project;
  delete from public.change_log where project_id = p_project;
  delete from public.project_invitations where project_id = p_project;
  delete from public.project_members where project_id = p_project;
  delete from public.projects where id = p_project;
  perform set_config('animatic.purge_project', '', true);
  return jsonb_build_object('paths', to_jsonb(v_paths));
end $$;
revoke all on function public.purge_project_assets(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purge_project_assets(uuid, uuid) to service_role;

-- Nye prosjekter får standardprofilene «Utkast» (aktiv), «Gjennomgang» og «Endelig» (M8, REQ-0855).
-- Kopiert ordrett fra 0001, med profilene lagt til. Eksisterende prosjekter endres ikke.
create or replace function public.create_project(p_name text, p_fps_num integer default 25, p_fps_den integer default 1)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_project uuid := gen_random_uuid();
  v_main uuid := gen_random_uuid();
  v_draft uuid := gen_random_uuid();
begin
  if v_user is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  insert into public.projects (id, name, fps_num, fps_den, created_by, active_quality_profile_id) values (v_project, btrim(p_name), p_fps_num, p_fps_den, v_user, v_draft);
  insert into public.project_members (project_id, user_id, role, can_approve_costs) values (v_project, v_user, 'owner', true);
  insert into public.productions (id, project_id, kind, name, fps_num, fps_den, created_by)
    values (v_main, v_project, 'main', 'Hovedfilm', p_fps_num, p_fps_den, v_user);
  insert into public.quality_profiles (id, project_id, name, spec, created_by) values
    (v_draft, v_project, 'Utkast', '{"effort":"fast","variants":1,"resolution":"1K","export":{"format":"mp4","bitrateKbps":4000}}'::jsonb, v_user),
    (gen_random_uuid(), v_project, 'Gjennomgang', '{"effort":"balanced","variants":2,"resolution":"2K","export":{"format":"mp4","bitrateKbps":8000}}'::jsonb, v_user),
    (gen_random_uuid(), v_project, 'Endelig', '{"effort":"premium","variants":2,"resolution":"4K","export":{"format":"mp4","bitrateKbps":16000}}'::jsonb, v_user);
  insert into public.change_log (id, project_id, actor, command_type, command, affected_ids)
    values (gen_random_uuid(), v_project, v_user, 'CreateProject',
            jsonb_build_object('name', btrim(p_name), 'mainProductionId', v_main), array[v_project, v_main]);
  return v_project;
end $$;
revoke all on function public.create_project(text, integer, integer) from public, anon;
grant execute on function public.create_project(text, integer, integer) to authenticated;

create or replace function public.create_dialogue_batch(p_project uuid, p_actor uuid, p_request uuid, p_character uuid, p_voice jsonb, p_items jsonb, p_key uuid, p_key_owner uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_item jsonb; v_position integer := 0; v_limit integer; v_used integer;
begin
  perform 1 from public.projects where id = p_project and deleted_at is null for update;
  if not found or private.member_role_rank(p_project,p_actor) < private.role_rank('editor') then raise exception 'Forbidden' using errcode = '42501'; end if;
  select id into v_id from public.dialogue_batches where project_id = p_project and request_id = p_request;
  if found then return v_id; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 1000 then raise exception 'Invalid items' using errcode = '22023'; end if;
  if not exists(select 1 from public.assets where id=p_character and project_id=p_project and not removed and kind in ('character','animal','other')) then raise exception 'Invalid character' using errcode='22023'; end if;
  if jsonb_typeof(p_voice) <> 'object' or p_voice->>'provider' <> 'elevenlabs' or length(coalesce(p_voice->>'voiceId','')) not between 1 and 200 then raise exception 'Invalid voice' using errcode='22023'; end if;
  if not exists(select 1 from public.ai_provider_keys where id=p_key and user_id=p_key_owner and provider='elevenlabs' and status <> 'failed') then raise exception 'Invalid provider key' using errcode='42501'; end if;
  select ai_month_limit into v_limit from public.projects where id=p_project;
  select count(*) into v_used from public.generation_jobs where project_id=p_project and status <> 'failed' and kind not in ('text','prompt') and created_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
  if v_limit is not null and v_used+jsonb_array_length(p_items)>v_limit then raise exception 'Project generation budget exceeded' using errcode='22023'; end if;
  v_id := gen_random_uuid();
  insert into public.dialogue_batches(id,project_id,request_id,character_id,voice,created_by) values(v_id,p_project,p_request,p_character,p_voice,p_actor);
  for v_item in select * from jsonb_array_elements(p_items) loop
    if not exists (select 1 from public.script_blocks b join public.scene_occurrences o on o.variant_id = b.variant_id and o.project_id = b.project_id where b.id = (v_item->>'block_id')::uuid and o.id = (v_item->>'occurrence_id')::uuid and b.project_id = p_project and b.kind = 'dialogue' and not b.removed and o.active and b.current_rev = (v_item->>'script_revision')::integer) then raise exception 'Invalid line' using errcode = '22023'; end if;
    if length(coalesce(v_item->>'language','')) not between 2 and 100 or (v_item->>'cost')::numeric < 0 then raise exception 'Invalid estimate or language'; end if;
    insert into public.generation_jobs(id,project_id,kind,provider,model,prompt,status,created_by,cost_usd,params,provider_key_id,key_owner)
    values((v_item->>'job_id')::uuid,p_project,'sound','elevenlabs',coalesce(p_voice->>'modelId','eleven_v3'),'','queued',p_actor,(v_item->>'cost')::numeric,jsonb_build_object('kind','dialogue_batch','batchId',v_id,'blockId',v_item->>'block_id','language',v_item->>'language') || case when p_voice->'qualityProfile' is not null and p_voice->'qualityProfile'<>'null'::jsonb then jsonb_build_object('qualityProfile',p_voice->'qualityProfile') else '{}'::jsonb end,p_key,p_key_owner);
    insert into public.dialogue_batch_items(id,batch_id,project_id,job_id,occurrence_id,block_id,script_revision,language,position,variant_id,version_id,clip_id,dialogue_version_id,composition_id,command_id,created_by)
    values((v_item->>'id')::uuid,v_id,p_project,(v_item->>'job_id')::uuid,(v_item->>'occurrence_id')::uuid,(v_item->>'block_id')::uuid,(v_item->>'script_revision')::integer,v_item->>'language',v_position,(v_item->>'variant_id')::uuid,(v_item->>'version_id')::uuid,(v_item->>'clip_id')::uuid,(v_item->>'dialogue_version_id')::uuid,(v_item->>'composition_id')::uuid,(v_item->>'command_id')::uuid,p_actor);
    v_position := v_position + 1;
  end loop;
  return v_id;
end $$;
revoke all on function public.create_dialogue_batch(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_dialogue_batch(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid) to service_role;

insert into public.schema_version(version,description) values (63,'0063_quality_profiles: M8 kvalitetsprofiler, aktiv profil på prosjektet og standardprofiler for nye prosjekter');
