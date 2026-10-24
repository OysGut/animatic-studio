-- SB-10: immutable storyboard review capabilities. Written only; Claude runs tests and Cloud.
begin;
create table public.storyboard_shares (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 created_by uuid not null,created_at timestamptz not null default now(),token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 password_hash text,expires_at timestamptz not null,revoked boolean not null default false,ready boolean not null default false,
 title text not null check(length(title)<=500),allow_comments boolean not null default true,allow_approval boolean not null default false,
 manifest jsonb not null check(jsonb_typeof(manifest)='array' and jsonb_array_length(manifest) between 1 and 500 and octet_length(manifest::text)<=150000000),
 video_key text not null,video_bytes bigint, fps double precision not null check(fps>0 and fps<=240)
);
grant select on public.storyboard_shares to authenticated;
grant all on public.storyboard_shares to service_role;
alter table public.storyboard_shares enable row level security;
create policy sb10_member_read on public.storyboard_shares for select to authenticated using(project_id in(select private.my_project_ids()));
-- No token/password hash is readable by the browser; only narrow metadata columns.
revoke select on public.storyboard_shares from authenticated;
grant select(id,project_id,created_by,created_at,expires_at,revoked,ready,title,allow_comments,allow_approval) on public.storyboard_shares to authenticated;
create table public.storyboard_feedback (
 id uuid primary key default gen_random_uuid(),share_id uuid not null references public.storyboard_shares(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,panel_key text not null check(length(panel_key)<=16),
 guest_name text not null check(length(guest_name) between 1 and 100),guest_email text check(length(guest_email)<=254),
 text text not null default '' check(length(text)<=4000 and text !~ '<[^>]*>'),decision text not null default 'none' check(decision in('none','approved','changes')),
 pin_x double precision,pin_y double precision,created_at timestamptz not null default now(),revision integer not null default 1,
 resolved boolean not null default false,replies jsonb not null default '[]' check(jsonb_typeof(replies)='array' and octet_length(replies::text)<=64000),task_id uuid,
 check((pin_x is null and pin_y is null) or(pin_x between 0 and 1 and pin_y between 0 and 1))
);
grant select on public.storyboard_feedback to authenticated;
grant all on public.storyboard_feedback to service_role;
alter table public.storyboard_feedback enable row level security;
create policy sb10_feedback_member_read on public.storyboard_feedback for select to authenticated using(project_id in(select private.my_project_ids()));
create index sb10_feedback_project on public.storyboard_feedback(project_id,created_at);
create index sb10_share_project on public.storyboard_shares(project_id,created_at);
insert into private.rate_limit_rules(scope,window_seconds,per_key,per_ip) values('storyboard_review',3600,120,240),('storyboard_review_read',60,120,240) on conflict(scope) do nothing;
create function public.storyboard_review_lookup(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.storyboard_shares;begin
 select sh.* into s from public.storyboard_shares sh join public.projects p on p.id=sh.project_id where sh.token_hash=p_hash and sh.ready and not sh.revoked and sh.expires_at>now() and p.deleted_at is null and private.member_role_rank(sh.project_id,sh.created_by)>=private.role_rank('editor');
 if not found then return null;end if;return to_jsonb(s);end $$;
revoke all on function public.storyboard_review_lookup(text) from public,anon,authenticated;
grant execute on function public.storyboard_review_lookup(text) to service_role;
create function public.storyboard_review_comment(p_hash text,p_key text,p_name text,p_email text,p_text text,p_decision text,p_x double precision,p_y double precision) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.storyboard_shares;v_id uuid;begin
 select * into s from public.storyboard_shares where token_hash=p_hash for update;
 if not found or public.storyboard_review_lookup(p_hash) is null then raise exception 'review unavailable';end if;
 perform private.rate_limit_hit('storyboard_review',array['s:'||s.id::text]);
 if not exists(select 1 from jsonb_array_elements(s.manifest) m where m->>'key'=p_key) then raise exception 'review selection';end if;
 if(p_text<>'' and not s.allow_comments) or(p_decision<>'none' and not s.allow_approval) or(p_text='' and p_decision='none')then raise exception 'review permission';end if;
 if p_name~'<[^>]*>' or coalesce(p_email,'')~'<[^>]*>' then raise exception 'review text';end if;
 insert into public.storyboard_feedback(share_id,project_id,panel_key,guest_name,guest_email,text,decision,pin_x,pin_y)values(s.id,s.project_id,p_key,p_name,nullif(p_email,''),p_text,p_decision,p_x,p_y) returning id into v_id;return v_id;end $$;
revoke all on function public.storyboard_review_comment(text,text,text,text,text,text,double precision,double precision) from public,anon,authenticated;
grant execute on function public.storyboard_review_comment(text,text,text,text,text,text,double precision,double precision) to service_role;
insert into public.schema_version(version,description)values(108,'SB-10 storyboard guest review');
commit;
