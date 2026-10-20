-- =====================================================================================
-- Animatic Studio – migrasjon 0065: P8 AI-stilharmonisering (REQ-0137–0145, REQ-0400–0402).
-- Erstatter apply_changes, delete_project og purge_project_assets fra 0064_translation_line_links.sql
-- og purge_removed_assets fra 0061_dialogue_batch_languages.sql (ordrett, med barnetabellene lagt til).
-- create_project, create_dialogue_batch og guard_quality_profile_job er uendret.
-- Nye tabeller: style_harmonizations (metadata om harmoniserte versjoner), style_preferred_references
-- (REQ-0144) og harmonize_batches/harmonize_batch_items (varig massejobb med lease og idempotens, DV5-mønster).
-- Skrevet for gjennomgang; kjøres ikke i Cloud av Lovable.
-- =====================================================================================

create table public.style_harmonizations (
  id uuid primary key,
  project_id uuid not null references public.projects(id),
  version_id uuid not null references public.asset_versions(id) on delete restrict,
  source_version_id uuid not null references public.asset_versions(id) on delete restrict,
  model text not null check(char_length(model) between 1 and 200),
  quality_profile jsonb check(quality_profile is null or (jsonb_typeof(quality_profile) = 'object' and pg_column_size(quality_profile) <= 8192)),
  style_profile_id uuid references public.style_profiles(id) on delete restrict,
  reference_version_id uuid references public.asset_versions(id) on delete restrict,
  use text not null check(use in ('local','variant','reference','published')),
  note text not null default '' check(char_length(note) <= 2000),
  removed boolean not null default false,
  revision integer not null default 1 check(revision > 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  check(version_id <> source_version_id),
  check(style_profile_id is not null or reference_version_id is not null)
);
revoke all on public.style_harmonizations from anon, authenticated;
grant select on public.style_harmonizations to authenticated;
grant all on public.style_harmonizations to service_role;
alter table public.style_harmonizations enable row level security;
create policy style_harmonizations_read on public.style_harmonizations for select to authenticated using(private.is_project_member(project_id));
create index style_harmonizations_project_idx on public.style_harmonizations(project_id, version_id);

create table public.style_preferred_references (
  id uuid primary key,
  project_id uuid not null references public.projects(id),
  asset_id uuid not null references public.assets(id) on delete restrict,
  style_profile_id uuid not null references public.style_profiles(id) on delete restrict,
  variant_id uuid not null references public.asset_variants(id) on delete restrict,
  removed boolean not null default false,
  revision integer not null default 1 check(revision > 0),
  created_at timestamptz not null default now(),
  created_by uuid
);
revoke all on public.style_preferred_references from anon, authenticated;
grant select on public.style_preferred_references to authenticated;
grant all on public.style_preferred_references to service_role;
alter table public.style_preferred_references enable row level security;
create policy style_preferred_references_read on public.style_preferred_references for select to authenticated using(private.is_project_member(project_id));
create index style_preferred_references_project_idx on public.style_preferred_references(project_id, asset_id, style_profile_id);

-- Masseharmonisering (krav 6): varig jobb med lease, kvitteringer og idempotens, som DV5.
create table public.harmonize_batches (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete restrict,
  request_id uuid not null,
  style_profile_id uuid references public.style_profiles(id) on delete restrict,
  reference_version_id uuid references public.asset_versions(id) on delete restrict,
  provider text not null check(char_length(provider) between 1 and 100),
  model text not null check(char_length(model) between 1 and 200),
  size text check(size is null or char_length(size) <= 40),
  status text not null default 'running' check (status in ('running','paused','done')),
  pause_reason text check(pause_reason is null or char_length(pause_reason) <= 2000),
  access_blocked boolean not null default false,
  lease_token uuid,
  lease_until timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique(project_id, request_id)
);
revoke all on public.harmonize_batches from anon, authenticated;
grant select on public.harmonize_batches to authenticated;
grant all on public.harmonize_batches to service_role;
alter table public.harmonize_batches enable row level security;
create policy harmonize_batches_read on public.harmonize_batches for select to authenticated using (private.is_project_member(project_id));

create table public.harmonize_batch_items (
  id uuid primary key,
  batch_id uuid not null references public.harmonize_batches(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  asset_id uuid not null,
  source_version_id uuid not null,
  position integer not null default 0,
  variant_id uuid not null,
  version_id uuid not null,
  harmonization_id uuid not null,
  command_id uuid not null,
  status text not null default 'waiting' check (status in ('waiting','generating','ready','done','failed','skipped')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  retryable boolean not null default true,
  error text check(error is null or char_length(error) <= 2000),
  result jsonb check(result is null or pg_column_size(result) <= 16384),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique(batch_id, asset_id, source_version_id),
  unique(job_id), unique(command_id)
);
revoke all on public.harmonize_batch_items from anon, authenticated;
grant select on public.harmonize_batch_items to authenticated;
grant all on public.harmonize_batch_items to service_role;
alter table public.harmonize_batch_items enable row level security;
create policy harmonize_batch_items_read on public.harmonize_batch_items for select to authenticated using (private.is_project_member(project_id));
create index harmonize_batch_pending_idx on public.harmonize_batch_items(batch_id, position) where status in ('waiting','ready');

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
                           'lipsync_results','animation_patterns','dialogue_reviews','note_flags','quality_profiles','translation_lines','translation_line_links','style_harmonizations','style_preferred_references'];
  v_t text;
  v_link_check uuid[] := '{}';
  v_harm_check uuid[] := '{}';
  v_pref_check uuid[] := '{}';
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
  foreach v_t in array array['style_preferred_references','style_harmonizations','translation_line_links','translation_lines','quality_profiles','note_flags','dialogue_reviews','animation_patterns','lipsync_results','dialogue_versions','story_canvas_edges','story_canvas_nodes','story_facts','story_profile_stages','story_profiles','style_profiles','posters','asset_relations','translations','continuity_events','generation_prompts','time_links','clip_parts','audio_clips','animation_uses','composition_layers','credit_sequences','credit_participants','template_instances','compositions','script_annotations','animation_rig_versions','animation_rigs','asset_versions','asset_variants','assets',
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
  -- REQ-0144: nøyaktig én aktiv foretrukket referanse per (ressurs, stilprofil)
  if exists(select r.asset_id, r.style_profile_id from public.style_preferred_references r
    where r.project_id=p_project and not r.removed group by r.asset_id, r.style_profile_id having count(*) > 1) then
    raise exception 'More than one preferred reference' using errcode='22023'; end if;
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
  -- P8: harmoniseringsjobber (0065)
  delete from public.harmonize_batches where project_id = p_project;
  delete from public.script_entity_analysis where project_id = p_project;
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
  delete from public.harmonize_batches where project_id = p_project;
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

-- Ordrett fra 0061, med sletting av harmoniseringsmetadata og foretrukne referanser for bildene og
-- ressursene som forsvinner (fremmednøklene er on delete restrict, så radene må vekk først).
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

  select coalesce(array_agg(media_path), '{}') into v_paths from public.asset_versions where id = any (v_versions);
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

-- Masseharmonisering (krav 6): opprettelsen er idempotent på (project_id, request_id), og budsjettet og
-- nøkkelen kontrolleres før noe reserveres – som create_dialogue_batch (0063).
create or replace function public.create_harmonize_batch(p_project uuid, p_actor uuid, p_request uuid, p_style_profile uuid, p_reference_version uuid, p_provider text, p_model text, p_size text, p_quality_profile jsonb, p_items jsonb, p_key uuid, p_key_owner uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_item jsonb; v_position integer := 0; v_limit integer; v_used integer;
begin
  perform 1 from public.projects where id = p_project and deleted_at is null for update;
  if not found or private.member_role_rank(p_project,p_actor) < private.role_rank('editor') then raise exception 'Forbidden' using errcode = '42501'; end if;
  select id into v_id from public.harmonize_batches where project_id = p_project and request_id = p_request;
  if found then return v_id; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Invalid items' using errcode = '22023'; end if;
  if p_style_profile is null and p_reference_version is null then raise exception 'Invalid style source' using errcode = '22023'; end if;
  if p_style_profile is not null and not exists(select 1 from public.style_profiles where id = p_style_profile and project_id = p_project and not removed) then raise exception 'Invalid style profile' using errcode = '22023'; end if;
  if p_reference_version is not null and not exists(select 1 from public.asset_versions where id = p_reference_version and project_id = p_project and mime_type like 'image/%') then raise exception 'Invalid reference image' using errcode = '22023'; end if;
  if char_length(coalesce(p_provider,'')) not between 1 and 100 or char_length(coalesce(p_model,'')) not between 1 and 200 then raise exception 'Invalid model' using errcode = '22023'; end if;
  if p_key is null then
    if p_provider <> 'lovable' then raise exception 'Invalid provider key' using errcode = '42501'; end if;
  elsif not exists(select 1 from public.ai_provider_keys where id = p_key and user_id = p_key_owner and provider = p_provider and status <> 'failed') then raise exception 'Invalid provider key' using errcode = '42501'; end if;
  select ai_month_limit into v_limit from public.projects where id = p_project;
  select count(*) into v_used from public.generation_jobs where project_id = p_project and status <> 'failed' and kind not in ('text','prompt') and created_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
  if v_limit is not null and v_used + jsonb_array_length(p_items) > v_limit then raise exception 'Project generation budget exceeded' using errcode = '22023'; end if;
  v_id := gen_random_uuid();
  insert into public.harmonize_batches(id,project_id,request_id,style_profile_id,reference_version_id,provider,model,size,created_by)
    values(v_id,p_project,p_request,p_style_profile,p_reference_version,p_provider,p_model,p_size,p_actor);
  for v_item in select * from jsonb_array_elements(p_items) loop
    if not exists(select 1 from public.assets a where a.id = (v_item->>'asset_id')::uuid and a.project_id = p_project and not a.removed) then raise exception 'Invalid asset' using errcode = '22023'; end if;
    if not exists(select 1 from public.asset_versions v join public.asset_variants va on va.id = v.variant_id where v.id = (v_item->>'source_version_id')::uuid and v.project_id = p_project and va.asset_id = (v_item->>'asset_id')::uuid and v.mime_type like 'image/%') then raise exception 'Invalid source image' using errcode = '22023'; end if;
    if (v_item->>'cost')::numeric < 0 then raise exception 'Invalid estimate' using errcode = '22023'; end if;
    insert into public.generation_jobs(id,project_id,kind,provider,model,prompt,status,created_by,cost_usd,params,provider_key_id,key_owner)
    values((v_item->>'job_id')::uuid,p_project,'image',p_provider,p_model,'(stilharmonisering – beskrivelsen bygges når jobben kjøres)','queued',p_actor,(v_item->>'cost')::numeric,jsonb_build_object('kind','harmonize_batch','batchId',v_id,'assetId',v_item->>'asset_id','sourceVersionId',v_item->>'source_version_id') || case when p_quality_profile is not null and p_quality_profile <> 'null'::jsonb then jsonb_build_object('qualityProfile',p_quality_profile) else '{}'::jsonb end,p_key,p_key_owner);
    insert into public.harmonize_batch_items(id,batch_id,project_id,job_id,asset_id,source_version_id,position,variant_id,version_id,harmonization_id,command_id,created_by)
    values((v_item->>'id')::uuid,v_id,p_project,(v_item->>'job_id')::uuid,(v_item->>'asset_id')::uuid,(v_item->>'source_version_id')::uuid,v_position,(v_item->>'variant_id')::uuid,(v_item->>'version_id')::uuid,(v_item->>'harmonization_id')::uuid,(v_item->>'command_id')::uuid,p_actor);
    v_position := v_position + 1;
  end loop;
  return v_id;
end $$;
revoke all on function public.create_harmonize_batch(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_harmonize_batch(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,uuid,uuid) to service_role;

create or replace function public.claim_harmonize_batch(p_batch uuid, p_lease uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_batch public.harmonize_batches;
begin
  select * into v_batch from public.harmonize_batches where id = p_batch for update;
  if not found or v_batch.status <> 'running' or v_batch.lease_until > now() then return null; end if;
  -- Never replay a possibly charged request after a crashed process. Reconcile durable job receipts.
  update public.harmonize_batch_items i set result = j.params->'result', status = 'ready' from public.generation_jobs j where i.batch_id = p_batch and i.status = 'generating' and j.id = i.job_id and j.status = 'done' and j.params->'result' is not null;
  update public.harmonize_batch_items set status = 'failed', retryable = false, error = 'The generation was interrupted with an unknown result. Do not regenerate until the provider result is reconciled.' where batch_id = p_batch and status = 'generating';
  update public.harmonize_batches set lease_token = p_lease, lease_until = now() + interval '10 minutes' where id = p_batch returning * into v_batch;
  return to_jsonb(v_batch);
end $$;
revoke all on function public.claim_harmonize_batch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_harmonize_batch(uuid,uuid) to service_role;

create or replace function public.complete_harmonize_batch_item(p_item uuid, p_lease uuid, p_command jsonb, p_inverse jsonb, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item public.harmonize_batch_items; v_batch public.harmonize_batches; v_result jsonb;
begin
  select * into v_item from public.harmonize_batch_items where id = p_item;
  if not found then raise exception 'Missing item'; end if;
  select * into v_batch from public.harmonize_batches where id = v_item.batch_id for update;
  select * into v_item from public.harmonize_batch_items where id = p_item for update;
  if v_item.status = 'done' then return jsonb_build_object('ok',true); end if;
  if v_batch.status <> 'running' or v_batch.lease_token is distinct from p_lease or v_batch.lease_until <= now() or v_item.status <> 'ready' then raise exception 'Invalid lease' using errcode = '42501'; end if;
  if p_command->>'type' <> 'ApplyHarmonizedImage' or (p_command->>'versionId')::uuid <> v_item.version_id or (p_command->>'variantId')::uuid <> v_item.variant_id or (p_command->>'harmonizationId')::uuid <> v_item.harmonization_id or (p_command->'fields'->>'sourceVersionId')::uuid is distinct from v_item.source_version_id or (p_command->'newVariant'->>'assetId')::uuid is distinct from v_item.asset_id or coalesce(p_command->'fields'->>'use','') <> 'variant' then raise exception 'Invalid command' using errcode = '22023'; end if;
  if not exists(select 1 from public.change_log where id = v_item.command_id and project_id = v_item.project_id) then
    v_result := public.apply_changes(v_item.project_id, v_batch.created_by, v_item.command_id, p_command, p_inverse, p_changes);
  end if;
  update public.harmonize_batch_items set status = 'done', error = null, retryable = false where id = p_item;
  return coalesce(v_result, jsonb_build_object('ok',true));
end $$;
revoke all on function public.complete_harmonize_batch_item(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_harmonize_batch_item(uuid,uuid,jsonb,jsonb,jsonb) to service_role;

create or replace function public.transition_harmonize_batch_item(p_item uuid, p_lease uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_item public.harmonize_batch_items; v_batch public.harmonize_batches;
begin
  select * into v_item from public.harmonize_batch_items where id = p_item;
  if not found then raise exception 'Missing item'; end if;
  select * into v_batch from public.harmonize_batches where id = v_item.batch_id for update;
  select * into v_item from public.harmonize_batch_items where id = p_item for update;
  if v_batch.status <> 'running' or v_batch.lease_token is distinct from p_lease or v_batch.lease_until <= now() or v_item.status not in ('waiting','generating','ready') then raise exception 'Invalid lease' using errcode = '42501'; end if;
  if p_patch->>'status' not in ('generating','ready','failed','skipped') then raise exception 'Invalid transition'; end if;
  update public.harmonize_batch_items set status = p_patch->>'status', attempts = coalesce((p_patch->>'attempts')::integer, attempts), result = coalesce(p_patch->'result', result), error = p_patch->>'error', retryable = coalesce((p_patch->>'retryable')::boolean, retryable) where id = p_item;
  update public.harmonize_batches set lease_until = now() + interval '10 minutes' where id = v_batch.id;
end $$;
revoke all on function public.transition_harmonize_batch_item(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.transition_harmonize_batch_item(uuid,uuid,jsonb) to service_role;

create or replace function public.resume_harmonize_batch(p_project uuid, p_batch uuid, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_batch public.harmonize_batches;
begin
  if private.member_role_rank(p_project,p_actor) < private.role_rank('editor') then raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into v_batch from public.harmonize_batches where id = p_batch and project_id = p_project for update;
  if not found or v_batch.lease_until > now() then raise exception 'Job is busy or missing'; end if;
  if v_batch.access_blocked then raise exception 'Provider access must be restored before starting fresh work' using errcode = '42501'; end if;
  if private.member_role_rank(p_project,v_batch.created_by) < private.role_rank('editor') then raise exception 'Owner editing permission removed' using errcode = '42501'; end if;
  update public.harmonize_batch_items set status = 'waiting', error = null where batch_id = p_batch and status = 'failed' and retryable and attempts < 10;
  update public.generation_jobs j set status = 'queued', error = null from public.harmonize_batch_items i where i.batch_id = p_batch and i.job_id = j.id and i.status = 'waiting';
  update public.harmonize_batches set status = 'running', pause_reason = null where id = p_batch;
end $$;
revoke all on function public.resume_harmonize_batch(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.resume_harmonize_batch(uuid,uuid,uuid) to service_role;

-- Gjenopptak etter leverandørblokk: brukeren har bekreftet på nytt og serveren har kontrollert nøkkelen.
create or replace function public.reconfirm_harmonize_batch(p_project uuid, p_batch uuid, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_batch public.harmonize_batches;
begin
  if private.member_role_rank(p_project,p_actor) < private.role_rank('editor') then raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into v_batch from public.harmonize_batches where id = p_batch and project_id = p_project for update;
  if not found or v_batch.lease_until > now() then raise exception 'Job is busy or missing'; end if;
  if private.member_role_rank(p_project,v_batch.created_by) < private.role_rank('editor') then raise exception 'Owner editing permission removed' using errcode = '42501'; end if;
  update public.harmonize_batch_items set status = 'waiting', error = null where batch_id = p_batch and status = 'failed' and retryable and attempts < 10;
  update public.generation_jobs j set status = 'queued', error = null from public.harmonize_batch_items i where i.batch_id = p_batch and i.job_id = j.id and i.status = 'waiting';
  update public.harmonize_batches set status = 'running', pause_reason = null, access_blocked = false where id = p_batch;
end $$;
revoke all on function public.reconfirm_harmonize_batch(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.reconfirm_harmonize_batch(uuid,uuid,uuid) to service_role;

insert into public.schema_version(version,description) values (65,'0065_style_harmonization: P8 stilharmonisering – metadata, foretrukne referanser og varig massejobb');
