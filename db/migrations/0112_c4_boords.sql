-- =====================================================================================
-- From Pen to Glass – migrasjon 0112: C-4 Boords-kobling (API).
-- 1. boords_connections: Boords-API-nøkkel per bruker eller arbeidsgruppe, bare kryptert (AES-256-GCM i
--    serveren, samme mønster og nøkkelversjon som ai_provider_keys). Chiffer/IV kan aldri leses fra
--    nettleseren (kolonnetilgang). Valgfri webhook-hemmelighet, også kryptert. Bare serveren skriver.
-- 2. boords_project_links: hvilket Boords-storyboard et prosjekt er sendt til (vår manifest-ID).
--    Frame ↔ panel ligger i connector_links (client_id 'boords', entity 'panel').
-- 3. boords_frame_state: hasher av feltene på begge sider ved forrige synk (revisjonsgrunnlag; Boords har
--    ikke dokumentert ETag/If-Match).
-- 4. boords_candidates: innkommende endringer. Tas aldri i bruk automatisk; valgene fra C-0.
-- 5. boords_comments: kommentarer begge veier, valgfritt koblet til SB-10 storyboard_feedback.
-- 6. boords_webhook_events: hendelses-ID-er for idempotens (dubletter avvises).
-- Ingen begin/commit. Kjøres ÉN gang i Lovable Cloud etter 0111.
-- =====================================================================================

create table public.boords_connections (
 id uuid primary key,
 owner_kind text not null check(owner_kind in('user','workspace')),
 user_id uuid not null,
 workspace_id uuid references public.workspaces(id) on delete cascade,
 label text not null default '' check(length(label)<=80),
 ciphertext text not null check(length(ciphertext) between 16 and 4000),
 iv text not null check(length(iv) between 8 and 64),
 key_version smallint not null default 1 check(key_version between 1 and 100),
 key_hint text not null check(length(key_hint)<=16),
 webhook_ciphertext text check(webhook_ciphertext is null or length(webhook_ciphertext) between 16 and 4000),
 webhook_iv text check(webhook_iv is null or length(webhook_iv) between 8 and 64),
 webhook_key_version smallint check(webhook_key_version is null or webhook_key_version between 1 and 100),
 status text not null default 'untested' check(status in('untested','ok','failed')),
 status_message text check(status_message is null or length(status_message)<=400),
 last_sync_at timestamptz,
 sync_cursor timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((owner_kind='user' and workspace_id is null) or(owner_kind='workspace' and workspace_id is not null)),
 check((webhook_ciphertext is null)=(webhook_iv is null))
);
create unique index boords_connections_one_user on public.boords_connections(user_id) where owner_kind='user';
create unique index boords_connections_one_workspace on public.boords_connections(workspace_id) where owner_kind='workspace';
revoke all on public.boords_connections from public,anon,authenticated;
grant select(id,owner_kind,user_id,workspace_id,label,key_hint,status,status_message,last_sync_at,created_at,updated_at) on public.boords_connections to authenticated;
grant all on public.boords_connections to service_role;
alter table public.boords_connections enable row level security;
create policy c4_connections_read on public.boords_connections for select to authenticated using(
 (owner_kind='user' and user_id=(select auth.uid())) or(owner_kind='workspace' and private.is_workspace_member(workspace_id)));

create table public.boords_project_links (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 connection_id uuid not null references public.boords_connections(id) on delete cascade,
 storyboard_id text not null check(storyboard_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 manifest_id uuid not null,
 production_id uuid,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 revision integer not null default 1,
 unique(project_id,connection_id)
);
revoke all on public.boords_project_links from public,anon,authenticated;
grant select on public.boords_project_links to authenticated;
grant all on public.boords_project_links to service_role;
alter table public.boords_project_links enable row level security;
create policy c4_project_links_read on public.boords_project_links for select to authenticated using(project_id in(select private.my_project_ids()));

create table public.boords_frame_state (
 link_id uuid primary key references public.connector_links(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 our_hash text check(our_hash is null or our_hash ~ '^[0-9a-f]{64}$'),
 their_hash text check(their_hash is null or their_hash ~ '^[0-9a-f]{64}$'),
 their_image text check(their_image is null or length(their_image)<=2000),
 updated_at timestamptz not null default now()
);
revoke all on public.boords_frame_state from public,anon,authenticated;
grant select on public.boords_frame_state to authenticated;
grant all on public.boords_frame_state to service_role;
alter table public.boords_frame_state enable row level security;
create policy c4_frame_state_read on public.boords_frame_state for select to authenticated using(project_id in(select private.my_project_ids()));

create table public.boords_candidates (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 link_id uuid not null references public.connector_links(id) on delete cascade,
 panel_id uuid not null,
 frame_id text not null check(length(frame_id) between 1 and 128),
 kind text not null check(kind in('text','image')),
 incoming jsonb not null default '{}' check(jsonb_typeof(incoming)='object' and pg_column_size(incoming)<=32000),
 incoming_hash text not null check(incoming_hash ~ '^[0-9a-f]{64}$'),
 media_path text check(media_path is null or length(media_path)<=500),
 media_sha256 text check(media_sha256 is null or media_sha256 ~ '^[0-9a-f]{64}$'),
 conflict boolean not null default false,
 status text not null default 'open' check(status in('open','resolved','rejected')),
 choice text check(choice is null or choice in('keep_both','choose_current','choose_incoming','reject')),
 revision integer not null default 1,
 resolved_by uuid,
 resolved_at timestamptz,
 created_at timestamptz not null default now(),
 unique(link_id,kind,incoming_hash)
);
revoke all on public.boords_candidates from public,anon,authenticated;
grant select on public.boords_candidates to authenticated;
grant all on public.boords_candidates to service_role;
alter table public.boords_candidates enable row level security;
create policy c4_candidates_read on public.boords_candidates for select to authenticated using(project_id in(select private.my_project_ids()));
create index c4_candidates_open on public.boords_candidates(project_id,created_at) where status='open';

create table public.boords_comments (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 panel_id uuid,
 boords_comment_id text not null check(boords_comment_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 direction text not null check(direction in('in','out')),
 feedback_id uuid references public.storyboard_feedback(id) on delete set null,
 author text not null default '' check(length(author)<=200),
 text text not null check(length(text)<=4000 and text !~ '<[^>]*>'),
 created_at timestamptz not null default now(),
 unique(project_id,boords_comment_id)
);
create unique index c4_comments_feedback_once on public.boords_comments(feedback_id) where feedback_id is not null;
revoke all on public.boords_comments from public,anon,authenticated;
grant select on public.boords_comments to authenticated;
grant all on public.boords_comments to service_role;
alter table public.boords_comments enable row level security;
create policy c4_comments_read on public.boords_comments for select to authenticated using(project_id in(select private.my_project_ids()));

create table public.boords_webhook_events (
 connection_id uuid not null references public.boords_connections(id) on delete cascade,
 event_id text not null check(event_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
 received_at timestamptz not null default now(),
 primary key(connection_id,event_id)
);
revoke all on public.boords_webhook_events from public,anon,authenticated;
grant all on public.boords_webhook_events to service_role;
alter table public.boords_webhook_events enable row level security;

insert into private.rate_limit_rules(scope,window_seconds,per_key,per_ip) values('boords_key',3600,30,60),('boords_webhook',60,600,600),('boords_sync',3600,60,120) on conflict(scope) do nothing;

-- Registrerer en webhook-hendelse én gang. false = duplikat (allerede mottatt).
create function public.boords_webhook_once(p_connection uuid,p_event text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 insert into public.boords_webhook_events(connection_id,event_id) values(p_connection,p_event) on conflict do nothing;
 return found;
end $$;
revoke all on function public.boords_webhook_once(uuid,text) from public,anon,authenticated;
grant execute on function public.boords_webhook_once(uuid,text) to service_role;

-- Brukerens valg for en kandidat. «Bruk innkommende» krever at appen allerede har kjørt den angrebare
-- kommandoen (runCommand); funksjonen endrer bare kandidatens status. Ingenting slettes.
create function public.boords_resolve_candidate(p_id uuid,p_choice text,p_revision integer) returns text language plpgsql security definer set search_path='' as $$
declare c public.boords_candidates;
begin
 if p_choice not in('keep_both','choose_current','choose_incoming','reject') then return 'choice'; end if;
 select * into c from public.boords_candidates where id=p_id for update;
 if not found then return 'not_found'; end if;
 if private.member_role_rank(c.project_id,(select auth.uid())) < private.role_rank('editor') then return 'forbidden'; end if;
 if c.revision<>p_revision or c.status<>'open' then return 'stale'; end if;
 update public.boords_candidates set status=case when p_choice='reject' then 'rejected' else 'resolved' end,choice=p_choice,
  resolved_by=(select auth.uid()),resolved_at=now(),revision=revision+1 where id=p_id;
 return 'ok';
end $$;
revoke all on function public.boords_resolve_candidate(uuid,text,integer) from public,anon;
grant execute on function public.boords_resolve_candidate(uuid,text,integer) to authenticated,service_role;

-- Rydding: webhook-ID-er eldre enn 7 dager (tidsvinduet er 5 minutter, så de trengs ikke lenger).
create function public.boords_cleanup() returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 delete from public.boords_webhook_events where received_at < now()-interval '7 days';
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function public.boords_cleanup() from public,anon,authenticated;
grant execute on function public.boords_cleanup() to service_role;

insert into public.schema_version(version,description) values(112,'C-4 Boords connector');
