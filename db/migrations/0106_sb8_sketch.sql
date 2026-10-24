-- SB-8 storyboard-only compact vector drawings. Claude applies this migration.
alter table public.composition_layers add column sketch jsonb;
alter table public.composition_layers drop constraint composition_layers_kind_check;
alter table public.composition_layers add constraint composition_layers_kind_check check(kind in ('background','midground','foreground','character','object','effect','other','group','text','page','note','arrow','camera_mark','sketch'));
alter table public.composition_layers drop constraint composition_layers_shows_something;
alter table public.composition_layers add constraint composition_layers_shows_something check(kind in ('group','page','note','arrow','camera_mark','sketch') or (kind='text' and text_spec is not null) or asset_id is not null or fill is not null);
alter table public.composition_layers add constraint sketch_size check(sketch is null or (pg_catalog.jsonb_typeof(sketch)='object' and pg_catalog.octet_length(sketch::text)<=524288 and pg_catalog.pg_column_size(sketch)<=524288));
alter table public.composition_layers add constraint sketch_kind check((kind='sketch')=(sketch is not null));
create function private.validate_sb8_sketch(p_project uuid,p_changes jsonb,p_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare l record; st jsonb; pt jsonb; seen text[]; x numeric; y numeric;
begin
 for l in select a.* from public.composition_layers a join public.compositions c on c.id=a.composition_id
 where a.project_id=p_project and a.kind='sketch' and a.id in(select (r->>'id')::uuid from pg_catalog.jsonb_array_elements(coalesce(p_changes->'inserts'->'composition_layers','[]')||coalesce(p_changes->'updates'->'composition_layers','[]'))r)
 loop
  if not exists(select 1 from public.compositions c where c.id=l.composition_id and c.project_id=p_project and c.kind='storyboard') or l.asset_id is not null or l.fill is not null
   or l.sketch->>'version'<>'1' or l.sketch->>'role' not in('rough','clean') or pg_catalog.jsonb_typeof(l.sketch->'strokes') is distinct from 'array' or pg_catalog.jsonb_array_length(l.sketch->'strokes')>1024 then raise exception 'Invalid sketch' using errcode='22023'; end if;
  seen:='{}';
  for st in select * from pg_catalog.jsonb_array_elements(l.sketch->'strokes') loop
   if pg_catalog.jsonb_typeof(st->'id') is distinct from 'string' or pg_catalog.length(st->>'id') not between 1 and 64 or st->>'id'=any(seen)
    or st->>'tool' not in('pencil','brush','erase','fill','line','rect','ellipse') or coalesce(st->>'color','')!~'^#[0-9a-fA-F]{6}$'
    or coalesce((st->>'size')::numeric,-1) not between .1 and 512 or coalesce((st->>'opacity')::numeric,-1) not between 0 and 1
    or coalesce((st->>'curve')::numeric,-1) not between .1 and 4 or coalesce((st->>'smoothing')::numeric,-1) not between 0 and 1
    or pg_catalog.jsonb_typeof(st->'points') is distinct from 'array' or pg_catalog.jsonb_array_length(st->'points') not between 1 and 8192 then raise exception 'Invalid sketch stroke' using errcode='22023';end if;
   seen:=pg_catalog.array_append(seen,st->>'id');x:=0;y:=0;
   for pt in select * from pg_catalog.jsonb_array_elements(st->'points') loop
    if pg_catalog.jsonb_typeof(pt) is distinct from 'array' or pg_catalog.jsonb_array_length(pt)<>6 or exists(select 1 from pg_catalog.jsonb_array_elements(pt)v where pg_catalog.jsonb_typeof(v)<>'number' or (v::text)::numeric<>pg_catalog.trunc((v::text)::numeric)) then raise exception 'Invalid sketch point' using errcode='22023';end if;
    x:=x+(pt->>0)::numeric;y:=y+(pt->>1)::numeric;
    if pg_catalog.abs(x)>163840 or pg_catalog.abs(y)>163840 or (pt->>2)::numeric not between 0 and 1000 or pg_catalog.abs((pt->>3)::numeric)>90 or pg_catalog.abs((pt->>4)::numeric)>90 or (pt->>5)::numeric not between 0 and 600000 then raise exception 'Invalid sketch point' using errcode='22023';end if;
   end loop;
  end loop;
 end loop;
end $$;
revoke all on function private.validate_sb8_sketch(uuid,jsonb,uuid[]) from public;
insert into private.apply_change_validators(table_name,validator,sort_order)values('composition_layers','private.validate_sb8_sketch'::regproc,108);

-- Capability rows are service-only, never project data. Parent deletion removes capabilities.
create table public.sketch_sessions(id uuid primary key default pg_catalog.gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,panel_id uuid not null references public.compositions(id) on delete cascade,layer_id uuid not null references public.composition_layers(id) on delete cascade,actor uuid not null,token_hash text not null unique check(token_hash~'^[0-9a-f]{64}$'),expires_at timestamptz not null,revoked boolean not null default false,operations integer not null default 0 check(operations between 0 and 1000));
revoke all on public.sketch_sessions from public,anon,authenticated;
grant all on public.sketch_sessions to service_role;
alter table public.sketch_sessions enable row level security;
create policy sketch_sessions_service on public.sketch_sessions to service_role using(true) with check(true);
create function public.sketch_session_lookup(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.sketch_sessions;
begin
 select * into s from public.sketch_sessions where token_hash=p_hash and not revoked and expires_at>pg_catalog.now() and operations<1000;
 if not found or private.member_role_rank(s.project_id,s.actor)<private.role_rank('editor') or not exists(select 1 from public.composition_layers l join public.compositions c on c.id=l.composition_id join public.projects p on p.id=c.project_id where l.id=s.layer_id and c.id=s.panel_id and c.project_id=s.project_id and c.kind='storyboard' and l.kind='sketch' and not l.removed and not l.locked and not c.removed and p.deleted_at is null) or exists(select 1 from public.production_statuses ps where ps.project_id=s.project_id and ps.composition_id=s.panel_id and ps.area='storyboard' and ps.status='done' and not ps.removed) then return null;end if;
 return pg_catalog.jsonb_build_object('sessionId',s.id,'projectId',s.project_id,'panelId',s.panel_id,'layerId',s.layer_id,'actor',s.actor,'expiresAt',s.expires_at);
end $$;
revoke all on function public.sketch_session_lookup(text) from public,anon,authenticated;
grant execute on function public.sketch_session_lookup(text) to service_role;
insert into public.schema_version(version,description)values(106,'SB-8 compact sketch layers and panel drawing capabilities');create function public.sketch_session_create(p_project uuid,p_panel uuid,p_layer uuid,p_actor uuid,p_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare id uuid;begin
 perform 1 from public.projects where projects.id=p_project and deleted_at is null for update;
 if private.member_role_rank(p_project,p_actor)<private.role_rank('editor') or (select count(*) from public.sketch_sessions where actor=p_actor and expires_at>pg_catalog.now() and not revoked)>=5 then raise exception 'Sketch session denied' using errcode='42501';end if;
 insert into public.sketch_sessions(project_id,panel_id,layer_id,actor,token_hash,expires_at)values(p_project,p_panel,p_layer,p_actor,p_hash,pg_catalog.now()+interval '30 minutes')returning sketch_sessions.id into id;
 if public.sketch_session_lookup(p_hash) is null then raise exception 'Sketch session denied' using errcode='42501';end if;return id;end $$;
revoke all on function public.sketch_session_create(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.sketch_session_create(uuid,uuid,uuid,uuid,text) to service_role;
create function public.sketch_session_apply(p_hash text,p_id uuid,p_command jsonb,p_inverse jsonb,p_changes jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s public.sketch_sessions; cap jsonb; r jsonb;begin
 select * into s from public.sketch_sessions where token_hash=p_hash for update;
 cap:=public.sketch_session_lookup(p_hash);if cap is null then raise exception 'Sketch session expired' using errcode='42501';end if;
 perform 1 from public.projects where id=s.project_id for update;
 if exists(select 1 from public.change_log where project_id=s.project_id and id=p_id)then return;end if;
 if p_command->>'type' is distinct from 'UpdateLayers' or pg_catalog.jsonb_array_length(p_command->'layers')<>1 or p_command->'layers'->0->>'layerId' is distinct from s.layer_id::text
 or coalesce(p_changes->'inserts','{}')<>'{}'::jsonb or coalesce(p_changes->'deletes','{}')<>'{}'::jsonb or (select count(*) from pg_catalog.jsonb_object_keys(p_changes->'updates'))<>1 or pg_catalog.jsonb_array_length(p_changes->'updates'->'composition_layers')<>1 then raise exception 'Sketch scope denied' using errcode='42501';end if;
 r:=p_changes->'updates'->'composition_layers'->0;
 if r->>'id' is distinct from s.layer_id::text or exists(select 1 from pg_catalog.jsonb_object_keys(r) k where k not in('id','revision','expected_revision','sketch'))then raise exception 'Sketch scope denied' using errcode='42501';end if;
 if (r->>'expected_revision')::integer is distinct from (select revision from public.composition_layers where id=s.layer_id)
 or (r->>'revision')::integer is distinct from (r->>'expected_revision')::integer+1 then raise exception 'Sketch revision conflict' using errcode='40001';end if;
 perform public.apply_changes(s.project_id,s.actor,p_id,p_command,p_inverse,p_changes);
 update public.sketch_sessions set operations=operations+1 where id=s.id;
end $$;
revoke all on function public.sketch_session_apply(text,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sketch_session_apply(text,uuid,jsonb,jsonb,jsonb) to service_role;
