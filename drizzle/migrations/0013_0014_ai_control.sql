-- =====================================================================================
-- Animatic Studio – migrasjon 0014: AI med kontroll (M5 del 2, DEC-0053) og avvik ved manusendring (DEC-0054).
-- 1. AI-budsjett for prosjektet (REQ-0282/0284, REQ-0528): høyeste antall AI-genereringer per måned
--    (projects.ai_month_limit, null = bare de faste grensene) og anslått pris per bilde
--    (projects.ai_price_per_image, null = ukjent). Settes av eieren via apply_changes.
-- 2. generation_jobs: anslått kostnad per jobb (estimated_cost), scenen og segmentet en jobb gjelder,
--    og jobbtypen «video» for senere (REQ-0279, REQ-0292).
-- 3. production_segments.start_ms/end_ms: segmenter til generering er tidsrom i scenen.
-- 4. generation_prompts: beskrivelsen brukeren selv har skrevet for et segment av en scene
--    (REQ-0252/0253/0256): lagres og forsvinner ikke når den automatiske beskrivelsen endres.
-- 5. compositions.produced_from og takes.accepted_from: grunnlaget for avvik ved manusendring (DEC-0054).
-- 6. apply_changes: som 0013, med generation_prompts og AI-budsjettet på prosjektraden.
-- Ingen SQL mot lagringen (storage). Kjøres ÉN gang i Lovable Cloud etter 0013. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.projects add column if not exists ai_month_limit integer
  check (ai_month_limit is null or ai_month_limit between 0 and 100000);
alter table public.projects add column if not exists ai_price_per_image numeric(10,2)
  check (ai_price_per_image is null or ai_price_per_image between 0 and 100000);

alter table public.generation_jobs drop constraint if exists generation_jobs_kind_check;
-- «lost»: tjenesten laget resultatet (og tok betalt), men det kunne ikke lagres – teller i budsjettet
alter table public.generation_jobs drop constraint if exists generation_jobs_status_check;
alter table public.generation_jobs add constraint generation_jobs_status_check
  check (status in ('running','done','failed','lost'));
alter table public.generation_jobs add constraint generation_jobs_kind_check check (kind in ('image','video'));
alter table public.generation_jobs add column if not exists estimated_cost numeric(10,2)
  check (estimated_cost is null or estimated_cost >= 0);
-- Loggen beholdes når scenen eller segmentet slettes (sletting av prosjektet, ny inndeling)
alter table public.generation_jobs add column if not exists occurrence_id uuid
  references public.scene_occurrences (id) on delete set null;
alter table public.generation_jobs add column if not exists segment_id uuid
  references public.production_segments (id) on delete set null;
create index if not exists generation_jobs_month_idx on public.generation_jobs (project_id, created_at);

-- Avvik mellom manus og 2D-scene (DEC-0054): revisjonene 2D-scenen er laget fra eller sist godkjent mot
alter table public.compositions add column if not exists produced_from jsonb not null default '{}'::jsonb
  check (jsonb_typeof(produced_from) = 'object' and pg_column_size(produced_from) <= 262144);

-- Godkjent grunnlag for versjoner (DEC-0054): produced_from er uforanderlig (INV-07, utløseren
-- protect_takes), så godkjenning av manusendringer lagres i en egen kolonne
alter table public.takes add column if not exists accepted_from jsonb not null default '{}'::jsonb
  check (jsonb_typeof(accepted_from) = 'object' and pg_column_size(accepted_from) <= 262144);

-- Segmenter til generering er tidsrom i scenen, ikke festet til manusblokker (manuset kan endres fritt)
alter table public.production_segments add column if not exists start_ms integer
  check (start_ms is null or start_ms between 0 and 36000000);
alter table public.production_segments add column if not exists end_ms integer
  check (end_ms is null or end_ms between 1 and 36000000);
alter table public.production_segments add constraint production_segments_time_order
  check (start_ms is null or (end_ms is not null and end_ms > start_ms));

create table public.generation_prompts (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  -- Slettes sammen med scenen eller segmentet (sletting av prosjektet; ny inndeling sletter dem uansett)
  occurrence_id uuid not null references public.scene_occurrences (id) on delete cascade,
  segment_id uuid not null references public.production_segments (id) on delete cascade,
  text text not null check (length(text) between 1 and 8000),
  -- Den automatiske beskrivelsen da brukeren skrev sin egen (for å se om den har endret seg siden)
  based_on text not null default '' check (length(based_on) <= 8000),
  removed boolean not null default false,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);
create index generation_prompts_occurrence_idx on public.generation_prompts (occurrence_id);
create index generation_prompts_project_idx on public.generation_prompts (project_id);
alter table public.generation_prompts enable row level security;
create policy generation_prompts_read on public.generation_prompts for select to authenticated
  using (private.is_project_member(project_id));
revoke insert, update, delete, truncate on public.generation_prompts from anon, authenticated;
grant select on public.generation_prompts to authenticated;

-- ---------- apply_changes: som 0013, med genereringsbeskrivelser og AI-budsjett på prosjektraden ----------
create or replace function public.apply_changes(
  p_project uuid, p_actor uuid, p_command_id uuid, p_command jsonb, p_inverse jsonb, p_changes jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tables text[] := array['productions','scenes','scene_variants','script_blocks','scene_occurrences','production_segments','takes',
                           'assets','asset_variants','asset_versions','script_annotations',
                           'compositions','composition_layers','audio_clips','clip_parts','time_links','generation_prompts'];
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
  foreach v_t in array array['generation_prompts','time_links','clip_parts','audio_clips','composition_layers','compositions','script_annotations','asset_versions','asset_variants','assets',
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
  values (14, '0014_ai_control: AI-budsjett, anslått kostnad og scene/segment på jobber, egne genereringsbeskrivelser per segment');