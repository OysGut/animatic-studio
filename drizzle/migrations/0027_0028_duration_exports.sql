-- =====================================================================================
-- Animatic Studio – migrasjon 0028: lagrede varighetsestimater, antakelser per prosjekt og eksportlogg (DEC-0078).
-- 1. projects.duration_assumptions: antakelsene for varighetsestimatet (taletempo m.m.) for hele prosjektet,
--    så de overlever ny innlasting og er felles for alle medlemmer (KI-28). null = standardverdiene.
--    Settes via apply_changes (kommandoen SetDurationAssumptions) med revisjonskontroll.
-- 2. duration_estimates: lagrede øyeblikksbilder av varighetsestimatet for en produksjon (REQ-0120): bare
--    manusestimat, 2D-scenenes lengder, planlagte lengder, bekreftet lengde og antakelsene som ble brukt, med
--    tidspunkt og (valgfritt) manusversjonen de gjelder. Uforanderlige (INV-13). Skrives med
--    save_duration_estimate (redaktør eller eier), som manusversjoner (create_script_version).
-- 3. export_records: én rad per fullført eksport (REQ-0037 «eksportversjon»): produksjon, type
--    (film/manus/lyd/undertekster/plakat), innstillinger, filnavn, scenene som var med, hvem og når.
--    Uforanderlige (INV-13). Skrives med record_export av alle aktive medlemmer (eksport er lesing).
-- 4. apply_changes: som 0021, med projects.duration_assumptions. Ingen nye tabeller i apply_changes; de nye
--    tabellene slettes sammen med produksjonen (on delete cascade) når et prosjekt slettes, så
--    delete_project og purge_project_assets er uendret.
-- Ingen SQL mot lagringen (storage). Ingen eksisterende data endres.
-- Kjøres ÉN gang i Lovable Cloud etter 0027. Endres aldri etter kjøring.
-- =====================================================================================

-- Gyldige antakelser: et objekt med de fire tallene (grensene i appen er strengere, se duration.ts)
create or replace function private.valid_duration_assumptions(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
    and pg_column_size(p) <= 2000
    and coalesce((
      select bool_and(jsonb_typeof(p -> k) = 'number' and (p ->> k)::numeric between 0 and 1000)
      from unnest(array['dialogueWordsPerMinute', 'actionSecondsPerLine', 'headingSeconds', 'minSceneSeconds']) k
    ), false)
$$;
revoke all on function private.valid_duration_assumptions(jsonb) from public;

-- ---------- 1. Antakelser per prosjekt (KI-28) ----------
alter table public.projects add column if not exists duration_assumptions jsonb
  check (duration_assumptions is null or private.valid_duration_assumptions(duration_assumptions));

-- ---------- 2. Lagrede varighetsestimater (REQ-0120) ----------
create table public.duration_estimates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  production_id uuid not null references public.productions (id) on delete cascade,
  -- Manusversjonen estimatet gjelder (null = lagret fra oversikten uten en uendret versjon)
  script_version_id uuid references public.script_versions (id) on delete cascade,
  assumptions jsonb not null check (private.valid_duration_assumptions(assumptions)),
  -- Format 1 (src/core/screenplay/duration-snapshot.ts): summer og én rad per scene
  estimate jsonb not null check (
    jsonb_typeof(estimate) = 'object' and estimate ->> 'format' = '1'
    and jsonb_typeof(estimate -> 'scenes') = 'array' and pg_column_size(estimate) <= 500000),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id)
);
create index duration_estimates_production_idx on public.duration_estimates (production_id, created_at desc);
create index duration_estimates_project_idx on public.duration_estimates (project_id);
create index duration_estimates_version_idx on public.duration_estimates (script_version_id);
alter table public.duration_estimates enable row level security;
create policy duration_estimates_read on public.duration_estimates for select to authenticated
  using (private.is_project_member(project_id));
revoke insert, update, delete, truncate on public.duration_estimates from anon, authenticated;
grant select on public.duration_estimates to authenticated;
-- Lagrede estimater endres aldri (REQ-0120, INV-13); de slettes bare med prosjektet
create trigger duration_estimates_immutable before update or delete on public.duration_estimates
  for each row execute function private.protect_history();

create or replace function public.save_duration_estimate(
  p_project uuid, p_production uuid, p_assumptions jsonb, p_estimate jsonb, p_script_version uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_version uuid := p_script_version;
  v_latest record;
  v_last_change uuid;
begin
  if not private.has_project_role(p_project, 'editor') then
    raise exception 'Du har ikke skriverett i prosjektet' using errcode = '42501';
  end if;
  if not exists (select 1 from public.productions where id = p_production and project_id = p_project) then
    raise exception 'Produksjonen tilhører ikke prosjektet' using errcode = '22023';
  end if;
  if p_assumptions is null or not private.valid_duration_assumptions(p_assumptions) then
    raise exception 'Ugyldige antakelser' using errcode = '22023';
  end if;
  select id, based_on_change_id into v_latest from public.script_versions
    where production_id = p_production order by number desc limit 1;
  if v_version is not null then
    -- Bare den nyeste versjonen (estimatet lages rett etter at versjonen er lagret)
    if v_latest.id is distinct from v_version then
      raise exception 'Estimatet kan bare knyttes til den nyeste manusversjonen' using errcode = '22023';
    end if;
  elsif v_latest.id is not null then
    -- Lagret fra oversikten: knyttes til den nyeste versjonen bare når ingenting er endret siden den
    select c.id into v_last_change from public.change_log c
      where c.project_id = p_project order by c.seq desc limit 1;
    if v_last_change is not distinct from v_latest.based_on_change_id then
      v_version := v_latest.id;
    end if;
  end if;
  insert into public.duration_estimates (id, project_id, production_id, script_version_id, assumptions, estimate, created_by)
    values (v_id, p_project, p_production, v_version, p_assumptions, p_estimate, (select auth.uid()));
  return jsonb_build_object('id', v_id, 'script_version_id', v_version);
end $$;
revoke all on function public.save_duration_estimate(uuid, uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.save_duration_estimate(uuid, uuid, jsonb, jsonb, uuid) to authenticated;

-- ---------- 3. Eksportlogg (REQ-0037 «eksportversjon») ----------
create table public.export_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  production_id uuid not null references public.productions (id) on delete cascade,
  kind text not null check (kind in ('film', 'script', 'audio', 'subtitles', 'poster')),
  file_name text not null check (length(btrim(file_name)) between 1 and 300),
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 8000),
  -- Sceneforekomstene som var med (tom = ingen bestemte scener, f.eks. en plakat)
  occurrence_ids uuid[] not null default '{}' check (cardinality(occurrence_ids) <= 5000),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id)
);
create index export_records_production_idx on public.export_records (production_id, created_at desc);
create index export_records_project_idx on public.export_records (project_id);
alter table public.export_records enable row level security;
create policy export_records_read on public.export_records for select to authenticated
  using (private.is_project_member(project_id));
revoke insert, update, delete, truncate on public.export_records from anon, authenticated;
grant select on public.export_records to authenticated;
create trigger export_records_immutable before update or delete on public.export_records
  for each row execute function private.protect_history();

create or replace function public.record_export(
  p_project uuid, p_production uuid, p_kind text, p_file_name text, p_settings jsonb, p_occurrence_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
begin
  -- Alle aktive medlemmer kan eksportere (lesing); slettede prosjekter gir rang 0
  if not private.has_project_role(p_project, 'viewer') then
    raise exception 'Du er ikke medlem av prosjektet' using errcode = '42501';
  end if;
  if not exists (select 1 from public.productions where id = p_production and project_id = p_project) then
    raise exception 'Produksjonen tilhører ikke prosjektet' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_occurrence_ids, '{}')) x(id)
    where not exists (select 1 from public.scene_occurrences o where o.id = x.id and o.production_id = p_production)
  ) then
    raise exception 'Scenene hører ikke til produksjonen' using errcode = '22023';
  end if;
  insert into public.export_records (id, project_id, production_id, kind, file_name, settings, occurrence_ids, created_by)
    values (v_id, p_project, p_production, p_kind, btrim(p_file_name), coalesce(p_settings, '{}'::jsonb),
            coalesce(p_occurrence_ids, '{}'), (select auth.uid()));
  return v_id;
end $$;
revoke all on function public.record_export(uuid, uuid, text, text, jsonb, uuid[]) from public, anon;
grant execute on function public.record_export(uuid, uuid, text, text, jsonb, uuid[]) to authenticated;

-- ---------- 4. apply_changes: som 0021, med antakelsene for varighetsestimatet ----------
create or replace function public.apply_changes(
  p_project uuid, p_actor uuid, p_command_id uuid, p_command jsonb, p_inverse jsonb, p_changes jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tables text[] := array['productions','scenes','scene_variants','script_blocks','scene_occurrences','production_segments','takes',
                           'assets','asset_variants','asset_versions','script_annotations',
                           'compositions','composition_layers','audio_clips','clip_parts','time_links','generation_prompts',
                           'continuity_events','translations','asset_relations','posters','style_profiles'];
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
  foreach v_t in array array['style_profiles','posters','asset_relations','translations','continuity_events','generation_prompts','time_links','clip_parts','audio_clips','composition_layers','compositions','script_annotations','asset_versions','asset_variants','assets',
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
  values (28, '0028_duration_exports: lagrede varighetsestimater, antakelser per prosjekt og eksportlogg');