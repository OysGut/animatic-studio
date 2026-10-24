-- C-1: universal file route («Send to …» and the return page). Written only; Claude runs tests and Cloud.
-- A hand-off records one outgoing file for an asset, panel, audio clip or scene, with a short-lived return
-- token stored only as SHA-256. Returns go through the C-0 intake (connector_transfers → candidate version).
create table public.connector_handoffs (
 id uuid primary key,
 project_id uuid not null references public.projects(id) on delete cascade,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 target_kind text not null check(target_kind in('asset','panel','clip','scene')),
 target_id uuid not null,
 asset_id uuid,
 variant_id uuid,
 scene_id uuid,
 base_version_id uuid,
 base_revision integer not null default 1 check(base_revision>=0),
 adapter text not null check(adapter ~ '^[a-z0-9-]{3,64}$'),
 format text not null check(format in('psd','png','svg','wav','otio')),
 file_name text not null check(length(file_name) between 1 and 255),
 return_token_hash text not null unique check(return_token_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz not null,
 status text not null default 'out' check(status in('out','returned','conflict','closed','revoked')),
 transfer_id uuid references public.connector_transfers(id) on delete set null,
 candidate_version_id uuid,
 revision integer not null default 1,
 check(target_kind<>'asset' or (asset_id is not null and variant_id is not null)),
 check(target_kind<>'clip' or asset_id is not null)
);
grant select on public.connector_handoffs to authenticated;
grant all on public.connector_handoffs to service_role;
alter table public.connector_handoffs enable row level security;
create policy c1_handoffs_member_read on public.connector_handoffs for select to authenticated using(project_id in(select private.my_project_ids()));
-- The browser never reads the token hash.
revoke select on public.connector_handoffs from authenticated;
grant select(id,project_id,created_by,created_at,updated_at,target_kind,target_id,asset_id,variant_id,scene_id,base_version_id,base_revision,adapter,format,file_name,expires_at,status,transfer_id,candidate_version_id,revision) on public.connector_handoffs to authenticated;
revoke insert,update,delete,truncate,references,trigger on public.connector_handoffs from authenticated;
revoke all on public.connector_handoffs from anon;
create index c1_handoffs_project on public.connector_handoffs(project_id,status,created_at desc);
create index c1_handoffs_target on public.connector_handoffs(project_id,target_kind,target_id);
create index c1_handoffs_asset on public.connector_handoffs(project_id,asset_id) where asset_id is not null;
create index c1_handoffs_scene on public.connector_handoffs(project_id,scene_id) where scene_id is not null;

alter table public.connector_transfers add column handoff_id uuid references public.connector_handoffs(id) on delete set null;
create index c1_transfers_handoff on public.connector_transfers(handoff_id) where handoff_id is not null;

insert into private.rate_limit_rules(scope,window_seconds,per_key,per_ip) values
 ('handoff_create',3600,200,400),('handoff_return',3600,60,120)
 on conflict(scope) do nothing;

-- Signed-in editor creates a hand-off; the server function passes only the token hash.
create function public.handoff_create(p_id uuid,p_project uuid,p_target_kind text,p_target_id uuid,p_asset uuid,p_variant uuid,p_scene uuid,
 p_base_version uuid,p_base_revision integer,p_adapter text,p_format text,p_file_name text,p_token_hash text,p_expires timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.member_role_rank(p_project,auth.uid()) < private.role_rank('editor') then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_expires<=now() or p_expires>now()+interval '7 days' then raise exception 'handoff expiry' using errcode='22023'; end if;
 perform private.rate_limit_hit('handoff_create',array['u:'||auth.uid()::text]);
 insert into public.connector_handoffs(id,project_id,created_by,target_kind,target_id,asset_id,variant_id,scene_id,base_version_id,base_revision,adapter,format,file_name,return_token_hash,expires_at)
 values(p_id,p_project,auth.uid(),p_target_kind,p_target_id,p_asset,p_variant,p_scene,p_base_version,p_base_revision,p_adapter,p_format,p_file_name,p_token_hash,p_expires);
end $$;
revoke all on function public.handoff_create(uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,timestamptz) from public,anon;
grant execute on function public.handoff_create(uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,timestamptz) to authenticated;

-- Editor may close or revoke their project's hand-offs (the token stops working at once).
create function public.handoff_set_status(p_id uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare v_project uuid;
begin
 select project_id into v_project from public.connector_handoffs where id=p_id;
 if v_project is null or auth.uid() is null or private.member_role_rank(v_project,auth.uid()) < private.role_rank('editor') then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_status not in('closed','revoked') then raise exception 'handoff status' using errcode='22023'; end if;
 update public.connector_handoffs set status=p_status,updated_at=now(),revision=revision+1 where id=p_id;
end $$;
revoke all on function public.handoff_set_status(uuid,text) from public,anon;
grant execute on function public.handoff_set_status(uuid,text) to authenticated;

-- Service: resolve a return token. Null when unknown, expired, revoked/closed or the creator lost editor rights.
create function public.handoff_by_token(p_hash text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare h public.connector_handoffs;
begin
 select x.* into h from public.connector_handoffs x join public.projects p on p.id=x.project_id
  where x.return_token_hash=p_hash and x.expires_at>now() and x.status in('out','returned','conflict') and p.deleted_at is null
    and private.member_role_rank(x.project_id,x.created_by)>=private.role_rank('editor');
 if not found then return null; end if;
 return to_jsonb(h)-'return_token_hash';
end $$;
revoke all on function public.handoff_by_token(text) from public,anon,authenticated;
grant execute on function public.handoff_by_token(text) to service_role;

insert into public.schema_version(version,description)values(110,'C-1 universal file route');
