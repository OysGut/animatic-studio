-- SB-3: panelopplysninger og koblinger til eksisterende notater. 0103 og eldre er låst.
-- Nye validatorer registreres i G-7; prosjektradens eksplisitte kolonne oppdateres.
alter table public.compositions add column storyboard jsonb check (storyboard is null or (kind = 'storyboard' and jsonb_typeof(storyboard) = 'object' and octet_length(storyboard::text) <= 600000));
alter table public.projects add column storyboard_fields jsonb check (storyboard_fields is null or (jsonb_typeof(storyboard_fields) = 'array' and jsonb_array_length(storyboard_fields) <= 50 and octet_length(storyboard_fields::text) <= 20000));
alter table public.script_annotations add column panel_id uuid references public.compositions(id) on delete restrict;
alter table public.script_annotations add column layer_id uuid references public.composition_layers(id) on delete restrict;
alter table public.script_annotations add constraint sb3_annotation_target check (layer_id is null or panel_id is not null);
create index sb3_annotation_panel on public.script_annotations(panel_id) where panel_id is not null;
create index sb3_annotation_layer on public.script_annotations(layer_id) where layer_id is not null;

create or replace function private.validate_sb3_panel_details(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
declare c record; d jsonb; item jsonb;
begin
  for c in select * from public.compositions where project_id = p_project  and storyboard is not null loop
    d := c.storyboard;
    if jsonb_typeof(d->'number') is distinct from 'string' or (d->>'number') !~ '^(|[1-9][0-9]*[A-Z]*)$'
      or jsonb_typeof(d->'sceneNumber') is distinct from 'string' or (d->>'sceneNumber') !~ '^(|[1-9][0-9]*[A-Z]*)$'
      or jsonb_typeof(d->'fields') is distinct from 'object' or jsonb_typeof(d->'dialogueIds') is distinct from 'array'
      or jsonb_array_length(d->'dialogueIds') > 1000
      or jsonb_typeof(d->'movement') is distinct from 'string' or length(d->>'movement') > 10000
      or not (d ? 'shot' and d ? 'angle' and d ? 'focalMm')
      or (d->'shot' <> 'null'::jsonb and coalesce(d->>'shot','') not in ('ECU','CU','MCU','MS','MWS','WS','EWS','OTS','POV','two-shot'))
      or (d->'angle' <> 'null'::jsonb and coalesce(d->>'angle','') not in ('eye','high','low','bird','dutch'))
      or (d->'focalMm' <> 'null'::jsonb and (jsonb_typeof(d->'focalMm') <> 'number' or (d->>'focalMm')::numeric <= 0 or (d->>'focalMm')::numeric > 2000))
      or exists (select 1 from jsonb_each(d->'fields') f where jsonb_typeof(f.value) <> 'string' or length(f.value #>> '{}') > 10000)
    then raise exception 'Invalid storyboard panel details' using errcode = '22023'; end if;
    for item in select value from jsonb_array_elements(d->'dialogueIds') loop
      if jsonb_typeof(item) <> 'string' or not exists (select 1 from public.script_blocks b where b.id::text = item #>> '{}' and b.project_id = p_project and b.variant_id = c.variant_id and b.kind = 'dialogue' and not b.removed)
      then raise exception 'Invalid storyboard dialogue link' using errcode = '22023'; end if;
    end loop;
  end loop;
end $$;
revoke all on function private.validate_sb3_panel_details(uuid,jsonb,uuid[]) from public;

create or replace function private.validate_sb3_fields(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
declare fs jsonb;
begin
  select storyboard_fields into fs from public.projects where id = p_project;
  if fs is null then return; end if;
  if exists (select 1 from jsonb_array_elements(fs) f where jsonb_typeof(f) <> 'object' or coalesce(f->>'id','') !~ '^[a-z][a-z0-9_-]{0,63}$' or jsonb_typeof(f->'name') is distinct from 'string' or length(f->>'name') > 100 or coalesce(f->>'kind','') not in ('text','dialogue'))
    or (select count(*) from jsonb_array_elements(fs)) <> (select count(distinct f->>'id') from jsonb_array_elements(fs) f)
  then raise exception 'Invalid storyboard field definitions' using errcode = '22023'; end if;
end $$;
revoke all on function private.validate_sb3_fields(uuid,jsonb,uuid[]) from public;

create or replace function private.validate_sb3_annotations(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.script_annotations a where a.project_id = p_project  and a.panel_id is not null
    and (not exists (select 1 from public.compositions c where c.id = a.panel_id and c.project_id = p_project and c.kind = 'storyboard' and c.variant_id = a.variant_id)
      or a.block_id is not null or (a.layer_id is not null and not exists (select 1 from public.composition_layers l where l.id = a.layer_id and l.composition_id = a.panel_id and l.project_id = p_project))))
  then raise exception 'Invalid storyboard annotation target' using errcode = '22023'; end if;
end $$;
revoke all on function private.validate_sb3_annotations(uuid,jsonb,uuid[]) from public;

create or replace function private.validate_sb3_layer_links(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.composition_layers l where l.project_id = p_project 
    and ((l.note->'anchor'->>'layerId' is not null and not exists (select 1 from public.composition_layers target where target.id::text = l.note->'anchor'->>'layerId' and target.project_id = p_project and target.composition_id = l.composition_id))
      or (l.arrow->>'layerId' is not null and not exists (select 1 from public.composition_layers target where target.id::text = l.arrow->>'layerId' and target.project_id = p_project and target.composition_id = l.composition_id))))
  then raise exception 'Invalid storyboard layer link' using errcode = '22023'; end if;
end $$;
revoke all on function private.validate_sb3_layer_links(uuid,jsonb,uuid[]) from public;

insert into private.apply_change_validators(table_name,validator,preparer,sort_order) values
  ('compositions','private.validate_sb3_panel_details'::regproc,null,100),
  ('projects','private.validate_sb3_fields'::regproc,null,101),
  ('script_annotations','private.validate_sb3_annotations'::regproc,null,102),
  ('composition_layers','private.validate_sb3_layer_links'::regproc,null,103);
insert into public.schema_version(version) values (104);
-- SB-3: annotasjoner før lag og paneler; ellers ordrett fra 0102.
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
  delete from public.script_annotations where project_id = p_project;
  delete from public.composition_layers where project_id = p_project;
  -- Malforekomster (MTS MT4): etter lagene (on delete restrict), før 2D-scenene og ressursene
  delete from public.template_instances where project_id = p_project;
  -- Rulletekst (MTS MT7): sekvensen peker på forekomsten, deltakerne peker på ressurser (on delete restrict)
  delete from public.credit_sequences where project_id = p_project;
  delete from public.credit_participants where project_id = p_project;
  delete from public.compositions where project_id = p_project;
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

-- SB-3: annotasjoner før lag og paneler; ellers ordrett fra 0102.
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
  delete from public.script_annotations where project_id = p_project;
  delete from public.composition_layers where project_id = p_project;
  -- Malforekomster (MTS MT4): etter lagene (on delete restrict), før 2D-scenene og ressursene
  delete from public.template_instances where project_id = p_project;
  -- Rulletekst (MTS MT7): sekvensen peker på forekomsten, deltakerne peker på ressurser (on delete restrict)
  delete from public.credit_sequences where project_id = p_project;
  delete from public.credit_participants where project_id = p_project;
  delete from public.compositions where project_id = p_project;
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

-- Prosjektraden har eksplisitte kolonner; kun storyboard_fields lagt til.
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
      storyboard_fields = case when v_row ? 'storyboard_fields' then nullif(v_row -> 'storyboard_fields', 'null'::jsonb) else storyboard_fields end,
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

-- Flytt annotasjoner etter lag ved innsetting og før lag ved sletting.
update private.apply_change_tables set insert_order=-insert_order, delete_order=-delete_order;
update private.apply_change_tables set insert_order=case when table_name='script_annotations' then 20 when -insert_order between 16 and 20 then -insert_order-1 else -insert_order end, delete_order=case when table_name='script_annotations' then 36 when -delete_order between 36 and 40 then -delete_order+1 else -delete_order end;
