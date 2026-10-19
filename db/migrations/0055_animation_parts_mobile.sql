-- =====================================================================================
-- Animatic Studio – migrasjon 0055: CA4 rigg-deler og eksplisitt mobilgodkjenning, krever 0054.
-- Rigg-deler ligger i den uforanderlige spec-en. Ingen nye prosjekttabeller eller apply_changes-endringer.
-- Godkjenning skjer atomisk når SaveRigVersion lagres via apply_changes. Originalbilder endres aldri.
-- =====================================================================================

alter table public.mobile_imports add column approved_rig_version_id uuid;
alter table public.mobile_imports add column approved_at timestamptz;
revoke all on public.mobile_imports from anon, authenticated;
grant select on public.mobile_imports to authenticated;
grant all on public.mobile_imports to service_role;
revoke all on public.upload_sessions from anon, authenticated;
grant select on public.upload_sessions to authenticated;
grant all on public.upload_sessions to service_role;
revoke all on public.animation_rigs from anon, authenticated;
grant select on public.animation_rigs to authenticated;
grant all on public.animation_rigs to service_role;
revoke all on public.animation_rig_versions from anon, authenticated;
grant select on public.animation_rig_versions to authenticated;
grant all on public.animation_rig_versions to service_role;
revoke all on public.animation_uses from anon, authenticated;
grant select on public.animation_uses to authenticated;
grant all on public.animation_uses to service_role;

create function private.validate_rig_upload_context() returns trigger
language plpgsql set search_path = '' as $$
declare v_target jsonb;
begin
  if new.context ->> 'type' is distinct from 'rig' then return new; end if;
  v_target := new.context -> 'target';
  if new.context ->> 'purpose' not in ('mouth_shape', 'rig_part')
     or jsonb_typeof(v_target) is distinct from 'object'
     or coalesce(v_target ->> 'slot', '') not in ('mouth:A','mouth:B','mouth:C','mouth:D','mouth:E','mouth:F','mouth:G','mouth:H','mouth:X','eye:left:open','eye:left:closed','eye:right:open','eye:right:closed','head','nose')
     or (new.context ->> 'purpose' = 'mouth_shape') is distinct from ((v_target ->> 'slot') like 'mouth:%')
     or new.media_kinds is distinct from array['image']::text[] then
    raise exception 'Ugyldig rigg-import' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.asset_versions v join public.asset_variants a on a.id = v.variant_id
    where v.id::text = v_target ->> 'sourceVersionId' and a.id::text = v_target ->> 'variantId'
      and a.asset_id::text = v_target ->> 'assetId' and v.project_id = new.project_id
      and a.project_id = new.project_id and not v.removed and not a.archived and v.mime_type like 'image/%'
  ) then raise exception 'Rigg-målet finnes ikke i prosjektet' using errcode = '23503'; end if;
  return new;
end $$;
create trigger validate_rig_upload_context before insert or update of context, media_kinds
  on public.upload_sessions for each row execute function private.validate_rig_upload_context();

create function private.validate_animation_parts() returns trigger
language plpgsql set search_path = '' as $$
declare v_slot text; v_part jsonb; v_asset uuid; v_variant uuid; v_import public.mobile_imports;
begin
  if new.removed then return new; end if;
  select r.variant_id, a.asset_id into v_variant, v_asset from public.animation_rigs r
    join public.asset_variants a on a.id = r.variant_id where r.id = new.rig_id and r.project_id = new.project_id;
  if new.spec ? 'parts' then
    if jsonb_typeof(new.spec -> 'parts') <> 'object' then raise exception 'Ugyldige rigg-deler' using errcode = '22023'; end if;
    for v_slot, v_part in select key, value from jsonb_each(new.spec -> 'parts') loop
      if v_slot not in ('mouth:A','mouth:B','mouth:C','mouth:D','mouth:E','mouth:F','mouth:G','mouth:H','mouth:X','eye:left:open','eye:left:closed','eye:right:open','eye:right:closed','head','nose')
         or jsonb_typeof(v_part) <> 'object' then raise exception 'Ugyldig rigg-del' using errcode = '22023'; end if;
      if v_part ->> 'versionId' is not null and not exists (
        select 1 from public.asset_versions v join public.asset_variants a on a.id = v.variant_id
          where v.id::text = v_part ->> 'versionId' and v.project_id = new.project_id
            and a.asset_id = v_asset and a.project_id = new.project_id and not v.removed and v.mime_type like 'image/%'
      ) then raise exception 'Rigg-delen tilhører ikke ressursen' using errcode = '23503'; end if;
      if v_part ->> 'mobileImportId' is not null then
        select * into v_import from public.mobile_imports m where m.id::text = v_part ->> 'mobileImportId' for update;
        if not found or v_import.project_id <> new.project_id or v_import.status <> 'done'
          or v_import.kind <> 'image' or v_import.dismissed
          or v_import.context ->> 'type' is distinct from 'rig'
          or v_import.context -> 'target' ->> 'slot' is distinct from v_slot
          or v_import.context -> 'target' ->> 'variantId' is distinct from v_variant::text
          or v_import.context -> 'target' ->> 'assetId' is distinct from v_asset::text
          or v_import.context -> 'target' ->> 'sourceVersionId' is distinct from new.source_version_id::text
          or (v_import.approved_rig_version_id is not null and not exists (
              select 1 from public.animation_rig_versions old_v where old_v.id = v_import.approved_rig_version_id
                and old_v.rig_id = new.rig_id and old_v.spec -> 'parts' -> v_slot ->> 'versionId' = v_part ->> 'versionId'
             ))
          or not exists (select 1 from public.asset_versions v where v.id::text = v_part ->> 'versionId'
            and v.project_id = new.project_id and v.media_path = v_import.path)
          then raise exception 'Importen kan ikke godkjennes for denne rigg-delen' using errcode = '22023'; end if;
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger validate_animation_parts before insert or update on public.animation_rig_versions
  for each row execute function private.validate_animation_parts();

create function private.approve_animation_parts() returns trigger
language plpgsql set search_path = '' as $$
declare v_slot text; v_part jsonb;
begin
  if new.removed then return new; end if;
  for v_slot, v_part in select key, value from jsonb_each(coalesce(new.spec -> 'parts', '{}'::jsonb)) loop
    if v_part ->> 'mobileImportId' is not null then
      update public.mobile_imports set approved_rig_version_id = new.id, approved_at = now(),
        asset_version_id = (v_part ->> 'versionId')::uuid, claimed_by = new.created_by, claimed_at = now()
        where id::text = v_part ->> 'mobileImportId';
    end if;
  end loop;
  return new;
end $$;
create trigger approve_animation_parts after insert or update on public.animation_rig_versions
  for each row execute function private.approve_animation_parts();

-- JSON image references have the same hard-delete protection as ordinary foreign keys.
create function private.protect_animation_part_image() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.animation_rig_versions v,
    lateral jsonb_each(coalesce(v.spec -> 'parts', '{}'::jsonb)) p
    where p.value ->> 'versionId' = old.id::text) then
    raise exception 'Bildet brukes av en rigg-del' using errcode = '23503';
  end if;
  return old;
end $$;
create trigger protect_animation_part_image before delete on public.asset_versions
  for each row execute function private.protect_animation_part_image();

insert into public.schema_version (version, description)
  values (55, '0055_animation_parts_mobile: munnformer, vektormasker, rigg-deler og eksplisitt mobilgodkjenning');
