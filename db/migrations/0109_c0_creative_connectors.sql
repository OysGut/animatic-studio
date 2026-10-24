-- C-0: Creative Connectors core. Written only; Claude runs DB tests and Cloud.
-- Sessions/codes store only SHA-256 token hashes. Integration rows are written by service-role server code
-- and security-definer RPCs (like generation_jobs), never by the browser; project content (candidate
-- versions, approval) still goes through apply_changes.
begin;

create table public.connector_sessions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null,
 client_id text not null check(client_id ~ '^[a-z0-9][a-z0-9.-]{2,63}$'),
 scopes text[] not null check(cardinality(scopes) between 1 and 7 and scopes <@ array['project:read','manifest:read','assets:read','panels:read','transfers:write','conflicts:read','notes:write']::text[]),
 access_hash text not null unique check(access_hash ~ '^[0-9a-f]{64}$'),
 refresh_hash text not null unique check(refresh_hash ~ '^[0-9a-f]{64}$'),
 access_expires_at timestamptz not null,
 refresh_expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 last_used_at timestamptz,
 revoked_at timestamptz
);
grant select on public.connector_sessions to authenticated;
grant all on public.connector_sessions to service_role;
alter table public.connector_sessions enable row level security;
create policy c0_sessions_own_read on public.connector_sessions for select to authenticated using(user_id = (select auth.uid()));
-- Hashes are never readable by the browser.
revoke select on public.connector_sessions from authenticated;
grant select(id,project_id,user_id,client_id,scopes,access_expires_at,refresh_expires_at,created_at,last_used_at,revoked_at) on public.connector_sessions to authenticated;
create index c0_sessions_user on public.connector_sessions(user_id,created_at desc);
create index c0_sessions_project on public.connector_sessions(project_id);

create table private.connector_pending (
 hash text primary key check(hash ~ '^[0-9a-f]{64}$'),
 kind text not null check(kind in('code','device')),
 user_code text unique check(user_code ~ '^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$'),
 client_id text not null check(client_id ~ '^[a-z0-9][a-z0-9.-]{2,63}$'),
 redirect_uri text check(length(redirect_uri)<=500),
 challenge text check(challenge ~ '^[A-Za-z0-9_-]{43}$'),
 project_id uuid references public.projects(id) on delete cascade,
 user_id uuid,
 scopes text[] not null,
 status text not null default 'pending' check(status in('pending','approved','denied','used')),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 check(kind='device' or (redirect_uri is not null and challenge is not null and project_id is not null and user_id is not null))
);
create index c0_pending_expiry on private.connector_pending(expires_at);
create table private.connector_used_refresh (hash text primary key, session_id uuid not null references public.connector_sessions(id) on delete cascade, used_at timestamptz not null default now());

create table public.connector_links (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 client_id text not null check(length(client_id)<=64),
 external_id text not null check(length(external_id) between 1 and 500),
 entity text not null check(entity in('asset','panel','clip')),
 entity_id uuid not null,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 revision integer not null default 1,
 removed boolean not null default false,
 unique(project_id,client_id,external_id,entity)
);
grant select on public.connector_links to authenticated;
grant all on public.connector_links to service_role;
alter table public.connector_links enable row level security;
create policy c0_links_member_read on public.connector_links for select to authenticated using(project_id in(select private.my_project_ids()));
create index c0_links_entity on public.connector_links(project_id,entity,entity_id);

create table public.connector_transfers (
 id uuid primary key,
 project_id uuid not null references public.projects(id) on delete cascade,
 session_id uuid references public.connector_sessions(id) on delete set null,
 sender uuid not null,
 direction text not null default 'in' check(direction in('in','out')),
 idempotency_key text not null check(idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
 fingerprint text not null check(length(fingerprint)<=1000),
 file_name text not null check(length(file_name) between 1 and 255),
 byte_size bigint not null check(byte_size between 1 and 67108864),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 asset_id uuid not null,
 variant_id uuid not null,
 base_version_id uuid,
 status text not null default 'reserved' check(status in('reserved','uploading','received','candidate','rejected','failed')),
 candidate_version_id uuid,
 conflict_id uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(project_id,idempotency_key)
);
grant select on public.connector_transfers to authenticated;
grant all on public.connector_transfers to service_role;
alter table public.connector_transfers enable row level security;
create policy c0_transfers_member_read on public.connector_transfers for select to authenticated using(project_id in(select private.my_project_ids()));
create index c0_transfers_project on public.connector_transfers(project_id,created_at desc);
-- Upload chunks live in storage under <project>/connectors/<transfer>/part-N (outside the AI orphan scan) and are removed after intake.

create table public.connector_conflicts (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 transfer_id uuid not null references public.connector_transfers(id) on delete cascade,
 variant_id uuid not null,
 base_version_id uuid,
 current_version_id uuid,
 incoming_version_id uuid not null,
 status text not null default 'open' check(status in('open','resolved','rejected')),
 choice text check(choice in('keep_both','choose_current','choose_incoming','reject')),
 resolved_by uuid,
 resolved_at timestamptz,
 created_at timestamptz not null default now(),
 revision integer not null default 1
);
grant select on public.connector_conflicts to authenticated;
grant all on public.connector_conflicts to service_role;
alter table public.connector_conflicts enable row level security;
create policy c0_conflicts_member_read on public.connector_conflicts for select to authenticated using(project_id in(select private.my_project_ids()));
create index c0_conflicts_project on public.connector_conflicts(project_id,status,created_at desc);

insert into private.rate_limit_rules(scope,window_seconds,per_key,per_ip) values
 ('connector_token',60,30,60),('connector_device',600,20,40),('connector_api',60,600,1200),('connector_approve',3600,60,120)
 on conflict(scope) do nothing;

-- Browser consent (Authorization Code + PKCE): signed-in member creates a single-use code.
create function public.connector_approve_code(p_project uuid,p_client text,p_redirect text,p_challenge text,p_scopes text[],p_code_hash text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.member_role_rank(p_project,auth.uid()) < private.role_rank(case when 'transfers:write'=any(p_scopes) or 'notes:write'=any(p_scopes) then 'editor' else 'viewer' end) then raise exception 'Forbidden' using errcode='42501'; end if;
 perform private.rate_limit_hit('connector_approve',array['u:'||auth.uid()::text]);
 insert into private.connector_pending(hash,kind,client_id,redirect_uri,challenge,project_id,user_id,scopes,status,expires_at)
  values(p_code_hash,'code',p_client,p_redirect,p_challenge,p_project,auth.uid(),p_scopes,'approved',now()+interval '120 seconds');
end $$;
revoke all on function public.connector_approve_code(uuid,text,text,text,text[],text) from public,anon;
grant execute on function public.connector_approve_code(uuid,text,text,text,text[],text) to authenticated;

-- Device flow: user enters the code shown by the program and picks one project.
create function public.connector_device_lookup(p_user_code text) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when auth.uid() is null then null else (select jsonb_build_object('client_id',client_id,'scopes',scopes) from private.connector_pending where kind='device' and user_code=p_user_code and status='pending' and expires_at>now()) end;
$$;
revoke all on function public.connector_device_lookup(text) from public,anon;
grant execute on function public.connector_device_lookup(text) to authenticated;
create function public.connector_approve_device(p_user_code text,p_project uuid,p_approve boolean) returns void
language plpgsql security definer set search_path='' as $$
declare r private.connector_pending;
begin
 if auth.uid() is null then raise exception 'Forbidden' using errcode='42501'; end if;
 perform private.rate_limit_hit('connector_approve',array['u:'||auth.uid()::text]);
 select * into r from private.connector_pending where kind='device' and user_code=p_user_code and status='pending' and expires_at>now() for update;
 if not found then raise exception 'connector code' using errcode='P0001'; end if;
 if p_approve and private.member_role_rank(p_project,auth.uid()) < private.role_rank(case when 'transfers:write'=any(r.scopes) or 'notes:write'=any(r.scopes) then 'editor' else 'viewer' end) then raise exception 'Forbidden' using errcode='42501'; end if;
 update private.connector_pending set status=case when p_approve then 'approved' else 'denied' end,project_id=case when p_approve then p_project end,user_id=auth.uid() where hash=r.hash;
end $$;
revoke all on function public.connector_approve_device(text,uuid,boolean) from public,anon;
grant execute on function public.connector_approve_device(text,uuid,boolean) to authenticated;

-- Server side (service_role only).
create function public.connector_consume_code(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.connector_pending;
begin
 update private.connector_pending set status='used' where hash=p_hash and kind='code' and status='approved' returning * into r;
 if not found then return null; end if;
 if r.expires_at<=now() or private.member_role_rank(r.project_id,r.user_id) < private.role_rank('viewer') then return null; end if;
 return jsonb_build_object('clientId',r.client_id,'redirectUri',r.redirect_uri,'challenge',r.challenge,'projectId',r.project_id,'userId',r.user_id,'scopes',to_jsonb(r.scopes),'expiresAt',r.expires_at);
end $$;
create function public.connector_create_device(p_hash text,p_user_code text,p_client text,p_scopes text[],p_expires timestamptz) returns void
language sql security definer set search_path='' as $$
 insert into private.connector_pending(hash,kind,user_code,client_id,scopes,expires_at) values(p_hash,'device',p_user_code,p_client,p_scopes,p_expires);
$$;
create function public.connector_poll_device(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.connector_pending;
begin
 select * into r from private.connector_pending where hash=p_hash and kind='device' for update;
 if not found then return null; end if;
 if r.status='used' then return null; end if;
 if r.expires_at<=now() then return jsonb_build_object('status','expired'); end if;
 if r.status<>'approved' then return jsonb_build_object('status',r.status); end if;
 update private.connector_pending set status='used' where hash=p_hash;
 return jsonb_build_object('status','approved','projectId',r.project_id,'userId',r.user_id,'clientId',r.client_id,'scopes',to_jsonb(r.scopes));
end $$;
create function public.connector_session_by_access(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.connector_sessions;
begin
 update public.connector_sessions set last_used_at=now() where access_hash=p_hash returning * into s;
 if not found then return null; end if;
 -- Membership is rechecked on every call: a removed member's sessions stop working at once.
 if private.member_role_rank(s.project_id,s.user_id) < private.role_rank('viewer') then return null; end if;
 return jsonb_build_object('id',s.id,'projectId',s.project_id,'userId',s.user_id,'scopes',to_jsonb(s.scopes),'expiresAt',s.access_expires_at,'revokedAt',s.revoked_at);
end $$;
create function public.connector_rotate_refresh(p_old text,p_access text,p_refresh text,p_access_exp timestamptz,p_refresh_exp timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.connector_sessions; v_used uuid;
begin
 select session_id into v_used from private.connector_used_refresh where hash=p_old;
 if found then update public.connector_sessions set revoked_at=coalesce(revoked_at,now()) where id=v_used; return null; end if;
 select * into s from public.connector_sessions where refresh_hash=p_old for update;
 if not found or s.revoked_at is not null or s.refresh_expires_at<=now() then return null; end if;
 insert into private.connector_used_refresh(hash,session_id) values(p_old,s.id);
 update public.connector_sessions set access_hash=p_access,refresh_hash=p_refresh,access_expires_at=p_access_exp,refresh_expires_at=least(p_refresh_exp,s.created_at+interval '90 days') where id=s.id returning * into s;
 return jsonb_build_object('id',s.id,'projectId',s.project_id,'userId',s.user_id,'scopes',to_jsonb(s.scopes),'expiresAt',s.access_expires_at,'revokedAt',s.revoked_at);
end $$;
create function public.connector_revoke_token(p_hash text) returns void
language sql security definer set search_path='' as $$
 update public.connector_sessions set revoked_at=coalesce(revoked_at,now()) where access_hash=p_hash or refresh_hash=p_hash;
$$;
create function public.connector_check_quota(p_project uuid,p_bytes bigint) returns boolean
language plpgsql security definer set search_path='' as $$
begin perform private.check_quota_upload(p_project,p_bytes); return true; exception when others then return false; end $$;
do $$ declare f text; begin
 foreach f in array array['connector_consume_code(text)','connector_create_device(text,text,text,text[],timestamptz)','connector_poll_device(text)','connector_session_by_access(text)','connector_rotate_refresh(text,text,text,timestamptz,timestamptz)','connector_revoke_token(text)','connector_check_quota(uuid,bigint)'] loop
  execute format('revoke all on function public.%s from public,anon,authenticated',f);
  execute format('grant execute on function public.%s to service_role',f);
 end loop; end $$;

-- Account page: own sessions and revocation.
create function public.connector_revoke_session(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.connector_sessions set revoked_at=coalesce(revoked_at,now()) where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
end $$;
revoke all on function public.connector_revoke_session(uuid) from public,anon;
grant execute on function public.connector_revoke_session(uuid) to authenticated;

-- Conflict decision. Nothing is deleted; choose_incoming is applied first by the user's own
-- ApproveAssetVersion command (apply_changes), so this function only records the decision.
create function public.connector_resolve_conflict(p_id uuid,p_choice text,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare c public.connector_conflicts; v_approved uuid;
begin
 select * into c from public.connector_conflicts where id=p_id for update;
 if not found or private.member_role_rank(c.project_id,auth.uid()) < private.role_rank('editor') then raise exception 'Forbidden' using errcode='42501'; end if;
 if c.revision<>p_revision or c.status<>'open' then raise exception 'stale' using errcode='40001'; end if;
 if p_choice not in('keep_both','choose_current','choose_incoming','reject') then raise exception 'choice' using errcode='22023'; end if;
 select approved_version_id into v_approved from public.asset_variants where id=c.variant_id;
 if p_choice='choose_incoming' and v_approved is distinct from c.incoming_version_id then raise exception 'approve first' using errcode='P0001'; end if;
 update public.connector_conflicts set status=case when p_choice='reject' then 'rejected' else 'resolved' end,choice=p_choice,resolved_by=auth.uid(),resolved_at=now(),revision=revision+1 where id=p_id;
 if p_choice='reject' then update public.connector_transfers set status='rejected',updated_at=now() where id=c.transfer_id; end if;
end $$;
revoke all on function public.connector_resolve_conflict(uuid,text,integer) from public,anon;
grant execute on function public.connector_resolve_conflict(uuid,text,integer) to authenticated;

-- Browsers only read; all writes go through service-role code and security-definer RPCs.
revoke insert,update,delete,truncate,references,trigger on public.connector_sessions,public.connector_links,public.connector_transfers,public.connector_conflicts from authenticated;
revoke all on public.connector_sessions,public.connector_links,public.connector_transfers,public.connector_conflicts from anon;
insert into public.schema_version(version,description) values(109,'C-0 creative connectors core');
commit;
