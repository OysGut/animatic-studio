-- =====================================================================================
-- From Pen to Glass (repo: Animatic Studio) – migrasjon 0099: G-7 robust lagring.
-- Ny fil; 0098 og eldre er låst. Claude gjennomgår og kjører i Cloud. Kjøres ÉN gang etter 0098.
--
-- public.apply_changes deles i en liten kjerne og egne valideringsfunksjoner per domene:
--   * Kjernen (uendret signatur og rettigheter) står for autorisasjon, prosjektlås,
--     revisjonskontroll, innsetting/oppdatering/sletting via private.table_columns,
--     teksthistorikk, sceneIds og change_log. Den kjenner ingen valideringsregler.
--   * Valideringene (0064 linjekoblinger, 0065 harmonisering/foretrukne referanser,
--     0066/0067 språkversjonsomfang, REQ-0144 én foretrukket referanse, PTG4 munnsett/-spor,
--     M8 aktiv kvalitetsprofil) flyttes ordrett til private.validate_*/private.prepare_*
--     og registreres i private.apply_change_validators. Kjernen slår opp registeret og
--     kaller funksjonene – nye tabeller får egen funksjon + register-rad, og kjernen
--     endres ikke (regel i docs/agents/APPLY_CHANGES.md).
--   * prepare_* kjøres FØR skriving og finner radene i dette kallet hvis referanser
--     endres (sammenligning mot tilstanden før endringen); validate_* kjøres etter
--     skriving med akkurat de id-ene. Dette bevarer 0064/0065-regelen om at rader med
--     uendrede referanser (avvis, angre) aldri blokkeres.
--   * table_name null = valideringen kjøres ved hver endring (REQ-0144 og aktiv
--     kvalitetsprofil er prosjektvider og kjørte ved hvert kall også før 0099).
-- Oppførselen er nøyaktig den samme: samme feilkoder, samme meldinger, samme rekkefølge
-- (sort_order tilsvarer den gamle rekkefølgen i funksjonskroppen).
-- Alle security definer-funksjoner har set search_path = ''. Ingen SQL mot storage.
-- =====================================================================================

-- ---------- 1. Register over valideringer ----------
create table private.apply_change_validators (
  table_name text,                 -- null = kjøres ved hver endring
  validator regproc not null,      -- (p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
  preparer regproc,                -- (p_project uuid, p_changes jsonb) returns uuid[]; kjøres før skriving
  sort_order integer not null default 100
);
create unique index apply_change_validators_key
  on private.apply_change_validators (validator, coalesce(table_name, ''));

-- Kjernen kjører som eieren og trenger ikke rettigheter, men serverrollen skal kunne
-- registrere valideringer for nye tabeller uten å endre kjernen.
grant usage on schema private to service_role;
grant select, insert on private.apply_change_validators to service_role;

-- ---------- 2. Valideringsfunksjoner (flyttet ordrett fra public.apply_changes i 0090) ----------

-- 0064: linjekoblinger å validere: nye rader, og endrede rader hvis scene-, språk- eller
-- linjereferanser endres. Uendrede referanser (avvis, angre av en foreldet kobling) blokkeres aldri.
create or replace function private.prepare_translation_line_links(p_project uuid, p_changes jsonb) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(id), '{}'::uuid[]) from (
    select (r ->> 'id')::uuid as id from jsonb_array_elements(coalesce(p_changes -> 'inserts' -> 'translation_line_links','[]'::jsonb)) r
    union all
    select (r ->> 'id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'updates' -> 'translation_line_links','[]'::jsonb)) r
      where not exists(select 1 from public.translation_line_links o where o.id=(r ->> 'id')::uuid and o.project_id=p_project
        and o.variant_id::text = r ->> 'variant_id' and o.language = r ->> 'language'
        and to_jsonb(o.source_block_ids) = r -> 'source_block_ids' and to_jsonb(o.target_translation_ids) = r -> 'target_translation_ids')
  ) x
$$;

create or replace function private.validate_translation_line_links(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  -- 0064: validate only line links inserted, or updated with changed references, in this call. Links that later point at
  -- removed or moved lines are reported as stale by the core and never block other commands.
  if exists(select 1 from public.translation_line_links l
    where l.project_id=p_project and not l.removed
      and l.id = any(p_ids)
      and (
        exists(select 1 from unnest(l.source_block_ids) as s(block_id) where not exists(select 1 from public.script_blocks b where b.id=s.block_id and b.project_id=p_project and b.variant_id=l.variant_id and not b.removed))
        or exists(select 1 from unnest(l.target_translation_ids) as tt(translation_id) where not exists(select 1 from public.translations t join public.script_blocks b on b.id=t.block_id where t.id=tt.translation_id and t.project_id=p_project and b.project_id=p_project and b.variant_id=l.variant_id and t.language=l.language and not t.removed and not b.removed)
          and not exists(select 1 from public.translation_lines u where u.id=tt.translation_id and u.project_id=p_project and u.variant_id=l.variant_id and u.language=l.language and not u.removed))
        or cardinality(l.source_block_ids) <> (select count(distinct x) from unnest(l.source_block_ids) x)
        or cardinality(l.target_translation_ids) <> (select count(distinct x) from unnest(l.target_translation_ids) x)
      )) then raise exception 'Invalid line link scope' using errcode='22023'; end if;
end $$;

-- 0065: harmoniseringer å validere: nye rader, og endrede rader hvis referansene endres.
create or replace function private.prepare_style_harmonizations(p_project uuid, p_changes jsonb) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(id), '{}'::uuid[]) from (
    select (r ->> 'id')::uuid as id from jsonb_array_elements(coalesce(p_changes -> 'inserts' -> 'style_harmonizations','[]'::jsonb)) r
    union all
    select (r ->> 'id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'updates' -> 'style_harmonizations','[]'::jsonb)) r
      where not exists(select 1 from public.style_harmonizations o where o.id=(r ->> 'id')::uuid and o.project_id=p_project
        and o.version_id::text = r ->> 'version_id' and o.source_version_id::text = r ->> 'source_version_id'
        and o.style_profile_id::text is not distinct from r ->> 'style_profile_id' and o.reference_version_id::text is not distinct from r ->> 'reference_version_id')
  ) x
$$;

create or replace function private.validate_style_harmonizations(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  -- 0065: validate only harmonizations inserted, or updated with changed references, in this call.
  if exists(select 1 from public.style_harmonizations h
    where h.project_id=p_project and not h.removed and h.id = any(p_ids)
      and (not exists(select 1 from public.asset_versions v where v.id=h.version_id and v.project_id=p_project and v.mime_type like 'image/%')
        or not exists(select 1 from public.asset_versions v where v.id=h.source_version_id and v.project_id=p_project and v.mime_type like 'image/%')
        or (h.style_profile_id is not null and not exists(select 1 from public.style_profiles p where p.id=h.style_profile_id and p.project_id=p_project and not p.removed))
        or (h.reference_version_id is not null and not exists(select 1 from public.asset_versions v where v.id=h.reference_version_id and v.project_id=p_project and v.mime_type like 'image/%')))) then
    raise exception 'Invalid harmonization' using errcode='22023'; end if;
end $$;

-- 0065: foretrukne referanser å validere: nye rader, og endrede rader hvis referansene endres.
create or replace function private.prepare_style_preferred_references(p_project uuid, p_changes jsonb) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(id), '{}'::uuid[]) from (
    select (r ->> 'id')::uuid as id from jsonb_array_elements(coalesce(p_changes -> 'inserts' -> 'style_preferred_references','[]'::jsonb)) r
    union all
    select (r ->> 'id')::uuid from jsonb_array_elements(coalesce(p_changes -> 'updates' -> 'style_preferred_references','[]'::jsonb)) r
      where not exists(select 1 from public.style_preferred_references o where o.id=(r ->> 'id')::uuid and o.project_id=p_project
        and o.asset_id::text = r ->> 'asset_id' and o.style_profile_id::text = r ->> 'style_profile_id' and o.variant_id::text = r ->> 'variant_id')
  ) x
$$;

create or replace function private.validate_style_preferred_references(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  -- 0065: validate only preferred references inserted, or updated with changed references, in this call.
  if exists(select 1 from public.style_preferred_references r
    where r.project_id=p_project and not r.removed and r.id = any(p_ids)
      and (not exists(select 1 from public.assets a where a.id=r.asset_id and a.project_id=p_project and not a.removed)
        or not exists(select 1 from public.style_profiles p where p.id=r.style_profile_id and p.project_id=p_project and not p.removed)
        or not exists(select 1 from public.asset_variants va where va.id=r.variant_id and va.project_id=p_project and va.asset_id=r.asset_id))) then
    raise exception 'Invalid preferred reference' using errcode='22023'; end if;
end $$;

-- 0066 (ML3) / 0067: språkversjonsomfang for oversettelser, linjer og koblinger.
create or replace function private.validate_language_scope(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_lang_changed uuid[];
  v_lang_ids uuid[];
  v_link_scope uuid[];
begin
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
end $$;

-- REQ-0144: nøyaktig én aktiv foretrukket referanse per (ressurs, stilprofil). Prosjektvid regel;
-- den kjørte ved hvert kall også før 0099 (table_name null i registeret).
create or replace function private.validate_preferred_reference_unique(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  -- REQ-0144: nøyaktig én aktiv foretrukket referanse per (ressurs, stilprofil)
  if exists(select r.asset_id, r.style_profile_id from public.style_preferred_references r
    where r.project_id=p_project and not r.removed group by r.asset_id, r.style_profile_id having count(*) > 1) then
    raise exception 'More than one preferred reference' using errcode='22023'; end if;
end $$;

-- PTG4: validate changed mouth rows after grouped insert/update; never mutate source receipts.
create or replace function private.validate_mouth_sets(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists(select 1 from public.mouth_sets m where m.project_id=p_project
    and m.id in (select (r->>'id')::uuid from jsonb_array_elements(coalesce(p_changes->'inserts'->'mouth_sets','[]'::jsonb)||coalesce(p_changes->'updates'->'mouth_sets','[]'::jsonb)) r)
    and (not exists(select 1 from public.assets a where a.id=m.character_id and a.project_id=p_project)
       or exists(select 1 from jsonb_each_text(m.variants) v where v.value is not null and not exists(select 1 from public.asset_variants av where av.id::text=v.value and av.project_id=p_project and av.asset_id=m.character_id)))) then
    raise exception 'Invalid mouth set scope' using errcode='22023'; end if;
end $$;

create or replace function private.validate_mouth_tracks(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists(select 1 from public.mouth_tracks m where m.project_id=p_project
    and m.id in (select (r->>'id')::uuid from jsonb_array_elements(coalesce(p_changes->'inserts'->'mouth_tracks','[]'::jsonb)||coalesce(p_changes->'updates'->'mouth_tracks','[]'::jsonb)) r)
    and (not exists(select 1 from public.mouth_sets ms where ms.id=m.set_id and ms.project_id=p_project and ms.character_id=m.character_id)
      or not exists(select 1 from public.scene_occurrences o where o.id=m.occurrence_id and o.project_id=p_project)
      or not exists(select 1 from public.audio_clips c where c.id=m.clip_id and c.project_id=p_project and c.occurrence_id=m.occurrence_id and c.block_id=m.block_id)
      or not exists(select 1 from public.script_blocks b where b.id=m.block_id and b.project_id=p_project))) then
    raise exception 'Invalid mouth track scope' using errcode='22023'; end if;
end $$;

-- M8 (0063): aktiv kvalitetsprofil må finnes i prosjektet. Prosjektvid regel; den kjørte ved
-- hvert kall også før 0099 (table_name null i registeret).
create or replace function private.validate_active_quality_profile(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists(select 1 from public.projects p where p.id=p_project and p.active_quality_profile_id is not null
    and not exists(select 1 from public.quality_profiles q where q.id=p.active_quality_profile_id and q.project_id=p_project and not q.removed)) then
    raise exception 'Invalid active quality profile' using errcode='22023';
  end if;
end $$;

-- ---------- 3. Register-radene (samme rekkefølge som i den gamle funksjonskroppen) ----------
insert into private.apply_change_validators (table_name, validator, preparer, sort_order) values
  ('translation_line_links', 'private.validate_translation_line_links'::regproc, 'private.prepare_translation_line_links'::regproc, 10),
  ('style_harmonizations', 'private.validate_style_harmonizations'::regproc, 'private.prepare_style_harmonizations'::regproc, 20),
  ('style_preferred_references', 'private.validate_style_preferred_references'::regproc, 'private.prepare_style_preferred_references'::regproc, 30),
  ('translations', 'private.validate_language_scope'::regproc, null, 40),
  ('translation_lines', 'private.validate_language_scope'::regproc, null, 40),
  ('translation_line_links', 'private.validate_language_scope'::regproc, null, 40),
  (null, 'private.validate_preferred_reference_unique'::regproc, null, 50),
  ('mouth_sets', 'private.validate_mouth_sets'::regproc, null, 60),
  ('mouth_tracks', 'private.validate_mouth_tracks'::regproc, null, 70),
  (null, 'private.validate_active_quality_profile'::regproc, null, 80);

-- ---------- 4. Kjernen: samme signatur og rettigheter, uten valideringsregler ----------
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
  (99, '0099_g7_apply_changes_core: apply_changes delt i kjerne + registrerte valideringsfunksjoner (private.apply_change_validators)');
