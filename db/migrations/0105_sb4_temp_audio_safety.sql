-- SB-4: reference integrity for temporary panel audio; 0104 and older stay unchanged.
create or replace function private.validate_sb4_temp_audio(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare c record; a jsonb;
begin
  for c in select x.* from public.compositions x where x.project_id = p_project
    and x.id in (select (r->>'id')::uuid from pg_catalog.jsonb_array_elements(coalesce(p_changes->'inserts'->'compositions','[]') || coalesce(p_changes->'updates'->'compositions','[]')) r)
  loop
    a := c.storyboard->'tempAudio';
    if a is null or a = 'null'::jsonb then continue; end if;
    if pg_catalog.jsonb_typeof(a) is distinct from 'object'
      or pg_catalog.jsonb_typeof(a->'assetId') is distinct from 'string'
      or pg_catalog.jsonb_typeof(a->'versionId') is distinct from 'string'
      or pg_catalog.jsonb_typeof(a->'name') is distinct from 'string'
      or pg_catalog.length(a->>'name') > 500
      or pg_catalog.jsonb_typeof(a->'durationMs') is distinct from 'number'
    then raise exception 'Invalid temporary storyboard audio' using errcode = '22023'; end if;
    if (a->>'durationMs')::numeric <= 0 or (a->>'durationMs')::numeric > 3600000
      or not exists (select 1 from public.asset_versions v join public.asset_variants va on va.id = v.variant_id
        join public.assets asset on asset.id = va.asset_id
        where v.id::text = a->>'versionId' and asset.id::text = a->>'assetId'
          and v.project_id = p_project and va.project_id = p_project and asset.project_id = p_project
          and not v.removed and not asset.removed and asset.kind = 'sound' and v.mime_type like 'audio/%')
    then raise exception 'Invalid temporary storyboard audio reference' using errcode = '22023'; end if;
  end loop;
end $$;
revoke all on function private.validate_sb4_temp_audio(uuid,jsonb,uuid[]) from public;
insert into private.apply_change_validators(table_name,validator,preparer,sort_order)
  values ('compositions','private.validate_sb4_temp_audio'::regproc,null,104);

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

  -- SB-4: retained/removed panels keep temporary audio available for undo.
  if exists (select 1 from public.compositions c where c.project_id = p_project
      and (c.storyboard->'tempAudio'->>'assetId' = any(v_assets::text[])
        or c.storyboard->'tempAudio'->>'versionId' = any(v_versions::text[]))) then
    raise exception 'Temporary storyboard audio is still referenced' using errcode = '23503';
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
revoke all on function public.purge_removed_assets(uuid,uuid,uuid[],uuid[]) from public, anon, authenticated;
grant execute on function public.purge_removed_assets(uuid,uuid,uuid[],uuid[]) to service_role;
insert into public.schema_version(version,description) values (105,'SB-4 temporary panel audio integrity and purge protection');
