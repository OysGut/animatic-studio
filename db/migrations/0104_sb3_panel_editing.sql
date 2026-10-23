-- SB-3: panelopplysninger og koblinger til eksisterende notater. 0103 og eldre er låst.
-- Ingen endring av apply_changes; nye validatorer registreres i G-7-registeret.
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
  for c in select * from public.compositions where project_id = p_project and id = any(p_ids) and storyboard is not null loop
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
  if exists (select 1 from public.script_annotations a where a.project_id = p_project and a.id = any(p_ids) and a.panel_id is not null
    and (not exists (select 1 from public.compositions c where c.id = a.panel_id and c.project_id = p_project and c.kind = 'storyboard' and c.variant_id = a.variant_id)
      or a.block_id is not null or (a.layer_id is not null and not exists (select 1 from public.composition_layers l where l.id = a.layer_id and l.composition_id = a.panel_id and l.project_id = p_project))))
  then raise exception 'Invalid storyboard annotation target' using errcode = '22023'; end if;
end $$;
revoke all on function private.validate_sb3_annotations(uuid,jsonb,uuid[]) from public;

create or replace function private.validate_sb3_layer_links(p_project uuid, p_changes jsonb, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.composition_layers l where l.project_id = p_project and l.id = any(p_ids)
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