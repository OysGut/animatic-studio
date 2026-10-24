-- 0111: security fixes for C-0 (0109 is run in Cloud and locked). No begin/commit: the runner wraps each
-- migration in its own transaction. Session lookup refuses revoked/expired sessions in SQL, device-code lookup
-- is rate limited per user, scopes are validated in SQL, clients and redirect URIs come from a registered list,
-- and expired codes / old used refresh hashes are cleaned up by the scheduled job.

create index c0_used_refresh_age on private.connector_used_refresh(used_at);

-- Registered clients (client_id -> allowed redirect patterns). Unknown client IDs are refused. Patterns allow
-- loopback http with a port (RFC 8252: 127.0.0.1 or [::1]) and each program's own scheme (ptg-<name>://).
-- No free https host: an https redirect needs a registered pattern. Mirrored in src/core/connectors/auth.ts.
create table private.connector_clients (
 client_id text primary key check(client_id ~ '^[a-z0-9][a-z0-9.-]{2,63}$'),
 name text not null,
 redirect_patterns text[] not null check(cardinality(redirect_patterns) between 1 and 8)
);
revoke all on private.connector_clients from public,anon,authenticated;

insert into private.rate_limit_rules(scope,window_seconds,per_key,per_ip) values ('connector_device_lookup',600,20,40)
 on conflict(scope) do nothing;

create or replace function public.connector_approve_code(p_project uuid,p_client text,p_redirect text,p_challenge text,p_scopes text[],p_code_hash text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.connector_scopes_ok(p_scopes) then raise exception 'connector scopes' using errcode='22023'; end if;
 if not private.connector_client_known(p_client) then raise exception 'connector client' using errcode='22023'; end if;
 if not private.connector_redirect_ok(p_client,p_redirect) then raise exception 'connector redirect' using errcode='22023'; end if;
 if auth.uid() is null or private.member_role_rank(p_project,auth.uid()) < private.role_rank(case when 'transfers:write'=any(p_scopes) or 'notes:write'=any(p_scopes) then 'editor' else 'viewer' end) then raise exception 'Forbidden' using errcode='42501'; end if;
 perform private.rate_limit_hit('connector_approve',array['u:'||auth.uid()::text]);
 insert into private.connector_pending(hash,kind,client_id,redirect_uri,challenge,project_id,user_id,scopes,status,expires_at)
  values(p_code_hash,'code',p_client,p_redirect,p_challenge,p_project,auth.uid(),p_scopes,'approved',now()+interval '120 seconds');
end $$;

-- Rate limited per user (own scope) so signed-in users cannot try out user codes.
create or replace function public.connector_device_lookup(p_user_code text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null then return null; end if;
 perform private.rate_limit_hit('connector_device_lookup',array['u:'||auth.uid()::text]);
 return (select jsonb_build_object('client_id',client_id,'scopes',scopes) from private.connector_pending where kind='device' and user_code=p_user_code and status='pending' and expires_at>now());
end $$;

create or replace function public.connector_create_device(p_hash text,p_user_code text,p_client text,p_scopes text[],p_expires timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.connector_scopes_ok(p_scopes) then raise exception 'connector scopes' using errcode='22023'; end if;
 if not private.connector_client_known(p_client) then raise exception 'connector client' using errcode='22023'; end if;
 insert into private.connector_pending(hash,kind,user_code,client_id,scopes,expires_at) values(p_hash,'device',p_user_code,p_client,p_scopes,p_expires);
end $$;

create or replace function public.connector_session_by_access(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.connector_sessions;
begin
 -- Revoked or expired sessions return null here, not only in server code; last_used_at moves only for valid ones.
 select * into s from public.connector_sessions where access_hash=p_hash and revoked_at is null and access_expires_at>now();
 if not found then return null; end if;
 -- Membership is rechecked on every call: a removed member's sessions stop working at once.
 if private.member_role_rank(s.project_id,s.user_id) < private.role_rank('viewer') then return null; end if;
 update public.connector_sessions set last_used_at=now() where id=s.id returning * into s;
 return jsonb_build_object('id',s.id,'projectId',s.project_id,'userId',s.user_id,'scopes',to_jsonb(s.scopes),'expiresAt',s.access_expires_at,'revokedAt',s.revoked_at);
end $$;

-- Cleanup (called by the scheduled server job): expired pending codes and used refresh hashes older than 90 days.
create function public.connector_cleanup() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_pending integer; v_refresh integer;
begin
 delete from private.connector_pending where expires_at<now();
 get diagnostics v_pending = row_count;
 delete from private.connector_used_refresh where used_at<now()-interval '90 days';
 get diagnostics v_refresh = row_count;
 return jsonb_build_object('pending',v_pending,'usedRefresh',v_refresh);
end $$;
revoke all on function public.connector_cleanup() from public,anon,authenticated;
grant execute on function public.connector_cleanup() to service_role;

insert into public.schema_version(version,description) values(111,'C-0 security fixes');
