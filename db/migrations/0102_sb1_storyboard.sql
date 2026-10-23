-- =====================================================================================
-- From Pen to Glass – migrasjon 0102: SB-1 Storyboard Studio, datamodell og grunnmur (fase 5).
-- 1. compositions får kind ('scene'|'storyboard'), occurrence_id, order_key, active og hidden.
--    Et storyboardpanel ER en komposisjon (samme lag, kamera, keyframes) – ingen egen panelmodell.
--    Unikhetsregelen «én aktiv komposisjon per variant» gjelder bare scene-komposisjoner.
-- 2. composition_layers får lagtypene note, arrow og camera_mark (bare tillatt i storyboard-
--    komposisjoner; koblingen håndheves av validatoren under) med egne jsonb-kolonner (G-5-tak).
-- 3. Nye tabeller: storyboard_panel_blocks (panelets forankring i manusblokker, ordnet),
--    production_statuses + production_status_events (status per fagområde med historikk) og
--    storyboard_panel_snapshots (bevarte panelrevisjoner ved redigering etter godkjenning).
-- 4. Validering registreres i private.apply_change_validators (G-7); kjernen endres ikke.
-- 5. apply_changes, delete_project, purge_project_assets, purge_removed_assets og
--    project_snapshot kopiert ordrett fra siste definisjon, kun utvidet med de nye tabellene.
-- Ingen eksisterende data endres. Ingen paneler opprettes. Kjøres ÉN gang i Lovable Cloud
-- etter 0101. Endres aldri etter kjøring.
-- =====================================================================================

-- ---------- 1. compositions blir også storyboardpaneler ----------
alter table public.compositions
  add column if not exists kind text not null default 'scene',
  add column if not exists occurrence_id uuid references public.scene_occurrences (id) on delete restrict,
  add column if not exists order_key text,
  add column if not exists active boolean not null default true,
  add column if not exists hidden boolean not null default false;
alter table public.compositions add constraint compositions_kind_check
  check (kind in ('scene', 'storyboard'));
-- Et panel er knyttet til én sceneforekomst og har plass i scenens panelrekkefølge
alter table public.compositions add constraint compositions_panel_check
  check ((kind = 'scene' and occurrence_id is null and order_key is null)
      or (kind = 'storyboard' and occurrence_id is not null and order_key is not null));
alter table public.compositions add constraint compositions_panel_order_key_check
  check (order_key is null or (order_key ~ '^[0-9a-z]+$' and right(order_key, 1) <> '0'));
-- «Én aktiv komposisjon per variant» gjelder fortsatt bare vanlige 2D-scener
drop index if exists public.compositions_one_active_per_variant;
create unique index compositions_one_active_per_variant
  on public.compositions (variant_id) where not removed and kind = 'scene';
create index compositions_storyboard_occurrence_idx
  on public.compositions (occurrence_id) where kind = 'storyboard' and not removed;

-- ---------- 2. Storyboard-lagtyper ----------
alter table public.composition_layers drop constraint if exists composition_layers_kind_check;
alter table public.composition_layers add constraint composition_layers_kind_check
  check (kind in ('background','midground','foreground','character','object','effect','other','group','text','page','note','arrow','camera_mark'));
-- note: visuell lapp / reginotat / kamerainstruksjon (fri farge, valgfri forankring, «behandlet»)
alter table public.composition_layers add column if not exists note jsonb
  check (note is null or (jsonb_typeof(note) = 'object' and octet_length(note::text) <= 16384));
-- arrow: punkter eller bane med form, tykkelse, farge og kategori
alter table public.composition_layers add column if not exists arrow jsonb
  check (arrow is null or (jsonb_typeof(arrow) = 'object' and octet_length(arrow::text) <= 65536));
-- camera_mark: ramme, zoom, pan og tilt som instruksjon
alter table public.composition_layers add column if not exists camera_mark jsonb
  check (camera_mark is null or (jsonb_typeof(camera_mark) = 'object' and octet_length(camera_mark::text) <= 4096));
alter table public.composition_layers drop constraint if exists composition_layers_shows_something;
alter table public.composition_layers add constraint composition_layers_shows_something
  check (kind in ('group','page','note','arrow','camera_mark') or (kind = 'text' and text_spec is not null) or asset_id is not null or fill is not null);
alter table public.composition_layers add constraint composition_layers_note_check
  check ((note is null) or kind = 'note');
alter table public.composition_layers add constraint composition_layers_arrow_check
  check ((arrow is null) or kind = 'arrow');
alter table public.composition_layers add constraint composition_layers_camera_mark_check
  check ((camera_mark is null) or kind = 'camera_mark');

-- ---------- 3. Nye tabeller ----------
-- Panelets forankring i manuset: én rad per blokk, ordnet innen panelet
create table public.storyboard_panel_blocks (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete restrict,
  panel_id uuid not null references public.compositions (id) on delete restrict,
  block_id uuid not null references public.script_blocks (id) on delete restrict,
  order_key text not null check (order_key ~ '^[0-9a-z]+$' and right(order_key, 1) <> '0'),
  removed boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  created_by uuid
);
create index storyboard_panel_blocks_panel_idx on public.storyboard_panel_blocks (panel_id);
create index storyboard_panel_blocks_project_idx on public.storyboard_panel_blocks (project_id);

-- Status per fagområde (script, storyboard, animation, sound, film) per sceneforekomst eller panel.
-- Nåværende status på raden; hver overgang lager en historikkrad (tidligere godkjenninger bevares).
create table public.production_statuses (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete restrict,
  area text not null check (area in ('script','storyboard','animation','sound','film')),
  occurrence_id uuid references public.scene_occurrences (id) on delete restrict,
  composition_id uuid references public.compositions (id) on delete restrict,
  status text not null check (status in ('not_started','in_progress','review','changes_requested','done')),
  removed boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  -- Nøyaktig ett mål: enten en sceneforekomst eller et panel
  check ((occurrence_id is null) <> (composition_id is null))
);
create unique index production_statuses_target_idx on public.production_statuses
  (project_id, area, coalesce(occurrence_id, composition_id)) where not removed;
create index production_statuses_project_idx on public.production_statuses (project_id);

create table public.production_status_events (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete restrict,
  status_id uuid not null references public.production_statuses (id) on delete restrict,
  area text not null check (area in ('script','storyboard','animation','sound','film')),
  occurrence_id uuid references public.scene_occurrences (id) on delete restrict,
  composition_id uuid references public.compositions (id) on delete restrict,
  status text not null check (status in ('not_started','in_progress','review','changes_requested','done')),
  removed boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  check ((occurrence_id is null) <> (composition_id is null))
);
create index production_status_events_status_idx on public.production_status_events (status_id);
create index production_status_events_project_idx on public.production_status_events (project_id);

-- Bevart panelrevisjon: «Rediger storyboard» etter godkjenning lagrer panelet (komposisjon,
-- lag og blokkforankring) som uforanderlig json før redigeringen fortsetter på panelet selv.
create table public.storyboard_panel_snapshots (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete restrict,
  panel_id uuid not null references public.compositions (id) on delete restrict,
  panel_revision integer not null check (panel_revision > 0),
  snapshot jsonb not null
    check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 8388608),
  removed boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  created_by uuid
);
create index storyboard_panel_snapshots_panel_idx on public.storyboard_panel_snapshots (panel_id);
create index storyboard_panel_snapshots_project_idx on public.storyboard_panel_snapshots (project_id);

-- Bare lesing for medlemmer; all skriving via apply_changes
do $$
declare t text;
begin
  foreach t in array array['storyboard_panel_blocks','production_statuses','production_status_events','storyboard_panel_snapshots'] loop
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((project_id in (select private.my_project_ids())))', t || '_read', t);
  end loop;
end $$;

-- ---------- 4. Valideringsfunksjoner (registreres i private.apply_change_validators, G-7) ----------
-- Et storyboardpanel peker på en forekomst i samme prosjekt med samme variant
create or replace function private.validate_storyboard_panels(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.compositions c
    where c.project_id = p_project and c.kind = 'storyboard'
      and c.id in (select (r ->> 'id')::uuid from jsonb_array_elements(
        coalesce(p_changes -> 'inserts' -> 'compositions', '[]'::jsonb) ||
        coalesce(p_changes -> 'updates' -> 'compositions', '[]'::jsonb)) r)
      and (c.occurrence_id is null or c.order_key is null
        or not exists (select 1 from public.scene_occurrences o
          where o.id = c.occurrence_id and o.project_id = p_project and o.variant_id = c.variant_id))
  ) then
    raise exception 'Invalid storyboard panel' using errcode = '22023';
  end if;
end $$;
revoke all on function private.validate_storyboard_panels(uuid, jsonb, uuid[]) from public;

-- note/arrow/camera_mark bare i storyboardkomposisjoner, med riktig jsonb-felt satt
create or replace function private.validate_storyboard_layer_kinds(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.composition_layers l
    join public.compositions c on c.id = l.composition_id and c.project_id = p_project
    where l.project_id = p_project
      and l.id in (select (r ->> 'id')::uuid from jsonb_array_elements(
        coalesce(p_changes -> 'inserts' -> 'composition_layers', '[]'::jsonb) ||
        coalesce(p_changes -> 'updates' -> 'composition_layers', '[]'::jsonb)) r)
      and ((l.kind in ('note','arrow','camera_mark') and c.kind <> 'storyboard')
        or (l.kind = 'note' and l.note is null)
        or (l.kind = 'arrow' and l.arrow is null)
        or (l.kind = 'camera_mark' and l.camera_mark is null)
        or (l.note is not null and l.kind <> 'note')
        or (l.arrow is not null and l.kind <> 'arrow')
        or (l.camera_mark is not null and l.kind <> 'camera_mark'))
  ) then
    raise exception 'Invalid storyboard layer' using errcode = '22023';
  end if;
end $$;
revoke all on function private.validate_storyboard_layer_kinds(uuid, jsonb, uuid[]) from public;

-- Forankring: panelet er et storyboardpanel, blokken finnes i samme prosjekt og samme variant
create or replace function private.validate_storyboard_panel_blocks(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.storyboard_panel_blocks pb
    join public.compositions c on c.id = pb.panel_id and c.project_id = p_project
    where pb.project_id = p_project and not pb.removed
      and pb.id in (select (r ->> 'id')::uuid from jsonb_array_elements(
        coalesce(p_changes -> 'inserts' -> 'storyboard_panel_blocks', '[]'::jsonb) ||
        coalesce(p_changes -> 'updates' -> 'storyboard_panel_blocks', '[]'::jsonb)) r)
      and (c.kind <> 'storyboard'
        or not exists (select 1 from public.script_blocks b
          where b.id = pb.block_id and b.project_id = p_project and b.variant_id = c.variant_id and not b.removed))
  ) then
    raise exception 'Invalid panel block link' using errcode = '22023';
  end if;
end $$;
revoke all on function private.validate_storyboard_panel_blocks(uuid, jsonb, uuid[]) from public;

-- Statusmålet finnes i prosjektet; et panelmål er et storyboardpanel; historikkraden peker på statusraden
create or replace function private.validate_production_statuses(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.production_statuses st
    where st.project_id = p_project
      and st.id in (select (r ->> 'id')::uuid from jsonb_array_elements(
        coalesce(p_changes -> 'inserts' -> 'production_statuses', '[]'::jsonb) ||
        coalesce(p_changes -> 'updates' -> 'production_statuses', '[]'::jsonb)) r)
      and ((st.occurrence_id is not null and not exists (
            select 1 from public.scene_occurrences o where o.id = st.occurrence_id and o.project_id = p_project))
        or (st.composition_id is not null and not exists (
            select 1 from public.compositions c where c.id = st.composition_id and c.project_id = p_project and c.kind = 'storyboard')))
  ) then
    raise exception 'Invalid production status' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.production_status_events e
    where e.project_id = p_project
      and e.id in (select (r ->> 'id')::uuid from jsonb_array_elements(
        coalesce(p_changes -> 'inserts' -> 'production_status_events', '[]'::jsonb) ||
        coalesce(p_changes -> 'updates' -> 'production_status_events', '[]'::jsonb)) r)
      and (not exists (select 1 from public.production_statuses st
            where st.id = e.status_id and st.project_id = p_project)
        or (e.occurrence_id is not null and not exists (
            select 1 from public.scene_occurrences o where o.id = e.occurrence_id and o.project_id = p_project))
        or (e.composition_id is not null and not exists (
            select 1 from public.compositions c where c.id = e.composition_id and c.project_id = p_project and c.kind = 'storyboard')))
  ) then
    raise exception 'Invalid production status event' using errcode = '22023';
  end if;
end $$;
revoke all on function private.validate_production_statuses(uuid, jsonb, uuid[]) from public;

-- ---------- 5. Registrering (G-7); kjernen i apply_changes endres ikke ----------
insert into private.apply_change_validators (table_name, validator, preparer, sort_order) values
  ('compositions', 'private.validate_storyboard_panels'::regproc, null, 90),
  ('composition_layers', 'private.validate_storyboard_layer_kinds'::regproc, null, 91),
  ('storyboard_panel_blocks', 'private.validate_storyboard_panel_blocks'::regproc, null, 92),
  ('production_statuses', 'private.validate_production_statuses'::regproc, null, 93),
  ('production_status_events', 'private.validate_production_statuses'::regproc, null, 94);

-- ---------- 6. apply_changes med de fire nye tabellene (ordrett fra 0099, kun tabellistene utvidet) ----------

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
                           'lipsync_results','animation_patterns','dialogue_reviews','note_flags','quality_profiles','translation_lines','translation_line_links','style_harmonizations','style_preferred_references','mouth_sets','mouth_tracks',
                           'storyboard_panel_blocks','production_statuses','production_status_events','storyboard_panel_snapshots'];
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
  foreach v_t in array array['storyboard_panel_snapshots','storyboard_panel_blocks','production_status_events','production_statuses','mouth_tracks','mouth_sets','style_preferred_references','style_harmonizations','translation_line_links','translation_lines','quality_profiles','note_flags','dialogue_reviews','animation_patterns','lipsync_results','dialogue_versions','story_canvas_edges','story_canvas_nodes','story_facts','story_profile_stages','story_profiles','style_profiles','posters','asset_relations','translations','language_versions','continuity_events','generation_prompts','time_links','clip_parts','audio_clips','animation_uses','print_job_elements','print_jobs','measure_sets','composition_layers','credit_sequences','credit_participants','template_instances','compositions','script_annotations','animation_rig_versions','animation_rigs','asset_versions','asset_variants','assets',
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

-- ---------- 7. delete_project (ordrett fra 0087, kun de fire nye slettingene lagt til) ----------

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
  -- Utstillingsvindu (B-116, 0087): kopierte bidragsfiler under <prosjekt>/shares/
  v_films := v_films || coalesce((select array_agg(storage_key) from public.showcase_items
    where project_id = p_project and storage_key is not null and split_part(storage_key, '/', 1) = p_project::text), '{}');
  v_films := v_films || coalesce((select array_agg(storage_key) from public.showcase_reservations
    where project_id = p_project and storage_key is not null), '{}');

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
  -- Utstillingsvindu (B-116, 0087): kommentarene forsvinner med bidraget (on delete cascade)
  delete from public.showcase_reservations where project_id = p_project;
  delete from public.showcase_items where project_id = p_project;
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
  -- SB-1 (0102): storyboardgrunnmuren før lagene og 2D-scenene (on delete restrict)
  delete from public.storyboard_panel_snapshots where project_id = p_project;
  delete from public.storyboard_panel_blocks where project_id = p_project;
  delete from public.production_status_events where project_id = p_project;
  delete from public.production_statuses where project_id = p_project;
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

-- ---------- 8. purge_project_assets (ordrett fra 0084, kun de fire nye slettingene lagt til) ----------

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
  -- SB-1 (0102): storyboardgrunnmuren før lagene og 2D-scenene (on delete restrict)
  delete from public.storyboard_panel_snapshots where project_id = p_project;
  delete from public.storyboard_panel_blocks where project_id = p_project;
  delete from public.production_status_events where project_id = p_project;
  delete from public.production_statuses where project_id = p_project;
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

-- ---------- 9. purge_removed_assets (ordrett fra 0084, kun vernet mot bevarte panelrevisjoner lagt til) ----------

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
  -- SB-1 (0102): et bilde som ligger i en bevart panelrevisjon (øyeblikksbildet kan gjenopprettes), slettes ikke
  if exists (select 1 from public.storyboard_panel_snapshots sn where sn.project_id = p_project
             and exists (select 1 from unnest(v_versions) x where sn.snapshot::text like '%' || x::text || '%')) then
    raise exception 'Brukes fortsatt i en bevart storyboardrevisjon. Fjern bruken først.' using errcode = '23503';
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

-- ---------- 10. project_snapshot (ordrett fra 0093, kun de fire nye tabellene lagt til) ----------

create or replace function public.project_snapshot(p_project uuid, p_full_history boolean default false) returns json
language sql stable security invoker set search_path = '' as $$
  -- Én spørring = ett konsistent øyeblikksbilde (samme MVCC-snapshot for alle tabeller og log_seq).
  -- SECURITY INVOKER: RLS avgjør hva kalleren ser; en som ikke er medlem, får project = null og tomme lister.
  select json_build_object(
    'format', 1,
    'project', (select row_to_json(p) from public.projects p where p.id = p_project),
    'log_seq', (select coalesce(max(c.project_seq), 0) from public.change_log c where c.project_id = p_project),
    'history', case when p_full_history then 'full' else 'current' end,
    'tables', json_build_array(json_build_object(
    'productions', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.productions x where x.project_id = p_project),
    'scenes', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.scenes x where x.project_id = p_project),
    'scene_variants', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.scene_variants x where x.project_id = p_project),
    'script_blocks', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.script_blocks x where x.project_id = p_project),
    'script_block_revisions', case when p_full_history then (select coalesce(json_agg(x order by x.block_id, x.rev), '[]'::json) from public.script_block_revisions x where x.project_id = p_project)
      else (select coalesce(json_agg(x order by x.block_id, x.rev), '[]'::json) from public.script_block_revisions x
            join public.script_blocks b on b.id = x.block_id and b.current_rev = x.rev where x.project_id = p_project) end,
    'scene_occurrences', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.scene_occurrences x where x.project_id = p_project),
    'production_segments', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.production_segments x where x.project_id = p_project),
    'takes', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.takes x where x.project_id = p_project),
    'assets', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.assets x where x.project_id = p_project),
    'asset_variants', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.asset_variants x where x.project_id = p_project),
    'asset_versions', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.asset_versions x where x.project_id = p_project),
    'script_annotations', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.script_annotations x where x.project_id = p_project),
    'compositions', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.compositions x where x.project_id = p_project),
    'composition_layers', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.composition_layers x where x.project_id = p_project),
    'audio_clips', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.audio_clips x where x.project_id = p_project),
    'clip_parts', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.clip_parts x where x.project_id = p_project),
    'time_links', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.time_links x where x.project_id = p_project),
    'generation_prompts', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.generation_prompts x where x.project_id = p_project),
    'continuity_events', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.continuity_events x where x.project_id = p_project),
    'translations', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.translations x where x.project_id = p_project),
    'asset_relations', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.asset_relations x where x.project_id = p_project),
    'posters', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.posters x where x.project_id = p_project),
    'style_profiles', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.style_profiles x where x.project_id = p_project),
    'story_profiles', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.story_profiles x where x.project_id = p_project),
    'story_profile_stages', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.story_profile_stages x where x.project_id = p_project),
    'story_facts', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.story_facts x where x.project_id = p_project),
    'story_canvas_nodes', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.story_canvas_nodes x where x.project_id = p_project),
    'story_canvas_edges', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.story_canvas_edges x where x.project_id = p_project),
    'template_instances', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.template_instances x where x.project_id = p_project),
    'credit_participants', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.credit_participants x where x.project_id = p_project),
    'credit_sequences', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.credit_sequences x where x.project_id = p_project),
    'animation_rigs', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.animation_rigs x where x.project_id = p_project),
    'animation_rig_versions', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.animation_rig_versions x where x.project_id = p_project),
    'animation_uses', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.animation_uses x where x.project_id = p_project),
    'lipsync_results', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.lipsync_results x where x.project_id = p_project),
    'animation_patterns', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.animation_patterns x where x.project_id = p_project),
    'dialogue_versions', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.dialogue_versions x where x.project_id = p_project),
    'dialogue_reviews', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.dialogue_reviews x where x.project_id = p_project),
    'note_flags', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.note_flags x where x.project_id = p_project),
    'quality_profiles', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.quality_profiles x where x.project_id = p_project)),
  json_build_object(
    'translation_line_links', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.translation_line_links x where x.project_id = p_project),
    'translation_lines', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.translation_lines x where x.project_id = p_project),
    'style_harmonizations', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.style_harmonizations x where x.project_id = p_project),
    'style_preferred_references', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.style_preferred_references x where x.project_id = p_project),
    'language_versions', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.language_versions x where x.project_id = p_project),
    'rig_templates', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.rig_templates x where x.project_id = p_project),
    'rig_setups', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.rig_setups x where x.project_id = p_project),
    'measure_sets', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.measure_sets x where x.project_id = p_project),
    'print_jobs', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.print_jobs x where x.project_id = p_project),
    'print_job_elements', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.print_job_elements x where x.project_id = p_project),
    'mouth_sets', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.mouth_sets x where x.project_id = p_project),
    'mouth_tracks', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.mouth_tracks x where x.project_id = p_project),
    'storyboard_panel_blocks', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.storyboard_panel_blocks x where x.project_id = p_project),
    'production_statuses', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.production_statuses x where x.project_id = p_project),
    'production_status_events', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.production_status_events x where x.project_id = p_project),
    'storyboard_panel_snapshots', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.storyboard_panel_snapshots x where x.project_id = p_project)))
  )
$$;

insert into public.schema_version (version, description) values
  (102, '0102_sb1_storyboard: Storyboard Studio SB-1 – paneler som komposisjoner, blokforankring, statusspor med historikk og bevarte panelrevisjoner');
