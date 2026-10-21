-- =====================================================================================
-- From Pen to Glass (repo: Animatic Studio) – migrasjon 0078: avledede bildefiler (B-105a).
-- Hver bildeversjon kan ha avledede filer: arbeidskopi (workingImageMaxSide), proxy for
-- avspilling (WebP, lengste side 1920 px eller filmens oppløsning hvis mindre), miniatyr
-- (WebP 256 px) og rå TIFF når originalen er TIFF (originalRaw). De ligger i
-- asset_versions.derived_files (jsonb, nullable, høyst 64 kB). Originalen (media_path)
-- er uendret og brukes fortsatt til eksport, rigg-PDF og zoom over 100 %.
-- 1. asset_versions.derived_files og global_asset_versions.derived_files (som font_spec i 0074).
-- 2. purge_project_assets (0072): kopiert ordrett, med stiene til de avledede filene lagt til
--    i filsamlingen (v_paths). Resten av funksjonen er uendret.
-- 3. purge_removed_assets (0072): kopiert ordrett, med samme utvidelse i v_paths.
-- 4. global_add_version (0074): kopiert ordrett, med bare p_derived_files lagt til
--    (default null) og derived_files i insert. Den gamle signaturen slettes, som i 0052 og 0074.
--    GRANT som før (bare authenticated).
-- Erstatter:
--   * purge_project_assets (0072)
--   * purge_removed_assets (0072)
--   * global_add_version (0074)
-- apply_changes er uendret: den skriver kolonnene radene har, så derived_files tas med
-- automatisk (jsonb_populate_recordset). delete_project er uendret: versjonsfilene slettes
-- av purge_project_assets.
-- Bare additiv: ingen data endres, ingen tilbakefylling (eldre bilder får avledede filer i
-- bakgrunnen ved første visning). Ingen SQL mot storage.
-- Skrevet for gjennomgang; kjøres ikke i Cloud av Lovable. Kjøres ÉN gang etter 0077.
-- =====================================================================================

alter table public.asset_versions add column if not exists derived_files jsonb
  check (derived_files is null or (jsonb_typeof(derived_files) = 'object'
    and pg_column_size(derived_files) <= 65536
    and not exists (select 1 from jsonb_object_keys(derived_files) k
      where k not in ('working','proxy','thumbnail','originalRaw'))
    and not exists (select 1 from jsonb_each(derived_files) f
      where jsonb_typeof(f.value) <> 'object'
         or not (f.value ? 'path')
         or jsonb_typeof(f.value -> 'path') <> 'string'
         or length(f.value ->> 'path') = 0
         or length(f.value ->> 'path') > 1024)));

alter table public.global_asset_versions add column if not exists derived_files jsonb
  check (derived_files is null or (jsonb_typeof(derived_files) = 'object'
    and pg_column_size(derived_files) <= 65536
    and not exists (select 1 from jsonb_object_keys(derived_files) k
      where k not in ('working','proxy','thumbnail','originalRaw'))
    and not exists (select 1 from jsonb_each(derived_files) f
      where jsonb_typeof(f.value) <> 'object'
         or not (f.value ? 'path')
         or jsonb_typeof(f.value -> 'path') <> 'string'
         or length(f.value ->> 'path') = 0
         or length(f.value ->> 'path') > 1024)));

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
  -- Målesett er prosjektdata som kan angres: behold laget og ressursene de måler.
  if exists (select 1 from public.measure_sets m
      join public.composition_layers l on l.id = m.layer_id
      where m.project_id = p_project
        and (l.asset_id = any (v_assets) or l.version_id = any (v_versions))) then
    raise exception 'Brukes fortsatt i et målesett. Fjern bruken først.' using errcode = '23503';
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

drop function public.global_add_version(uuid, text, text, integer, integer, bigint, text, integer, text, jsonb, jsonb);

create function public.global_add_version(
  p_variant uuid, p_storage_key text, p_mime text, p_width integer, p_height integer, p_bytes bigint,
  p_sha256 text, p_duration_ms integer, p_note text, p_template_spec jsonb default null,
  p_font_spec jsonb default null,
  p_derived_files jsonb default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_var public.global_asset_variants;
  v_number integer;
  v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select * into v_var from public.global_asset_variants where id = p_variant for update;
  if not found then raise exception 'Varianten finnes ikke' using errcode = '22023'; end if;
  if not private.has_workspace_role(v_var.workspace_id, 'editor') then
    raise exception 'Bare eier og redaktør kan publisere nye versjoner' using errcode = '42501';
  end if;
  if p_storage_key is null
     or p_storage_key !~ ('^global/' || v_var.workspace_id::text || '/' || v_var.global_asset_id::text
                          || '/[0-9a-f]{64}\.[a-z0-9]{1,8}$') then
    raise exception 'Ugyldig lagringssti' using errcode = '22023';
  end if;
  select coalesce(max(number), 0) + 1 into v_number from public.global_asset_versions where variant_id = p_variant;
  insert into public.global_asset_versions (workspace_id, global_asset_id, variant_id, number, storage_key,
      mime_type, width, height, byte_size, sha256, duration_ms, note, created_by, template_spec, font_spec,
      derived_files)
    values (v_var.workspace_id, v_var.global_asset_id, p_variant, v_number, p_storage_key, p_mime, p_width,
            p_height, p_bytes, p_sha256, p_duration_ms, coalesce(p_note, ''), (select auth.uid()), p_template_spec,
            p_font_spec, p_derived_files)
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.global_add_version(uuid, text, text, integer, integer, bigint, text, integer, text, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.global_add_version(uuid, text, text, integer, integer, bigint, text, integer, text, jsonb, jsonb, jsonb)
  to authenticated;

insert into public.schema_version (version, description)
  values (78, '0078_b105a_derived_files: B-105a avledede bildefiler (derived_files, purge_*, global_add_version)');
